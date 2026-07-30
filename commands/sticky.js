const {
	SlashCommandBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	LabelBuilder,
} = require('discord.js');
const serverSchema = require('../models/serverSchema.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('sticky')
		.setDescription('ピン留めメッセージを作成/削除します')
		.addSubcommand((subcommand) =>
			subcommand
				.setName('on')
				.setDescription('このチャンネルでピン留めを有効にします'),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('clear')
				.setDescription('このチャンネルで有効なピン留めを削除・無効化します。'),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName('off')
				.setDescription(
					'このサーバーの全てのチャンネルで有効なピン留めを削除・無効化します',
				),
		),

	run: async (client, interaction) => {
		try {
			const subcommand = await interaction.options.getSubcommand();

			if (subcommand === 'on') {
				serverSchema
					.findById(interaction.guild.id)
					.then(async (serverData) => {
						if (
							serverData.sticky.channels.find(
								(c) => c._id === interaction.channel.id,
							)
						)
							return interaction.reply({
								content:
									'このチャンネルで既にピン留めが有効になっています。\n一度`/sticky clear`を実行してピン留めを解除してから再度お試しください。',
								flags: MessageFlags.Ephemeral,
							});

						// モーダルの表示
						const modal = new ModalBuilder()
							.setCustomId('sticky')
							.setTitle('ピン留めの内容を設定');
						const titleInput = new LabelBuilder()
							.setLabel('タイトル (任意)')
							.setDescription(
								'ピン留めするメッセージのタイトルを入力してください。',
							)
							.setTextInputComponent(
								new TextInputBuilder()
									.setCustomId('stickyTitle')
									.setStyle(TextInputStyle.Short)
									.setPlaceholder('ここにメッセージを入力')
									.setMinLength(0)
									.setMaxLength(256)
									.setRequired(false),
							);
						const bodyInput = new LabelBuilder()
							.setLabel('本文 (必須)')
							.setDescription('ピン留めをするメッセージを入力してください。')
							.setTextInputComponent(
								new TextInputBuilder()
									.setCustomId('stickyBody')
									.setStyle(TextInputStyle.Paragraph)
									.setPlaceholder('ここにメッセージを入力')
									.setMinLength(0)
									.setMaxLength(400)
									.setRequired(true),
							);
						const imageURLInput = new LabelBuilder()
							.setLabel('画像 (任意)')
							.setDescription(
								'ピン留めする画像がある場合は入力してください。無効なURLは無視されます。',
							)
							.setTextInputComponent(
								new TextInputBuilder()
									.setCustomId('stickyImageURL')
									.setStyle(TextInputStyle.Short)
									.setPlaceholder('ここに画像のURLを入力')
									.setRequired(false),
							);

						modal.addLabelComponents(titleInput, bodyInput, imageURLInput);

						await interaction.showModal(modal);
					})
					.catch((err) => {
						const errorNotification = require('../lib/errorNotification.js');
						errorNotification(client, interaction, err);
					});
			} else if (subcommand === 'clear') {
				serverSchema
					.findById(interaction.guild.id)
					.then(async (serverData) => {
						// 古いメッセージを削除出来そうならする
						try {
							const stickyChannel = serverData.sticky.channels.find(
								(c) => c._id === interaction.channel.id,
							);
							const oldMessage = await interaction.channel.messages.fetch(
								stickyChannel.stickyMessage.oldMessageId,
							);
							if (oldMessage) {
								await oldMessage.delete();
							}
						} catch (err) {
							// 古いメッセージが見つからなかったり削除できない場合は、そのままメッセージ送信
							void err;
						}

						// このチャンネルのデータを削除
						serverData.sticky.channels = serverData.sticky.channels.filter(
							(c) => c._id !== interaction.channel.id,
						);
						// 全てのチャンネルで無効化しているならoffに
						if (!serverData.sticky.channels.length)
							serverData.sticky.status = false;

						// 保存する
						await serverData
							.save()
							.then(() => {
								return interaction.reply({
									content:
										'✅ このチャンネルで有効な固定メッセージの削除に成功しました。',
									flags: MessageFlags.Ephemeral,
								});
							})
							.catch((err) => {
								const errorNotification = require('../lib/errorNotification.js');
								errorNotification(client, interaction, err);

								const button = new ActionRowBuilder().addComponents(
									new ButtonBuilder()
										.setLabel('再招待はこちらから')
										.setStyle(ButtonStyle.Link)
										.setURL(
											`https://discord.com/oauth2/authorize?client_id=${client.user.id}`,
										),
								);
								return interaction.reply({
									content:
										'ピン留め作成時に、DB更新エラーが発生しました。お手数ですが、BOTを一度サーバーからkickしていただき、再招待をお願い致します。',
									components: [button],
									flags: MessageFlags.Ephemeral,
								});
							});
					})
					.catch((err) => {
						const errorNotification = require('../lib/errorNotification.js');
						errorNotification(client, interaction, err);

						const button = new ActionRowBuilder().addComponents(
							new ButtonBuilder()
								.setLabel('再招待はこちらから')
								.setStyle(ButtonStyle.Link)
								.setURL(
									`https://discord.com/oauth2/authorize?client_id=${client.user.id}`,
								),
						);
						return interaction.reply({
							content:
								'ピン留め作成時に、DB更新エラーが発生しました。お手数ですが、BOTを一度サーバーからkickしていただき、再招待をお願い致します。',
							components: [button],
							flags: MessageFlags.Ephemeral,
						});
					});
			} else if (subcommand === 'off') {
				serverSchema
					.findById(interaction.guild.id)
					.then(async (serverData) => {
						// このチャンネルのデータを削除
						serverData.sticky.status = false;
						serverData.sticky.channels = [];

						// 保存する
						await serverData
							.save()
							.then(() => {
								return interaction.reply({
									content:
										'全チャンネルで有効な固定メッセージの削除に成功しました。\nなお、このコマンドを使用した場合はメッセージの自動削除が行われませんので、不要な場合はご自身で削除してください。',
									flags: MessageFlags.Ephemeral,
								});
							})
							.catch((err) => {
								const errorNotification = require('../lib/errorNotification.js');
								errorNotification(client, interaction, err);

								const button = new ActionRowBuilder().addComponents(
									new ButtonBuilder()
										.setLabel('再招待はこちらから')
										.setStyle(ButtonStyle.Link)
										.setURL(
											`https://discord.com/oauth2/authorize?client_id=${client.user.id}`,
										),
								);
								return interaction.reply({
									content:
										'ピン留め作成時に、DB更新エラーが発生しました。お手数ですが、BOTを一度サーバーからkickしていただき、再招待をお願い致します。',
									components: [button],
									flags: MessageFlags.Ephemeral,
								});
							});
					})
					.catch((err) => {
						const errorNotification = require('../lib/errorNotification.js');
						errorNotification(client, interaction, err);

						const button = new ActionRowBuilder().addComponents(
							new ButtonBuilder()
								.setLabel('再招待はこちらから')
								.setStyle(ButtonStyle.Link)
								.setURL(
									`https://discord.com/oauth2/authorize?client_id=${client.user.id}`,
								),
						);
						return interaction.reply({
							content:
								'ピン留め作成時に、DB更新エラーが発生しました。お手数ですが、BOTを一度サーバーからkickしていただき、再招待をお願い致します。',
							components: [button],
							flags: MessageFlags.Ephemeral,
						});
					});
			} else {
				await interaction.reply({
					content:
						'意図していないサブコマンドを検知しました。お手数ですがサポートサーバーまでお問い合わせください。',
					flags: MessageFlags.Ephemeral,
				});
			}
		} catch (err) {
			const errorNotification = require('../lib/errorNotification.js');
			errorNotification(client, interaction, err);
		}
	},
};
