const {
	InteractionType,
	ApplicationCommandType,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	EmbedBuilder,
	ButtonStyle,
	ButtonBuilder,
	MessageFlags,
	LabelBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} = require('discord.js');
const fs = require('fs');
const serverSchema = require('../models/serverSchema.js');
const pomodoro = require('../lib/pomodoro/main.js');
const fetch = (...args) =>
	import('node-fetch').then(({ default: fetch }) => fetch(...args));
// twemoji-parserから判定用の正規表現を取得(gオプション付き)
const twemojiRegex = require('twemoji-parser/dist/lib/regex').default;

module.exports = async (client, interaction) => {
	try {
		// DMでの「DM starBoard」機能の、メッセージ削除は例外処理
		if (
			interaction?.type === InteractionType.MessageComponent &&
			interaction?.customId === 'cancel'
		) {
			return interaction.message.delete();
		}

		if (!interaction?.guild) {
			return interaction?.reply({
				content:
					'❌ このBOTはサーバー内でのみ動作します。\nお手数をおかけしますが、サーバー内でご利用ください。',
				flags: MessageFlags.Ephemeral,
			});
		} else {
			// スラッシュコマンド応答
			if (interaction?.type === InteractionType.ApplicationCommand) {
				fs.readdir('./commands', (err, files) => {
					if (err) throw err;
					files.forEach(async (f) => {
						const props = require(`../commands/${f}`);
						const propsJson = props.data.toJSON();

						//propsJsonがundefinedだった場合は、スラッシュコマンドとして、タイプを1にする
						if (propsJson.type === undefined) {
							propsJson.type = ApplicationCommandType.ChatInput;
						}

						if (
							interaction.commandName === propsJson.name &&
							interaction.commandType === propsJson.type
						) {
							try {
								return props.run(client, interaction);
							} catch (err) {
								await interaction?.reply({
									content: '❌ 何らかのエラーが発生しました。',
									flags: MessageFlags.Ephemeral,
								});
								throw new Error(err.message || String(err), { cause: err });
							}
						}
					});
				});
			}

			// ボタン応答
			if (interaction?.type === InteractionType.MessageComponent) {
				switch (interaction?.customId) {
					case 'server_register': {
						const modal = new ModalBuilder()
							.setTitle('サーバー登録')
							.setCustomId('ask_register_id');
						const serverIdInput = new LabelBuilder()
							.setLabel('サーバーID')
							.setDescription(
								'登録するサーバーのサーバーIDを入力してください。',
							)
							.setTextInputComponent(
								new TextInputBuilder()
									.setCustomId('register_id')
									.setStyle(TextInputStyle.Short)
									.setMaxLength(20) //snowflakeの文字数的に700年後まで使えれば大丈夫だろうという事で20文字以内
									.setMinLength(15)
									.setRequired(true),
							);

						modal.addLabelComponents(serverIdInput);
						return interaction.showModal(modal);
					}
					case 'server_unregister': {
						const modal = new ModalBuilder()
							.setTitle('サーバー登録解除')
							.setCustomId('ask_unregister_id');
						const serverIdInput = new LabelBuilder()
							.setLabel('サーバーID')
							.setDescription(
								'登録解除するサーバーのサーバーIDを入力してください。',
							)
							.setTextInputComponent(
								new TextInputBuilder()
									.setCustomId('unregister_id')
									.setStyle(TextInputStyle.Short)
									.setMaxLength(20) //snowflakeの文字数的に700年後まで使えれば大丈夫だろうという事で20文字以内
									.setMinLength(15)
									.setRequired(true),
							);

						modal.addLabelComponents(serverIdInput);
						return interaction.showModal(modal);
					}
					case 'debug': {
						const modal = new ModalBuilder()
							.setTitle('デバッグするサーバーIDを入力')
							.setCustomId('ask_server_id');
						const serverIdInput = new LabelBuilder()
							.setLabel('サーバーID')
							.setDescription('デバッグするサーバーIDを入力してください。')
							.setTextInputComponent(
								new TextInputBuilder()
									.setCustomId('server_id')
									.setStyle(TextInputStyle.Short)
									.setMaxLength(20) //snowflakeの文字数的に700年後まで使えれば大丈夫だろうという事で20文字以内
									.setMinLength(15)
									.setRequired(false),
							);

						modal.addLabelComponents(serverIdInput);
						return interaction.showModal(modal);
					}
					case 'data_control': {
						const modal = new ModalBuilder()
							.setTitle('変数名と操作を指定')
							.setCustomId('data_control_form');
						const variableName = new LabelBuilder()
							.setLabel('変数名')
							.setDescription('追加・削除する変数名を入力してください。')
							.setTextInputComponent(
								new TextInputBuilder()
									.setCustomId('variable_name')
									.setStyle(TextInputStyle.Short)
									.setMaxLength(30)
									.setMinLength(1)
									.setRequired(true),
							);
						const variableValue = new LabelBuilder()
							.setLabel('変数内容')
							.setDescription(
								'追加する場合は内容を、削除する場合は空欄にしてください。',
							)
							.setTextInputComponent(
								new TextInputBuilder()
									.setCustomId('variable_value')
									.setStyle(TextInputStyle.Short)
									.setMaxLength(30)
									.setMinLength(1)
									.setRequired(false),
							);
						const variableAction = new LabelBuilder()
							.setLabel('操作')
							.setDescription('変数を追加するか削除するかを指定してください。')
							.setStringSelectMenuComponent(
								new StringSelectMenuBuilder()
									.setCustomId('how_to_variable')
									.setOptions(
										new StringSelectMenuOptionBuilder()
											.setLabel('追加')
											.setValue('add')
											.setDescription('指定した変数を追加します。')
											.setEmoji('➕'),
										new StringSelectMenuOptionBuilder()
											.setLabel('削除')
											.setValue('remove')
											.setDescription('指定した変数を削除します。')
											.setEmoji('➖'),
									)
									.setMaxValues(1)
									.setRequired(true),
							);
						modal.addLabelComponents(
							variableName,
							variableValue,
							variableAction,
						);
						return interaction.showModal(modal);
					}
					case 'pomodoro_update': {
						// ポモドーロタイマーの状態取得とステータスの確認
						const pomodoroState = await pomodoro.getPomodoroState(
							client,
							interaction.guild.id,
						);
						if (!pomodoroState.running) {
							await interaction.message.edit({
								content: '❌ ポモドーロタイマーが実行されていません。',
								embeds: [],
								files: [],
								components: [],
							});
							return interaction.deferUpdate();
						}

						await interaction.deferUpdate();
						return pomodoro.sendPomodoroStatus(interaction, pomodoroState);
					}
					case 'pomodoro_stop': {
						// ポモドーロタイマーの状態取得とステータスの確認
						const pomodoroState = await pomodoro.getPomodoroState(
							client,
							interaction.guild.id,
						);
						if (!pomodoroState.running) {
							await interaction.message.edit({
								content: '❌ ポモドーロタイマーが実行されていません。',
								embeds: [],
								files: [],
								components: [],
							});
							return interaction.deferUpdate();
						}

						return pomodoro.stop(client, interaction);
					}
					case 'cancel': {
						return interaction.message.delete();
					}
				}
			}

			// モーダル応答
			if (interaction?.type === InteractionType.ModalSubmit) {
				switch (interaction?.customId) {
					case 'ask_register_id': {
						const id = interaction.fields.getTextInputValue('register_id');
						let serverData = await serverSchema.findById(id);
						if (!serverData) {
							serverData = await serverSchema.create({
								_id: id,
								sticky: {
									status: false,
									channels: [],
								},
								starboard: {
									status: false,
									boardInfo: [],
									transportedMessages: [],
								},
								// ポモドーロタイマーの設定は、スキーマから設定
							});
							serverData
								.save()
								.catch(async (err) => {
									await interaction.reply(
										'❌ エラーが発生しました。コンソールを確認してください。',
									);
									throw new Error(err.message || String(err), { cause: err });
								})
								.then(async () => {
									await interaction.reply('✅　登録しました。');
								});
						} else {
							await interaction.reply({
								content: '❌ そのサーバーは既に登録済みです。',
							});
						}
						return;
					}
					case 'ask_unregister_id': {
						const id = interaction.fields.getTextInputValue('unregister_id');
						const serverData = await serverSchema.findById(id);
						if (serverData) {
							serverSchema
								.deleteOne({ _id: id })
								.then(async () => {
									await interaction.reply('✅　登録を解除しました。');
								})
								.catch(async (err) => {
									await interaction.reply(
										'❌ エラーが発生しました。コンソールを確認してください。',
									);
									throw new Error(err.message || String(err), { cause: err });
								});
						} else {
							await interaction.reply({
								content: '❌ そのサーバーは既に登録解除済みです。',
								flags: MessageFlags.Ephemeral,
							});
						}
						return;
					}
					case 'ask_server_id': {
						const server = interaction.fields.getTextInputValue('server_id');
						if (server) {
							const guild = client.guilds.cache.get(server);
							if (!guild)
								return interaction
									.reply({
										content: '❌ このBOTはそのサーバーに所属していません。',
										flags: MessageFlags.Ephemeral,
									})
									.catch((err) => {
										// 送信失敗は無視
										void err;
									});

							const embed1 = new EmbedBuilder()
								.setTitle(`ℹ️ サーバー「${guild.name}」の情報`)
								.setDescription(
									`> **サーバーID:** \`${guild.id}\`\n> **メンバー数:** \`${guild.memberCount}\`\n> **チャンネル数:** \`${guild.channels.cache.size}\`\n> **ロール数:** \`${guild.roles.cache.size}\`\n> **絵文字数:** \`${guild.emojis.cache.size}\`\n> **サーバーブースト:** \`${guild.premiumSubscriptionCount}\`\n> **サーバーブーストのレベル:** \`${guild.premiumTier}\``,
								)
								.setColor(4303284)
								.setThumbnail(guild.iconURL())
								.setTimestamp();

							// DBのデータを取得
							let serverData = await serverSchema.findById({ _id: server });
							if (!serverData) {
								serverData = 'データがありません';
							} else {
								serverData = JSON.stringify(serverData);
							}

							const embed2 = new EmbedBuilder()
								.setTitle(`ℹ️ サーバー「${guild.name}」関連のデータベース情報`)
								.setDescription(`\`\`\`json\n${serverData}\n\`\`\``)
								.setTimestamp();

							await interaction
								.reply({
									embeds: [embed1, embed2],
									flags: MessageFlags.Ephemeral,
								})
								.catch((err) => {
									// 送信失敗は無視
									void err;
								});
						} else {
							let guilds = client.guilds.cache.map((g) => {
								return {
									name: g.name,
									id: g.id,
									memberCount: g.memberCount,
								};
							});
							//sort from largest to smallest
							guilds = guilds
								.flat()
								.sort((a, b) => b.memberCount - a.memberCount);

							//page system
							let page = 0;
							const maxPage = Math.ceil(guilds.length / 10) - 1;
							const embed = new EmbedBuilder()
								.setTitle(`${guilds.length}サーバーに所属中`)
								.setDescription(
									guilds
										.slice(page * 10, page * 10 + 10)
										.map(
											(g) =>
												`> **${g.name}** \`(${g.id})\` - \`${g.memberCount}\` 名のメンバー`,
										)
										.join('\n'),
								)
								.setColor(4303284)
								.setTimestamp();
							const row = new ActionRowBuilder().addComponents(
								new ButtonBuilder()
									.setCustomId('prev')
									.setLabel('戻る')
									.setStyle(ButtonStyle.Primary)
									.setDisabled(page === 0 ? true : false),
								new ButtonBuilder()
									.setCustomId('next')
									.setLabel('次へ')
									.setStyle(ButtonStyle.Primary)
									.setDisabled(page === maxPage ? true : false),
							);
							const msg = await interaction
								.reply({
									embeds: [embed],
									components: [row],
									withResponse: true,
									flags: MessageFlags.Ephemeral,
								})
								.catch((err) => {
									// 送信失敗は無視
									void err;
								});
							const filter = (i) => i.user.id === interaction.user.id;
							const collector = msg.createMessageComponentCollector({
								filter,
								time: 600000,
							});
							collector.on('collect', async (i) => {
								if (i.customId === 'prev') {
									page--;
									embed.setDescription(
										guilds
											.slice(page * 10, page * 10 + 10)
											.map(
												(g) =>
													`> **${g.name}** \`(${g.id})\` - \`${g.memberCount}\` 名のメンバー`,
											)
											.join('\n'),
									);
									row.components[0].setDisabled(page === 0 ? true : false);
									row.components[1].setDisabled(
										page === maxPage ? true : false,
									);
									await i
										.update({ embeds: [embed], components: [row] })
										.catch((err) => {
											// 送信失敗は無視
											void err;
										});
								} else if (i.customId === 'next') {
									page++;
									embed.setDescription(
										guilds
											.slice(page * 10, page * 10 + 10)
											.map(
												(g) =>
													`> **${g.name}** \`(${g.id})\` - \`${g.memberCount}\` 名のメンバー`,
											)
											.join('\n'),
									);
									row.components[0].setDisabled(page === 0 ? true : false);
									row.components[1].setDisabled(
										page === maxPage ? true : false,
									);
									await i
										.update({ embeds: [embed], components: [row] })
										.catch((err) => {
											// 送信失敗は無視
											void err;
										});
								}
							});

							collector.on('end', async () => {
								row.components[0].setDisabled(true);
								row.components[1].setDisabled(true);
								await msg
									.edit({ embeds: [embed], components: [row] })
									.catch((err) => {
										// 送信失敗は無視
										void err;
									});
							});
						}
						return;
					}
					case 'data_control_form': {
						const variable_name =
							interaction.fields.getTextInputValue('variable_name');
						let variable_value =
							interaction.fields.getTextInputValue('variable_value');
						const how_to =
							interaction.fields.getStringSelectValues('how_to_variable')[0];

						if (how_to === 'add') {
							if (variable_value === 'false' || variable_value === 'true') {
								console.info('Boolean');
								variable_value = variable_value === 'true';
							} else if (!variable_value) {
								console.info('no data');
								variable_value = '';
							} else {
								console.info('other data');
							}

							const all_guild_id = [];

							await serverSchema.find({}).then(async (allServerData) => {
								for (const serverData of allServerData) {
									all_guild_id.push(serverData._id);
								}

								for (const guild_id of all_guild_id) {
									const serverData = await serverSchema.findById(guild_id);
									serverData[variable_name] = variable_value;
									await serverData.save().then(() => {
										console.log(
											`${guild_id} is updated as this!\n${JSON.stringify(serverData)}`,
										);

										return interaction.reply('done');
									});
								}
							});
						} else if (how_to === 'remove') {
							const all_guild_id = [];

							await serverSchema.find({}).then(async (allServerData) => {
								for (const serverData of allServerData) {
									all_guild_id.push(serverData._id);
								}

								for (const guild_id of all_guild_id) {
									await serverSchema.findById(guild_id).then((serverData) => {
										serverData[variable_name] = undefined;

										serverData.save().then(() => {
											console.info('updated!');
										});
									});
								}

								return interaction.reply('done');
							});
						} else {
							console.log(how_to);
							await interaction.reply(
								'❌ how_toに予期せぬ値が入力されました。再度お試しください。',
							);
						}
						return;
					}
					case 'sticky': {
						const stickyTitle =
							interaction.fields.getTextInputValue('stickyTitle');
						const stickyBody =
							interaction.fields.getTextInputValue('stickyBody');
						const stickyImageURL =
							interaction.fields.getTextInputValue('stickyImageURL');

						// 画像URLチェック
						let imageURLCheck;
						try {
							new URL(stickyImageURL); //URLの形式であるかチェック
							const response = await fetch(stickyImageURL, {
								method: 'HEAD',
							});
							const contentType = response.headers.get('content-type');
							if (
								response.ok &&
								contentType &&
								contentType.startsWith('image/')
							) {
								imageURLCheck = true;
							} else {
								imageURLCheck = false;
							}
						} catch (err) {
							imageURLCheck = false;
							// URLの形式でない、もしくはfetchでエラーが発生した場合はfalseにしてエラーは無視
							void err;
						}

						// 固定メッセージを送信する
						const channelId = interaction.channelId;
						const embed = new EmbedBuilder()
							.setTitle(stickyTitle || null)
							.setDescription(stickyBody)
							.setImage(imageURLCheck ? stickyImageURL : null); //画像URLが無い場合は「""」になってしまうので、nullにする
						const stickyMessage = await client.channels.cache
							.get(channelId)
							.send({
								embeds: [embed],
							})
							.catch((err) => {
								// 送信失敗は無視
								void err;
							});
						// DBを更新(ステータスとメッセージ内容とメッセージID)
						serverSchema
							.findById(interaction.guild.id)
							.then((serverData) => {
								// 既にそのチャンネルに固定メッセージがある場合は、エラー出して終了
								if (serverData.sticky.channels.find((c) => c._id === channelId))
									return interaction.reply({
										content:
											'このチャンネルで既にピン留めが有効になっています。\n一度`/sticky clear`を実行してピン留めを解除してから再度お試しください。',
										flags: MessageFlags.Ephemeral,
									});

								serverData.sticky.status = true;
								serverData.sticky.channels.push({
									_id: channelId,
									stickyMessage: {
										oldMessageId: stickyMessage.id,
										message: {
											title: stickyTitle,
											body: stickyBody,
											imageURL: stickyImageURL,
										},
									},
								});
								serverData
									.save()
									.then(() => {
										return interaction.reply({
											content:
												'メッセージ固定の作成に成功しました。\n解除する場合は`/sticky clear`コマンドを利用してください。',
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
					}
				}
			}

			if (
				interaction?.type === InteractionType.ApplicationCommandAutocomplete
			) {
				const subcommand = await interaction.options.getSubcommand();
				switch (interaction.commandName) {
					case 'starboard': {
						if (subcommand === 'off') {
							const serverData = await serverSchema.findById(
								interaction.guild.id,
							);
							const boards = serverData.starboard.board;
							const choices = [];

							// 選択肢を生成
							for (const board of boards) {
								const channel = await client.channels.cache.get(board._id);
								const isDefaultEmoji = board.emoji.match(twemojiRegex) !== null;
								const option = {
									name: `送信先チャンネル：「${channel.name}」、絵文字名：「${
										isDefaultEmoji ? board.emoji : board.emoji.split(':')[1]
									}」、閾値：「${board.emojiAmount}」`,
									value: board._id,
								};
								choices.push(option);
							}

							// オートコンプリートの候補を送信
							return interaction.respond(choices);
						}
						break;
					}
					case 'flashcard': {
						if (subcommand === 'create') {
							// カテゴリ一覧を取得
							// TODO:オートコンプリートの候補を送信
						}
						break;
					}
				}
			}
		}
	} catch (err) {
		const errorNotification = require('../lib/errorNotification.js');
		errorNotification(client, interaction, err);
	}
};
