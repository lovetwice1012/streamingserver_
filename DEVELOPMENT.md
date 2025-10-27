# 開発セットアップガイド

## 前提条件

- Node.js 18以上
- PostgreSQL 15以上
- npm または yarn

## ローカル開発環境のセットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd streamingserver
```

### 2. 依存関係のインストール

```bash
# バックエンド
npm install

# フロントエンド
cd dashboard
npm install
cd ..
```

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env` ファイルを編集:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/streamingserver"

# JWT
JWT_SECRET="your-random-secret-key"
JWT_EXPIRES_IN="7d"

# Server
HOST=0.0.0.0
PORT=3000
RTMP_PORT=1935

# Domain (開発環境では不要)
# DOMAIN=localhost
# API_URL=http://localhost:3000

# MediaMTX
MEDIAMTX_RTMP_URL="rtmp://localhost:8554"
MEDIAMTX_API_URL="http://localhost:9997"

# Storage paths
RECORDINGS_PATH="./recordings"
HLS_PATH="./server/media/live"

# Wasabi S3 (開発環境では任意)
WASABI_ACCESS_KEY_ID=your_key
WASABI_SECRET_ACCESS_KEY=your_secret
WASABI_BUCKET=your_bucket
WASABI_REGION=ap-northeast-1
WASABI_ENDPOINT=https://s3.ap-northeast-1.wasabisys.com

# Discord Webhook (任意)
# DISCORD_WEBHOOK_URL=
```

### 4. PostgreSQLデータベースの準備

```bash
# PostgreSQLにログイン
psql -U postgres

# データベース作成
CREATE DATABASE streamingserver;
\q
```

### 5. データベースのセットアップ

```bash
# Prismaクライアント生成とDBスキーマ適用
npx prisma generate
npx prisma db push

# 初期管理者ユーザー作成
node scripts/create-admin.js

# または一括で:
npm run setup
```

初期管理者アカウント:
- **ユーザー名**: `admin`
- **パスワード**: `admin`
- **⚠️ 重要**: 初回ログイン後すぐにパスワードを変更してください

### 6. MediaMTXのインストール（オプション）

RTSPストリーミングを使用する場合:

```bash
# ARM64の場合
wget https://github.com/bluenviron/mediamtx/releases/download/v1.5.1/mediamtx_v1.5.1_linux_arm64v8.tar.gz
tar -xzf mediamtx_v1.5.1_linux_arm64v8.tar.gz
chmod +x mediamtx

# x86_64の場合
wget https://github.com/bluenviron/mediamtx/releases/download/v1.5.1/mediamtx_v1.5.1_linux_amd64.tar.gz
tar -xzf mediamtx_v1.5.1_linux_amd64.tar.gz
chmod +x mediamtx

# 実行
./mediamtx mediamtx.yml
```

### 7. 開発サーバーの起動

**ターミナル1: バックエンド**
```bash
npm run dev
```

**ターミナル2: フロントエンド**
```bash
cd dashboard
npm run dev
```

**ターミナル3: MediaMTX (オプション)**
```bash
./mediamtx mediamtx.yml
```

### 8. アクセス

- **フロントエンド**: http://localhost:5173
- **バックエンドAPI**: http://localhost:3000
- **Prisma Studio**: `npx prisma studio` で起動 → http://localhost:5555

## データベース管理

### スキーマの変更

`prisma/schema.prisma` を編集後:

```bash
# 開発環境（データ保持）
npx prisma db push

# Prismaクライアント再生成
npx prisma generate
```

### データベースのリセット

```bash
# すべてのデータを削除して再作成
npx prisma db push --force-reset

# 初期管理者ユーザーを再作成
node scripts/create-admin.js
```

### データベースブラウザ

```bash
npx prisma studio
```

## 便利なコマンド

```bash
# バックエンド開発サーバー（自動リロード）
npm run dev

# 本番ビルド
npm start

# データベースセットアップ（初回のみ）
npm run setup

# Prisma Studio起動
npm run db:studio

# データベーススキーマ適用
npm run db:push
```

## トラブルシューティング

### データベース接続エラー

```bash
# PostgreSQLが起動しているか確認
sudo systemctl status postgresql

# 接続テスト
psql -U postgres -d streamingserver -c "SELECT 1"
```

### ポートが使用中

```bash
# ポートを使用しているプロセスを確認
lsof -i :3000
lsof -i :1935

# プロセスを停止
kill -9 <PID>
```

### Prismaエラー

```bash
# Prismaクライアントを再生成
npx prisma generate

# キャッシュをクリア
rm -rf node_modules/.prisma
npm install
```

## コーディング規約

### バックエンド
- ES6+ モジュール構文
- async/await を使用
- エラーハンドリングは必須
- console.log で適切なログ出力

### フロントエンド
- React関数コンポーネント
- Tailwind CSS でスタイリング
- TanStack Query でデータフェッチ
- Zustand で状態管理

## Git ワークフロー

```bash
# 機能開発
git checkout -b feature/your-feature-name
# 変更をコミット
git add .
git commit -m "feat: your feature description"
# プッシュ
git push origin feature/your-feature-name
```

## テスト配信

### OBS Studio設定

```
サーバー: rtmp://localhost:1935/live
ストリームキー: <管理者のStream Key>
```

管理者のStream Keyは:
- ダッシュボードの設定ページ
- または `node -e "require('@prisma/client').PrismaClient().user.findUnique({where:{username:'admin'}}).then(u=>console.log(u.streamKey))"`

## プロダクション向けビルド

### バックエンド

```bash
npm install --production
npm start
```

### フロントエンド

```bash
cd dashboard
npm run build
# distフォルダが生成される
```

## 追加リソース

- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Guide](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TanStack Query](https://tanstack.com/query)
