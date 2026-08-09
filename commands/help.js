const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	SlashCommandBuilder,
	EmbedBuilder,
	AttachmentBuilder,
} = require('discord.js');
require('dotenv').config({ quiet: true });

module.exports = {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('❔全コマンドのヘルプを表示します')
		.addStringOption((option) =>
			option
				.setName('commands')
				.setDescription('詳細を表示するコマンドを指定します')
				.setRequired(false)
				.setChoices([
					{ name: 'about', value: 'about' },
					{ name: 'botadmin', value: 'botadmin' },
					{ name: 'omikuji', value: 'omikuji' },
					{ name: 'ping', value: 'ping' },
					{ name: 'qr_code', value: 'qr_code' },
					{ name: 'tc_create', value: 'tc_create' },
					{ name: 'yt_search', value: 'yt_search' },
				]),
		),

	run: async (client, interaction) => {
		try {
			const commands = interaction.options.getString('commands');

			const button = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setLabel('サーバーに招待する')
					.setStyle(ButtonStyle.Link)
					.setURL(
						`https://discord.com/oauth2/authorize?client_id=${client.user.id}`,
					),
				new ButtonBuilder()
					.setLabel('サポートサーバーに参加する')
					.setStyle(ButtonStyle.Link)
					.setURL(process.env.discord_bot_support),
			);

			let title, description;
			if (commands === 'ping') {
				title = 'ℹ️ Pingコマンドのヘルプ';
				description = 'Pingを測定します';
			} else if (commands === 'qr_code') {
				title = 'ℹ️ Qr_codeコマンドのヘルプ';
				description =
					'入力された文字列やURLのQRコードを作成します。\n　※QRコードは(株)デンソーウェーブの登録商標です。';
			} else if (commands === '???') {
				// TODO: 他のコマンドのヘルプを追加する
				// TODO: stickyは、1分おきにしか更新されない旨を表示
			} else {
				title = 'ℹ️ HoshimiTech-BOTのヘルプ';
				description =
					'<@728495196303523900>が管理しております。\n\n# 全コマンド一覧\n`/ping`でPINGを見てみよう！\n\n`/botadmin`でこのBOTの管理者のメンションをするよ\n\n`/me`であなたにメンションするよ\n\n`/help`でこれを表示するよ\n\n`/omikuji`でおみくじを引けるよ\n\n`/tc_create <何を作るか選択> <チャンネル名>`でチャンネルを作成するよ\n　※要、チャンネル管理権限\n\n`/yt_search <キーワード>` でそのキーワードに関連した動画URLを投稿するよ\n\n`/qr_code <文字列かURL>`でその文字列を読み取れるQRコードを作成するよ\n　※QRコードは(株)デンソーウェーブの登録商標です。\n\n`/stop`でBOTを停止するよ(__**BOT管理者限定機能**__)';
			}

			//↓TODO調整
			const embed = new EmbedBuilder()
				.setTitle(title)
				.setDescription(description)
				.setColor(4303284)
				.setThumbnail('attachment://logo.png')
				.setTimestamp();
			const attachment = new AttachmentBuilder()
				.setName('logo.png')
				.setFile('assets/images/logo.png');
			await interaction.reply({
				embeds: [embed],
				files: [attachment],
				components: [button],
			});
		} catch (err) {
			const errorNotification = require('../lib/errorNotification.js');
			errorNotification(client, interaction, err);
		}
	},
};
