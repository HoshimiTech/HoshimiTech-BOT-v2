// guildごとにpomodoroStateをMapで管理
function init(client, guildId) {
	if (!client.pomodoroState.has(guildId)) {
		client.pomodoroState.set(guildId, {
			running: false, // タイマーが動作中か
			paused: false, // タイマーが一時停止中か

			message: {
				id: null, // ステータスメッセージID
				lastProgress: 0, // 最後に表示した進捗(0～10)
			},

			part: {
				type: null, // work | break | longBreak
				nextType: null, // 次のパート
				endTimestamp: null, // 現在のパート終了予定時刻(Unixミリ秒)
				pausedRemainingSeconds: null, // 一時停止時の残り秒数
				cycle: 0, // 現在のサイクル数
			},

			timer: null, // setInterval / setTimeout
			timerResolve: null, // タイマーを終了させるためのPromiseのresolve関数

			config: {
				vcId: null, // 接続VC
				options: null, // ユーザー設定
			},
		});
	}
}

function getPomodoroState(client, guildId) {
	if (!client.pomodoroState.has(guildId)) {
		init(client, guildId);
	}
	return client.pomodoroState.get(guildId);
}

async function clearPomodoroState(client, guildId) {
	const pomodoroState = await getPomodoroState(client, guildId);

	// timerController.stop()と同じ動作だが、ここで呼び出すと循環参照になってエラーになるので同じ内容を直書き
	if (pomodoroState.timer) {
		clearInterval(pomodoroState.timer);
		pomodoroState.timer = null;
	}
	if (pomodoroState.timerResolve) {
		pomodoroState.timerResolve('cleared');
		pomodoroState.timerResolve = null;
	}

	client.pomodoroState.delete(guildId);
	init(client, guildId); // 再初期化
}

module.exports = {
	init,
	getPomodoroState,
	clearPomodoroState,
};
