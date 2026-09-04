const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });

const dirname = require('../defineDirname.js');

const voicevoxURL = process.env.voicevox_api_uri || 'http://localhost:50021';
const AUDIO_ROOT_DIR = path.resolve(dirname, 'assets/audio');
const VOICE_LIST_PATH = path.join(AUDIO_ROOT_DIR, 'voiceList.json');

/**
 * 音声ファイルを作成する関数
 * @param {string} audioDirectory - 音声ファイルを保存するディレクトリのパス
 * @param {string} audioType - 音声の種類（workTime, breakTime, longBreakTime, stopPomodoro）
 * @param {string} message - 音声に変換するメッセージ
 * @param {number} speakerId - 話者のID
 * @param {string|null} guildId - ギルドID（カスタムメッセージの場合に必須、デフォルト文言の場合はnull）
 * @returns {Promise<void>}
 */
async function create(audioDirectory, audioType, message, speakerId, guildId) {
	// ディレクトリが存在しない場合は作成
	if (!fs.existsSync(audioDirectory))
		fs.mkdirSync(audioDirectory, { recursive: true });
	const audioFilePath = path.join(audioDirectory, `${audioType}.wav`);

	// 音声ファイルが既に存在する場合は削除して再作成
	if (fs.existsSync(audioFilePath)) {
		fs.unlinkSync(audioFilePath);
	}

	// Audio Queryの作成
	const audioQueryRes = await fetch(
		`${voicevoxURL}/audio_query?text=${encodeURIComponent(
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

	voiceList[guildId === null ? 'common' : guildId][speakerId].audio[
		audioType
	].message = message;
	fs.writeFileSync(VOICE_LIST_PATH, JSON.stringify(voiceList));
}

/**
 * Voicevoxの話者名を取得する関数
 * @param {Number} speakerId - 話者のID
 * @returns {Promise<Object|Array>} - 話者の情報（speakerIdが指定されている場合はその話者の情報、指定されていない場合は全ての話者の情報を返す）
 */
async function getSpeakerInfo(speakerId) {
	const speakerRes = await fetch(`${voicevoxURL}/speakers`, { method: 'GET' });
	const speakers = await speakerRes.json();
	const speakerList = [];
	for (const speaker of speakers) {
		for (const style of speaker.styles) {
			if (!style.type?.includes('talk')) continue; // talkタイプ以外は無視
			speakerList.push({
				id: style.id,
				name: `${speaker.name} - ${style.name}`,
			});
		}
	}

	// speakerIdが指定されている場合はその情報を返す
	if (speakerId || speakerId === 0) {
		return speakerList.find((speaker) => speaker.id === speakerId);
	} else {
		return speakerList;
	}
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
			const speakerInfo = await getSpeakerInfo(Number(speakerId));
			// speakerIdとspeakerNameを記録
			voiceList[guildId][speakerId] = {
				name: speakerInfo.name,
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

module.exports = { create, getSpeakerInfo };
