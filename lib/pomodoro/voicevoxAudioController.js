const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });

const voicevoxURL = process.env.voicevox_api_uri || 'http://localhost:50021';
const AUDIO_ROOT_DIR = path.resolve(__dirname, '../../assets/audio');
const VOICE_LIST_PATH = path.join(AUDIO_ROOT_DIR, 'voiceList.json');
const DEFAULT_TEXTS = {
	startWorking: '作業時間が始まります。集中して取り組んでください。',
	startBreaking: '休憩時間が始まります。リラックスして休んでください。',
	startLongBreaking:
		'長い休憩時間が始まります。しっかりとリフレッシュしてください。',
	stopPomodoro: 'ポモドーロタイマーが終了しました。お疲れ様でした！',
};

/**
 * 音声ファイルを作成する関数
 * @param {string} audioType - 音声の種類（startWorking, startBreaking, startLongBreaking）
 * @param {Object} options - オプション
 * @param {string} options.text - 音声に使用するテキスト（未指定の場合はデフォルト文言が使用される）
 * @param {string} options.guildId - ギルドID（未指定の場合はcommonディレクトリに保存される）
 * @param {number} options.speakerId - スピーカーのID（未指定の場合は3(ずんだもん)が使用される）
 * @returns {Promise<void>}
 */
async function create(
	audioType,
	{ text = '', guildId = null, speakerId = 3 } = {},
) {
	// 保存先ディレクトリの確認。なければ作成
	let audioDir;
	if (!guildId) {
		// 文言の指定が無い場合
		audioDir = path.join(AUDIO_ROOT_DIR, 'common', String(speakerId));
	} else {
		audioDir = path.join(AUDIO_ROOT_DIR, String(guildId), String(speakerId));
	}
	if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
	const audioFilePath = path.join(audioDir, `${audioType}.wav`);

	// Audio Queryの作成
	const audioQueryRes = await fetch(
		`${voicevoxURL}/audio_query?text=${encodeURI(
			text ? text : DEFAULT_TEXTS[audioType],
		)}&speaker=${speakerId}`,
		{ method: 'POST' },
	);
	const audioQuery = await audioQueryRes.json();

	// 音声合成
	const voiceDataRes = await fetch(
		`${voicevoxURL}/synthesis?speaker=${speakerId}`,
		{
			method: 'POST',
			body: JSON.stringify(audioQuery),
			headers: {
				accept: 'audio/wav',
				'Content-Type': 'application/json',
			},
		},
	);
	const voiceArrayBuffer = await voiceDataRes.arrayBuffer();

	// 音声データを取得して保存
	fs.writeFileSync(audioFilePath, Buffer.from(voiceArrayBuffer), 'binary');

	// 音声リストの更新
	await sync();
}

/**
 * 音声ファイルを取得する関数
 * @param {string} audioType - 音声の種類（startWorking, startBreaking, startLongBreaking）
 * @param {Object} options - オプション
 * @param {string} options.text - 音声に使用するテキスト（未指定の場合はデフォルト文言が使用される）
 * @param {string} options.guildId - ギルドID（未指定の場合はcommonディレクトリから取得される）
 * @param {number} options.speakerId - スピーカーのID（未指定の場合は3(ずんだもん)が使用される）
 * @returns {string|null} - 音声ファイルのPath
 */
async function getAudioFilePath(
	audioType,
	{ text = '', guildId = null, speakerId = 3 } = {},
) {
	// ファイルパスの定義
	let audioFilePath;
	if (guildId) {
		audioFilePath = path.join(
			AUDIO_ROOT_DIR,
			String(guildId),
			String(speakerId),
			`${audioType}.wav`,
		);
	} else {
		audioFilePath = path.join(
			AUDIO_ROOT_DIR,
			'common',
			String(speakerId),
			`${audioType}.wav`,
		);
	}

	// ファイルの存在確認
	if (!fs.existsSync(audioFilePath)) {
		// ファイルが存在しない場合は作成
		await create(audioType, { text, guildId, speakerId });
	}

	return audioFilePath;
}

/**
 * Voicevoxの話者名を取得する関数
 * @param {number} speakerId - スピーカーのID
 * @returns {Promise<string>} - 話者名
 */
async function getSpeakerName(speakerId) {
	const speakerRes = await fetch(`${voicevoxURL}/speakers`, { method: 'GET' });
	const speakers = await speakerRes.json();
	let speakerName = null;
	for (const character of speakers) {
		const style = character.styles.find(
			(style) => style.id === Number(speakerId),
		);
		if (style) {
			speakerName = `${character.name}_${style.name}`;
		}
	}
	return speakerName ? speakerName : `Unknown Speaker (id:${speakerId})`;
}

/**
 * 音声ファイルと統計JSONを同期する関数
 * @returns null
 */
async function sync() {
	// AUDIO_ROOT_DIR内のディレクトリを取得
	const guildDirs = fs
		.readdirSync(AUDIO_ROOT_DIR, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name);

	// guildごとまたはcommonディレクトリを取得
	const voiceList = {};
	for (const guildId of guildDirs) {
		// 音声ファイル情報をvoiceListに追加
		voiceList[guildId] = {};

		const guildPath = path.join(AUDIO_ROOT_DIR, String(guildId));
		const speakerDirs = fs
			.readdirSync(guildPath, { withFileTypes: true })
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name);
		for (const speakerId of speakerDirs) {
			const speakerDirPath = path.join(guildPath, speakerId);
			const speakerName = await getSpeakerName(speakerId);
			// speakerIdとspeakerNameを記録
			voiceList[guildId][speakerId] = {
				name: speakerName,
				audio: {},
			};

			// 各音声ファイル情報を取得
			const audioFiles = fs.readdirSync(speakerDirPath);
			audioFiles.forEach((file) => {
				if (file.endsWith('.wav')) {
					if (file === 'startWorking.wav') {
						voiceList[guildId][speakerId].audio.startWorking = path.join(
							speakerDirPath,
							'startWorking.wav',
						);
					} else if (file === 'startBreaking.wav') {
						voiceList[guildId][speakerId].audio.startBreaking = path.join(
							speakerDirPath,
							'startBreaking.wav',
						);
					} else if (file === 'startLongBreaking.wav') {
						voiceList[guildId][speakerId].audio.startLongBreaking = path.join(
							speakerDirPath,
							'startLongBreaking.wav',
						);
					}
				}
			});
		}
	}

	fs.writeFileSync(VOICE_LIST_PATH, JSON.stringify(voiceList));
}

module.exports = { getAudioFilePath };
