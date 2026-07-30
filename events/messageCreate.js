const { MessageFlags, EmbedBuilder } = require('discord.js');
const serverSchema = require('../models/serverSchema.js');

module.exports = (client, message) => {
	// botは無視
	if (message.author.bot) return;

	// 権限チェック
	const myPermissions = message.guild.members.me
		.permissionsIn(message.channel)
		.toArray();
	const conditions = [
		'ViewChannel',
		'SendMessages',
		'EmbedLinks',
		'AttachFiles',
	];
	for (const key in conditions) {
		if (!myPermissions.includes(conditions[key])) {
			return;
		}
	}

	// sticky処理
	// DB取得し、チャンネル照合
	serverSchema
		.findById(message.guild.id)
		.then(async (serverData) => {
			// ステータス確認
			if (!serverData.sticky.status) return;

			// sticky対象チャンネルか確認
			const stickyChannel = serverData.sticky.channels.find(
				(c) => c._id === message.channel.id,
			);
			if (stickyChannel) {
				// 前回のメッセージの時間を保存する変数
				let oldMessageTimestamp;

				// 古いメッセージを削除出来そうならする
				try {
					const oldMessage = await message.channel.messages.fetch(
						stickyChannel.stickyMessage.oldMessageId,
					);
					if (oldMessage) {
						oldMessageTimestamp = oldMessage.createdTimestamp;
						// 前回送信から1分未満であれば、何もしない
						if (
							oldMessageTimestamp &&
							Date.now() - oldMessageTimestamp <= 30 * 1000
						)
							return;

						await oldMessage.delete();
					}
				} catch (err) {
					// 古いメッセージが見つからなかったり削除できない場合は、そのままメッセージ送信
					void err;
				}

				// 改めてsilentで送信
				const embed = new EmbedBuilder()
					.setTitle(stickyChannel.stickyMessage.message.title || null)
					.setDescription(stickyChannel.stickyMessage.message.body)
					.setImage(
						stickyChannel.stickyMessage.message.imageURL
							? stickyChannel.stickyMessage.message.imageURL
							: null,
					);
				const newStickyMessage = await message.channel.send({
					embeds: [embed],
					flags: MessageFlags.SuppressNotifications, //silentメッセージで送信
				});

				// DBのメッセージIDを更新
				stickyChannel.stickyMessage.oldMessageId = newStickyMessage.id;
				await serverData.save();
			}
		})
		.catch((err) => {
			// ユーザー側には何も表示せず、裏にログを残す。
			const errorNotification = require('../lib/errorNotification.js');
			errorNotification(client, message, err);
		});
};
