const fetch = (...args) =>
	import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });

const AUDIO_ROOT_DIR = path.resolve(__dirname, '../../assets/audio');
const VOICE_LIST_PATH = path.join(AUDIO_ROOT_DIR, 'voiceList.json');

function getAudioFileInfo(audioType, speakerId) {
	if (!audioType || !speakerId)
		throw new Error('audioTypeとspeakerIdは必須です');

	const speakerDir = path.join(AUDIO_ROOT_DIR, String(speakerId));
	const map = {
		startWorking: {
			filePath: path.join(speakerDir, 'startWorking.wav'),
			text: '作業時間が始まります。集中して取り組んでください。',
		},
		startBreaking: {
			filePath: path.join(speakerDir, 'startBreaking.wav'),
			text: '休憩時間が始まります。リラックスして休んでください。',
		},
		startLongBreaking: {
			filePath: path.join(speakerDir, 'startLongBreaking.wav'),
			text: '長めの休憩時間が始まります。しっかりとリフレッシュしてください。',
		},
		stopPomodoro: {
			filePath: path.join(speakerDir, 'stopPomodoro.wav'),
			text: 'ポモドーロタイマーが終了しました。お疲れ様でした！',
		},
	};

	if (!map[audioType]) throw new Error('Invalid audio type');

	return {
		speakerDir,
		filePath: map[audioType].filePath,
		text: map[audioType].text,
	};
}

async function create(audioType, speakerId) {
	const uri = process.env.voicevox_api_uri || 'http://localhost:50021';
	const { speakerDir, filePath, text } = getAudioFileInfo(audioType, speakerId);

	// ディレクトリの確認。なければ作成
	console.log(speakerDir);
	if (!fs.existsSync(speakerDir)) fs.mkdirSync(speakerDir, { recursive: true });

	// audio_query
	const audioQueryRes = await fetch(
		`${uri}/audio_query?text=${encodeURI(text)}&speaker=${speakerId}`,
		{ method: 'POST' },
	);
	const audioQuery = await audioQueryRes.json();

	// synthesis
	const voiceDataRes = await fetch(`${uri}/synthesis?speaker=${speakerId}`, {
		method: 'POST',
		body: JSON.stringify(audioQuery),
		headers: { accept: 'audio/wav', 'Content-Type': 'application/json' },
	});
	const arrayBuffer = await voiceDataRes.arrayBuffer();

	// Bufferに変換して書き出す
	fs.writeFileSync(filePath, Buffer.from(arrayBuffer), 'binary');

	// 音声リストの更新
	await sync();
}

async function get(audioType, speakerId) {
	const { filePath } = getAudioFileInfo(audioType, speakerId);
	// ファイルの存在確認
	if (!fs.existsSync(filePath)) await create(audioType, speakerId); // 存在しない場合は作成

	// filePathを返す
	return filePath;
}

async function getSpeakerName(speakerId) {
	const uri = process.env.voicevox_api_uri || 'http://localhost:50021';
	const speakersRes = await fetch(`${uri}/speakers`, { method: 'GET' });
	const speakers = await speakersRes.json();
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

async function sync() {
	// ./audioフォルダ内の音声ファイルをvoiceList_format.json形式で保存
	const voiceList = {};

	// ディレクトリ情報を収集
	const speakerDirs = fs
		.readdirSync(AUDIO_ROOT_DIR, { withFileTypes: true })
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name);

	// 音声ファイル情報を収集
	for (const speakerId of speakerDirs) {
		const speakerPath = path.join(AUDIO_ROOT_DIR, speakerId);
		const speakerName = await getSpeakerName(speakerId); // スピーカー名を取得する関数を実装する必要があります
		voiceList[speakerId] = {
			name: speakerName,
			audio: {},
		};
		const files = fs.readdirSync(speakerPath);
		files.forEach((file) => {
			if (file.endsWith('.wav')) {
				if (file === 'startWorking.wav') {
					voiceList[speakerId].audio.startWorking = path.join(
						speakerPath,
						'startWorking.wav',
					);
				} else if (file === 'startBreaking.wav') {
					voiceList[speakerId].audio.startBreaking = path.join(
						speakerPath,
						'startBreaking.wav',
					);
				} else if (file === 'startLongBreaking.wav') {
					voiceList[speakerId].audio.startLongBreaking = path.join(
						speakerPath,
						'startLongBreaking.wav',
					);
				}
			}
		});
	}

	fs.writeFileSync(VOICE_LIST_PATH, JSON.stringify(voiceList));
}

async function list() {
	// 一覧を更新
	await sync();

	// ../../assets/audio/voiceList.jsonから音声ファイルの一覧を取得
	const voiceList = JSON.parse(fs.readFileSync(VOICE_LIST_PATH, 'utf8'));
	// nameだけを配列で返す
	return Object.values(voiceList).map((item) => item.name);
}

async function reset() {
	// ./audioフォルダ内の音声ファイルを全て削除
	const audioFiles = fs
		.readdirSync(AUDIO_ROOT_DIR)
		.filter((file) => file.endsWith('.wav'));
	audioFiles.forEach((file) => {
		fs.unlinkSync(path.join(AUDIO_ROOT_DIR, file));
	});

	// 一覧を更新
	await sync();
}

module.exports = { create, get, sync, list, reset };
