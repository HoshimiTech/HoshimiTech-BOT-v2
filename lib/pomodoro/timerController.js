const pomodoroUtils = require('./utils.js');

// BOT全体でのポモドーロタイマーの自動更新のレートを監視するための変数
let totalAutoUpdateCount = 0;
const interval = 1000; // 1秒ごとにチェック
let disconnectedElapsed = 0;
const disconnectedLimit = 60 * 60 * 1000; // 1時間
let guildCount = 1;
let guildCountCheckInterval = 300; // 5分ごとにサーバー数をチェック

function clearTimerHandle(pomodoroState) {
	if (pomodoroState.timer) {
		clearInterval(pomodoroState.timer);
		pomodoroState.timer = null;
	}
}

function resolveTimerPromise(pomodoroState, result) {
	if (pomodoroState.timerResolve) {
		const resolve = pomodoroState.timerResolve;
		pomodoroState.timerResolve = null;
		resolve(result);
	}
}

function startInterval(client, interaction, pomodoroState) {
	clearTimerHandle(pomodoroState);
	pomodoroState.timer = setInterval(async () => {
		if (pomodoroState.paused) {
			return;
		}

		// 時間が終了したかチェック
		const remainingSeconds =
			pomodoroUtils.calculateRemainingSeconds(pomodoroState);
		if (remainingSeconds <= 0) {
			// パートの時間が終了した場合はタイマーをクリアしてresolve
			stop(pomodoroState, 'completed');
			return;
		}

		// VC監視
		if (pomodoroState.config.vcId) {
			try {
				const channel = await client.channels.fetch(pomodoroState.config.vcId);
				if (channel && channel.members) {
					// BOT以外が居るか
					const nonBotMembers = channel.members.filter((m) => !m.user.bot);
					if (nonBotMembers.size === 0) {
						disconnectedElapsed += interval;
						if (disconnectedElapsed >= disconnectedLimit) {
							pomodoroState.part.type = 'cancelled';
							stop(pomodoroState, 'cancelled');
							return;
						}
						// 1時間未満なら一度だけ通知
						if (disconnectedElapsed === interval) {
							await interaction.channel.send(
								'VCに誰もいなくなりました。1時間以内に誰かが戻らない場合、タイマーは自動で中止されます。',
							);
						}
					} else {
						// 誰か戻ってきたらリセット
						disconnectedElapsed = 0;
					}
				}
			} catch (err) {
				// チャンネル取得失敗は無視
				void err;
			}
		}

		if (pomodoroState.paused) {
			return;
		}

		// メッセージの自動更新
		// 5分ごとに所属サーバー数を取得
		guildCountCheckInterval--;
		if (guildCountCheckInterval <= 0) {
			guildCount = client.guilds.cache.size;
			guildCountCheckInterval = 300;
		}
		// 現在のパートの割合を計算
		const statusPercentage =
			pomodoroUtils.calculateStatusPercentage(pomodoroState);
		// サーバーへの導入数次第で、絵文字の割合を計算
		const statusEmojis =
			pomodoroUtils.generatePomodoroStatusEmojis(statusPercentage);
		let shouldUpdate = false;
		const doneCountDiff = Math.abs(
			statusEmojis.doneCount - pomodoroState.message.lastProgress,
		);
		const yetCountDiff = Math.abs(
			statusEmojis.yetCount -
				(statusEmojis.totalBlocks - pomodoroState.message.lastProgress),
		);
		if (guildCount < 500) {
			// 500未満の場合は、進捗状況の絵文字が変化した場合は常に更新
			if (
				statusEmojis.doneCount !== pomodoroState.message.lastProgress ||
				statusEmojis.yetCount !==
					statusEmojis.totalBlocks - pomodoroState.message.lastProgress
			) {
				shouldUpdate = true;
			}
		} else if (500 <= guildCount && guildCount < 2000) {
			// 500以上2000未満の場合は、進捗状況の絵文字が2つ以上変化した場合に更新
			if (doneCountDiff >= 2 || yetCountDiff >= 2) {
				shouldUpdate = true;
			}
		} else if (2000 <= guildCount && guildCount < 5000) {
			// 2000以上5000未満の場合は、進捗状況の絵文字が3つ以上変化した場合に更新
			if (doneCountDiff >= 3 || yetCountDiff >= 3) {
				shouldUpdate = true;
			}
		} else if (5000 <= guildCount) {
			// 5000以上の場合は、進捗状況の絵文字が5つ以上変化した場合に更新
			if (doneCountDiff >= 5 || yetCountDiff >= 5) {
				shouldUpdate = true;
			}
		}
		// 更新が必要な場合はステータスメッセージを更新
		if (pomodoroState.running && shouldUpdate && totalAutoUpdateCount < 10) {
			// ステータスを更新する
			try {
				await pomodoroUtils.sendPomodoroStatus(interaction, pomodoroState);
			} catch (err) {
				// 送信失敗は無視
				void err;
			}
			// BOT全体での自動更新回数をカウント
			totalAutoUpdateCount++;
		}

		// 強制停止された場合
		if (!pomodoroState.running) {
			resolveTimerPromise(pomodoroState, 'stopped');
			return;
		}
	}, interval);
}

// 1秒ごとにリセット（目標: 10 req/sec）
setInterval(() => {
	totalAutoUpdateCount = 0;
}, 1000);

function start(client, interaction, pomodoroState) {
	if (pomodoroState.timerResolve) {
		return;
	}

	return new Promise((resolve) => {
		pomodoroState.timerResolve = resolve;
		pomodoroState.paused = false;
		startInterval(client, interaction, pomodoroState);
	});
}

function pause(pomodoroState) {
	clearTimerHandle(pomodoroState);
	pomodoroState.paused = true;
}

function resume(client, interaction, pomodoroState) {
	if (
		!pomodoroState.paused ||
		pomodoroState.part.pausedRemainingSeconds === null ||
		pomodoroState.part.pausedRemainingSeconds === undefined
	) {
		return;
	}

	const remainingSeconds = pomodoroState.part.pausedRemainingSeconds;
	pomodoroState.part.pausedRemainingSeconds = null;
	pomodoroState.part.endTimestamp = Date.now() + remainingSeconds * 1000;
	pomodoroState.paused = false;
	startInterval(client, interaction, pomodoroState);
}

function stop(pomodoroState, result = 'stopped') {
	clearTimerHandle(pomodoroState);
	if (result !== 'completed') {
		pomodoroState.running = false;
	}
	pomodoroState.paused = false;
	pomodoroState.part.pausedRemainingSeconds = null;
	resolveTimerPromise(pomodoroState, result);
}

module.exports = {
	start,
	pause,
	resume,
	stop,
};
