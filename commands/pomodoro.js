const {
	SlashCommandBuilder,
	MessageFlags,
	EmbedBuilder,
	PermissionsBitField,
} = require('discord.js');
require('dotenv').config({ quiet: true });
const pomodoro = require('../lib/pomodoro/main.js');
const profileSchema = require('../models/profileSchema.js');

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
		),

	run: async (client, interaction) => {
		try {
			let mode = interaction.options.getSubcommand();
			mode !== 'start' && mode !== 'status' && mode !== 'stop'
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

				profileSchema.findById(interaction.guild.id).then((data) => {
					// 一部のコマンドは別処理
					if (modeType === 'show') {
						const embed = new EmbedBuilder()
							.setTitle('ポモドーロタイマーのデフォルト設定')
							.setDescription(
								`- 作業時間: ${data.pomodoro.defaultWorkTime}分
- 休憩時間: ${data.pomodoro.defaultBreakTime}分
- 長めの休憩時間: ${data.pomodoro.defaultLongBreakTime}分
- セッション数: ${data.pomodoro.defaultCycleCount}回
- 音声通知: ${data.pomodoro.defaultVoiceNotification ? '有効' : '無効'}
- 音声通知の音量: ${data.pomodoro.defaultVoiceNotificationVolume}%`,
							)
							.setTimestamp();
						return interaction.reply({ embeds: [embed] });
					} else if (modeType === 'reset') {
						// デフォルト設定をリセット
						data.pomodoro.defaultWorkTime = 25;
						data.pomodoro.defaultBreakTime = 5;
						data.pomodoro.defaultLongBreakTime = 15;
						data.pomodoro.defaultCycleCount = 4;
						data.pomodoro.defaultVoiceNotification = false;
						data.pomodoro.defaultVoiceNotificationVolume = 50;

						return data.save().then(() => {
							return interaction.reply({
								content:
									'✅ ポモドーロタイマーのデフォルト設定をリセットしました。',
							});
						});
					}

					if (modeType === 'work_time') {
						data.pomodoro.defaultWorkTime =
							interaction.options.getInteger('work_time');
					} else if (modeType === 'break_time') {
						data.pomodoro.defaultBreakTime =
							interaction.options.getInteger('break_time');
					} else if (modeType === 'long_break_time') {
						data.pomodoro.defaultLongBreakTime =
							interaction.options.getInteger('long_break_time');
					} else if (modeType === 'cycle_count') {
						data.pomodoro.defaultCycleCount =
							interaction.options.getInteger('cycle_count');
					} else if (modeType === 'voice_notification') {
						data.pomodoro.defaultVoiceNotification =
							interaction.options.getBoolean('voice_notification');
					} else if (modeType === 'vc_notification_volume') {
						data.pomodoro.defaultVoiceNotificationVolume =
							interaction.options.getInteger('vc_notification_volume');
					}

					data.save().then(() => {
						// データベースの更新が成功した場合
						return interaction.reply({
							content: `✅ ポモドーロタイマーのデフォルト設定を更新しました。現在の設定は次の通りです。
- 作業時間: ${data.pomodoro.defaultWorkTime}分
- 休憩時間: ${data.pomodoro.defaultBreakTime}分
- 長めの休憩時間: ${data.pomodoro.defaultLongBreakTime}分
- セッション数: ${data.pomodoro.defaultCycleCount}回
- 音声通知: ${data.pomodoro.defaultVoiceNotification ? '有効' : '無効'}
- 音声通知の音量: ${data.pomodoro.defaultVoiceNotificationVolume}%`,
						});
					});
				});
			}
		} catch (err) {
			const errorNotification = require('../lib/errorNotification.js');
			errorNotification(client, interaction, err);
		}
	},
};
