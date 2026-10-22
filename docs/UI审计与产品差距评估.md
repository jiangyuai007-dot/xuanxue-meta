# 玄机 · UI 审计与产品差距评估

> 审计时间：2026-10-06　评审人：网站逆向大师（AI 架构/工程视角）
> 审计对象：`E:\WorkBuddy\xuanxue-meta`，webp 资产 10 个页面、`style.css` 30KB/458 行、`app.js` 42KB、`hepan-drill.js` 18KB
> 取证方式：重启服务 → headless Chrome 双端视口截图 10 张（`shots/ui-audit/`）→ 逐页目检 → 交叉核对源码

---

## 一、评分

### 1.1 分项评分

| 维度 | 得分 | 判断依据（均可在源码/截图复核） |
|---|---:|---|
| 设计系统一致性 | **8.0** | `:root` 里有完整 token：纸墨双色系（paper/ink/gold/red/green）+ 间距阶梯 `--sp-1..6` + 圆角阶梯 `--r-sm/md/lg` + 字号阶梯 `--fs-xs..xl` + 三级阴影；组件层只引用 `var()`，注释明确写「消灭散落魔法数字」。这一条超过多数同规模项目 |
| 视觉表现 / 中式调性 | **7.5** | 「墨底金字顶栏 + 纸面暖晕 + 衬线干支」的调性是统一的，logo「玄」字方块 + 篆意品牌字抓得住；但核心命盘区（`.pillars` / `.pillar`）仍是「信息表」排布，缺视觉焦点与留白节奏，没有做出「命理器物」的仪式感 |
| 信息架构 | **7.0** | 5 体系 + 合盘 + 审计 + 3 法务页，导航扁平清楚，每个 tab 都标 `active`，footer 法务链接齐（隐私/协议/退款/免责）。但 tab 是 `<a href>` 裸链接 → 切换整页刷新、无过渡、无法前进后退到中间态 |
| 响应式 | **7.0** | 390px 表单降级干净：字段竖排、主操作变整行大按钮（`排盘` 全宽金底）、`fb-actions` 从「右对列」变「堆叠」。但中段命盘区（十二宫位表 / 大运流年表 / 奇门九宫）是密集表格，窄屏表现需专项复测 |
| 交互反馈与状态 | **6.0** | 有：loading spinner（`.sp`）、服务状态 dot + `.svc-banner` 断连横幅、排盘结果区骨架（`.rp-sk`）、章节逐章推送过渡、`.sk-item` 解锁态。缺：无显式 disabled 语义、无失败/重试的完整闭-loop、无操作进度百分比、章节骨架与实际章节视觉区分度弱 |
| 排版细节 | **6.0** | 行高 1.7 舒服、`-webkit-font-smoothing:antialiased` 到位；但字号阶梯止步 `--fs-xl:22px`，**没有 h1 层级**；数字/干支用衬线但缺等宽数字（`font-variant-numeric:tabular-nums`）对齐；中西文混排无处理 |
| 可访问性 | **4.0** | 硬伤（见 §2 P0-3）。全站 **零 `aria-*` / `role` / `tabindex`**（grep 结果：只有 `lang="zh-CN"`，其他一律 0 命中）；字段 `<label>` 全部是无 `for` 的裸 `<label>`，点标签不聚焦控件、读屏器读不出关联 |
| 报告可读性 | **6.5** | `.rp-ch` 章节卡有编号 + 标题 + `basis` 依据溯源，这一层设计是对的；但正文是密排段落，1–2 万字长报告缺二级小标题层级、缺引文/要点的视觉切分，读起来像论文 |
| 跨端一致性 | **7.5** | 桌面三栏（档案 / 主区 / 解读）、移动单栏，五页共用同一 token 与同一 topbar 结构，没有出现「同一元素两套皮肤」的割裂 |

### 1.2 综合

# **6.9 / 10**

> 定位：**「完成度很高的内部工具」**，不是「专业级对外产品」。
> 设计底子（token 化、主题统一、零依赖前端）在同类项目里是上游水平；
> 但可访问性、状态闭环、字体落地、账号体系这四块是明确的欠账，而这四块恰恰是「别人在用」和「自己用」的分水岭。

---

## 二、问题清单（按严重度）

### P0-1　**字体没有落地——设计里最重要的「衬线仪式感」会直接掉档**

- 现象：`web/style.css:43` 定义 `--serif:"Noto Serif SC",serif`，`src/report/charts/bazi.js` 里 `.bz-pillar .pl-gz`（40px 四柱大字）、`.bz-big`、六爻/紫微/奇门图表也全部点名 `Noto Serif SC`。
- 实测：全仓库 **没有 `@font-face`，没有引 Google Fonts / 字体 CDN**（grep `@font-face|fonts.googleapis|Noto Serif SC|preconnect` 全部命中只来自 CSS 声明与 JS 里的 `font-family` 字符串，没有任何加载语句）。
- 后果：用户机器上没装 Noto Serif SC 就 fallback 到系统默认。Windows → SimSun 宋体，Android → Noto Sans CJK（**无衬线**），Linux 看发行版。也就是说 **40px 的四柱大字在多数手机上会渲染成黑体/宋体，而不是设计要的厚重衬线**。这是命盘视觉的核心资产，掉了观感塌一半。
- 修法（三选一，推荐 2）：
  1. 换本地系统字体栈：`"Songti SC","SimSun",serif`（有衬线但字重偏轻，不理想）
  2. **子集化内置 woff2**：把出现过的干支/九星/八门/天干地支字（约 200–400 字）抽成子集字体，跟 `style.css` 一起部署，几百 KB，离线可用、零外部请求 —— 最稳
  3. Google Fonts CDN（`fonts.googleapis.com`）：**海外 VPS 上国内访问会慢/不稳，不建议**

### P0-2　**全程状态只存在浏览器 localStorage，没有账号**

- 现象：`.rail-left`「我的档案 / 保存当前」写的是 `localStorage`；`hepan.html:106` 自己写着「仅存本机浏览器」。
- 后果（对着 100 人规模看）：
  - 用户换设备 / 清缓存 / 换浏览器 → **全部历史归零**
  - 不同人用同一台电脑 → 档案串号，隐私风险
  - 你没有任何留存数据，做不了回访、做不了「上次看到的报告」
- 修法：最小可用版不一定要做注册。先做「**一次性报告链接**」——排盘完生成带 token 的只读链接（你已有 `reportUrl(id, token)` 机制，服务端 `reports` 内存表已经有了），用户能存书签/转发，服务端也留了档。这一步 1 天能做完，比注册系统划算得多。

### P0-2　**全程状态只存在浏览器 localStorage**　　✅ **已修复（本轮）**

> 门禁用 `scripts/p0_myreports_check.mjs`：静态结构 + 真浏览器实测，**通过 61 · 失败 0**；
> 服务端闭环冒烟 `scripts/p0_myreports_smoke.mjs`：**21/21 ALL PASS**。

**设计决策（关键）：云历史只存「输入参数 + 标签」，不存整份报告。**

- 一条记录几百字节，隐私面小（没有完整命盘全文），也不需要为它开辟新的存储格式；
- 同一份生辰永远得到同一份命盘（`factpack.js` 的 `build()` 是确定性的 + 缓存），
  所以「存参数、打开时重排」在观感上与「存报告」完全等价；
- 顺带把「服务重启后老分享链接变 404」的老问题一起解决：报告页取盘走
  `loadEntry(id)` → 内存 LRU 未命中 → 云历史记录重建，老链接依旧能开。

**归属双轨（不能省）**：登录用户 `uid:<id>` 跨设备；游客 `did:<随机>` 靠服务端下发的
**httpOnly** cookie（`xx_did`，`SameSite=Lax`，180 天）。**绝不接受前端传来的设备字符串**——
那等于把「谁能看谁的历史」交给客户端，谁都能伪造去枚举别人的记录。
门禁里专门有一条静态断言盯着这点：`ownerOf` 不得读 body 里的 `owner/device` 字段。

**接口**：`POST/GET/DELETE /api/reports`、`POST /api/reports/:id/{open,share}`。
`open` 发 10 分钟短令牌（自己看），`share` 发 7 天长令牌（可转发）。
列表接口**不回传 payload**（payload 里有出生时间，不能出现在列表里）。

### P0-3　**可访问性是裸奔状态**　　✅ **已修复（本轮）**

> 门禁用 `scripts/p0_a11y_check.mjs`：静态结构 + 真浏览器实测，**通过 31 · 警告 0 · 失败 0**。

**修复前的问题 → 现在：**

| 原问题 | 现状 |
|---|---|
| 全站零 `aria-*` / `role` / `tabindex`，`<label>` 全是无 `for` 的裸标签 | 每个 label 三条出路都验过：`for=` 指向存在的控件（单控件行）、`role="group"+aria-labelledby`（年月日时分组、时间校正等）、隐式包裹控件（真太阳时/闰月）。`for` 全部无悬空引用 |
| `--sub #8b8172` ≈ 3.4:1 | 改 `#6f6658` ≈ **5.05:1** ✅ |
| `--gold-deep #9a7720` ≈ 3.7:1，footer 四个法务链接全用它 | 新增 `--gold-ink #7d5f12`（≈4.9:1 on `--gold-soft`、5.3:1 on paper）专门承载金色文字；`--gold-deep` 退回落为描边/渐变；footer 链接改 `--ink-2` + 加下划线（颜色不再是唯一区分手段，WCAG 1.4.1） |
| 日期网格 5 个 input、六爻的 n1/n2/m1/m2/m3、奇门的 customJu/jiGong 等 **50 个控件没有可访问名** | 按体系语义补 `aria-label`（甲方出生年/乙方出生地/上卦数/参动数/自定义局数…） |
| 状态区（`#msg` / `.fb-hint` / `#coinStatus`）无播报 | 全部补 `aria-live="polite"`，生成中/成功/失败读屏器能念 |
| 无键盘可达性 | 补 `<main id="main" tabindex="-1">` + 顶部 `skip-link` + 全站 `:focus-visible` 金环 + `prefers-reduced-motion` 降级 |

**踩到的坑（写进 `p0_a11y_check.mjs` 注释，避免以后误判）：**
1. **暗色顶栏会被误判**：`.topbar` 是 `--bar-bg` 墨底渐变，只取 `backgroundColor` 会把金字读成「浅字压浅底」报假阳性 → 门禁改成从 `backgroundImage` 里抠出各色停取均值。
2. **disabled 按钮不能用**：浏览器给 disabled 的 opacity≈0.45，`报告页/分享卡` 因此被算成 1.9:1 → WCAG 1.4.3 明确豁免失活控件，门禁跳过。
3. 44px 的 `.intro-ic` 属「大字符」，门槛是 3:1 不是 4.5:1；同时把它的 `opacity:.65` 提到 `.85` 并转 `--gold-ink`。

### P1-1　**支付是模拟的，真上一票人付就会账实不符**

- 现状：`/api/order/*/pay` 是演示环境模拟支付，本地 `orders` 表里有 7 笔「已支付、GMV 116.3」——**这是假数据，不能当真**。
- 对外 100 人真收费需要：支付网关接入 + **回调验签 + 防重放 + 订单幂等 + 退款/对账**。这块不自研，直接用现成 SDK 也要 2–3 天。
- 建议：**1.0 先全免费 / 先内测发码**，把支付挪到 1.1。你现在的架构里「章节锁 + sku」已经做好，接真支付只是换掉 `pay` 那一层。

### P1-2　**六爻 / 奇门 / 紫微还没进 AI 报告层**

- 实测路由：只有 `/api/hepan/report/stream`（合盘）是 AI 逐章 SSE；`/api/report` 是八字那一路。
- 也就是说现在对外，**四体系里只有八字和合盘有完整 AI 解读，六爻/奇门/紫微是本地规则输出**——体验不一致，用户一点就发现「怎么这个没深度」。
- 这是 P3 未开工项，预计 3–5 天。

### P1-3　**密集表格在窄屏没复测**

- 390px 下十二宫位表 / 大运流年表 / 奇门九宫横跨 4–9 列。截图里表单区降级漂亮，但中段命盘区在移动端的实际表现没有门禁覆盖（`ui_report_check` 只覆盖合盘报告）。
- 建议补一条 `ui_mobile_table_check.mjs`，断言各体系命盘表格在 390px 下 `scrollWidth <= clientWidth + 2`，否则横向溢出。

### P2　其他

- 顶部 tab 整页刷新（`hepan.html:20-24`），切一次体系白屏一下；改 hash 路由或 SPA 化。
- 无 404 页、无服务端错误页、无「报告生成失败」的可重试闭环。
- 无 `favicon`、无 OG 分享图（分享到微信/QQ 会只显示链接名，缩略图是默认的）。
- 无日志轮转（VPS 上跑久了 `*.log` 会撑盘）。

---

## 三、改进建议（朝「专业级」补齐的硬指标）

| # | 项 | 具体做法 | 预估 |
|---|---|---|---|
| 1 | **字体子集化** | 抽干支/星曜/八门等 200–400 字生成 woff2，走 `src/report/css` 已有的通道一起下发 | 0.5 天 |
| 2 | ~~**label/aria 补齐**~~ | ✅ 已完成（label `for` / `role=group` / `aria-label` 50 处 / `aria-live` / `<main>` + skip-link / `:focus-visible`） | — |
| 3 | ~~**对比度修正**~~ | ✅ 已完成（`--sub`→`#6f6658`、新增 `--gold-ink`、footer 链接 `--ink-2` + 下划线） | — |
| 4 | **报告排版分级** | 长报告加二级小标题、把要点提取成卡片/引文块、段落限宽 68ch、首屏加「本报告速览」摘要卡 | 1 天 |
| 5 | **状态闭环** | 生成中显示进度百分比（X/6 章）、失败给「重试」按钮、断网给 `.svc-banner` 已有样式复用 | 0.5 天 |
| 6 | **报告链接持久化** | 复用 `reportUrl(id, token)` 生成只读链接 + 「我的报告」列表（服务端 `reports` 已有内存表，落盘即可） | 1 天 |
| 7 | **窄屏命盘门禁** | 补 `ui_mobile_table_check.mjs`，断言 390px 下各体系命盘无横向溢出 | 0.5 天 |
| 8 | **favicon + OG 图** | 一个「玄」字 PNG favicon + 分享缩略图，微信转发观感立刻上一个台阶 | 0.5 天 |

> 合计 ≈ **4.5 天**（单人 elbow），就能把 6.9 分推到 **8.2–8.5 分**的「专业级」门槛。

---

## 四、功能缺口清单（对照产品级）

### 4.1 已有（不用补）
- 5 大体系引擎：八字 / 合盘 / 六爻 / 奇门 / 紫微，全部本地确定性计算
- 真太阳时、农历/公历互转、闰月、晚子时、节气校正（含边界 case）
- AI 分层编排：事实层本地 → 编排层填 slot → 渲染层写死，source 溯源（ai / cache / local-fallback）
- 章节锁 + sku 解锁 + 演示支付 + 退款链路
- 本地档案 localStorage、最近合盘列表
- 三栏工作台、骨架屏、SSE 逐章、断连横幅、分享卡、报告页

### 4.2 缺（按优先级）

| 优先级 | 缺口 | 为什么 100 人场景必须 |
|---|---|---|
| P0 | **账号 / 云历史** | 100 人是「别人的设备」，localStorage 等于没有 |
| P0 | **字体落地** | 视觉核心资产，掉档等于换了个产品 |
| P0 | **真 HTTPS + 域名** | Chrome 红警告，用户不敢输生日 |
| P1 | **分享闭环** | 合盘是社交品，转给朋友是主路径；现在只有「分享卡」静态图，没有可点开的只读报告链接 |
| P1 | **六爻/奇门/紫微接 AI** | 四体系体验一致 |
| P1 | **真支付 + 回调鉴权** | 要收钱就得有 |
| P1 | **服务端日志/监控/备份** | VPS 上无人值守，得有 `journalctl`、日志轮转、定时备份 `data/` |
| P2 | 404 / 错误页 / 空状态文案 | 专业度细节 |
| P2 | 收藏 / 对比 / 导出 PDF | 长报告用户会想存 |
| P2 | 内容库 / 案例 / 文章 | 从「工具」走向「内容平台」 |
| P3 | 多语言、深色模式全站、PWA | 锦上添花 |

---

## 五、距离「产品级」差什么

一句话：**代码已经到 8 分，产品还停在 4 分。**

- **工程侧几乎满分**：零依赖、无数据库、单进程、内存 50MB、八套回归门禁全绿（67/67 · 40/40 · 138 · 52 · 46/46 · 17/17 · UI 18/18）。这在同类命理项目里是罕见水平。
- **产品侧缺的是「别人能有用、愿意再来」的那几件事**：
  1. **身份**：现在没有「一个人」的概念，只有「一台浏览器」。
  2. **连续性**：今天排的盘，明天打不开；上次看的报告找不着。
  3. **一致性**：四体系里两个有 AI 解读、两个没有，用户第一眼就看出半成品。
  4. **可信度**：没有 HTTPS、字体掉档、付款无凭证 —— 这三样任一都能让用户觉得「这网站不靠谱」。
  5. **可运营**：没有后台（订单/用户/内容管理），100 人一进来你只能靠 `orders` 那张内存表看数，重启就没了。

---

## 六、上线时间线

### 阶段 0：现在就能做的事（技术侧已就绪）
代码可跑、回归全绿。**但我不建议你今天就把 100 人放进来。**

### 阶段 1：内部灰度（约 2–3 天）
| 内容 | 预估 |
|---|---|
| 域名 + DNS + Let's Encrypt 免费证书 | 0.5 天 |
| 字体子集化（P0-1） | 0.5 天 |
| 报告链接持久化 +「我的报告」（复用已有 token 机制） | 1 天 |
| label/aria + 对比度修正（P0-3） | 0.5 天 |
| `deploy.sh` 一键部署 + systemd + ufw + 冒烟 | 0.5 天（我来写，你只需贴 VPS IP） |
| **灰度验证**：塞 5–10 个熟人真用两天，看反馈 | — |

> **这一步做完 = 一个能对外、体面、能回访的内测版，约 3 天。**

### 阶段 2：对普通用户开放 1.0（约 +4–6 天）
| 内容 | 预估 |
|---|---|
| 六爻/奇门/紫微接 AI 报告层（P3） | 3–5 天 |
| favicon + OG 分享图 | 0.5 天 |
| 窄屏命盘门禁 + 报告排版分级 + 状态闭环 | 1.5 天 |
| 服务端日志/监控/备份 | 0.5 天 |
| 后台管理（订单/用户概览） | 1 天 |

> **累计 7–9 天 = 1.0 可对外。**

### 阶段 3：1.1 收费（+3–5 天，可延后）
真支付网关 + 回调验签 + 幂等 + 退款 + 对账。

### 回答「还要多久」

| 目标 | 时间 |
|---|---|
| **技术上能部署到服务器跑起来** | **已具备，本轮就能上**（服务已重启验证 HEALTH 200） |
| **体面、可信、能回访的内测版** | **约 3 天**（前提是 `deploy.sh` 我写） |
| **对普通用户开放的 1.0** | **约 7–10 个工作日**（单人连续投入） |
| 含收费的 1.1 | 再加 3–5 天，可拆到后面 |

---

## 七、本轮完成的动作

1. **重启服务**：`AGNES_KEY_FILE=... node src/server/index.js` → `HEALTH 200`（PID 5812，RSS 50MB），已恢复。
2. **新增截图门禁** `scripts/ui_audit_shots.mjs`：桌面 1440×900 + 移动 390×844 双端，覆盖 8 个页面 + 审计页，产出 10 张到 `shots/ui-audit/`。
3. **修了两个会咬人的工具链坑**（都写进了脚本头注释）：
   - `cdp.mjs` 调试端口写死 `9333` → 上一次 headless Chrome 没回收干净时会连到**旧实例**，表现为 `Page.navigate` / `captureScreenshot` 随机超时（本次现场 51 个残留 Chrome 进程触发过）。已改为 **随机端口 + 启动后确认就绪**，起不来直接报错而不是硬闯。
   - 同一浏览器挂多个标签页时，后台标签 `Page.captureScreenshot` 必卡 → 改为「一页一开一关」。
   - 页面内 infinite CSS 动画（`.sp` / `.ring`）会让 headless 等「稳定帧」→ 截图前注入 `animation:none!important` 冻结。
4. **新增 `docs/UI审计与产品差距评估.md`**（本文档）。

---

## 七·续、P0 修复轮（字体 / 云历史 / 可访问性）完成清单

### P0-1　字体落地 ✅

- `scripts/build_font_subset.mjs`：用 Google Fonts `text=` 做**服务端子集化**，字符集 = 5 个排盘页 HTML + `style.css` + `src/report/**`（刻意**排除** `src/interpret`，那边是 sans 标签层，收进来字数会从 1061 涨到 1844、体积翻倍而观感收益≈0）。
- 按 `text=` 的 800 字上限分批（>900 字 Google 会忽略 `text=` 返回全量 303 faces，脚本检测到 `blocks.length > 6` 直接报错拦下）。
- 产物：`web/fonts/subset.css`（6 条 `@font-face`，三个字重共用同一可变字体 woff2）＋ `NotoSerifSC-subset-1/2.woff2`，**合计 368.6 KB**，幂等注入 5 个排盘页。
- `scripts/p0_font_check.mjs`：**19/19 全绿**，真浏览器 `document.fonts.check` 命中「玄 / 甲 / 子 / 命宫 / 正官 / 大运 / 空亡」。

### P0-2　云历史「我的报告」 ✅

- 新增：`src/account/reportstore.js`（落盘 `data/reports.json`，临时文件 + `renameSync` 防半截坏档；
  治理规则：每 owner 上限 200 条 / 保留 24 个月 / 总量 20000）、`web/cloud-history.js`（排盘页与「我的」页共用的数据层，
  会话令牌存 `localStorage['xuanxue.session']`）、`web/mine.html` + `web/mine.js`（我的报告页，含登录/注册与订单弹层）、
  `style.css` 的 `.mr-*` 版式（只复用已有 token，没引入新色号）。
- 5 个排盘页顶栏加「我的」入口 + 「保存到我的报告」按钮（`btnSaveReport`），
  按钮启用时机与 `btnHtml`/`btnCard` 同步；合盘页 `hepan-drill.js` 另有一套入参快照 `lastHepanInput`。
- 同 owner + 同体系 + 同参数 → **覆盖旧记录**（`updated:true`），不会把同一份生辰堆成一堆重复条目。
- 保存前先跑一遍 `validateInput`，非法输入不入库（否则以后永远打不开这条历史）。
- 门禁：`p0_myreports_check` **61/0**、`p0_myreports_smoke` **21/21**。

#### P0-2 补充：账号区重做（原版式简陋 + 状态错乱）✅

首版上线后实测发现账号区是坏的，截图见 `shots/acct-guest.png` / `acct-online.png`：

- **根因（CSS 吃掉 `hidden`）**：`.mr-acct-on,.mr-acct-off{display:flex}` 与 `.mr-form{display:flex}` 是作者样式，
  优先级高于浏览器 UA 的 `[hidden]{display:none}` → `hidden` 属性**完全失效**，
  「已登录 / 未登录 / 登录表单 / 注册表单」四套同时渲染，叠成一团（两个「已登录」「未登录」徽章并存）。
  修法：`style.css` 顶部补全局兜底 `[hidden]{display:none!important}`，任何组件层 `display` 都压不过它。
- **同源第二个 bug**：`mine.js` 用 `modal.hidden=false` 打开订单弹层，而 `.xj-modal` 本体是 `display:none`、
  只有 `.show` 才 `display:flex` → 点了「我的订单」**根本弹不出来**。改成 `.show` class 开关，并补 Esc 关闭与焦点回收。
- **版式重做**：表单从 `flex + align-items:flex-end`（两条标签落在不同基线）改为
  `grid-template-columns:auto minmax(200px,1fr) auto minmax(200px,1fr) auto`，
  label 右对齐贴输入框、两输入框同为 `1fr` → 实测两个标签 `top` 都是 255、两个输入框 `top` 244 且等高 40 等宽 321。
- 已登录态：42px 圆章头像（取邮箱首字）+ 金底「已登录」徽章 + 邮箱 + 右侧「我的订单 / 退出登录」右对齐。
- 未登录态：`login` / `注册新账号` 分段切换（`role=tablist` + `aria-selected` + `aria-controls`），
  同一时刻只有一套表单可见，切换时清空另一套已填内容防误提交，焦点跟随移动。
- 窄屏 ≤900px 收成单列，标签改左对齐，按钮整行均分，无横向溢出。
- 门禁：`scripts/p0_account_check.mjs` 静态 20 项 + 浏览器实测 22 项 = **42/0**。

### P0-3　可访问性 + 对比度 ✅

- `scripts/p0_a11y_fix.mjs`（补 `aria-label`，重复执行安全）、`scripts/p0_a11y_check.mjs`（门禁：通过 31 / 警告 0 / 失败 0）。
- 回归：**九套全绿**——`tests/run.js` 67/67、`tests/smoke.js` 40/40、`p0_verify` 52/52、`p0_font_check` 19/19、
  `p0_a11y_check` 31/31、`p0_myreports_check` 61/61、`p2_hepan_engine_check` 17/17、`ui_report_check` 18/18、
  `probe_compliance` 138 项 PASS=120 FAIL=0；`p2_hepan_probe` 45/46（唯一失败项是「全部真实走 AI」，
  需 `LLM_ENDPOINT` / `LLM_API_KEY` 环境变量，当前环境未配置，代码走本地兜底，与本次改动无关）。
- 5 个排盘表单区截图已核对，`shots/p0a11y/*.png`，渲染无变形。

## 八、可复跑的验证命令

```bash
# 截图（需服务在 8787）
node scripts/ui_audit_shots.mjs
# 八套回归（服务在跑时）
node tests/run.js && node tests/smoke.js
node scripts/p0_verify.mjs && node scripts/p2_hepan_probe.mjs
node scripts/ui_report_check.mjs
# P0 门禁（可访问性 31 项 + 字体 19 项 + 云历史 61 项 + 账号区 42 项）
node scripts/p0_a11y_check.mjs && node scripts/p0_font_check.mjs
node scripts/p0_myreports_check.mjs && node scripts/p0_myreports_smoke.mjs
node scripts/p0_account_check.mjs
# 重新生成字体子集（改过文案/图表字后要重跑）
node scripts/build_font_subset.mjs
```

> 跑浏览器类门禁前，服务得在 8787：
> `node src/server/index.js`（后台运行）。`p2_hepan_probe` 的 AI 章节项还需
> `LLM_ENDPOINT` / `LLM_API_KEY`（未配置时走本地兜底，该项会 FAIL，属预期）。
