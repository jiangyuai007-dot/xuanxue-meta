#!/usr/bin/env bash
# ==============================================================================
# 玄机（xuanxue-meta v1.4.0-phase4）VPS 服务器全自动一键安装脚本
# 在 Ubuntu / Debian VPS 服务器上以 root 运行：
#   bash deploy/oneclick-vps-install.sh [域名，可选；不填则直接开放 8787 端口用 IP 访问]
# ==============================================================================
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR="/opt/mingli/app"
ENV_FILE="/etc/mingli/mingli.env"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> [1/5] 检查并安装 Node.js 24 LTS（支持原生 node:sqlite）..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 22 ]; then
  apt-get update -y
  apt-get install -y curl unzip ca-certificates gnupg
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
echo "    当前 Node 版本: $(node -v)"

echo "==> [2/5] 创建专用用户 mingli 与部署目录 ${APP_DIR}..."
useradd -m -s /bin/bash mingli 2>/dev/null || true
mkdir -p "$APP_DIR" /etc/mingli

if [ "$SRC_DIR" != "$APP_DIR" ]; then
  cp -a "$SRC_DIR"/. "$APP_DIR"/
fi
mkdir -p "$APP_DIR/data"
chown -R mingli:mingli /opt/mingli

echo "==> [3/5] 初始化环境变量 ${ENV_FILE}..."
if [ ! -f "$ENV_FILE" ]; then
  cp "$APP_DIR/deploy/mingli.env.example" "$ENV_FILE"
  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  sed -i "s/^XUANXUE_SECRET=.*/XUANXUE_SECRET=${SECRET}/" "$ENV_FILE"
fi

if [ -z "$DOMAIN" ]; then
  # 无域名模式：直接监听 0.0.0.0:8787 供公网 IP 访问
  sed -i "s/^HOST=.*/HOST=0.0.0.0/" "$ENV_FILE"
else
  # 域名反代模式：仅监听本地回环 127.0.0.1:8787，由 Caddy 提供自动 HTTPS
  sed -i "s/^HOST=.*/HOST=127.0.0.1/" "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

echo "==> [4/5] 配置并启动 systemd 守护进程 mingli.service..."
cp "$APP_DIR/deploy/mingli.service" /etc/systemd/system/mingli.service
systemctl daemon-reload
systemctl enable --now mingli
systemctl restart mingli
sleep 2
curl -fsS http://127.0.0.1:8787/api/health && echo ""

if [ -n "$DOMAIN" ]; then
  echo "==> [5/5] 安装并配置 Caddy 自动 HTTPS（域名: ${DOMAIN}）..."
  if ! command -v caddy >/dev/null 2>&1; then
    apt-get install -y debian-archive-keyring curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-archive-keyring.gpg --yes
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y && apt-get install -y caddy
  fi
  sed "s/example.com/${DOMAIN}/g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
  systemctl enable --now caddy
  systemctl reload caddy
  if command -v ufw >/dev/null 2>&1; then
    ufw allow 80/tcp || true
    ufw allow 443/tcp || true
  fi
  echo "=================================================================="
  echo "✅ 部署完成！请确保域名 A 记录已指向本机 IP，浏览器访问："
  echo "   https://${DOMAIN}"
  echo "=================================================================="
else
  if command -v ufw >/dev/null 2>&1; then
    ufw allow 8787/tcp || true
  fi
  PUB_IP="$(curl -fsSL --max-time 4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
  echo "=================================================================="
  echo "✅ 部署完成！现在可直接用浏览器（电脑或手机）打开："
  echo "   http://${PUB_IP}:8787"
  echo "=================================================================="
fi
