const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const flashcard = require('../lib/flashcard/main.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('flashcard')
		.setDescription('🗒️単語帳で勉強したり、単語帳の管理が出来ます！')
		.addSubcommandGroup((subcommands) =>
			subcommands
				.setName('card')
				.setDescription('カードに関する操作を行います。')
				.addSubcommand((subcommand) =>
					subcommand
						.setName('create')
						.setDescription('新しいカードを作成します。')
						.addStringOption((option) =>
							option
								.setName('word')
								.setDescription(
									'カードの表面(英語など)の単語を入力してください。',
								)
								.setRequired(true),
						)
						.addStringOption((option) =>
							option
								.setName('meaning')
								.setDescription(
									'カードの裏面(日本語など)の答えを入力してください。',
								)
								.setRequired(true),
						)
						.addStringOption((option) =>
							option
								.setName('category')
								.setDescription(
									'このカードのカテゴリーを選択してください。なお、カテゴリーは「/flashcard category create」コマンドで作成できます。',
								)
								.setAutocomplete(true)
								.setRequired(false),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('list')
						.setDescription('カードの一覧を表示します。')
						.addStringOption((option) =>
							option
								.setName('category')
								.setDescription('表示するカテゴリーを選択してください。')
								.setRequired(false),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('delete')
						.setDescription('カードを削除します。')
						.addStringOption((option) =>
							option
								.setName('word')
								.setDescription(
									'削除するカードの表面の単語を入力してください。',
								)
								.setRequired(true),
						),
				),
		)
		.addSubcommandGroup((subcommands) =>
			subcommands
				.setName('category')
				.setDescription('カテゴリーに関する操作を行います。')
				.addSubcommand((subcommand) =>
					subcommand
						.setName('create')
						.setDescription('新しいカテゴリーを作成します。')
						.addStringOption((option) =>
							option
								.setName('name')
								.setDescription('カテゴリーの名前を入力してください。')
								.setRequired(true),
						),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('list')
						.setDescription('利用可能なカテゴリーの一覧を表示します。'),
				)
				.addSubcommand((subcommand) =>
					subcommand
						.setName('delete')
						.setDescription('カテゴリーとそのカテゴリーのカードを削除します。')
						.addStringOption((option) =>
							option
								.setName('name')
								.setDescription('削除するカテゴリーの名前を入力してください。')
								.setRequired(true),
						),
				),
		),

	run: async (client, interaction) => {
		try {
			const subcommandGroup = interaction.options.getSubcommandGroup();
			const subcommand = interaction.options.getSubcommand();

			// カードに関するサブコマンド
			switch (subcommandGroup) {
				case 'card': {
					switch (subcommand) {
						case 'create': {
							// カード作成のロジック
							const word = interaction.options.getString('word');
							const meaning = interaction.options.getString('meaning');
							const category = interaction.options.getString('category');
							const cardResult = await flashcard.createCard(
								interaction.user.id,
								word,
								meaning,
								category,
							);
							if (!cardResult.success) {
								await interaction.reply({
									content:
										cardResult.error ||
										'❌ カードの作成に失敗しました。不明なエラーが発生した可能性が有ります。時間を空けて再度お試しください。',
									flags: MessageFlags.Ephemeral,
								});
							} else if (cardResult.data && !cardResult.data?.alreadyExists) {
								const card = cardResult.data;
								await interaction.reply({
									content: `✅ カードが作成されました！\n表面: ${card.word}\n裏面: ${card.meaning}\nカテゴリー: ${card.category}`,
									flags: MessageFlags.Ephemeral,
								});
							} else if (cardResult.data && cardResult.data?.alreadyExists) {
								const card = cardResult.data;
								await interaction.reply({
									content: `❌ そのキーワードのカードは既に存在します！更新する場合は一度カードを削除してから再度作成してください。\n表面: ${card.word}\n裏面: ${card.meaning}\nカテゴリー: ${card.category}`,
									flags: MessageFlags.Ephemeral,
								});
							} else {
								await interaction.reply({
									content:
										'❌ カードの作成に失敗しました。不明なエラーが発生した可能性が有ります。時間を空けて再度お試しください。',
									flags: MessageFlags.Ephemeral,
								});
							}
							break;
						}
						case 'list': {
							// カード一覧表示のロジック
							const categoryFilter = interaction.options.getString('category');

							const cardsResult = await flashcard.getCard(interaction.user.id, {
								category: categoryFilter,
							});
							if (!cardsResult.success) {
								await interaction.reply({
									content: `❌ ${cardsResult.error}`,
									flags: MessageFlags.Ephemeral,
								});
							} else if (cardsResult.data && cardsResult.data.length > 0) {
								const cardList = cardsResult.data
									.map(
										(card) =>
											`表面: ${card.word}, 裏面: ${card.meaning}, カテゴリー: ${card.category}`,
									)
									.join('\n');
								await interaction.reply({
									content: `ℹ️　以下のカードがあります:\n${cardList}`,
									flags: MessageFlags.Ephemeral,
								});
							} else {
								await interaction.reply({
									content: '❌ カードが見つかりませんでした。',
									flags: MessageFlags.Ephemeral,
								});
							}
							break;
						}
						case 'delete': {
							// カード削除のロジック
							const deleteWord = interaction.options.getString('word');
							const deleteResult = await flashcard.deleteCard(
								interaction.user.id,
								deleteWord,
							);
							if (!deleteResult.success) {
								await interaction.reply({
									content: `❌ ${deleteResult.error}`,
									flags: MessageFlags.Ephemeral,
								});
							} else if (deleteResult.success && deleteResult.data) {
								await interaction.reply({
									content: `✅ カードが削除されました！\n削除されたカード: ${deleteWord}`,
									flags: MessageFlags.Ephemeral,
								});
							}
							break;
						}
					}
					break;
				}
				case 'category': {
					switch (subcommand) {
						case 'create': {
							// カテゴリー作成のロジック
							const categoryName = interaction.options.getString('name');
							const result = await flashcard.createCategory(
								interaction.user.id,
								categoryName,
							);

							if (result.success) {
								await interaction.reply({
									content: `✅ カテゴリー「${result.categoryName}」が作成されました！\nこのカテゴリーはカード作成時に選択できるようになります。`,
									flags: MessageFlags.Ephemeral,
								});
							} else {
								await interaction.reply({
									content: `❌ ${result.error}`,
									flags: MessageFlags.Ephemeral,
								});
							}
							break;
						}
						case 'list': {
							// カテゴリー一覧表示のロジック
							const categoriesResult = await flashcard.getCategories(
								interaction.user.id,
							);

							if (!categoriesResult.success) {
								await interaction.reply({
									content: `❌ ${categoriesResult.error}`,
									flags: MessageFlags.Ephemeral,
								});
							} else {
								const categories = categoriesResult.data || [];
								if (categories && categories.length > 0) {
									const categoryList = categories.join(', ');
									await interaction.reply({
										content: `ℹ️ 利用可能なカテゴリー:\n${categoryList}`,
										flags: MessageFlags.Ephemeral,
									});
								} else {
									await interaction.reply({
										content: '❌ 利用可能なカテゴリーがありません。',
										flags: MessageFlags.Ephemeral,
									});
								}
							}
							break;
						}
						case 'delete': {
							// カテゴリー削除のロジック
							const categoryNameToDelete =
								interaction.options.getString('name');
							const deleteResult = await flashcard.deleteCategory(
								interaction.user.id,
								categoryNameToDelete,
							);

							if (deleteResult.success) {
								await interaction.reply({
									content: `✅ カテゴリー「${categoryNameToDelete}」が削除されました。`,
									flags: MessageFlags.Ephemeral,
								});
							} else {
								await interaction.reply({
									content: `❌ ${deleteResult.error}`,
									flags: MessageFlags.Ephemeral,
								});
							}
							break;
						}
					}
					break;
				}
			}
		} catch (err) {
			const errorNotification = require('../lib/errorNotification.js');
			errorNotification(client, interaction, err);
		}
	},
};
