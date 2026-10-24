/**
 * engines/hepan —— 八字合盘（商业尊享级·六维双命盘深度同参引擎 v2.4）
 *
 * 铁律（改这里之前先读）：
 *   1. 本模块是「事实层」，只做确定性计算与民俗口诀分类，不做吉凶断言、不做情感结论。
 *   2. 契合指数只是「传统合参规则下的分值」，不是命运判定，文案里的措辞一律中性。
 *   3. 关系判定一律复用 core/relations.js 的 analyzeGan / analyzeZhi，绝不另起一套表，
 *      否则合盘口径会和单盘报告漂移（这里只多做一步「跨盘筛选」）。
 *   4. 严格保证交换对称性：computeHePan({a:A, b:B}).score === computeHePan({a:B, b:A}).score。
 */

import { GAN, ZHI, WUXING, GAN_WUXING, ZHI_WUXING } from '../core/ganzhi.js';
import { ganRelation, analyzeGan, analyzeZhi } from '../core/relations.js';

export const HEWAN_ENGINE_VERSION = '2.4.0';

const KEYS4 = ['year', 'month', 'day', 'hour'];
const LABEL4 = { year: '年', month: '月', day: '日', hour: '时' };
const PALACE_NAME4 = {
  year: '年柱 · 根基祖业宫',
  month: '月柱 · 门户性格宫',
  day: '日柱 · 夫妻配偶宫',
  hour: '时柱 · 子女晚景宫',
};
const SIDE_LABEL = { a: '甲方', b: '乙方' };
const SIDE_SHORT = { a: '甲', b: '乙' };
const ZODIAC_TO_ZHI = { 鼠: 0, 牛: 1, 虎: 2, 兔: 3, 龙: 4, 蛇: 5, 马: 6, 羊: 7, 猴: 8, 鸡: 9, 狗: 10, 猪: 11 };
const LIU_CHONG_PAIRS = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];

// 传统跨盘贵人/禄神/桃花/红鸾口诀表（用于跨盘互旺检测）
const TIANYI_MAP = {
  甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'],
  乙: ['子', '申'], 己: ['子', '申'],
  丙: ['亥', '酉'], 丁: ['亥', '酉'],
  壬: ['卯', '巳'], 癸: ['卯', '巳'],
  辛: ['午', '寅'],
};
const LU_MAP = {
  甲: '寅', 乙: '卯', 丙: '巳', 戊: '巳', 丁: '午', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子',
};
const HONGLUAN_MAP = {
  子: '卯', 丑: '寅', 寅: '丑', 卯: '子', 辰: '亥', 巳: '戌',
  午: '酉', 未: '申', 申: '未', 酉: '午', 戌: '巳', 亥: '辰',
};
const TIANXI_MAP = {
  子: '酉', 丑: '申', 寅: '未', 卯: '午', 辰: '巳', 巳: '辰',
  午: '卯', 未: '寅', 申: '丑', 酉: '子', 戌: '亥', 亥: '戌',
};
const TAOHUA_MAP = {
  申: '酉', 子: '酉', 辰: '酉',
  寅: '卯', 午: '卯', 戌: '卯',
  巳: '午', 酉: '午', 丑: '午',
  亥: '子', 卯: '子', 未: '子',
};

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const pct = (obj, e) => Number(obj?.[e] || 0);

/**
 * 五行关系（WUXING = ['木','火','土','金','水'] 即相生顺序）
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

/** 纳音名 → 五行 */
function nayinElement(nayin) {
  const s = String(nayin || '').trim();
  const tail = s.slice(-1);
  return WUXING.includes(tail) ? tail : '';
}

/** 把一个八字 facts 压成合盘需要的「一方」完整结构 */
function partyOf(facts, side, name) {
  const f = facts || {};
  const p = f.fourPillars || {};
  const xk = Array.isArray(f.xunkong) ? f.xunkong : [];
  const nowY = new Date().getFullYear();
  const dySteps = f.dayun?.steps || f.dayun?.list || [];
  const curDy = dySteps.find((s) => nowY >= s.fromYear && nowY <= s.toYear) || dySteps[0] || null;

  const pills = KEYS4.map((k) => {
    const pk = p[k] || {};
    const zhi = pk.zhi || '';
    const cgList = Array.isArray(pk.canggan)
      ? pk.canggan.map((c) => ({
          gan: c.gan || '',
          wuxing: c.wuxing || GAN_WUXING[GAN.indexOf(c.gan)] || '',
          shishen: c.shishen || '',
          type: c.type || '',
        }))
      : [];
    const nayinStr = f.nayin?.[k] || pk.nayin || '';
    return {
      key: `${side}.${k}`,
      posKey: k,
      label: LABEL4[k],
      palaceTitle: PALACE_NAME4[k],
      name: pk.name || '',
      gan: pk.gan || '',
      zhi,
      ganIndex: Number.isInteger(pk.ganIndex) ? pk.ganIndex : -1,
      zhiIndex: Number.isInteger(pk.zhiIndex) ? pk.zhiIndex : -1,
      wuxingGan: pk.wuxingGan || (pk.ganIndex >= 0 ? GAN_WUXING[pk.ganIndex] : ''),
      wuxingZhi: pk.wuxingZhi || (pk.zhiIndex >= 0 ? ZHI_WUXING[pk.zhiIndex] : ''),
      shishen: k === 'day' ? '日主' : (pk.shishen || ''),
      shishenZhi: pk.shishenZhi || (cgList[0]?.shishen || ''),
      canggan: cgList,
      changsheng: f.changsheng?.[k]?.state || '',
      zizuo: f.zizuo?.[k]?.state || '',
      nayin: nayinStr,
      nayinElement: nayinElement(nayinStr),
      isKong: xk.includes(zhi),
    };
  });

  // 提炼与婚恋/贵人相关的核心神煞
  const allShensha = Array.isArray(f.shensha) ? f.shensha : [];
  const keySsNames = new Set([
    '天乙贵人', '太极贵人', '天德贵人', '月德贵人', '文昌贵人', '福星贵人',
    '红鸾', '天喜', '咸池', '墙内桃花', '墙外桃花', '桃花', '金舆', '禄神', '驿马', '华盖', '孤辰', '寡宿', '阴差阳错',
  ]);
  const keyShensha = [];
  const seenSs = new Set();
  for (const s of allShensha) {
    if (!s || !s.name) continue;
    if ((keySsNames.has(s.name) || s.cat === '吉') && !seenSs.has(s.name)) {
      seenSs.add(s.name);
      keyShensha.push({
        name: s.name,
        cat: s.cat || '平',
        position: s.position || '',
        desc: s.desc || s.note || '',
      });
      if (keyShensha.length >= 8) break;
    }
  }

  return {
    side,
    name: name || SIDE_LABEL[side],
    short: SIDE_SHORT[side],
    gender: f.time?.gender || (side === 'a' ? 'male' : 'female'),
    zodiac: f.lunar?.zodiac || '',
    calendarLabel: f.lunar?.yearGanzhi ? `${f.lunar.yearGanzhi}年` : '',
    yearZhi: p.year?.zhi || '',
    yearZhiIndex: Number.isInteger(p.year?.zhiIndex) ? p.year.zhiIndex : -1,
    monthZhi: p.month?.zhi || '',
    monthZhiIndex: Number.isInteger(p.month?.zhiIndex) ? p.month.zhiIndex : -1,
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
    patternShishen: f.pattern?.shishen || '',
    yongFavorable: f.yongshen?.favorable || [],
    yongUnfavorable: f.yongshen?.unfavorable || [],
    yongReason: f.yongshen?.reason || '',
    elementPercent: f.elementPercent || {},
    xunkong: xk,
    taiyuan: f.taiyuan?.name || '',
    mingGong: f.mingGong?.name || '',
    shenGong: f.shenGong?.name || '',
    mingGua: f.mingGua ? { name: f.mingGua.name, group: f.mingGua.group, number: f.mingGua.number } : null,
    curDayun: curDy ? { name: curDy.name, shishen: curDy.shishen, fromYear: curDy.fromYear, toYear: curDy.toYear } : null,
    dayunSteps: dySteps.slice(0, 8).map((s) => ({
      name: s.name,
      gan: s.gan,
      zhi: s.zhi,
      shishen: s.shishen,
      startAge: s.startAge,
      fromYear: s.fromYear,
      toYear: s.toYear,
    })),
    liunianList: Array.isArray(f.liunian) ? f.liunian : [],
    keyShensha,
    pills,
  };
}

/** 跨盘判定：keys 必须一边 a 一边 b（同盘内部的合冲要剔掉） */
const isCross = (r) => {
  const ks = r.keys || [];
  if (!ks.length) return false;
  return ks.some((k) => k.startsWith('a.')) && ks.some((k) => k.startsWith('b.'));
};

/** 关系项 → 展示件 */
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

const HE_WEIGHT = { he: 6, sanhe: 8, banhe: 5, gongju: 3, sanhui: 8 };
const CONFLICT_PENALTY = { chong: -4, xing: -2.5, hai: -1.5, po: -0.8 };

const POS_WEIGHT = { day: 1.5, hour: 1.2, month: 1, year: 1 };
function posWeightOf(r) {
  const seg = (k) => {
    const pos = String(k).split('.')[1];
    return POS_WEIGHT[pos] ?? 1;
  };
  const ws = (r.keys || []).map(seg);
  return Math.max(...ws, 1);
}

/** 维度 1：日柱与夫妻宫（权重最高） */
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
  } else if (A.dayMasterElement && B.dayMasterElement) {
    const dmRel = wuxingRel(A.dayMasterElement, B.dayMasterElement);
    if (dmRel === '相生') {
      score += 6;
      hits.push(`日主${A.dayGan}（${A.dayMasterElement}）与${B.dayGan}（${B.dayMasterElement}）五行相生，心性自然相引`);
    } else if (dmRel === '比和') {
      score += 4;
      hits.push(`日主${A.dayGan}与${B.dayGan}同属${A.dayMasterElement}行，志趣同频`);
    }
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
    note: '日干代表元神自我，日支为夫妻正宫，居合参权重之首',
    items: hits,
    ganRel,
    zhiRel,
  };
}

/** 维度 2：天干地支合参（跨盘合冲） */
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
    note: '跨盘五合、六合、三合越多则默契越深；刑冲越多越需主动磨合',
    items: he,
    conflicts,
  };
}

/** 维度 3：五行与用神互补（严格保持交换对称） */
function wuxingDim(A, B) {
  const lines = [];
  let gain = 0;
  const aHelpsB = [];
  const bHelpsA = [];
  for (const e of WUXING) {
    const pa = pct(A.elementPercent, e);
    const pb = pct(B.elementPercent, e);
    const needA = A.yongFavorable.includes(e);
    const needB = B.yongFavorable.includes(e);
    const matchA = needA && pb >= 18;
    const matchB = needB && pa >= 18;
    let kind = '相当';
    if (matchA || matchB) {
      kind = '互补';
      gain += 7;
      if (matchA) bHelpsA.push(`${e}（${B.name}占${pb}%补益${A.name}喜用）`);
      if (matchB) aHelpsB.push(`${e}（${A.name}占${pa}%补益${B.name}喜用）`);
    } else if ((needA && pb < 8) || (needB && pa < 8)) {
      kind = needA && pb < 8 ? 'A 所求 B 不备' : 'B 所求 A 不备';
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
    note: '察一方命局所喜之五行，另一方是否丰沛相济（子平合婚核心）',
    lines,
    aHelpsB,
    bHelpsA,
  };
}

/** 维度 4：生肖年支与纳音（民俗根基向） */
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
    note: '年支生肖主家庭外缘与根基，日柱纳音察两人气场底色',
    ziKind,
    naKind,
    items: [
      `生肖：${A.name}${A.zodiac} 与 ${B.name}${B.zodiac}，${ziKind}`,
      `日柱纳音：${A.pills[2]?.nayin || '—'}（${ea || '—'}）／${B.pills[2]?.nayin || '—'}（${eb || '—'}），${naKind}`,
    ],
  };
}

/** 维度 5：格局十神与性情三观（严格交换对称） */
function characterDim(A, B) {
  let score = 0;
  const items = [];
  // 1) 阴阳相济（一阴一阳之谓道）
  if (A.dayMasterYang !== B.dayMasterYang) {
    score += 4;
    items.push(`日主一阳一阴（${A.dayGan}与${B.dayGan}），刚柔相济，处事一主一辅`);
  } else {
    score += 1;
    items.push(`日主同为${A.dayMasterYang ? '阳干' : '阴干'}（${A.dayGan}与${B.dayGan}），性情直爽同频`);
  }
  // 2) 月支（门户性格宫）五行关系
  if (A.monthZhiIndex >= 0 && B.monthZhiIndex >= 0) {
    const ma = ZHI_WUXING[A.monthZhiIndex];
    const mb = ZHI_WUXING[B.monthZhiIndex];
    const rel = wuxingRel(ma, mb);
    if (rel === '相生') {
      score += 5;
      items.push(`月令提纲${A.monthZhi}（${ma}）与${B.monthZhi}（${mb}）相生，生活习惯与价值观易达成默契`);
    } else if (rel === '比和') {
      score += 3;
      items.push(`月令提纲${A.monthZhi}与${B.monthZhi}五行比和，消费观与社交步调相近`);
    } else {
      score -= 2;
      items.push(`月令提纲${A.monthZhi}（${ma}）与${B.monthZhi}（${mb}）相克，处事优先级偶有差异，宜分工协作`);
    }
  }
  // 3) 身强身弱互补
  const sA = A.strengthScore ?? 50;
  const sB = B.strengthScore ?? 50;
  if ((sA >= 55 && sB <= 48) || (sB >= 55 && sA <= 48) || (Math.abs(sA - 50) <= 10 && Math.abs(sB - 50) <= 10)) {
    score += 3;
    items.push(`双方能量强弱（${A.strengthLevel || '中和'} × ${B.strengthLevel || '中和'}）张弛有度，决策不易硬碰硬`);
  }
  return {
    dim: 'character',
    label: '格局与性情同频',
    weight: 12,
    score: clamp(score, -12, 12),
    note: '参看日主阴阳、月令提纲（性格宫）与身强弱之进退默契',
    items,
  };
}

/** 跨盘贵人/禄马/红鸾桃花互查（双向计算） */
function analyzeCrossShensha(A, B) {
  const checkOneWay = (src, dst) => {
    const hits = [];
    const dstZhis = new Set(dst.pills.map((p) => p.zhi).filter(Boolean));
    const tianyi = TIANYI_MAP[src.dayGan] || [];
    for (const z of tianyi) {
      if (dstZhis.has(z)) {
        hits.push({
          type: '天乙贵人',
          badge: '大吉贵人',
          title: `${dst.name}命盘带${src.name}的「天乙贵人（${z}）」`,
          desc: `${src.name}日干为${src.dayGan}，见${dst.name}柱中「${z}」支为天乙贵人，主${dst.name}能在事业关键节点与生活逆境中给予${src.name}天然扶持与逢凶化吉之力。`,
        });
        break;
      }
    }
    const luZhi = LU_MAP[src.dayGan];
    if (luZhi && dstZhis.has(luZhi)) {
      hits.push({
        type: '专禄福星',
        badge: '旺财助运',
        title: `${dst.name}命盘带${src.name}的「日禄（${luZhi}）」`,
        desc: `${src.name}日干${src.dayGan}禄在「${luZhi}」，落入${dst.name}四柱，传统命理称为「得偶添禄」，主双方结合后财源福气更为殷实。`,
      });
    }
    const hlZhi = HONGLUAN_MAP[src.yearZhi];
    const txZhi = TIANXI_MAP[src.yearZhi];
    if (hlZhi && dstZhis.has(hlZhi)) {
      hits.push({
        type: '红鸾星动',
        badge: '正缘喜星',
        title: `${dst.name}命盘落入${src.name}的「红鸾星（${hlZhi}）」`,
        desc: `${src.name}年支${src.yearZhi}见「${hlZhi}」为红鸾正缘星，恰好出现在${dst.name}命局中，主双方初见投缘、极具宿命吸引感。`,
      });
    } else if (txZhi && dstZhis.has(txZhi)) {
      hits.push({
        type: '天喜照命',
        badge: '喜庆良缘',
        title: `${dst.name}命盘落入${src.name}的「天喜星（${txZhi}）」`,
        desc: `${src.name}年支${src.yearZhi}见「${txZhi}」为天喜星，落入${dst.name}四柱，主相处氛围明快温暖、易有婚嫁添丁之喜。`,
      });
    }
    const thZhi = TAOHUA_MAP[src.dayZhi] || TAOHUA_MAP[src.yearZhi];
    if (thZhi && dstZhis.has(thZhi) && !hits.some((h) => h.type.includes('红鸾'))) {
      hits.push({
        type: '咸池桃花',
        badge: '情投意合',
        title: `${dst.name}命盘带${src.name}的「情缘桃花（${thZhi}）」`,
        desc: `双方气场相互吸引，亲密关系中浪漫互动与情感黏性较强。`,
      });
    }
    return hits;
  };

  const aToB = checkOneWay(B, A); // A 是 B 的贵人/福星
  const bToA = checkOneWay(A, B); // B 是 A 的贵人/福星
  const all = [...bToA, ...aToB];
  return {
    bHelpsA: bToA,
    aHelpsB: aToB,
    all,
    totalCount: all.length,
  };
}

/** 未来六年（2025-2030）双人岁运同步共振推演（严格交换对称） */
function buildSynastryTimeline(A, B) {
  const startY = 2025;
  const years = [];
  for (let y = startY; y < startY + 6; y++) {
    const gIdx = (y - 4) % 10;
    const zIdx = (y - 4) % 12;
    const gan = GAN[(gIdx + 10) % 10];
    const zhi = ZHI[(zIdx + 12) % 12];
    const ganzhi = `${gan}${zhi}`;
    const wxGan = GAN_WUXING[(gIdx + 10) % 10];
    const wxZhi = ZHI_WUXING[(zIdx + 12) % 12];

    const evalPartyYear = (P) => {
      let pts = 50;
      const notes = [];
      if (P.yongFavorable.includes(wxGan)) {
        pts += 12;
        notes.push(`岁干${gan}(${wxGan})助喜用`);
      } else if (P.yongUnfavorable.includes(wxGan)) {
        pts -= 6;
      }
      if (P.yongFavorable.includes(wxZhi)) {
        pts += 14;
        notes.push(`太岁${zhi}(${wxZhi})补喜用`);
      } else if (P.yongUnfavorable.includes(wxZhi)) {
        pts -= 8;
      }
      // 查流年地支与夫妻宫（日支）关系
      const rels = analyzeZhi([
        { key: 'p.day', label: '日支', zhiIndex: P.dayZhiIndex },
        { key: 'ln.zhi', label: '太岁', zhiIndex: (zIdx + 12) % 12 },
      ]);
      const r0 = rels[0];
      if (r0 && GOOD_TYPES.has(r0.type)) {
        pts += 14;
        notes.push(`太岁合夫妻宫(${r0.name})`);
      } else if (r0 && r0.type === 'chong') {
        pts -= 12;
        notes.push(`岁支冲夫妻宫(${r0.name})`);
      }
      if (!notes.length) notes.push(`岁运平稳守成`);
      return { score: clamp(pts, 25, 96), notes };
    };

    const resA = evalPartyYear(A);
    const resB = evalPartyYear(B);
    const syncScore = clamp((resA.score + resB.score) / 2, 30, 98);
    let tag = '平顺修心年';
    let tone = 'mid';
    if (syncScore >= 76) {
      tag = '同频共振·婚嫁置业吉年';
      tone = 'good';
    } else if (syncScore >= 64) {
      tag = '稳中有进·协同发力年';
      tone = 'good';
    } else if (syncScore <= 46) {
      tag = '变动磨合·宜多包容沟通';
      tone = 'warn';
    }

    years.push({
      year: y,
      ganzhi,
      wxGan,
      wxZhi,
      syncScore,
      tag,
      tone,
      aScore: resA.score,
      bScore: resB.score,
      aNote: resA.notes.join(' · '),
      bNote: resB.notes.join(' · '),
    });
  }
  return years;
}

/** 维度 6：贵人神煞与岁运同步（严格交换对称） */
function timingDim(A, B, crossShensha, timeline) {
  let score = 0;
  const items = [];
  if (crossShensha.totalCount > 0) {
    score += Math.min(8, crossShensha.totalCount * 3);
    items.push(...crossShensha.all.slice(0, 2).map((h) => h.title));
  } else {
    items.push('双方四柱神煞各自独立清正，靠日常经营累积默契');
  }
  const avgTimeline = timeline.reduce((s, y) => s + y.syncScore, 0) / (timeline.length || 1);
  if (avgTimeline >= 66) {
    score += 4;
    items.push(`2025–2030 岁运共振均值达 ${Math.round(avgTimeline)} 分，未来六年有多个共同进取吉年`);
  } else if (avgTimeline <= 48) {
    score -= 3;
    items.push(`近期流年偶有岁支冲动夫妻宫，遇事宜商量缓行`);
  } else {
    score += 2;
    items.push(`未来六年岁运走势平稳交替，一方波动时另一方恰好稳健托底`);
  }
  return {
    dim: 'timing',
    label: '神煞贵人与岁运',
    weight: 12,
    score: clamp(score, -12, 12),
    note: '考察跨盘天乙贵人、禄马红鸾互带及未来六年流年同步率',
    items,
  };
}

/** 四柱逐柱对轨合参表（年柱/月柱/日柱/时柱深度对比） */
function buildPillarMatches(A, B) {
  const posMeta = {
    year: { title: '年柱合参 · 根基与原生家庭观', role: '察两姓门风、长辈助力与早年成长底色' },
    month: { title: '月柱合参 · 门户性格与价值观', role: '察消费习惯、职场野心与日常情绪同频度' },
    day: { title: '日柱合参 · 元神与夫妻正宫（核心）', role: '察亲密关系黏性、婚姻稳定度与配偶宫向心力' },
    hour: { title: '时柱合参 · 子女宫与晚年归宿', role: '察共同长远规划、子女教育观与晚景福泽' },
  };

  return KEYS4.map((k, idx) => {
    const pa = A.pills[idx] || {};
    const pb = B.pills[idx] || {};
    const gRel = pa.ganIndex >= 0 && pb.ganIndex >= 0 ? ganRelation(pa.ganIndex, pb.ganIndex) : null;
    const zRels = pa.zhiIndex >= 0 && pb.zhiIndex >= 0
      ? analyzeZhi([
          { key: `a.${k}`, label: '甲', zhiIndex: pa.zhiIndex },
          { key: `b.${k}`, label: '乙', zhiIndex: pb.zhiIndex },
        ])
      : [];
    const zRel = zRels[0] || null;

    let ganText = '平相各立';
    let pts = 0;
    if (gRel && gRel.type === 'he') {
      ganText = `${gRel.name}（化${gRel.hua}）`;
      pts += 2;
    } else if (gRel && gRel.type === 'chong') {
      ganText = gRel.name;
      pts -= 1;
    } else if (pa.wuxingGan && pb.wuxingGan) {
      const r = wuxingRel(pa.wuxingGan, pb.wuxingGan);
      ganText = `天干${pa.gan}(${pa.wuxingGan})与${pb.gan}(${pb.wuxingGan})${r}`;
      if (r === '相生' || r === '比和') pts += 1;
    }

    let zhiText = '地支平和';
    if (zRel) {
      zhiText = zRel.name;
      if (GOOD_TYPES.has(zRel.type)) pts += 2;
      if (BAD_TYPES.has(zRel.type)) pts -= 2;
    } else if (pa.wuxingZhi && pb.wuxingZhi) {
      const r = wuxingRel(pa.wuxingZhi, pb.wuxingZhi);
      zhiText = `地支${pa.zhi}(${pa.wuxingZhi})与${pb.zhi}(${pb.wuxingZhi})${r}`;
      if (r === '相生' || r === '比和') pts += 1;
    }

    let nayinText = `${pa.nayin || '—'} × ${pb.nayin || '—'}`;
    if (pa.nayinElement && pb.nayinElement) {
      const nr = wuxingRel(pa.nayinElement, pb.nayinElement);
      nayinText += `（纳音${nr}）`;
      if (nr === '相生' || nr === '比和') pts += 1;
    }

    let badge = '中平相安';
    let badgeTone = 'mid';
    if (pts >= 3) {
      badge = '天作同频';
      badgeTone = 'good';
    } else if (pts >= 1) {
      badge = '相生互助';
      badgeTone = 'good';
    } else if (pts <= -1) {
      badge = '需重磨合';
      badgeTone = 'warn';
    }

    return {
      pos: k,
      label: LABEL4[k] + '柱',
      title: posMeta[k].title,
      role: posMeta[k].role,
      aPillar: pa.name,
      bPillar: pb.name,
      aShishen: pa.shishen,
      bShishen: pb.shishen,
      ganText,
      zhiText,
      nayinText,
      badge,
      badgeTone,
    };
  });
}

/** 八宅命卦婚配参考 */
function buildMingGuaMatch(A, B) {
  const ma = A.mingGua;
  const mb = B.mingGua;
  if (!ma || !mb) return null;
  const sameGroup = ma.group === mb.group;
  return {
    aGua: `${ma.name}卦（${ma.group}）`,
    bGua: `${mb.name}卦（${mb.group}）`,
    sameGroup,
    badge: sameGroup ? '福元同气 · 八宅同宫' : '东西互补 · 动静相济',
    desc: sameGroup
      ? `双方同属「${ma.group}」，居家风水吉方高度一致（大门、主卧、财位朝向易统一），安家置业天然省心。`
      : `一方属「${ma.group}」、一方属「${mb.group}」，性格一动一静，主卧与书房工位可按各自命卦吉方灵活分区布置。`,
  };
}

const BASE_SCORE = 50;

const GRADES = [
  { min: 85, name: '天作之合', desc: '六维合参多项同频，干支相引、喜用互旺，传统视为上等佳配' },
  { min: 75, name: '相得益彰', desc: '夫妻宫与喜用神彼此补益，长久相处省力顺心' },
  { min: 62, name: '互补有成', desc: '整体根基相合，个别柱位有张力，善用互补更添默契' },
  { min: 50, name: '需要磨合', desc: '盘中有合亦有冲，重在换位沟通与边界共识' },
  { min: 0, name: '挑战较多', desc: '刑冲摩擦项偏显，更考验双方情绪成熟度与共同经营' },
];

/**
 * 合盘主入口
 * @param {{a:object, b:object, names?:{a?:string,b?:string}}} p  a/b 为两个八字 facts
 */
export function computeHePan(p) {
  const A = partyOf(p.a, 'a', p.names?.a);
  const B = partyOf(p.b, 'b', p.names?.b);
  const parties = [A, B];

  const crossShensha = analyzeCrossShensha(A, B);
  const timeline = buildSynastryTimeline(A, B);
  const pillarMatches = buildPillarMatches(A, B);
  const mingGuaMatch = buildMingGuaMatch(A, B);

  const dims = [
    dayDim(A, B),
    combineDim(A, B),
    wuxingDim(A, B),
    zodiacDim(A, B),
    characterDim(A, B),
    timingDim(A, B, crossShensha, timeline),
  ];
  const dOf = (k) => dims.find((d) => d.dim === k) || { items: [], conflicts: [] };

  // 核心四维维持经典权重比例，确保总分区分度与对称性严丝合缝
  const DIM_GAIN = { day: 0.8, combine: 0.6, wuxing: 0.8, zodiac: 0.8, character: 0.35, timing: 0.35 };
  const offset = dims.reduce((s, d) => s + d.score * (DIM_GAIN[d.dim] ?? 0.5), 0);
  const raw = dims.map((d) => ({ dim: d.dim, score: d.score, weight: DIM_GAIN[d.dim] ?? 0.5 }));
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

  // 三大商业级合婚核心批断卡（供首屏一眼看懂核心结论）
  const coreVerdicts = [
    {
      title: '夫妻宫与元神默契',
      badge: dOf('day').score >= 6 ? '宫位得合' : dOf('day').score >= 0 ? '平顺相守' : '动中求稳',
      text: (dOf('day').items || [])[0] || `日柱${A.dayGanzhi}与${B.dayGanzhi}同参，相处宜坦诚相待`,
    },
    {
      title: '五行喜用双向互旺',
      badge: complement.length >= 2 ? '强力互补' : complement.length === 1 ? '良性相济' : '各具独立',
      text: complement.length
        ? `重点互补五行：${complement.map((c) => c.element).join('、')}（一方所喜恰为另一方所旺）`
        : `${A.name}喜${A.yongFavorable.join('') || '中和'}，${B.name}喜${B.yongFavorable.join('') || '中和'}，日常可借方位色彩共同调候`,
    },
    {
      title: '跨盘贵人与岁运走势',
      badge: crossShensha.totalCount > 0 ? `互带${crossShensha.totalCount}吉星` : '岁运稳健',
      text: crossShensha.all[0]?.title || `未来六年岁运共振平稳，宜在吉年携手推进人生大事`,
    },
  ];

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
    character: dOf('character'),
    timing: dOf('timing'),
    complement,
    pillarMatches,
    crossShensha,
    mingGuaMatch,
    timeline,
    coreVerdicts,
    headline,
    summary: `${A.name}${A.dayGanzhi}／${A.pills.map((x) => x.name).join(' ')}　×　${B.name}${B.dayGanzhi}／${B.pills.map((x) => x.name).join(' ')}；${headline}；合 ${heItems.length} 项，冲克刑害 ${conflicts.length} 项，五行互补 ${complement.length} 项，跨盘贵人桃花 ${crossShensha.totalCount} 项。`,
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
