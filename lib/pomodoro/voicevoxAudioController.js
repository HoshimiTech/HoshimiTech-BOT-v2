const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });

const dirname = require('../defineDirname.js');
const serverSchema = require(path.join(dirname, 'models/serverSchema.js'));

const voicevoxURL = process.env.voicevox_api_uri || 'http://localhost:50021';
const AUDIO_ROOT_DIR = path.resolve(dirname, 'assets/audio');
const VOICE_LIST_PATH = path.join(AUDIO_ROOT_DIR, 'voiceList.json');

/**
 * 音声ファイルを作成する関数
 * @param {string} audioType - 音声の種類（workTime, breakTime, longBreakTime, stopPomodoro）
 * @param {string} message - 音声に変換するメッセージ
 * @param {Object} options - オプション
 * @param {string} options.guildId - ギルドID（カスタムメッセージの場合に必須）
 * @param {number} options.speakerId - スピーカーのID（未指定の場合は3(ずんだもん)が使用される）
 * @returns {Promise<void>}
 */
async function create(
	audioType,
	message,
	{ guildId = null, speakerId = 3 } = {},
) {
	let audioDir;
	if (!guildId) {
		// デフォルト文言を使用する場合
		audioDir = path.join(AUDIO_ROOT_DIR, 'common', String(speakerId));
	} else {
		// カスタム文言を使用する場合
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
			message,
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

	// 作成した音源のメッセージ内容を保存
	const voiceList = JSON.parse(fs.readFileSync(VOICE_LIST_PATH, 'utf-8'));
	if (guildId) {
		voiceList[guildId][speakerId].audio[audioType].message = message;
	} else {
		voiceList['common'][speakerId].audio[audioType].message = message;
	}
	fs.writeFileSync(VOICE_LIST_PATH, JSON.stringify(voiceList));
}

/**
 * 音声ファイルを取得する関数
 * @param {string} audioType - 音声の種類（workTime, breakTime, longBreakTime, stopPomodoro）
 * @param {string} message - 音声に変換するメッセージ
 * @param {Object} options - オプション
 * @param {string} options.guildId - ギルドID（カスタムメッセージの場合に必須）
 * @param {number} options.speakerId - スピーカーのID（未指定の場合は3(ずんだもん)が使用される）
 * @returns {Promise<string>} - 音声ファイルのパス
 */
async function getAudioFilePath(
	audioType,
	message,
	{ guildId = null, speakerId = 3 } = {},
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

	// ファイルの存在確認と最終更新日とメッセージ内容を比較して、必要に応じて音声ファイルを作成
	// 音声ファイルが存在しない場合
	const isFileNotExist = !fs.existsSync(audioFilePath);
	// サーバーDBの方が新しい場合
	const isServerDataNewer =
		serverDataLastModified &&
		voiceListLastModified &&
		new Date(serverDataLastModified) > new Date(voiceListLastModified);
	// メッセージ内容が異なる場合
	const isMessageDifferent =
		message !==
		(guildId
			? voiceList?.[guildId]?.[speakerId]?.audio?.[audioType]?.message
			: voiceList?.['common']?.[speakerId]?.audio?.[audioType]?.message);

	if (isFileNotExist || isServerDataNewer || isMessageDifferent) {
		// ファイルが存在しない場合または、voiceListよりもサーバーDBの方が新しい場合は、音声データを作成する（既に存在する場合は再作成する）
		await create(audioType, message, { guildId, speakerId });
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

					voiceList[guildId][speakerId].audio[file.replace('.wav', '')] = {
						path: path.join(speakerDirPath, file),
					};
				}
			});
		}
	}

	fs.writeFileSync(VOICE_LIST_PATH, JSON.stringify(voiceList));
}

module.exports = { getAudioFilePath };
