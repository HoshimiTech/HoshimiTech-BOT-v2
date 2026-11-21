const Sentry = require('@sentry/node');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('🏓Ping値を計測します！'),

	run: async (client, interaction) => {
		try {
			await interaction.reply(
				`WebSocketのPing: ${interaction.client.ws.ping}ms\nAPIのエンドポイントのPing: ...`,
			);

			const msg = await interaction.fetchReply();

			await interaction.editReply(
				`WebSocketのPing: ${
					interaction.client.ws.ping
				}ms\nAPIのエンドポイントのPing: ${
					msg.createdTimestamp - interaction.createdTimestamp
				}ms`,
			);
		} catch (err) {
			Sentry.captureException(err);
		}
	},
};
