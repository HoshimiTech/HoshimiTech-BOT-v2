const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });

const dirname = require('../defineDirname.js');
const serverSchema = require(path.join(dirname, 'models/serverSchema.js'));

const voicevoxURL = process.env.voicevox_api_uri || 'http://localhost:50021';
const AUDIO_ROOT_DIR = path.resolve(dirname, 'assets/audio');
const VOICE_LIST_PATH = path.join(AUDIO_ROOT_DIR, 'voiceList.json');
const DEFAULT_TEXTS = {
	workTime: '作業時間が始まります。集中して取り組んでください。',
	breakTime: '休憩時間が始まります。リラックスして休んでください。',
	longBreakTime:
		'長い休憩時間が始まります。しっかりとリフレッシュしてください。',
	stopPomodoro: 'ポモドーロタイマーが終了しました。お疲れ様でした！',
};

/**
 * 音声ファイルを作成する関数
 * @param {string} audioType - 音声の種類（workTime, breakTime, longBreakTime, stopPomodoro）
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
	// テキストの内容がデフォルトと同じ場合は、デフォルトのテキストを使用する
	if (text === DEFAULT_TEXTS[audioType]) {
		guildId = null; // デフォルトのテキストを使用する場合は、guildIdをnullに設定してcommonディレクトリに保存する
	}

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

	// 音声ファイルが既に存在する場合は当該ディレクトリ内を全て削除して再作成
	if (fs.existsSync(audioFilePath)) {
		const files = fs.readdirSync(audioDir);
		for (const file of files) {
			fs.unlinkSync(path.join(audioDir, file));
		}
	}

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
 * @param {string} audioType - 音声の種類（workTime, breakTime, longBreakTime, stopPomodoro）
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

	// serverDataとVoiceListの取得
	const serverData = await serverSchema.findById(guildId);
	const voiceList = JSON.parse(fs.readFileSync(VOICE_LIST_PATH, 'utf-8'));
	// 両者の最終更新日を取得
	const serverDataLastModified =
		serverData?.pomodoro?.voiceNotification?.message?.lastModified;
	const voiceListLastModified = voiceList?.[guildId]?.lastModified;

	// ファイルの存在確認
	if (
		!fs.existsSync(audioFilePath) ||
		(fs.existsSync(audioFilePath) &&
			serverDataLastModified &&
			voiceListLastModified &&
			new Date(serverDataLastModified) > new Date(voiceListLastModified))
	) {
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
					// last modified timeを設定
					voiceList[guildId].lastModified = new Date().toISOString();

					voiceList[guildId][speakerId].audio[file.replace('.wav', '')] =
						path.join(speakerDirPath, file);
				}
			});
		}
	}

	fs.writeFileSync(VOICE_LIST_PATH, JSON.stringify(voiceList));
}

module.exports = { getAudioFilePath };
