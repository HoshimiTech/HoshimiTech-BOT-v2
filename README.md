# slash-command-ver

## 制作の参考にしたサイト

https://qiita.com/gaato/items/55b32bc4777905ac162a

## 招待リンクはこちら

[ここをクリック](https://discord.com/api/oauth2/authorize?client_id=949289830481821776&permissions=277025475600&scope=bot%20applications.commands)

# インストール

```
npm i discord.js qrcode @distube/ytsr mongoose
npm i --save-dev dotenv fs
```

# 開発者用

## テストについて

ローカル環境でもテスト可。管理者権限ターミナルで`net start MongoDB`ってして、index.jsでmongodbのtokenをローカル用に切り替えれば起動可能。終わったら`net stop MongoDB`で停止出来る。DBの中身をGUIで確認する場合は「MongoDB Compass」アプリを使用すること。
なお、MongoDBのサーバー上のデータベースを使用する場合は同様にindex.jsでmongodbのtokenをリモート用に切り替えれば起動可能。

## 有料化について

各種項目の数の制限解除や、pomodoroのvoice notificationの音声メッセージの内容を変えられたりとか
