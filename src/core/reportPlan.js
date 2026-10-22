/**
 * 报告模板注册表（ReportPlan）
 *
 * 定位：整个「AI 报告」架构的中枢契约。
 *   模板定义章 → 挑字段 → 组 prompt → 校验 → 渲染，四步都从这里读口径。
 *
 * 铁律（改这里之前先读）：
 *   1. 本文件只描述「结构」，不产出自然语言。文案一律由 AI 填 slot，或本地兜底。
 *   2. 版式由 report/templates/* 写死，AI 影响不到本文件的 slot 命名。
 *   3. 事实抽取只能取自 factpack 的 facts（本地确定性计算），严禁 AI 自行推算命理事实。
 *   4. needs 里写的字段名，必须能在 FACT_PRESETS 找到对应抽取器，否则视为配置错误。
 *
 * 章节顺序 = 产品侧指定顺序（命局 → 格局 → 性格 → 健康 → 感情 → 事业 → 财运 → 大运 → 神煞 → 称骨）
 * 六亲（qinyuan）按产品决策并入「感情婚姻」，不单独成章。
 */

/** 模板协议版本：改动 slot 命名/结构时必须+1，用于让旧缓存自动失效 */
export const PLAN_VERSION = '1.0.0';

/** 本地兜底引擎版本（AI 全挂时用它出文案，便于溯源） */
export const FALLBACK_VERSION = 'local-bazi-1.0';

// ------------------------------------------------------------------
// 一、事实抽取器
// ------------------------------------------------------------------
// 每个抽取器：输入八字 facts，输出一段「带编号的纯事实文本」。
// 一律只做搬运与截断，不做吉凶断言、不做解释。

const NAMES = { year: '年', month: '月', day: '日', hour: '时' };
const elPct = (pct) => Object.entries(pct || {}).map(([k, v]) => `${k}${v}%`).join(' ');

/** 神煞按类别分组取前 N 条，避免整包 108 项全塞进 prompt */
function shenshaLines(f, { limit = 24, keep = (s) => true } = {}) {
  const list = (f.shensha || []).filter(keep).slice(0, limit);
  if (!list.length) return '本命盘未取到该类别神煞';
  return list
    .map((s) => `- ${s.name}${s.position ? `（${s.position}）` : ''}：${String(s.desc || '').slice(0, 40)}`)
    .join('\n');
}

export const FACT_PRESETS = {
  /** 四柱全貌 */
  fourPillars: (f) => {
    const p = f.fourPillars || {};
    return (
      `四柱：${p.year?.name || ''}年 ${p.month?.name || ''}月 ${p.day?.name || ''}日 ${p.hour?.name || ''}时` +
      `\n十神：年干${p.year?.shishen || ''} 月干${p.month?.shishen || ''} 时干${p.hour?.shishen || ''}` +
      `\n日柱：${p.day?.gan || ''}${p.day?.zhi || ''}（日支${p.day?.zhi || ''}为夫妻宫）` +
      `\n纳音：${p.year?.nayin?.name || p.year?.nayin || ''}／${p.month?.nayin?.name || p.month?.nayin || ''}／${p.day?.nayin?.name || p.day?.nayin || ''}／${p.hour?.nayin?.name || p.hour?.nayin || ''}`
    );
  },

  /** 日主与月令 */
  dayMaster: (f) => {
    const dm = f.dayMaster || {};
    const p = f.fourPillars || {};
    return (
      `日主：${dm.gan || ''}（${dm.element || ''}，${dm.yang ? '阳' : '阴'}干）` +
      `\n月令：${p.month?.zhi || ''}月（${f.monthOrder || ''}）` +
      `\n生肖：${f.lunar?.zodiac || ''}｜农历${f.lunar?.yearGanzhi || ''}年${f.lunar?.monthName || ''}`
    );
  },

  /** 十神分布 */
  shishen: (f) => {
    const s = f.shishen || {};
    const order = ['year', 'month', 'day', 'hour'];
    const items = order.filter((k) => s[k]).map((k) => `${NAMES[k]}干${s[k]}`);
    const cg = f.canggan || {};
    const cgText = order
      .filter((k) => cg[k]?.length)
      .map((k) => `${NAMES[k]}支藏${cg[k].map((c) => (c.gan ? c.gan : c)).join('、')}`)
      .join('；');
    return `十神分布：${items.join(' ')}${cgText ? `\n藏干：${cgText}` : ''}`;
  },

  /** 旺衰 */
  strength: (f) => {
    const st = f.strength || {};
    return `日主强弱：${st.level || '—'}（${st.score ?? '—'} 分）\n判定依据：${(st.basis || []).join('；')}`;
  },

  /** 格局 */
  pattern: (f) => {
    const pt = f.pattern || {};
    return `格局：${pt.name || '—'}（取格依据：${pt.basis || '—'}，月令本气十神：${pt.shishen || '—'}）`;
  },

  /** 喜忌用神 */
  yongshen: (f) => {
    const y = f.yongshen || {};
    return (
      `喜用神：${(y.favorable || []).join('、') || '—'}` +
      `\n忌神：${(y.unfavorable || []).join('、') || '—'}` +
      `\n取用依据：${y.basis || '—'}\n补充说明：${y.note || '—'}`
    );
  },

  /** 五行占比 */
  elementPercent: (f) => `五行占比：${elPct(f.elementPercent)}`,

  /** 十二长生 */
  changsheng: (f) => {
    const cs = f.changsheng || {};
    const parts = ['year', 'month', 'day', 'hour']
      .filter((k) => cs[k]?.state)
      .map((k) => `${NAMES[k]}支${cs[k].state}`);
    const zz = f.zizuo?.state;
    return parts.length ? `十二长生：${parts.join('、')}${zz ? `（日主自坐${zz}）` : ''}` : '十二长生：本命盘未取到';
  },

  /** 干支互动（刑冲合害） */
  relations: (f) => {
    const all = (f.relations?.all || []).slice(0, 8);
    if (!all.length) return '干支互动：本命局未见显著合冲刑会害';
    return `干支互动：${all.map((r) => `${r.name}（${(r.labels || []).join('·')}）`).join('；')}`;
  },

  /** 神煞（默认取前 24 条） */
  shensha: (f) => shenshaLines(f),

  /** 神煞·桃花类 */
  shenshaTaohua: (f) => shenshaLines(f, { limit: 16, keep: (s) => /桃花|红艳|咸池|天喜|红鸾|孤辰|寡宿|华盖|沐浴/.test(s.name || s.cat || '') }),

  /** 神煞·性格类 */
  shenshaXingge: (f) => shenshaLines(f, { limit: 16, keep: (s) => /华盖|将星|魁罡|金舆|驿马|羊刃|劫煞|亡神|禄神|天德|月德|德秀|灵枢|福星/.test(s.name || s.cat || '') }),

  /** 大运 */
  dayun: (f) => {
    const d = f.dayun || {};
    const steps = (d.steps || []).slice(0, 8);
    return (
      `大运起法：${d.basis || '—'}｜${d.forward ? '顺' : '逆'}行｜起运约 ${d.startAge} 岁（约 ${d.startYear} 年）` +
      (steps.length
        ? `\n大运次序：${steps.map((s) => `${s.startAge}岁 ${s.name}（${s.shishen}）`).join('；')}`
        : '')
    );
  },

  /** 流年 */
  liunian: (f) => {
    const ln = f.liunian || [];
    if (!ln.length) return '流年：本命盘未取到';
    return `流年：${ln.map((y) => `${y.year}年${y.ganzhi}（${y.shishen}）`).join('；')}`;
  },

  /** 称骨 */
  chengGu: (f) => {
    const cg = f.chengGu;
    if (!cg) return '称骨：本命盘未取到';
    return (
      `称骨：骨重合计 ${cg.totalQian} 钱（${cg.totalText || ''}）` +
      `\n分项：${(cg.parts || []).map((p) => `${p.label}${p.text}`).join('、')}` +
      `\n歌诀：${cg.verse || ''}`
    );
  },

  /** 三垣（胎元/命宫/身宫） */
  sanYuan: (f) =>
    `胎元${f.taiyuan?.name || '—'}｜命宫${f.mingGong?.name || '—'}｜身宫${f.shenGong?.name || '—'}` +
    `\n旬空：${(f.xunkong || []).join('、') || '—'}${f.xunkongPositions?.length ? `（落${f.xunkongPositions.join('、')}）` : ''}`,
};

/**
 * 抽取某章的事实并编号（F1..Fn）
 * 编号即护栏：AI 的「依据溯源」只允许引用这里出现过的编号。
 * @param {string} chapterKey
 * @param {object} facts  factpack.facts
 * @param {string} [system] 体系（默认 bazi；合盘为 hepan）
 * @returns {Array<{id:string, text:string}>}
 */
export function buildFactLines(chapterKey, facts, system = 'bazi') {
  const ch = getChapter(chapterKey, system);
  if (!ch) return [];
  const out = [];
  let n = 0;
  for (const need of ch.needs || []) {
    const pick = ALL_PRESETS[need];
    if (!pick) continue; // 未知 preset 直接跳过，不报错（保证章节永远能生成）
    let text = '';
    try {
      text = pick(facts);
    } catch {
      text = '';
    }
    if (!text) continue;
    for (const line of String(text).split('\n')) {
      const t = line.trim();
      if (!t) continue;
      n += 1;
      out.push({ id: `F${n}`, text: t });
    }
  }
  return out;
}

// ------------------------------------------------------------------
// 二、八字章节注册
// ------------------------------------------------------------------

/** 通用槽位片段（各章复用，减少重复定义） */
const SL = {
  headline: (max = 26) => ({ type: 'string', max, desc: '一句话结论，不超过 %d 字，不要换行' }),
  summary: (min = 120, max = 280) => ({ type: 'string', min, max, desc: '核心解读，%d-%d 字，可分 2-3 段，用 \n 分段' }),
  points: (min = 2, max = 4) => ({
    type: 'array',
    min,
    max,
    desc: '%d-%d 个要点，每个要点一个小标题加一段说明',
    item: { t: { type: 'string', max: 8, desc: '小标题，不超过 8 字' }, d: { type: 'string', min: 30, max: 90, desc: '说明，30-90 字' } },
  }),
  basis: (max = 5) => ({
    type: 'array',
    min: 1,
    max,
    desc: '依据溯源：只填事实编号（形如 F1、F3），2-4 个，不要编造编号，不要写标题或文字',
  }),
  advice: (min = 2, max = 3) => ({
    type: 'array',
    min,
    max,
    desc: '%d-%d 条可执行建议，每条不超过 50 字，不得涉及医疗、投资、法律',
    item: { type: 'string', max: 60, desc: '一条建议' },
  }),
};

const A = (o) => o; // 可读性包装：A({...}) 让 slots 定义看起来像表格

export const BAZI_PLAN = [
  {
    key: 'mingju',
    title: '命局概览',
    order: 1,
    free: true,
    // 实测：agnes-2.5-flash 强制思维链，一次完整章节约需 1000 completion tokens，
    // 其中 reasoning_tokens 占 30-50%（探针实测 470/1003）。max_tokens 给小了会静默截断，
    // 表现为「只吐得出 summary，points/basis/advice 全空」——极易误判成模型不支持 array。
    // 故统一按 1400-2000 给，宁可富余也不截断。
    maxTokens: 1400,
    needs: ['fourPillars', 'dayMaster', 'strength', 'elementPercent', 'sanYuan'],
    slots: A({
      headline: SL.headline(26),
      summary: SL.summary(160, 300),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'geju',
    title: '格局喜忌',
    order: 2,
    free: true,
    maxTokens: 1500,
    needs: ['pattern', 'yongshen', 'strength', 'elementPercent', 'changsheng'],
    slots: A({
      headline: SL.headline(28),
      summary: SL.summary(180, 320),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'xingge',
    title: '性格特点',
    order: 3,
    free: false,
    maxTokens: 1600,
    needs: ['dayMaster', 'shishen', 'pattern', 'changsheng', 'shenshaXingge'],
    slots: A({
      headline: SL.headline(24),
      summary: SL.summary(180, 320),
      points: (() => { const p = SL.points(3, 3); p.desc = '3 个要点：优势、盲点、与人相处'; return p; })(),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'jiankang',
    title: '健康提醒',
    order: 4,
    free: false,
    maxTokens: 1500,
    needs: ['elementPercent', 'dayMaster', 'yongshen', 'changsheng', 'shensha'],
    slots: A({
      headline: SL.headline(26),
      summary: SL.summary(160, 280),
      points: SL.points(3, 3),
      basis: SL.basis(5),
      advice: (() => { const a = SL.advice(2, 3); a.desc = '2-3 条生活作息建议，绝不出现病症名、药材、诊疗建议；涉具体内容请指向专业机构'; return a; })(),
    }),
    guard: 'health', // 触发更强的合规护栏（health 章额外追加禁止医疗结论的硬约束）
  },
  {
    key: 'ganqing',
    title: '感情婚姻',
    order: 5,
    free: false,
    maxTokens: 1600,
    // 六亲（父母/兄弟/子女/祖上宫位）在此章一并给出，不再单列 qinyuan 章
    needs: ['fourPillars', 'relations', 'shishen', 'shenshaTaohua', 'sanYuan'],
    slots: A({
      headline: SL.headline(26),
      summary: SL.summary(180, 320),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(3, 4),
    }),
  },
  {
    key: 'shiye',
    title: '事业方向',
    order: 6,
    free: false,
    maxTokens: 1600,
    needs: ['pattern', 'yongshen', 'shishen', 'strength', 'dayun'],
    slots: A({
      headline: SL.headline(26),
      summary: SL.summary(180, 320),
      points: (() => { const p = SL.points(3, 3); p.desc = '3 个要点：适合的方向、精力投放阶段、容易踩的坑'; return p; })(),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'caiyun',
    title: '财运走势',
    order: 7,
    free: false,
    maxTokens: 1600,
    needs: ['pattern', 'yongshen', 'shishen', 'dayun', 'liunian'],
    slots: A({
      headline: SL.headline(26),
      summary: SL.summary(180, 320),
      points: SL.points(3, 3),
      basis: SL.basis(5),
      advice: (() => { const a = SL.advice(2, 3); a.desc = '2-3 条财务习惯建议，不得出现具体证券、彩票、收益承诺'; return a; })(),
    }),
  },
  {
    key: 'dayun',
    title: '大运流年',
    order: 8,
    free: false,
    maxTokens: 2000,
    needs: ['dayun', 'liunian', 'yongshen', 'shishen'],
    slots: A({
      headline: SL.headline(28),
      summary: SL.summary(200, 360),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'shensha',
    title: '神煞详解',
    order: 9,
    free: false,
    maxTokens: 2000,
    needs: ['shensha'],
    slots: A({
      headline: SL.headline(24),
      summary: SL.summary(180, 320),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'chenggu',
    title: '称骨批注',
    order: 10,
    free: false,
    maxTokens: 1400,
    needs: ['chengGu'],
    slots: A({
      headline: SL.headline(24),
      summary: SL.summary(160, 300),
      points: SL.points(3, 4),
      basis: SL.basis(4),
      advice: SL.advice(2, 3),
    }),
  },
];

// ------------------------------------------------------------------
// 二之二、合盘章节注册（双命盘关系推演，P2）
// ------------------------------------------------------------------

/** 合盘事实抽取器：输入 engines/hepan 产出的 facts */
// 注意默认取值：有的 items 是对象（关系项），有的是纯字符串（日柱说明），
// 统一按「是字符串就用本身」取，别硬套 .name —— 那会让 [undefined].join('；') 静默变成空串。
const hpList = (arr, limit = 20, map = (x) => (typeof x === 'string' ? x : x.name)) =>
  (arr || []).slice(0, limit).map(map).filter(Boolean).join('；');

const hpPartyLine = (p) =>
  `${p.name}：${(p.pills || []).map((x) => x.name).join(' ')}　日柱 ${p.dayGanzhi}（日主${p.dayMasterElement}）　` +
  `${p.strengthLevel || ''}　生肖${p.zodiac || ''}　纳音${(p.pills || [])[2]?.nayin || ''}`;

const hpDimsLine = (f) =>
  `合参维度：${(f.dims || [])
    .map((d) => `${d.label} ${d.score > 0 ? '+' : ''}${d.score}/${d.weight}`)
    .join('；')}`;

export const FACT_PRESETS_HEPAN = {
  /** 双方基本信息 + 指数 + 分档（总论章用） */
  hepanBasics: (f) =>
    `两名命主：${(f.parties || []).map(hpPartyLine).join('\n')}` +
    `\n契合指数：${f.score}（${f.grade}）　${f.gradeDesc || ''}` +
    `\n${hpDimsLine(f)}` +
    `\n合 ${(f.he || []).length} 项：${hpList(f.he)}　冲刑害破 ${(f.conflicts || []).length} 项：${hpList(f.conflicts)}`,

  /** 天干地支合参明细 */
  hepanCombine: (f) => {
    const he = f.he || [];
    const bad = f.conflicts || [];
    const line = (r) => {
      // 三合/三会会聚合三柱以上，统一用 keyText（形如「甲方年柱／乙方月柱」），
      // 不要用 from/to 拼——多柱关系下 from/to 是 null，拼出来会丢失柱位信息。
      const who = r.keyText || `${r.from?.sideLabel || ''}${r.from?.pos || ''} ↔ ${r.to?.sideLabel || ''}${r.to?.pos || ''}`;
      return `${r.name}（${who}）${r.note ? '，' + r.note : ''}${r.source ? '［' + r.source + '］' : ''}`;
    };
    return (
      `相合相引：${he.length ? he.map(line).join('\n') : '未见相合之处'}` +
      `\n需要注意：${bad.length ? bad.map(line).join('\n') : '未见冲刑害破'}`
    );
  },

  /** 日柱与夫妻宫 */
  hepanDay: (f) => {
    const d = f.day || {};
    return (
      `甲方日柱：${f.parties?.[0]?.dayGanzhi || '—'}　乙方日柱：${f.parties?.[1]?.dayGanzhi || '—'}` +
      `\n日柱关系：${hpList(d.items, 8)}` +
      `\n维度分：${d.score}/${d.weight || 30}　权重最高，为合参核心`
    );
  },

  /** 五行与用神互补 */
  hepanWuxing: (f) => {
    const lines = (f.wuxing?.lines || [])
      .map((l) => `${l.element}：甲${l.aPercent}%／乙${l.bPercent}%${l.aNeed ? '（甲方喜用）' : ''}${l.bNeed ? '（乙方喜用）' : ''}　${l.kind}`)
      .join('；');
    return `五行占比对照：${lines}\n互补项：${hpList(f.complement, 8, (x) => `${x.element}（${x.kind}）`)}`;
  },

  /** 需要注意的刑冲害破 */
  hepanConflict: (f) => {
    const bad = f.conflicts || [];
    if (!bad.length) return '柱位互动：双方未见明显冲刑害破，相处摩擦多来自日常而非盘面';
    return `需要注意：${bad.map((r) => `${r.name}（${(r.keys || []).join('·')}）${r.note ? '，' + r.note : ''}`).join('\n')}`;
  },

  /** 相处建议素材（基础事实 + 结论项数量） */
  hepanAdvice: (f) =>
     `${hpPartyLine(f.parties?.[0] || {})} ｜ ${hpPartyLine(f.parties?.[1] || {})}` +
    `\n契合指数 ${f.score}（${f.grade}）\n相合 ${(f.he || []).length} 项：${hpList(f.he)}` +
    `\n冲刑害破 ${(f.conflicts || []).length} 项：${hpList(f.conflicts)}` +
    `\n${hpDimsLine(f)}`,
};

/** 全体系抽取器总表（单盘 + 合盘），buildFactLines 只认这张表 */
export const ALL_PRESETS = { ...FACT_PRESETS, ...FACT_PRESETS_HEPAN };

/** 合盘六章（顺序：总论 → 干支 → 日柱 → 五行用神 → 刑冲 → 相处建议） */
export const HEWAN_PLAN = [
  {
    key: 'hetong',
    title: '合盘总论',
    order: 1,
    free: true,
    maxTokens: 1500,
    needs: ['hepanBasics'],
    slots: A({
      headline: SL.headline(28),
      summary: SL.summary(180, 320),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'ganzhi',
    title: '天干地支合参',
    order: 2,
    free: false,
    maxTokens: 1800,
    needs: ['hepanCombine'],
    slots: A({
      headline: SL.headline(28),
      summary: SL.summary(180, 320),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'riyu',
    title: '日柱与夫妻宫',
    order: 3,
    free: false,
    maxTokens: 1800,
    needs: ['hepanDay', 'hepanBasics'],
    slots: A({
      headline: SL.headline(28),
      summary: SL.summary(200, 340),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'wuxing',
    title: '五行与用神互补',
    order: 4,
    free: false,
    maxTokens: 1600,
    needs: ['hepanWuxing', 'hepanBasics'],
    slots: A({
      headline: SL.headline(28),
      summary: SL.summary(180, 320),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'chongke',
    title: '需要注意的冲刑',
    order: 5,
    free: false,
    maxTokens: 1600,
    needs: ['hepanConflict', 'hepanCombine'],
    slots: A({
      headline: SL.headline(28),
      summary: SL.summary(180, 320),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(3, 4),
    }),
  },
  {
    key: 'xiangchu',
    title: '相处建议',
    order: 6,
    free: false,
    maxTokens: 1600,
    needs: ['hepanAdvice', 'hepanBasics'],
    slots: A({
      headline: SL.headline(26),
      summary: SL.summary(160, 300),
      points: SL.points(3, 4),
      basis: SL.basis(5),
    }),
  },
];

// ------------------------------------------------------------------
// 三、查询接口
// ------------------------------------------------------------------

const PLAN_TABLE = {
  bazi: BAZI_PLAN,
  hepan: HEWAN_PLAN,
  // 其余体系（六爻/奇门/紫微）迁移到同一协议时在此登记，见 P3
};

export const SUPPORTED_SYSTEMS = Object.keys(PLAN_TABLE);

/** 取章节定义 */
export function getChapter(key, system = 'bazi') {
  const table = PLAN_TABLE[system] || [];
  return table.find((c) => c.key === key) || null;
}

/** 取某体系的全部章节（按 order 排好的） */
export function listChapters(system = 'bazi') {
  return [...(PLAN_TABLE[system] || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** 取某体系的免费章节 key 列表 */
export function freeChapterKeys(system = 'bazi') {
  return listChapters(system).filter((c) => c.free).map((c) => c.key);
}

/** 把 %d 占位替换成实际数字（desc 是模板串） */
export function fillDesc(desc, ...args) {
  let i = 0;
  return String(desc).replace(/%d/g, () => String(args[i++] ?? ''));
}

/** 诊断：needs 引用的 preset 必须都存在 */
function checkPlan(plan, system, errs) {
  for (const ch of plan) {
    if (!ch.key) errs.push(`${system} 章节缺 key`);
    if (!ch.title) errs.push(`${system}:${ch.key} 缺 title`);
    if (typeof ch.order !== 'number') errs.push(`${system}:${ch.key} 缺 order`);
    if (!Array.isArray(ch.needs) || !ch.needs.length) errs.push(`${system}:${ch.key} needs 为空`);
    for (const need of ch.needs || []) {
      if (!ALL_PRESETS[need]) errs.push(`${system}:${ch.key} needs 引用了不存在的抽取器: ${need}`);
    }
    if (!ch.slots || !Object.keys(ch.slots).length) errs.push(`${system}:${ch.key} 缺 slots`);
    for (const [sk, def] of Object.entries(ch.slots || {})) {
      if (def.type !== 'array' || !def.item) continue;
      const it = def.item;
      if (typeof it === 'object' && !Array.isArray(it)) {
        // 对象形态（如 { t, d }）：至少得有一个子键，否则 schema 生成不出来
        if (Object.keys(it).length === 0) errs.push(`${system}:${ch.key}.${sk} item 是空对象`);
      } else if (it !== 'string' && !(it && it.type)) {
        errs.push(`${system}:${ch.key}.${sk} item 形态不合法（应为 'string' 或 {t,d} 对象）`);
      }
    }
  }
  const keys = plan.map((c) => c.key);
  if (new Set(keys).size !== keys.length) errs.push(`${system} 存在重复章节 key`);
  // order 必须连续（1..n），否则 SSE 逐章进度与卡片序号会错位
  const orders = plan.map((c) => c.order).sort((x, y) => x - y);
  orders.forEach((o, i) => {
    if (o !== i + 1) errs.push(`${system} order 不连续：${orders.join(',')}`);
  });
}

export function planSelfCheck() {
  const errs = [];
  checkPlan(BAZI_PLAN, 'bazi', errs);
  checkPlan(HEWAN_PLAN, 'hepan', errs);
  // 八字仍固定 2 免费章（用户拍板）；合盘只放总论 1 章免费用作引流
  const free = BAZI_PLAN.filter((c) => c.free).map((c) => c.key);
  if (free.length !== 2) errs.push(`八字免费章数量应为 2，当前 ${free.length}: ${free.join(',')}`);
  const freeHp = HEWAN_PLAN.filter((c) => c.free).map((c) => c.key);
  if (freeHp.length !== 1) errs.push(`合盘免费章数量应为 1，当前 ${freeHp.length}: ${freeHp.join(',')}`);
  return errs;
}
