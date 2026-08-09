const {
	SlashCommandBuilder,
	MessageFlags,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	PermissionsBitField,
} = require('discord.js');
require('dotenv').config({ quiet: true });
const pomodoro = require('../lib/pomodoro/main.js');
const serverSchema = require('../models/serverSchema.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('pomodoro')
		.setDescription('⏱ポモドーロタイマーを管理します！')
		.addSubcommand((subcommand) =>
			subcommand
				.setName('start')
				.setDescription('ポモドーロタイマーを開始します。')
				.addIntegerOption((option) =>
					option
						.setName('work_time')
						.setDescription('作業時間を設定してください。(単位: 分)')
						.setMinValue(1)
						.setRequired(false),
				)
				.addIntegerOption((option) =>
					option
						.setName('break_time')
						.setDescription('休憩時間を設定してください。(単位: 分)')
						.setMinValue(1)
						.setRequired(false),
				)
				.addIntegerOption((option) =>
					option
						.setName('long_break_time')
						.setDescription('長めの休憩時間を設定してください。(単位: 分)')
						.setMinValue(1)
						.setRequired(false),
				)
				.addIntegerOption((option) =>
					option
						.setName('cycle_count')
						.setDescription(
							'作業時間と休憩時間のセットの、何回に1回長めに休憩するかを設定します。(単位: 回)',
						)
						.setMinValue(1)
						.setRequired(false),
				)
				.addBooleanOption((option) =>
					option
						.setName('voice_notification')
						.setDescription(
							'音声通知を有効にする場合はtrueを指定してください。デフォルトは無効(false)です。',
						)
						.setRequired(false),
				)
				.addIntegerOption((option) =>
					option
						.setName('voice_notification_volume')
						.setDescription('音声通知の音量を設定してください。(1～100%)')
						.setMinValue(1)
						.setMaxValue(100)
						.setRequired(false),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('pause')
				.setDescription('ポモドーロタイマーを一時停止します。'),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('resume')
				.setDescription('ポモドーロタイマーを再開します。'),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('status')
				.setDescription('ポモドーロタイマーの状況を確認します。'),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('stop')
				.setDescription('ポモドーロタイマーを終了します。'),
		)
		.addSubcommandGroup((subcommands) =>
			subcommands
				.setName('settings')
				.setDescription('ポモドーロタイマーのデフォルト設定を変更します。')
				.addSubcommand((subcommand) =>
					subcommand
						.setName('show')
						.setDescription(
							'現在のポモドーロタイマーのデフォルト設定を表示します。',
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('reset')
						.setDescription(
							'ポモドーロタイマーのデフォルト設定をリセットします。',
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('work_time')
						.setDescription('ポモドーロのデフォルトの作業時間を設定します。')
						.addIntegerOption((option) =>
							option
								.setName('work_time')
								.setDescription('作業時間を入力してください。(単位: 分)')
								.setMinValue(1)
								.setRequired(true),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('break_time')
						.setDescription('ポモドーロのデフォルトの休憩時間を設定します。')
						.addIntegerOption((option) =>
							option
								.setName('break_time')
								.setDescription('休憩時間を入力してください。(単位: 分)')
								.setMinValue(1)
								.setRequired(true),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('long_break_time')
						.setDescription(
							'ポモドーロのデフォルトの長めに休憩時間を設定します。',
						)
						.addIntegerOption((option) =>
							option
								.setName('long_break_time')
								.setDescription('長めに休憩時間を入力してください。(単位: 分)')
								.setMinValue(1)
								.setRequired(true),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('cycle_count')
						.setDescription('ポモドーロセッションの回数を設定します。')
						.addIntegerOption((option) =>
							option
								.setName('cycle_count')
								.setDescription(
									'ポモドーロセッションの回数を設定してください。',
								)
								.setMinValue(1)
								.setRequired(false),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('voice_notification')
						.setDescription(
							'ポモドーロの音声通知をデフォルトで有効にするか設定します。',
						)
						.addBooleanOption((option) =>
							option
								.setName('voice_notification')
								.setDescription(
									'音声通知をデフォルトで有効にする場合はtrueを指定してください。デフォルトは無効(false)です。',
								)
								.setRequired(true),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('vc_notification_volume')
						.setDescription('音声通知をする際の音量を設定します。')
						.addIntegerOption((option) =>
							option
								.setName('vc_notification_volume')
								.setDescription('音声通知の音量を設定してください。(1～100%)')
								.setMinValue(1)
								.setMaxValue(100)
								.setRequired(true),
						),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('panel')
				.setDescription('ポモドーロタイマーのパネルを表示します。'),
		),

	run: async (client, interaction) => {
		try {
			let mode = interaction.options.getSubcommand();
			mode === 'settings'
				? (mode = interaction.options.getSubcommandGroup())
				: null;
			const modeType = interaction.options.getSubcommand();

			if (mode === 'start') {
				const workTime = interaction.options.getInteger('work_time');
				const breakTime = interaction.options.getInteger('break_time');
				const longBreakTime = interaction.options.getInteger('long_break_time');
				const cycleCount = interaction.options.getInteger('cycle_count');
				const voiceNotification =
					interaction.options.getBoolean('voice_notification');
				const voiceNotificationVolume = interaction.options.getInteger(
					'voice_notification_volume',
				);

				// ユーザーのVCを取得
				if (!interaction?.member?.voice?.channelId)
					return interaction
						?.reply({
							content: '❌ ボイスチャンネルに参加してください。',
							flags: MessageFlags.Ephemeral,
						})
						.catch((err) => {
							// 送信失敗は無視
							void err;
						});
				const guild_me = interaction?.guild?.members?.cache?.get(
					client?.user?.id,
				);
				if (guild_me?.voice?.channelId) {
					if (
						guild_me?.voice?.channelId !== interaction?.member?.voice?.channelId
					) {
						return interaction
							?.reply({
								content: '❌ 私と同じボイスチャンネルに接続してください。',
								flags: MessageFlags.Ephemeral,
							})
							.catch((err) => {
								// 送信失敗は無視
								void err;
							});
					}
				}

				// ポモドーロタイマー開始
				await pomodoro.start(client, interaction, {
					workTime,
					breakTime,
					longBreakTime,
					cycleCount,
					voiceNotification,
					voiceNotificationVolume,
				});
			} else if (mode === 'pause') {
				await interaction.deferReply({ flags: MessageFlags.Ephemeral });

				await pomodoro.pause(client, interaction);
			} else if (mode === 'resume') {
				await interaction.deferReply({ flags: MessageFlags.Ephemeral });

				await pomodoro.resume(client, interaction);
			} else if (mode === 'status') {
				await pomodoro.status(client, interaction);
			} else if (mode === 'stop') {
				await pomodoro.stop(client, interaction);
			} else if (mode === 'settings') {
				// 権限チェック
				if (
					!interaction.member.permissions.has(
						PermissionsBitField.Flags.ManageGuild,
					)
				)
					return interaction
						.reply({
							content:
								'❌ このコマンドを実行する権限がありません。このコマンドを実行するためには「サーバー管理」権限が必要です。',
							flags: MessageFlags.Ephemeral,
						})
						.catch((err) => {
							// 送信失敗は無視
							void err;
						});

				serverSchema.findById(interaction.guild.id).then((serverData) => {
					// 一部のコマンドは別処理
					if (modeType === 'show') {
						const embed = new EmbedBuilder()
							.setTitle('ℹ️ ポモドーロタイマーのデフォルト設定')
							.setDescription(
								`- 作業時間: ${serverData.pomodoro.defaultWorkTime}分
- 休憩時間: ${serverData.pomodoro.defaultBreakTime}分
- 長めの休憩時間: ${serverData.pomodoro.defaultLongBreakTime}分
- セッション数: ${serverData.pomodoro.defaultCycleCount}回
- 音声通知: ${serverData.pomodoro.defaultVoiceNotification ? '有効' : '無効'}
- 音声通知の音量: ${serverData.pomodoro.defaultVoiceNotificationVolume}%`,
							)
							.setTimestamp();
						return interaction.reply({ embeds: [embed] });
					} else if (modeType === 'reset') {
						// デフォルト設定をリセット
						serverData.pomodoro.defaultWorkTime = 25;
						serverData.pomodoro.defaultBreakTime = 5;
						serverData.pomodoro.defaultLongBreakTime = 15;
						serverData.pomodoro.defaultCycleCount = 4;
						serverData.pomodoro.defaultVoiceNotification = false;
						serverData.pomodoro.defaultVoiceNotificationVolume = 50;

						return serverData.save().then(() => {
							return interaction.reply({
								content:
									'✅ ポモドーロタイマーのデフォルト設定をリセットしました。',
							});
						});
					}

					if (modeType === 'work_time') {
						serverData.pomodoro.defaultWorkTime =
							interaction.options.getInteger('work_time');
					} else if (modeType === 'break_time') {
						serverData.pomodoro.defaultBreakTime =
							interaction.options.getInteger('break_time');
					} else if (modeType === 'long_break_time') {
						serverData.pomodoro.defaultLongBreakTime =
							interaction.options.getInteger('long_break_time');
					} else if (modeType === 'cycle_count') {
						serverData.pomodoro.defaultCycleCount =
							interaction.options.getInteger('cycle_count');
					} else if (modeType === 'voice_notification') {
						serverData.pomodoro.defaultVoiceNotification =
							interaction.options.getBoolean('voice_notification');
					} else if (modeType === 'vc_notification_volume') {
						serverData.pomodoro.defaultVoiceNotificationVolume =
							interaction.options.getInteger('vc_notification_volume');
					}

					serverData.save().then(() => {
						// データベースの更新が成功した場合
						return interaction.reply({
							content: `✅ ポモドーロタイマーのデフォルト設定を更新しました。現在の設定は次の通りです。
- 作業時間: ${serverData.pomodoro.defaultWorkTime}分
- 休憩時間: ${serverData.pomodoro.defaultBreakTime}分
- 長めの休憩時間: ${serverData.pomodoro.defaultLongBreakTime}分
- セッション数: ${serverData.pomodoro.defaultCycleCount}回
- 音声通知: ${serverData.pomodoro.defaultVoiceNotification ? '有効' : '無効'}
- 音声通知の音量: ${serverData.pomodoro.defaultVoiceNotificationVolume}%`,
						});
					});
				});
			} else if (mode === 'panel') {
				const serverData = await serverSchema.findById(interaction.guild.id);
				const pomodoroServerConfig = serverData.pomodoro;

				const embed = new EmbedBuilder()
					.setTitle('⏱ ポモドーロタイマー')
					.setDescription('※再開は一時的子中にのみ使用できます。');
				const buttons = new ActionRowBuilder().addComponents(
					new ButtonBuilder()
						.setCustomId('pomodoro_start')
						.setLabel('開始')
						.setStyle(ButtonStyle.Success),
					new ButtonBuilder()
						.setCustomId('pomodoro_pause')
						.setLabel('一時停止')
						.setStyle(ButtonStyle.Primary),
					new ButtonBuilder()
						.setCustomId('pomodoro_resume')
						.setLabel('再開')
						.setStyle(ButtonStyle.Primary),
					new ButtonBuilder()
						.setCustomId('pomodoro_stop_from_panel')
						.setLabel('終了')
						.setStyle(ButtonStyle.Danger),
					new ButtonBuilder()
						.setCustomId('pomodoro_settings_show')
						.setLabel('設定表示')
						.setStyle(ButtonStyle.Secondary),
				);
				return interaction.reply({ embeds: [embed], components: [buttons] });
			}
		} catch (err) {
			const errorNotification = require('../lib/errorNotification.js');
			errorNotification(client, interaction, err);
		}
	},
};
