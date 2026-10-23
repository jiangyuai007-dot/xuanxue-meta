/**
 * 六爻排盘引擎 —— 确定性，只产事实
 * 支持：时间起卦、数字起卦；装卦（纳甲、六亲、世应、六神）、动爻变卦
 * 规则：八宫卦变（一世至归魂）、纳甲歌、六亲以卦宫五行为「我」
 */

import { ymdToJdn } from '../core/julian.js';
import { resolveDateTime } from '../core/time.js';
import { toLunar } from '../core/lunar.js';
import { GAN, ZHI, GAN_WUXING, ZHI_WUXING, ganzhiOfJdn, isSheng, isKe } from '../core/ganzhi.js';
import { jdnToYmd } from '../core/julian.js';
import { solarTerm, SOLAR_TERMS } from '../core/astro.js';
import { MONTH_JIE, computePillars, normalizeInput } from './bazi.js';

export const TRIGRAMS = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
/** 爻由下而上，1=阳 0=阴 */
const TRIGRAM_LINES = {
  乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
  巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0],
};
const TRIGRAM_ELEMENT = { 乾: '金', 兑: '金', 离: '火', 震: '木', 巽: '木', 坎: '水', 艮: '土', 坤: '土' };

/** 纳甲：每卦三爻地支（由下而上，内卦） */
const NAJIA = {
  乾: ['子', '寅', '辰'], 坎: ['寅', '辰', '午'], 艮: ['辰', '午', '申'], 震: ['子', '寅', '辰'],
  巽: ['丑', '亥', '酉'], 离: ['卯', '丑', '亥'], 坤: ['未', '巳', '卯'], 兑: ['巳', '卯', '丑'],
};

/** 纳甲外卦：四五六爻地支（由下而上）。纳甲歌内外有别，如乾内 子寅辰、乾外 午申戌 */
const NAJIA_OUT = {
  乾: ['午', '申', '戌'], 坎: ['申', '戌', '子'], 艮: ['戌', '子', '寅'], 震: ['午', '申', '戌'],
  巽: ['未', '巳', '卯'], 离: ['酉', '未', '巳'], 坤: ['丑', '亥', '酉'], 兑: ['亥', '酉', '未'],
};

/** 六十四卦名表 [上卦][下卦]，顺序 乾兑离震巽坎艮坤 */
const GUA_NAMES = {
  乾: ['乾为天', '天泽履', '天火同人', '天雷无妄', '天风姤', '天水讼', '天山遁', '天地否'],
  兑: ['泽天夬', '兑为泽', '泽火革', '泽雷随', '泽风大过', '泽水困', '泽山咸', '泽地萃'],
  离: ['火天大有', '火泽睽', '离为火', '火雷噬嗑', '火风鼎', '火水未济', '火山旅', '火地晋'],
  震: ['雷天大壮', '雷泽归妹', '雷火丰', '震为雷', '雷风恒', '雷水解', '雷山小过', '雷地豫'],
  巽: ['风天小畜', '风泽中孚', '风火家人', '风雷益', '巽为风', '风水涣', '风山渐', '风地观'],
  坎: ['水天需', '水泽节', '水火既济', '水雷屯', '水风井', '坎为水', '水山蹇', '水地比'],
  艮: ['山天大畜', '山泽损', '山火贲', '山雷颐', '山风蛊', '山水蒙', '艮为山', '山地剥'],
  坤: ['地天泰', '地泽临', '地火明夷', '地雷复', '地风升', '地水师', '地山谦', '坤为地'],
};

const GONG_ELEMENT = { 乾: '金', 坎: '水', 艮: '土', 震: '木', 巽: '木', 离: '火', 坤: '土', 兑: '金' };
const LIUSHEN_CYCLE = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
const LIUSHEN_BASE = { 0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5 };

/** 纳甲天干：内外卦各自所纳天干（乾纳甲壬、坤纳乙癸，余卦内外同干） */
const TRIGRAM_GAN_IN = { 乾: '甲', 坤: '乙', 震: '庚', 巽: '辛', 坎: '戊', 离: '己', 艮: '丙', 兑: '丁' };
const TRIGRAM_GAN_OUT = { 乾: '壬', 坤: '癸', 震: '庚', 巽: '辛', 坎: '戊', 离: '己', 艮: '丙', 兑: '丁' };

/** 生成八宫六十四卦索引表：key = "上卦,下卦" */
function buildGuaTable() {
  const table = {};
  for (const gong of TRIGRAMS) {
    const base = [...TRIGRAM_LINES[gong], ...TRIGRAM_LINES[gong]]; // 0..5
    const defs = [
      { gen: '本宫', flip: [], shi: 5 },
      { gen: '一世', flip: [0], shi: 0 },
      { gen: '二世', flip: [0, 1], shi: 1 },
      { gen: '三世', flip: [0, 1, 2], shi: 2 },
      { gen: '四世', flip: [0, 1, 2, 3], shi: 3 },
      { gen: '五世', flip: [0, 1, 2, 3, 4], shi: 4 },
      { gen: '游魂', flip: [0, 1, 2, 3, 4, 3], shi: 3 },
      { gen: '归魂', flip: [0, 1, 2, 3, 4, 3, 0, 1, 2], shi: 2 },
    ];
    for (const d of defs) {
      const lines = [...base];
      for (const f of d.flip) lines[f] = 1 - lines[f];
      const upper = trigramFromLines(lines.slice(3, 6));
      const lower = trigramFromLines(lines.slice(0, 3));
      const key = `${upper},${lower}`;
      if (!table[key]) {
        table[key] = { gong, generation: d.gen, shi: d.shi, upper, lower };
      }
    }
  }
  return table;
}

function trigramFromLines(lines) {
  for (const [name, l] of Object.entries(TRIGRAM_LINES)) {
    if (l[0] === lines[0] && l[1] === lines[1] && l[2] === lines[2]) return name;
  }
  return '乾';
}

const GUA_TABLE = buildGuaTable();

function guaInfo(upper, lower) {
  const key = `${upper},${lower}`;
  const meta = GUA_TABLE[key];
  const lines = [...TRIGRAM_LINES[lower], ...TRIGRAM_LINES[upper]];
  return {
    upper,
    lower,
    name: GUA_NAMES[upper][TRIGRAMS.indexOf(lower)],
    lines,
    gong: meta ? meta.gong : upper,
    generation: meta ? meta.generation : '本宫',
    shiIndex: meta ? meta.shi : 5,
  };
}

/** 六亲：以卦宫五行为「我」，与爻支五行比较 */
function liuqinOf(gongElement, zhiElement) {
  if (gongElement === zhiElement) return '兄弟';
  if (isSheng(zhiElement, gongElement)) return '父母'; // 生我
  if (isSheng(gongElement, zhiElement)) return '子孙'; // 我生
  if (isKe(zhiElement, gongElement)) return '官鬼'; // 克我
  return '妻财'; // 我克
}

/** 旺相休囚死：以月建五行为当令者 */
function wangshuai(yueElement, zhiElement) {
  if (yueElement === zhiElement) return '旺';
  if (isSheng(yueElement, zhiElement)) return '相';
  if (isSheng(zhiElement, yueElement)) return '休';
  if (isKe(yueElement, zhiElement)) return '死';
  return '囚';
}

/** 旬空：返回空亡的两个地支索引 */
export function xunkongOf(ganzhiIndex) {
  const head = Math.floor(ganzhiIndex / 10) * 10;
  return [(head + 10) % 12, (head + 11) % 12];
}

/** 装卦 */
function zhuangGua(upper, lower, dongLines, riGanIndex, yueElement) {
  const info = guaInfo(upper, lower);
  const lines = [...info.lines];
  const changedLines = [...lines];
  for (const d of dongLines) {
    if (d >= 0 && d <= 5) changedLines[d] = 1 - changedLines[d];
  }
  const bianUpper = trigramFromLines(changedLines.slice(3, 6));
  const bianLower = trigramFromLines(changedLines.slice(0, 3));
  const bian = guaInfo(bianUpper, bianLower);

  const gongEl = GONG_ELEMENT[info.gong];
  const yingIndex = ((info.shiIndex + 3) % 6 + 6) % 6; // 世应相隔三位
  const bianYingIndex = ((bian.shiIndex + 3) % 6 + 6) % 6;
  const shenBase = LIUSHEN_BASE[riGanIndex] ?? 0;
  // 伏神：本宫（纯卦）对应爻的干支与六亲，用于查找本卦所缺六亲
  const fuShen = [0, 1, 2, 3, 4, 5].map((i) => {
    const zhi = i >= 3 ? NAJIA_OUT[info.gong][i - 3] : NAJIA[info.gong][i];
    const zi = ZHI.indexOf(zhi);
    const gan = i >= 3 ? TRIGRAM_GAN_OUT[info.gong] : TRIGRAM_GAN_IN[info.gong];
    return { zhi, zhiIndex: zi, gan, liuqin: liuqinOf(gongEl, ZHI_WUXING[zi]) };
  });

  const lineDetails = lines.map((y, i) => {
    const isUpper = i >= 3;
    const tri = isUpper ? info.upper : info.lower;
    const zhi = isUpper ? NAJIA_OUT[tri][i - 3] : NAJIA[tri][i];
    const zhiIndex = ZHI.indexOf(zhi);
    const zhiEl = ZHI_WUXING[zhiIndex];
    return {
      index: i,
      position: ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'][i],
      yang: y === 1,
      symbol: y === 1 ? '—' : '- -',
      gan: isUpper ? TRIGRAM_GAN_OUT[tri] : TRIGRAM_GAN_IN[tri],
      zhi,
      zhiIndex,
      zhiElement: zhiEl,
      liuqin: liuqinOf(gongEl, zhiEl),
      liushen: LIUSHEN_CYCLE[(shenBase + i) % 6],
      isShi: i === info.shiIndex,
      isYing: i === yingIndex,
      fuZhi: fuShen[i].zhi,
      fuGan: fuShen[i].gan,
      fuLiuqin: fuShen[i].liuqin,
      isDong: dongLines.includes(i),
      changed: changedLines[i],
      wangshuai: wangshuai(yueElement, zhiEl),
      xunkong: false,
      shensha: [],
      yuePo: false,
    };
  });

  // 伏神：只对「本卦所缺六亲」标出，伏在其在本宫纯卦中所在的爻位（与本卦该爻同层）
  // 规则：本宫每爻的六亲若不在本卦六亲集合中，则该六亲为所缺；同缺多个爻位时只取最靠下（先）的一爻
  const presentQin = new Set(lineDetails.map((l) => l.liuqin));
  const seenMissing = new Set();
  for (const l of lineDetails) {
    l.fuMissing = !presentQin.has(l.fuLiuqin);
    l.fuShow = l.fuMissing && !seenMissing.has(l.fuLiuqin);
    if (l.fuShow) seenMissing.add(l.fuLiuqin);
  }

  // —— 变卦装卦：爻画取动爻变化后的 changedLines，爻支按变卦纳甲重排，六亲仍以本卦宫为「我」，六神随本卦 ——
  const bianLines = changedLines.map((y, i) => {
    const isUpper = i >= 3;
    const tri = isUpper ? bian.upper : bian.lower;
    const zhi = isUpper ? NAJIA_OUT[tri][i - 3] : NAJIA[tri][i];
    const zhiIndex = ZHI.indexOf(zhi);
    const zhiEl = ZHI_WUXING[zhiIndex];
    return {
      index: i,
      position: lineDetails[i].position,
      yang: y === 1,
      gan: isUpper ? TRIGRAM_GAN_OUT[tri] : TRIGRAM_GAN_IN[tri],
      zhi,
      zhiIndex,
      zhiElement: zhiEl,
      liuqin: liuqinOf(gongEl, zhiEl),
      liushen: lineDetails[i].liushen,
      isShi: i === bian.shiIndex,
      isYing: i === bianYingIndex,
      isDong: dongLines.includes(i),
      fromYang: lineDetails[i].yang,
    };
  });

  return { ben: info, bian, lines: lineDetails, bianLines, shiIndex: info.shiIndex, yingIndex };
}

/** 卦身：阳世从子起初爻顺数至世爻，阴世从午起 */
function guaShenOf(lines, shiIndex) {
  const start = lines[shiIndex].yang ? 0 : 6; // 子=0 / 午=6
  const zhiIndex = (start + shiIndex) % 12;
  return { zhi: ZHI[zhiIndex], zhiIndex, source: `阳世从子起、阴世从午起，顺数至${lines[shiIndex].position}（${lines[shiIndex].yang ? '阳' : '阴'}世）得${ZHI[zhiIndex]}` };
}

// ==================================================================
// 六爻神煞：以日辰/月建/年君为锚，落在本卦爻位者标注爻位
// ==================================================================

const SANHE_GROUP_OF = (zi) => {
  if ([8, 0, 4].includes(zi)) return 0;  // 申子辰
  if ([2, 6, 10].includes(zi)) return 1; // 寅午戌
  if ([5, 9, 1].includes(zi)) return 2;  // 巳酉丑
  return 3;                              // 亥卯未
};

/** 十天干禄神与羊刃（羊刃只论阳干） */
const LU_OF_GAN = { 0: 2, 1: 3, 2: 4, 3: 5, 4: 4, 5: 5, 6: 8, 7: 9, 8: 10, 9: 11 }; // 甲禄寅…癸禄子（索引）
const YANG_REN_OF_GAN = { 0: 3, 2: 6, 4: 6, 6: 9, 8: 0 }; // 甲刃卯 丙戊刃午 庚刃酉 壬刃子

const TIAN_YI = { 0: [1, 7], 4: [1, 7], 6: [1, 7], 1: [0, 8], 5: [0, 8], 2: [11, 9], 3: [11, 9], 8: [3, 5], 9: [3, 5], 7: [2, 6] };
const WEN_CHANG = { 0: 5, 1: 6, 2: 8, 3: 9, 4: 8, 5: 9, 6: 11, 7: 0, 8: 2, 9: 3 };

/** 孤辰寡宿（按年支三会组） */
const GUAN_GUA = (yearZi) => {
  if ([11, 0, 1].includes(yearZi)) return { gu: 2, gua: 10 };
  if ([2, 3, 4].includes(yearZi)) return { gu: 5, gua: 1 };
  if ([5, 6, 7].includes(yearZi)) return { gu: 8, gua: 4 };
  return { gu: 11, gua: 7 };
};

/** 月德天干：寅午戌丙 申子辰壬 亥卯未甲 巳酉丑庚；天德（支/干混排）按月序 */
const YUE_DE_GAN = { 1: 2, 6: 2, 7: 2, 0: 8, 5: 8, 10: 8, 3: 0, 4: 0, 11: 0, 2: 6, 8: 6, 9: 6 };
const TIAN_DE_BY_MONTH = { 1: ['gan', 3], 2: ['zhi', 8], 3: ['gan', 8], 4: ['gan', 7], 5: ['zhi', 11], 6: ['gan', 0], 7: ['gan', 9], 8: ['zhi', 2], 9: ['gan', 2], 10: ['gan', 1], 11: ['zhi', 5], 12: ['gan', 6] };

function computeLiuyaoShensha(ctx) {
  const { lines, dayGz, monthZhiIndex, yearZhiIndex, dayGanIndex } = ctx;
  const out = [];
  const zhiInGua = (zi) => {
    const li = lines.findIndex((l) => l.zhiIndex === zi);
    return li >= 0 ? li : null;
  };
  const ganInGua = (gi) => {
    const li = lines.findIndex((l) => GAN.indexOf(l.gan) === gi);
    return li >= 0 ? li : null;
  };
  const push = (name, anchor, target, source) => {
    const entry = { name, anchor, source };
    if (typeof target.zhiIndex === 'number') {
      entry.zhi = ZHI[target.zhiIndex];
      entry.lineIndex = zhiInGua(target.zhiIndex);
    } else {
      entry.gan = GAN[target.ganIndex];
      entry.lineIndex = ganInGua(target.ganIndex);
    }
    out.push(entry);
  };

  // —— 三合组类（日辰为主，年君为辅） ——
  const SANHE_SETS = [
    { name: '驿马', arr: [2, 8, 11, 5], src: '申子辰马在寅、寅午戌马在申、巳酉丑马在亥、亥卯未马在巳' },
    { name: '桃花', arr: [9, 3, 6, 0], src: '申子辰在酉、寅午戌在卯、巳酉丑在午、亥卯未在子（咸池）' },
    { name: '将星', arr: [0, 6, 9, 3], src: '三合帝旺之位：申子辰见子、寅午戌见午、巳酉丑见酉、亥卯未见卯' },
    { name: '华盖', arr: [4, 10, 1, 7], src: '三合墓库之位：申子辰见辰、寅午戌见戌、巳酉丑见丑、亥卯未见未' },
    { name: '劫煞', arr: [5, 11, 2, 8], src: '三合局五行绝位：申子辰劫在巳、寅午戌劫在亥、巳酉丑劫在寅、亥卯未劫在申' },
    { name: '灾煞', arr: [6, 0, 3, 9], src: '三合局将星对冲：申子辰灾在午、寅午戌灾在子、巳酉丑灾在卯、亥卯未灾在酉' },
  ];
  for (const s of SANHE_SETS) {
    push(s.name, '日辰', { zhiIndex: s.arr[SANHE_GROUP_OF(dayGz.zhiIndex)] }, s.src);
    if (yearZhiIndex !== undefined && yearZhiIndex !== dayGz.zhiIndex) {
      push(s.name + '（年）', '年君', { zhiIndex: s.arr[SANHE_GROUP_OF(yearZhiIndex)] }, s.src);
    }
  }

  // —— 日干类 ——
  for (const zi of TIAN_YI[dayGanIndex] || []) {
    push('天乙贵人', '日干', { zhiIndex: zi }, '甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，辛逢虎马');
  }
  push('文昌', '日干', { zhiIndex: WEN_CHANG[dayGanIndex] }, '甲乙巳午报君知，丙戊申宫丁己鸡，庚猪辛鼠壬逢虎，癸人见卯入云梯');
  push('禄神', '日干', { zhiIndex: LU_OF_GAN[dayGanIndex] }, '甲禄到寅宫，乙禄居卯位，丙戊禄在巳，丁己禄居午，庚禄居申位，辛禄到酉宫，壬禄亥中藏，癸禄在子位');
  if (YANG_REN_OF_GAN[dayGanIndex] !== undefined) {
    push('羊刃', '日干', { zhiIndex: YANG_REN_OF_GAN[dayGanIndex] }, '阳干刃在禄前一位：甲刃在卯、丙戊刃在午、庚刃在酉、壬刃在子');
  }

  // —— 月建类 ——
  const mOrder = (((monthZhiIndex - 2) % 12) + 12) % 12 + 1;
  push('天医', '月建', { zhiIndex: (monthZhiIndex + 11) % 12 }, '天医乃月支前一位之支（常法），主医药、疗愈');
  const yueDe = YUE_DE_GAN[mOrder];
  push('月德', '月建', { ganIndex: yueDe }, '寅午戌月在丙，申子辰月在壬，亥卯未月在甲，巳酉丑月在庚');
  const td = TIAN_DE_BY_MONTH[mOrder];
  push('天德', '月建', td[0] === 'gan' ? { ganIndex: td[1] } : { zhiIndex: td[1] }, '正丁二申三壬四辛，五亥六甲七癸八寅，九丙十乙十一巳，十二庚（天德）');

  // —— 年君类 ——
  if (yearZhiIndex !== undefined) {
    push('丧门', '年君', { zhiIndex: (yearZhiIndex + 2) % 12 }, '丧门为太岁前二辰');
    push('吊客', '年君', { zhiIndex: (yearZhiIndex + 10) % 12 }, '吊客为太岁后二辰');
    const gg = GUAN_GUA(yearZhiIndex);
    push('孤辰', '年君', { zhiIndex: gg.gu }, '亥子丑人见寅为孤，寅卯辰见巳，巳午未见申，申酉戌见亥');
    push('寡宿', '年君', { zhiIndex: gg.gua }, '亥子丑人见戌为寡，寅卯辰见丑，巳午未见辰，申酉戌见未');
  }

  return out;
}

const CATEGORY_YONGSHEN = {
  career: { yongshen: '官鬼', note: '问事业以官鬼为用神，兼看父母（文书、单位）' },
  wealth: { yongshen: '妻财', note: '问财运以妻财为用神，忌兄弟夺财' },
  relationship: { yongshen: '妻财', note: '问感情：男以妻财为用，女以官鬼为用' },
  study: { yongshen: '父母', note: '问学业考试以父母为用神' },
  health: { yongshen: '子孙', note: '问健康以子孙为医药、忌官鬼过旺' },
  travel: { yongshen: '妻财', note: '问出行以妻财为用，兼看驿马' },
  general: { yongshen: '官鬼', note: '通用：先看世爻旺衰，再取所用六亲' },
};

/**
 * 主入口
 */
export function computeLiuyao(input) {
  const src = normalizeInput(input);
  const dt = resolveDateTime(src);
  const lunar = toLunar(dt.jdUtc, dt.tzOffset);
  const dayNumber = Math.floor(dt.jdSolar + 0.5);
  const riGz = ganzhiOfJdn(dayNumber);

  // 月建：以节气月（地支）
  const gy = jdnToYmd(Math.floor(dt.jdUtc + 0.5)).year;
  const y0 = gy;
  let curJie = null;
  const jieList = [];
  for (const y of [y0 - 1, y0, y0 + 1]) {
    for (const idx of MONTH_JIE) jieList.push(solarTerm(y, idx));
  }
  jieList.sort((a, b) => a.jdUtc - b.jdUtc);
  for (const t of jieList) {
    if (t.jdUtc <= dt.jdUtc) curJie = t;
    else break;
  }
  const nextJieInfo = jieList.find((t) => t.jdUtc > dt.jdUtc) || null;
  const monthOrder = curJie ? MONTH_JIE.indexOf(curJie.index) + 1 : 1;
  const yueZhiIndex = (monthOrder + 1) % 12;
  const yueZhi = ZHI[yueZhiIndex];
  const yueElement = ZHI_WUXING[yueZhiIndex];

  // 时辰地支
  const solarFrac = dt.jdSolar + 0.5;
  let h = (solarFrac - Math.floor(solarFrac)) * 24;
  let lateZi = false;
  if (h >= 23) {
    lateZi = true;
    h -= 24;
  }
  const hourZhiIndex = lateZi ? 0 : Math.floor((h + 1) / 2) % 12;

  // 起卦
  let upper, lower, dongLines;
  let method = input.method || 'time';

  /** 由整数种子确定性派生六爻值（6老阴 7少阳 8少阴 9老阳）→ 动爻 0~6 个 */
  const deriveLines = (seedFn) => Array.from({ length: 6 }, (_, i) => 6 + (Math.abs(Math.floor(seedFn(i))) % 4));
  const toYangDong = (vals) => {
    // 必须产出 0/1 数字（trigramFromLines 用 === 与 TRIGRAM_LINES 的 0/1 严格比对；
    // 若返回布尔，1===false 恒 false，所有卦都会落到兜底「乾」——历史 bug）
    const yang = vals.map((v) => (v === 7 || v === 9 ? 1 : 0));
    const dong = vals.map((v, i) => (v === 6 || v === 9 ? i : -1)).filter((i) => i >= 0);
    return { yang, dong };
  };

  if (method === 'coin' || Array.isArray(input.lines)) {
    // 铜钱摇卦/手动指定：每爻独立定阴阳动静，动爻 0~6 个
    method = 'coin';
    const vals = Array.isArray(input.lines) ? input.lines.map(Number).filter((v) => [6, 7, 8, 9].includes(v)) : [];
    if (!vals.length && input.method === 'auto') {
      // 自动起卦：随机六爻
      for (let i = 0; i < 6; i++) {
        const heads = (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1);
        vals.push(heads + 6);
      }
    }
    while (vals.length < 6) {
      const heads = (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1);
      vals.push(heads + 6); // 0→6(老阴·动) 1→7(少阳) 2→8(少阴) 3→9(老阳·动)
    }
    const { yang, dong } = toYangDong(vals);
    dongLines = dong;
    upper = trigramFromLines(yang.slice(3, 6));
    lower = trigramFromLines(yang.slice(0, 3));
  } else if (method === 'name' && input.guaName) {
    // 卦名起卦：选本卦 + 变卦；两卦相同则判定为静卦，不同则以差异爻为动爻
    method = 'name';
    const findGua = (nm) => {
      for (const [up, arr] of Object.entries(GUA_NAMES)) {
        const li = arr.indexOf(String(nm).trim());
        if (li >= 0) return { up, low: TRIGRAMS[li] };
      }
      throw new Error(`未知卦名：${nm}`);
    };
    const benFound = findGua(input.guaName);
    upper = benFound.up;
    lower = benFound.low;
    const bianName = String(input.bianGuaName || '').trim();
    if (!bianName || bianName === String(input.guaName).trim()) {
      dongLines = []; // 本变同卦 → 静卦
    } else {
      const bianFound = findGua(bianName);
      const benL = [...TRIGRAM_LINES[lower], ...TRIGRAM_LINES[upper]];
      const bianL = [...TRIGRAM_LINES[bianFound.low], ...TRIGRAM_LINES[bianFound.up]];
      dongLines = benL.map((y, i) => (y !== bianL[i] ? i : -1)).filter((i) => i >= 0);
    }
  } else if (method === 'number' && Array.isArray(input.numbers) && input.numbers.length >= 2) {
    // 数字起卦1（两数）：上下卦按传统取余，动爻由两数混合派生六爻（0~6 个动爻）
    const n1 = Math.abs(Math.floor(input.numbers[0]));
    const n2 = Math.abs(Math.floor(input.numbers[1]));
    upper = TRIGRAMS[n1 % 8];
    lower = TRIGRAMS[n2 % 8];
    const { dong } = toYangDong(deriveLines((i) => n1 * (i + 3) + n2 * (i + 5) + i * 7 + n1 + n2));
    dongLines = dong;
  } else if (method === 'number2' && Array.isArray(input.numbers) && input.numbers.length >= 2) {
    // 数字起卦2（三数）：前两数定上下卦，第三数参入派生动爻
    const n1 = Math.abs(Math.floor(input.numbers[0]));
    const n2 = Math.abs(Math.floor(input.numbers[1]));
    const n3 = input.numbers[2] ? Math.abs(Math.floor(input.numbers[2])) : 1;
    upper = TRIGRAMS[n1 % 8];
    lower = TRIGRAMS[n2 % 8];
    const { dong } = toYangDong(deriveLines((i) => n1 * (i + 2) + n2 * (i + 6) + n3 * (i + 3) + n3));
    dongLines = dong;
  } else {
    // 时间起卦（六爻式）：上下卦按梅花取余，动爻由年月日时混合派生六爻（0~6 个动爻）
    method = 'time';
    const yearZhiIndex = ((lunar.gy - 4) % 12 + 12) % 12;
    const yearNum = yearZhiIndex + 1;
    const monthNum = lunar.month;
    const dayNum = lunar.day;
    const hourNum = hourZhiIndex + 1;
    const s1 = yearNum + monthNum + dayNum;
    const s2 = s1 + hourNum;
    upper = TRIGRAMS[s1 % 8];
    lower = TRIGRAMS[s2 % 8];
    const { dong } = toYangDong(deriveLines((i) => s1 * (i + 3) + s2 * (i + 5) + hourNum * (i + 1) + i * 11));
    dongLines = dong;
  }

  const z = zhuangGua(upper, lower, dongLines, riGz.ganIndex, yueElement);
  const xunkong = xunkongOf(riGz.index);
  for (const l of z.lines) l.xunkong = xunkong.includes(l.zhiIndex);

  // —— 四柱干支（与八字共用同一套节气/真太阳时算法）与各柱空亡 ——
  const pillarsRaw = computePillars(dt.jdUtc, dt.jdSolar);
  const siZhu = {};
  for (const k of ['year', 'month', 'day', 'hour']) {
    const p = pillarsRaw[k];
    siZhu[k] = {
      name: p.name, gan: p.gan, zhi: p.zhi, index: p.index,
      xunkong: xunkongOf(p.index).map((i) => ZHI[i]),
    };
  }

  // —— 卦身 ——
  const guaShen = guaShenOf(z.lines, z.shiIndex);

  // —— 月破：爻支冲月建 ——
  const chongPairs = { 0: 6, 6: 0, 1: 7, 7: 1, 2: 8, 8: 2, 3: 9, 9: 3, 4: 10, 10: 4, 5: 11, 11: 5 };
  for (const l of z.lines) l.yuePo = chongPairs[l.zhiIndex] === yueZhiIndex;
  for (const l of z.bianLines) l.yuePo = chongPairs[l.zhiIndex] === yueZhiIndex;

  // —— 神煞（以日辰/月建/年君为锚；落在卦中爻位者回填到爻） ——
  const shenshaList = computeLiuyaoShensha({
    lines: z.lines,
    dayGz: riGz,
    monthZhiIndex: yueZhiIndex,
    yearZhiIndex: pillarsRaw.year.zhiIndex,
    dayGanIndex: riGz.ganIndex,
  });
  for (const s of shenshaList) {
    if (s.lineIndex !== null && s.lineIndex !== undefined && !s.name.includes('（年）')) {
      z.lines[s.lineIndex].shensha.push(s.name);
    }
  }

  const category = input.category || 'general';
  const ys = CATEGORY_YONGSHEN[category] || CATEGORY_YONGSHEN.general;
  const shiLine = z.lines[z.shiIndex];
  const ysLines = z.lines.filter((l) => l.liuqin === ys.yongshen);

  return {
    method,
    question: input.question || '',
    category,
    benGua: {
      name: z.ben.name,
      upper: z.ben.upper,
      lower: z.ben.lower,
      gong: z.ben.gong,
      generation: z.ben.generation,
      gongElement: GONG_ELEMENT[z.ben.gong],
      symbol: z.ben.lines.map((l) => (l ? '▬▬▬' : '▬ ▬')).join(' '),
    },
    bianGua: {
      name: z.bian.name,
      upper: z.bian.upper,
      lower: z.bian.lower,
      gong: z.bian.gong,
      generation: z.bian.generation,
      gongElement: GONG_ELEMENT[z.bian.gong],
      symbol: z.bian.lines.map((l) => (l ? '▬▬▬' : '▬ ▬')).join(' '),
    },
    bianLines: z.bianLines,
    siZhu,
    guaShen,
    shensha: shenshaList,
    dongYao: dongLines.map((i) => ({ index: i, position: z.lines[i].position })),
    lines: z.lines,
    shiYing: {
      shi: z.shiIndex,
      shiPosition: z.lines[z.shiIndex].position,
      ying: z.yingIndex,
      yingPosition: z.lines[z.yingIndex].position,
    },
    yueJian: {
      zhi: yueZhi, zhiIndex: yueZhiIndex, element: yueElement,
      jieName: curJie ? curJie.name : '', jieJd: curJie ? curJie.jdUtc : null,
      nextName: nextJieInfo ? nextJieInfo.name : '', nextJd: nextJieInfo ? nextJieInfo.jdUtc : null,
    },
    riJian: { gan: riGz.gan, zhi: riGz.zhi, ganzhi: riGz.name, index: riGz.index },
    xunkong: xunkong.map((i) => ZHI[i]),
    shiLine,
    yongshen: ys.yongshen,
    yongshenLines: ysLines,
    yongshenNote: ys.note,
    lunar: { yearGanzhi: lunar.yearGanzhi, monthName: lunar.monthName, dayName: lunar.dayName },
    time: { jdUtc: dt.jdUtc, jdSolar: dt.jdSolar, solarHour: h < 0 ? h + 24 : h, lateZi, cityName: dt.cityName },
  };
}

export const LIUYAO_ENGINE_VERSION = '1.4.0';
export { GUA_NAMES, TRIGRAM_LINES, NAJIA, GONG_ELEMENT, TRIGRAM_GAN_IN, TRIGRAM_GAN_OUT };
