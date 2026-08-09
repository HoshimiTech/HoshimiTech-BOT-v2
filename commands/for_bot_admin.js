const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	SlashCommandBuilder,
	MessageFlags,
} = require('discord.js');
require('dotenv').config({ quiet: true });
const adminIDs = process.env.discord_bot_owner
	? process.env.discord_bot_owner.split(',')
	: [];

module.exports = {
	data: new SlashCommandBuilder()
		.setName('for_bot_admin')
		.setDescription('<<BOTオーナー専用コマンド>>'),

	run: async (client, interaction) => {
		await interaction.deferReply();
		if (!adminIDs.includes(interaction?.user?.id))
			return interaction
				.editReply({
					content: `❌ 申し訳ございません。\n本コマンドはBOTのオーナーのみが使用出来るように設定されているため、使用出来ません。\n\nご不明な点がございましたら、[サポートサーバー](${process.env.discord_bot_support})にてお問い合わせください。`,
					flags: MessageFlags.Ephemeral,
				})
				.catch((err) => {
					// 送信失敗は無視
					void err;
				});

		const buttons = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setLabel('サーバー登録')
				.setCustomId('server_register')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setLabel('サーバー登録解除')
				.setCustomId('server_unregister')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setLabel('デバッグ')
				.setCustomId('debug')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setLabel('データベース値の追加/削除')
				.setCustomId('data_control')
				.setStyle(ButtonStyle.Secondary),
		);
		await interaction.editReply({
			content:
				'ℹ️　何をしますか？\n\n# __**※※データベース更新の際は、必ずプログラム内の「/models/＊＊＊Schema.js」を更新後に追加/削除を行ってください。それを行わないと、正常に更新できません※※**__',
			flags: MessageFlags.Ephemeral,
			components: [buttons],
		});
	},
};
