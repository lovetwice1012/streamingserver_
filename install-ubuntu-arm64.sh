#!/bin/bash
set -e

################################################################################
# Streaming Server - Ubuntu 24.04 LTS ARM64 自動インストールスクリプト
# 
# このスクリプトは以下をインストール・設定します：
# - Node.js 18
# - PostgreSQL 15
# - FFmpeg
# - Streaming Server
# - React Dashboard
# - MediaMTX
# - SSL証明書（Let's Encrypt）
# - Wasabi S3設定
#
# 使用方法:
#   sudo ./install-ubuntu-arm64.sh \
#     --domain stream.example.com \
#     --email admin@example.com \
#     --wasabi-key YOUR_ACCESS_KEY \
#     --wasabi-secret YOUR_SECRET_KEY \
#     --wasabi-bucket your-bucket
################################################################################

# カラー出力用
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ログ関数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# エラーハンドリング
error_exit() {
    log_error "$1"
    exit 1
}

# 使用方法を表示
show_usage() {
    cat << EOF
使用方法: $0 [オプション]

オプション:
    -d, --domain DOMAIN          ドメイン名 (必須)
    -e, --email EMAIL           Let's Encrypt用メールアドレス (SSL証明書用、必須)
    -w, --wasabi-key KEY        Wasabi アクセスキー (必須)
    -s, --wasabi-secret SECRET  Wasabi シークレットキー (必須)
    -b, --wasabi-bucket BUCKET  Wasabi バケット名 (必須)
    -r, --wasabi-region REGION  Wasabi リージョン (デフォルト: ap-northeast-1)
    -h, --help                  このヘルプを表示

例:
    $0 -d stream.example.com -e admin@example.com \\
       -w WASABI_ACCESS_KEY -s WASABI_SECRET_KEY \\
       -b my-recordings-bucket

EOF
    exit 0
}

# 引数のパース
DOMAIN=""
EMAIL=""
WASABI_ACCESS_KEY=""
WASABI_SECRET_KEY=""
WASABI_BUCKET=""
WASABI_REGION="ap-northeast-1"

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--domain)
            DOMAIN="$2"
            shift 2
            ;;
        -e|--email)
            EMAIL="$2"
            shift 2
            ;;
        -w|--wasabi-key)
            WASABI_ACCESS_KEY="$2"
            shift 2
            ;;
        -s|--wasabi-secret)
            WASABI_SECRET_KEY="$2"
            shift 2
            ;;
        -b|--wasabi-bucket)
            WASABI_BUCKET="$2"
            shift 2
            ;;
        -r|--wasabi-region)
            WASABI_REGION="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            ;;
        *)
            log_error "不明なオプション: $1"
            show_usage
            ;;
    esac
done

# 必須パラメータのチェック
if [[ -z "$DOMAIN" ]] || [[ -z "$EMAIL" ]] || [[ -z "$WASABI_ACCESS_KEY" ]] || [[ -z "$WASABI_SECRET_KEY" ]] || [[ -z "$WASABI_BUCKET" ]]; then
    log_error "必須パラメータが不足しています"
    show_usage
fi

# root権限チェック
if [ "$EUID" -ne 0 ]; then 
    error_exit "このスクリプトはroot権限で実行する必要があります"
fi

log_info "=== ARM64 Ubuntu 24.04 LTS ストリーミングサーバー インストールスクリプト ==="
log_info "ドメイン: $DOMAIN"
log_info "メール: $EMAIL"
log_info "Wasabi バケット: $WASABI_BUCKET"
log_info "Wasabi リージョン: $WASABI_REGION"

# 設定変数
NODE_VERSION="18"
POSTGRES_VERSION="15"
MEDIAMTX_VERSION="v1.5.1"
MEDIAMTX_ARCH="arm64v8"

# 作業ディレクトリ
INSTALL_DIR="/opt/streamingserver"
MEDIAMTX_DIR="/opt/mediamtx"

# ランダムなパスワードとシークレットを生成
DB_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)

# データベース設定
DB_NAME="streamingserver"
DB_USER="streamuser"

# MediaMTX
MEDIAMTX_RTMP_URL="rtmp://0.0.0.0:8554"
MEDIAMTX_API_URL="http://0.0.0.0:9997"

# Wasabi S3エンドポイント
WASABI_ENDPOINT="https://s3.${WASABI_REGION}.wasabisys.com"

# ============================================
# システムパッケージのインストール
# ============================================
log_info "システムを更新中..."
apt-get update
apt-get upgrade -y

log_info "必要なパッケージをインストール中..."
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    ffmpeg \
    nginx \
    postgresql-${POSTGRES_VERSION} \
    postgresql-contrib \
    ufw \
    certbot \
    python3-certbot-nginx \
    dnsutils \
    || error_exit "パッケージのインストールに失敗しました"

# ============================================
# Node.js 18 のインストール
# ============================================
log_info "Node.js ${NODE_VERSION} をインストール中..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
    log_info "Node.js $(node -v) をインストールしました"
else
    log_info "Node.js は既にインストールされています: $(node -v)"
fi

# ============================================
# PostgreSQL のセットアップ
# ============================================
log_info "PostgreSQL をセットアップ中..."
systemctl start postgresql
systemctl enable postgresql

# データベースとユーザーの作成
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || log_info "ユーザー ${DB_USER} は既に存在します"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || log_info "データベース ${DB_NAME} は既に存在します"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

log_info "PostgreSQL のセットアップが完了しました"

# ============================================
# アプリケーションのセットアップ
# ============================================
log_info "アプリケーションをセットアップ中..."

# インストールディレクトリを作成
mkdir -p ${INSTALL_DIR}
cd ${INSTALL_DIR}

# 既存のファイルがある場合はバックアップ
if [ -d "${INSTALL_DIR}/.git" ]; then
    log_info "既存のインストールを検出しました。バックアップ中..."
    cp -r ${INSTALL_DIR} ${INSTALL_DIR}.backup.$(date +%Y%m%d_%H%M%S)
fi

# 現在のディレクトリのファイルをコピー（スクリプトが実行されたディレクトリから）
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
log_info "アプリケーションファイルをコピー中..."
cp -r ${SCRIPT_DIR}/* ${INSTALL_DIR}/ 2>/dev/null || log_warn "一部のファイルのコピーに失敗しました"

# .env ファイルの作成
log_info ".env ファイルを作成中..."
cat > .env <<EOF
# Database
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"

# JWT
JWT_SECRET="${JWT_SECRET}"
JWT_EXPIRES_IN="7d"

# Server
HOST=0.0.0.0
PORT=3000
RTMP_PORT=1935
RTMPS_PORT=1936

# Domain
DOMAIN="${DOMAIN}"
API_URL="https://${DOMAIN}"

# MediaMTX
MEDIAMTX_RTMP_URL="${MEDIAMTX_RTMP_URL}"
MEDIAMTX_API_URL="${MEDIAMTX_API_URL}"

# Storage paths
RECORDINGS_PATH="./recordings"
HLS_PATH="./server/media/live"

# Wasabi S3
WASABI_ACCESS_KEY_ID="${WASABI_ACCESS_KEY}"
WASABI_SECRET_ACCESS_KEY="${WASABI_SECRET_KEY}"
WASABI_BUCKET="${WASABI_BUCKET}"
WASABI_REGION="${WASABI_REGION}"
WASABI_ENDPOINT="${WASABI_ENDPOINT}"

# Discord Webhook (オプション)
# DISCORD_WEBHOOK_URL=your_webhook_url
EOF

chmod 600 .env

# 依存関係のインストール
log_info "npm パッケージをインストール中..."
npm install --production

# Prisma のセットアップ
log_info "Prisma をセットアップ中..."
npx prisma generate
npx prisma db push --accept-data-loss

# ============================================
# 初期管理者ユーザーの作成
# ============================================
log_info "初期管理者ユーザーを作成中..."
npm run setup > /dev/null 2>&1 || node scripts/create-admin.js

log_info "初期管理者ユーザーの作成が完了しました"

log_info "サーバーのセットアップが完了しました"

# ============================================
# React ダッシュボードのビルド
# ============================================
log_info "React ダッシュボードをビルド中..."
cd ${INSTALL_DIR}/dashboard
npm install
npm run build

# ビルドしたファイルをNginxで配信できる場所に配置
mkdir -p /var/www/streamingserver
cp -r dist/* /var/www/streamingserver/

log_info "ダッシュボードのビルドが完了しました"

# ============================================
# MediaMTX のインストール
# ============================================
log_info "MediaMTX をインストール中..."
mkdir -p ${MEDIAMTX_DIR}
cd ${MEDIAMTX_DIR}

# MediaMTX のダウンロード
MEDIAMTX_URL="https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${MEDIAMTX_ARCH}.tar.gz"
wget ${MEDIAMTX_URL} -O mediamtx.tar.gz
tar -xzf mediamtx.tar.gz
rm mediamtx.tar.gz
chmod +x mediamtx

# MediaMTX 設定ファイルをコピー
cp ${INSTALL_DIR}/mediamtx.yml ${MEDIAMTX_DIR}/mediamtx.yml

log_info "MediaMTX のインストールが完了しました"

# ============================================
# systemd サービスの作成
# ============================================
log_info "systemd サービスを作成中..."

# Streaming Server サービス
cat > /etc/systemd/system/streamingserver.service <<EOF
[Unit]
Description=Streaming Server
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# MediaMTX サービス
cat > /etc/systemd/system/mediamtx.service <<EOF
[Unit]
Description=MediaMTX RTSP Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${MEDIAMTX_DIR}
ExecStart=${MEDIAMTX_DIR}/mediamtx ${MEDIAMTX_DIR}/mediamtx.yml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable streamingserver
systemctl enable mediamtx

log_info "systemd サービスの作成が完了しました"

# ============================================
# Nginx 設定
# ============================================
log_info "Nginx を設定中..."
cat > /etc/nginx/sites-available/streamingserver <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    # API proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # React dashboard
    location / {
        root /var/www/streamingserver;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/streamingserver /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t || error_exit "Nginx 設定が無効です"
systemctl restart nginx

# ============================================
# SSL証明書のインストール
# ============================================
log_info "SSL証明書を取得中..."

# DNSレコードの確認
log_warn "DNS確認: ${DOMAIN} がこのサーバーのIPアドレスを指していることを確認してください"
SERVER_IP=$(curl -s ifconfig.me)
log_info "このサーバーのIPアドレス: ${SERVER_IP}"
DOMAIN_IP=$(dig +short ${DOMAIN} | tail -n1)
log_info "${DOMAIN} の現在のIPアドレス: ${DOMAIN_IP}"

if [[ "$SERVER_IP" != "$DOMAIN_IP" ]]; then
    log_warn "警告: ドメインのIPアドレスがこのサーバーと一致しません"
    log_warn "Let's Encrypt証明書の取得に失敗する可能性があります"
    read -p "続行しますか? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "DNSレコードを設定してから再実行してください"
        exit 1
    fi
fi

# Certbotで証明書を取得
log_info "Certbotで証明書を取得しています..."
certbot --nginx \
    -d ${DOMAIN} \
    --non-interactive \
    --agree-tos \
    --email ${EMAIL} \
    --redirect \
    || log_warn "SSL証明書の取得に失敗しました。手動で設定が必要です: sudo certbot --nginx -d ${DOMAIN}"

# 証明書の自動更新設定
log_info "証明書の自動更新を設定中..."
systemctl enable certbot.timer
systemctl start certbot.timer

# ============================================
# ファイアウォール設定
# ============================================
log_info "ファイアウォールを設定中..."
ufw --force enable
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 1935/tcp  # RTMP
ufw allow 8554/tcp  # RTSP

log_info "ファイアウォールの設定が完了しました"

# ============================================
# サービスの起動
# ============================================
log_info "サービスを起動中..."
systemctl start streamingserver
systemctl start mediamtx

# サービスの状態を確認
sleep 3
if systemctl is-active --quiet streamingserver; then
    log_info "✓ Streaming Server が起動しました"
else
    log_error "✗ Streaming Server の起動に失敗しました"
fi

if systemctl is-active --quiet mediamtx; then
    log_info "✓ MediaMTX が起動しました"
else
    log_error "✗ MediaMTX の起動に失敗しました"
fi

# ============================================
# インストール情報の保存
# ============================================
log_info "インストール情報を保存中..."

# 管理者のストリームキーを取得
ADMIN_STREAM_KEY=$(node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findUnique({ where: { username: 'admin' } })
  .then(user => { 
    if (user) console.log(user.streamKey); 
    else console.log('N/A'); 
    process.exit(0); 
  })
  .catch(() => { console.log('N/A'); process.exit(0); });
" 2>/dev/null || echo "N/A")

cat > ${INSTALL_DIR}/INSTALLATION_INFO.txt <<EOF
=== ストリーミングサーバー インストール情報 ===
インストール日時: $(date)

ドメイン情報:
- ドメイン: ${DOMAIN}
- Email: ${EMAIL}
- サーバーIP: ${SERVER_IP}

初期管理者アカウント:
- ユーザー名: admin
- パスワード: admin
- Email: admin@localhost
- Stream Key: ${ADMIN_STREAM_KEY}
※ セキュリティのため、初回ログイン後すぐにパスワードを変更してください！

データベース情報:
- データベース名: ${DB_NAME}
- ユーザー名: ${DB_USER}
- パスワード: ${DB_PASSWORD}

セキュリティ:
- JWT Secret: ${JWT_SECRET}

Wasabi S3情報:
- アクセスキー: ${WASABI_ACCESS_KEY}
- シークレットキー: ${WASABI_SECRET_KEY}
- バケット: ${WASABI_BUCKET}
- リージョン: ${WASABI_REGION}
- エンドポイント: ${WASABI_ENDPOINT}

サービスURL:
- ダッシュボード: https://${DOMAIN}/
- API: https://${DOMAIN}/api
- RTMP: rtmp://${DOMAIN}:1935
- RTSP: rtsp://${DOMAIN}:8554

MediaMTX:
- 設定: ${MEDIAMTX_DIR}/mediamtx.yml
- API: ${MEDIAMTX_API_URL}

重要なファイル:
- アプリケーション: ${INSTALL_DIR}
- 環境設定: ${INSTALL_DIR}/.env
- Nginx設定: /etc/nginx/sites-available/streamingserver
- SSL証明書: /etc/letsencrypt/live/${DOMAIN}/
- systemdサービス:
  - /etc/systemd/system/streamingserver.service
  - /etc/systemd/system/mediamtx.service

このファイルは機密情報を含んでいます。安全に保管してください。
EOF

chmod 600 ${INSTALL_DIR}/INSTALLATION_INFO.txt

# ============================================
# 完了メッセージ
# ============================================
log_info ""
log_info "=== インストール完了 ==="
log_info ""
log_info "ストリーミングサーバーのインストールが完了しました！"
log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "初期管理者アカウント:"
log_info "  ユーザー名: admin"
log_info "  パスワード: admin"
log_warn "  ⚠️  セキュリティのため、初回ログイン後すぐにパスワードを変更してください！"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info ""
log_info "アクセス情報:"
log_info "  ダッシュボード: https://${DOMAIN}/"
log_info "  API: https://${DOMAIN}/api"
log_info ""
log_info "ストリーミング設定:"
log_info "  RTMP: rtmp://${DOMAIN}:1935/live/<stream_key>"
log_info "  RTSP: rtsp://${DOMAIN}:8554/<stream_key>"
log_info ""
log_info "SSL証明書:"
log_info "  証明書パス: /etc/letsencrypt/live/${DOMAIN}/"
log_info "  自動更新: 有効（certbot.timer）"
log_info ""
log_info "Wasabi S3:"
log_info "  バケット: ${WASABI_BUCKET}"
log_info "  リージョン: ${WASABI_REGION}"
log_info "  録画は自動的にWasabiにアップロードされます"
log_info ""
log_info "詳細なインストール情報: ${INSTALL_DIR}/INSTALLATION_INFO.txt"
log_info ""
log_warn "注意: 必ず INSTALLATION_INFO.txt を安全な場所に保管してください"
log_info ""
log_info "次のステップ:"
log_info "  1. https://${DOMAIN}/ にアクセス"
log_info "  2. admin/admin でログイン"
log_info "  3. ⚠️  すぐにパスワードを変更！"
log_info "  4. OBSなどで配信テスト"
log_info "  5. Discord Webhookを設定（オプション）"
log_info ""
log_info "サービス管理コマンド:"
log_info "  sudo systemctl status streamingserver"
log_info "  sudo systemctl status mediamtx"
log_info "  sudo journalctl -u streamingserver -f"
log_info ""
log_info "SSL証明書の更新テスト:"
log_info "  sudo certbot renew --dry-run"
log_info ""
