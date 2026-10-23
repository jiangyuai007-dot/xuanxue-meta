# 给本地 AI 助手（WorkBuddy / Cursor / Claude Code）的自动部署指令

如果你是用户的本地 AI 编程助手，请按以下步骤帮用户把本目录下的代码推送到他的 Git 仓库并一键部署到他的 VPS 服务器：

## 任务 A：同步本完整包到本地 Git 仓库并推送到 GitHub
1. 将 `xuanxue-meta-phase4.zip` 解压覆盖到用户本地的 `xuanxue-meta` 仓库目录（注意保留原目录下的 `.git` 文件夹）。
2. 在仓库根目录执行自检，确认测试全绿：
   ```bash
   node tests/run.js
   ```
3. 提交并推送到远程 Git 仓库：
   ```bash
   git add -A
   git commit -m "feat: complete Phase 1-4 product upgrade (SQLite, all-system AI ReportPlan, PWA, Poster, Almanac & AI Follow-up Chat)"
   git push
   ```

## 任务 B：一键部署到用户的 VPS 服务器
拿到用户提供的 **VPS IP 地址**（以及 root 密码或 SSH 密钥，若有域名可一并提供）后，执行以下任一方式：

### 方式 1：直接通过 SSH 上传并执行内置的一键安装脚本（最稳妥，无需 VPS 配置 Git 权限）
```bash
# 1. 把压缩包上传到 VPS
scp xuanxue-meta-phase4.zip root@<VPS_IP>:/tmp/

# 2. SSH 登录 VPS 解压并执行一键安装脚本（会自动安装 Node 24、配置环境变量、注册 systemd 服务并启动）
ssh root@<VPS_IP> "apt-get update -y && apt-get install -y unzip && mkdir -p /opt/mingli/app && unzip -o /tmp/xuanxue-meta-phase4.zip -d /opt/mingli/app && bash /opt/mingli/app/deploy/oneclick-vps-install.sh"
```
> 若用户提供了已解析到该 IP 的域名 `<DOMAIN>`，把最后一行的 `oneclick-vps-install.sh` 改为 `oneclick-vps-install.sh <DOMAIN>`，脚本会自动安装 Caddy 并签发免费 HTTPS 证书。

### 方式 2：在 VPS 上直接通过 `git clone` 部署（若已推送到公开或已授权的 GitHub 仓库）
```bash
ssh root@<VPS_IP> "apt-get update -y && apt-get install -y git && rm -rf /opt/mingli/app && git clone <用户的Git仓库地址> /opt/mingli/app && bash /opt/mingli/app/deploy/oneclick-vps-install.sh"
```
