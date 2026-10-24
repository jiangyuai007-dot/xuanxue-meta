/**
 * 奇门遁甲排盘引擎 —— 时家奇门 · 转盘/飞盘 · 拆补法/置闰法/茅山法（Phase 2 专业升级版）
 * 确定性排盘，只产事实；吉凶评价为规则化打分，非绝对断言。
 */

import { jdnToYmd } from '../core/julian.js';
import { resolveDateTime } from '../core/time.js';
import { solarTerm, SOLAR_TERMS } from '../core/astro.js';
import { GAN, ZHI, GAN_WUXING, ZHI_WUXING, ganzhiOfJdn, indexOfGanzhi, CANGGAN } from '../core/ganzhi.js';
import { xunkongOf } from './liuyao.js';
import { computePillars, normalizeInput } from './bazi.js';
import { JI_XING, RU_MU, isMenPo, changshengOf, CHANG12_INFO, detectQimenPatterns } from '../core/qimenInfo.js';

const WU_SHU_DUN = { 0: 0, 5: 0, 1: 2, 6: 2, 2: 4, 7: 4, 3: 6, 8: 6, 4: 8, 9: 8 };

/** 局数表：[上元, 中元, 下元]，按 SOLAR_TERMS 索引 */
export const JU_TABLE = {
  23: [1, 7, 4], 0: [2, 8, 5], 1: [3, 9, 6], 2: [8, 5, 2], 3: [9, 6, 3], 4: [1, 7, 4],
  5: [3, 9, 6], 6: [4, 1, 7], 7: [5, 2, 8], 8: [4, 1, 7], 9: [5, 2, 8], 10: [6, 3, 9],
  11: [9, 3, 6], 12: [8, 2, 5], 13: [7, 1, 4], 14: [2, 5, 8], 15: [1, 4, 7], 16: [9, 3, 6],
  17: [7, 1, 4], 18: [6, 9, 3], 19: [5, 8, 2], 20: [6, 9, 3], 21: [5, 8, 2], 22: [4, 7, 1],
};

const PALACE_NAME = { 1: '坎', 2: '坤', 3: '震', 4: '巽', 5: '中', 6: '乾', 7: '兑', 8: '艮', 9: '离' };
const PALACE_ZHI = { 1: ['子'], 2: ['未', '申'], 3: ['卯'], 4: ['辰', '巳'], 5: [], 6: ['戌', '亥'], 7: ['酉'], 8: ['丑', '寅'], 9: ['午'] };
const PALACE_DIR = { 1: '北', 2: '西南', 3: '东', 4: '东南', 5: '中央', 6: '西北', 7: '西', 8: '东北', 9: '南' };

const YI = ['戊', '己', '庚', '辛', '壬', '癸']; // 六仪（对应六旬首）
const DI_SEQ = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙']; // 三奇六仪排布序

const STAR_HOME = { 1: '天蓬', 2: '天芮', 3: '天冲', 4: '天辅', 5: '天禽', 6: '天心', 7: '天柱', 8: '天任', 9: '天英' };
const STAR_ORDER = ['天蓬', '天芮', '天冲', '天辅', '天心', '天柱', '天任', '天英'];
const STAR_HOME8 = [1, 2, 3, 4, 6, 7, 8, 9];
/** 飞盘九星序（按洛书 1..9 本宫星名排列，中五天禽独立参飞） */
const FEI_STAR_ORDER = ['天蓬', '天芮', '天冲', '天辅', '天禽', '天心', '天柱', '天任', '天英'];

const DOOR_HOME = { 1: '休门', 2: '死门', 3: '伤门', 4: '杜门', 5: null, 6: '开门', 7: '惊门', 8: '生门', 9: '景门' };
const DOOR_ORDER = ['休门', '生门', '伤门', '杜门', '景门', '死门', '惊门', '开门'];
/** 飞盘八门序（按洛书八宫 1,2,3,4,6,7,8,9 本位门排列） */
const FEI_DOOR_ORDER = ['休门', '死门', '伤门', '杜门', '开门', '惊门', '生门', '景门'];

const SHEN_YANG = ['值符', '螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'];
const SHEN_YIN = ['值符', '螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'];

const GOOD_DOORS = ['开门', '休门', '生门'];
const GOOD_STARS = ['天心', '天任', '天辅', '天禽'];
const BAD_STARS = ['天蓬', '天芮', '天柱'];
const GOOD_SHEN = ['值符', '太阴', '六合', '九地', '九天'];

const SEQ9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SEQ8 = [1, 2, 3, 4, 6, 7, 8, 9];

function rotate(seq, start, forward, steps = seq.length) {
  const i0 = seq.indexOf(start);
  if (i0 < 0) throw new Error(`宫 ${start} 不在序列中`);
  const n = seq.length;
  return Array.from({ length: steps }, (_, k) => seq[(((i0 + (forward ? k : -k)) % n) + n) % n]);
}

/** 在序列中从 a 到 b 的步数（沿 forward 方向） */
function stepsBetween(seq, a, b, forward) {
  const n = seq.length;
  const ia = seq.indexOf(a);
  const ib = seq.indexOf(b);
  if (ia < 0 || ib < 0) return 0;
  return forward ? ((ib - ia) % n + n) % n : ((ia - ib) % n + n) % n;
}

const MA_XING = { 寅: '申', 午: '申', 戌: '申', 申: '寅', 子: '寅', 辰: '寅', 巳: '亥', 酉: '亥', 丑: '亥', 亥: '巳', 卯: '巳', 未: '巳' };

const PURPOSE = {
  wealth: { name: '求财', doors: ['生门'], note: '求财以生门为主用神，兼看戊（资本）与日干宫' },
  career: { name: '事业谋职', doors: ['开门'], note: '事业以开门为用神，兼看年干宫与日干宫' },
  travel: { name: '出行', doors: ['开门', '生门'], note: '出行以开门、生门方位为宜，忌死门、伤门方' },
  negotiate: { name: '谈判合作', doors: ['开门'], note: '谈判以开门、值符为用，兼看六合（和合）' },
  general: { name: '通用', doors: ['开门', '休门', '生门'], note: '通用看日干宫、时干宫与三吉门方位' },
};

/**
 * 主入口
 */
export function computeQimen(input) {
  const src = normalizeInput(input);
  const dt = resolveDateTime(src);
  const gy = jdnToYmd(Math.floor(dt.jdUtc + 0.5)).year;

  // 当前节气（二十四节气全列）
  const terms = [];
  for (const y of [gy - 1, gy, gy + 1]) {
    for (let i = 0; i < 24; i++) {
      const t = solarTerm(y, i);
      terms.push({ ...t, key: `${y}-${i}` });
    }
  }
  terms.sort((a, b) => a.jdUtc - b.jdUtc);
  let curTerm = null;
  for (const t of terms) {
    if (t.jdUtc <= dt.jdUtc) curTerm = t;
    else break;
  }
  if (!curTerm) throw new Error('无法确定当前节气');
  const nextTerm = terms.find((t) => t.jdUtc > dt.jdUtc) || null;

  // 真太阳时 → 日柱、时柱
  const solarFrac = dt.jdSolar + 0.5;
  let dayNumber = Math.floor(solarFrac);
  let hourFloat = (solarFrac - dayNumber) * 24;
  let lateZi = false;
  if (hourFloat >= 23) {
    lateZi = true;
    dayNumber += 1;
    hourFloat -= 24;
  }
  const riGz = ganzhiOfJdn(dayNumber);
  const hourZhiIndex = lateZi ? 0 : Math.floor((hourFloat + 1) / 2) % 12;
  const hourGanIndex = (WU_SHU_DUN[riGz.ganIndex] + hourZhiIndex) % 10;
  const hourGzIndex = indexOfGanzhi(hourGanIndex, hourZhiIndex);
  const hourGz = { gan: GAN[hourGanIndex], zhi: ZHI[hourZhiIndex], name: GAN[hourGanIndex] + ZHI[hourZhiIndex], index: hourGzIndex };

  // Phase 2 精进：三元与局数 —— 严格区分 拆补法 / 真置闰法（正授·超神·接气·芒种大雪置闰） / 茅山法 / 自选局数
  const juMethod = input.juMethod || 'chaibu';
  const fuTouIndex = Math.floor(riGz.index / 5) * 5;
  const fuTouName = GAN[fuTouIndex % 10] + ZHI[fuTouIndex % 12];
  let yuanIdx = (Math.floor(riGz.index / 5)) % 3;
  let effectiveTermIdx = curTerm.index;
  let zhirunInfo = null;
  let yuanBasis = `拆补法：日柱${riGz.name}，符头${fuTouName}，三元顺推`;

  if (juMethod === 'zhirun') {
    // 置闰法：以甲子(0)、己卯(15)、甲午(30)、己酉(45) 四大符头为上元首日（index % 15 === 0）
    const tzOffset = dt.tzOffset ?? 8;
    const termDayNumber = Math.floor(curTerm.jdUtc + tzOffset / 24 + 0.5);
    const termDayGz = ganzhiOfJdn(termDayNumber);
    const termCycleOffset = termDayGz.index % 15; // 交节当日距最近大符头的天数 (0..14)
    const cycleOffset = riGz.index % 15;          // 当前日距最近大符头的天数 (0..14)
    const shangYuanDay = dayNumber - cycleOffset;
    const shangYuanGz = ganzhiOfJdn(shangYuanDay);
    yuanIdx = Math.floor(cycleOffset / 5);

    // 交节与上元大符头的日差：正值=超神（符头先至），0=正授，负值=接气（节气先至）
    const diffDays = termDayNumber - shangYuanDay;
    let state = '正授';
    let isLeapYuan = false;
    // 芒种(index=8) 或 大雪(index=20) 超神满 9 日及以上时，置闰叠用上一节气（小满=7 / 小雪=19）三元
    if ((curTerm.index === 8 || curTerm.index === 20) && termCycleOffset >= 9 && (dayNumber - (termDayNumber - termCycleOffset)) < 15) {
      effectiveTermIdx = curTerm.index - 1;
      state = '置闰';
      isLeapYuan = true;
    } else if (diffDays > 0) {
      state = `超神${diffDays}日`;
    } else if (diffDays < 0) {
      state = `接气${Math.abs(diffDays)}日`;
    }
    zhirunInfo = {
      state,
      diffDays,
      isLeapYuan,
      shangYuanFuTou: shangYuanGz.name,
      currentFuTou: fuTouName,
      effectiveTerm: SOLAR_TERMS[effectiveTermIdx],
    };
    yuanBasis = isLeapYuan
      ? `置闰法：${curTerm.name}超神满${termCycleOffset}日，置闰叠用${SOLAR_TERMS[effectiveTermIdx]}三元（符头${fuTouName}）`
      : `置闰法：上元符头${shangYuanGz.name}（${state}），本旬符头${fuTouName}`;
  } else if (juMethod === 'maoshan') {
    const daysSince = Math.max(0, Math.floor(dt.jdUtc - curTerm.jdUtc));
    yuanIdx = Math.min(2, Math.floor(daysSince / 5));
    yuanBasis = `茅山法：${curTerm.name}交节后第 ${daysSince + 1} 天，满五日换一元`;
  }

  const yuanName = ['上元', '中元', '下元'][yuanIdx];

  // 阴阳遁与局数
  const ti = effectiveTermIdx;
  let isYang = !(ti >= 11 && ti <= 22);
  const juTable = JU_TABLE[ti] || [1, 7, 4];
  let ju = juTable[yuanIdx];
  if (juMethod === 'custom') {
    const rawJu = Number(input.customJu);
    if (Number.isFinite(rawJu) && Math.abs(rawJu) >= 1 && Math.abs(rawJu) <= 9) {
      ju = Math.floor(Math.abs(rawJu));
    }
    if (input.customYinYang === 'yin' || rawJu < 0) isYang = false;
    else if (input.customYinYang === 'yang' || rawJu > 0) isYang = true;
    yuanBasis = `自选局数：${isYang ? '阳遁' : '阴遁'}${ju}局`;
  }
  const forward = isYang;
  const isFeiPan = input.panType === 'fei';

  // 地盘三奇六仪（转盘与飞盘共用洛书九宫顺逆布戊己庚辛壬癸丁丙乙）
  const diPan = {};
  const seq = rotate(SEQ9, ju, forward, 9);
  seq.forEach((p, i) => {
    diPan[p] = DI_SEQ[i];
  });

  // 旬首（六仪）与值符宫
  const xunShouIdx = Math.floor(hourGzIndex / 10) * 10;
  const xunShouName = GAN[xunShouIdx % 10] + ZHI[xunShouIdx % 12];
  const yi = YI[Math.floor(hourGzIndex / 10)];
  let vfPalace = null;
  for (const p of SEQ9) {
    if (diPan[p] === yi) {
      vfPalace = p;
      break;
    }
  }
  if (vfPalace === null) vfPalace = ju;

  // 时干（甲遁入六仪）
  const shiGanName = hourGz.gan === '甲' ? yi : hourGz.gan;
  let sgPalace = null;
  for (const p of SEQ9) {
    if (diPan[p] === shiGanName) {
      sgPalace = p;
      break;
    }
  }
  if (sgPalace === null) sgPalace = vfPalace;

  // 中宫寄宫：寄坤二宫 / 阳遁寄艮八、阴遁寄坤二
  const jiGong = input.jiGong === 'yangGenYinKun' ? (isYang ? 8 : 2) : 2;
  const jiGongName = input.jiGong === 'yangGenYinKun' ? `阳${isYang ? '遁寄艮八' : '阴遁寄坤二'}` : '寄坤二宫';
  const vfPalace8 = vfPalace === 5 ? jiGong : vfPalace;
  const sgPalace8 = sgPalace === 5 ? jiGong : sgPalace;

  // 时支宫（值使门落宫）
  const hourZhi = ZHI[hourZhiIndex];
  let hourZhiPalace = 1;
  for (const p of SEQ8) {
    if (PALACE_ZHI[p].includes(hourZhi)) {
      hourZhiPalace = p;
      break;
    }
  }
  const zhiShiDoorHome = DOOR_HOME[vfPalace8];

  const tianPan = {};
  const tianStar = {};
  const tianDoor = {};
  const tianShen = {};

  if (isFeiPan) {
    // —— Phase 2：飞盘奇门（九宫洛书顺逆飞布） ——
    // 1. 天盘三奇六仪：从值符六仪 yi 起于时干落宫 sgPalace，按阳顺阴逆沿洛书九宫飞布
    const yiIdx = DI_SEQ.indexOf(yi);
    const feiSeq9 = rotate(SEQ9, sgPalace, forward, 9);
    feiSeq9.forEach((p, k) => {
      tianPan[p] = DI_SEQ[(yiIdx + k) % 9];
    });
    // 2. 天盘九星：九星（含天禽）从值符星 STAR_HOME[vfPalace] 起于时干落宫 sgPalace，按阳顺阴逆沿九宫飞布
    const vfStarName = STAR_HOME[vfPalace];
    const vfStarIdx = FEI_STAR_ORDER.indexOf(vfStarName);
    feiSeq9.forEach((p, k) => {
      tianStar[p] = FEI_STAR_ORDER[(vfStarIdx + (forward ? k : -k) + 9) % 9];
    });
    // 3. 天盘八门：从值使门 zhiShiDoorHome 起于时支宫 hourZhiPalace，按阳顺阴逆沿八宫 SEQ8 飞布
    const zsDoorIdx = FEI_DOOR_ORDER.indexOf(zhiShiDoorHome);
    const feiDoorSeq8 = rotate(SEQ8, hourZhiPalace, forward, 8);
    feiDoorSeq8.forEach((p, k) => {
      tianDoor[p] = FEI_DOOR_ORDER[(zsDoorIdx + (forward ? k : -k) + 8) % 8];
    });
    // 4. 八神：从值符起于 sgPalace8，按阳顺阴逆沿 SEQ8 飞布
    const shenList = isYang ? SHEN_YANG : SHEN_YIN;
    const shenSeq = rotate(SEQ8, sgPalace8, forward, 8);
    shenSeq.forEach((p, i) => {
      tianShen[p] = shenList[i];
    });
  } else {
    // —— 转盘奇门（保持原有精确逻辑） ——
    const offset = stepsBetween(SEQ9, vfPalace, sgPalace, forward);
    for (const p of SEQ9) {
      const n = SEQ9.length;
      const i = SEQ9.indexOf(p);
      const back = SEQ9[(((i - (forward ? offset : -offset)) % n) + n) % n];
      tianPan[p] = diPan[back];
    }

    const zhiFuStarHome = STAR_HOME[vfPalace] === '天禽' ? '天芮' : STAR_HOME[vfPalace];
    const starOffset = stepsBetween(SEQ8, STAR_HOME8[STAR_ORDER.indexOf(zhiFuStarHome)], sgPalace8, forward);
    SEQ8.forEach((p) => {
      const n = SEQ8.length;
      const i = SEQ8.indexOf(p);
      const back = SEQ8[(((i - (forward ? starOffset : -starOffset)) % n) + n) % n];
      tianStar[p] = STAR_HOME[back];
    });

    const doorOffset = stepsBetween(SEQ8, vfPalace8, hourZhiPalace, forward);
    SEQ8.forEach((p) => {
      const n = SEQ8.length;
      const i = SEQ8.indexOf(p);
      const back = SEQ8[(((i - (forward ? doorOffset : -doorOffset)) % n) + n) % n];
      tianDoor[p] = DOOR_HOME[back];
    });

    const shenList = isYang ? SHEN_YANG : SHEN_YIN;
    const shenSeq = rotate(SEQ8, sgPalace8, forward, 8);
    shenSeq.forEach((p, i) => {
      tianShen[p] = shenList[i];
    });
  }

  // 空亡与马星
  const kongWangZhi = xunkongOf(hourGzIndex).map((i) => ZHI[i]);
  const dayKongWang = xunkongOf(riGz.index).map((i) => ZHI[i]);
  const maZhi = MA_XING[hourZhi];
  let maPalace = null;
  for (const p of SEQ8) {
    if (PALACE_ZHI[p].includes(maZhi)) {
      maPalace = p;
      break;
    }
  }

  // 组装九宫
  const rawPillars = computePillars(dt.jdUtc, dt.jdSolar);
  const markGans = ['year', 'month', 'day', 'hour'].map((k) => {
    const label = { year: '年', month: '月', day: '日', hour: '时' }[k];
    const p = rawPillars[k];
    const gan = p.gan === '甲' ? YI[Math.floor(p.index / 10)] : p.gan;
    return { label, gan };
  });
  const tianMarks = {};
  const diMarks = {};
  for (const p of SEQ9) tianMarks[p] = [];
  for (const p of SEQ9) diMarks[p] = [];
  for (const m of markGans) {
    for (const p of SEQ9) {
      if (tianPan[p] === m.gan) tianMarks[p].push(m.label);
      if (diPan[p] === m.gan) diMarks[p].push(m.label);
    }
  }

  const palaces = SEQ9.map((p) => {
    const isMid = p === 5;
    const zhiList = PALACE_ZHI[p];
    const kw = isMid ? false : zhiList.some((z) => kongWangZhi.includes(z));
    const dkw = isMid ? false : zhiList.some((z) => dayKongWang.includes(z));
    const tian = isMid ? (isFeiPan ? tianPan[5] : null) : tianPan[p];
    const door = isMid ? null : tianDoor[p];
    const tianIdx = tian ? GAN.indexOf(tian) : -1;
    const cs = tian && !isMid ? changshengOf(tianIdx, ZHI.indexOf(zhiList[0])) : '';
    return {
      id: p,
      name: PALACE_NAME[p],
      direction: PALACE_DIR[p],
      zhi: zhiList,
      isMiddle: isMid,
      diPan: diPan[p],
      tianPan: tian,
      star: isMid ? (isFeiPan ? tianStar[5] : '天禽') : tianStar[p],
      starExtra: !isFeiPan && p === 2 ? '（天禽寄坤）' : '',
      door,
      shen: isMid ? null : tianShen[p],
      kongWang: kw,
      dayKongWang: dkw,
      maXing: p === maPalace,
      isZhiFu: p === sgPalace8,
      isZhiShi: p === hourZhiPalace,
      // —— 四害 ——
      jiXing: !isMid && !!JI_XING[tian] && JI_XING[tian] === p,
      ruMu: !isMid && RU_MU[tian] === p,
      menPo: !isMid && isMenPo(door, p),
      // —— 天盘干十二长生（取宫首地支） ——
      changsheng: cs,
      changshengNote: cs ? CHANG12_INFO[cs] || '' : '',
      // —— 年月日时干标记 ——
      tianMarks: tianMarks[p],
      diMarks: diMarks[p],
      patterns: [],
    };
  });

  // Phase 2 新增：自动识别 20+ 奇门经典吉凶格局，并挂载到各宫与全局
  const patternResult = detectQimenPatterns({
    palaces,
    riGan: riGz.gan,
    shiGan: hourGz.gan,
    shiGanzhi: hourGz.name,
    zhiShiPalace: hourZhiPalace,
    zhiFuPalace: sgPalace8,
  });
  for (const p of palaces) {
    p.patterns = patternResult.byPalace[p.id] || [];
  }

  // 用神与吉凶打分
  const purpose = PURPOSE[input.purpose] || PURPOSE.general;
  const scoreOf = (p) => {
    if (p.isMiddle) return null;
    let s = 0;
    const why = [];
    if (GOOD_DOORS.includes(p.door)) {
      s += 2;
      why.push(`${p.door}为吉门`);
    } else {
      s -= 1;
      why.push(`${p.door}非吉门`);
    }
    if (GOOD_STARS.includes(p.star)) {
      s += 1;
      why.push(`${p.star}为吉星`);
    } else if (BAD_STARS.includes(p.star)) {
      s -= 1;
      why.push(`${p.star}为凶星`);
    }
    if (GOOD_SHEN.includes(p.shen)) {
      s += 1;
      why.push(`${p.shen}为吉神`);
    } else {
      s -= 1;
      why.push(`${p.shen}为凶神`);
    }
    if (p.kongWang) {
      s -= 2;
      why.push('时旬空亡，力量减弱');
    }
    if (p.maXing) {
      s += 1;
      why.push('马星所在，主动');
    }
    for (const pat of p.patterns || []) {
      if (pat.type === '吉') {
        s += 1;
        why.push(`成「${pat.name}」吉格`);
      } else if (pat.type === '凶') {
        s -= 1;
        why.push(`逢「${pat.name}」凶格`);
      }
    }
    return { score: s, why };
  };

  const ranked = palaces
    .filter((p) => !p.isMiddle)
    .map((p) => ({ ...p, eval: scoreOf(p) }))
    .sort((a, b) => b.eval.score - a.eval.score);

  const targetPalaces = ranked.filter((p) => purpose.doors.includes(p.door));
  const best = targetPalaces.length ? targetPalaces[0] : ranked[0];

  return {
    panType: isYang ? '阳遁' : '阴遁',
    panMethod: isFeiPan ? 'fei' : 'zhuan',
    ju,
    juName: `${isYang ? '阳' : '阴'}遁${ju}局`,
    yuan: yuanName,
    juMethodName: juMethod === 'custom' ? '自选局数' : juMethod === 'zhirun' ? '置闰法' : juMethod === 'maoshan' ? '茅山法' : '拆补法',
    yuanBasis: `${yuanBasis}，${yuanName}`,
    zhirunInfo,
    jiGongName,
    solarTerm: curTerm.name,
    solarTermJdUtc: curTerm.jdUtc,
    nextTerm: nextTerm ? { name: nextTerm.name, jdUtc: nextTerm.jdUtc } : null,
    xunShou: xunShouName,
    xunShouYi: yi,
    zhiFu: { star: STAR_HOME[vfPalace], palace: sgPalace8, palaceName: PALACE_NAME[sgPalace8], midNote: sgPalace === 5 ? '时干落中宫，寄坤宫论' : null },
    zhiShi: { door: zhiShiDoorHome, palace: hourZhiPalace, palaceName: PALACE_NAME[hourZhiPalace] },
    palaces,
    patterns: patternResult.all,
    kongWang: kongWangZhi,
    dayKongWang,
    maXing: { zhi: maZhi, palace: maPalace, palaceName: maPalace ? PALACE_NAME[maPalace] : null },
    pillars: {
      ri: { ganzhi: riGz.name, gan: riGz.gan, zhi: riGz.zhi },
      shi: { ganzhi: hourGz.name, gan: hourGz.gan, zhi: hourGz.zhi },
    },
    fourPillars: (() => {
      const raw = computePillars(dt.jdUtc, dt.jdSolar);
      const out = {};
      for (const k of ['year', 'month', 'day', 'hour']) {
        out[k] = { name: raw[k].name, gan: raw[k].gan, zhi: raw[k].zhi, canggan: CANGGAN[raw[k].zhi] || [], xunkong: xunkongOf(raw[k].index).map((i) => ZHI[i]).join('') };
      }
      return out;
    })(),
    purpose: { key: input.purpose || 'general', ...purpose },
    favorable: {
      palace: best.id,
      palaceName: best.name,
      direction: best.direction,
      door: best.door,
      star: best.star,
      score: best.eval.score,
      why: best.eval.why,
    },
    ranking: ranked.map((p) => ({
      palace: p.id,
      palaceName: p.name,
      direction: p.direction,
      door: p.door,
      star: p.star,
      shen: p.shen,
      score: p.eval.score,
      why: p.eval.why,
    })),
    time: {
      jdUtc: dt.jdUtc,
      jdSolar: dt.jdSolar,
      solarHour: hourFloat < 0 ? hourFloat + 24 : hourFloat,
      lateZi,
      cityName: dt.cityName,
    },
  };
}

export const QIMEN_ENGINE_VERSION = '1.5.0';
export { PALACE_NAME, PALACE_DIR };
