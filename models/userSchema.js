const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
	{
		_id: { type: String }, //ユーザーID
		flashcard: {
			categories: { type: [String], default: ['一般'] }, //利用可能なカテゴリー一覧
			cards: [
				{
					word: { type: String, required: true }, //キーワード（表面）
					meaning: { type: String, required: true }, //定義（裏面）
					category: { type: String, default: '一般' }, //カテゴリ
					createdAt: { type: Date, default: Date.now }, //作成日時
					lastReviewed: { type: Date }, //最後に確認した日時
					reviewCount: { type: Number, default: 0 }, //確認回数
					correctCount: { type: Number, default: 0 }, //正解回数
					incorrectCount: { type: Number, default: 0 }, //不正解回数
				},
			],
		},
	},
	{ versionKey: false },
);

const model = mongoose.model('users', userSchema);

module.exports = model;
