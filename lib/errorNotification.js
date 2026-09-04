function errorNotification(client, interaction, err) {
	const { EmbedBuilder } = require('discord.js');
	require('dotenv').config({ quiet: true });
	const consoleChannel = process.env.discord_bot_console;
	const adminUserID = process.env.discord_bot_owner;

	// エラーをコンソールに出力
	console.error(err);

	const embed = new EmbedBuilder()
		.setColor(0xffa954)
		.setTimestamp()
		.addFields([
			{ name: 'コマンド', value: `${interaction?.commandName}` },
			{ name: 'エラー', value: `${err}` },
			{
				name: 'ユーザー',
				value: `${interaction?.user?.tag} \`(${interaction?.user?.id})\``,
				inline: true,
			},
			{
				name: 'サーバー',
				value: `${interaction?.guild?.name} \`(${interaction?.guild?.id})\``,
				inline: true,
			},
			{
				name: '時間',
				value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
				inline: true,
			},
			{
				name: 'コマンドが使用されたチャンネル',
				value: `${interaction?.channel?.name} \`(${interaction?.channel?.id})\``,
				inline: true,
			},
			{
				name: 'ユーザーが接続していたボイスチャンネル',
				value: `${interaction?.member?.voice?.channel?.name} \`(${interaction?.member?.voice?.channel?.id})\``,
				inline: true,
			},
		]);
	client.channels.cache
		.get(consoleChannel)
		?.send({ content: `<@${adminUserID}>`, embeds: [embed] })
		.catch((err) => {
			// 送信失敗は無視
			void err;
		});

	return;
}

module.exports = errorNotification;
