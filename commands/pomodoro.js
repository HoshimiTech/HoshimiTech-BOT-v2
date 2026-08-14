const {
	SlashCommandBuilder,
	MessageFlags,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	PermissionsBitField,
	ContainerBuilder,
	TextDisplayBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
} = require('discord.js');
require('dotenv').config({ quiet: true });
const path = require('path');
const dirname = require('../lib/defineDirname.js');
const pomodoro = require(path.join(dirname, 'lib/pomodoro/main.js'));
const serverSchema = require(path.join(dirname, 'models/serverSchema.js'));

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
						.setDescription('長い休憩時間を設定してください。(単位: 分)')
						.setMinValue(1)
						.setRequired(false),
				)
				.addIntegerOption((option) =>
					option
						.setName('times_until_long_break')
						.setDescription(
							'作業時間と休憩時間のセットの、何回に1回長い休憩時間を設けるかを設定します。(単位: 回)',
						)
						.setMinValue(1)
						.setRequired(false),
				)
				.addBooleanOption((option) =>
					option
						.setName('voice_notification')
						.setDescription(
							'ボイスチャンネルでの音声による通知を行うか設定します。音声通知を有効にする場合はtrueを指定してください。',
						)
						.setRequired(false),
				)
				.addIntegerOption((option) =>
					option
						.setName('voice_notification_volume')
						.setDescription(
							'ボイスチャンネルでの通知の際の音量を設定します。(1～100%)',
						)
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
		.addSubcommand((subcommand) =>
			subcommand
				.setName('settings')
				.setDescription(
					'ポモドーロタイマーのデフォルト設定を確認・変更します。',
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('panel')
				.setDescription('ポモドーロタイマーの操作パネルを表示します。'),
		),

	run: async (client, interaction) => {
		try {
			const subcommand = interaction.options.getSubcommand();

			if (subcommand === 'start') {
				const workTime = interaction.options.getInteger('work_time');
				const breakTime = interaction.options.getInteger('break_time');
				const longBreakTime = interaction.options.getInteger('long_break_time');
				const timesUntilLongBreak = interaction.options.getInteger(
					'times_until_long_break',
				);
				const voiceNotification =
					interaction.options.getBoolean('voice_notification');
				const voiceNotificationVolume = interaction.options.getInteger(
					'voice_notification_volume',
				);

				// ユーザーのVCを取得
				if (!interaction?.member?.voice?.channelId)
					return interaction
						?.reply({
							content: '❌ ボイスチャンネルに接続してから実行してください。',
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
								content: '❌ BOTと同じボイスチャンネルに接続してください。',
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
					timesUntilLongBreak,
					voiceNotification,
					voiceNotificationVolume,
				});
			} else if (subcommand === 'pause') {
				await interaction.deferReply({ flags: MessageFlags.Ephemeral });

				await pomodoro.pause(client, interaction);
			} else if (subcommand === 'resume') {
				await interaction.deferReply({ flags: MessageFlags.Ephemeral });

				await pomodoro.resume(client, interaction);
			} else if (subcommand === 'status') {
				await pomodoro.status(client, interaction);
			} else if (subcommand === 'stop') {
				await pomodoro.stop(client, interaction);
			} else if (subcommand === 'settings') {
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
					const pomodoroSettings = serverData.pomodoro;
					// 埋め込みの準備
					const labels = {
						workTime: {
							label: '作業時間:\n```\nDATA分\n```',
							value: pomodoroSettings.interval.workTime,
						},
						breakTime: {
							label: '休憩時間:\n```\nDATA分\n```',
							value: pomodoroSettings.interval.breakTime,
						},
						longBreakTime: {
							label: '長い休憩時間:\n```\nDATA分\n```',
							value: pomodoroSettings.interval.longBreakTime,
						},
						timesUntilLongBreak: {
							label: '長い休憩までの回数:\n```\nDATA回\n```',
							value: pomodoroSettings.timesUntilLongBreak,
						},
						voiceNotificationStatus: {
							label: 'ボイスチャンネルでの音声による通知:\n```\nDATA\n```',
							value: pomodoroSettings.voiceNotification.status
								? '✅ 通知する'
								: '❌ 通知しない',
						},
						voiceNotificationVolume: {
							label: 'ボイスチャンネルでの通知の際の音量:\n```\nDATA%\n```',
							value: pomodoroSettings.voiceNotification.volume,
						},
						voiceNotificationMessageWorkTime: {
							label: '作業時間のボイス通知メッセージ:\n```\nDATA\n```',
							value:
								pomodoroSettings.voiceNotification.message.workTime ||
								'作業時間が始まります。集中して取り組んでください。',
						},
						voiceNotificationMessageBreakTime: {
							label: '休憩時間のボイス通知メッセージ:\n```\nDATA\n```',
							value:
								pomodoroSettings.voiceNotification.message.breakTime ||
								'休憩時間が始まります。リラックスして休んでください。',
						},
						voiceNotificationMessageLongBreakTime: {
							label: '長い休憩時間のボイス通知メッセージ:\n```\nDATA\n```',
							value:
								pomodoroSettings.voiceNotification.message.longBreakTime ||
								'長い休憩時間が始まります。しっかりとリフレッシュしてください。',
						},
						voiceNotificationMessageStopPomodoro: {
							label: 'ポモドーロ終了時のボイス通知メッセージ:\n```\nDATA\n```',
							value:
								pomodoroSettings.voiceNotification.message.stopPomodoro ||
								'ポモドーロタイマーが終了しました。お疲れ様でした！',
						},
					};
					const sections = [];
					for (const key in labels) {
						const value = labels[key].value;
						sections.push(
							new SectionBuilder()
								.addTextDisplayComponents(
									new TextDisplayBuilder().setContent(
										`- ${labels[key].label.replace('DATA', value)}`,
									),
								)
								.setButtonAccessory(
									new ButtonBuilder()
										.setCustomId(`pomodoro_settings_edit_${key}`)
										.setLabel('変更')
										.setStyle(ButtonStyle.Secondary),
								),
						);
					}
					const separator = new SeparatorBuilder()
						// 仕切り線を表示するか(デフォルト: true)
						.setDivider(true)
						// 仕切り線の前後の余白の大きさを設定
						.setSpacing(SeparatorSpacingSize.Large);
					const embed = new ContainerBuilder()
						.addTextDisplayComponents(
							new TextDisplayBuilder().setContent(
								'## ℹ️ ポモドーロタイマーのデフォルト設定',
							),
						)
						.addSectionComponents(sections.slice(0, 3))
						.addSeparatorComponents(separator)
						.addSectionComponents(sections.slice(3, 4))
						.addSeparatorComponents(separator)
						.addSectionComponents(sections.slice(4, 6))
						.addSeparatorComponents(separator)
						.addSectionComponents(sections.slice(6, 11));
					// ボタンの準備
					const button = new ActionRowBuilder().addComponents(
						new ButtonBuilder()
							.setCustomId('pomodoro_settings_reset')
							.setLabel('全て初期化する')
							.setStyle(ButtonStyle.Danger),
					);

					return interaction.reply({
						components: [embed, button],
						flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
					});
				});
			} else if (subcommand === 'panel') {
				const embed = new EmbedBuilder()
					.setTitle('⏱ ポモドーロタイマー')
					.setDescription('※再開は一時停止中にのみ使用できます。');
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
						.setLabel('設定の表示')
						.setStyle(ButtonStyle.Secondary),
				);
				return interaction.reply({ embeds: [embed], components: [buttons] });
			}
		} catch (err) {
			const errorNotification = require(
				path.join(dirname, 'lib/errorNotification.js'),
			);
			errorNotification(client, interaction, err);
		}
	},
};
