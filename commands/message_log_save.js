const {
	SlashCommandBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	PermissionsBitField,
	MessageFlags,
	ContainerBuilder,
	TextDisplayBuilder,
	FileBuilder,
} = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');
const path = require('path');
const dirname = require('../lib/defineDirname.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('message_log_save')
		.setDescription(
			'📝メッセージログを保存します！(取得に数分かかる場合があります)',
		)
		.setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),

	run: async (client, interaction) => {
		try {
			await interaction.deferReply();

			// botの権限チェック
			if (
				!interaction.channel
					.permissionsFor(client.user.id)
					.has(
						PermissionsBitField.Flags.ViewChannel,
						PermissionsBitField.Flags.ReadMessageHistory,
					)
			) {
				return interaction.editReply(
					'❌ このチャンネルでメッセージログを保存する権限がありません。',
				);
			}

			const attachment = await discordTranscripts.createTranscript(
				interaction.channel,
				{
					limit: -1,
					filename: `${interaction.channel.id}.html`,
				},
			);

			const cancel = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId('cancel')
					.setLabel('閉じる')
					.setStyle(ButtonStyle.Secondary),
			);

			// components v2の準備
			const component = new ContainerBuilder()
				.addTextDisplayComponents([
					new TextDisplayBuilder({
						content: '## 📤｜出力しました',
					}),
					new TextDisplayBuilder({
						content:
							'__**必ず、ご自身のデバイスにダウンロードしてください！**__',
					}),
				])

				.addFileComponents(
					new FileBuilder().setURL(
						`attachment://${interaction.channel.id}.html`,
					),
				)

				.setAccentColor(0x20ff20);

			await interaction.editReply({
				content: '',
				components: [component, cancel],
				files: [attachment],
				flags: MessageFlags.IsComponentsV2,
			});
		} catch (err) {
			const errorNotification = require(
				path.join(dirname, 'lib/errorNotification.js'),
			);
			errorNotification(client, interaction, err);
		}
	},
};
