/**
 * engines/hepan —— 八字合盘（双命盘关系推演）
 *
 * 铁律（改这里之前先读）：
 *   1. 本模块是「事实层」，只做确定性计算与民俗口诀分类，不做吉凶断言、不做情感结论。
 *   2. 契合指数只是「传统合参规则下的分值」，不是命运判定，文案里的措辞一律中性。
 *   3. 关系判定一律复用 core/relations.js 的 analyzeGan / analyzeZhi，绝不另起一套表，
 *      否则问盘口径会和单盘报告漂移（这里只多做一步「跨盘筛选」）。
 *   4. 本文件不含任何自然语言解读；要写成人话是 AI 的事，AI 只能引用 F 编号。
 */

import { GAN, ZHI, WUXING, ZHI_WUXING } from '../core/ganzhi.js';
import { ganRelation, analyzeGan, analyzeZhi } from '../core/relations.js';

export const HEWAN_ENGINE_VERSION = '1.0.1';

const KEYS4 = ['year', 'month', 'day', 'hour'];
const LABEL4 = { year: '年', month: '月', day: '日', hour: '时' };
const SIDE_LABEL = { a: '甲方', b: '乙方' };
const SIDE_SHORT = { a: '甲', b: '乙' };
const ZODIAC_TO_ZHI = { 鼠: 0, 牛: 1, 虎: 2, 兔: 3, 龙: 4, 蛇: 5, 马: 6, 羊: 7, 猴: 8, 鸡: 9, 狗: 10, 猪: 11 };

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const pct = (obj, e) => Number(obj?.[e] || 0);

/**
 * 五行关系（WUXING = ['木','火','土','金','水'] 即相生顺序）
 * 相生：x→y 相邻；相克：相隔两位（木克土、土克水、水克火、火克金、金克木）
 */
function wuxingRel(x, y) {
  const i = WUXING.indexOf(x);
  const j = WUXING.indexOf(y);
  if (i < 0 || j < 0) return '未知';
  const d = (j - i + 5) % 5;
  if (d === 0) return '比和';
  if (d === 1 || d === 4) return '相生';
  return '相克';
}

/** 纳音名 → 五行（纳音均为「某某X」三字，末字即五行） */
function nayinElement(nayin) {
  const s = String(nayin || '').trim();
  const tail = s.slice(-1);
  return WUXING.includes(tail) ? tail : '';
}

/** 把一个八字 facts 压成合盘需要的「一方」结构 */
function partyOf(facts, side, name) {
  const f = facts || {};
  const p = f.fourPillars || {};
  const pills = KEYS4.map((k) => ({
    key: `${side}.${k}`,
    label: LABEL4[k],
    name: p[k]?.name || '',
    gan: p[k]?.gan || '',
    zhi: p[k]?.zhi || '',
    ganIndex: Number.isInteger(p[k]?.ganIndex) ? p[k].ganIndex : -1,
    zhiIndex: Number.isInteger(p[k]?.zhiIndex) ? p[k].zhiIndex : -1,
    shishen: p[k]?.shishen || '',
    nayin: f.nayin?.[k] || '',
  }));
  return {
    side,
    name: name || SIDE_LABEL[side],
    short: SIDE_SHORT[side],
    zodiac: f.lunar?.zodiac || '',
    calendarLabel: f.lunar?.yearGanzhi ? `${f.lunar.yearGanzhi}年` : '',
    yearZhi: p.year?.zhi || '',
    yearZhiIndex: Number.isInteger(p.year?.zhiIndex) ? p.year.zhiIndex : -1,
    dayGanzhi: p.day?.name || '',
    dayGan: p.day?.gan || '',
    dayZhi: p.day?.zhi || '',
    dayGanIndex: Number.isInteger(p.day?.ganIndex) ? p.day.ganIndex : -1,
    dayZhiIndex: Number.isInteger(p.day?.zhiIndex) ? p.day.zhiIndex : -1,
    dayMasterElement: f.dayMaster?.element || '',
    dayMasterYang: !!f.dayMaster?.yang,
    strengthLevel: f.strength?.level || '',
    strengthScore: f.strength?.score ?? null,
    patternName: f.pattern?.name || '',
    yongFavorable: f.yongshen?.favorable || [],
    yongUnfavorable: f.yongshen?.unfavorable || [],
    elementPercent: f.elementPercent || {},
    pills,
  };
}

/** 跨盘判定：keys 必须一边 a 一边 b（同盘内部的合冲要剔掉） */
const isCross = (r) => {
  const ks = r.keys || [];
  if (!ks.length) return false;
  // 必须「同时」出现两边才算跨盘。三合局可能三柱全在一方（keys 有 3 项），
  // 那种情况不能因为「不是全 a」就当成跨盘，要用 some 而不是 every。
  return ks.some((k) => k.startsWith('a.')) && ks.some((k) => k.startsWith('b.'));
};

/** 关系项 → 展示件（谁和谁：哪个柱位）。三合/三会会聚合三柱以上，需标注清楚避免被误述成「两柱相合」 */
function decorate(r, facts) {
  const ks = r.keys || [];
  const multi = ks.length > 2;
  const pill = (k) => {
    const [s, pos] = k.split('.');
    if (!facts[s]) return { side: s, pos: '?' };
    const p = facts[s].pills.find((x) => x.key === k);
    return {
      side: s,
      sideLabel: facts[s].name || SIDE_LABEL[s],
      short: SIDE_SHORT[s],
      pos: p ? LABEL4[pos] + '柱' : '',
      zhi: p?.zhi || '',
      gan: p?.gan || '',
    };
  };
  return {
    ...r,
    multi,
    keys: ks,
    // 形如「甲方年柱 / 乙方月柱」，供渲染层与 prompt 一眼看清落在哪
    keyText: ks.map((k) => {
      const [s, pos] = k.split('.');
      return `${facts[s]?.name || SIDE_LABEL[s]}${LABEL4[pos] || ''}`;
    }).join('／'),
    from: multi ? null : pill(ks[0]),
    to: multi ? null : pill(ks[1]),
  };
}

const GOOD_TYPES = new Set(['he', 'sanhe', 'banhe', 'gongju', 'sanhui']);
const BAD_TYPES = new Set(['chong', 'xing', 'hai', 'po']);

/** 单维度加分表（传统合参口径，分值上限即权重） */
const HE_WEIGHT = { he: 6, sanhe: 8, banhe: 5, gongju: 3, sanhui: 8 };
const CONFLICT_PENALTY = { chong: -4, xing: -2.5, hai: -1.5, po: -0.8 };

/**
 * 柱位权重：日柱（夫妻宫）最重，年柱最轻。
 * 跨柱关系取两端较重的一端——「日支被冲」远比「年支被冲」要紧。
 */
const POS_WEIGHT = { day: 1.5, hour: 1.2, month: 1, year: 1 };
function posWeightOf(r) {
  const seg = (k) => {
    const pos = String(k).split('.')[1];
    return POS_WEIGHT[pos] ?? 1;
  };
  const ws = (r.keys || []).map(seg);
  return Math.max(...ws, 1);
}

/** 日柱（夫妻宫）维度：权重最高，单独判 */
function dayDim(A, B) {
  const ganRel = A.dayGanIndex >= 0 && B.dayGanIndex >= 0
    ? ganRelation(A.dayGanIndex, B.dayGanIndex)
    : null;
  const zhiItems = [
    { key: 'a.day', label: '甲', zhiIndex: A.dayZhiIndex },
    { key: 'b.day', label: '乙', zhiIndex: B.dayZhiIndex },
  ].filter((i) => i.zhiIndex >= 0);
  const zhiRel = zhiItems.length === 2 ? analyzeZhi(zhiItems)[0] || null : null;

  let score = 0;
  const hits = [];
  if (ganRel && ganRel.type === 'he') {
    score += 30;
    hits.push(`${A.dayGan}${B.dayGan}天干五合，合而化${ganRel.hua}气（${ganRel.name}）`);
  } else if (ganRel && ganRel.type === 'chong') {
    score -= 10;
    hits.push(`${A.dayGan}${B.dayGan}天干相冲，立场易有对立（${ganRel.name}）`);
  }

  if (zhiRel) {
    const w = HE_WEIGHT[zhiRel.type] || 0;
    const pen = CONFLICT_PENALTY[zhiRel.type] || 0;
    score += w + pen;
    hits.push(`${A.dayZhi}${B.dayZhi}：${zhiRel.name}${zhiRel.note ? '，' + zhiRel.note : ''}`);
  } else if (A.dayZhiIndex >= 0 && B.dayZhiIndex >= 0 && A.dayZhiIndex === B.dayZhiIndex) {
    score += 4;
    hits.push(`两方日支同为${ZHI[A.dayZhiIndex]}，宫位同源，相处节奏接近`);
  } else if (A.dayZhiIndex >= 0 && B.dayZhiIndex >= 0) {
    const ea = ZHI_WUXING[A.dayZhiIndex];
    const eb = ZHI_WUXING[B.dayZhiIndex];
    const rel = wuxingRel(ea, eb);
    if (rel === '相生') {
      score += 8;
      hits.push(`日支${ZHI[A.dayZhiIndex]}（${ea}）与${ZHI[B.dayZhiIndex]}（${eb}）相生，气机相接较顺`);
    } else if (rel === '相克') {
      score -= 6;
      hits.push(`日支${ZHI[A.dayZhiIndex]}（${ea}）与${ZHI[B.dayZhiIndex]}（${eb}）相克，需要多留磨合余地`);
    } else {
      hits.push(`日支${ZHI[A.dayZhiIndex]}（${ea}）与${ZHI[B.dayZhiIndex]}（${eb}）比和，各行其是`);
    }
  }

  const max = 30;
  return {
    dim: 'day',
    label: '日柱与夫妻宫',
    weight: max,
    score: clamp(score, -max, max),
    note: '日柱为传统合参的核心，权重最高',
    items: hits,
    ganRel,
    zhiRel,
  };
}

/** 干支合维度：跨盘合局（含天干五合、地支六合/三合/三会） */
function combineDim(A, B) {
  const items = [...A.pills, ...B.pills];
  const ganRels = analyzeGan(items.filter((i) => i.ganIndex >= 0));
  const zhiRels = analyzeZhi(items.filter((i) => i.zhiIndex >= 0));

  const he = [];
  const conflicts = [];
  for (const r of [...ganRels, ...zhiRels]) {
    if (!isCross(r)) continue;
    const d = decorate(r, { a: A, b: B });
    const base = { ...d, kind: r.kind, type: r.type, name: r.name, note: r.note || '', source: r.source || '' };
    if (GOOD_TYPES.has(r.type)) {
      he.push({ ...base, gain: HE_WEIGHT[r.type] || 0 });
    } else if (BAD_TYPES.has(r.type)) {
      conflicts.push({ ...base, loss: CONFLICT_PENALTY[r.type] || 0 });
    }
  }

  const gain = he.reduce((s, x) => s + x.gain * posWeightOf(x), 0);
  const loss = conflicts.reduce((s, x) => s + x.loss * posWeightOf(x), 0);
  return {
    dim: 'combine',
    label: '天干地支合参',
    weight: 20,
    score: clamp(gain, 0, 20) + clamp(loss, -12, 0),
    note: '越多的柱位相合，气场越容易同频；刑冲越多则摩擦越显性',
    items: he,
    conflicts,
  };
}

/** 五行互补：A 的用神（喜用）在 B 命局里是否就有 */
function wuxingDim(A, B) {
  const lines = [];
  let gain = 0;
  for (const e of WUXING) {
    const pa = pct(A.elementPercent, e);
    const pb = pct(B.elementPercent, e);
    const needA = A.yongFavorable.includes(e);
    const needB = B.yongFavorable.includes(e);
    let kind = '相当';
    if (needA && pb >= 18) {
      kind = '互补';
      gain += 7;
    } else if (needA && pb < 8) {
      kind = 'A 所求 B 不备';
    } else if (needB && pa >= 18) {
      kind = '互补';
      gain += 7;
    } else if (pa >= 25 && pb >= 25) {
      kind = '双方同旺';
    }
    lines.push({
      element: e,
      aPercent: pa,
      bPercent: pb,
      aNeed: needA,
      bNeed: needB,
      kind,
    });
  }
  return {
    dim: 'wuxing',
    label: '五行与用神互补',
    weight: 20,
    score: clamp(gain, 0, 20),
    note: '看一方喜用的五行，另一方是否恰好不缺（传统称为「互补」）',
    lines,
  };
}

/** 生肖与纳音：民俗向（Phase 1 修复：使用年柱地支 yearZhiIndex 判定生肖关系，而非日支 dayZhiIndex） */
function zodiacDim(A, B) {
  const ia = A.yearZhiIndex >= 0 ? A.yearZhiIndex : (A.pills[0]?.zhiIndex >= 0 ? A.pills[0].zhiIndex : (ZODIAC_TO_ZHI[A.zodiac] ?? -1));
  const ib = B.yearZhiIndex >= 0 ? B.yearZhiIndex : (B.pills[0]?.zhiIndex >= 0 ? B.pills[0].zhiIndex : (ZODIAC_TO_ZHI[B.zodiac] ?? -1));
  let ziScore = 0;
  let ziKind = '无特殊关系';
  if (ia >= 0 && ib >= 0) {
    const HE = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
    const SAN = [['申', '子', '辰'], ['亥', '卯', '未'], ['寅', '午', '戌'], ['巳', '酉', '丑']];
    if (HE.some(([x, y]) => (x === ZHI[ia] && y === ZHI[ib]) || (y === ZHI[ia] && x === ZHI[ib]))) {
      ziScore += 8;
      ziKind = '生肖六合';
    } else if (ia !== ib && SAN.some((g) => g.includes(ZHI[ia]) && g.includes(ZHI[ib]))) {
      ziScore += 5;
      ziKind = '生肖三合';
    } else if (LIU_CHONG_PAIRS.some(([x, y]) => (x === ZHI[ia] && y === ZHI[ib]) || (y === ZHI[ia] && x === ZHI[ib]))) {
      ziScore -= 8;
      ziKind = '生肖相冲';
    } else {
      const HAI = [['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌']];
      if (HAI.some(([x, y]) => (x === ZHI[ia] && y === ZHI[ib]) || (y === ZHI[ia] && x === ZHI[ib]))) {
        ziScore -= 4;
        ziKind = '生肖相害';
      }
    }
  }

  let naScore = 0;
  let naKind = '—';
  // pills 按年→月→日→时顺序排列，索引 2 即日柱
  const ea = nayinElement(A.pills[2]?.nayin);
  const eb = nayinElement(B.pills[2]?.nayin);
  if (ea && eb) {
    const idx = ['木', '火', '土', '金', '水'];
    const d = (idx.indexOf(eb) - idx.indexOf(ea) + 5) % 5;
    if (d === 1) {
      naScore += 7;
      naKind = `${ea}生${eb}`;
    } else if (d === 4) {
      naScore += 7;
      naKind = `${eb}生${ea}`;
    } else if (d === 0) {
      naScore += 4;
      naKind = '比和';
    } else {
      naScore -= 3;
      naKind = d === 2 ? `${ea}克${eb}` : `${eb}克${ea}`;
    }
  }

  return {
    dim: 'zodiac',
    label: '生肖与纳音',
    weight: 15,
    score: clamp(ziScore + naScore, -15, 15),
    note: '民俗向参考，权重低于日柱与五行互补',
    ziKind,
    naKind,
    items: [
      `生肖：${A.name}${A.zodiac} 与 ${B.name}${B.zodiac}，${ziKind}`,
      `日柱纳音：${A.pills[2]?.nayin || '—'}（${ea || '—'}）／${B.pills[2]?.nayin || '—'}（${eb || '—'}），${naKind}`,
    ],
  };
}

const LIU_CHONG_PAIRS = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];

/** 契合指数的中性基准：不给任何加分扣分时的落点 */
const BASE_SCORE = 50;

const GRADES = [
  { min: 85, name: '天作之合', desc: '合参多项同频，传统视为难得的 pairing' },
  { min: 75, name: '相得益彰', desc: '彼此有补，相处起来省力' },
  { min: 62, name: '互补有成', desc: '整体相合，个别维度需要多花心思' },
  { min: 50, name: '需要磨合', desc: '有合有冲，靠经营补足' },
  { min: 0, name: '挑战较多', desc: '摩擦项偏多，更看重后续沟通' },
];

/**
 * 合盘主入口
 * @param {{a:object, b:object, names?:{a?:string,b?:string}}} p  a/b 为两个八字 facts
 */
export function computeHePan(p) {
  const A = partyOf(p.a, 'a', p.names?.a);
  const B = partyOf(p.b, 'b', p.names?.b);
  const parties = [A, B];

  const dims = [dayDim(A, B), combineDim(A, B), wuxingDim(A, B), zodiacDim(A, B)];
  const dOf = (k) => dims.find((d) => d.dim === k) || { items: [], conflicts: [] };

  const DIM_GAIN = { day: 0.8, combine: 0.6, wuxing: 0.8, zodiac: 0.8 };
  const offset = dims.reduce((s, d) => s + d.score * (DIM_GAIN[d.dim] ?? 0.8), 0);
  const raw = dims.map((d) => ({ dim: d.dim, score: d.score, weight: DIM_GAIN[d.dim] ?? 0.8 }));
  const score = clamp(BASE_SCORE + offset, 0, 100);
  const grade = GRADES.find((g) => score >= g.min) || GRADES[GRADES.length - 1];
  const gradeIndex = GRADES.indexOf(grade);

  const heItems = dOf('combine').items;
  const conflicts = dOf('combine').conflicts;
  const wx = dOf('wuxing');
  const complement = wx.lines.filter((l) => l.kind === '互补');

  let headline;
  if (!heItems.length && !conflicts.length) {
    headline = `${A.name}与${B.name}柱位各见其位，未见明显合冲，合参以日柱为要`;
  } else if (conflicts.length && !heItems.length) {
    headline = `${A.name}与${B.name}未见合处，先看清${conflicts.map((c) => c.name).join('、')}这类冲克，再谈契合`;
  } else if (gradeIndex <= 1) {
    headline = `${A.name}与${B.name}合处多（${heItems.map((h) => h.name).join('、')}），气机相引，契合度偏高`;
  } else {
    headline = `合处与冲处并存：${heItems.slice(0, 2).map((h) => h.name).join('、')}${conflicts.length ? `，另有${conflicts.map((c) => c.name).join('、')}` : ''}`;
  }

  const facts = {
    engineVersion: HEWAN_ENGINE_VERSION,
    parties,
    score,
    grade: grade.name,
    gradeDesc: grade.desc,
    gradeIndex,
    base: BASE_SCORE,
    offset,
    dimRaw: raw,
    dims,
    dimSummary: dims.map((d) => ({
      dim: d.dim, label: d.label, weight: d.weight, score: d.score, note: d.note,
      itemCount: (d.items || []).length, conflictCount: (d.conflicts || []).length,
    })),
    he: heItems,
    conflicts,
    day: dOf('day'),
    wuxing: wx,
    zodiac: dOf('zodiac'),
    complement,
    headline,
    summary: `${A.name}${A.dayGanzhi}／${A.pills.map((x) => x.name).join(' ')}　×　${B.name}${B.dayGanzhi}／${B.pills.map((x) => x.name).join(' ')}；${headline}；合 ${heItems.length} 项，冲克刑害 ${conflicts.length} 项，五行互补 ${complement.length} 项。`,
    symmetry: {
      aZodiac: A.zodiac,
      bZodiac: B.zodiac,
      aDay: A.dayGanzhi,
      bDay: B.dayGanzhi,
    },
  };
  return facts;
}

/** （供分享卡等只读场景）判断两个 facts 能否合盘 */
export function canHePan(factsList) {
  return Array.isArray(factsList) && factsList.length >= 2
    && factsList.every((f) => f && f.fourPillars && f.fourPillars.day);
}
