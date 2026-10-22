/**
 * 干支关系层 —— 八字事实层的「互动」部分
 *
 * 包含：
 *  - 天干五合、天干四冲
 *  - 地支六合、三合局（全/半/拱）、三会方、六冲、相刑（含自刑）、六害、六破
 *  - 十二长生（日主于各支的状态 / 干支自坐）
 *  - 旬空、胎元、命宫、身宫、命卦
 *
 * 铁律：本模块只产出「确定性事实与传统口诀分类」，不做吉凶断言。
 * 所有关系均标注起法依据（source），供解读层溯源引用。
 */

import { GAN, ZHI } from './ganzhi.js';

export const ZHI_IDX = Object.fromEntries(ZHI.map((z, i) => [z, i]));
export const GAN_IDX = Object.fromEntries(GAN.map((g, i) => [g, i]));
const zx = (name) => ZHI_IDX[name];

// ==================================================================
// 一、天干关系
// ==================================================================

/** 天干五合：每隔 5 位相合，化气五行 */
export const GAN_HE_LIST = [
  { pair: [0, 5], hua: '土', name: '甲己合土' },
  { pair: [1, 6], hua: '金', name: '乙庚合金' },
  { pair: [2, 7], hua: '水', name: '丙辛合水' },
  { pair: [3, 8], hua: '木', name: '丁壬合木' },
  { pair: [4, 9], hua: '火', name: '戊癸合火' },
];

/** 天干四冲（戊己居中无冲） */
export const GAN_CHONG_LIST = [
  { pair: [0, 6], name: '甲庚相冲' },
  { pair: [1, 7], name: '乙辛相冲' },
  { pair: [2, 8], name: '丙壬相冲' },
  { pair: [3, 9], name: '丁癸相冲' },
];

/** 查天干关系：返回 { type, name, note } 或 null */
export function ganRelation(aIndex, bIndex) {
  for (const h of GAN_HE_LIST) {
    const [x, y] = h.pair;
    if ((aIndex === x && bIndex === y) || (aIndex === y && bIndex === x)) {
      return {
        type: 'he',
        kind: '天干五合',
        name: h.name,
        hua: h.hua,
        note: `${GAN[aIndex]}${GAN[bIndex]}相邻或同见，合而化${h.hua}气`,
        source: '五合源于河图生成数，甲己化土等见于《渊海子平》',
      };
    }
  }
  for (const c of GAN_CHONG_LIST) {
    const [x, y] = c.pair;
    if ((aIndex === x && bIndex === y) || (aIndex === y && bIndex === x)) {
      return {
        type: 'chong',
        kind: '天干相冲',
        name: c.name,
        note: `${GAN[aIndex]}${GAN[bIndex]}阴阳同性、方位相对，主对立与变动`,
        source: '天干四冲，戊己居中央故无冲',
      };
    }
  }
  return null;
}

// ==================================================================
// 二、地支关系
// ==================================================================

/** 六合 */
export const LIU_HE = [
  { pair: ['子', '丑'], hua: '土', name: '子丑合土' },
  { pair: ['寅', '亥'], hua: '木', name: '寅亥合木' },
  { pair: ['卯', '戌'], hua: '火', name: '卯戌合火' },
  { pair: ['辰', '酉'], hua: '金', name: '辰酉合金' },
  { pair: ['巳', '申'], hua: '水', name: '巳申合水' },
  { pair: ['午', '未'], hua: '火', name: '午未合火（日月之会）' },
];

/** 三合局：长生 + 帝旺 + 墓库 */
export const SAN_HE = [
  { set: ['申', '子', '辰'], wang: '子', hua: '水', name: '申子辰三合水局' },
  { set: ['亥', '卯', '未'], wang: '卯', hua: '木', name: '亥卯未三合木局' },
  { set: ['寅', '午', '戌'], wang: '午', hua: '火', name: '寅午戌三合火局' },
  { set: ['巳', '酉', '丑'], wang: '酉', hua: '金', name: '巳酉丑三合金局' },
];

/** 三会方 */
export const SAN_HUI = [
  { set: ['寅', '卯', '辰'], hua: '木', name: '寅卯辰会东方木' },
  { set: ['巳', '午', '未'], hua: '火', name: '巳午未会南方火' },
  { set: ['申', '酉', '戌'], hua: '金', name: '申酉戌会西方金' },
  { set: ['亥', '子', '丑'], hua: '水', name: '亥子丑会北方水' },
];

/** 六冲 */
export const LIU_CHONG = [
  ['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥'],
];

/** 相刑（分类） */
export const XING_GROUPS = [
  { set: ['寅', '巳', '申'], kind: '无恩之刑', note: '寅刑巳、巳刑申、申刑寅，主付出不得回报之扰' },
  { set: ['丑', '戌', '未'], kind: '恃势之刑', note: '丑刑戌、戌刑未、未刑丑，主依势压制而生波折' },
  { set: ['子', '卯'], kind: '无礼之刑', note: '子刑卯、卯刑子，主礼数失和、关系摩擦' },
  { set: ['辰', '午', '酉', '亥'], kind: '自刑', note: '辰见辰、午见午、酉见酉、亥见亥，主自我纠结与内耗' },
];

/** 六害（相穿） */
export const LIU_HAI = [
  ['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌'],
];

/** 六破 */
export const LIU_PO = [
  ['子', '酉'], ['丑', '辰'], ['寅', '亥'], ['卯', '午'], ['未', '戌'], ['申', '巳'],
];

const pairHit = (def) => {
  const [a, b] = def.pair || def.set || def;
  return { a: zx(a), b: zx(b) };
};

const samePair = (x, y, a, b) => (x === a && y === b) || (x === b && y === a);

/**
 * 分析地支集合之间的全部关系
 * @param {Array<{key:string,label:string,zhiIndex:number}>} items 四个地支（含柱位标签）
 * @returns {Array<{type,kind,name,keys,labels,note,strength,source}>}
 */
export function analyzeZhi(items) {
  const out = [];
  const n = items.length;

  const push = (o) => out.push(o);

  // —— 六合 ——
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = items[i], B = items[j];
      for (const h of LIU_HE) {
        const [a, b] = h.pair;
        if (samePair(A.zhiIndex, B.zhiIndex, zx(a), zx(b))) {
          push({
            type: 'he', kind: '六合', name: h.name,
            keys: [A.key, B.key], labels: [A.label + '支', B.label + '支'],
            note: `${ZHI[A.zhiIndex]}${ZHI[B.zhiIndex]}六合，有合化${h.hua}之势`,
            strength: 3, source: '地支六合：子丑合土、寅亥合木等，见《渊海子平·地支六合》',
          });
        }
      }
      // —— 六冲 ——
      for (const pair of LIU_CHONG) {
        if (samePair(A.zhiIndex, B.zhiIndex, zx(pair[0]), zx(pair[1]))) {
          push({
            type: 'chong', kind: '六冲', name: `${ZHI[A.zhiIndex]}${ZHI[B.zhiIndex]}相冲`,
            keys: [A.key, B.key], labels: [A.label + '支', B.label + '支'],
            note: `${ZHI[A.zhiIndex]}${ZHI[B.zhiIndex]}阴阳同性、方位对冲，主变动、离散与冲突`,
            strength: 5, source: '地支六冲：子午、丑未、寅申、卯酉、辰戌、巳亥',
          });
        }
      }
      // —— 相害 ——
      for (const pair of LIU_HAI) {
        if (samePair(A.zhiIndex, B.zhiIndex, zx(pair[0]), zx(pair[1]))) {
          push({
            type: 'hai', kind: '六害', name: `${ZHI[A.zhiIndex]}${ZHI[B.zhiIndex]}相害`,
            keys: [A.key, B.key], labels: [A.label + '支', B.label + '支'],
            note: `${ZHI[A.zhiIndex]}${ZHI[B.zhiIndex]}六害（相穿），主暗中损耗、相处相碍`,
            strength: 2, source: '地支六害：子未害、丑午害、寅巳害、卯辰害、申亥害、酉戌害',
          });
        }
      }
      // —— 相破 ——
      for (const pair of LIU_PO) {
        if (samePair(A.zhiIndex, B.zhiIndex, zx(pair[0]), zx(pair[1]))) {
          push({
            type: 'po', kind: '六破', name: `${ZHI[A.zhiIndex]}${ZHI[B.zhiIndex]}相破`,
            keys: [A.key, B.key], labels: [A.label + '支', B.label + '支'],
            note: `${ZHI[A.zhiIndex]}${ZHI[B.zhiIndex]}相破，主暗损、事有残缺`,
            strength: 1, source: '地支六破：子酉破、丑辰破、寅亥破、卯午破、未戌破、申巳破',
          });
        }
      }
      // —— 自刑（同支重复） ——
      if (A.zhiIndex === B.zhiIndex && ['辰', '午', '酉', '亥'].includes(ZHI[A.zhiIndex])) {
        push({
          type: 'xing', kind: '自刑', name: `${ZHI[A.zhiIndex]}${ZHI[A.zhiIndex]}自刑`,
          keys: [A.key, B.key], labels: [A.label + '支', B.label + '支'],
          note: `${ZHI[A.zhiIndex]}见${ZHI[A.zhiIndex]}为自刑，主内心纠结、自我较劲`,
          strength: 3, source: '辰午酉亥为自刑四位',
        });
      }
      // —— 相刑（不同支；自刑须同支重复，已在上方单独处理） ——
      for (const g of XING_GROUPS) {
        if (g.kind === '自刑') continue;
        if (A.zhiIndex !== B.zhiIndex) {
          const idxA = g.set.map(zx).indexOf(A.zhiIndex);
          const idxB = g.set.map(zx).indexOf(B.zhiIndex);
          if (idxA >= 0 && idxB >= 0 && A.zhiIndex !== B.zhiIndex) {
            push({
              type: 'xing', kind: g.kind, name: `${ZHI[A.zhiIndex]}${ZHI[B.zhiIndex]}${g.kind}`,
              keys: [A.key, B.key], labels: [A.label + '支', B.label + '支'],
              note: g.note,
              strength: 3, source: `三刑之一：${g.set.join('、')} 为${g.kind}`,
            });
          }
        }
      }
    }
  }

  // —— 三合局（全 / 半 / 拱） ——
  // 注：同一地支重复出现（如午见午）不重复计位，故先按支索引去重
  const uniqItems = [];
  const seenZhi = new Set();
  for (const it of items) {
    if (seenZhi.has(it.zhiIndex)) continue;
    seenZhi.add(it.zhiIndex);
    uniqItems.push(it);
  }
  for (const h of SAN_HE) {
    const set = h.set.map(zx);
    const hits = uniqItems.filter((it) => set.includes(it.zhiIndex));
    const wang = zx(h.wang);
    if (hits.length === 3) {
      push({
        type: 'sanhe', kind: '三合局', name: h.name,
        keys: hits.map((x) => x.key), labels: hits.map((x) => x.label + '支'),
        note: `${h.set.join('、')}全见，合成${h.hua}局，力量最专`,
        strength: 6, source: '三合局：长生、帝旺、墓库三者全为全局',
      });
    } else if (hits.length === 2) {
      const hasWang = hits.some((x) => x.zhiIndex === wang);
      push({
        type: hasWang ? 'banhe' : 'gongju', kind: hasWang ? '半合局' : '拱局',
        name: `${hits.map((x) => ZHI[x.zhiIndex]).join('')}${hasWang ? '半合' : '拱'}${h.hua}局`,
        keys: hits.map((x) => x.key), labels: hits.map((x) => x.label + '支'),
        note: hasWang
          ? `${hits.map((x) => ZHI[x.zhiIndex]).join('、')}含帝旺${h.wang}，为有情半合，${h.hua}气已成过半`
          : `${hits.map((x) => ZHI[x.zhiIndex]).join('、')}缺帝旺${h.wang}，为拱局，有${h.hua}气而力量待引`,
        strength: hasWang ? 4 : 2,
        source: '半合须含帝旺方为有力，无帝旺者称拱局',
      });
    }
  }

  // —— 三会方 ——
  for (const h of SAN_HUI) {
    const set = h.set.map(zx);
    const hits = uniqItems.filter((it) => set.includes(it.zhiIndex));
    if (hits.length === 3) {
      push({
        type: 'sanhui', kind: '三会方', name: h.name,
        keys: hits.map((x) => x.key), labels: hits.map((x) => x.label + '支'),
        note: `${h.set.join('、')}三会${h.hua}方，为一方之正气，力量最盛`,
        strength: 7, source: '三会方为同方位之气汇聚，重于三合',
      });
    }
  }

  // 去重（同一组合的同一类型只保留一条）
  const seen = new Set();
  return out.filter((r) => {
    const sig = r.kind + '|' + r.keys.slice().sort().join(',') + '|' + r.name;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  }).sort((a, b) => b.strength - a.strength);
}

/** 天干关系批量分析 */
export function analyzeGan(items) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      const rel = ganRelation(A.ganIndex, B.ganIndex);
      if (rel) {
        out.push({
          ...rel,
          keys: [A.key, B.key],
          labels: [A.label + '干', B.label + '干'],
          strength: rel.type === 'he' ? 3 : 5,
        });
      }
    }
  }
  return out.sort((a, b) => b.strength - a.strength);
}

// ==================================================================
// 三、十二长生
// ==================================================================

export const CHANGSHENG_STATE = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];

/**
 * 十天干长生起点：阳干顺行、阴干逆行（火土同宫：戊从丙、己从丁）
 * start = 长生所在地支索引，dir = +1 顺 / -1 逆
 */
export const CHANGSHENG_ORIGIN = [
  { gan: '甲', start: zx('亥'), dir: 1 },
  { gan: '乙', start: zx('午'), dir: -1 },
  { gan: '丙', start: zx('寅'), dir: 1 },
  { gan: '丁', start: zx('酉'), dir: -1 },
  { gan: '戊', start: zx('寅'), dir: 1 },
  { gan: '己', start: zx('酉'), dir: -1 },
  { gan: '庚', start: zx('巳'), dir: 1 },
  { gan: '辛', start: zx('子'), dir: -1 },
  { gan: '壬', start: zx('申'), dir: 1 },
  { gan: '癸', start: zx('卯'), dir: -1 },
];

/** 某天干处于某地支的十二长生状态 */
export function changsheng(ganIndex, zhiIndex) {
  const o = CHANGSHENG_ORIGIN[((ganIndex % 10) + 10) % 10];
  const target = ((zhiIndex % 12) + 12) % 12;
  for (let stage = 0; stage < 12; stage++) {
    const pos = ((o.start + o.dir * stage) % 12 + 12) % 12;
    if (pos === target) {
      return { state: CHANGSHENG_STATE[stage], stage, note: `${GAN[ganIndex]}于${ZHI[target]}: ${CHANGSHENG_STATE[stage]}` };
    }
  }
  return { state: '—', stage: -1, note: '' };
}

/** 干支自坐：柱内天干坐本柱地支的长生状态（即传统「自坐」） */
export function zizuo(ganIndex, zhiIndex) {
  return changsheng(ganIndex, zhiIndex);
}

// ==================================================================
// 四、旬空
// ==================================================================

/** 由六十甲子序号求旬空二支（以日柱或年柱为本皆可） */
export function xunkongOf(index) {
  const i = ((index % 60) + 60) % 60;
  const start = Math.floor(i / 10) * 10;
  const a = (start + 10) % 12;
  const b = (start + 11) % 12;
  return [ZHI[a], ZHI[b]];
}

// ==================================================================
// 五、胎元 / 命宫 / 身宫
// ==================================================================

/** 五虎遁：年干 -> 寅月天干索引 */
const WU_HU_DUN = { 0: 2, 5: 2, 1: 4, 6: 4, 2: 6, 7: 6, 3: 8, 8: 8, 4: 0, 9: 0 };

/** 地支 -> 月序（寅=1 … 丑=12） */
export function monthOrderOf(zhiIndex) {
  return (((zhiIndex - 2) % 12) + 12) % 12 + 1;
}

/** 由某干支位置用五虎遁安天干（同「年上起月法」） */
export function ganByWuHuDun(yearGanIndex, targetZhiIndex) {
  const m = monthOrderOf(targetZhiIndex);
  return (WU_HU_DUN[((yearGanIndex % 10) + 10) % 10] + (m - 1)) % 10;
}

/** 胎元：月干顺一位、月支顺三位 */
export function taiyuan(monthGanIndex, monthZhiIndex) {
  const g = (monthGanIndex + 1) % 10;
  const z = (monthZhiIndex + 3) % 12;
  return {
    name: GAN[g] + ZHI[z], gan: GAN[g], zhi: ZHI[z], ganIndex: g, zhiIndex: z,
    source: '胎元起法：出生月天干进一位、地支进三位，为受孕之月',
  };
}

/** 命宫：14 减（月序+时序），不足减则用 26 减；天干用年上起月法 */
export function mingGong(yearGanIndex, monthZhiIndex, hourZhiIndex) {
  const m = monthOrderOf(monthZhiIndex);
  const h = monthOrderOf(hourZhiIndex);
  const sum = m + h;
  let n = sum <= 14 ? 14 - sum : 26 - sum;
  if (n <= 0) n += 12;
  const zhiIndex = (n + 1) % 12;
  const ganIndex = ganByWuHuDun(yearGanIndex, zhiIndex);
  return {
    name: GAN[ganIndex] + ZHI[zhiIndex], gan: GAN[ganIndex], zhi: ZHI[zhiIndex],
    ganIndex, zhiIndex,
    source: `命宫歌诀：14−（月序 ${m} + 时序 ${h}）${sum > 14 ? '，超过 14 改用 26 减' : ''}=${n}，落在${ZHI[zhiIndex]}宫；天干依年上起月法`,
  };
}

/** 身宫：子起正月顺推到生月，时支落该位逆推到酉，酉所临之支即身宫 */
export function shenGong(yearGanIndex, monthZhiIndex, hourZhiIndex) {
  const m = monthOrderOf(monthZhiIndex);
  const P = (m - 1) % 12;                       // 生月所落之位（子为0）
  const zhiIndex = (((P - (zx('酉') - hourZhiIndex)) % 12) + 12) % 12;
  const ganIndex = ganByWuHuDun(yearGanIndex, zhiIndex);
  return {
    name: GAN[ganIndex] + ZHI[zhiIndex], gan: GAN[ganIndex], zhi: ZHI[zhiIndex],
    ganIndex, zhiIndex,
    source: `身宫起法：子上起正月顺推至第 ${m} 月落${ZHI[P]}位，时支${ZHI[hourZhiIndex]}落此位逆推至酉，落在${ZHI[zhiIndex]}`,
  };
}

// ==================================================================
// 六、命卦（八宅东四/西四命）
// ==================================================================

const GUA_NAME = { 1: '坎', 2: '坤', 3: '震', 4: '巽', 5: '寄宫', 6: '乾', 7: '兑', 8: '艮', 9: '离' };
const EAST = [1, 3, 4, 9];
const WEST = [2, 6, 7, 8];

/** 命卦（简化流行算法，按农历年、性别） */
export function mingGua(lunarYear, gender) {
  const y = String(lunarYear).slice(-2);
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  let k;
  if (n >= 0 && n <= 99) {
    k = gender === 'female' ? (n - 4 + 9 * 12) % 9 : (100 - n) % 9;
  } else {
    k = 5;
  }
  if (k === 0) k = 9;
  if (k === 5) k = gender === 'female' ? 8 : 2; // 五黄寄宫：女寄艮、男寄坤
  const name = GUA_NAME[k];
  const group = EAST.includes(k) ? '东四命' : WEST.includes(k) ? '西四命' : '—';
  return {
    number: k, name, group,
    note: `${name}卦，属${group}`,
    source: '命卦按出生农历年配洛书九宫推演，用于八宅方位参考；此为流行算法，不同流派略有差异',
  };
}

export { WU_HU_DUN };
