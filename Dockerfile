FROM node:24-bookworm-slim

WORKDIR /home/discord-bot

ENV NODE_ENV=production

# FFMPEG とネイティブモジュールのビルドに必要な最小限の依存関係だけ入れる
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ffmpeg \
		build-essential \
		python3 \
	&& rm -rf /var/lib/apt/lists/*

# 依存関係の解決に必要なファイルだけ先にコピーして、レイヤーキャッシュを効かせる
COPY package*.json ./

# 依存関係をインストールする
RUN npm ci

# アプリケーションのソースをバンドルする
COPY . .

# VOICEVOX のセットアップを実行する
RUN npm run build

# ボットを起動するコマンド
CMD [ "npm", "run", "main" ]