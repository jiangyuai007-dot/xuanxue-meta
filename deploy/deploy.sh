#!/usr/bin/env bash
# xuanxue-meta 一键部署脚本（在本机 Git Bash 里跑，不是服务器上）
# 用法：bash deploy/deploy.sh <服务器IP或域名> [ssh用户，默认 mingli]
# 前置：服务器已按 deploy/README.md §1 初始化（mingli 用户 + Node + sudoers 免密重启）
set -euo pipefail

SERVER="${1:?用法: bash deploy/deploy.sh <server> [user]}"
SSH_USER="${2:-mingli}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARBALL="/tmp/mingli-$STAMP.tar.gz"

cd "$ROOT"

echo "==> [1/3] 打包（排除运行时数据/临时文件）"
tar czf "$TARBALL" \
  --exclude='./data' \
  --exclude='./.chrome-profile' \
  --exclude='./shots' \
  --exclude='./.git' \
  --exclude='*.log' \
  --exclude='./.out*.log' \
  .

echo "==> [2/3] 上传到 $SSH_USER@$SERVER"
scp "$TARBALL" "$SSH_USER@$SERVER:/tmp/"

echo "==> [3/3] 远端解包 + 重启 + health 检查"
ssh "$SSH_USER@$SERVER" "STAMP=$STAMP bash -s" <<'EOF'
set -e
mkdir -p /opt/mingli/app
tar xzf "/tmp/mingli-$STAMP.tar.gz" -C /opt/mingli/app
rm -f "/tmp/mingli-$STAMP.tar.gz"
sudo systemctl restart mingli
sleep 2
curl -fsS http://127.0.0.1:8787/api/health
echo ""
EOF

rm -f "$TARBALL"
echo "==> 完成。域名解析就绪后访问 https://你的域名（配置见 deploy/README.md §5）"
