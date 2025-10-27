#!/bin/bash
set -e

################################################################################
# MediaMTX インストールスクリプト（既存システム用）
# 
# このスクリプトは以下をインストール・設定します：
# - MediaMTX v1.15.3
# - React Dashboard のビルドとデプロイ
# - Nginx設定
# - SSL証明書（Let's Encrypt）
# - systemd サービス
#
# 前提条件:
# - Node.js, PostgreSQL, FFmpeg, Nginx が既にインストールされていること
# - アプリケーションが /opt/streamingserver にインストールされていること
#
# 使用方法:
#   sudo ./install-mediamtx-only.sh \
#     --domain stream.example.com \
#     --email admin@example.com
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
    -h, --help                  このヘルプを表示

例:
    $0 -d stream.example.com -e admin@example.com

EOF
    exit 0
}

# 引数のパース
DOMAIN=""
EMAIL=""

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
if [[ -z "$DOMAIN" ]] || [[ -z "$EMAIL" ]]; then
    log_error "必須パラメータが不足しています"
    show_usage
fi

# root権限チェック
if [ "$EUID" -ne 0 ]; then 
    error_exit "このスクリプトはroot権限で実行する必要があります"
fi

log_info "=== MediaMTX インストールスクリプト ==="
log_info "ドメイン: $DOMAIN"
log_info "メール: $EMAIL"

# 設定変数
MEDIAMTX_VERSION="v1.15.3"
MEDIAMTX_ARCH="arm64"

# 作業ディレクトリ
INSTALL_DIR="/opt/streamingserver"
MEDIAMTX_DIR="/opt/mediamtx"

# 前提条件のチェック
log_info "前提条件をチェック中..."
if [ ! -d "${INSTALL_DIR}" ]; then
    error_exit "アプリケーションディレクトリが見つかりません: ${INSTALL_DIR}"
fi

if [ ! -f "${INSTALL_DIR}/mediamtx.yml" ]; then
    error_exit "MediaMTX設定ファイルが見つかりません: ${INSTALL_DIR}/mediamtx.yml"
fi

if [ ! -d "${INSTALL_DIR}/dashboard" ]; then
    error_exit "Dashboardディレクトリが見つかりません: ${INSTALL_DIR}/dashboard"
fi

# ============================================
# React ダッシュボードのビルド
# ============================================
log_info "React ダッシュボードをビルド中..."
cd ${INSTALL_DIR}/dashboard

# package.jsonの存在確認
if [ ! -f "package.json" ]; then
    error_exit "package.json が見つかりません: ${INSTALL_DIR}/dashboard/package.json"
fi

# 依存関係のインストール
log_info "npm パッケージをインストール中..."
npm install || error_exit "npm install に失敗しました"

# ビルド
log_info "ダッシュボードをビルド中..."
npm run build || error_exit "ダッシュボードのビルドに失敗しました"

# ビルドしたファイルをNginxで配信できる場所に配置
log_info "ビルドファイルをデプロイ中..."
mkdir -p /var/www/streamingserver
cp -r dist/* /var/www/streamingserver/ || error_exit "ビルドファイルのコピーに失敗しました"

log_info "ダッシュボードのビルドが完了しました"

# ============================================
# MediaMTX のインストール
# ============================================
log_info "MediaMTX をインストール中..."

# 既存のMediaMTXを停止
if systemctl is-active --quiet mediamtx; then
    log_info "既存のMediaMTXを停止中..."
    systemctl stop mediamtx
fi

# インストールディレクトリを作成
mkdir -p ${MEDIAMTX_DIR}
cd ${MEDIAMTX_DIR}

# 既存のファイルをバックアップ
if [ -f "mediamtx" ]; then
    log_info "既存のMediaMTXをバックアップ中..."
    mv mediamtx mediamtx.backup.$(date +%Y%m%d_%H%M%S)
fi

# MediaMTX のダウンロード
MEDIAMTX_URL="https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_VERSION}/mediamtx_${MEDIAMTX_VERSION}_linux_${MEDIAMTX_ARCH}.tar.gz"
log_info "MediaMTX をダウンロード中: ${MEDIAMTX_URL}"
wget ${MEDIAMTX_URL} -O mediamtx.tar.gz || error_exit "MediaMTXのダウンロードに失敗しました"

# 解凍
log_info "MediaMTX を解凍中..."
tar -xzf mediamtx.tar.gz || error_exit "MediaMTXの解凍に失敗しました"
rm mediamtx.tar.gz
chmod +x mediamtx

# MediaMTX 設定ファイルをコピー
log_info "MediaMTX 設定ファイルをコピー中..."
cp ${INSTALL_DIR}/mediamtx.yml ${MEDIAMTX_DIR}/mediamtx.yml || error_exit "設定ファイルのコピーに失敗しました"

log_info "MediaMTX ${MEDIAMTX_VERSION} のインストールが完了しました"

# ============================================
# systemd サービスの作成
# ============================================
log_info "systemd サービスを作成中..."

# MediaMTX サービス
cat > /etc/systemd/system/mediamtx.service <<EOF
[Unit]
Description=MediaMTX RTSP/RTMP Server
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

# サイトを有効化
ln -sf /etc/nginx/sites-available/streamingserver /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Nginx設定テスト
nginx -t || error_exit "Nginx 設定が無効です"

# Nginxを再起動
systemctl restart nginx || error_exit "Nginxの再起動に失敗しました"

log_info "Nginx の設定が完了しました"

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

log_info "SSL証明書の設定が完了しました"

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
log_info "MediaMTX サービスを起動中..."
systemctl start mediamtx

# サービスの状態を確認
sleep 3
if systemctl is-active --quiet mediamtx; then
    log_info "✓ MediaMTX が起動しました"
else
    log_error "✗ MediaMTX の起動に失敗しました"
    log_error "ログを確認してください: journalctl -u mediamtx -n 50"
fi

# Streaming Server の状態も確認
if systemctl is-active --quiet streamingserver; then
    log_info "✓ Streaming Server は稼働中です"
else
    log_warn "⚠ Streaming Server が起動していません"
    log_warn "必要に応じて起動してください: sudo systemctl start streamingserver"
fi

# ============================================
# 完了メッセージ
# ============================================
log_info ""
log_info "=== インストール完了 ==="
log_info ""
log_info "MediaMTX のインストールと設定が完了しました！"
log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
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
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info ""
log_info "サービス管理コマンド:"
log_info "  sudo systemctl status mediamtx"
log_info "  sudo systemctl restart mediamtx"
log_info "  sudo journalctl -u mediamtx -f"
log_info ""
log_info "MediaMTX バージョン確認:"
log_info "  ${MEDIAMTX_DIR}/mediamtx --version"
log_info ""
log_info "設定ファイル:"
log_info "  MediaMTX: ${MEDIAMTX_DIR}/mediamtx.yml"
log_info "  Nginx: /etc/nginx/sites-available/streamingserver"
log_info ""
log_info "次のステップ:"
log_info "  1. https://${DOMAIN}/ にアクセス"
log_info "  2. OBSなどで配信テスト"
log_info "  3. ログを確認: sudo journalctl -u mediamtx -f"
log_info ""
log_info "SSL証明書の更新テスト:"
log_info "  sudo certbot renew --dry-run"
log_info ""
