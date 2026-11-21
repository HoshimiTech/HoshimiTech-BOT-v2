// Sentryの初期化。他のモジュールより先に読み込む必要があります。
require('dotenv').config({ quiet: true });
const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
	const environment = process.env.SENTRY_ENVIRONMENT || 'production';
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment,
		sendDefaultPii: false,
		enableLogs: true,
		// 開発環境では全トレースを送信し、本番環境では低めのサンプリング率にする
		tracesSampleRate:
			Number(process.env.SENTRY_TRACES_SAMPLE_RATE) ||
			(environment === 'production' ? 0.1 : 1.0),
	});
}
