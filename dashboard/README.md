# Streaming Server - React Dashboard

モダンで先進的なReact製管理ダッシュボードを追加しました。

## 🎨 新機能

### ユーザー向け機能
- **ダッシュボード**: 配信状況、録画数、クォータ使用状況の一覧
- **録画管理**: 録画一覧、再生、削除機能
- **クォータ管理**: 録画・配信の使用状況をビジュアル表示
- **ストリームキー管理**: ワンクリックコピー機能

### 管理者向け機能
- **統計ダッシュボード**: システム全体の統計とグラフ
- **ユーザー管理**: 全ユーザーの一覧、編集、削除、ロール変更
- **配信セッション管理**: ライブ配信中・配信履歴の確認
- **録画管理**: システム全体の録画一覧と管理

## 📦 セットアップ

### 1. ダッシュボードの依存パッケージをインストール

```powershell
cd dashboard
npm install
```

### 2. データベースマイグレーション（管理者機能を追加したため）

```powershell
cd ..
npm run db:push
```

### 3. 起動

#### バックエンド（別ターミナル）
```powershell
npm run dev
```

#### ダッシュボード
```powershell
cd dashboard
npm run dev
```

ダッシュボードは http://localhost:5173 で起動します。

## 🎯 使い方

### 初回セットアップ

1. http://localhost:5173 にアクセス
2. 「新規登録」から最初のユーザーを作成
3. ログイン

### 管理者権限の付与

最初のユーザーを管理者にするには、データベースで直接更新：

```sql
UPDATE "User" SET role = 'admin' WHERE username = 'your-username';
```

または、Prisma Studio を使用：

```powershell
npm run db:studio
```

## 🎨 技術スタック

- **React 18** - UIフレームワーク
- **Vite** - ビルドツール
- **Tailwind CSS** - スタイリング
- **React Router** - ルーティング
- **TanStack Query** - データフェッチング
- **Zustand** - 状態管理
- **Chart.js** - グラフ描画
- **Lucide React** - アイコン
- **React Hot Toast** - 通知
- **Axios** - HTTP クライアント

## 📱 画面構成

### 一般ユーザー
- `/dashboard` - ダッシュボード
- `/recordings` - 録画一覧
- `/quota` - クォータ管理

### 管理者
- `/admin/stats` - システム統計
- `/admin/users` - ユーザー管理
- `/admin/sessions` - 配信セッション
- `/admin/recordings` - 全録画一覧

## 🔐 認証

- JWT トークンベース認証
- ローカルストレージに保存
- 自動ログアウト（トークン期限切れ時）
- 管理者権限チェック

## 🎨 UI/UX 特徴

- **レスポンシブデザイン**: モバイル・タブレット・デスクトップ対応
- **モダンなデザイン**: Tailwind CSS によるグラデーション、影、アニメーション
- **直感的な操作**: ワンクリック操作、ホバーエフェクト
- **リアルタイム更新**: TanStack Query による自動更新
- **通知システム**: 操作結果を即座に通知
- **ダークモード対応**: （将来実装予定）

## 📊 管理者機能詳細

### ユーザー管理
- ユーザー一覧表示
- インライン編集（ユーザー名、メール、ロール、状態）
- ユーザー削除（関連データも連動削除）
- 録画数・使用量の確認

### 配信セッション管理
- リアルタイムライブ配信の監視
- 配信履歴の確認
- 転送量の確認
- クォータ超過セッションの確認

### 統計ダッシュボード
- 総ユーザー数
- アクティブユーザー数
- ライブ配信数
- 総録画数
- ストレージ使用量
- 帯域幅使用量
- グラフ表示（Chart.js）

## 🔧 カスタマイズ

### テーマカラーの変更

`dashboard/tailwind.config.js` の `primary` カラーを変更：

```js
colors: {
  primary: {
    500: '#0ea5e9', // メインカラー
    600: '#0284c7', // ホバー時
    // ...
  }
}
```

### API エンドポイントの変更

`dashboard/vite.config.js` のプロキシ設定：

```js
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true
  }
}
```

## 🚀 本番環境デプロイ

### ダッシュボードをビルド

```powershell
cd dashboard
npm run build
```

ビルドされたファイルは `dashboard/dist` に出力されます。

### Nginx で配信（例）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Dashboard
    location / {
        root /path/to/dashboard/dist;
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📝 TODO（将来的な改善案）

- [ ] ダークモード対応
- [ ] リアルタイムライブプレビュー
- [ ] 配信スケジュール機能
- [ ] メール通知設定
- [ ] 2要素認証
- [ ] APIキー管理
- [ ] ログエクスポート機能
- [ ] ユーザーグループ管理

## 🐛 トラブルシューティング

### ダッシュボードが起動しない

```powershell
cd dashboard
rm -rf node_modules
npm install
```

### API接続エラー

- バックエンドが起動しているか確認
- `.env` の設定を確認
- CORS設定を確認

### ログインできない

- データベース接続を確認
- JWT_SECRET が設定されているか確認

## 📄 ライセンス

MIT
