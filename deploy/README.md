# xuanxue-meta 服务器部署手册

零依赖 Node 应用（无 `npm install` 步骤），部署 = 传代码 + systemd 常驻 + Caddy 反代自动 HTTPS。
全程 SSH 直连服务器即可，**不需要任何代理工具**。

---

## 0. 选型结论（OvHCloud 结算页怎么勾）

| 选项 | 建议 | 说明 |
|---|---|---|
| 套餐 | **VPS-1-2027 保持默认**（2 vCore / 4GB / 40GB NVMe / 500Mbps 不限流量，$5.35/月） | 应用空闲占用约 100~150MB 内存，这套配置跑三五年都够，余量留给 AI 并发 |
| 区域 | **看用户群体**：大陆用户为主 → 优先新加坡（下拉里有就选它），别选法兰克福/美西；海外华人为主 → 法兰克福可以 | OvHCloud 到大陆延迟 200ms+ 且链路不稳，是它家短板 |
| 镜像 | **Ubuntu 26.04 LTS 保持默认**（Debian 13 也行） | LTS，NodeSource 装 Node 24 一路顺 |
| 存储 | **本地存储 高性能 保持默认** | 注意默认不含快照，按 §6 自己做数据备份 |

**两条硬提醒（买之前想清楚）：**

1. **大陆访问**：海外服务器 + 大陆用户 = 慢且可能间歇抽风。认真服务大陆用户应走国内云（阿里云/腾讯云轻量）+ 域名 ICP 备案；但**命理/占卜类内容备案大概率被拒**，先有心理准备。原型/演示阶段用海外服务器完全没问题。
2. **账号与支付**：OvHCloud 新账号要上传证件实名，大陆用户偶有审核卡壳；支付需国际信用卡或 PayPal。

---

## 1. 服务器初始化（一次性，约 10 分钟）

```bash
# —— 本机 Git Bash：传 SSH 公钥（首次用 OvHCloud 面板给的 root 密码登录后立刻做）
ssh-copy-id root@<服务器IP>

# —— SSH 登录服务器，建低权限用户（应用绝不用 root 跑）
adduser --gecos "" mingli
usermod -aG sudo mingli
mkdir -p /home/mingli/.ssh && cp /root/.ssh/authorized_keys /home/mingli/.ssh/ \
  && chown -R mingli:mingli /home/mingli/.ssh
# 部署脚本免密重启服务（只授权这一条，不给全量 NOPASSWD）
echo 'mingli ALL=(root) NOPASSWD: /usr/bin/systemctl restart mingli, /usr/bin/systemctl status mingli' \
  | sudo tee /etc/sudoers.d/mingli-deploy
sudo chmod 440 /etc/sudoers.d/mingli-deploy

# —— 装 Node 24 LTS（NodeSource，别用 apt 自带的旧版）
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v    # 应输出 v24.x

# —— 防火墙：只放 22 / 80 / 443（应用的 8787 只绑回环，不对外开放）
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable

# —— 装 Caddy（自动申请/续期 HTTPS 证书的反代）
sudo apt install -y debian-archive-keyring curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# —— 建应用目录并授权
sudo mkdir -p /opt/mingli/app && sudo chown -R mingli:mingli /opt/mingli
```

## 2. 放代码（本机 Git Bash 执行）

```bash
cd /e/WorkBuddy/xuanxue-meta
bash deploy/deploy.sh <服务器IP> mingli
```

脚本做的事：打包（排除 `data/`、`.git`、临时文件）→ scp 上传 → 远端解包到 `/opt/mingli/app` → 重启服务 → 打 `/api/health` 验证。
**注意：脚本不带本机 `data/`**——服务器的用户/订单/报告从零开始，两边数据不互通。

## 3. 环境变量（密钥不进代码目录）

```bash
sudo mkdir -p /etc/mingli
sudo cp /opt/mingli/app/deploy/mingli.env.example /etc/mingli/mingli.env
sudo chmod 600 /etc/mingli/mingli.env
sudo nano /etc/mingli/mingli.env
```

**至少改这一项**：`XUANXUE_SECRET`——权益令牌签名密钥，用 `openssl rand -hex 32` 生成填进去。
不填的话密钥会落在 `data/.secret`，将来重装/换机旧分享链接全部失效。

其余变量按需（AI 适配器二选一，都不配 = 纯本地规则引擎，功能完整可跑）：

| 变量 | 默认 | 作用 |
|---|---|---|
| `PORT` / `HOST` | 8787 / 127.0.0.1 | 反代后面只绑回环，公网流量全走 Caddy 443 |
| `TZ` | Asia/Shanghai | 日志与缓存按北京时间 |
| `AI_ENABLED` | 1（开） | `0` 关 AI，全走本地 |
| `AGNES_API_KEY` / `AGNES_BASE_URL` / `AGNES_MODEL` | 空 / apihub.agnes-ai.com / agnes-2.5-flash | AGNES 适配器 |
| `AGNES_TIMEOUT_MS` / `AI_CONCURRENCY` | 40000 / 2 | 超时与并发 |
| `LLM_ENDPOINT` / `LLM_API_KEY` / `LLM_MODEL` | 空 | OpenAI 兼容端点（与 AGNES **不要同时配**） |
| `XUANXUE_PAID` | 不设（免费模式） | `=1` 开启章节付费锁定 |
| `XUANXUE_DEMO_UNLOCK` | 不设 | `=1` 演示全部解锁，**生产勿开** |

## 4. systemd 常驻（崩了自动拉活）

```bash
sudo cp /opt/mingli/app/deploy/mingli.service /etc/systemd/system/mingli.service
sudo systemctl daemon-reload
sudo systemctl enable --now mingli
systemctl status mingli          # 看状态
journalctl -u mingli -f          # 看实时日志
```

## 5. 域名 + HTTPS

1. 域名解析：`A 记录 → 服务器IP`（生效几分钟）；
2. 改 Caddy 配置：
   ```bash
   sudo cp /opt/mingli/app/deploy/Caddyfile /etc/caddy/Caddyfile
   sudo nano /etc/caddy/Caddyfile    # 把 example.com 改成你的域名
   sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
   ```
3. 浏览器开 `https://你的域名`——证书自动签好，HTTP 自动跳 HTTPS。

没有域名想先看效果：`http://<服务器IP>:8787` **不通是正常的**（应用只绑回环）。
临时验证可 `ssh -L 8787:127.0.0.1:8787 mingli@<ip>` 后开 `http://127.0.0.1:8787`。

## 6. 备份（`data/` 里躺着用户、订单、报告）

```bash
# 本机 Git Bash 执行，每天一次或改版前执行
ssh mingli@<服务器IP> 'tar czf - -C /opt/mingli/app \
  data/xuanxue.sqlite data/users.json data/orders.json data/reports.json data/chats.json data/.secret 2>/dev/null' \
  > backup-$(date +%F).tar.gz
```

`data/cache/`、`data/ai-cache/`、`data/logs/` 是缓存和日志，不用备。
**恢复**：解包覆盖 `/opt/mingli/app/data/` 后 `sudo systemctl restart mingli`。
注意 `data/.secret` 与 `XUANXUE_SECRET` 必须与原站一致，否则旧令牌失效。

## 7. 日常更新

改完代码 → 本机执行 `bash deploy/deploy.sh <服务器IP> mingli`（自动重启 + health 检查，约 10 秒）。
想先看再上：把 `deploy.sh` 里 `systemctl restart mingli` 改成 `status`，只传不重启。

## 8. 排障速查

| 症状 | 先查什么 |
|---|---|
| 网站 502 | `systemctl status mingli` / `journalctl -u mingli -n 50`（多半是端口被占或 env 文件缺字段） |
| 报告不逐章弹出（一坨出来） | Caddyfile 的 `flush_interval -1` 没配上，`caddy validate` 过了吗 |
| 分享链接突然全部失效 | `XUANXUE_SECRET` 或 `data/.secret` 变了 |
| 证书签不下来 | 域名 A 记录没生效 / 80 端口没放行 / Caddy 配置没 reload |
| 大陆用户打不开 | 网络链路问题（§0 已提醒），不是应用故障 |

---

## 附：架构一句话

浏览器 → Caddy(443, 自动 HTTPS, SSE 不缓冲) → Node 单进程(127.0.0.1:8787) → `data/` 文件存储。
限流按真实客户端 IP 生效（应用只信任来自回环/内网反代的 `X-Forwarded-For`，公网伪造绕不过）。
