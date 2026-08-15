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
const serverSchema = require(path.join(dirname, 'models/serverSchema.js'));
const DEFAULT_TEXTS = {
	workTime: '作業時間が始まります。集中して取り組んでください。',
	breakTime: '休憩時間が始まります。リラックスして休んでください。',
	longBreakTime:
		'長い休憩時間が始まります。しっかりとリフレッシュしてください。',
	stopPomodoro: 'ポモドーロタイマーが終了しました。お疲れ様でした！',
};

// ボイス通知のメッセージを取得する関数
async function getVoiceNotificationMessage(
	guildId,
	notifyType,
	{ serverData = null } = {},
) {
	// サーバー設定からカスタムメッセージを取得
	if (!serverData) {
		serverData = await serverSchema.findById(guildId);
	}

	const customMessage =
		serverData?.pomodoro?.voiceNotification?.message?.[notifyType] || '';

	// デフォルトメッセージを取得
	const defaultMessage = DEFAULT_TEXTS[notifyType];

	// カスタムメッセージが存在する場合はそれを返し、存在しない場合はデフォルトメッセージを返す
	return customMessage || defaultMessage;
}

// ボイス通知
async function notifyVoice(client, guildId, pomodoroState, notifyType) {
	// VC取得
	const channel = pomodoroState.config?.vcId
		? await client.channels.fetch(pomodoroState.config.vcId)
		: null;
	if (!channel) return;

	// 一時wavファイル名
	const wavPath = await voicevoxAudioController.getAudioFilePath(
		notifyType,
		pomodoroState.config?.options?.voiceNotificationMessage?.[notifyType],
		{
			guildId: guildId,
			speakerId: pomodoroState.config?.options?.voiceNotificationSpeakerId,
		},
	);

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
	getVoiceNotificationMessage,
	notifyVoice,
};
