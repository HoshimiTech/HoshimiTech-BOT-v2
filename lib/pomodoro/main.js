// ポモドーロタイマーの機能
// VCにBOT以外誰も居なくなった場合は中止
// pomodoro.start(), pomodoro.status(), pomodoro.stop() で操作

const pomodoroUtils = require('./utils.js');
const timerController = require('./timerController.js');
const serverSchema = require('../../models/serverSchema.js');
const { EmbedBuilder, MessageFlags } = require('discord.js');

async function start(client, interaction, options) {
	const guildId = interaction.guildId;
	const pomodoroState = pomodoroUtils.getPomodoroState(client, guildId);

	if (pomodoroState.running) {
		await interaction.reply('すでにポモドーロタイマーが実行されています。');
		return;
	}
	pomodoroState.running = true;
	pomodoroState.part.endTimestamp = null;
	pomodoroState.part.cycle = 0;
	pomodoroState.config.vcId = interaction.member?.voice?.channelId ?? null;
	pomodoroState.config.options = options;

	// オプションが未入力の場合はデフォルト値を設定
	try {
		const serverData = await serverSchema.findById(guildId);
		if (!pomodoroState.config.options.workTime) {
			pomodoroState.config.options.workTime =
				serverData.pomodoro.defaultWorkTime;
		}
		if (!pomodoroState.config.options.breakTime) {
			pomodoroState.config.options.breakTime =
				serverData.pomodoro.defaultBreakTime;
		}
		if (!pomodoroState.config.options.longBreakTime) {
			pomodoroState.config.options.longBreakTime =
				serverData.pomodoro.defaultLongBreakTime;
		}
		if (!pomodoroState.config.options.cycleCount) {
			pomodoroState.config.options.cycleCount =
				serverData.pomodoro.defaultCycleCount;
		}
		if (!pomodoroState.config.options.voiceNotification) {
			pomodoroState.config.options.voiceNotification =
				serverData.pomodoro.defaultVoiceNotification;
		}
		if (!pomodoroState.config.options.voiceNotificationVolume) {
			pomodoroState.config.options.voiceNotificationVolume =
				serverData.pomodoro.defaultVoiceNotificationVolume;
		}
	} catch (err) {
		console.error(
			'データベースからのポモドーロタイマーのデフォルト値取得に失敗:',
			err,
		);
	}

	const {
		workTime,
		breakTime,
		longBreakTime,
		cycleCount,
		voiceNotification,
		voiceNotificationVolume,
	} = pomodoroState.config.options;

	await interaction.reply(
		'ポモドーロタイマーを開始します！\n`/pomodoro stop`で終了できます。',
	);

	while (pomodoroState.running) {
		pomodoroState.part.cycle++;
		// 作業時間
		const workEndTime = Date.now() + workTime * 60 * 1000;
		pomodoroState.part.endTimestamp = workEndTime;
		pomodoroState.part.type = 'work';
		pomodoroState.part.nextType =
			pomodoroState.part.cycle % cycleCount === 0 ? 'longBreak' : 'break';
		await pomodoroUtils.sendPomodoroStatus(interaction, pomodoroState);
		if (voiceNotification) {
			await pomodoroUtils.notifyVoice(
				interaction,
				'startWorking',
				voiceNotificationVolume,
			);
		}
		await timerController.start(client, interaction, pomodoroState);

		if (!pomodoroState.running) break;

		// 休憩時間
		if (pomodoroState.part.cycle % cycleCount === 0) {
			const longBreakEndTime = Date.now() + longBreakTime * 60 * 1000;
			pomodoroState.part.endTimestamp = longBreakEndTime;
			pomodoroState.part.type = 'longBreak';
			pomodoroState.part.nextType = 'work';
			await pomodoroUtils.sendPomodoroStatus(interaction, pomodoroState);
			if (voiceNotification) {
				await pomodoroUtils.notifyVoice(
					interaction,
					'startLongBreaking',
					voiceNotificationVolume,
				);
			}
			await timerController.start(client, interaction, pomodoroState);
		} else {
			const breakEndTime = Date.now() + breakTime * 60 * 1000;
			pomodoroState.part.endTimestamp = breakEndTime;
			pomodoroState.part.type = 'break';
			pomodoroState.part.nextType = 'work';
			await pomodoroUtils.sendPomodoroStatus(interaction, pomodoroState);
			if (voiceNotification) {
				await pomodoroUtils.notifyVoice(
					interaction,
					'startBreaking',
					voiceNotificationVolume,
				);
			}
			await timerController.start(client, interaction, pomodoroState);
		}
		if (!pomodoroState.running) break;
	}

	if (!pomodoroState.running) {
		let sentMessage = false;
		const embed = new EmbedBuilder()
			.setTitle('⏱️ポモドーロタイマーの状況')
			.setDescription(
				pomodoroState.part.type === 'cancelled'
					? 'VCに誰も1時間戻らなかったため、ポモドーロタイマーを中止しました。'
					: 'ポモドーロタイマーが終了しました。お疲れ様でした！',
			)
			.setColor(0x505050);
		if (pomodoroState.message.id) {
			try {
				await interaction.channel.messages.edit(pomodoroState.message.id, {
					embeds: [embed],
					components: [],
				});
				sentMessage = true;
			} catch (err) {
				// 送信失敗は無視
				void err;
			}
		}
		if (!sentMessage) {
			await interaction.channel.send({
				embeds: [embed],
				components: [],
			});
		}

		if (voiceNotification && pomodoroState.part.type !== 'cancelled') {
			await pomodoroUtils.notifyVoice(
				interaction,
				'stopPomodoro',
				voiceNotificationVolume,
			);
		}

		await pomodoroUtils.clearPomodoroState(client, guildId);
	}
}

// 状況確認
async function status(client, interaction) {
	const guildId = interaction.guildId;
	const pomodoroState = pomodoroUtils.getPomodoroState(client, guildId);

	if (!pomodoroState.running) {
		await interaction.reply('ポモドーロタイマーは動作していません。');
		return;
	}

	// リアルタイムで残り時間を計算
	const currentRemainingSeconds = pomodoroUtils.calculateRemainingSeconds(
		pomodoroState.part.endTimestamp,
	);
	const remaining =
		typeof currentRemainingSeconds === 'number'
			? `${String(Math.floor(currentRemainingSeconds / 60)).padStart(
					2,
					'0',
				)}:${String(currentRemainingSeconds % 60).padStart(2, '0')}`
			: '取得不可';
	await interaction.reply(
		`現在のサイクル: ${pomodoroState.part.cycle}\n` +
			`状態: ${pomodoroState.running ? '稼働中' : '停止中'}\n` +
			`残り時間: ${remaining}`,
	);
}

// 終了
async function stop(client, interaction) {
	const guildId = interaction.guild.id;
	const pomodoroState = pomodoroUtils.getPomodoroState(client, guildId);
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	if (!pomodoroState.running) {
		await interaction.editReply({
			content: 'ポモドーロタイマーは動作していません。',
		});
		return;
	}

	pomodoroState.running = false;
	return interaction.editReply({
		content: 'ポモドーロタイマーを終了させました。',
	});
}

module.exports = {
	start,
	status,
	stop,
};
