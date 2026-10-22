/**
 * 干支基础：天干、地支、五行、纳音、藏干、十神、神煞
 * 日干支锚点：1900-01-01 为甲戌日（与通用万年历一致）→ index = (JDN + 49) mod 60
 */

export const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export const GAN_WUXING = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
export const ZHI_WUXING = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];

export const WUXING = ['木', '火', '土', '金', '水'];
export const WUXING_INDEX = { 木: 0, 火: 1, 土: 2, 金: 3, 水: 4 };

/** 天干阴阳：阳干 甲丙戊庚壬 */
export const GAN_YANG = [true, false, true, false, true, false, true, false, true, false];

/** 六十甲子纳音（每两组一纳音） */
export const NAYIN = [
  '海中金', '炉中火', '大林木', '路旁土', '剑锋金',
  '山头火', '涧下水', '城头土', '白蜡金', '杨柳木',
  '泉中水', '屋上土', '霹雳火', '松柏木', '长流水',
  '沙中金', '山下火', '平地木', '壁上土', '金箔金',
  '覆灯火', '天河水', '大驿土', '钗钏金', '桑柘木',
  '大溪水', '沙中土', '天上火', '石榴木', '大海水',
];

/** 地支藏干：[本气, 中气, 余气] */
export const CANGGAN = {
  子: ['癸'],
  丑: ['己', '癸', '辛'],
  寅: ['甲', '丙', '戊'],
  卯: ['乙'],
  辰: ['戊', '乙', '癸'],
  巳: ['丙', '戊', '庚'],
  午: ['丁', '己'],
  未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'],
  酉: ['辛'],
  戌: ['戊', '辛', '丁'],
  亥: ['壬', '甲'],
};

export const CANGGAN_TYPE = ['本气', '中气', '余气'];

/** 藏干天干权重（用于五行统计） */
const CANGGAN_WEIGHT = [1.0, 0.6, 0.3];

/** 六十甲子名 */
export function ganzhiName(index) {
  const i = ((index % 60) + 60) % 60;
  return GAN[i % 10] + ZHI[i % 12];
}

/** 由干支序号得 { ganIndex, zhiIndex, gan, zhi, name } */
export function ganzhiOfIndex(index) {
  const i = ((index % 60) + 60) % 60;
  const ganIndex = i % 10;
  const zhiIndex = i % 12;
  return { index: i, ganIndex, zhiIndex, gan: GAN[ganIndex], zhi: ZHI[zhiIndex], name: GAN[ganIndex] + ZHI[zhiIndex] };
}

/** 儒略日号 -> 日干支 */
export function ganzhiOfJdn(jdn) {
  return ganzhiOfIndex(Math.floor(jdn) + 49);
}

/** 纳音：由干支序号 */
export function nayinOfIndex(index) {
  const i = ((index % 60) + 60) % 60;
  return NAYIN[Math.floor(i / 2)];
}

/** 干支序号 */
export function indexOfGanzhi(ganIndex, zhiIndex) {
  for (let i = 0; i < 60; i++) {
    if (i % 10 === ganIndex && i % 12 === zhiIndex) return i;
  }
  return -1;
}

/**
 * 十神：以日干为「我」
 * 同我：比肩(同阴阳)/劫财；我生：食神(同)/伤官；我克：偏财(同)/正财；
 * 克我：七杀(同)/正官；生我：偏印(同)/正印
 */
export function shishen(dayGanIndex, otherGanIndex) {
  const d = GAN_WUXING[dayGanIndex];
  const o = GAN_WUXING[otherGanIndex];
  const same = GAN_YANG[dayGanIndex] === GAN_YANG[otherGanIndex];
  if (d === o) return same ? '比肩' : '劫财';
  if (isSheng(d, o)) return same ? '食神' : '伤官'; // 我生者
  if (isKe(d, o)) return same ? '偏财' : '正财'; // 我克者
  if (isKe(o, d)) return same ? '七杀' : '正官'; // 克我者
  return same ? '偏印' : '正印'; // 生我者
}

const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

export function isSheng(a, b) {
  return SHENG[a] === b;
}
export function isKe(a, b) {
  return KE[a] === b;
}

/** 藏干（含权重与十神） */
export function cangganOf(zhiIndex, dayGanIndex = null) {
  const list = CANGGAN[ZHI[((zhiIndex % 12) + 12) % 12]] || [];
  return list.map((gan, i) => {
    const ganIndex = GAN.indexOf(gan);
    return {
      gan,
      ganIndex,
      type: CANGGAN_TYPE[i] || '余气',
      weight: CANGGAN_WEIGHT[i] || 0.3,
      wuxing: GAN_WUXING[ganIndex],
      shishen: dayGanIndex === null ? null : shishen(dayGanIndex, ganIndex),
    };
  });
}

/** 地支藏干天干索引（用于通根判定） */
export function cangganIndexes(zhiIndex) {
  const list = CANGGAN[ZHI[((zhiIndex % 12) + 12) % 12]] || [];
  return list.map((g) => GAN.indexOf(g));
}

// ---------------------------------------------------------------- 神煞

const ZHI_IDX = Object.fromEntries(ZHI.map((z, i) => [z, i]));
const z = (n) => ZHI_IDX[n];

/** 三合局：申子辰/寅午戌/巳酉丑/亥卯未 */
export function sanheGroup(zhiIndex) {
  if (zhiIndex === z('申') || zhiIndex === z('子') || zhiIndex === z('辰')) return 0;
  if (zhiIndex === z('寅') || zhiIndex === z('午') || zhiIndex === z('戌')) return 1;
  if (zhiIndex === z('巳') || zhiIndex === z('酉') || zhiIndex === z('丑')) return 2;
  return 3; // 亥卯未
}

export function shensha(yearZhi, monthZhi, dayZhi, hourZhi, dayGanIndex, yearGanIndex) {
  const out = [];
  const push = (name, position, note) => out.push({ name, position, note });

  // 天乙贵人：甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，辛逢虎马
  const tianyi = {
    0: ['丑', '未'], 4: ['丑', '未'], 6: ['丑', '未'],
    1: ['子', '申'], 5: ['子', '申'],
    2: ['亥', '酉'], 3: ['亥', '酉'],
    8: ['卯', '巳'], 9: ['卯', '巳'],
    7: ['寅', '午'],
  }[dayGanIndex] || [];
  for (const s of tianyi) {
    const zi = z(s);
    for (const [pos, v] of [['年', yearZhi], ['月', monthZhi], ['日', dayZhi], ['时', hourZhi]]) {
      if (v === zi) push('天乙贵人', pos + '支', '遇事有人帮扶，贵人运较强');
    }
  }

  // 驿马
  const ma = [z('申'), z('寅'), z('亥'), z('巳')][sanheGroup(dayZhi !== undefined ? dayZhi : yearZhi)];
  for (const [pos, v] of [['年', yearZhi], ['月', monthZhi], ['日', dayZhi], ['时', hourZhi]]) {
    if (v === ma) push('驿马', pos + '支', '主走动、迁移、外出发展机会多');
  }

  // 桃花（咸池）
  const tao = [z('酉'), z('卯'), z('午'), z('子')][sanheGroup(yearZhi !== undefined ? yearZhi : dayZhi)];
  for (const [pos, v] of [['年', yearZhi], ['月', monthZhi], ['日', dayZhi], ['时', hourZhi]]) {
    if (v === tao) push('桃花', pos + '支', '人缘与异性缘较旺，审美感知敏锐');
  }

  // 华盖
  const huagai = [z('辰'), z('戌'), z('丑'), z('未')][sanheGroup(yearZhi !== undefined ? yearZhi : dayZhi)];
  for (const [pos, v] of [['年', yearZhi], ['月', monthZhi], ['日', dayZhi], ['时', hourZhi]]) {
    if (v === huagai) push('华盖', pos + '支', '主独立思考与钻研精神，偏好精神世界');
  }

  // 将星
  const jiangxing = [z('子'), z('午'), z('酉'), z('卯')][sanheGroup(yearZhi !== undefined ? yearZhi : dayZhi)];
  for (const [pos, v] of [['年', yearZhi], ['月', monthZhi], ['日', dayZhi], ['时', hourZhi]]) {
    if (v === jiangxing) push('将星', pos + '支', '具组织与担责倾向，宜担任主导角色');
  }

  // 文昌贵人
  const wenchang = { 0: '巳', 1: '午', 2: '申', 4: '申', 3: '酉', 5: '酉', 6: '亥', 7: '子', 8: '寅', 9: '卯' }[dayGanIndex];
  if (wenchang) {
    const zi = z(wenchang);
    for (const [pos, v] of [['年', yearZhi], ['月', monthZhi], ['日', dayZhi], ['时', hourZhi]]) {
      if (v === zi) push('文昌贵人', pos + '支', '利于学习、考试与文字表达');
    }
  }

  return out;
}

export { ZHI_IDX };
