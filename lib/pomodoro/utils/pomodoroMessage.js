const {
	EmbedBuilder,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder,
} = require('discord.js');
const path = require('path');
const dirname = require('../../defineDirname.js');
const { calculateRemainingSeconds, calculateStatusPercentage } = require(
	path.join(dirname, 'lib/pomodoro/utils/pomodoroCalculator.js'),
);

function formatRemainingSeconds(seconds) {
	const safeSeconds = Math.max(0, Math.floor(seconds));
	return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(
		safeSeconds % 60,
	).padStart(2, '0')}`;
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

module.exports = {
	formatRemainingSeconds,
	generatePomodoroStatusEmojis,
	updateEmbedDescription,
	sendPomodoroStatus,
};
