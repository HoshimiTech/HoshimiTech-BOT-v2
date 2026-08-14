const {
	PermissionsBitField,
	SlashCommandBuilder,
	MessageFlags,
	EmbedBuilder,
} = require('discord.js');
const path = require('path');
const dirname = require('../lib/defineDirname.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('grade_role_update')
		.setDescription('⬆学年ロールを更新します(サーバー管理者限定)')
		.setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

	run: async (client, interaction) => {
		try {
			//時間かかるので、先にreply
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
			const roles = [
				'高校3年生',
				'高校2年生',
				'高校1年生',
				'中学3年生',
				'中学2年生',
				'中学1年生',
				'生徒',
				'卒業生',
			];
			const guildMe = await interaction.guild.members.fetch(client.user.id);

			//ロールがあるかチェック
			for (const key in roles) {
				const role = await interaction.guild.roles.cache.find((role) =>
					role.name.includes(roles[key]),
				);
				if (!role) {
					const embed = new EmbedBuilder()
						.setTitle('❌ エラー！')
						.setDescription(
							'更新で使用するロールのうち１つ以上が存在しないため、ロールを更新できません。\n　※このコマンドを実行するために、以下の文言が含まれたロールが必要です。\n\n- 高校3年生\n- 高校2年生\n- 高校1年生\n- 中学3年生\n- 中学2年生\n- 中学1年生\n- 生徒\n- 卒業生',
						)
						.setColor(0xff0000)
						.setTimestamp();
					return interaction.editReply({
						embeds: [embed],
					});
				}
			}

			//botの権限チェック
			for (const key in roles) {
				const otherRole = await interaction.guild.roles.cache.find((role) =>
					role.name.includes(roles[key]),
				);
				const compare = guildMe.roles.highest.comparePositionTo(otherRole);
				if (compare < 0) {
					const embed = new EmbedBuilder()
						.setTitle('❌ エラー！')
						.setDescription(
							'私に割り当てられている最高順位のロールよりも、更新するロールの位置の方が高いため、ロールを更新できません。私に割り当てられてるロールのうちの１つ以上を、以下のロールよりも上に設定して、再度実行してください。\n\n- 高校3年生\n- 高校2年生\n- 高校1年生\n- 中学3年生\n- 中学2年生\n- 中学1年生\n- 生徒\n- 卒業生',
						)
						.setColor(0xff0000)
						.setTimestamp();
					return interaction.editReply({
						embeds: [embed],
					});
				}
			}

			//ロール更新
			const grade_role_names = [
				'中学1年生',
				'中学2年生',
				'中学3年生',
				'高校1年生',
				'高校2年生',
				'高校3年生',
			];
			const members = await interaction.guild.members.fetch();
			const tags = members.map((member) => member.user.id);
			for (const key in tags) {
				const user_id = tags[key];
				const user = interaction.guild.members.cache.get(user_id);
				const grade_role_kou3 = await interaction.guild.roles.cache.find(
					(role) => role.name.includes('高校3年生'),
				);
				const grade_role_graduate = await interaction.guild.roles.cache.find(
					(role) => role.name.includes('卒業生'),
				);
				const grade_role_student = await interaction.guild.roles.cache.find(
					(role) => role.name.includes('生徒'),
				);

				if (user.roles.cache.has(grade_role_kou3.id)) {
					// 高３だけ別処理
					user.roles.remove(grade_role_kou3);
					user.roles.add(grade_role_graduate);
					user.roles.remove(grade_role_student);
				} else {
					// それ以外のロール処理
					for (const key in grade_role_names) {
						const grade_role_name = grade_role_names[key];
						const grade_role_new_name = grade_role_names[Number(key) + 1];

						const grade_role = await interaction.guild.roles.cache.find(
							(role) => role.name.includes(grade_role_name),
						);
						const grade_role_new = await interaction.guild.roles.cache.find(
							(role) => role.name.includes(grade_role_new_name),
						);

						if (user.roles.cache.has(grade_role.id)) {
							user.roles.remove(grade_role);
							setTimeout(() => {
								user.roles.add(grade_role_new);
							}, 500);
							break;
						}
					}
				}

				await interaction.editReply('✅ 学年ロールの更新が完了しました。');
			}
		} catch (err) {
			const errorNotification = require(
				path.join(dirname, 'lib/errorNotification.js'),
			);
			errorNotification(client, interaction, err);
		}
	},
};
