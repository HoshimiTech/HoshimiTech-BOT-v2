const {
	joinVoiceChannel,
	createAudioPlayer,
	createAudioResource,
	entersState,
	VoiceConnectionStatus,
} = require('@discordjs/voice');
const path = require('path');
const dirname = require('../../defineDirname.js');
const voicevoxAudioController = require(
	path.join(dirname, 'lib/pomodoro/voicevoxAudioController.js'),
);

// ボイス通知
async function notifyVoice(client, guildId, pomodoroState, notifyType) {
	// VC取得
	const channel = pomodoroState.config?.vcId
		? await client.channels.fetch(pomodoroState.config.vcId)
		: null;
	if (!channel) return;

	// 一時wavファイル名
	const wavPath = await voicevoxAudioController.getAudioFilePath(notifyType, {
		text:
			pomodoroState.config?.options?.voiceNotificationMessage?.[notifyType] ||
			'',
		guildId: guildId,
	});

	// 音量調整付きリソース作成
	const resource = createAudioResource(wavPath, {
		inlineVolume: true, // 音量調整を有効化
	});
	resource.volume.setVolume(
		pomodoroState.config?.options?.voiceNotificationVolume / 100 || 0.5,
	);

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
	notifyVoice,
};
