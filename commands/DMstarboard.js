const {
	ContextMenuCommandBuilder,
	ApplicationCommandType,
	InteractionContextType,
	MessageFlags,
	Locale,
} = require('discord.js');
const path = require('path');
const dirname = require('../lib/defineDirname.js');
const messageTransport = require(path.join(dirname, 'lib/messageTransport.js'));

module.exports = {
	data: new ContextMenuCommandBuilder()
		.setName('DM starboard')
		.setNameLocalizations({ [Locale.Japanese]: 'BOTとのDMに内容をメモする' })
		.setType(ApplicationCommandType.Message)
		.setContexts(InteractionContextType.Guild),

	run: async (client, interaction) => {
		const message = interaction.options.getMessage('message');

		// メッセージを転送する
		await messageTransport(client, message, interaction.user.id, true);

		// 転送する旨を送信
		return interaction.reply({
			content: '🔄️ DMにメッセージを転送します…',
			flags: MessageFlags.Ephemeral,
		});
	},
};
