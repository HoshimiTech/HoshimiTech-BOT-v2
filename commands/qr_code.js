const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const QRCode = require('qrcode');
const path = require('path');
const dirname = require('../lib/defineDirname.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('qr_code')
		.setDescription('QRコードを作成します')
		.addStringOption((option) =>
			option.setName('keyword').setDescription('文字列かURL').setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName('hidden')
				.setDescription(
					'作成したQRコードをチャンネル内で、非公開で作成する場合は設定してください。',
				)
				.setRequired(false)
				.addChoices({ name: '非公開にする', value: 'true' }),
		),

	run: async (client, interaction) => {
		try {
			let hiddenOption = interaction.options.getString('hidden');
			hiddenOption = hiddenOption === 'true';

			await interaction.deferReply({
				flags: hiddenOption ? MessageFlags.Ephemeral : 0,
			});

			const QRValue = interaction.options.getString('keyword');
			QRCode.toBuffer(QRValue, (err, buffer) => {
				if (err)
					return interaction.editReply(
						'❌ QRコード生成時にエラーが発生しました。時間を空けて再度お試ししただき、同様の問題が発生する場合はサポートサーバーまでお問い合わせください。',
					);

				return interaction.editReply({
					files: [buffer],
				});
			});
		} catch (err) {
			const errorNotification = require(
				path.join(dirname, 'lib/errorNotification.js'),
			);
			errorNotification(client, interaction, err);
		}
	},
};
