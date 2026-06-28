// ポモドーロタイマーの機能
// VCにBOT以外誰も居なくなった場合は中止
// pomodoro.start(), pomodoro.status(), pomodoro.stop() で操作

const {
	joinVoiceChannel,
	createAudioPlayer,
	createAudioResource,
	entersState,
	VoiceConnectionStatus,
} = require('@discordjs/voice');
const voicevoxAudioController = require('./voicevoxAudioController.js');
const profileSchema = require('../../models/profileSchema.js');
const {
	EmbedBuilder,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
} = require('discord.js');
// BOT全体でのポモドーロタイマーの自動更新のレートを監視するための変数
let totalAutoUpdateCount = 0;
// 1分ごとにリセット
setInterval(() => {
	totalAutoUpdateCount = 0;
}, 60 * 1000);

// guildごとにpomodoroStateをMapで管理
function init(client, guildId) {
	if (!client.pomodoroState.has(guildId)) {
		client.pomodoroState.set(guildId, {
			running: false,
			endTimestamp: null,
			remainingSeconds: 0,
			currentCycle: 0,
			timer: null,
			options: null,
			vcId: null,
			currentStatus: null,
			nextStatus: null,
			lastStatusMessageId: null,
			lastDoneCount: 0,
			lastYetCount: 10,
		});
	}
}

function getPomodoroState(client, guildId) {
	if (!client.pomodoroState.has(guildId)) {
		init(client, guildId);
	}
	return client.pomodoroState.get(guildId);
}

function clearPomodoroState(client, guildId) {
	if (client.pomodoroState.has(guildId)) {
		const pomodoroState = client.pomodoroState.get(guildId);
		if (pomodoroState.timer) {
			clearInterval(pomodoroState.timer);
		}
		client.pomodoroState.delete(guildId);
		init(client, guildId); // 再初期化
	}
}

// 残り秒数を計算する関数
function calculateRemainingSeconds(endTimestamp) {
	if (!endTimestamp) return 0;
	const now = Date.now();
	const remaining = Math.max(0, Math.ceil((endTimestamp - now) / 1000));
	return remaining;
}

// ポモドーロタイマーの進捗状況をパーセンテージで計算する関数
function calculateStatusPercentage(pomodoroState) {
	const { workTime, breakTime, longBreakTime } = pomodoroState.options;
	const remainingSeconds = pomodoroState.remainingSeconds;

	let totalSeconds;
	if (pomodoroState.currentStatus === 'work') {
		totalSeconds = workTime * 60;
	} else if (pomodoroState.currentStatus === 'break') {
		totalSeconds = breakTime * 60;
	} else if (pomodoroState.currentStatus === 'longBreak') {
		totalSeconds = longBreakTime * 60;
	}
	const progress = ((totalSeconds - remainingSeconds) / totalSeconds) * 100;
	return Math.floor(progress);
}

// ポモドーロタイマーの状況を絵文字で生成する関数
function generatePomodoroStatusEmojis(percentage) {
	const doneEmoji = '🟩';
	const yetEmoji = '⬜';
	const totalBlocks = 10;
	let emojis = '';
	for (let i = 0; i < totalBlocks; i++) {
		emojis +=
			i < Math.floor(percentage / (100 / totalBlocks)) ? doneEmoji : yetEmoji;
	}
	return {
		emojis: emojis,
		doneCount: Math.floor(percentage / (100 / totalBlocks)),
		yetCount: totalBlocks - Math.floor(percentage / (100 / totalBlocks)),
	};
}

async function start(client, interaction, options) {
	const guildId = interaction.guildId;
	const pomodoroState = getPomodoroState(client, guildId);

	if (pomodoroState.running) {
		await interaction.reply('すでにポモドーロタイマーが動作中です。');
		return;
	}
	pomodoroState.running = true;
	pomodoroState.endTimestamp = null;
	pomodoroState.remainingSeconds = 0;
	pomodoroState.currentCycle = 0;
	pomodoroState.options = options;
	pomodoroState.vcId = interaction.member?.voice?.channelId ?? null;

	// オプションが未入力の場合はデフォルト値を設定
	try {
		const db = await profileSchema.findById(guildId);
		if (!pomodoroState.options.workTime) {
			pomodoroState.options.workTime = db.pomodoro.defaultWorkTime;
		}
		if (!pomodoroState.options.breakTime) {
			pomodoroState.options.breakTime = db.pomodoro.defaultBreakTime;
		}
		if (!pomodoroState.options.longBreakTime) {
			pomodoroState.options.longBreakTime = db.pomodoro.defaultLongBreakTime;
		}
		if (!pomodoroState.options.cycleCount) {
			pomodoroState.options.cycleCount = db.pomodoro.defaultCycleCount;
		}
		if (!pomodoroState.options.voiceNotification) {
			pomodoroState.options.voiceNotification =
				db.pomodoro.defaultVoiceNotification;
		}
		if (!pomodoroState.options.voiceNotificationVolume) {
			pomodoroState.options.voiceNotificationVolume =
				db.pomodoro.defaultVoiceNotificationVolume;
		}
	} catch (err) {
		console.error(
			'データベースからのポモドーロタイマーのデフォルト値取得に失敗:',
			err,
		);
	}

	const {
		workTime,
		breakTime,
		longBreakTime,
		cycleCount,
		voiceNotification,
		voiceNotificationVolume,
	} = pomodoroState.options;

	await interaction.reply(
		'ポモドーロタイマーを開始します！\n`/pomodoro stop`で終了できます。',
	);

	while (pomodoroState.running) {
		pomodoroState.currentCycle++;
		// 作業時間
		const workEndTime = Date.now() + workTime * 60 * 1000;
		pomodoroState.endTimestamp = workEndTime;
		pomodoroState.remainingSeconds = calculateRemainingSeconds(workEndTime);
		pomodoroState.currentStatus = 'work';
		pomodoroState.nextStatus =
			pomodoroState.currentCycle % cycleCount === 0 ? 'longBreak' : 'break';
		await sendPomodoroStatus(interaction, pomodoroState);
		if (voiceNotification) {
			await notifyVoice(interaction, 'startWorking', voiceNotificationVolume);
		}
		await waitOrCancel(workTime, client, interaction, pomodoroState);

		if (!pomodoroState.running) break;

		// 休憩時間
		if (pomodoroState.currentCycle % cycleCount === 0) {
			const longBreakEndTime = Date.now() + longBreakTime * 60 * 1000;
			pomodoroState.endTimestamp = longBreakEndTime;
			pomodoroState.remainingSeconds =
				calculateRemainingSeconds(longBreakEndTime);
			pomodoroState.currentStatus = 'longBreak';
			pomodoroState.nextStatus = 'work';
			await sendPomodoroStatus(interaction, pomodoroState);
			if (voiceNotification) {
				await notifyVoice(
					interaction,
					'startLongBreaking',
					voiceNotificationVolume,
				);
			}
			await waitOrCancel(longBreakTime, client, interaction, pomodoroState);
		} else {
			const breakEndTime = Date.now() + breakTime * 60 * 1000;
			pomodoroState.endTimestamp = breakEndTime;
			pomodoroState.remainingSeconds = calculateRemainingSeconds(breakEndTime);
			pomodoroState.currentStatus = 'break';
			pomodoroState.nextStatus = 'work';
			await sendPomodoroStatus(interaction, pomodoroState);
			if (voiceNotification) {
				await notifyVoice(
					interaction,
					'startBreaking',
					voiceNotificationVolume,
				);
			}
			await waitOrCancel(breakTime, client, interaction, pomodoroState);
		}
		if (!pomodoroState.running) break;
	}

	if (pomodoroState.running) {
		await interaction.channel.send(
			'ポモドーロタイマーが完了しました！お疲れ様でした！',
		);
		if (voiceNotification) {
			await notifyVoice(interaction, 'stopPomodoro', voiceNotificationVolume);
		}

		await clearPomodoroState(client, guildId);
	}
}

// ポモドーロタイマーの状況送信
async function sendPomodoroStatus(interaction, pomodoroState) {
	const statusPercentage = calculateStatusPercentage(pomodoroState);
	const statusEmojis = generatePomodoroStatusEmojis(statusPercentage);

	// 次のステータスの時間を取得
	let nextStatus;
	switch (pomodoroState.nextStatus) {
		case 'work':
			nextStatus = '作業時間';
			break;
		case 'break':
			nextStatus = '休憩時間';
			break;
		case 'longBreak':
			nextStatus = '長めの休憩時間';
			break;
	}
	const remainingSeconds = pomodoroState.remainingSeconds;
	const nowUnixTimeStamp = Math.floor(Date.now() / 1000);
	const nextStatusTimestamp = nowUnixTimeStamp + remainingSeconds;

	const embed = new EmbedBuilder()
		.setTitle('ポモドーロタイマーの状況')
		.setDescription(
			`- 現在のパート: ${pomodoroState.currentStatus === 'work' ? '作業時間' : pomodoroState.currentStatus === 'break' ? '休憩時間' : '長めの休憩時間'}\n- 進捗状況: \n\`\`\`\n${statusEmojis.emojis} ${statusPercentage}%\`\`\`\n- 次のパート: ${nextStatus} (<t:${nextStatusTimestamp}:R>)`,
		)
		.setColor(0x00ff00)
		.setFooter({
			text: '※この表示はBOT全体の導入サーバー数に応じて自動更新されます。',
		});

	const button = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('pomodoro_update')
			.setStyle(ButtonStyle.Success)
			.setLabel('更新'),
		new ButtonBuilder()
			.setCustomId('pomodoro_stop')
			.setStyle(ButtonStyle.Danger)
			.setLabel('ポモドーロタイマーを終了する'),
	);

	// 前のステータスメッセージがあった場合は編集し、無い場合や編集に失敗した場合は新規送信する
	let sentMessage = false;
	if (pomodoroState.lastStatusMessageId) {
		try {
			const lastStatusMessage = await interaction.channel.messages.fetch(
				pomodoroState.lastStatusMessageId,
			);
			await lastStatusMessage.edit({
				embeds: [embed],
				components: [button],
			});
			sentMessage = true;
		} catch (err) {
			// 送信失敗は無視
			void err;
		}
	}
	if (!sentMessage) {
		const newStatus = await interaction.channel.send({
			embeds: [embed],
			components: [button],
		});

		// 新しいステータスメッセージのIDを保存
		pomodoroState.lastStatusMessageId = newStatus.id || null;
	}
}

// VC監視付きの待機
function waitOrCancel(minutes, client, interaction, pomodoroState) {
	const interval = 1000; // 1秒ごとにチェック
	let disconnectedElapsed = 0;
	const disconnectedLimit = 60 * 60 * 1000; // 1時間
	let guildCount = 1;
	let guildCountCheckInterval = 300; // 5分ごとにサーバー数をチェック

	return new Promise((resolve) => {
		pomodoroState.timer = setInterval(async () => {
			// 残り秒数を更新（endTimestampから計算）
			pomodoroState.remainingSeconds = calculateRemainingSeconds(
				pomodoroState.endTimestamp,
			);

			// 時間が終了したかチェック
			if (pomodoroState.remainingSeconds <= 0) {
				clearInterval(pomodoroState.timer);
				resolve();
				return;
			}

			// VC監視
			if (pomodoroState.vcId) {
				const channel = await client.channels.fetch(pomodoroState.vcId);
				if (channel && channel.members) {
					// BOT以外が居るか
					const nonBotMembers = channel.members.filter((m) => !m.user.bot);
					if (nonBotMembers.size === 0) {
						disconnectedElapsed += interval;
						if (disconnectedElapsed >= disconnectedLimit) {
							await interaction.channel.send(
								'VCに誰も1時間戻らなかったため、ポモドーロタイマーを中止しました。',
							);
							await clearPomodoroState(client, interaction.guildId);
							resolve();
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
			}

			// メッセージの自動更新
			// 5分ごとに所属サーバー数を取得
			guildCountCheckInterval--;
			if (guildCountCheckInterval <= 0) {
				guildCount = client.guilds.cache.size;
				guildCountCheckInterval = 300;
			}
			// 現在のパートの割合を計算
			const statusPercentage = calculateStatusPercentage(pomodoroState);
			// サーバーへの導入数次第で、絵文字の割合を計算
			const statusEmojis = generatePomodoroStatusEmojis(statusPercentage);
			let shouldUpdate = false;
			const doneCountDiff = Math.abs(
				statusEmojis.doneCount - pomodoroState.lastDoneCount,
			);
			const yetCountDiff = Math.abs(
				statusEmojis.yetCount - pomodoroState.lastYetCount,
			);
			if (guildCount < 500) {
				// 500未満の場合は、進捗状況の絵文字が変化した場合は常に更新
				if (
					statusEmojis.doneCount !== pomodoroState.lastDoneCount ||
					statusEmojis.yetCount !== pomodoroState.lastYetCount
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
			// 次回更新確認用に保存する
			pomodoroState.lastDoneCount = statusEmojis.doneCount;
			pomodoroState.lastYetCount = statusEmojis.yetCount;
			// 更新が必要な場合はステータスメッセージを更新
			if (shouldUpdate && totalAutoUpdateCount < 600) {
				await sendPomodoroStatus(interaction, pomodoroState);
				totalAutoUpdateCount++;
			}

			// 強制停止された場合
			if (!pomodoroState.running) {
				clearInterval(pomodoroState.timer);
				resolve();
			}
		}, interval);
	});
}

// 状況確認
async function status(client, interaction) {
	const guildId = interaction.guildId;
	const pomodoroState = getPomodoroState(client, guildId);

	if (!pomodoroState.running) {
		await interaction.reply('ポモドーロタイマーは動作していません。');
		return;
	}

	// リアルタイムで残り時間を計算
	const currentRemainingSeconds = calculateRemainingSeconds(
		pomodoroState.endTimestamp,
	);
	const remaining =
		typeof currentRemainingSeconds === 'number'
			? `${String(Math.floor(currentRemainingSeconds / 60)).padStart(
					2,
					'0',
				)}:${String(currentRemainingSeconds % 60).padStart(2, '0')}`
			: '取得不可';
	await interaction.reply(
		`現在のサイクル: ${pomodoroState.currentCycle}\n` +
			`状態: ${pomodoroState.running ? '稼働中' : '停止中'}\n` +
			`残り時間: ${remaining}`,
	);
}

// 強制終了
async function stop(client, interaction) {
	const guildId = interaction.guild.id;
	const pomodoroState = getPomodoroState(client, guildId);

	if (!pomodoroState.running) {
		await interaction.reply('ポモドーロタイマーは動作していません。');
		return;
	}

	await clearPomodoroState(client, guildId);
	return interaction.reply('ポモドーロタイマーを強制終了しました。');
}

// ボイス通知
async function notifyVoice(interaction, notifyType, voiceNotificationVolume) {
	// VC取得
	const channel = interaction.member?.voice?.channel;
	if (!channel) return;

	// 一時wavファイル名
	const wavPath = await voicevoxAudioController.get(
		notifyType,
		3, // voicevoxSpeakerId (3 = ずんだもん)
	);

	// 音量調整付きリソース作成
	const resource = createAudioResource(wavPath, {
		inlineVolume: true, // 音量調整を有効化
	});
	resource.volume.setVolume(voiceNotificationVolume / 100 || 0.5);

	// VC接続
	const connection = joinVoiceChannel({
		channelId: channel.id,
		guildId: channel.guild.id,
		adapterCreator: channel.guild.voiceAdapterCreator,
		selfDeaf: true,
	});

	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
		const player = createAudioPlayer();
		player.play(resource);
		connection.subscribe(player);

		// 再生終了まで待機
		await new Promise((resolve) => {
			player.on('idle', resolve);
			player.on('error', resolve);
		});
	} catch (err) {
		// エラー時は何もしない
		void err;
	}

	// 切断・ファイル削除
	connection.destroy();
}

module.exports = {
	init,
	getPomodoroState,
	sendPomodoroStatus,
	start,
	status,
	stop,
};
