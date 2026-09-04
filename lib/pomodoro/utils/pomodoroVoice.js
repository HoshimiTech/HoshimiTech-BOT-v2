const {
	joinVoiceChannel,
	createAudioPlayer,
	createAudioResource,
	entersState,
	VoiceConnectionStatus,
} = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const dirname = require('../../defineDirname.js');
const voicevoxAudioController = require(
	path.join(dirname, 'lib/pomodoro/voicevoxAudioController.js'),
);
const serverSchema = require(path.join(dirname, 'models/serverSchema.js'));
const AUDIO_ROOT_DIR = path.resolve(dirname, 'assets/audio');
const VOICE_LIST_PATH = path.join(AUDIO_ROOT_DIR, 'voiceList.json');
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

/**
 * 音声ファイルを取得する関数
 * @param {string} audioType - 音声の種類（workTime, breakTime, longBreakTime, stopPomodoro）
 * @param {string} message - 音声に変換するメッセージ
 * @param {number} speakerId - 話者のID
 * @param {string} guildId - ギルドID（カスタムメッセージの場合に必須）
 * @returns {Promise<string>} - 音声ファイルのパス
 */
async function getAudioFilePath(audioType, message, speakerId, guildId) {
	// serverDataとVoiceListの取得
	const serverData = await serverSchema.findById(guildId);
	const voiceList = JSON.parse(fs.readFileSync(VOICE_LIST_PATH, 'utf-8'));

	// common判定
	let common = false;
	if (
		serverData?.pomodoro?.voiceNotification?.message?.[audioType] ===
			DEFAULT_TEXTS[audioType] ||
		!serverData?.pomodoro?.voiceNotification?.message?.[audioType]
	) {
		// サーバーDBの内容がデフォルトと同じ、またはサーバーDBにカスタムメッセージが存在しない場合はcommon判定をtrueにする
		common = true;
	}

	// ファイルパスの定義
	const audioFilePathType = common ? 'common' : String(guildId);
	const audioDirectory = path.join(
		AUDIO_ROOT_DIR,
		audioFilePathType,
		String(speakerId),
	);
	const audioFilePath = path.join(audioDirectory, `${audioType}.wav`);

	// 両者の最終更新日を取得
	const serverDataLastModified =
		serverData?.pomodoro?.voiceNotification?.message?.lastModified;
	const voiceListLastModified = voiceList?.[audioFilePathType]?.lastModified;

	// ファイルの存在確認と最終更新日とメッセージ内容を比較して、必要に応じて音声ファイルを作成
	// 音声ファイルが存在しない場合
	const isFileNotExist = !fs.existsSync(audioFilePath);
	// サーバーDBの方が新しい場合
	const isServerDataNewer =
		serverDataLastModified &&
		voiceListLastModified &&
		new Date(serverDataLastModified) > new Date(voiceListLastModified);
	// メッセージ内容がデフォルトではなく、生成済みファイルと異なる場合
	const isMessageDifferent =
		!common &&
		message !==
			voiceList?.[audioFilePathType]?.[speakerId]?.audio?.[audioType]?.message;

	if (isFileNotExist || isServerDataNewer || isMessageDifferent) {
		// ファイルが存在しない場合または、voiceListよりもサーバーDBの方が新しい場合は、音声データを作成する（既に存在する場合は再作成する）
		await voicevoxAudioController.create(
			audioDirectory,
			audioType,
			message,
			speakerId,
			common ? null : guildId,
		);
	}

	return audioFilePath;
}

// ボイス通知
async function notifyVoice(client, guildId, pomodoroState, notifyType) {
	// VC取得
	const channel = pomodoroState.config?.vcId
		? await client.channels.fetch(pomodoroState.config.vcId)
		: null;
	if (!channel) return;

	// 一時wavファイル名
	const wavPath = await getAudioFilePath(
		notifyType,
		pomodoroState.config?.options?.voiceNotificationMessage?.[notifyType],
		pomodoroState.config?.options?.voiceNotificationSpeakerId,
		guildId,
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
