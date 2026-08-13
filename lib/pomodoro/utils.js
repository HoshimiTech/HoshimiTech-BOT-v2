const {
	joinVoiceChannel,
	createAudioPlayer,
	createAudioResource,
	entersState,
	VoiceConnectionStatus,
} = require('@discordjs/voice');
const {
	EmbedBuilder,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
} = require('discord.js');
const voicevoxAudioController = require('./voicevoxAudioController.js');

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

// 残り秒数を計算する関数
function calculateRemainingSeconds(pomodoroState) {
	if (pomodoroState?.paused) {
		return pomodoroState.part?.pausedRemainingSeconds ?? 0;
	}

	if (!pomodoroState.part?.endTimestamp) return 0;
	const now = Date.now();
	const remaining = Math.max(
		0,
		Math.ceil((pomodoroState.part.endTimestamp - now) / 1000),
	);
	return remaining;
}

function formatRemainingSeconds(seconds) {
	const safeSeconds = Math.max(0, Math.floor(seconds));
	return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(
		safeSeconds % 60,
	).padStart(2, '0')}`;
}

// ポモドーロタイマーの進捗状況をパーセンテージで計算する関数
function calculateStatusPercentage(pomodoroState) {
	const options = pomodoroState.config?.options;
	const partType = pomodoroState.part?.type;
	const partEndTimestamp = pomodoroState.part?.endTimestamp;

	// 各変数が未定義の場合は0%として扱う
	if (!options || !partType || !partEndTimestamp) {
		return 0;
	}

	const { workTime, breakTime, longBreakTime } = options;
	let totalSeconds = 0;
	switch (partType) {
		case 'work':
			totalSeconds = workTime * 60;
			break;
		case 'break':
			totalSeconds = breakTime * 60;
			break;
		case 'longBreak':
			totalSeconds = longBreakTime * 60;
			break;
	}

	// パートの全体時間が0の場合は0%として扱う
	if (totalSeconds === 0) {
		return 0;
	}

	const remainingSeconds = calculateRemainingSeconds(pomodoroState);
	const progress = ((totalSeconds - remainingSeconds) / totalSeconds) * 100;
	return Math.min(100, Math.max(0, Math.floor(progress)));
}

// ポモドーロタイマーの状況を絵文字で生成する関数
function generatePomodoroStatusEmojis(percentage) {
	const doneEmoji = '🟩';
	const yetEmoji = '⬜';
	const totalBlocks = 10;
	let emojis = '';
	for (let i = 0; i < totalBlocks; i++) {
		emojis +=
			i < Math.floor(percentage / (100 / totalBlocks)) ? doneEmoji : yetEmoji;
	}
	return {
		emojis: emojis,
		doneCount: Math.floor(percentage / (100 / totalBlocks)),
		yetCount: totalBlocks - Math.floor(percentage / (100 / totalBlocks)),
		totalBlocks: totalBlocks,
	};
}

function updateEmbedDescription(embed, description) {
	if (!embed) {
		return new EmbedBuilder().setDescription(description);
	}

	return EmbedBuilder.from(embed).setDescription(description);
}

// ポモドーロタイマーの状況送信
async function sendPomodoroStatus(interaction, pomodoroState) {
	const statusPercentage = calculateStatusPercentage(pomodoroState);
	const statusEmojis = generatePomodoroStatusEmojis(statusPercentage);
	const remainingSeconds = calculateRemainingSeconds(pomodoroState);
	const remainingText = formatRemainingSeconds(remainingSeconds);

	// 次のステータスの時間を取得
	let nextStatus;
	switch (pomodoroState.part.nextType) {
		case 'work':
			nextStatus = '作業時間';
			break;
		case 'break':
			nextStatus = '休憩時間';
			break;
		case 'longBreak':
			nextStatus = '長い休憩時間';
			break;
	}
	const nowUnixTimeStamp = Math.floor(Date.now() / 1000);
	const nextStatusTimestamp = nowUnixTimeStamp + remainingSeconds;
	const nextStatusDetail = pomodoroState.paused
		? `${nextStatus} (一時停止中 / 残り ${remainingText})`
		: `${nextStatus} (<t:${nextStatusTimestamp}:R>)`;
	const currentPartText =
		pomodoroState.part.type === 'work'
			? '作業時間'
			: pomodoroState.part.type === 'break'
				? '休憩時間'
				: '長い休憩時間';

	const embed = new EmbedBuilder()
		.setTitle('⏱️ポモドーロタイマーの状況')
		.setDescription(
			`- 現在のパート: ${currentPartText}${pomodoroState.paused ? ' (一時停止中)' : ''}\n- 進捗状況: \n\`\`\`\n${statusEmojis.emojis} ${statusPercentage}%\`\`\`\n- 次のパート: ${nextStatusDetail}`,
		)
		.setColor(0x00ff00)
		.setFooter({
			text: '※この表示はBOT全体の導入サーバー数に応じた頻度で自動更新されます。',
		});

	const button = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId('pomodoro_update')
			.setStyle(ButtonStyle.Success)
			.setLabel('更新'),
		new ButtonBuilder()
			.setCustomId('pomodoro_stop')
			.setStyle(ButtonStyle.Danger)
			.setLabel('ポモドーロタイマーを終了する'),
	);

	// 前のステータスメッセージがあった場合は編集し、無い場合や編集に失敗した場合は新規送信する
	let sentMessage = false;
	if (pomodoroState.message.id) {
		try {
			await interaction.channel.messages.edit(pomodoroState.message.id, {
				embeds: [embed],
				components: [button],
			});
			sentMessage = true;
		} catch (err) {
			// 送信失敗は無視
			void err;
		}
	}
	if (!sentMessage) {
		const newStatus = await interaction.channel.send({
			embeds: [embed],
			components: [button],
		});

		// 新しいステータスメッセージのIDを保存
		pomodoroState.message.id = newStatus.id || null;
	}

	// ポモドーロタイマーの進捗状況を保存
	pomodoroState.message.lastProgress = statusEmojis.doneCount;
}

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
	init,
	getPomodoroState,
	clearPomodoroState,
	calculateRemainingSeconds,
	calculateStatusPercentage,
	generatePomodoroStatusEmojis,
	updateEmbedDescription,
	sendPomodoroStatus,
	notifyVoice,
};
