# Ubuntu 24.04 LTS ARM64 インストールガイド

## 📋 前提条件

- Ubuntu 24.04 LTS (ARM64/aarch64)
- 最小スペック:
  - CPU: 4コア以上推奨
  - RAM: 4GB以上（8GB推奨）
  - ストレージ: 20GB以上の空き容量
- root権限またはsudo権限
- インターネット接続

## 🚀 クイックスタート

### 1. インストールスクリプトの実行

```bash
# スクリプトに実行権限を付与
chmod +x install-ubuntu-arm64.sh

# インストール実行（root権限が必要）
sudo ./install-ubuntu-arm64.sh
```

### 2. インストール完了後の設定

#### Wasabi S3 の設定

```bash
# .env ファイルを編集
sudo nano /opt/streamingserver/.env

# 以下の項目を実際の値に変更:
S3_ACCESS_KEY_ID="your-actual-access-key"
S3_SECRET_ACCESS_KEY="your-actual-secret-key"
S3_BUCKET="your-bucket-name"
```

#### サービスを再起動

```bash
sudo systemctl restart streamingserver
```

### 3. 初回ユーザー登録

ブラウザで `http://YOUR_SERVER_IP` にアクセスして、最初のユーザーを登録します。

### 4. 管理者権限の付与

```bash
cd /opt/streamingserver
sudo npm run db:studio
```

Prisma Studio が起動したら、`User` テーブルで作成したユーザーの `role` を `admin` に変更します。

または、SQLコマンドで直接変更:

```bash
sudo -u postgres psql streamingdb
```

```sql
UPDATE "User" SET role = 'admin' WHERE username = 'your-username';
\q
```

## 📦 インストールされるコンポーネント

### システムパッケージ
- **Node.js 18**: バックエンドランタイム
- **PostgreSQL 15**: データベース
- **FFmpeg**: 録画・エンコーディング
- **Nginx**: Webサーバー・リバースプロキシ
- **MediaMTX**: RTSP/RTMP メディアサーバー
- **UFW**: ファイアウォール

### アプリケーション
- **Streaming Server**: Node.jsバックエンド (`/opt/streamingserver`)
- **React Dashboard**: フロントエンド (`/opt/streamingserver/dashboard/dist`)
- **録画ディレクトリ**: `/var/streamingserver/recordings`

## 🔧 設定ファイル

### 主要な設定ファイル

| ファイル | 説明 |
|---------|------|
| `/opt/streamingserver/.env` | メイン設定ファイル |
| `/etc/mediamtx.yml` | MediaMTX設定 |
| `/etc/nginx/sites-available/streamingserver` | Nginx設定 |
| `/etc/systemd/system/streamingserver.service` | Streaming Serverサービス |
| `/etc/systemd/system/mediamtx.service` | MediaMTXサービス |

## 🎮 サービス管理

### サービスの起動・停止・再起動

```bash
# Streaming Server
sudo systemctl start streamingserver
sudo systemctl stop streamingserver
sudo systemctl restart streamingserver
sudo systemctl status streamingserver

# MediaMTX
sudo systemctl start mediamtx
sudo systemctl stop mediamtx
sudo systemctl restart mediamtx
sudo systemctl status mediamtx

# Nginx
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl status nginx
```

### ログの確認

```bash
# Streaming Server のログ
sudo journalctl -u streamingserver -f

# MediaMTX のログ
sudo journalctl -u mediamtx -f

# Nginx のログ
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# 直近50行のログを表示
sudo journalctl -u streamingserver -n 50
```

## 🌐 アクセス情報

### ポート

| ポート | 用途 |
|-------|------|
| 80 | HTTP (Dashboard/API) |
| 443 | HTTPS (SSL設定後) |
| 1935 | RTMP (配信入力) |
| 8554 | RTSP (MediaMTX) |
| 3000 | Node.js (内部) |
| 9997 | MediaMTX API (内部) |

### URL

- **Dashboard**: `http://YOUR_SERVER_IP/`
- **API**: `http://YOUR_SERVER_IP/api`
- **RTMP配信**: `rtmp://YOUR_SERVER_IP:1935/live/YOUR_STREAM_KEY`
- **RTSP**: `rtsp://YOUR_SERVER_IP:8554/`

## 🔒 SSL証明書の設定

### Let's Encrypt (Certbot) を使用

```bash
# ドメインを設定（example.com を実際のドメインに置き換え）
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 証明書の自動更新テスト
sudo certbot renew --dry-run
```

## 🔥 ファイアウォール設定

インストールスクリプトが自動的にUFWを設定しますが、手動で変更する場合:

```bash
# ポートを開く
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow 1935/tcp    # RTMP
sudo ufw allow 8554/tcp    # RTSP

# 状態確認
sudo ufw status

# 有効化
sudo ufw enable
```

## 🎥 OBS配信設定

### 設定手順

1. **OBS Studio** を開く
2. **設定 → 配信** に移動
3. 以下を設定:
   - **サービス**: カスタム
   - **サーバー**: `rtmp://YOUR_SERVER_IP:1935/live`
   - **ストリームキー**: ダッシュボードで確認したストリームキー
4. **適用** → **OK**
5. **配信開始**

## 📊 データベース管理

### Prisma Studio の起動

```bash
cd /opt/streamingserver
sudo npm run db:studio
```

ブラウザで `http://localhost:5555` にアクセス

### バックアップ

```bash
# データベースのバックアップ
sudo -u postgres pg_dump streamingdb > backup_$(date +%Y%m%d).sql

# リストア
sudo -u postgres psql streamingdb < backup_YYYYMMDD.sql
```

## 🔄 アップデート

```bash
# サービスを停止
sudo systemctl stop streamingserver

# コードを更新（Gitを使用している場合）
cd /opt/streamingserver
sudo git pull

# 依存関係を更新
sudo npm install

# データベースマイグレーション
sudo npx prisma generate
sudo npx prisma db push

# ダッシュボードを再ビルド
cd /opt/streamingserver/dashboard
sudo npm install
sudo npm run build

# サービスを再起動
sudo systemctl restart streamingserver
```

## 🐛 トラブルシューティング

### サービスが起動しない

```bash
# ログを確認
sudo journalctl -u streamingserver -n 100 --no-pager

# 設定ファイルを確認
sudo nano /opt/streamingserver/.env

# ポートの使用状況を確認
sudo netstat -tlnp | grep -E ':(3000|1935|8554)'
```

### データベース接続エラー

```bash
# PostgreSQLの状態確認
sudo systemctl status postgresql

# データベース接続テスト
sudo -u postgres psql -d streamingdb -c "SELECT 1;"

# パスワードのリセット（必要な場合）
sudo -u postgres psql
ALTER USER streamuser WITH PASSWORD 'new-password';
\q

# .env ファイルを更新
sudo nano /opt/streamingserver/.env
```

### RTMP配信が接続できない

```bash
# ファイアウォール確認
sudo ufw status

# ポート1935が開いているか確認
sudo netstat -tlnp | grep 1935

# Streaming Serverのログを確認
sudo journalctl -u streamingserver -f
```

### Nginxエラー

```bash
# Nginx設定テスト
sudo nginx -t

# エラーログ確認
sudo tail -f /var/log/nginx/error.log

# 設定を確認
sudo nano /etc/nginx/sites-available/streamingserver
```

## 📈 パフォーマンスチューニング

### Node.js メモリ制限の調整

```bash
sudo nano /etc/systemd/system/streamingserver.service
```

`[Service]` セクションに追加:

```ini
Environment=NODE_OPTIONS="--max-old-space-size=4096"
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart streamingserver
```

### PostgreSQL チューニング

```bash
sudo nano /etc/postgresql/15/main/postgresql.conf
```

推奨設定（8GBメモリの場合）:

```ini
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 64MB
```

```bash
sudo systemctl restart postgresql
```

## 🗑️ アンインストール

```bash
# サービスを停止・無効化
sudo systemctl stop streamingserver mediamtx
sudo systemctl disable streamingserver mediamtx

# サービスファイルを削除
sudo rm /etc/systemd/system/streamingserver.service
sudo rm /etc/systemd/system/mediamtx.service
sudo systemctl daemon-reload

# アプリケーションを削除
sudo rm -rf /opt/streamingserver
sudo rm -rf /var/streamingserver

# データベースを削除（オプション）
sudo -u postgres psql -c "DROP DATABASE streamingdb;"
sudo -u postgres psql -c "DROP USER streamuser;"

# Nginx設定を削除
sudo rm /etc/nginx/sites-available/streamingserver
sudo rm /etc/nginx/sites-enabled/streamingserver
sudo systemctl restart nginx

# MediaMTXを削除
sudo rm /usr/local/bin/mediamtx
sudo rm /etc/mediamtx.yml
```

## 📞 サポート

問題が発生した場合:

1. ログファイルを確認
2. `/opt/streamingserver/INSTALL_INFO.txt` を確認
3. GitHub Issues で報告

## 📝 注意事項

- **初回インストール後は必ずWasabi S3の設定を行ってください**
- **データベースのパスワードは安全に保管してください**
- **定期的にバックアップを取得してください**
- **本番環境では必ずSSL証明書を設定してください**
- **UFWやiptablesで適切にファイアウォールを設定してください**
