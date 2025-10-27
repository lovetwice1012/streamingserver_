# ストリーミングサーバー セットアップガイド

## 事前準備

### 1. ドメインの設定

インストール前に、ドメインのDNSレコードを設定してください。

```bash
# AレコードでサーバーのIPアドレスを指定
stream.example.com  A  123.456.789.0
```

### 2. Wasabiアカウントの準備

1. [Wasabi Console](https://console.wasabisys.com/)にログイン
2. バケットを作成
3. アクセスキーとシークレットキーを取得

### 3. サーバーの準備

```bash
# Ubuntu 24.04 LTS (ARM64) をインストール
# rootまたはsudo権限のあるユーザーでログイン

# システムを最新化
sudo apt update && sudo apt upgrade -y
```

### 4. Let's Encrypt SSL証明書について

インストールスクリプトは自動的にLet's Encryptを使用してSSL証明書を取得します。事前に以下を確認してください：

- ドメインが正しくサーバーのIPアドレスに解決されること
- ポート80と443がファイアウォールで開放されていること
- サーバーが外部からアクセス可能であること

## インストール方法

### ARM64 Ubuntu 24.04 LTS への自動インストール

```bash
# インストールスクリプトをダウンロード
wget https://your-repo/install-ubuntu-arm64.sh

# 実行権限を付与
chmod +x install-ubuntu-arm64.sh

# インストール実行（すべての引数が必須）
sudo ./install-ubuntu-arm64.sh \
  --domain stream.example.com \
  --email admin@example.com \
  --wasabi-key YOUR_WASABI_ACCESS_KEY \
  --wasabi-secret YOUR_WASABI_SECRET_KEY \
  --wasabi-bucket your-recordings-bucket \
  --wasabi-region ap-northeast-1
```

### パラメータ説明

| パラメータ | 短縮形 | 必須 | 説明 |
|----------|--------|------|------|
| `--domain` | `-d` | ✅ | サーバーのドメイン名 |
| `--email` | `-e` | ✅ | SSL証明書用のメールアドレス |
| `--wasabi-key` | `-w` | ✅ | Wasabiアクセスキー |
| `--wasabi-secret` | `-s` | ✅ | Wasabiシークレットキー |
| `--wasabi-bucket` | `-b` | ✅ | Wasabiバケット名 |
| `--wasabi-region` | `-r` | ❌ | Wasabiリージョン（デフォルト: ap-northeast-1） |

### Wasabiリージョン一覧

| リージョン名 | エンドポイント |
|------------|---------------|
| `us-east-1` | バージニア北部（米国東部） |
| `us-east-2` | バージニア北部（米国東部） |
| `us-west-1` | オレゴン（米国西部） |
| `eu-central-1` | アムステルダム（ヨーロッパ） |
| `ap-northeast-1` | 東京（アジア太平洋） |
| `ap-northeast-2` | 大阪（アジア太平洋） |

## インストール後の確認

### 1. サービス状態の確認

```bash
# アプリケーションサーバーの確認
sudo systemctl status streamingserver

# MediaMTXの確認
sudo systemctl status mediamtx

# Nginxの確認
sudo systemctl status nginx

# PostgreSQLの確認
sudo systemctl status postgresql
```

### 2. ログの確認

```bash
# アプリケーションログ
sudo journalctl -u streamingserver -f

# MediaMTXログ
sudo journalctl -u mediamtx -f

# Nginxエラーログ
sudo tail -f /var/log/nginx/error.log
```

### 3. SSL証明書の確認

```bash
# 証明書の確認
sudo certbot certificates

# 更新テスト（実際には更新しない）
sudo certbot renew --dry-run
```

### 4. ファイアウォールの確認

```bash
# UFW状態確認
sudo ufw status verbose
```

開放されているポート:
- `80/tcp` - HTTP（HTTPSへリダイレクト）
- `443/tcp` - HTTPS（API、ダッシュボード）
- `1935/tcp` - RTMP（ストリーミング）
- `8554/tcp` - RTSP（ストリーミング）

## 初回セットアップ

### 1. 管理者アカウントでログイン

インストール時に自動的に作成された管理者アカウントでログインします。

```
URL: https://stream.example.com/
ユーザー名: admin
パスワード: admin
```

⚠️ **重要**: セキュリティのため、初回ログイン後すぐにパスワードを変更してください！

### 2. パスワードの変更

ログイン後、プロフィール設定からパスワードを変更します。

### 3. OBS Studioでの配信設定

```
サーバー: rtmp://stream.example.com:1935/live
ストリームキー: <ダッシュボードに表示されるStream Key>
```

管理者のStream Keyは `INSTALLATION_INFO.txt` にも記載されています。

### 4. Discord通知の設定（オプション）

```bash
# .envファイルを編集
sudo nano /opt/streamingserver/.env

# Discord Webhookを追加
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# サービスを再起動
sudo systemctl restart streamingserver
```

## トラブルシューティング

### SSL証明書の取得に失敗する

```bash
# DNSの伝播を確認
dig +short stream.example.com

# 手動で証明書を取得
sudo certbot --nginx -d stream.example.com
```

### Wasabiへのアップロードが失敗する

```bash
# .envファイルの設定を確認
sudo cat /opt/streamingserver/.env | grep WASABI

# バケットのアクセス権限を確認
# Wasabi Consoleでバケットポリシーを確認

# アプリケーションログでエラーを確認
sudo journalctl -u streamingserver -n 100
```

### ストリーミングに接続できない

```bash
# ファイアウォールの確認
sudo ufw status

# ポート1935と8554が開放されているか確認
sudo netstat -tlnp | grep -E '1935|8554'

# MediaMTXのログを確認
sudo journalctl -u mediamtx -f
```

### データベース接続エラー

```bash
# PostgreSQLの状態確認
sudo systemctl status postgresql

# データベースの確認
sudo -u postgres psql -c "\l" | grep streamingserver

# パスワードの確認（INSTALLATION_INFO.txtを参照）
sudo cat /opt/streamingserver/INSTALLATION_INFO.txt
```

## バックアップと復元

### データベースバックアップ

```bash
# バックアップ作成
sudo -u postgres pg_dump streamingserver > backup_$(date +%Y%m%d).sql

# 復元
sudo -u postgres psql streamingserver < backup_20241026.sql
```

### 設定ファイルのバックアップ

```bash
# 重要なファイルをバックアップ
sudo tar -czf streamingserver_config_$(date +%Y%m%d).tar.gz \
  /opt/streamingserver/.env \
  /opt/streamingserver/INSTALLATION_INFO.txt \
  /opt/mediamtx/mediamtx.yml \
  /etc/nginx/sites-available/streamingserver
```

## アップデート

```bash
# アプリケーションコードの更新
cd /opt/streamingserver
sudo git pull

# 依存関係の更新
sudo npm install

# データベースマイグレーション
sudo npx prisma migrate deploy

# ダッシュボードの再ビルド
cd dashboard
sudo npm install
sudo npm run build

# サービスの再起動
sudo systemctl restart streamingserver
```

## アンインストール

```bash
# サービスの停止と無効化
sudo systemctl stop streamingserver mediamtx
sudo systemctl disable streamingserver mediamtx

# サービスファイルの削除
sudo rm /etc/systemd/system/streamingserver.service
sudo rm /etc/systemd/system/mediamtx.service
sudo systemctl daemon-reload

# アプリケーションの削除
sudo rm -rf /opt/streamingserver
sudo rm -rf /opt/mediamtx

# データベースの削除
sudo -u postgres psql -c "DROP DATABASE streamingserver;"
sudo -u postgres psql -c "DROP USER streamuser;"

# Nginx設定の削除
sudo rm /etc/nginx/sites-available/streamingserver
sudo rm /etc/nginx/sites-enabled/streamingserver
sudo systemctl restart nginx

# SSL証明書の削除
sudo certbot delete --cert-name stream.example.com

# ファイアウォールルールの削除
sudo ufw delete allow 1935/tcp
sudo ufw delete allow 8554/tcp
```

## セキュリティ推奨事項

1. **定期的な更新**: システムパッケージとアプリケーションを定期的に更新
2. **強力なパスワード**: データベースとJWTシークレットを複雑に
3. **ファイアウォール**: 必要なポートのみ開放
4. **SSL証明書**: 必ずHTTPSを使用
5. **バックアップ**: 定期的なデータベースバックアップ
6. **ログ監視**: 異常なアクセスやエラーを監視
7. **Discord通知**: 重要なイベントの通知を設定

## サポート

問題が発生した場合:

1. ログファイルを確認
2. INSTALLATION_INFO.txtで設定を確認
3. このガイドのトラブルシューティングセクションを参照
4. GitHubのIssueで報告

## ライセンス

MIT License
