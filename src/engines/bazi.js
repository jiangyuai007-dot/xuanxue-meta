/**
 * 八字（四柱）排盘引擎 —— 确定性，只产事实，不做解读
 *
 * 规则说明：
 *  - 年柱/月柱：以节气「交节时刻」为界，用绝对时刻（UT）比较
 *  - 日柱/时柱：以真太阳时为准；23:00 后为晚子时，日柱顺延一日
 *  - 大运：阳年男顺、阴年女顺，其余逆行；三日折一岁
 */

import { ymdToJdn, jdnToYmd, jdToYmdhms } from '../core/julian.js';
import { solarTerm, SOLAR_TERMS } from '../core/astro.js';
import { toLunar, lunarToSolar } from '../core/lunar.js';
import { resolveDateTime } from '../core/time.js';
import {
  GAN, ZHI, GAN_WUXING, ZHI_WUXING, GAN_YANG, WUXING,
  ganzhiOfIndex, ganzhiOfJdn, nayinOfIndex, shishen, cangganOf,
  indexOfGanzhi,
} from '../core/ganzhi.js';
import {
  analyzeGan, analyzeZhi,
  changsheng as changshengOf, zizuo as zizuoOf,
  xunkongOf, taiyuan as taiyuanOf, mingGong, shenGong, mingGua, monthOrderOf,
} from '../core/relations.js';
import { computeShensha as computeShenshaFull } from '../core/shensha.js';
import { computeChengGu } from '../core/chenggu.js';

/** 月序（1=寅月）对应的「节」索引 */
export const MONTH_JIE = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 0];
/** 五虎遁：年干 -> 寅月天干 */
const WU_HU_DUN = { 0: 2, 5: 2, 1: 4, 6: 4, 2: 6, 7: 6, 3: 8, 8: 8, 4: 0, 9: 0 };
/** 五鼠遁：日干 -> 子时天干 */
const WU_SHU_DUN = { 0: 0, 5: 0, 1: 2, 6: 2, 2: 4, 7: 4, 3: 6, 8: 6, 4: 8, 9: 8 };

/** 列出某时刻前后最近的「节」 */
function jieAround(jdUtc) {
  const y0 = jdnToYmd(Math.floor(jdUtc + 0.5)).year;
  const list = [];
  for (const y of [y0 - 1, y0, y0 + 1]) {
    for (const idx of MONTH_JIE) {
      const t = solarTerm(y, idx);
      list.push({ jdUtc: t.jdUtc, index: idx, name: SOLAR_TERMS[idx] });
    }
  }
  return list.sort((a, b) => a.jdUtc - b.jdUtc);
}

function nextJie(jdUtc) {
  return jieAround(jdUtc).find((t) => t.jdUtc > jdUtc) || null;
}
function prevJie(jdUtc) {
  const l = jieAround(jdUtc).filter((t) => t.jdUtc <= jdUtc);
  return l.length ? l[l.length - 1] : null;
}

/** 归一化输入：支持农历输入 */
export function normalizeInput(input) {
  // 防御（线上真 bug）：浏览器表单传的是字符串 '2006'，若原样往下游走，
  // 会出现 '2006'+1 = '20061' 这类拼接，天文/农历计算跑飞 → 服务进程 100% CPU 卡死。
  // 这里是八字排盘的第一入口，必须把日期字段收敛成有限数字，非法值直接上抛。
  const out = { ...input };
  for (const k of ['year', 'month', 'day', 'hour', 'minute']) {
    if (out[k] === undefined || out[k] === null || out[k] === '') continue;
    const n = Number(out[k]);
    if (!Number.isFinite(n)) throw new Error(`生辰字段 ${k} 非法：${out[k]}`);
    out[k] = n;
  }
  if (out.calendar === 'lunar') {
    const s = lunarToSolar(out.year, out.month, out.day, !!out.isLeapMonth);
    return { ...out, calendar: 'gregorian', year: s.year, month: s.month, day: s.day };
  }
  return out;
}

/** 计算四柱（供八字与六爻等共用） */
export function computePillars(jdUtc, jdSolar) {
  // 年柱：立春分界
  const gy = jdnToYmd(Math.floor(jdUtc + 0.5)).year;
  let lichun = solarTerm(gy, SOLAR_TERMS.indexOf('立春')).jdUtc;
  let baziYear = gy;
  if (jdUtc < lichun) baziYear = gy - 1;
  const yearIndex = ((baziYear - 4) % 60 + 60) % 60;
  const yearGz = ganzhiOfIndex(yearIndex);

  // 月柱：以「节」为界
  const jieList = jieAround(jdUtc);
  let cur = null;
  for (const t of jieList) {
    if (t.jdUtc <= jdUtc) cur = t;
    else break;
  }
  let monthOrder = 1; // 1..12，寅月起
  if (cur) {
    const mi = MONTH_JIE.indexOf(cur.index);
    if (mi >= 0) monthOrder = mi + 1;
  }
  const monthZhiIndex = (monthOrder + 1) % 12;
  const monthGanIndex = (WU_HU_DUN[yearGz.ganIndex] + (monthOrder - 1)) % 10;
  const monthIndex = indexOfGanzhi(monthGanIndex, monthZhiIndex);

  // 日柱：真太阳时日号（晚子时顺延）
  const solarFrac = jdSolar + 0.5;
  let dayNumber = Math.floor(solarFrac);
  const hourFloat = (solarFrac - dayNumber) * 24;
  let lateZi = false;
  if (hourFloat >= 23) {
    lateZi = true;
    dayNumber += 1;
  }
  const dayGz = ganzhiOfJdn(dayNumber);

  // 时柱
  let hourZhiIndex;
  if (lateZi) hourZhiIndex = 0;
  else hourZhiIndex = Math.floor((hourFloat + 1) / 2) % 12;
  const hourGanIndex = (WU_SHU_DUN[dayGz.ganIndex] + hourZhiIndex) % 10;
  const hourIndex = indexOfGanzhi(hourGanIndex, hourZhiIndex);

  return {
    year: yearGz,
    month: ganzhiOfIndex(monthIndex),
    day: dayGz,
    hour: ganzhiOfIndex(hourIndex),
    monthOrder,
    lateZi,
    baziYear,
    hourFloat,
  };
}

/** 藏干 + 十神 */
function withCanggan(pillar, dayGanIndex) {
  return cangganOf(pillar.zhiIndex, dayGanIndex);
}

/** 五行统计（加权） */
function elementStats(pillars, dayGanIndex) {
  const counts = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const add = (el, w) => {
    counts[el] += w;
  };
  for (const key of ['year', 'month', 'day', 'hour']) {
    const p = pillars[key];
    add(GAN_WUXING[p.ganIndex], 1.0);
    for (const cg of cangganOf(p.zhiIndex, dayGanIndex)) add(cg.wuxing, cg.weight);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const percent = {};
  for (const k of Object.keys(counts)) percent[k] = Math.round((counts[k] / total) * 1000) / 10;
  return { counts, percent, total };
}

/** 日主强弱（简化规则，见设计文档 D9） */
function strength(pillars, dayGanIndex, stats) {
  const dmEl = GAN_WUXING[dayGanIndex];
  const monthZhiEl = ZHI_WUXING[pillars.month.zhiIndex];
  const shengWo = { 木: '水', 火: '木', 土: '火', 金: '土', 水: '金' };
  const basis = [];
  let score = 50;

  if (monthZhiEl === dmEl) {
    score += 18;
    basis.push('月支与日主同气（得令）');
  } else if (shengWo[dmEl] === monthZhiEl) {
    score += 16;
    basis.push('月支生日主（得令）');
  } else {
    score -= 8;
    basis.push('月支不助日主（不得令）');
  }

  // 通根（地支藏干含日主同气）
  for (const key of ['year', 'month', 'day', 'hour']) {
    const cg = cangganOf(pillars[key].zhiIndex, dayGanIndex);
    if (cg.some((c) => c.wuxing === dmEl)) {
      score += 6;
      basis.push(`${key === 'year' ? '年' : key === 'month' ? '月' : key === 'day' ? '日' : '时'}支通根`);
    }
  }
  // 天干帮扶（比劫、印）
  for (const key of ['year', 'month', 'hour']) {
    const s = shishen(dayGanIndex, pillars[key].ganIndex);
    if (['比肩', '劫财', '正印', '偏印'].includes(s)) {
      score += 5;
      basis.push(`${key === 'year' ? '年' : key === 'month' ? '月' : '时'}干${s}帮扶`);
    } else if (['正官', '七杀', '正财', '偏财', '食神', '伤官'].includes(s)) {
      score -= 3;
      basis.push(`${key === 'year' ? '年' : key === 'month' ? '月' : '时'}干${s}耗泄`);
    }
  }
  score = Math.max(5, Math.min(95, score));
  let level = '中和';
  if (score >= 68) level = '偏强';
  else if (score >= 58) level = '略强';
  else if (score >= 42) level = '中和';
  else if (score >= 32) level = '略弱';
  else level = '偏弱';
  return { score, level, basis };
}

const SHISHEN_PATTERN = {
  正官: '正官格', 七杀: '七杀格', 正财: '正财格', 偏财: '偏财格',
  正印: '正印格', 偏印: '偏印格', 食神: '食神格', 伤官: '伤官格',
  比肩: '建禄格', 劫财: '月刃格',
};

/** 格局：以月支本气十神定 */
function pattern(pillars, dayGanIndex) {
  const cg = cangganOf(pillars.month.zhiIndex, dayGanIndex);
  const ben = cg[0];
  const s = shishen(dayGanIndex, ben.ganIndex);
  return {
    name: SHISHEN_PATTERN[s] || `${s}格`,
    basis: `月支${pillars.month.zhi}本气${ben.gan}（${s}）`,
    shishen: s,
  };
}

/** 用神（保守规则表，弱表述） */
function yongshen(dayGanIndex, strengthInfo) {
  const dmEl = GAN_WUXING[dayGanIndex];
  const shengWo = { 木: '水', 火: '木', 土: '火', 金: '土', 水: '金' };
  const woSheng = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
  const keWo = { 木: '金', 火: '水', 土: '木', 金: '火', 水: '土' };
  const woKe = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' };
  let favorable;
  let basis;
  if (strengthInfo.level === '偏强' || strengthInfo.level === '略强') {
    favorable = [woKe[dmEl], woSheng[dmEl], keWo[dmEl]];
    basis = '日主偏强，宜泄、耗、克（食伤、财、官杀为用）';
  } else if (strengthInfo.level === '偏弱' || strengthInfo.level === '略弱') {
    favorable = [shengWo[dmEl], dmEl];
    basis = '日主偏弱，宜生、扶（印、比劫为用）';
  } else {
    favorable = [shengWo[dmEl], woSheng[dmEl]];
    basis = '日主中和，顺势流通为主，不宜大补大泄';
  }
  const unfavorable = WUXING.filter((w) => !favorable.includes(w));
  return { favorable, unfavorable, basis, note: '此为基于五行平衡的规则化参考，非绝对结论' };
}

/** 大运 */
function dayun(jdUtc, pillars, gender) {
  const yangYear = GAN_YANG[pillars.year.ganIndex];
  const forward = (yangYear && gender === 'male') || (!yangYear && gender === 'female');
  const target = forward ? nextJie(jdUtc) : prevJie(jdUtc);
  if (!target) return { forward, steps: [], startAge: 0, basis: '无法确定交节时刻' };
  const diffDays = forward ? target.jdUtc - jdUtc : jdUtc - target.jdUtc;
  const startAge = Math.max(0, Math.round((diffDays / 3) * 10) / 10);
  const birthYear = jdnToYmd(Math.floor(jdUtc + 0.5)).year;
  const startYear = birthYear + Math.floor(startAge);

  const baseIndex = pillars.month.index;
  const steps = [];
  for (let i = 1; i <= 10; i++) {
    const idx = ((baseIndex + (forward ? i : -i)) % 60 + 60) % 60;
    const gz = ganzhiOfIndex(idx);
    const from = startYear + (i - 1) * 10;
    steps.push({
      order: i,
      gan: gz.gan, zhi: gz.zhi, name: gz.name, index: idx,
      startAge: Math.floor(startAge) + (i - 1) * 10,
      fromYear: from,
      toYear: from + 9,
      shishen: shishen(pillars.day.ganIndex, gz.ganIndex),
    });
  }
  return {
    forward,
    jieName: target.name,
    startAge,
    startYear,
    steps,
    basis: `${yangYear ? '阳' : '阴'}年${gender === 'male' ? '男' : '女'}命${forward ? '顺' : '逆'}行，距${forward ? '下一个' : '上一个'}「${target.name}」${diffDays.toFixed(2)} 日，三日折一岁`,
  };
}

/**
 * 主入口
 * @param {object} input 见设计文档输入契约
 */
export function computeBazi(input) {
  const warnings = [];
  const src = normalizeInput(input);
  const dt = resolveDateTime(src);
  const { jdUtc, jdSolar } = dt;

  const pillarsRaw = computePillars(jdUtc, jdSolar);
  const dayGanIndex = pillarsRaw.day.ganIndex;
  const pillars = {
    year: pillarsRaw.year,
    month: pillarsRaw.month,
    day: pillarsRaw.day,
    hour: pillarsRaw.hour,
  };

  const out = {};
  for (const key of ['year', 'month', 'day', 'hour']) {
    const p = pillars[key];
    out[key] = {
      gan: p.gan,
      zhi: p.zhi,
      name: p.name,
      ganIndex: p.ganIndex,
      zhiIndex: p.zhiIndex,
      index: p.index,
      wuxingGan: GAN_WUXING[p.ganIndex],
      wuxingZhi: ZHI_WUXING[p.zhiIndex],
      shishen: shishen(dayGanIndex, p.ganIndex),
      shishenZhi: shishen(dayGanIndex, GAN.indexOf(cangganOf(p.zhiIndex, dayGanIndex)[0].gan)),
      nayin: nayinOfIndex(p.index),
      canggan: cangganOf(p.zhiIndex, dayGanIndex),
    };
  }

  const stats = elementStats(pillars, dayGanIndex);
  const strengthInfo = strength(pillars, dayGanIndex, stats);
  const lunar = toLunar(jdUtc, dt.tzOffset);

  // 当前节气
  const jieList = jieAround(jdUtc);
  let curJie = null;
  for (const t of jieList) {
    if (t.jdUtc <= jdUtc) curJie = t;
    else break;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const liunian = [];
  for (let y = currentYear - 1; y <= currentYear + 5; y++) {
    const idx = ((y - 4) % 60 + 60) % 60;
    const gz = ganzhiOfIndex(idx);
    liunian.push({
      year: y,
      ganzhi: gz.name,
      gan: gz.gan,
      zhi: gz.zhi,
      index: idx,
      shishen: shishen(dayGanIndex, gz.ganIndex),
    });
  }

  const dy = dayun(jdUtc, pillarsRaw, src.gender === 'female' ? 'female' : 'male');

  // ======== 事实层扩展：干支关系 / 长生 / 旬空 / 三垣 / 神煞 / 宫位六亲 ========
  const LABEL = { year: '年', month: '月', day: '日', hour: '时' };
  const KEYS4 = ['year', 'month', 'day', 'hour'];

  const ganItems = KEYS4.map((k) => ({ key: k, label: LABEL[k], ganIndex: out[k].ganIndex }));
  const zhiItems = KEYS4.map((k) => ({ key: k, label: LABEL[k], zhiIndex: out[k].zhiIndex }));
  const relations = {
    gan: analyzeGan(ganItems),
    zhi: analyzeZhi(zhiItems),
  };
  relations.all = [...relations.gan, ...relations.zhi].sort((a, b) => b.strength - a.strength);

  // 十二长生：日主于四支的状态；自坐：柱内天干坐本柱地支
  const changsheng = {};
  const zizuoInfo = {};
  for (const k of KEYS4) {
    changsheng[k] = changshengOf(dayGanIndex, out[k].zhiIndex);
    zizuoInfo[k] = zizuoOf(out[k].ganIndex, out[k].zhiIndex);
  }

  const xunkong = xunkongOf(pillars.day.index);
  const xunkongPositions = KEYS4.filter((k) => xunkong.includes(out[k].zhi)).map((k) => LABEL[k] + '支');

  const shenShaAll = computeShenshaFull({
    yearGanIndex: pillars.year.ganIndex,
    yearZhiIndex: pillars.year.zhiIndex,
    monthZhiIndex: pillars.month.zhiIndex,
    dayGanIndex,
    dayZhiIndex: pillars.day.zhiIndex,
    hourZhiIndex: pillars.hour.zhiIndex,
    stems: {
      year: pillars.year.ganIndex, month: pillars.month.ganIndex,
      day: pillars.day.ganIndex, hour: pillars.hour.ganIndex,
    },
    gender: src.gender === 'female' ? 'female' : 'male',
    yearGanYang: GAN_YANG[pillars.year.ganIndex],
    lunarMonth: lunar.month,
  }).map((x) => ({ ...x, note: x.desc }));

  // 空亡已作为正式规则入神煞库（shensha.js 108 项），此处不再手工追加

  const shenshaList = shenShaAll;

  // 岁运干支与命局的互动（「这步运怎么样」的事实原料）
  const impactOn = (gIndex, zIndex) => {
    const gs = analyzeGan([{ key: 'yun', label: '运', ganIndex: gIndex }, ...ganItems])
      .filter((r) => r.keys.includes('yun'));
    const zs = analyzeZhi([{ key: 'yun', label: '运', zhiIndex: zIndex }, ...zhiItems])
      .filter((r) => r.keys.includes('yun'));
    const all = [...gs, ...zs].sort((a, b) => b.strength - a.strength);
    return { gan: gs, zhi: zs, all, count: all.length };
  };
  for (const s of dy.steps) {
    const gz = ganzhiOfIndex(s.index);
    s.ganIndex = gz.ganIndex;
    s.zhiIndex = gz.zhiIndex;
    s.impact = impactOn(gz.ganIndex, gz.zhiIndex);
  }
  for (const n of liunian) {
    const gz = ganzhiOfIndex(n.index);
    n.ganIndex = gz.ganIndex;
    n.zhiIndex = gz.zhiIndex;
    n.impact = impactOn(gz.ganIndex, gz.zhiIndex);
  }

  // 宫位六亲（传统四柱宫位定位）
  const PALACE_MAP = {
    year: { name: '祖上宫', scope: '祖业、长辈、早年环境' },
    month: { name: '父母宫', scope: '父母、兄弟、事业根基' },
    day: { name: '夫妻宫', scope: '自身与配偶（日干为我，日支为配偶位）' },
    hour: { name: '子女宫', scope: '子女、晚辈、晚年与成果' },
  };

  return {
    fourPillars: out,
    palaces: PALACE_MAP,
    dayMaster: {
      gan: pillars.day.gan,
      index: dayGanIndex,
      element: GAN_WUXING[dayGanIndex],
      yang: GAN_YANG[dayGanIndex],
    },
    shishen: {
      year: out.year.shishen,
      month: out.month.shishen,
      day: '日主',
      hour: out.hour.shishen,
    },
    canggan: {
      year: out.year.canggan, month: out.month.canggan, day: out.day.canggan, hour: out.hour.canggan,
    },
    nayin: { year: out.year.nayin, month: out.month.nayin, day: out.day.nayin, hour: out.hour.nayin },
    // —— 事实层扩展 ——
    relations,
    changsheng,
    zizuo: zizuoInfo,
    xunkong,
    xunkongPositions,
    taiyuan: taiyuanOf(pillars.month.ganIndex, pillars.month.zhiIndex),
    mingGong: mingGong(pillars.year.ganIndex, pillars.month.zhiIndex, pillars.hour.zhiIndex),
    shenGong: shenGong(pillars.year.ganIndex, pillars.month.zhiIndex, pillars.hour.zhiIndex),
    mingGua: mingGua(pillarsRaw.baziYear, src.gender === 'female' ? 'female' : 'male'),
    monthOrder: monthOrderOf(pillars.month.zhiIndex),
    shensha: shenshaList,
    elementCount: stats.counts,
    elementPercent: stats.percent,
    strength: strengthInfo,
    pattern: pattern(pillars, dayGanIndex),
    yongshen: yongshen(dayGanIndex, strengthInfo),
    dayun: dy,
    liunian,
    solarTerms: curJie ? { current: curJie.name, jdUtc: curJie.jdUtc } : null,
    lunar: {
      yearGanzhi: lunar.yearGanzhi,
      zodiac: lunar.zodiac,
      month: lunar.month,
      monthName: lunar.monthName,
      isLeap: lunar.isLeap,
      day: lunar.day,
      dayName: lunar.dayName,
    },
    chengGu: computeChengGu({
      yearGanzhi: lunar.yearGanzhi,
      lunarMonth: lunar.month,
      lunarDay: lunar.day,
      hourZhiIndex: pillars.hour.zhiIndex,
      hourZhi: pillars.hour.zhi,
    }),
    time: {
      jdUtc,
      jdSolar,
      solarHour: pillarsRaw.hourFloat,
      lateZi: pillarsRaw.lateZi,
      tzOffset: dt.tzOffset,
      lon: dt.lon,
      lat: dt.lat,
      cityName: dt.cityName,
      useTrueSolarTime: src.useTrueSolarTime !== false,
    },
  };
}

export const BAZI_ENGINE_VERSION = '1.5.1';
