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
	pomodoroState.paused = false;
	pomodoroState.part.endTimestamp = null;
	pomodoroState.part.pausedRemainingSeconds = null;
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

// 一時停止
async function pause(client, interaction) {
	const guildId = interaction.guild.id;
	const pomodoroState = pomodoroUtils.getPomodoroState(client, guildId);

	// ポモドーロタイマーが実行中でない、または既に一時停止中の場合はエラー
	if (!pomodoroState.running || pomodoroState.paused) {
		await interaction.editReply({
			content: pomodoroState.paused
				? 'ポモドーロタイマーはすでに一時停止中です。'
				: '❌ ポモドーロタイマーは実行されていません。',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// 残り時間を凍結してタイマーを一時停止
	pomodoroState.part.pausedRemainingSeconds =
		pomodoroUtils.calculateRemainingSeconds(pomodoroState);
	pomodoroState.part.endTimestamp = null;
	pomodoroState.paused = true;
	timerController.pause(pomodoroState);

	// 次のパートの時間を更新
	const message = await interaction.channel.messages.fetch(
		pomodoroState.message.id,
	);
	if (message) {
		const currentDescription = message.embeds[0]?.description ?? '';
		const baseDescription =
			currentDescription.split('次のパート: ')[0] ?? currentDescription;
		const updatedEmbed = pomodoroUtils.updateEmbedDescription(
			message.embeds[0],
			`${baseDescription}次のパート: \`一時停止中\``,
		);
		message.edit({ embeds: [updatedEmbed] }).catch((err) => {
			void err; // 送信失敗は無視
		});
	}

	await interaction.editReply({
		content: 'ポモドーロタイマーを一時停止しました。',
		flags: MessageFlags.Ephemeral,
	});
}

// 再開
async function resume(client, interaction) {
	const guildId = interaction.guild.id;
	const pomodoroState = pomodoroUtils.getPomodoroState(client, guildId);

	// 一時停止中でない場合はエラー
	if (!pomodoroState.paused) {
		await interaction.editReply({
			content: pomodoroState.running
				? 'ポモドーロタイマーは一時停止中ではありません。'
				: '再開できるポモドーロタイマーがありません。',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (
		pomodoroState.part.pausedRemainingSeconds === null ||
		pomodoroState.part.pausedRemainingSeconds === undefined ||
		pomodoroState.part.pausedRemainingSeconds <= 0
	) {
		await interaction.editReply({
			content: '再開できる残り時間がありません。',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// タイマーを再開
	pomodoroState.part.endTimestamp =
		Date.now() + pomodoroState.part.pausedRemainingSeconds * 1000;
	timerController.resume(client, interaction, pomodoroState);

	// 次のパートの時間を更新
	const message = await interaction.channel.messages.fetch(
		pomodoroState.message.id,
	);
	if (message) {
		const updatedEmbed = pomodoroUtils.updateEmbedDescription(
			message.embeds[0],
			(message.embeds[0]?.description ?? '').replace(
				/<t:(\d+):R>/g,
				`(<t:${Math.floor(pomodoroState.part.endTimestamp / 1000)}:R>)`,
			),
		);
		message.edit({ embeds: [updatedEmbed] }).catch((err) => {
			void err; // 送信失敗は無視
		});
	}

	await interaction.editReply({
		content: 'ポモドーロタイマーを再開しました。',
		flags: MessageFlags.Ephemeral,
	});
}

// 状況確認
async function status(client, interaction) {
	const guildId = interaction.guildId;
	const pomodoroState = pomodoroUtils.getPomodoroState(client, guildId);

	if (!pomodoroState.running && !pomodoroState.paused) {
		await interaction.reply('ポモドーロタイマーは動作していません。');
		return;
	}

	// リアルタイムで残り時間を計算
	const currentRemainingSeconds =
		pomodoroUtils.calculateRemainingSeconds(pomodoroState);
	const remaining =
		typeof currentRemainingSeconds === 'number'
			? `${String(Math.floor(currentRemainingSeconds / 60)).padStart(
					2,
					'0',
				)}:${String(currentRemainingSeconds % 60).padStart(2, '0')}`
			: '取得不可';
	await interaction.reply(
		`現在のサイクル: ${pomodoroState.part.cycle}\n` +
			`状態: ${pomodoroState.paused ? '一時停止中' : pomodoroState.running ? '稼働中' : '停止中'}\n` +
			`残り時間: ${remaining}`,
	);
}

// 終了
async function stop(client, interaction) {
	const guildId = interaction.guild.id;
	const pomodoroState = pomodoroUtils.getPomodoroState(client, guildId);
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	if (!pomodoroState.running && !pomodoroState.paused) {
		await interaction.editReply({
			content: 'ポモドーロタイマーは動作していません。',
		});
		return;
	}

	pomodoroState.running = false;
	pomodoroState.paused = false;
	pomodoroState.part.pausedRemainingSeconds = null;
	timerController.stop(pomodoroState);
	return interaction.editReply({
		content: 'ポモドーロタイマーを終了させました。',
	});
}

module.exports = {
	start,
	pause,
	resume,
	status,
	stop,
};
