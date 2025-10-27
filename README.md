# Streaming Server

Node.js製のライブ配信・録画システム。RTMP/RTSP対応、自動録画、クォータ管理、Discord通知機能、React製管理ダッシュボードを搭載。

## 🎨 React管理ダッシュボード

**新機能！** モダンで先進的なReact製管理ダッシュボードが追加されました。

- ✅ **ユーザー向け**: ダッシュボード、録画管理、クォータ表示
- ✅ **管理者向け**: 全ユーザー管理、配信セッション監視、システム統計
- ✅ **モダンUI**: Tailwind CSS + Lucide Icons
- ✅ **リアルタイム更新**: TanStack Query
- ✅ **レスポンシブ**: モバイル・タブレット・デスクトップ対応

詳細は [dashboard/README.md](./dashboard/README.md) をご覧ください。

## 主な機能

✅ **ユーザー認証（JWT）**
- ユーザー登録・ログイン
- ストリームキーによる配信認証

✅ **RTMP/RTMPS リバースプロキシ**
- node-media-server によるRTMP受信
- MediaMTX へのリレー機能
- ストリームキー認証

✅ **ライブ配信管理**
- 認証・バイト数計測
- リアルタイムクォータ制御
- 超過時の配信強制停止

✅ **自動録画システム**
- FFmpeg で MP4 録画
- Wasabi S3 への自動アップロード
- データベース登録

✅ **VOD 再生**
- HTTP (MP4) エンドポイント
- RTSP VOD 中継

✅ **RTSP プロキシ**
- ライブ配信の RTSP 中継
- 録画の RTSP VOD 配信

✅ **Discord ロギング**
- 各種イベントを個別 Webhook へ自動送信
- 配信開始・停止・録画・クォータ・エラー通知
- `npm run setup-discord` でチャンネル＆Webhook 自動生成

✅ **クォータ管理**
- 録画：1 GB / ユーザー（デフォルト）
- 月間配信：100 GB / ユーザー（デフォルト）
- リアルタイム消費監視
- 超過時の自動対応（配信停止・古い録画削除）

✅ **管理者機能**
- ユーザー管理（一覧・編集・削除・ロール変更）
- 配信セッション監視
- システム統計とグラフ
- 全録画の一覧と管理

## システム構成

```
┌─────────────┐
│   OBS etc   │ RTMP Push
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│   Node.js Streaming Server      │
│  ┌──────────────────────────┐  │
│  │  RTMP Server (port 1935) │  │
│  │  - Authentication        │  │
│  │  - Quota Check           │  │
│  └────────┬─────────────────┘  │
│           │                      │
│           ├─→ Recording (FFmpeg)│
│           │   └─→ Wasabi S3     │
│           │                      │
│           └─→ MediaMTX Relay    │
│                                  │
│  ┌──────────────────────────┐  │
│  │  HTTP API (port 3000)    │  │
│  │  - Auth, VOD, RTSP       │  │
│  └──────────────────────────┘  │
└─────────────────────────────────┘
```

## セットアップ

### 1. 前提条件

- Node.js 18+
- PostgreSQL
- FFmpeg
- MediaMTX (オプション)

### 2. インストール

```bash
cd streamingserver_
npm install
```

### 3. 環境変数設定

`.env.example` を `.env` にコピーして編集：

```bash
cp .env.example .env
```

主な設定項目：

```env
# データベース
DATABASE_URL="postgresql://user:password@localhost:5432/streamingdb"

# JWT シークレット
JWT_SECRET="your-secret-key-change-this"

# Wasabi S3
S3_ENDPOINT="https://s3.wasabisys.com"
S3_ACCESS_KEY_ID="your-access-key"
S3_SECRET_ACCESS_KEY="your-secret-key"
S3_BUCKET="your-bucket-name"

# クォータ設定
QUOTA_RECORDING_GB=1
QUOTA_MONTHLY_STREAMING_GB=100
```

### 4. データベースのセットアップと初期管理者ユーザー作成

```bash
npm run setup
```

これにより以下が実行されます：
- Prismaクライアント生成
- データベーススキーマ適用
- 初期管理者ユーザー作成（username: `admin`, password: `admin`）

⚠️ **重要**: 初回ログイン後すぐにパスワードを変更してください！

### 5. 起動

#### バックエンド

```bash
# 開発モード
npm run dev

# 本番モード
npm start
```

#### React ダッシュボード（別ターミナル）

```bash
cd dashboard
npm install
npm run dev
```

ダッシュボードは http://localhost:5173 で起動します。

## 🎨 ダッシュボード使用方法

### 初回アクセス

1. http://localhost:5173 にアクセス
2. 「新規登録」から最初のユーザーを作成
3. ログイン

### 管理者権限の付与

最初のユーザーを管理者にするには：

```bash
# Prisma Studio を開く
npm run db:studio

# または SQL で直接更新
# UPDATE "User" SET role = 'admin' WHERE username = 'your-username';
```

### ダッシュボード機能

#### 一般ユーザー
- **ダッシュボード**: ストリームキー表示、使用状況、最近の録画
- **録画**: 録画一覧、再生、削除
- **クォータ**: 録画・配信の使用状況をグラフ表示

#### 管理者
- **統計**: システム全体の統計とグラフ
- **ユーザー管理**: 全ユーザーの編集・削除・ロール変更
- **配信セッション**: ライブ配信監視と履歴
- **全録画**: システム全体の録画管理

## API エンドポイント

### 認証

#### ユーザー登録
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "user1",
  "email": "user1@example.com",
  "password": "password123"
}
```

#### ログイン
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "user1",
  "password": "password123"
}
```

レスポンス：
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": "user1",
    "email": "user1@example.com",
    "streamKey": "stream-key-uuid"
  }
}
```

### 録画管理

#### 録画一覧取得
```http
GET /api/recordings
Authorization: Bearer <token>
```

#### 録画詳細取得
```http
GET /api/recordings/:id
Authorization: Bearer <token>
```

#### 録画削除
```http
DELETE /api/recordings/:id
Authorization: Bearer <token>
```

#### 録画再生（MP4）
```http
GET /api/recordings/:id/play
Authorization: Bearer <token>
```

### RTSP プロキシ

#### ライブ配信 RTSP 開始
```http
POST /api/rtsp/live/:streamKey
Authorization: Bearer <token>
Content-Type: application/json

{
  "port": 9999
}
```

#### VOD RTSP 開始
```http
POST /api/rtsp/vod/:recordingId
Authorization: Bearer <token>
Content-Type: application/json

{
  "port": 9998
}
```

### クォータ確認

```http
GET /api/quota
Authorization: Bearer <token>
```

### 管理者API（admin権限必要）

#### ユーザー一覧
```http
GET /api/admin/users
Authorization: Bearer <admin-token>
```

#### ユーザー編集
```http
PUT /api/admin/users/:id
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "username": "newname",
  "role": "admin",
  "isActive": true
}
```

#### システム統計
```http
GET /api/admin/stats
Authorization: Bearer <admin-token>
```

#### 配信セッション一覧
```http
GET /api/admin/sessions
Authorization: Bearer <admin-token>
```

レスポンス：
```json
{
  "recording": {
    "used": "524288000",
    "limit": "1073741824",
    "usedGB": 0.5,
    "limitGB": 1.0,
    "percentUsed": "50.00"
  },
  "streaming": {
    "used": "10737418240",
    "limit": "107374182400",
    "usedGB": 10.0,
    "limitGB": 100.0,
    "percentUsed": "10.00",
    "resetAt": "2025-11-01T00:00:00.000Z"
  }
}
```

## 配信方法

### OBS Studio での配信設定

1. **設定 → 配信**
2. **サービス**: カスタム
3. **サーバー**: `rtmp://your-server:1935/live`
4. **ストリームキー**: ユーザー登録時に取得したストリームキー

### FFmpeg での配信

```bash
ffmpeg -re -i input.mp4 -c copy -f flv rtmp://your-server:1935/live/YOUR_STREAM_KEY
```

## MediaMTX 連携

MediaMTX の設定例（`mediamtx.yml`）：

```yaml
paths:
  all:
    source: rtmp://localhost:1935/live/$name
    sourceOnDemand: yes
    runOnDemand: ffmpeg -i rtmp://localhost:1935/live/$name -c copy -f rtsp rtsp://localhost:8554/$name
```

## Docker Compose（参考）

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: streamuser
      POSTGRES_PASSWORD: streampass
      POSTGRES_DB: streamingdb
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  streaming-server:
    build: .
    ports:
      - "3000:3000"
      - "1935:1935"
    environment:
      DATABASE_URL: postgresql://streamuser:streampass@postgres:5432/streamingdb
    volumes:
      - ./recordings:/app/recordings
    depends_on:
      - postgres

  mediamtx:
    image: bluenviron/mediamtx:latest
    ports:
      - "8554:8554"
      - "1936:1936"
      - "8889:8889"
    volumes:
      - ./mediamtx.yml:/mediamtx.yml

volumes:
  postgres_data:
```

## 技術スタック

### バックエンド
- **Node.js** - バックエンド
- **Express** - HTTP API
- **node-media-server** - RTMP サーバー
- **Prisma** - ORM
- **PostgreSQL** - データベース
- **FFmpeg** - 録画・変換
- **AWS SDK** - Wasabi S3 連携
- **JWT** - 認証
- **Discord Webhooks** - ロギング

### フロントエンド（ダッシュボード）
- **React 18** - UIフレームワーク
- **Vite** - ビルドツール
- **Tailwind CSS** - スタイリング
- **React Router** - ルーティング
- **TanStack Query** - データフェッチング
- **Zustand** - 状態管理
- **Chart.js** - グラフ描画
- **Lucide React** - アイコン

## トラブルシューティング

### FFmpeg が見つからない

```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
# https://ffmpeg.org/download.html からダウンロード
```

### データベース接続エラー

`.env` の `DATABASE_URL` を確認してください。PostgreSQL が起動していることも確認してください。

### 配信が認証エラーになる

- ストリームキーが正しいか確認
- ユーザーが正しく登録されているか確認
- クォータが超過していないか確認

## ライセンス

MIT

## 作者

GitHub Copilot
