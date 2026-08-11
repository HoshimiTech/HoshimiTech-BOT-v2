const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema(
	{
		_id: { type: String }, //サーバーID
		sticky: {
			status: { type: Boolean }, //スティッキーメッセージの有効/無効
			channels: [
				{
					_id: { type: String },
					stickyMessage: {
						oldMessageId: { type: String }, //送信済みメッセージのメッセージID
						message: {
							title: { type: String },
							body: { type: String },
							imageURL: { type: String },
						},
					},
				},
			], //スティッキーメッセージのチャンネルIDとメッセージ
		},
		starboard: {
			status: { type: Boolean }, //スターボードの有効/無効
			board: [
				{
					_id: { type: String }, //スターボードのチャンネルID
					emoji: { type: String }, //スターボードの投票カウントをする絵文字の設定
					emojiAmount: { type: Number }, //スターボードに表示するスターの数
				},
			],
			transportedMessages: [{ type: String }],
		},
		pomodoro: {
			interval: {
				workTime: { type: Number, default: 25 }, //デフォルトの作業時間（分）
				breakTime: { type: Number, default: 5 }, //デフォルトの休憩時間（分）
				longBreakTime: { type: Number, default: 15 }, //デフォルトの長い休憩時間（分）
			},
			timesUntilLongBreak: { type: Number, default: 4 }, //デフォルトの長い休憩までの回数
			voiceNotification: {
				status: { type: Boolean, default: false }, //ボイス通知の有効/無効
				volume: { type: Number, default: 50 }, //ボイス通知の音量（1-100%）
			},
		},
	},
	{ versionKey: false },
);

const model = mongoose.model('servers', serverSchema);

module.exports = model;
