const Sentry = require('@sentry/node');

/**
 * イベントハンドラを、Sentryの分離スコープで実行するようにラップする。
 * ハンドラ内(非同期処理を含む)で captureException したエラーに、
 * コマンド名・サーバー・ユーザーなどの情報が付与される。
 * @param {(client: import('discord.js').Client, ...args: any[]) => any} handler - イベントハンドラ
 * @param {(...args: any[]) => {
 *   command?: string, guild?: any, channel?: any, user?: any
 * }} getContext - ハンドラの引数(clientを除く)から、Sentryに付与する情報を取り出す関数
 */
function withSentryContext(handler, getContext) {
	return (client, ...args) =>
		Sentry.withIsolationScope((scope) => {
			try {
				const { command, guild, channel, user } = getContext(...args);
				if (command) scope.setTag('command', command);
				if (guild?.id) {
					scope.setTag('guild_id', guild.id);
					if (guild.name) scope.setTag('guild_name', guild.name);
				}
				if (channel?.id) scope.setTag('channel_id', channel.id);
				if (user?.id) scope.setUser({ id: user.id, username: user.tag });
			} catch (err) {
				// コンテキスト取得の失敗でハンドラ本体を止めない
				void err;
			}
			return handler(client, ...args);
		});
}

module.exports = withSentryContext;
