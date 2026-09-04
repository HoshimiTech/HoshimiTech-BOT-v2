const fs = require('fs');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const dirname = require('./lib/defineDirname.js');
const path = require('path');

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildVoiceStates,
	],
	partials: [
		Partials.Message,
		Partials.Channel,
		Partials.Reaction,
		Partials.User,
	],
});
const mongoose = require('mongoose');
const express = require('express');
const app = express();
require('dotenv').config({ quiet: true });
const { spawn } = require('child_process');

//機密情報取得
const discord_token = process.env.discord_bot_token;
const mongodb_TOKEN = process.env.mongodb_token;
const PORT = 8000;

///////////////////////////////////////////////////
fs.readdir(path.join(dirname, 'events'), (_err, files) => {
	files.forEach((file) => {
		if (!file.endsWith('.js')) return;
		const event = require(path.join(dirname, 'events', file));
		const eventName = file.split('.')[0];
		console.info(`クライアントイベントの読み込みが完了: ${eventName}`);

		// 既存のリスナーを削除してから追加
		client.removeAllListeners(eventName);
		client.on(eventName, event.bind(null, client));

		delete require.cache[require.resolve(path.join(dirname, 'events', file))];
	});
});

client.commands = [];
fs.readdir(path.join(dirname, 'commands'), (err, files) => {
	if (err) throw err;
	files.forEach((f) => {
		try {
			if (f.endsWith('.js')) {
				const props = require(path.join(dirname, 'commands', f));
				const propsJson = props.data.toJSON();
				client.commands.push(propsJson);
				console.info(`コマンドの読み込みが完了: ${propsJson.name}`);
			}
		} catch (err) {
			console.log(`コマンドの読み込みに失敗: ${f}`);
			throw new Error(err.message || String(err), { cause: err });
		}
	});
});

if (discord_token) {
	client.login(discord_token).catch((err) => {
		throw new Error(
			`プロジェクトに入力したボットのトークンが間違っているか、ボットのINTENTSがオフになっています!\n${err}`,
		);
	});
} else {
	setTimeout(() => {
		if (process.env.isTest !== 'true')
			throw new Error(
				'ボットのトークンをプロジェクト内の.envファイルに設定してください!',
			);
	}, 2000);
}

if (mongodb_TOKEN) {
	//mongooseについて
	mongoose
		.connect(mongodb_TOKEN, { dbName: 'database' })
		.then(() => {
			console.info('データベースに接続したんだゾ');
		})
		.catch((err) => {
			throw new Error(`データベースの接続に失敗しました: ${err}`);
		});
} else {
	setTimeout(() => {
		if (process.env.isTest !== 'true')
			throw new Error(
				'mongodbのトークンをプロジェクト内の.envファイルに設定してください!',
			);
	}, 2000);
}

app.get('/', (request, response) => {
	response?.sendStatus(200);
});
app.listen(PORT, () => {
	console.info(`[NodeJS] Application Listening on Port ${PORT}`);
});

// Voicevoxの起動
const { getVoicevoxExecutablePath } = require(
	path.join(dirname, 'scripts/voicevoxSetup.js'),
);

const cpuThreads =
	process.env.voicevox_cpu_threads || require('os').cpus().length; // 環境変数から取得、デフォルトはCPUコア数

// プラットフォーム対応でVOICEVOXの実行ファイルパスを取得
const voicevoxExecutablePath = getVoicevoxExecutablePath();
if (!voicevoxExecutablePath || !fs.existsSync(voicevoxExecutablePath)) {
	throw new Error(
		`VOICEVOXの実行ファイルが${voicevoxExecutablePath}に見つかりません。voicevoxSetup.jsを実行してセットアップしてください。`,
	);
}

const voicevoxProcess = spawn(
	voicevoxExecutablePath,
	[`--cpu_num_threads=${cpuThreads}`],
	{
		stdio: 'inherit',
	},
);

voicevoxProcess.on('error', (err) => {
	throw new Error(`Voicevoxの起動に失敗しました: ${err}`);
});
