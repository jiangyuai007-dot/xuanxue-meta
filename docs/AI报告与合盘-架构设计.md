# 玄机 · AI 报告改造 + 八字合盘 —— 审计与架构设计

> 版本：v2　日期：2026-10-05　状态：**P0 已落地并通过门禁（52/52），P1 待开工**
> 范围：① 报告改为「模板化 UI + AI 填充内容」　② 新增八字合盘
> 目标模型：agnes-2.5-flash
>
> v2 变更：**你拍板的 6 项决策全部照此实施，P0 地基已建成**（详见 §十一 实施记录）。
> 本次落地：`src/core/reportPlan.js`（模板注册表中枢）+ `src/ai/*`（接入层）+ `src/report/templates/bazi.js`（固定骨架渲染），
> 真 Key 跑通 **10/10 章 AI 成功（via=tool calling）**，二次跑全命中缓存。P1 起把报告页接进线上。

---

## 一、审计结论：现状盘点

### 1.1 已有资产（可直接复用，不用重写）

| 资产 | 位置 | 状态 |
|---|---|---|
| 八字引擎 | `src/engines/bazi.js` | ✅ 数据非常全，见下 |
| 事实包 / 缓存 | `src/factpack.js` | ✅ sha1 缓存键，7 天 TTL |
| 命盘渲染（10 个区块） | `src/report/charts/bazi.js` | ✅ 服务端 HTML 字符串 |
| 合规网关 | `src/compliance/gateway.js` | ✅ 断言弱化 + 高风险改写 + 审计留痕 |
| 报告页 / 分享卡 / 令牌 | `src/server/index.js` | ✅ 完整 |
| LLM 适配器 | `src/interpret/index.js:149` | ⚠️ 能跑但设计粗糙，需重写 |

八字引擎可用字段（`bazi.js:408-474`）——**这正好就是喂给 AI 的事实源**：

```
fourPillars  四柱（干/支/十神/纳音/藏干）
dayMaster    日主（天干、五行、阴阳）
strength     旺衰（score / level / basis[]）
pattern      格局（name / basis / shishen）
yongshen     喜忌用神（favorable[] / unfavorable[] / basis / note）
shensha      神煞（108 项，name/cat/position/desc）
dayun        大运（顺逆/起运年龄/steps[10]，含十神与 impact）
liunian      流年（当年-1 ~ +5，共 7 条）
relations    刑冲合害（gan / zhi / all）
canggan / nayin / changsheng / zizuo / xunkong
mingGong / shenGong / mingGua / taiyuan
elementCount / elementPercent   五行含量与占比
chengGu      称骨
```

### 1.2 现有 LLM 通道的 7 个问题（必须重写，不能小修）

代码在 `src/interpret/index.js:149-173`，问题是：

1. **一次调用生成全部章节**，靠 `text.split(/\n{1,}/)` 按段落顺序映射（`:205-207`）。段数不等于章节数 → 整份报告直接回落本地。这是**全有全无**的设计，一次网络抖动就前功尽弃。
2. **无结构化输出**，纯自然语言靠换行切，AI 多打一个空行就错位。
3. **Prompt 极粗**：只有"每段 150-260 字"，没有章节定义、没有输出格式、没有事实边界。
4. **事实注入粗暴**：`JSON.stringify(factPack.facts).slice(0, 12000)` —— 截断到 12000 字符，既浪费 token 又丢关键字段，还塞进大量噪音。
5. **无超时 / 无重试 / 无并发控制 / 无缓存**。同一八字每次都重新花钱、重新等。
6. `temperature: 0.7` 对命理报告偏高，同一人两次生成差异明显，不利于付费复购信任。
7. **无事实护栏**：AI 可能自行推算命理事实（这是本项目最大的内容风险）。

### 1.3 合盘：零实现

全局检索 `合盘|hepan|双人|情侣|compatibility` 零命中。仅在规划文档里被提及。需从零建。

### 1.4 章节结构现状

八字现有 11 章（`src/interpret/bazi/index.js:157-167`）：
`mingju`（命局）`geju`（格局）→ 免费；`xingge` `shiye` `caiyun` `ganqing` `qinyuan` `jiankang` `chenggu` `dayun` `liunian` → 付费。

**与你要求的顺序不一致**，且**神煞没有独立成章**（现在只是排盘表里的一张表）。需按你的顺序重排。

---

## 二、agnes-2.5-flash 接入：已核实的事实

> 注意：搜索时先撞到的是 `agnes-video-2.5-flash`（视频模型，名字里带 video）。**你说的 `agnes-2.5-flash` 是文本模型**，两者不同，别配错。

| 项 | 值 |
|---|---|
| 厂商 | 新加坡 Sapiens AI（Agnes AI） |
| 模型 ID | `agnes-2.5-flash` |
| Base URL | `https://apihub.agnes-ai.com/v1` |
| Endpoint | `POST /v1/chat/completions` |
| 鉴权 | `Authorization: Bearer <API_KEY>` |
| 协议 | **OpenAI 完全兼容**（messages / stream / tools 格式一致） |
| 上下文 | 512K |
| 最大输出 | 65,500 tokens |
| 价格 | 输入 / 输出 / 缓存 **全部 $0 每 1M tokens**（标准价 $0.05 / $0.15，当前促销归零，**无公布到期日**） |
| 其他 | 支持 tool calling、streaming、图像 URL 输入 |

### ⚠️ 两个风险点

**风险 1：官方文档未列出 `response_format: { type: "json_object" }`。**
文档的请求参数表只有 `model / messages / temperature / top_p / max_tokens / stream / tools / tool_choice / chat_template_kwargs / thinking`。**不能假设支持 JSON 模式**。
→ 应对：优先用 **tool calling（function calling）强制结构化**，这是文档明确支持的，比 `response_format` 更可靠。详见 §4.2。

**风险 2：免费是促销态，无公布到期日。**
→ 应对：接入层做成可插拔（env 配 endpoint/model/key），明天换模型只改 env；同时**本地规则引擎永远作为兜底**，AI 挂了产品照样能出报告（只是文风差一点）。

### 需要你提供的

- [ ] **API Key**（服务端专用，绝不下发前端）
- [ ] 确认账号在 `platform.agnes-ai.com` 已开通
- [ ] 是否接受"AI 不可用 → 自动回落本地规则引擎"（我强烈建议保留）

---

## 三、目标架构：三层分离

核心原则一句话：**排盘是确定性的（本地引擎算），版式是固定的（模板定义），只有文字是 AI 生成的（且被 schema 约束）。**

```
                ┌─────────────────────────────────────┐
   用户输入 ──▶ │  ① 事实层（本地，确定性，零 AI）      │
   生日/性别/   │     engines/bazi.js → factpack.js     │
   城市/双人    │     产出：四柱/格局/喜忌/神煞/大运…    │
                └──────────────┬──────────────────────┘
                               │ 事实包（带编号 F1..Fn）
                ┌──────────────▼──────────────────────┐
                │  ② 编排层（新增 core/reportPlan.js） │
                │     模板定义 → 挑字段 → 组 prompt     │
                │     → 调 AI → 校验 → 降级            │
                └──────────────┬──────────────────────┘
                               │ 结构化 slot 值
                ┌──────────────▼──────────────────────┐
                │  ③ 渲染层（本地，固定版式）           │
                │     charts/bazi.js  排盘（不受 AI 影响）│
                │     templates/*.js  章节卡（固定骨架） │
                └──────────────┬──────────────────────┘
                               │
                ┌──────────────▼──────────────────────┐
                │  ④ 合规网关（唯一出口，不可绕过）      │
                └──────────────┬──────────────────────┘
                               ▼
                         HTML 报告 / 分享卡
```

### 新增模块清单

| 模块 | 职责 |
|---|---|
| `src/core/reportPlan.js` | **模板注册表**：定义每个体系有哪些章、每章有哪些 slot、每章需要哪些事实字段 |
| `src/ai/client.js` | AI 客户端：超时、重试、并发池、token 计量、成本日志 |
| `src/ai/schema.js` | slot → JSON Schema → tool calling 参数的转换 |
| `src/ai/prompt.js` | system/user prompt 组装（含事实编号注入） |
| `src/ai/parse.js` | 结构化解析与容错（tool_call 优先 → JSON 块提取 → 正则兜底） |
| `src/ai/cache.js` | 按「模板版本 + 事实包 id + 章节 key」缓存，TTL 30 天 |
| `src/report/templates/bazi.js` | 八字章节卡 HTML 模板（固定骨架） |
| `src/report/templates/hepan.js` | 合盘章节卡 HTML 模板 |
| `src/report/charts/hepan.js` | 合盘排盘（双盘并排 + 中央关系连线） |
| `src/engines/hepan.js` | 合盘算法（本地确定性计算） |

---

## 四、模板化协议设计（最关键的一节）

### 4.1 Slot 协议

每一章不是"一段自由文本"，而是**一组具名槽位**。AI 只填值，不排版、不定结构。

```js
// src/core/reportPlan.js 片段
{
  key: 'geju',                    // 章节 key
  title: '格局与喜忌',
  order: 2,
  free: true,                     // 是否免费章
  needs: ['pattern','yongshen','dayMaster','strength','elementPercent'],
  slots: {
    headline:  { type: 'string', max: 24,  desc: '一句话结论，不超过 24 字' },
    summary:   { type: 'string', min: 120, max: 260, desc: '核心解读，2-3 段' },
    points:    { type: 'array',  len: 3, item: { t: '小标题(≤8字)', d: '说明(40-80字)' } },
    basis:     { type: 'array',  len: 2, max: 4, item: 'string', desc: '只引用事实编号，如 F3' },
    advice:    { type: 'array',  len: 2, max: 3, item: 'string', desc: '可执行建议，不涉医疗投资法律' },
  },
}
```

**为什么这样做**：
- 版式 100% 由本地模板控制 → 不可能"歪歪扭扭"，字号/间距/对齐全部写死在 CSS 里
- AI 输出被 schema 约束 → 不会出现长度失控、缺字段、乱排版
- 校验失败可**单章重试**，不用整份报告重来（这是相对现状最大的改进）

### 4.2 结构化输出：两条路，都要

```
第一优先：tool calling（function calling）
   → 传 tools:[{function:{name:'fill_report', parameters:<slot 的 JSON Schema>}}]
   → tool_choice:{type:'function', function:{name:'fill_report'}}  强制调用
   → 从 choices[0].message.tool_calls[0].function.arguments 拿 JSON
   ✔ 文档明确支持，结构化最稳

第二优先（降级）：prompt 内声明 JSON + 容错解析
   → 要求输出 ```json 代码块
   → parse.js 依次尝试：整段 JSON.parse → 提取 ```json 块 → 提取首个 {...} → 按行容错
   → 仍失败则该章标记 failed，走降级

降级链（每章独立，不影响其他章）：
   tool_call 成功 → 用
   ↓ 失败
   JSON 解析成功 → 用
   ↓ 失败
   重试 1 次（temperature 降到 0.2）
   ↓ 失败
   该章回落本地规则引擎文案（本地已有完整实现）
   ↓
   全部章节失败 → 整份回落本地（source='local-fallback'），用户无感
```

**关键设计：单章粒度失败隔离。** 现状是"段数不对就全废"，新设计是"一章坏了只坏一章"。

### 4.3 事实注入：给 AI 的不是整个 JSON，是带编号的精选事实

```js
// 只为当前章节挑选需要的字段，并编号
const facts = [
  'F1 四柱：庚午 辛巳 甲子 丙寅',
  'F2 日主：甲木（阳）',
  'F3 格局：食神格（月支巳火本气丙火为食神）',
  'F4 旺衰：偏弱（得分 42，同党 3 异党 5）',
  'F5 喜用神：水、木　忌神：火、土',
  'F6 五行占比：木22% 火31% 土15% 金12% 水20%',
];
```

Prompt 里明确写死护栏：

```
铁律：
1. 只能使用上面 F1-F6 编号事实中出现过的命理信息。
2. 严禁推算、补充、修正任何命理事实（不得自己排盘、不得自己定格局、不得自己算大运）。
3. 「依据溯源」只能填事实编号（如 F3），不得编造不存在的编号。
4. 严禁医疗、投资、法律结论；严禁断言式预测（"你一定会…"），一律改倾向表述（"更倾向…"）。
5. 不得输出 Markdown 标题、不得输出排版指令，只填槽位文本。
```

这条护栏 + 合规网关双保险，解决"AI 编造命理事实"这个最大风险。

### 4.4 调用策略

- **逐章并发**，并发池 = 3，单章超时 25s，重试 1 次
- `temperature: 0.35`（报告要稳定，同一人两次生成差异要小）
- `max_tokens` 按章给（小结 200，大章 900）
- 结果按 `模板版本 + factPackId + 章节key` 缓存 30 天 → 同八字第二次秒开、零成本
- 每次调用记录 `{model, promptTokens, completionTokens, latencyMs, ok}` 到 `data/ai-usage.log`

---

## 五、八字报告模板（按你指定的顺序）

| # | 章节 | 免费 | AI 拿到的字段 | 版式 |
|---|---|---|---|---|
| 1 | **命局概览** | ✔ | fourPillars / dayMaster / strength / elementPercent | 结论条 + 三段 + 五行条 |
| 2 | **格局喜忌** | ✔ | pattern / yongshen / strength / elementPercent | 结论条 + 卡片（格局/喜/忌）+ 要点3 |
| 3 | **性格特点** | ✖ | dayMaster / shishen / pattern / zizuo / shensha(性格类) | 结论条 + 三段 + 要点3（优势/盲点/相处） |
| 4 | **健康提醒** | ✖ | elementPercent / dayMaster / yongshen / changsheng | 结论条 + 三段 + 要点3 + **强合规护栏** |
| 5 | **感情婚姻** | ✖ | fourPillars(日柱) / relations / shishen / shensha(桃花类) | 结论条 + 三段 + 要点3 + 建议 |
| 6 | **事业方向** | ✖ | pattern / yongshen / shishen / strength | 结论条 + 三段 + 要点3（适合行业/阶段/雷区） |
| 7 | **财运走势** | ✖ | pattern / yongshen / dayun / liunian / shishen(财) | 结论条 + 三段 + 要点3 + 时间轴 |
| 8 | **大运流年** | ✖ | dayun / liunian / yongshen | **时间轴卡**（10 步大运横条 + 7 年流年）+ 三段 |
| 9 | **神煞详解** | ✖ | shensha（全量 108 项，按吉凶分类） | **神煞表**（名称/位置/类别/释义）+ 三段 |
| 10 | **称骨批注** | ✖ | chengGu | 数值卡 + 三段 |

> 备注：现有 `qinyuan`（六亲）我建议**并入"感情婚姻"**，不单独成章——付费章太多会稀释转化，10 章比 11 章更好卖。这一条请你定。

**每章固定骨架（版式写死，AI 改不了）**：

```
┌────────────────────────────────────────┐
│ ② 格局与喜忌            [免费/已解锁]   │  ← 序号 + 标题 + 徽标
├────────────────────────────────────────┤
│  ┃ 食神格，喜水木、忌火土               │  ← headline（金色左边条，20px）
├────────────────────────────────────────┤
│  <summary 三段正文，行高 1.9，15px>      │
├────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐     │  ← points 三卡并排
│  │ 小标题  │ │ 小标题  │ │ 小标题  │     │     移动端自动堆叠
│  │ 说明…   │ │ 说明…   │ │ 说明…   │     │
│  └────────┘ └────────┘ └────────┘     │
├────────────────────────────────────────┤
│  依据溯源  F3 · F5 · F6                 │  ← basis（只显示事实编号，可点展开原文）
├────────────────────────────────────────┤
│  ▸ 建议                                 │
│   1. …                                  │
│   2. …                                  │
└────────────────────────────────────────┘
```

---

## 六、合盘功能设计

### 6.1 输入

双栏表单：甲方（姓名/性别/公历生日时分/出生地）、乙方（同）。复用现有城市列表与真太阳时逻辑。

### 6.2 合盘算法（`src/engines/hepan.js`，本地确定性，不给 AI 算）

| 维度 | 规则 | 输出 |
|---|---|---|
| 天干五合 | 甲己合土 / 乙庚合金 / 丙辛合水 / 丁壬合木 / 戊癸合火 | 命中项 + 合化五行 |
| 地支六合 | 子丑 / 寅亥 / 卯戌 / 辰酉 / 巳申 / 午未 | 命中项 |
| 地支三合 / 三会 | 申子辰、亥卯未… 寅卯辰… | 命中局 |
| 地支六冲 | 子午 / 丑未 / 寅申 / 卯酉 / 辰戌 / 巳亥 | ⚠️ 冲突项 |
| 相刑 / 相害 / 相破 | 寅巳申… 子未… 子酉… | ⚠️ 冲突项 |
| 日柱关系 | **日干合 + 日支关系**（夫妻宫，权重最高） | 主关系判定 |
| 生肖（年支） | 六合 / 三合 / 六冲 / 六害 / 相刑 | 民俗向结论 |
| 纳音 | 双纳音五行生克 | 生/克/比和 |
| 五行互补 | 双方 elementPercent 差异 → 互补度 | 0-100 分 |
| 用神互补 | A 的 favorable 是否为 B 命局所旺 | 互补 / 一般 / 相耗 |
| 十神互补 | 如 A 身强需官杀，B 官杀旺 | 互补项 |

**契合指数**（0-100）= 加权：日柱关系 30% + 天干地支合 20% + 五行互补 20% + 用神互补 15% + 生肖纳音 15%，刑冲项扣分。

→ 输出：总分、分档（天作之合 / 相得益彰 / 互补有成 / 需要磨合 / 挑战较多）、命中清单（吉项 + 需要注意项）、各维度明细。

**这些全部本地算，AI 只负责把这份结果写成人话。**

### 6.3 合盘排盘 UI（`src/report/charts/hepan.js`）

```
┌──────────────────┬─────────┬──────────────────┐
│   甲方 张某       │  合  盘  │   乙方 李某       │
│   庚午 辛巳       │         │   癸酉 壬戌       │
│   甲子 丙寅       │  ┌───┐  │   乙丑 丁亥       │
│   日主 甲木       │  │82│  │   日主 乙木       │
│   五行条          │  │契合│  │   五行条          │
└──────────────────┴──┴───┴──┴──────────────────┘
        │                                  │
        └──────── 中央关系连线区 ───────────┘
          天干合：乙庚合金（日干）
          地支合：子丑合土
          地支冲：午酉（无）· 寅申（无）
          五行互补：A 缺水 ← B 水旺  ✔
```

### 6.4 合盘报告章节

| # | 章节 | 内容 |
|---|---|---|
| 1 | 合盘总论 | 契合指数 + 分档 + 一句话定调 |
| 2 | 天干地支合 | 命中清单逐条解读 |
| 3 | 日柱与夫妻宫 | **权重最高**，重点写 |
| 4 | 五行与用神互补 | 谁补谁、补什么 |
| 5 | 需要注意的刑冲 | 冲突项 + 化解建议（中性表述） |
| 6 | 相处建议 | 3-5 条可执行 |

---

## 七、UI / 交互设计

### 7.1 报告页结构

```
[顶部] 体系名 + 生成时间 + 事实包号 + 「来源：AI 深度解读 / 本地规则」
[排盘] 固定版式命盘（本地渲染，与 AI 无关）       ← 永远好看，因为不受 AI 影响
[进度] 生成中：逐章点亮（① 命局概览 ✓ ② 格局喜忌 ✓ ③ 性格特点 生成中…）
[章节] 10 张固定骨架章节卡
[底部] 分享卡按钮 / 导出
```

### 7.2 生成中的体验（重要）

AI 逐章生成会有 10-25 秒等待。设计：
- 前端先渲染**排盘 + 骨架屏章节卡**（占位灰条），用户立刻看到东西
- 后端**逐章完成即推送**（SSE 或轮询 `/api/report/:id/progress`）
- 每完成一章就替换该卡 → 有"内容在长出来"的实感，转化率高
- 全失败时骨架卡直接变成本地规则引擎文案，用户无感

### 7.3 视觉规范（沿用现有 token）

- 章节卡：白底、`--line` 描边、圆角 12px、内边距 20px、卡间距 16px
- 结论条：金色左边条 3px、字号 17px、字重 600
- 要点卡：三列 grid，`≤640px` 堆叠单列
- 正文字号 15px、行高 1.9、段间距 12px
- 所有中文字号/间距走 CSS 变量，只在一处改

### 7.4 移动端

- 双盘在 390px 下改为**上下堆叠**，中央关系区移到下方
- 要点卡单列
- 时间轴横向可滚动

---

## 八、工程与风控

| 项 | 方案 |
|---|---|
| Key 安全 | 仅服务端 `process.env.AGNES_API_KEY`，绝不下发前端；报告页不暴露 |
| 超时 | 单章 25s，AbortController |
| 重试 | 1 次，temperature 降到 0.2 |
| 并发 | 池大小 3，避免触发限流 |
| 缓存 | 30 天，按 模板版本+factPackId+章节key |
| 成本 | 当前 $0；记录 `data/ai-usage.log`，转正后可算单份成本 |
| 合规 | **AI 输出必须过 `gateSections()`**，与本地文案同口径，不可绕过 |
| 事实护栏 | prompt 硬约束 + 依据溯源只认事实编号 |
| 可观测 | 每次调用落日志：模型/耗时/token/成功失败/降级原因 |
| 开关 | `AI_ENABLED`（默认 true）、`AI_FORCE_LOCAL=1` 可强制走本地 |

---

## 九、实施计划

| 阶段 | 内容 | 交付物 |
|---|---|---|
| **P0 地基** | `ai/client.js` `schema.js` `prompt.js` `parse.js` `cache.js` + `core/reportPlan.js` | 能用 tool calling 稳定拿到一份结构化章节 |
| **P1 八字改造** | 10 章模板 + 报告页骨架 + 进度推送 + 合规接入 | 八字报告换成 AI 版，本地兜底保留 |
| **P2 合盘** | `engines/hepan.js` + `charts/hepan.js` + 6 章模板 + 双栏输入页 | 合盘上线 |
| **P3 打磨** | 其余三体系（六爻/奇门/紫微）迁移到同一套模板协议 | 四体系统一 |

建议 **P0+P1 一起做**（这是变现主路径），P2 紧随。

---

## 十、需要你拍板的 6 个决策

1. **API Key**：什么时候给我？（我先用 mock 客户端把 P0 全链路跑通，Key 一到即可切真）
2. **章节取舍**：`qinyuan`（六亲）并入感情婚姻，还是保留独立成章？（我建议并入，10 章更好卖）
3. **免费章数量**：现在 2 章免费。AI 版是否还是 2 章？（建议仍 2 章：命局概览 + 格局喜忌）
4. **生成方式**：逐章 SSE 实时推送（体验好、实现复杂）vs 一次性等待（简单）？（我建议 SSE）
5. **AI 不可用时**：自动回落本地（用户看到的是本地文案，不报错）——确认接受？
6. **合盘定价**：合盘是全新增量，建议单开 SKU（如 ¥9.9），还是并入全量包？

---

## 附：一句话总结

**排盘本地算（永远好看）、版式模板定（永远整齐）、文字 AI 填（被 schema 约束）、合规统一过（不可绕过）、失败单章隔离（不连坐）、全挂回落本地（用户无感）。**

---

## 十一、P0 实施记录（2026-10-05，已完工）

### 11.1 落地文件

| 文件 | 作用 |
|---|---|
| `src/core/reportPlan.js` | 模板注册表中枢：PLAN_VERSION、10 章注册、15 个事实抽取器 `FACT_PRESETS`、`buildFactLines()` 产出 F1..Fn、`planSelfCheck()` 自检 |
| `src/ai/client.js` | agnes 客户端：40s 超时 / 并发池 2 / 429 退避 1.5-3-6s / token 计量落 `data/ai-usage.log`；`AI_ENABLED`、`AI_FORCE_LOCAL` 总开关 |
| `src/ai/schema.js` | slot 定义 → JSON Schema → tool calling 参数（`fill_report`） |
| `src/ai/prompt.js` | system 铁律（事实边界 / 依据只认编号 / 倾向表述 / 合规红线）+ 健康章、财运章专属护栏 |
| `src/ai/parse.js` | 降级链 tool_call → ```json 块 → 首个配平 {} → 逐 key 抠；再校验、截断、basis 白名单、分段归一化 |
| `src/ai/cache.js` | 30 天缓存，键 `v{PLAN_VERSION}:{system}:{factPackId}:{章节}` |
| `src/ai/index.js` | 编排：单章失败隔离 + 缓存→AI→本地三级降级；`onChapter` 回调供 SSE |
| `src/report/templates/bazi.js` | 固定骨架章节卡（全部文本过 `gate()` 唯一出口）+ 骨架屏 + 整页渲染 |
| `scripts/p0_ai_report.mjs` | 端到端：真 Key 跑 10 章 → 出 `.p0_report.html` |
| `scripts/p0_verify.mjs` | 52 项门禁（模板/事实编号/schema/解析容错/缓存/版式双端） |
| `scripts/agnes_structured.mjs` | 结构化能力探针（换模型或排查"槽位填不满"时跑） |

### 11.2 实测数据（真 Key，样本 1990-05-05 10:00 男 北京）

- **10/10 章 AI 成功**，`via=tool_call`，零本地兜底；单章 7~16s，并发 2 整份墙钟 **~56s**。
- 槽位全部填满：summary 167~320 字、points 3~4 项、basis 均引用真实 F 编号。
- **二次跑：10 章全命中缓存，1ms 出报告，零成本。**
- 版式体检：桌面 1280 / 移动 390 双端 **0 横向溢出**；要点桌面三列、移动单列；无空块、无内部溢出。
- 门禁 **52/52**。

### 11.3 三个必须记住的坑

1. **`max_tokens` 给小 → array 槽位静默全空。** 首跑 8/10 章 points/basis/advice 空，一度怀疑"agnes tool calling 不支持 array"。探针一跑推翻：**同样 schema 单独调用数组字段返回完整（1003 completion tokens，reasoning 占 470）**。真因是 max_tokens 只给了 500~900，**reasoning_tokens 占 completion 约 45%**，模型写到 summary 就被截断、后续字段直接省略，且不一定报 `finish_reason=length`。
   → 现在按章给 **1400（小章）/1600（中章）/2000（大运·神煞）**。
2. **429 免费额度限流。** 并发 3 必撞 `You've reached the API rate limit for free users` → 并发池默认降到 **2** + 429/5xx 退避重试。换付费 plan 前别调高。
3. **basis 白名单差点写成死代码。** `if (Array.isArray(slots.basis))` 判的是"槽位值是不是数组"而非"有无 basis 键"，恒 false → 编造编号（F99）直接漏网。已改 `Object.prototype.hasOwnProperty.call(slots,'basis')`，并加门禁用例锁死。

### 11.4 你拍板的 6 项 → 落地位置

| 决策 | 落地 |
|---|---|
| ① Key 在桌面 agnes.txt | `scripts/p0_ai_report.mjs` 自动读（绝不硬编码进源码）；生产走 `AGNES_API_KEY` env |
| ② 六亲并入感情婚姻 | `BAZI_PLAN` 无 `qinyuan` 章；`ganqing` needs 含 fourPillars/relations/shishen/shenshaTaohua/sanYuan |
| ③ 免费仍 2 章 | `mingju` + `geju`，`planSelfCheck` 强制校验恰好 2 章 |
| ④ SSE 逐章推送 | `generateReport({ onChapter })` 已埋好逐章回调，`src/ai/index.js` |
| ⑤ AI 挂了回落本地 | 单章级回落 + 全挂回落，返回体 `source='ai'|'cache'|'local'` 如实标记，用户无感 |
| ⑥ 合盘单开 SKU | 未开工（P2），架构已预留 `PLAN_TABLE` 注册口 |

### 11.5 下一步（已由 §十二 完成）

- **P1**：八字报告页接入线上（`web/bazi.html` 骨架屏 + `/api/report/stream` SSE 逐章推送）、解锁/付费接通、本地兜底文案重做为 slot 原生。→ **已完工，见 §十二。**
- **P2**：`engines/hepan.js` + `charts/hepan.js` + 6 章合盘模板 + 双栏输入页 + 单开 SKU。→ 未开工（#76）。
- **P3**：六爻 / 奇门 / 紫微迁移到同一模板协议。

---

## 十二、P1 实施记录（2026-10-05，已完工）

P1 目标：把 P0 的 AI 报告层接进线上——报告页走 AI 固定骨架、SSE 逐章实时推送、解锁/付费接通、本地兜底重做为 slot 原生。

### 12.1 落地文件

**新增**

| 文件 | 作用 |
|---|---|
| `src/ai/service.js` | 服务层装配点：`sessionUserOf()` / `resolvePurchased()` / `buildReport()`。`buildReport({factPack, purchasedSet, useCache, onChapter})` 逐章产出——判解锁 → `renderChapterCard` 出 HTML → `onChapter` 回调；返回汇总与 `source`。SSE 与一次性两种消费共用，避免两处渲染漂移。 |
| `scripts/p1_stream_probe.mjs` | P1 端到端门禁：SSE / 整页 / JSON / 复用四类 30+ 断言 |

**改动**

| 文件 | 改动 |
|---|---|
| `src/ai/index.js` | `generateChapter` 统一算一次 `buildFactLines()`；本地兜底 `localFallback(chapter, facts, factLines)` 也带真实 `F` 编号，版式与 AI 章一致（神煞章无 localKey 时用 `factLines` 拼 summary） |
| `src/ai/client.js` | Key 单文件入口：`AGNES_KEY_FILE` 指向桌面 txt 读首行 `sk-`，`AGNES_API_KEY` 优先；启动播报 `[AI] ...` 四态（未启用 / 强制本地 / 已启用 model / 未配置 Key） |
| `src/report/templates/bazi.js` | `renderReportPage` 章节卡两种入参都吃（`c.html` 直用，或 `renderChapterCard(c.chapter, c.data, ...)`）；页脚免责受 `DISCLAIMER_ENABLED` 总开关 |
| `src/server/index.js` | 新增 `GET /api/report/css`（供 `TEMPLATE_CSS` 单源）、`POST /api/report/stream`（SSE 逐章 + `?mode=json` 双模）、`sseStart/sseSend/sseTail`（15s 心跳）工具；`/api/report` 的 purchasedSet 逻辑迁到 `service.resolvePurchased`；`/api/report/:id/html` 优先走 `renderReportPage(rec.ai.chapters)` |
| `src/commerce/sku.js` | 价表 `SECTION_PRICE.bazi`：`qinyuan`→`shensha`、删 `liunian`，与 10 章计划对齐 |
| `web/app.js` | `runReportSse()` 消费 SSE（非 200 抛中文错、非 `text/event-stream` 则回落 JSON、`res.body.getReader()` 按 `\n\n` 切帧分发 start/chapter/fallback/done）；`runReport()` 三级兜底 SSE → JSON → 老 `/api/report`；`ensureReportCss()` 动态挂 `/api/report/css`；`priceMap.bazi` 同步 |
| `web/bazi.html` | stage 区新增 `<div id="reportBody">`（骨架屏容器） |
| `web/style.css` | `.rp-host` / `.rp-fb`（本地兜底提示条） |
| `start-server.bat` | 未设 `AGNES_API_KEY` 时自动挂 `AGNES_KEY_FILE=C:\Users\Administrator\Desktop\agnes.txt` 并 echo 是否找到 |

### 12.2 SSE 协议

```
响应头  Content-Type: text/event-stream
        Cache-Control: no-cache, no-transform
        X-Accel-Buffering: no        // nginx 关缓冲，否则逐章会被攒成一刀
事件序  start → chapter* → fallback? → done
心跳    每 15s  `: ping` 并 unref
双模    ?mode=json  一次性返回（前段不建流，直接 sendJson）
缓存    ?useCache=0 绕过缓存
```

### 12.3 实测数据（`p1_stream_probe.mjs`，冷启动生辰 `1996-08-20 03:40 上海 女`，避缓存验证真 AI 逐章）

- **10/10 章 `source=ai`**，单章 7~29s；**首章到达 +11.2s、整份 76.5s** —— 证明是真 SSE 逐章，不是攒一刀后一次性吐。
- 整页 `/api/report/:id/html` 走 AI 固定骨架：`rp-wrap` / `rp-hd-bar` / `rp-pts` / `rp-basis` / `rp-adv` / `rp-hd` / `rp-lock` 均在，10 张章节卡，无免责声明块。
- `verifyReportToken` 行为不变：无令牌 403、不存在报告 404、有效令牌 200。
- `?mode=json`：10 章、每章带非空格 html、全部 `unlocked===true`、带报告令牌。
- **复用已有命盘**：`reused=true`、10 章 9ms、`done` 带 `reused:true` 提示（不重烧 AI 额度）。

### 12.4 三个新踩的坑

1. **服务进程没挂 Key → 10/10 全 local（报告看着"能出"但零 AI 含量）。** 探针跑完发现每章 `source=local`，服务端日志却只有 `[AI] 未配置 Key`。根因是单独 `node src/server/index.js` 启动不带 Key 环境变量，而 Key 只写在 P0 探针脚本里。
   → 修法：`client.js` 加 `AGNES_KEY_FILE` 读桌面 txt，`start-server.bat` 自动挂，服务启动日志显式播报 Key 状态。**排查心法：永远先看启动日志那行 `[AI] ...`，不要信"报告能出"这件事本身。**

2. **价表与章节计划键不同步 → 免费模式下神煞章被误锁成 `rp-lock`（整页只剩 9 张卡）。** `resolvePurchased` 免费模式只把 `SECTION_PRICE` 的键塞进 `purchasedSet`，而价表还残留已废弃的 `qinyuan`、缺 `shensha`、多出不在计划里的 `liunian`，于是 `shensha` 既不在价表也不在解锁集合。
   → 三处同修：`sku.js` 价表对齐；`resolvePurchased` 免费模式额外 `for (const c of listChapters(system)) purchasedSet.add(c.key)`；前端 `priceMap.bazi` 同步。门禁新增「价表覆盖计划全部付费章 8/8」锁死这类漂移。

3. **复用判定写在「先落盘」之后 → `reused=false`。** `/api/report/stream` 里 `reports.set(fp.id, saved)` 一执行，`saved.ai.chapters` 还是空数组，就把上一份结果盖成空，导致复用请求永远读不到旧章节卡。
   → 把 `const cached = reuse ? (reports.get(fp.id)?.ai ?? null) : null;` 提到 `reports.set` 之前（且早于 `purchasedSet`/`panHtml`）。**落盘时机能和"要不要读旧数据"打交道的，都必须先想清楚顺序。**

> 附注：探针自身还犯过一次假 FAIL——在 `frames.chapter.forEach` 里重算到达时刻覆盖了真实时间戳，导致「首章先于整份到达」恒不成立。改在 `onFrame` 打戳即可。

### 12.5 回归结果（P1 收尾全跑，零失败）

| 套件 | 结果 |
|---|---|
| `tests/run.js` | **63/63 通过** |
| `tests/smoke.js` | **40/40 通过** |
| `scripts/probe_compliance.mjs` | **138 项，PASS=120，FAIL=0，N/A=18**（四体系章节 / tooltip / 分享卡 / 报告页 / 前端弹层 / 页脚入口全覆盖） |
| `scripts/p0_verify.mjs` | **52/52 通过**（模板注册表 / 事实编号 / schema / 解析容错 / 缓存开关 / 版式双端） |
| `scripts/p1_stream_probe.mjs` | **全绿 PROBE_EXIT=0** |

> 注：`p0_verify.mjs` 等独立进程跑时若不挂 `AGNES_KEY_FILE`，首行会打印 `[AI] 未配置 Key（报告回落本地规则引擎）`——门禁覆盖的是本地能力，属预期，不代表线上状态。

### 12.6 交付口径

- 排盘**永远本地算**（好看且确定），版式**永远本地模板**（整齐且固定），AI 只填文字 slot 并被 schema 与 basis 白名单约束。
- AI 不可用时**单章隔离 + 整份回落本地**，前端插 `.rp-fb` 说明条，用户无感。
- API Key **不进源码**：桌面 txt 或 `AGNES_API_KEY` 环境变量，前端 `/api/health` 只暴露开关状态，绝不下发 Key。
- 全程未改 `DISCLAIMER_ENABLED`（当前 `false`）、保留 `verifyReportToken` 令牌校验。

## 十三、P2 实施记录（2026-10-05，已完工）：八字合盘

### 13.1 落地文件

| 文件 | 作用 |
|---|---|
| `src/engines/hepan.js` | **新增** 合盘引擎（确定性，绝不让 AI 当算盘）：`computeHePan({a,b,names})` 四维推演 + 契合指数 + 五档分档 |
| `src/report/charts/hepan.js` | **新增** 合盘排盘图：双栏命盘（各 4 柱＋五行条＋日主/生肖/格局/纳音）＋ 中央指数＋四维 ＋ 关系区（相合相引 / 需要注意），样式前缀 `hp-` |
| `src/report/templates/hepan.js` | **新增** 合盘章节卡 / 骨架屏 / 整页 `renderHePanPage`（复用八字章节卡 `rp-*`，版式只有一份；`gateSystem:'hepan'` + 解锁价 `¥9.9`） |
| `src/core/reportPlan.js` | `buildFactLines(chapterKey, facts, system='bazi')` 增加体系参数；新增 `FACT_PRESETS_HEPAN` 六套抽取器与 `HEWAN_PLAN` 六章；`planSelfCheck()` 校验 order 连续 1..n + hepan 强制 1 免费章（`hetong`） |
| `src/commerce/sku.js` | `SECTION_PRICE.hepan` 五章定价（总觉得免费引流）、`SECTION_TITLE` 中文名、`SKUS` 新增 `hepan_full` ¥39.9 六章全量 |
| `src/ai/service.js` | `CARD_OF(system)` 按体系分派章节卡渲染层，合盘走合盘版式 |
| `src/server/index.js` | 新增 `POST /api/hepan`、`POST /api/hepan/report/stream`（SSE＋json）、`GET /api/hepan/:id/html`；`hepanIdOf()` = `sha1(稳定序列化).slice(0,16)` → **甲乙顺序不影响组合 id，天然可复用**；`/api/report/:id/html` 与分享卡补 hepan 分支 |
| `src/commerce/token.js` | `reportUrl(id, token, pagePath='/api/report')` 增加路由前缀参数 |
| `web/hepan.html` / `web/hepan-drill.js` | **新增** 双栏输入页（甲方 ×合 乙方，性别/历法/闰月/年月日时分/城市/真太阳时）＋ 最近合盘（8 条）＋ 报告区＋SKU 区；脚本自包含（不复用 app.js，避免缺元素报错） |
| `scripts/p2_hepan_engine_check.mjs` | 引擎自检 5 组 17 项（输入契约 / 输出结构 / 确定性 / 跨盘 / 40 组随机指数区间） |
| `scripts/p2_hepan_probe.mjs` | 端到端门禁 4 组 46 项（排盘 / 整页令牌与版式 / SSE 逐章 / 3b AI 冷生成 / 复用 / 价表 SKU） |

### 13.2 契合指数算法（中性基准，不做"算命式打分"）

```
score = clamp( 50 + Σ(维度得分 × DIM_GAIN[dim]), 0, 100 )
DIM_GAIN = { day:.8, combine:.6, wuxing:.8, zodiac:.8 }
```

- **基准 50（中性）**：不预设"感情好不好"，只做**相对偏移**——这是避免指数全体压到谷底的关键。
- 四维：`dayDim`（日柱/夫妻宫，权重最高，`wuxingRel()` 判相生/相克/比和）、`combineDim`（跨盘合局/冲刑害破，`HE_WEIGHT`/`CONFLICT_PENALTY` + `posWeightOf()` 按柱位加权）、`wuxingDim`（喜用互补）、`zodiacDim`（生肖六合/三合/相冲相害 + 纳音生克）。
- 五档：天作之合 / 相得益彰 / 互补有成 / 需要磨合 / 挑战较多。
- 跨盘判定 `isCross()`：`keys.some(a.) && keys.some(b.)`——**必须 `.some` 不是 `.every`**，三合/三会一条记录有 3 支。
- 复用 `core/relations` 的 `analyzeGan/analyzeZhi` 只做**跨盘筛选**单盘口径不漂移。

### 13.3 实测数据（`p2_hepan_probe.mjs` 全绿 46/46）

- 排盘：`POST /api/hepan` **36~104ms**，指数落在五档内，四维齐全（例：日柱 −6 / 干支 +8 / 五行 +20 / 生肖 −3 = 64 分「互补有成」）；同组合二次请求 `reused=true` 且不改指数。
- 整页：JSON 模式 6 章全解锁、`rp-ch` 版式齐全、`rp-basis` 溯源在位；无令牌 403 / 不存在 404 / 带令牌 200；整页含 `hp-wrap`+`hp-score` 合盘抬头与 6 张卡；**无免责声明**；分享卡含「契合指数」。
- **AI 链路（`?useCache=0` 强制冷生成）**：6/6 章 `source=ai`，**首章 +10.65s 到达、整份 38.2s**（真逐章，不是攒一刀）。
- 复用：二次请求 `reused=true`、`replay 6 章`、耗时 **2~7ms**，不重烧 AI 额度。
- 引擎自检 `p2_hepan_engine_check.mjs` **17/17**；40 组随机组合覆盖 4 档（min 51 / max 96）。

### 13.4 本轮五个坑

1. **`computeBazi()` 直接返回 facts，不是 `{facts:{...}}`** —— 自检脚本套了一层 `.facts` 拿到 undefined，静默变成 score=0、档位只剩「挑战较多」。**引擎入口的入参形状，先打印再看。**
2. **`hpList` 默认映射 `(x)=>x.name` 吃掉了字符串** —— `day.items` 是字符串数组，`[undefined].join('；')` 产生空串，页面显示「日柱关系：」空的。→ `typeof x==='string' ? x : x.name` + `.filter(Boolean)`。
3. **指数线性相加把 40 组全压到谷底** —— 跨盘 8 支 28 对里六冲/害/破是常态。→ 改「基准 50 + 维度缩放 + 柱位加权扣分」，`combineDim` 用 `clamp(gain,0,20)+clamp(loss,-12,0)`。
4. **合盘整页与分享卡走了八字模板** —— `reportUrl()` 硬编码 `/api/report/`，`/api/report/:id/html` 无 hepan 分支、`renderShareCardSvg` 无 hepan 分支 → SVG 空、版式丢失。→ 三处补分支，`reportUrl` 加 `pagePath` 参数（hepan 传 `/api/hepan`），**报告地址必须指回自己的路由**。
5. **模板第一版写了非法同步动态加载**（`require0()` 中间 import 再同步返回 module）→ 整个 `templates/hepan.js` 重写为静态 `import`。

> 探针自己也有三处假 FAIL（都修了，记下来省得复发）：
> ① 打整页忘了带 `?t=` → 403；
> ② 复用回放计数用累计 `+=`，同一帧被数成 10 次 → 改「与上一块比对增量」；
> ③ 为取 done 载荷把 `frames.done += 1` 改没了 → 计数与载荷要一起维护。
> 另：重复跑探针时固定组合会命中磁盘 AI 缓存、整份 7ms 就回（看着像没跑），所以加了 **3b 子用例 `?useCache=0`** 保证每轮都真验 AI 链路。

### 13.5 回归结果（P2 收尾六套全跑，零失败）

| 套件 | 结果 |
|---|---|
| `tests/run.js` | **63/63** |
| `tests/smoke.js` | **40/40** |
| `scripts/probe_compliance.mjs` | **138 项，FAIL=0** |
| `scripts/p0_verify.mjs` | **52/52** |
| `scripts/p1_stream_probe.mjs` | **全绿**（SSE/整页/JSON/复用四项） |
| `scripts/p2_hepan_engine_check.mjs` | **17/17** |
| `scripts/p2_hepan_probe.mjs` | **46/46（EXIT=0）** |

> 关键事实：AI 缓存键是 `v{PLAN_VERSION}:{system}:{factPackId}:{chapterKey}` —— **体系在键里，合盘不会串到八字的缓存**。

### 13.6 交付口径（P2 沿用 P1）

- 合盘**本地算**（引擎确定、可复现），版式**本地模板**，AI 只填 6 个文字 slot 并被 schema + `F1..` basis 白名单约束。
- `hetong`（合盘总论）免费引流，其余 5 章 ¥9.9、`hepan_full` ¥39.9 单开 SKU——**合盘与八字不共用 SKU**。
- 服务重启命令沿用：`AGNES_KEY_FILE="C:/Users/Administrator/Desktop/agnes.txt" node src/server/index.js`，先看启动日志那行 `[AI] 已启用 agnes-2.5-flash`。

---

## 十四、线上 bug 修复：表单字符串生辰 → 服务死循环 → 「AI 报告不显示」（2026-09-30 / 归档于 2026-10-05）

### 14.1 现象与真因

用户报「**有 bug AI 生成后的报告 不显示**」。排盘区与报告区同时空白、按钮无反应，但刷新页面能秒回。

第一直觉是前端渲染或 SSE 出问题，实际根因在**服务端死循环**：

1. 浏览器表单 `<input type="number">` 的 `.value` 是**字符串**，前端提交的是 `year:"1990"` 而非 `1990`；
2. 旧 `normalizeInput()` 对**公历**输入原样返回，字符串一路流进 `src/core/lunar.js` / 天文历算；
3. 历算里有大量 `year + 1`、`month + 1` 之类的算术 → `'1990' + 1 === '19901'` 拼接成脏年份 → 新月/节气求解的循环条件永远不成立 → **无限循环**；
4. Node 单进程 event loop 被吃满 → **服务进程 CPU 100%、所有请求挂起**（8787 仍在 LISTENING，但任何 `/api/*` 都不回）；
5. 前端表现就是「点完按钮什么都没有」——报告从没机会生成。

> 关键判据：**服务在 LISTENING 但不响应、且 node 进程 CPU 持续 100%** —— 这不是网络/头问题，是**同步死循环**。

### 14.2 修复点（两处，都是入口防御）

| 文件 | 改法 |
|---|---|
| `src/engines/bazi.js` `normalizeInput()` | 把 `year/month/day/hour/minute` 逐个 `Number()` 收敛；非 Finite 直接 `throw new Error('生辰字段 ${k} 非法：…')`。**八字排盘第一入口**，升级本层后下游一律拿到数字 |
| `src/core/lunar.js` `buildLunarYear(gy)` | 入口 `gy = Number(gy)`，再校验 `Number.isInteger && 1900≤gy≤2100`，否则抛错。**历法底层最后一道闸**，任何绕过 `normalizeInput` 的调用也会被拦住 |

两条设计原则：**入口收敛类型**（而不是指望每层自己判）、**非法值上抛而不是静默兜底**（宁可 400 也不能把脏数据放进去算）。

### 14.3 回归用例（已进 `tests/run.js`）

新增 A11–A13，全部用**字符串形态**入参（数字入参永远测不出这个坑）：

- **A11** `year:"2006"…` 字符串公历生辰：必须 <3s 返回且四柱齐全；
- **A12** `year:"1990"` + `calendar:'lunar'` 字符串农历生辰：同上；
- **A13** `year:"abc"`：必须抛可读错误（`/生辰字段|非法/`），而不是卡死或静默兜底。

### 14.4 排查心法（比结论更值钱）

1. **服务「全挂」先采样 CPU**，再谈别的。`Get-Process node` 连采 3 秒都 100% → 同步死循环；否则才是慢/网络。
2. **浏览器表单值一律按字符串测引擎**。数字路径跑一万遍也不复现。
3. **测引擎用独立子进程 + 超时**。同步跑进程里挂了就分不清「死循环」还是「慢」；子进程 SIGTERM 一下就看清了。
4. **残留 headless Chrome 孤儿会把机器拖死**，导致 CDP 假故障（navigate 超时、`--dump-dom` 空输出）。定位 `wmic` 里带 `--headless` 的 PID 杀掉，用户自己的 Chrome 别动。
5. **CDP 在本机 `br.page({url})` 的 `/json/new?<url>` 偶发不落地** —— 一律改成「先开 about:blank，再 `Page.navigate`」并断言 `location.href` 命中目标页。
6. **骨架 `.rp-sk` 自己就是 `<section>`** —— 断言「报告区出现章节卡」若写 `querySelectorAll('section').length>=6`，会在**骨架期就假通过**（骨架 6 个 section、1679B、0 处依据溯源），然后取一次过早的快照，看起来像「报告没渲染」。**必须只认真章节卡 `.rp-ch`，并要求骨架残留为 0**。我第一版门禁就是这么误报了 4 条 FAIL。

### 14.5 顺手修掉：来源汇总把「缓存」误标成「本地兜底」

浏览器闭环跑通后，`reportSrc` 却显示「本地规则解读」，但内容明明是 AI 写好的。查 `src/ai/index.js` 聚合口径：

```js
source: count('ai') > 0 ? 'ai' : 'local-fallback',
```

**全章命中缓存时 `count('ai')===0` → 整份标成 `local-fallback`**，前端就写「本地规则解读」。可缓存里存的就是 AI 产物，这条口径会误导用户以为 AI 没跑。

改成 ai → cache → local-fallback 三级，并抽成可单测的纯函数（同时是唯一真源， serum 层不再各写一遍）：

```js
export function aggSource(results) {
  const n = (s) => (results || []).filter((r) => r && r.source === s).length;
  if (n('ai') > 0) return 'ai';
  if (n('cache') > 0) return 'cache';
  return 'local-fallback';
}
```

前端随后如实显示「AI（缓存）」。`tests/run.js` 加了 **C11** 锁死六种组合（ai+cache→ai、全 cache→cache、全 local→local-fallback、ai 与 cache 混合→ai、空→local-fallback）。

> 教训：**"看起来能跑"不等于"标记对"**。浏览器断言只要命中 DOM 就过了，真正暴露问题的是那行来源文案 —— 端到端验证必须连**语义标记**一起断言，不能只断言"有内容"。

### 14.6 验证与回归（八套 + 浏览器闭环，零失败）

| 验证 | 结果 |
|---|---|
| 字符串入参单用例（子进程） | 由「打印 start 后无输出（挂死）」变为 6 步全完成，`renderChart done len=9472` |
| 接口压测 | BAD 组合 `2006×2008`：**挂起 12000ms → 200 / 49ms**，连续 22ms / 4ms |
| `tests/run.js` | **67/67**（新增 A11/A12/A13 字符串生辰 + C11 来源口径） |
| `tests/smoke.js` | **40/40** |
| `scripts/probe_compliance.mjs` | **138 项，FAIL=0** |
| `scripts/p0_verify.mjs` | **52/52** |
| `scripts/p1_stream_probe.mjs` | **全绿**（汇总行 `source=cache ai=0 cache=10 local=0`） |
| `scripts/p2_hepan_engine_check.mjs` | **17/17** |
| `scripts/p2_hepan_probe.mjs` | **46/46**，AI 链路 6/6 `source=ai`，首章 +7.8s / 整份 29.5s |
| `scripts/ui_report_check.mjs`（新） | **18/18**：真浏览器点「合盘 → 完整报告」，桌面 + 移动各 9 项，6 卡 / 7050B / 依据溯源 6 处 / 骨架 0 / 来源「AI（缓存）」/ 横向溢出 0 |

> 回归判定重点：`B1 1990-05-20 14:30 北京 = 庚午 辛巳 乙酉 癸未`、`A10 晚子时`、`p0_verify 52 项`、`p2 46/46` 全部保持原值 —— 证明这轮只加了防御和口径修正，没动算法结果。
>
> 改 `src/ai/index.js` 后必须**重启服务再跑门禁**（Node 不热加载）；重启命令：
> `AGNES_KEY_FILE="C:/Users/Administrator/Desktop/agnes.txt" node src/server/index.js`，确认启动日志那行 `[AI] 已启用 agnes-2.5-flash`。
