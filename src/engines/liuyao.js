/**
 * 六爻排盘引擎 —— 确定性，只产事实（v2.7 36项全套传统六爻神煞升级版：含香闺、床帐、世身、胎爻、游都、飞符等）
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
  const presentQin = new Set(lineDetails.map((l) => l.liuqin));
  const seenMissing = new Set();
  for (const l of lineDetails) {
    l.fuMissing = !presentQin.has(l.fuLiuqin);
    l.fuShow = l.fuMissing && !seenMissing.has(l.fuLiuqin);
    if (l.fuShow) seenMissing.add(l.fuLiuqin);
  }

  // —— 变卦装卦 ——
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
// 六爻全套神煞（36 项，覆盖传统京房/卜筮正宗/热卜全表：含香闺、床帐、世身、胎爻、游都、飞符等）
// ==================================================================

const SANHE_GROUP_OF = (zi) => {
  if ([8, 0, 4].includes(zi)) return 0;  // 申子辰
  if ([2, 6, 10].includes(zi)) return 1; // 寅午戌
  if ([5, 9, 1].includes(zi)) return 2;  // 巳酉丑
  return 3;                              // 亥卯未
};

/** 十天干禄神与十干羊刃 */
const LU_OF_GAN = { 0: 2, 1: 3, 2: 5, 3: 6, 4: 5, 5: 6, 6: 8, 7: 9, 8: 11, 9: 0 }; // 甲寅 乙卯 丙戊巳 丁己午 庚申 辛酉 壬亥 癸子
const YANG_REN_OF_GAN = { 0: 3, 1: 2, 2: 6, 3: 5, 4: 6, 5: 5, 6: 9, 7: 8, 8: 0, 9: 11 }; // 甲卯 乙寅 丙戊午 丁己巳 庚酉 辛申 壬子 癸亥

/** 天乙贵人（首支与次支按传统起例排列：六辛逢马虎 -> 午、寅） */
const TIAN_YI = {
  0: [1, 7], 4: [1, 7], 6: [1, 7],
  1: [0, 8], 5: [0, 8],
  2: [11, 9], 3: [11, 9],
  8: [3, 5], 9: [3, 5],
  7: [6, 2],
};
const WEN_CHANG = { 0: 5, 1: 6, 2: 8, 3: 9, 4: 8, 5: 9, 6: 11, 7: 0, 8: 2, 9: 3 };

/** 游都与飞符（按日干查） */
const YOU_DU_OF_GAN = { 0: 1, 5: 1, 1: 0, 6: 0, 2: 2, 7: 2, 3: 5, 8: 5, 4: 8, 9: 8 }; // 甲己丑 乙庚子 丙辛寅 丁壬巳 戊癸申
const FEI_FU_OF_GAN = { 0: 5, 1: 4, 2: 3, 3: 2, 4: 1, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10 }; // 甲巳乙辰丙卯丁寅戊丑，己午庚未辛申壬酉癸戌

/** 孤辰寡宿（按三会方局） */
const GUAN_GUA = (zi) => {
  if ([11, 0, 1].includes(zi)) return { gu: 2, gua: 10 };
  if ([2, 3, 4].includes(zi)) return { gu: 5, gua: 1 };
  if ([5, 6, 7].includes(zi)) return { gu: 8, gua: 4 };
  return { gu: 11, gua: 7 };
};

/** 月德天干：寅午戌丙 申子辰壬 亥卯未甲 巳酉丑庚；天德按月序 */
const YUE_DE_GAN = { 1: 2, 5: 2, 9: 2, 7: 8, 11: 8, 3: 8, 10: 0, 2: 0, 6: 0, 4: 6, 8: 6, 12: 6 };
const TIAN_DE_BY_MONTH = {
  1: ['gan', 3], 2: ['zhi', 8], 3: ['gan', 8], 4: ['gan', 7],
  5: ['zhi', 11], 6: ['gan', 0], 7: ['gan', 9], 8: ['zhi', 2],
  9: ['gan', 2], 10: ['gan', 1], 11: ['zhi', 5], 12: ['gan', 6],
};

/** 五行之胎位：木胎酉(9)、火胎子(0)、土胎午(6)、金胎卯(3)、水胎午(6) */
const TAI_OF_ELEMENT = { 木: 9, 火: 0, 土: 6, 金: 3, 水: 6 };

function computeLiuyaoShensha(ctx) {
  const { lines, shiIndex, guaShen, dayGz, monthZhiIndex, yearZhiIndex, dayGanIndex } = ctx;
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
    } else if (typeof target.ganIndex === 'number') {
      entry.gan = GAN[target.ganIndex];
      entry.lineIndex = ganInGua(target.ganIndex);
    } else if (typeof target.text === 'string') {
      entry.zhi = target.text;
      entry.lineIndex = target.lineIndex ?? null;
    }
    out.push(entry);
  };

  // —— 一、日辰三合组类（驿马、桃花、灾煞、劫煞、将星、华盖、谋星） ——
  const SANHE_SETS = [
    { name: '驿马', arr: [2, 8, 11, 5], src: '申子辰马在寅、寅午戌马在申、巳酉丑马在亥、亥卯未马在巳' },
    { name: '桃花', arr: [9, 3, 6, 0], src: '申子辰在酉、寅午戌在卯、巳酉丑在午、亥卯未在子（咸池）' },
    { name: '灾煞', arr: [6, 0, 3, 9], src: '三合局将星对冲：申子辰灾在午、寅午戌灾在子、巳酉丑灾在卯、亥卯未灾在酉' },
    { name: '劫煞', arr: [5, 11, 2, 8], src: '三合局五行绝位：申子辰劫在巳、寅午戌劫在亥、巳酉丑劫在寅、亥卯未劫在申' },
    { name: '将星', arr: [0, 6, 9, 3], src: '三合帝旺之位：申子辰见子、寅午戌见午、巳酉丑见酉、亥卯未见卯' },
    { name: '华盖', arr: [4, 10, 1, 7], src: '三合墓库之位：申子辰见辰、寅午戌见戌、巳酉丑见丑、亥卯未见未' },
    { name: '谋星', arr: [11, 5, 8, 2], src: '劫煞对冲之支：申子辰在亥、寅午戌在巳、巳酉丑在申、亥卯未在寅' },
  ];
  for (const s of SANHE_SETS) {
    push(s.name, '日辰', { zhiIndex: s.arr[SANHE_GROUP_OF(dayGz.zhiIndex)] }, s.src);
    if (yearZhiIndex !== undefined && yearZhiIndex !== dayGz.zhiIndex) {
      push(s.name + '（年）', '年君', { zhiIndex: s.arr[SANHE_GROUP_OF(yearZhiIndex)] }, s.src);
    }
  }

  // —— 二、日干禄刃贵人文昌游都飞符类 ——
  push('禄神', '日干', { zhiIndex: LU_OF_GAN[dayGanIndex] }, '甲禄到寅宫，乙禄居卯位，丙戊禄在巳，丁己禄居午，庚禄居申位，辛禄到酉宫，壬禄亥中藏，癸禄在子位');
  for (const zi of TIAN_YI[dayGanIndex] || []) {
    push('天乙贵人', '日干', { zhiIndex: zi }, '甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎');
  }
  push('文昌', '日干', { zhiIndex: WEN_CHANG[dayGanIndex] }, '甲乙巳午报君知，丙戊申宫丁己鸡，庚猪辛鼠壬逢虎，癸人见卯入云梯');
  push('羊刃', '日干', { zhiIndex: YANG_REN_OF_GAN[dayGanIndex] }, '甲卯、乙寅、丙戊午、丁己巳、庚酉、辛申、壬子、癸亥（十干羊刃）');
  push('游都', '日干', { zhiIndex: YOU_DU_OF_GAN[dayGanIndex] }, '甲己在丑，乙庚在子，丙辛在寅，丁壬在巳，戊癸在申（游都主奔波变动）');
  push('飞符', '日干', { zhiIndex: FEI_FU_OF_GAN[dayGanIndex] }, '甲巳乙辰丙卯丁寅戊丑，己午庚未辛申壬酉癸戌（飞符主突发文书动象）');

  // —— 三、卦身与婚姻床第专类（香闺、世身、胎爻、床帐） ——
  if (guaShen && typeof guaShen.zhiIndex === 'number') {
    const gsEl = ZHI_WUXING[guaShen.zhiIndex];
    // 1. 香闺：「女取身克为香闺」——本卦中为卦身五行所克之爻支（按初爻至上爻去重，无则「无」）
    const xiangGuiZhis = [];
    let xgLine = null;
    for (const l of lines) {
      if (isKe(gsEl, l.zhiElement)) {
        if (!xiangGuiZhis.includes(l.zhi)) xiangGuiZhis.push(l.zhi);
        if (xgLine === null) xgLine = l.index;
      }
    }
    push('香闺', '卦身', { text: xiangGuiZhis.length ? xiangGuiZhis.join('') : '无', lineIndex: xgLine }, '女取身克为香闺：以卦身五行所克之本卦爻支为香闺（占婚恋闺房之象）');

    // 2. 床帐：「男取卦身生为床帐」——本卦中为卦身五行所生之爻支（按初爻至上爻去重，无则「无」）
    const chuangZhangZhis = [];
    let czLine = null;
    for (const l of lines) {
      if (isSheng(gsEl, l.zhiElement)) {
        if (!chuangZhangZhis.includes(l.zhi)) chuangZhangZhis.push(l.zhi);
        if (czLine === null) czLine = l.index;
      }
    }
    push('床帐', '卦身', { text: chuangZhangZhis.length ? chuangZhangZhis.join('') : '无', lineIndex: czLine }, '男取卦身生为床帐：以卦身五行所生之本卦爻支为床帐（占婚恋同居床第之象）');
  }

  // 3. 世身：「子午持世身居初，丑未持世身居二，寅申居三，卯酉居四，辰戌居五，巳亥居六」
  const shiLineObj = lines[shiIndex] || lines[0];
  if (shiLineObj) {
    const ssLineIdx = shiLineObj.zhiIndex % 6;
    const ssTargetLine = lines[ssLineIdx] || shiLineObj;
    push('世身', '世爻', { zhiIndex: ssTargetLine.zhiIndex }, '子午持世身居初，丑未持世身居二，寅申持世身居三，卯酉持世身居四，辰戌持世身居五，巳亥持世身居六');
  }

  // 4. 胎爻：以卦中子孙爻五行查十二长生之「胎」位（如无福德或胎支不见于卦中则为「无」）
  const zisunLines = lines.filter((l) => l.liuqin === '子孙');
  if (zisunLines.length > 0) {
    const zsEl = zisunLines[0].zhiElement;
    const taiZhiIdx = TAI_OF_ELEMENT[zsEl];
    const taiInGua = zhiInGua(taiZhiIdx);
    push('胎爻', '子孙', { text: taiInGua !== null ? ZHI[taiZhiIdx] : '无', lineIndex: taiInGua }, '子孙五行之胎位（木胎酉、火胎子、土水胎午、金胎卯），须子孙与胎支上卦方为真胎爻');
  } else {
    push('胎爻', '子孙', { text: '无', lineIndex: null }, '如无福德莫究胎爻：本卦子孙伏藏未现，故胎爻为无');
  }

  // —— 四、月建类（月德、天德、天医、天马、生气、死气、血支、破碎、孤辰、寡宿、官符、死神） ——
  const mOrder = (((monthZhiIndex - 2) % 12) + 12) % 12 + 1;
  const yueDe = YUE_DE_GAN[mOrder];
  push('月德', '月建', { ganIndex: yueDe }, '寅午戌月在丙，申子辰月在壬，亥卯未月在甲，巳酉丑月在庚');
  const td = TIAN_DE_BY_MONTH[mOrder];
  push('天德', '月建', td[0] === 'gan' ? { ganIndex: td[1] } : { zhiIndex: td[1] }, '正丁二申三壬四辛，五亥六甲七癸八寅，九丙十乙十一巳，十二庚（天德）');
  push('天医', '月建', { zhiIndex: (monthZhiIndex + 11) % 12 }, '天医乃月支退一位之支（正月见丑…九月见酉），主医药、疗愈');
  const tianMaZhi = [6, 8, 10, 0, 2, 4][(mOrder - 1) % 6];
  push('天马', '月建', { zhiIndex: tianMaZhi }, '正七在午，二八申，三九在戌，四十子，五十一寅，六十二辰（天马主急速升迁出行）');
  push('生气', '月建', { zhiIndex: (monthZhiIndex + 10) % 12 }, '正月起子顺行十二辰（月建后二辰为生气），主生机勃发、添丁营建');
  push('死气', '月建', { zhiIndex: (monthZhiIndex + 4) % 12 }, '生气对冲为死气（正月起午顺行十二辰），主气机沉滞');
  push('血支', '月建', { zhiIndex: (monthZhiIndex + 11) % 12 }, '正月起丑顺行十二辰（月建后一辰为血支），防伤病针药之象');
  const poSuiZhi = [2, 8, 5, 11].includes(monthZhiIndex) ? 9 : ([0, 6, 3, 9].includes(monthZhiIndex) ? 5 : 1);
  push('破碎', '月建', { zhiIndex: poSuiZhi }, '四孟金鸡（酉）四仲蛇（巳），四季逢丑是破碎');
  const ggMonth = GUAN_GUA(monthZhiIndex);
  push('孤辰', '月建', { zhiIndex: ggMonth.gu }, '亥子丑见寅，寅卯辰见巳，巳午未见申，申酉戌见亥');
  push('寡宿', '月建', { zhiIndex: ggMonth.gua }, '亥子丑见戌，寅卯辰见丑，巳午未见辰，申酉戌见未');
  push('官符', '月建', { zhiIndex: (monthZhiIndex + 4) % 12 }, '月建前四辰为官符，主文书词讼之象');
  push('死神', '月建', { zhiIndex: (monthZhiIndex + 3) % 12 }, '生前五位死神看（正月起巳顺行十二辰）');

  // —— 五、太岁年君类（亡神、病符、丧门、吊客、红鸾、天喜） ——
  if (yearZhiIndex !== undefined) {
    const wangShenArr = [11, 5, 8, 2]; // 申子辰亥、寅午戌巳、巳酉丑申、亥卯未寅
    push('亡神', '年君', { zhiIndex: wangShenArr[SANHE_GROUP_OF(yearZhiIndex)] }, '申子辰见亥，寅午戌见巳，巳酉丑见申，亥卯未见寅');
    push('病符', '年君', { zhiIndex: (yearZhiIndex + 1) % 12 }, '旧岁太岁位为病符，主身体调养之象');
    push('丧门', '年君', { zhiIndex: (yearZhiIndex + 2) % 12 }, '丧门为太岁前二辰');
    push('吊客', '年君', { zhiIndex: (yearZhiIndex + 10) % 12 }, '吊客为太岁后二辰');
    const hongLuan = ((3 - yearZhiIndex) % 12 + 12) % 12;
    push('红鸾', '年君', { zhiIndex: hongLuan }, '红鸾星动：子年起卯逆行十二辰，主婚恋喜庆');
    push('天喜', '年君', { zhiIndex: (hongLuan + 6) % 12 }, '红鸾对冲为天喜，主吉庆添喜');
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
    const yang = vals.map((v) => (v === 7 || v === 9 ? 1 : 0));
    const dong = vals.map((v, i) => (v === 6 || v === 9 ? i : -1)).filter((i) => i >= 0);
    return { yang, dong };
  };

  if (method === 'coin' || Array.isArray(input.lines)) {
    method = 'coin';
    const vals = Array.isArray(input.lines) ? input.lines.map(Number).filter((v) => [6, 7, 8, 9].includes(v)) : [];
    if (!vals.length && input.method === 'auto') {
      for (let i = 0; i < 6; i++) {
        const heads = (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1);
        vals.push(heads + 6);
      }
    }
    while (vals.length < 6) {
      const heads = (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1) + (Math.random() < 0.5 ? 0 : 1);
      vals.push(heads + 6);
    }
    const { yang, dong } = toYangDong(vals);
    dongLines = dong;
    upper = trigramFromLines(yang.slice(3, 6));
    lower = trigramFromLines(yang.slice(0, 3));
  } else if (method === 'name' && input.guaName) {
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
      dongLines = [];
    } else {
      const bianFound = findGua(bianName);
      const benL = [...TRIGRAM_LINES[lower], ...TRIGRAM_LINES[upper]];
      const bianL = [...TRIGRAM_LINES[bianFound.low], ...TRIGRAM_LINES[bianFound.up]];
      dongLines = benL.map((y, i) => (y !== bianL[i] ? i : -1)).filter((i) => i >= 0);
    }
  } else if (method === 'number' && Array.isArray(input.numbers) && input.numbers.length >= 2) {
    const n1 = Math.abs(Math.floor(input.numbers[0]));
    const n2 = Math.abs(Math.floor(input.numbers[1]));
    upper = TRIGRAMS[n1 % 8];
    lower = TRIGRAMS[n2 % 8];
    const { dong } = toYangDong(deriveLines((i) => n1 * (i + 3) + n2 * (i + 5) + i * 7 + n1 + n2));
    dongLines = dong;
  } else if (method === 'number2' && Array.isArray(input.numbers) && input.numbers.length >= 2) {
    const n1 = Math.abs(Math.floor(input.numbers[0]));
    const n2 = Math.abs(Math.floor(input.numbers[1]));
    const n3 = input.numbers[2] ? Math.abs(Math.floor(input.numbers[2])) : 1;
    upper = TRIGRAMS[n1 % 8];
    lower = TRIGRAMS[n2 % 8];
    const { dong } = toYangDong(deriveLines((i) => n1 * (i + 2) + n2 * (i + 6) + n3 * (i + 3) + n3));
    dongLines = dong;
  } else {
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

  // —— 四柱干支与各柱空亡 ——
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

  // —— 神煞（36 项全表） ——
  const shenshaList = computeLiuyaoShensha({
    lines: z.lines,
    shiIndex: z.shiIndex,
    guaShen,
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
