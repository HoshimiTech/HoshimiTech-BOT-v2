const userSchema = require('../../models/userSchema.js');

/**
 * カテゴリーが有効かどうかをチェックする
 * @param {string} userId - ユーザーID
 * @param {string} category - チェックするカテゴリー名
 * @returns {Promise<object>} カテゴリーが有効かどうか
 */
async function isValidCategory(userId, category) {
	try {
		// 「一般」は常に有効
		if (category === '一般') {
			return { success: true, data: true };
		}

		const userData = await userSchema.findById(userId);

		if (!userData) {
			return { success: true, data: false };
		}

		return {
			success: true,
			data: userData.flashcard.categories.includes(category),
		};
	} catch (error) {
		console.error('カテゴリー有効性チェックエラー:', error);
		return {
			success: false,
			error: 'カテゴリー有効性チェック中にエラーが発生しました。',
		};
	}
}

/**
 * ユーザーのフラッシュカードセクションを初期化する
 * @param {string} userId - ユーザーID
 * @returns {Promise<object>} 処理結果
 */
async function ensureFlashcardsExist(userId) {
	try {
		// ユーザーのフラッシュカードセクションが存在するかチェック
		const userData = await userSchema.findById(userId);

		if (!userData) {
			// ユーザーのフラッシュカードセクションが存在しない場合は作成
			await userSchema.create({
				_id: userId,
				flashcard: {
					categories: ['一般'],
					cards: [],
				},
			});
		}

		return { success: true };
	} catch (error) {
		console.error('ユーザーフラッシュカードセクション初期化エラー:', error);
		return {
			success: false,
			error:
				'ユーザーフラッシュカードセクションの初期化中にエラーが発生しました。',
		};
	}
}

/**
 * フラッシュカードを追加する
 * @param {string} userId - ユーザーID
 * @param {string} word - キーワード（表面）
 * @param {string} meaning - 定義（裏面）
 * @param {string} category - カテゴリー（オプション）
 * @returns {Promise<object>} 作成されたフラッシュカード
 */
async function createCard(userId, word, meaning, category) {
	try {
		// 必要に応じてuserDBの初期化
		await ensureFlashcardsExist(userId);

		// カテゴリーの有効性チェック
		const targetCategory = category || '一般';
		const isValidResult = await isValidCategory(userId, targetCategory);
		if (!isValidResult.success) {
			return isValidResult;
		}
		if (!isValidResult.data) {
			return {
				success: false,
				error: `カテゴリー「${targetCategory}」は存在しません。先に「/flashcard category create」コマンドでカテゴリーを作成してください。`,
			};
		}

		// キーワードの重複チェック
		const existingCard = await getCard(userId, { word: word });
		if (existingCard && existingCard.success && existingCard.data) {
			existingCard.data[0].alreadyExists = true;
			return { success: true, data: existingCard.data[0] }; // 既に存在する場合はそのカードを返す
		}

		// 既存のユーザーのフラッシュカードセクションにカードを追加
		const userData = await userSchema.findById(userId);
		userData.flashcard.cards.push({
			word: word.trim(),
			meaning: meaning.trim(),
			category: targetCategory,
			createdAt: new Date(),
			reviewCount: 0,
			correctCount: 0,
			incorrectCount: 0,
		});
		const result = await userData.save();

		return {
			success: true,
			data: result.flashcard.cards.filter(
				(card) => card.word === word.trim(),
			)[0],
		}; // 作成されたカードを返す
	} catch (error) {
		console.error('フラッシュカード追加エラー:', error);
		return {
			success: false,
			error: 'フラッシュカードの追加中にエラーが発生しました。',
		};
	}
}

/**
 * フラッシュカードを削除する
 * @param {string} userId - ユーザーID
 * @param {string} word - 削除するキーワード
 * @returns {Promise<object>} 削除結果
 */
async function deleteCard(userId, word) {
	try {
		await ensureFlashcardsExist(userId);

		const userData = await userSchema.findById(userId);
		// カードが存在するか確認
		if (!userData.flashcard.cards.some((card) => card.word === word.trim())) {
			return {
				success: false,
				error: `指定されたカード「${word}」が見つかりませんでした。カードの表面の単語を正確に入力してください。`,
			};
		}

		userData.flashcard.cards.pull({
			word: word.trim(),
		});
		await userData.save();

		return {
			success: true,
			data: word,
		};
	} catch (error) {
		console.error('フラッシュカード削除エラー:', error);
		return {
			success: false,
			error: 'フラッシュカードの削除中にエラーが発生しました。',
		};
	}
}

/**
 * フラッシュカードを取得する（filterオブジェクトで条件指定可能）
 * @param {string} userId - ユーザーID
 * @param {object} [filter] - フィルター条件（例: {word, category}）
 * @returns {Promise<object>} フラッシュカード取得結果
 */
async function getCard(userId, filter = {}) {
	try {
		const userData = await userSchema.findById(userId);

		if (!userData || !userData.flashcard || !userData.flashcard.cards) {
			return { success: true, data: null };
		}

		let filteredCards = userData.flashcard.cards;
		if (filter.word) {
			filteredCards = filteredCards.filter(
				(card) => card.word.toLowerCase() === filter.word.trim().toLowerCase(),
			);
		}
		if (filter.category) {
			filteredCards = filteredCards.filter(
				(card) => card.category === filter.category,
			);
		}

		return filteredCards.length > 0
			? { success: true, data: filteredCards }
			: { success: true, data: null };
	} catch (error) {
		console.error('フラッシュカード取得エラー:', error);
		return {
			success: false,
			error: 'フラッシュカードの取得中にエラーが発生しました。',
		};
	}
}

/**
 * ユーザーのすべてのフラッシュカードを削除する
 * @param {string} userId - ユーザーID
 * @returns {Promise<object>} 削除結果
 */
async function clearCards(userId) {
	try {
		// ユーザーのフラッシュカードセクションが存在することを確認
		const ensureResult = await ensureFlashcardsExist(userId);
		if (ensureResult && !ensureResult.success) {
			return ensureResult;
		}

		const userData = await userSchema.findById(userId);
		userData.flashcard = {
			categories: ['一般'],
			cards: [],
		};
		const result = await userData.save();

		return {
			success: result.flashcard.cards.length === 0,
		};
	} catch (error) {
		console.error('フラッシュカード全削除エラー:', error);
		return {
			success: false,
			error: 'フラッシュカードの全削除中にエラーが発生しました。',
		};
	}
}

/**
 * ランダムなフラッシュカードを取得する
 * @param {string} userId - ユーザーID
 * @param {object} filters - フィルター条件（category）
 * @returns {Promise<object>} ランダムなフラッシュカード取得結果
 */
async function getRandom(userId, filters = {}) {
	try {
		const cardsResult = await getCard(userId, filters);
		if (
			!cardsResult ||
			!cardsResult.success ||
			!cardsResult.data ||
			cardsResult.data.length === 0
		) {
			return { success: true, data: null };
		}

		const cards = cardsResult.data;
		const randomIndex = Math.floor(Math.random() * cards.length);
		return { success: true, data: cards[randomIndex] };
	} catch (error) {
		console.error('ランダムフラッシュカード取得エラー:', error);
		return {
			success: false,
			error: 'ランダムフラッシュカードの取得中にエラーが発生しました。',
		};
	}
}

/**
 * フラッシュカードの復習記録を更新する
 * @param {string} userId - ユーザーID
 * @param {string} word - キーワード
 * @param {boolean} isCorrect - 正解かどうか
 * @returns {Promise<object>} 更新結果
 */
async function updateReview(userId, word, isCorrect) {
	try {
		const userData = await userSchema.findById(userId);
		if (!userData) {
			return { success: false, error: 'ユーザーが見つかりません。' };
		}

		const card = userData.flashcard.cards.find(
			(card) => card.word.toLowerCase() === word.trim().toLowerCase(),
		);

		if (!card) {
			return { success: false, error: '指定されたカードが見つかりません。' };
		}

		// 日付と、レビュー数と、正解/不正回数を更新
		card.lastReviewed = new Date();
		card.reviewCount += 1;
		if (isCorrect) {
			card.correctCount += 1;
		} else {
			card.incorrectCount += 1;
		}

		await userData.save();

		return { success: true, data: card };
	} catch (error) {
		console.error('復習記録更新エラー:', error);
		return {
			success: false,
			error: '復習記録の更新中にエラーが発生しました。',
		};
	}
}
/**
 * カテゴリを作成する
 * @param {string} userId - ユーザーID
 * @param {string} categoryName - カテゴリー名
 * @returns {Promise<object>} 作成結果
 */
async function createCategory(userId, categoryName) {
	try {
		// カテゴリー名の妥当性チェック
		if (!categoryName || categoryName.trim().length === 0) {
			return { success: false, error: 'カテゴリー名を入力してください。' };
		}

		const trimmedCategoryName = categoryName.trim();

		// ユーザーのフラッシュカードセクションが存在することを確認
		const ensureResult = await ensureFlashcardsExist(userId);
		if (ensureResult && !ensureResult.success) {
			return ensureResult;
		}

		// 既存のカテゴリーをチェック
		const existingCategoriesResult = await getCategories(userId);
		if (!existingCategoriesResult.success) {
			return existingCategoriesResult;
		}
		if (existingCategoriesResult.data.includes(trimmedCategoryName)) {
			return { success: false, error: 'そのカテゴリーは既に存在します。' };
		}

		// カテゴリーを追加
		const userData = await userSchema.findById(userId);
		userData.flashcard.categories.push(trimmedCategoryName);
		await userData.save();

		return { success: true, categoryName: trimmedCategoryName };
	} catch (error) {
		console.error('カテゴリー作成エラー:', error);
		return {
			success: false,
			error: 'カテゴリーの作成中にエラーが発生しました。',
		};
	}
}

/**
 * カテゴリ一覧を取得する
 * @param {string} userId - ユーザーID
 * @returns {Promise<object>} カテゴリの配列またはエラー情報
 */
async function getCategories(userId) {
	try {
		const userData = await userSchema.findById(userId);
		if (!userData || !userData.flashcard || !userData.flashcard.categories) {
			return { success: true, data: ['一般'] };
		}

		return { success: true, data: userData.flashcard.categories.sort() };
	} catch (error) {
		console.error('カテゴリ一覧取得エラー:', error);
		return {
			success: false,
			error: 'カテゴリ一覧の取得中にエラーが発生しました。',
		};
	}
}

/**
 * カテゴリを削除する（そのカテゴリーのカードも削除される）
 * @param {string} userId - ユーザーID
 * @param {string} categoryName - 削除するカテゴリー名
 * @returns {Promise<object>} 削除結果
 */
async function deleteCategory(userId, categoryName) {
	try {
		// 「一般」は削除できない
		if (categoryName === '一般') {
			return { success: false, error: '「一般」カテゴリーは削除できません。' };
		}

		// ユーザーデータの存在を確認
		const ensureResult = await ensureFlashcardsExist(userId);
		if (ensureResult && !ensureResult.success) {
			return ensureResult;
		}

		// カテゴリーが存在するかチェック
		const existingCategoriesResult = await getCategories(userId);
		if (!existingCategoriesResult.data.includes(categoryName)) {
			return {
				success: false,
				error: `指定されたカテゴリー「${categoryName}」は存在しません。`,
			};
		}

		// カテゴリーを削除し、そのカテゴリーのカードも削除
		const userData = await userSchema.findById(userId);
		userData.flashcard.categories.pull(categoryName);
		userData.flashcard.cards = userData.flashcard.cards.filter(
			(card) => card.category !== categoryName,
		);
		await userData.save();

		return { success: true };
	} catch (error) {
		console.error('カテゴリー削除エラー:', error);
		return {
			success: false,
			error: 'カテゴリーの削除中にエラーが発生しました。',
		};
	}
}

/**
 * 統計情報を取得する
 * @param {string} userId - ユーザーID
 * @returns {Promise<object>} 統計情報またはエラー情報
 */
async function getStats(userId) {
	try {
		const cardsResult = await getCard(userId);
		const cards =
			cardsResult && cardsResult.success && cardsResult.data
				? cardsResult.data
				: [];

		const stats = {
			totalCards: cards.length,
			totalReviews: cards.reduce((sum, card) => sum + card.reviewCount, 0),
			totalCorrect: cards.reduce((sum, card) => sum + card.correctCount, 0),
			totalIncorrect: cards.reduce((sum, card) => sum + card.incorrectCount, 0),
			averageAccuracy: 0,
			categoryCounts: {},
		};

		// 正解率を計算
		if (stats.totalReviews > 0) {
			stats.averageAccuracy = (stats.totalCorrect / stats.totalReviews) * 100;
		}

		// カテゴリ別カウント
		cards.forEach((card) => {
			stats.categoryCounts[card.category] =
				(stats.categoryCounts[card.category] || 0) + 1;
		});

		return { success: true, data: stats };
	} catch (error) {
		console.error('統計情報取得エラー:', error);
		return {
			success: false,
			error: '統計情報の取得中にエラーが発生しました。',
		};
	}
}

module.exports = {
	createCard,
	getCard,
	getRandom, //未使用
	deleteCard,
	clearCards, //未使用
	updateReview, //未使用
	createCategory,
	getCategories,
	deleteCategory,
	isValidCategory, //外部未使用
	getStats, //未使用
	ensureFlashcardsExist,
};
