/**
 * 神煞全表 —— 108 项（据《渊海子平》《三命通会》《神峰通考》及通行起例整理）
 *
 * 设计原则：
 *  1. 每一项都带 source（起法口诀/典籍出处），前端悬停即显示「起法依据」
 *  2. match 决定查法：
 *     - zhi：按四柱地支查（取最先命中的一柱）
 *     - gan：按四柱天干查
 *     - monthzhi / dayzhi / hourzhi：仅查月支 / 日支 / 时支
 *     - hour：按时柱干支整体查（干支名数组）
 *     - day：按日柱干支整体查（干支名数组）
 *     - any：自定义条件成立即命中（可配 fixed 指定落宫标签）
 *     - custom：resolve 返回 {gan}/{zhi} 再落柱
 *  3. 描述保持「传统认为」的中性表述，不做确定性断言（合规要求）
 */

import { GAN, ZHI, indexOfGanzhi, nayinOfIndex } from './ganzhi.js';

const Z = Object.fromEntries(ZHI.map((z, i) => [z, i]));
const G = Object.fromEntries(GAN.map((g, i) => [g, i]));
const b = (...names) => names.map((n) => Z[n]);
const g = (...names) => names.map((n) => G[n]);

/** 三合组：0=申子辰 1=寅午戌 2=巳酉丑 3=亥卯未 */
function triGroup(zhiIndex) {
  if ([Z.申, Z.子, Z.辰].includes(zhiIndex)) return 0;
  if ([Z.寅, Z.午, Z.戌].includes(zhiIndex)) return 1;
  if ([Z.巳, Z.酉, Z.丑].includes(zhiIndex)) return 2;
  return 3;
}

/** 四季（按月支）：0=春(寅卯辰) 1=夏(巳午未) 2=秋(申酉戌) 3=冬(亥子丑) */
function seasonOf(monthZhiIndex) {
  if ([Z.寅, Z.卯, Z.辰].includes(monthZhiIndex)) return 0;
  if ([Z.巳, Z.午, Z.未].includes(monthZhiIndex)) return 1;
  if ([Z.申, Z.酉, Z.戌].includes(monthZhiIndex)) return 2;
  return 3;
}

/** 日干禄位：甲寅 乙卯 丙巳 丁午 戊巳 己午 庚申 辛酉 壬亥 癸子 */
const LU = [Z.寅, Z.卯, Z.巳, Z.午, Z.巳, Z.午, Z.申, Z.酉, Z.亥, Z.子];

/** 天德月支表：正丁二申三壬四辛五亥六甲七癸八寅九丙十乙子巳丑庚 */
const TIAN_DE = {
  2: { gan: G.丁 }, 3: { zhi: Z.申 }, 4: { gan: G.壬 }, 5: { zhi: Z.亥 },
  6: { gan: G.甲 }, 7: { gan: G.癸 }, 8: { zhi: Z.寅 }, 9: { gan: G.丙 },
  10: { gan: G.乙 }, 0: { zhi: Z.巳 }, 1: { gan: G.庚 }, 11: { zhi: Z.未 },
};
const GAN_HE = (i) => (i + 5) % 10; // 五合
const ZHI_HE = (i) => [1, 0, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2][i]; // 六合

export const SHENSHA_RULES = [
  // ================= 一、贵人吉星（17） =================
  {
    name: '天乙贵人', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('丑', '未'), 4: b('丑', '未'), 6: b('丑', '未'),
      1: b('子', '申'), 5: b('子', '申'),
      2: b('亥', '酉'), 3: b('亥', '酉'),
      8: b('卯', '巳'), 9: b('卯', '巳'),
      7: b('寅', '午'),
    }[c.dayGanIndex] || []),
    desc: '传统认为主逢凶化吉、贵人提携，遇事易得外力相助',
    source: '甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢虎马——此是天乙贵人方',
  },
  {
    name: '太极贵人', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('子', '午'), 1: b('子', '午'),
      2: b('卯', '酉'), 3: b('卯', '酉'),
      4: b('辰', '戌', '丑', '未'), 5: b('辰', '戌', '丑', '未'),
      6: b('寅', '亥'), 7: b('寅', '亥'),
      8: b('巳', '申'), 9: b('巳', '申'),
    }[c.dayGanIndex] || []),
    desc: '传统认为主好玄文哲理、钻研心盛，对宗教术数易学有缘',
    source: '甲乙生人子午中，丙丁鸡兔定亨通，戊己两干临四季，庚辛寅亥，壬癸巳申',
  },
  {
    name: '文昌贵人', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('巳'), 1: b('午'), 2: b('申'), 4: b('申'),
      3: b('酉'), 5: b('酉'), 6: b('亥'), 7: b('子'),
      8: b('寅'), 9: b('卯'),
    }[c.dayGanIndex] || []),
    desc: '传统认为主聪明好学、文笔出众，利考试与文书之事',
    source: '甲乙巳午报君知，丙戊申宫丁己鸡，庚猪辛鼠壬逢虎，癸人见卯入云梯',
  },
  {
    name: '国印贵人', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('戌'), 1: b('亥'), 2: b('丑'), 3: b('寅'),
      4: b('丑'), 5: b('寅'), 6: b('辰'), 7: b('巳'),
      8: b('未'), 9: b('申'),
    }[c.dayGanIndex] || []),
    desc: '传统认为主有掌权印之象，处事守信，宜公职与管理岗',
    source: '甲见戌、乙见亥、丙见丑、丁见寅、戊见丑、己见寅、庚见辰、辛见巳、壬见未、癸见申',
  },
  {
    name: '福星贵人', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('寅', '子'), 2: b('寅', '子'),
      1: b('卯', '丑'), 9: b('卯', '丑'),
      4: b('申'), 5: b('未'), 3: b('亥'),
      6: b('午'), 7: b('巳'), 8: b('辰'),
    }[c.dayGanIndex] || []),
    desc: '传统认为主一生衣食安稳、遇难成祥',
    source: '甲丙相邀入虎乡，更游鼠穴最高强；戊猴己未丁宜亥，乙癸逢牛卯禄昌；庚趁马头辛到巳，壬骑龙背喜非常',
  },
  {
    name: '天厨贵人', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('巳'), 1: b('午'), 2: b('子'), 3: b('巳'),
      4: b('午'), 5: b('申'), 6: b('寅'), 7: b('午'),
      8: b('酉'), 9: b('亥'),
    }[c.dayGanIndex] || []),
    desc: '传统认为主食禄丰足、厨艺或饮食行业有缘',
    source: '甲丙爱行双女游，乙丁狮子己金牛，戊坐阴阳庚鱼腹，二千石禄坐皇州',
  },
  {
    name: '金舆', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('辰'), 1: b('巳'), 2: b('未'), 3: b('申'),
      4: b('未'), 5: b('申'), 6: b('戌'), 7: b('亥'),
      8: b('丑'), 9: b('寅'),
    }[c.dayGanIndex] || []),
    desc: '传统认为主得配偶助力、车马之荣，生活条件较优',
    source: '甲龙乙蛇丙戊羊，丁己猴歌庚犬方，辛猪壬牛癸逢虎——禄前二位为金舆',
  },
  {
    name: '天官贵人', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('酉'), 1: b('申'), 2: b('子'), 3: b('亥'),
      4: b('卯'), 5: b('寅'), 6: b('午'), 7: b('巳'),
      8: b('午'), 9: b('巳'),
    }[c.dayGanIndex] || []),
    desc: '传统认为主官禄显达、仕途顺遂，宜公职管理',
    source: '天官者，正官之禄位：甲以辛为官，辛禄在酉，故甲见酉……余干仿此（《渊海子平》）',
  },
  {
    name: '天福贵人', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('巳'), 1: b('午'), 2: b('巳'), 3: b('午'),
      4: b('申'), 5: b('酉'), 6: b('亥'), 7: b('子'),
      8: b('寅'), 9: b('卯'),
    }[c.dayGanIndex] || []),
    desc: '传统认为主福泽绵厚、衣食无忧，多得长辈荫护',
    source: '天福者，食神之禄位：甲以丙为食神，丙禄在巳，故甲见巳……余干仿此',
  },
  {
    name: '天德贵人', cat: '吉', match: 'custom', by: '月令',
    resolve: (c) => TIAN_DE[c.monthZhiIndex] || null,
    desc: '传统认为主心慈量大、多有贵人暗助，可减凶煞之力',
    source: '正丁二坤宫，三壬四辛同，五乾六甲上，七癸八艮逢，九丙十居乙，子巽丑庚中',
  },
  {
    name: '天德合', cat: '吉', match: 'custom', by: '月令',
    resolve: (c) => {
      const td = TIAN_DE[c.monthZhiIndex];
      if (!td) return null;
      return td.gan !== undefined ? { gan: GAN_HE(td.gan) } : { zhi: ZHI_HE(td.zhi) };
    },
    desc: '传统认为与天德同功而力稍缓，主慈祥和缓、暗得扶助',
    source: '天德所合之干支即是：干取五合、支取六合',
  },
  {
    name: '月德贵人', cat: '吉', match: 'gan', by: '月令',
    targets: (c) => [g('壬'), g('丙'), g('庚'), g('甲')][triGroup(c.monthZhiIndex)] || [],
    desc: '传统认为主温厚敬神、灾厄自解',
    source: '寅午戌月在丙，申子辰月在壬，亥卯未月在甲，巳酉丑月在庚',
  },
  {
    name: '月德合', cat: '吉', match: 'gan', by: '月令',
    targets: (c) => [g('丁'), g('辛'), g('乙'), g('己')][triGroup(c.monthZhiIndex)] || [],
    desc: '传统认为与月德同功，主平和暗福',
    source: '月德之五合：申子辰月丁、寅午戌月辛、巳酉丑月乙、亥卯未月己',
  },
  {
    name: '暗月德', cat: '吉', match: 'zhi', by: '月令',
    targets: (c) => [[Z.亥], [Z.巳], [Z.申], [Z.寅]][triGroup(c.monthZhiIndex)] || [],
    desc: '传统认为功同月德而隐密不显，主暗中得福荫',
    source: '暗月德者，月德之禄支：申子辰月壬禄亥、寅午戌月丙禄巳、巳酉丑月庚禄申、亥卯未月甲禄寅',
  },
  {
    name: '德秀贵人', cat: '吉', match: 'gan', by: '月令',
    targets: (c) => ([
      g('丙', '丁'),
      g('壬', '癸'),
      g('庚', '辛'),
      g('甲', '乙'),
    ][triGroup(c.monthZhiIndex)] || []),
    desc: '传统认为主聪慧清贵、学有专长',
    source: '寅午戌月丙丁为德，申子辰月壬癸戊己为德，巳酉丑月庚辛为德，亥卯未月甲乙为德（各配其秀）',
  },
  {
    name: '三奇贵人', cat: '吉', match: 'any', fixed: '四干', by: '四柱天干',
    targets: (c) => {
      const s = [c.stems?.year, c.stems?.month, c.stems?.day, c.stems?.hour];
      if (s.some((x) => x === undefined)) return [];
      const seqs = [[0, 4, 6], [1, 2, 3], [8, 9, 7]]; // 甲戊庚 乙丙丁 壬癸辛
      for (const q of seqs) {
        for (let i = 0; i <= 1; i++) {
          if (s[i] === q[0] && s[i + 1] === q[1] && s[i + 2] === q[2]) return [0];
        }
      }
      return [];
    },
    desc: '传统认为主胸怀卓越、博学多能，为大贵之征',
    source: '天上三奇甲戊庚，地下三奇乙丙丁，人中三奇壬癸辛——须四干顺次而布',
  },
  {
    name: '天赦', cat: '吉', match: 'day', by: '日柱·四季',
    targets: (c) => {
      const s = seasonOf(c.monthZhiIndex);
      return [['戊寅'], ['甲午'], ['戊申'], ['甲子']][s];
    },
    desc: '传统认为主逢凶化吉、忧愁自解，为四时赦免之神',
    source: '春戊寅、夏甲午、秋戊申、冬甲子，四时天赦日',
  },
  {
    name: '天医', cat: '吉', match: 'zhi', by: '月令',
    targets: (c) => [(((c.monthZhiIndex - 1) % 12) + 12) % 12],
    desc: '传统认为主宜从事医药健康相关，或自身康复力强',
    source: '天医者，正月生见丑，二月生见寅，即生月地支之后退一位（前一位）',
  },
  {
    name: '活曜', cat: '吉', match: 'monthzhi', by: '月令',
    targets: (c) => [((c.monthZhiIndex + 1) % 12 + 12) % 12],
    desc: '传统认为主生机灵活、遇事有转圜之机',
    source: '活曜者，居月支之前一位（正月见卯、二月见辰……）',
  },
  {
    name: '学堂', cat: '吉', match: 'zhi', by: '日干五行',
    targets: (c) => ({
      0: [Z.亥], 1: [Z.亥], 2: [Z.寅], 3: [Z.寅],
      4: [Z.申], 5: [Z.申], 6: [Z.巳], 7: [Z.巳],
      8: [Z.申], 9: [Z.申],
    }[c.dayGanIndex] || []),
    desc: '传统认为主聪明好学、利读书功名',
    source: '学堂者，五行长生之位：木命见亥、火命见寅、金命见巳、水土命见申',
  },
  {
    name: '词馆', cat: '吉', match: 'zhi', by: '日干五行',
    targets: (c) => ({
      0: [Z.寅], 1: [Z.寅], 2: [Z.巳], 3: [Z.巳],
      4: [Z.亥], 5: [Z.亥], 6: [Z.申], 7: [Z.申],
      8: [Z.亥], 9: [Z.亥],
    }[c.dayGanIndex] || []),
    desc: '传统认为主文翰出众、利文章学术',
    source: '词馆者，五行临官之位：木命见寅、火命见巳、金命见申、水土命见亥',
  },

  // ================= 二、禄刃类（9） =================
  {
    name: '禄神', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => [LU[c.dayGanIndex]],
    desc: '临官之位，传统认为主俸禄、稳定收入与自立能力',
    source: '甲禄在寅、乙禄在卯、丙戊禄在巳、丁己禄在午、庚禄在申、辛禄在酉、壬禄在亥、癸禄在子',
  },
  {
    name: '建禄', cat: '吉', match: 'monthzhi', by: '日干',
    targets: (c) => [LU[c.dayGanIndex]],
    desc: '传统认为月支为禄，主白手起家、不承祖业而自立成家',
    source: '建禄者，月支值日干临官之位（建禄格之基）',
  },
  {
    name: '暗禄', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: [Z.亥], 1: [Z.戌], 2: [Z.申], 3: [Z.未],
      4: [Z.申], 5: [Z.未], 6: [Z.巳], 7: [Z.辰],
      8: [Z.寅], 9: [Z.丑],
    }[c.dayGanIndex] || []),
    desc: '传统认为主暗中有禄荫扶持、衣食不缺',
    source: '暗禄者，禄位之六合：甲禄寅与亥合、乙禄卯与戌合……癸禄子与丑合',
  },
  {
    name: '归禄', cat: '吉', match: 'hourzhi', by: '日干',
    targets: (c) => [LU[c.dayGanIndex]],
    desc: '传统认为日禄归时，主晚年安泰、晚年得福',
    source: '日禄归时（时支见日干之禄），又名青云得路格',
  },
  {
    name: '专禄', cat: '吉', match: 'day', by: '日柱',
    targets: () => ['甲寅', '乙卯', '庚申', '辛酉'],
    desc: '传统认为日坐专禄，主自坐根基、自立自强，妻宫得力',
    source: '日柱干支同禄：甲寅、乙卯、庚申、辛酉四日为专禄',
  },
  {
    name: '拱禄', cat: '吉', match: 'any', fixed: '日时', by: '日支·时支',
    targets: (c) => {
      const lu = LU[c.dayGanIndex];
      const dz = c.dayZhiIndex, hz = c.hourZhiIndex;
      if (c.stems?.day !== c.stems?.hour) return [];
      return (dz !== undefined && hz !== undefined && (dz + 1) % 12 === lu && (dz + 2) % 12 === hz) ? [0] : [];
    },
    desc: '传统认为日时同干、二支拱出禄位，主功名可期',
    source: '拱禄者，日时同干、日支时支中间虚拱禄位（如癸亥日癸丑时拱子禄）',
  },
  {
    name: '羊刃', cat: '凶', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('卯'), 1: b('寅'), 2: b('午'), 3: b('巳'),
      4: b('午'), 5: b('巳'), 6: b('酉'), 7: b('申'),
      8: b('子'), 9: b('亥'),
    }[c.dayGanIndex] || []),
    desc: '帝旺之极处，传统认为主刚烈果决，亦易有意外伤损，宜以静制动',
    source: '甲卯、乙寅、丙午、丁巳、戊午、己巳、庚酉、辛申、壬子、癸亥为羊刃（禄前一位）',
  },
  {
    name: '飞刃', cat: '凶', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('酉'), 1: b('申'), 2: b('子'), 3: b('亥'),
      4: b('子'), 5: b('亥'), 6: b('卯'), 7: b('寅'),
      8: b('午'), 9: b('巳'),
    }[c.dayGanIndex] || []),
    desc: '羊刃之冲位，传统认为主冲动耗财、易有磕碰损伤',
    source: '飞刃者，羊刃之六冲也',
  },
  {
    name: '日刃', cat: '凶', match: 'day', by: '日柱',
    targets: () => ['丙午', '戊午', '壬子'],
    desc: '传统认为日坐羊刃，主性格刚毅果决，配偶宫带杀气',
    source: '丙午、戊午、壬子三日，日支为日干之刃，为日刃',
  },
  {
    name: '长生', cat: '吉', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: [Z.亥], 1: [Z.午], 2: [Z.寅], 3: [Z.酉],
      4: [Z.寅], 5: [Z.酉], 6: [Z.巳], 7: [Z.子],
      8: [Z.申], 9: [Z.卯],
    }[c.dayGanIndex] || []),
    desc: '传统认为主生命力旺、衣食无虞',
    source: '十干长生：甲亥、乙午、丙寅、丁酉、戊寅、己酉、庚巳、辛子、壬申、癸卯（阳生阴死）',
  },

  // ================= 三、三合神煞（年支/日支三合组，13） =================
  {
    name: '驿马', cat: '中', match: 'zhi', by: '日支',
    targets: (c) => [b('寅'), b('申'), b('亥'), b('巳')][triGroup(c.dayZhiIndex)],
    desc: '传统认为主走动迁移、外出发展，坐不住而多变动',
    source: '申子辰马在寅，寅午戌马在申，巳酉丑马在亥，亥卯未马在巳',
  },
  {
    name: '攀鞍', cat: '中', match: 'zhi', by: '年支',
    targets: (c) => [[Z.丑], [Z.未], [Z.戌], [Z.辰]][triGroup(c.yearZhiIndex)],
    desc: '传统认为主得鞍马之助、出行平安，古为贵征',
    source: '攀鞍者，驿马之后一支：申子辰见丑、寅午戌见未、巳酉丑见戌、亥卯未见辰',
  },
  {
    name: '将星', cat: '吉', match: 'zhi', by: '年支',
    targets: (c) => [b('子'), b('午'), b('酉'), b('卯')][triGroup(c.yearZhiIndex)],
    desc: '传统认为主有统御与担责之能，宜任主导性职务',
    source: '申子辰见子，寅午戌见午，巳酉丑见酉，亥卯未见卯，取三合之中神',
  },
  {
    name: '华盖', cat: '中', match: 'zhi', by: '年支',
    targets: (c) => [b('辰'), b('戌'), b('丑'), b('未')][triGroup(c.yearZhiIndex)],
    desc: '传统认为主聪慧孤高、好独立思考，偏向精神与学术世界',
    source: '申子辰见辰，寅午戌见戌，巳酉丑见丑，亥卯未见未，取三合之墓',
  },
  {
    name: '桃花（咸池）', cat: '中', match: 'zhi', by: '年支',
    targets: (c) => [b('酉'), b('卯'), b('午'), b('子')][triGroup(c.yearZhiIndex)],
    desc: '传统认为主人缘与审美敏锐，异性缘较旺',
    source: '申子辰在酉，寅午戌在卯，巳酉丑在午，亥卯未在子（三合沐浴之位）',
  },
  {
    name: '墙外桃花', cat: '中', match: 'any', fixed: '时支', by: '日支·时支',
    targets: (c) => {
      const t = [Z.酉, Z.卯, Z.午, Z.子][triGroup(c.dayZhiIndex)];
      return (c.hourZhiIndex !== undefined && c.hourZhiIndex === t) ? [0] : [];
    },
    desc: '传统认为桃花落时柱为墙外桃花，主婚后异性缘仍旺，须自律',
    source: '以日支三合起桃花，落时支者为墙外桃花（墙内主恩爱、墙外主风流）',
  },
  {
    name: '劫煞', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [b('巳'), b('亥'), b('寅'), b('申')][triGroup(c.yearZhiIndex)],
    desc: '传统认为主外耗、财物遗失之扰',
    source: '申子辰见巳，寅午戌见亥，巳酉丑见寅，亥卯未见申（三合绝位）',
  },
  {
    name: '灾煞', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [[Z.午], [Z.子], [Z.卯], [Z.酉]][triGroup(c.yearZhiIndex)],
    desc: '传统认为主疾病烦扰，又名白虎煞',
    source: '灾煞者，三合帝旺之冲：申子辰见午，寅午戌见子，巳酉丑见卯，亥卯未见酉',
  },
  {
    name: '天煞', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [[Z.未], [Z.丑], [Z.辰], [Z.戌]][triGroup(c.yearZhiIndex)],
    desc: '传统认为主父兄之位多扰、运途波折',
    source: '天煞者，劫煞后二辰：申子辰见未、寅午戌见丑、巳酉丑见辰、亥卯未见戌',
  },
  {
    name: '地煞', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [[Z.申], [Z.寅], [Z.巳], [Z.亥]][triGroup(c.yearZhiIndex)],
    desc: '传统认为主劳碌奔波、根基多动',
    source: '地煞者，劫煞后三辰：申子辰见申、寅午戌见寅、巳酉丑见巳、亥卯未见亥',
  },
  {
    name: '年煞', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [[Z.酉], [Z.卯], [Z.午], [Z.子]][triGroup(c.yearZhiIndex)],
    desc: '传统认为主少年多磨、祖业难靠',
    source: '年煞者，劫煞后四辰（即三合沐浴之位）：申子辰见酉、寅午戌见卯、巳酉丑见午、亥卯未见子',
  },
  {
    name: '月煞', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [[Z.戌], [Z.辰], [Z.未], [Z.丑]][triGroup(c.yearZhiIndex)],
    desc: '传统认为主母亲兄弟之缘多扰、月内多病',
    source: '月煞者，劫煞后五辰：申子辰见戌、寅午戌见辰、巳酉丑见未、亥卯未见丑',
  },
  {
    name: '亡神', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [b('亥'), b('巳'), b('申'), b('寅')][triGroup(c.yearZhiIndex)],
    desc: '传统认为主心神耗散、易失主见',
    source: '申子辰见亥，寅午戌见巳，巳酉丑见申，亥卯未见寅（三合临官之位）',
  },
  {
    name: '六厄', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [[Z.卯], [Z.酉], [Z.子], [Z.午]][triGroup(c.yearZhiIndex)],
    desc: '传统认为主运途蹇滞、事多阻厄',
    source: '六厄者，三合五行死地：水死卯、火死酉、金死子、木死午——申子辰见卯、寅午戌见酉、巳酉丑见子、亥卯未见午',
  },

  // ================= 四、婚姻情感（8） =================
  {
    name: '红鸾', cat: '吉', match: 'zhi', by: '年支',
    targets: (c) => [((3 - c.yearZhiIndex) % 12 + 12) % 12],
    desc: '传统认为主婚恋喜庆之事',
    source: '子年起卯，逆行；红鸾所在对冲为天喜',
  },
  {
    name: '天喜', cat: '吉', match: 'zhi', by: '年支',
    targets: (c) => [(((3 - c.yearZhiIndex) % 12 + 12) % 12 + 6) % 12],
    desc: '传统认为主添丁置业、喜庆顺遂',
    source: '红鸾之对冲即天喜',
  },
  {
    name: '四时天喜', cat: '吉', match: 'monthzhi', by: '月令·四季',
    targets: (c) => [[Z.戌], [Z.丑], [Z.辰], [Z.未]][seasonOf(c.monthZhiIndex)],
    desc: '传统认为主喜事临门、谋事顺遂',
    source: '春戌、夏丑、秋辰、冬未——四时天喜以月支季节查（《渊海子平》）',
  },
  {
    name: '红艳煞', cat: '中', match: 'zhi', by: '日干',
    targets: (c) => ({
      0: b('午'), 1: b('申'), 2: b('寅'), 3: b('未'),
      4: b('辰'), 5: b('辰'), 6: b('戌'), 7: b('酉'),
      8: b('子'), 9: b('申'),
    }[c.dayGanIndex] || []),
    desc: '传统认为主风流多情、异性吸引力强',
    source: '多情多欲少人知，六丙逢寅辛见鸡，癸临申上丁见未，甲午乙申庚怕戌，戊己龙蛇壬怕子',
  },
  {
    name: '童子煞', cat: '凶', match: 'any', fixed: '日支', by: '月令季节',
    targets: (c) => {
      // 春秋寅子贵，冬夏卯未辰（按出生月令季节查日支；时支同见者民间称轻，此处不单列）
      const s = seasonOf(c.monthZhiIndex);
      const t = (s === 0 || s === 2) ? [Z.寅, Z.子] : [Z.卯, Z.未, Z.辰];
      return t.includes(c.dayZhiIndex) ? [0] : [];
    },
    desc: '传统认为命带童子者体质偏弱、亲缘与婚缘易有波折；主查日支，时支同见者民间另论轻重。口诀另有一套「纳音童子」查法，两法同见者称真童子（另列一项）',
    source: '春秋寅子贵，冬夏卯未辰（以月令季节查日支：春秋见寅子，冬夏见卯未辰）',
  },
  {
    name: '真童子', cat: '凶', match: 'any', fixed: '日支／时支', by: '月令季节＋年柱纳音',
    targets: (c) => {
      // 季节法与纳音法同见一支者为真童子（金木马卯合，水火鸡犬多，土命逢辰巳）
      const s = seasonOf(c.monthZhiIndex);
      const seasonT = (s === 0 || s === 2) ? [Z.寅, Z.子] : [Z.卯, Z.未, Z.辰];
      const yIdx = indexOfGanzhi(c.yearGanIndex, c.yearZhiIndex);
      const nw = yIdx >= 0 ? nayinOfIndex(yIdx).slice(-1) : '';
      const nayinT = (nw === '金' || nw === '木') ? [Z.午, Z.卯]
        : (nw === '水' || nw === '火') ? [Z.酉, Z.戌]
          : nw === '土' ? [Z.辰, Z.巳] : [];
      const both = seasonT.filter((z) => nayinT.includes(z));
      if (!both.length) return [];
      return (both.includes(c.dayZhiIndex) || both.includes(c.hourZhiIndex)) ? [0] : [];
    },
    desc: '民间以季节法与纳音法同见一支者为「真童子」，较单见者更受重视；仅作传统文化参考，不作任何断言',
    source: '春秋寅子贵，冬夏卯未辰；金木马卯合，水火鸡犬多，土命逢辰巳——两法同见一支者为真童子',
  },
  {
    name: '孤鸾煞', cat: '凶', match: 'day', by: '日柱',
    targets: () => ['乙巳', '丁巳', '辛亥', '戊申', '甲寅', '丙午', '戊午', '壬子'],
    desc: '传统认为主婚姻多波折、聚少离多',
    source: '木火逢蛇大不祥，金猪何必强猖狂，土猴木虎夫何在，时对孤鸾舞一场',
  },
  {
    name: '阴差阳错', cat: '中', match: 'day', by: '日柱',
    targets: () => ['丙子', '丁丑', '戊寅', '辛卯', '壬辰', '癸巳', '丙午', '丁未', '戊申', '辛酉', '壬戌', '癸亥'],
    desc: '传统认为主婚姻家事易有周折，重在沟通经营',
    source: '丙子、丁丑、戊寅、辛卯、壬辰、癸巳、丙午、丁未、戊申、辛酉、壬戌、癸亥十二日为阴阳差错',
  },
  {
    name: '阴阳煞', cat: '中', match: 'any', fixed: '日柱', by: '日柱·男女',
    targets: (c) => {
      const dayName = GAN[c.dayGanIndex] + ZHI[c.dayZhiIndex];
      const isF = c.gender === 'female';
      return ((isF && dayName === '戊午') || (!isF && dayName === '丙子')) ? [0] : [];
    },
    desc: '传统认为女命戊午为正阳之阴、男命丙子为正阴之阳，主性情阴差阳错、婚缘蹊跷',
    source: '女命戊午，旺火正阳之位而居阴干；男命丙子，旺水正阴之位而居阳干',
  },
  {
    name: '孤辰', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => ({
      11: b('寅'), 0: b('寅'), 1: b('寅'),
      2: b('巳'), 3: b('巳'), 4: b('巳'),
      5: b('申'), 6: b('申'), 7: b('申'),
      8: b('亥'), 9: b('亥'), 10: b('亥'),
    }[c.yearZhiIndex] || []),
    desc: '传统认为主六亲缘薄、易感孤独',
    source: '亥子丑见寅，寅卯辰见巳，巳午未见申，申酉戌见亥',
  },
  {
    name: '寡宿', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => ({
      11: b('戌'), 0: b('戌'), 1: b('戌'),
      2: b('丑'), 3: b('丑'), 4: b('丑'),
      5: b('辰'), 6: b('辰'), 7: b('辰'),
      8: b('未'), 9: b('未'), 10: b('未'),
    }[c.yearZhiIndex] || []),
    desc: '传统认为主晚婚或配偶常离之象',
    source: '亥子丑见戌，寅卯辰见丑，巳午未见辰，申酉戌见未',
  },
  {
    name: '埋儿煞', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => ({
      0: b('丑'), 1: b('卯'), 2: b('申'), 3: b('丑'),
      4: b('卯'), 5: b('申'), 6: b('丑'), 7: b('卯'),
      8: b('申'), 9: b('丑'), 10: b('卯'), 11: b('申'),
    }[c.yearZhiIndex] || []),
    desc: '传统认为主子息缘薄、得子较迟',
    source: '埋儿杀以年支取：子见丑、丑见卯、寅见申、卯见丑……亥见申',
  },

  // ================= 五、凶煞杂煞（20） =================
  {
    name: '元辰', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => {
      if (c.yearZhiIndex === undefined) return [];
      const chong = (c.yearZhiIndex + 6) % 12;
      const yangYear = c.yearGanYang !== undefined ? c.yearGanYang : true;
      const isFemale = c.gender === 'female';
      const yangMale = yangYear && !isFemale; // 阳男阴女冲前一位，阴男阳女冲后一位
      const forward = yangMale || (!yangYear && isFemale);
      return [forward ? (chong + 11) % 12 : (chong + 1) % 12];
    },
    desc: '传统认为主耗散阻滞、事多迂回；阳男阴女取冲前一位，阴男阳女取冲后一位',
    source: '元辰者，阳男阴女在年支对冲之前一位，阴男阳女在对冲之后一位',
  },
  {
    name: '勾煞', cat: '凶', match: 'zhi', by: '年支·男女',
    targets: (c) => {
      if (c.yearZhiIndex === undefined) return [];
      const yangYear = c.yearGanYang !== undefined ? c.yearGanYang : true;
      const isFemale = c.gender === 'female';
      const forward = (yangYear && !isFemale) || (!yangYear && isFemale);
      return [forward ? (c.yearZhiIndex + 3) % 12 : (c.yearZhiIndex + 9) % 12];
    },
    desc: '传统认为主牵连纠缠、事多勾绊；阳男阴女勾在岁前三辰，阴男阳女反之',
    source: '勾绞煞：阳男阴女，命前三辰为勾、后三辰为绞；阴男阳女互换',
  },
  {
    name: '绞煞', cat: '凶', match: 'zhi', by: '年支·男女',
    targets: (c) => {
      if (c.yearZhiIndex === undefined) return [];
      const yangYear = c.yearGanYang !== undefined ? c.yearGanYang : true;
      const isFemale = c.gender === 'female';
      const forward = (yangYear && !isFemale) || (!yangYear && isFemale);
      return [forward ? (c.yearZhiIndex + 9) % 12 : (c.yearZhiIndex + 3) % 12];
    },
    desc: '传统认为主口舌是非、人际绞缠',
    source: '勾绞煞：阳男阴女，命前三辰为勾、后三辰为绞；阴男阳女互换',
  },
  {
    name: '破碎煞', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => {
      const r = c.yearZhiIndex % 3;
      return [r === 2 ? Z.酉 : r === 0 ? Z.巳 : Z.丑];
    },
    desc: '传统认为主器物破败、财帛耗损、事多破而复起',
    source: '四孟金鸡四仲蛇，四季逢丑是破碎——寅申巳亥见酉、子午卯酉见巳、辰戌丑未见丑',
  },
  {
    name: '流霞', cat: '凶', match: 'zhi', by: '日干',
    targets: (c) => [[Z.酉], [Z.戌], [Z.未], [Z.申], [Z.巳], [Z.午], [Z.辰], [Z.卯], [Z.亥], [Z.寅]][c.dayGanIndex] || [],
    desc: '传统认为主健康宜慎：男忌酒色、女忌产育期间多加养护，逢冲之岁月尤须谨慎',
    source: '甲鸡乙犬丙羊加，丁猴戊巳日时查，己马庚龙辛见兔，壬猪癸虎是流霞',
  },
  {
    name: '血刃', cat: '凶', match: 'zhi', by: '月令',
    targets: (c) => ({
      2: b('丑'), 3: b('未'), 4: b('寅'), 5: b('申'),
      6: b('卯'), 7: b('酉'), 8: b('辰'), 9: b('戌'),
      10: b('巳'), 11: b('亥'), 0: b('午'), 1: b('子'),
    }[c.monthZhiIndex] || []),
    desc: '传统认为主意外伤害、开刀见血之事，宜日常谨慎',
    source: '血刃以月支查：寅月丑、卯月未、辰月寅、巳月申、午月卯、未月酉、申月辰、酉月戌、戌月巳、亥月亥、子月午、丑月子',
  },
  {
    name: '隔角煞', cat: '凶', match: 'any', fixed: '日时', by: '日支·时支',
    targets: (c) => {
      const dz = c.dayZhiIndex, hz = c.hourZhiIndex;
      return (dz !== undefined && hz !== undefined && (dz + 2) % 12 === hz) ? [0] : [];
    },
    desc: '传统认为主六亲情分疏离、聚少离多',
    source: '隔角者，日支与时支中间隔一位地支（如子日寅时、丑日卯时）',
  },
  {
    name: '三丘', cat: '凶', match: 'monthzhi', by: '月令·四季',
    targets: (c) => [[Z.丑], [Z.辰], [Z.未], [Z.戌]][seasonOf(c.monthZhiIndex)],
    desc: '传统认为主坟茔之扰、思亲怀故之情重',
    source: '三丘五墓：春生丑、夏生辰、秋生未、冬生戌',
  },
  {
    name: '五墓', cat: '凶', match: 'monthzhi', by: '月令·四季',
    targets: (c) => [[Z.未], [Z.戌], [Z.丑], [Z.辰]][seasonOf(c.monthZhiIndex)],
    desc: '传统认为主做事成而复败、宜守不宜攻',
    source: '五墓者：春未、夏戌、秋丑、冬辰（与三丘互为表里）',
  },
  {
    name: '月破', cat: '凶', match: 'zhi', by: '月令',
    targets: (c) => [((c.monthZhiIndex + 6) % 12 + 12) % 12],
    desc: '传统认为月破之支诸事不宜、逢之易破败',
    source: '月破者，与月支相冲之支是也（如寅月见申）',
  },
  {
    name: '天地转杀', cat: '凶', match: 'dayzhi', by: '日支·四季',
    targets: (c) => [[Z.卯], [Z.午], [Z.酉], [Z.子]][seasonOf(c.monthZhiIndex)],
    desc: '传统认为主行事逆势而动、干支与季节旺气相悖',
    source: '春兔夏马天地转，秋鸡冬鼠便为殃——春卯、夏午、秋酉、冬子，日支见之（干支俱全者重）',
  },
  {
    name: '天火煞', cat: '凶', match: 'any', fixed: '三合火局', by: '四柱地支',
    targets: (c) => {
      const zs = [c.yearZhiIndex, c.monthZhiIndex, c.dayZhiIndex, c.hourZhiIndex];
      if (zs.some((x) => x === undefined)) return [];
      return [Z.寅, Z.午, Z.戌].every((x) => zs.includes(x)) ? [0] : [];
    },
    desc: '传统认为三合火局全者带天火之象，四柱无水制则尤须防火厄',
    source: '寅午戌全号天火，不见丙丁犹自可；五位都无水神，生旺临年灾厄火',
  },
  {
    name: '天刑煞', cat: '凶', match: 'any', fixed: '时干', by: '年支·时干',
    targets: (c) => {
      const yz = c.yearZhiIndex;
      if (yz === undefined) return [];
      const T = { 0: 1, 1: 1, 2: 6, 3: 7, 4: 7, 5: 8, 6: 9, 7: 9, 8: 2, 9: 3, 10: 3, 11: 4 };
      return c.stems?.hour === T[yz] ? [0] : [];
    },
    desc: '传统认为时干刑克年命，主与尊上缘薄、行事多刑伤之象',
    source: '天刑煞：子丑人乙时、寅人庚时、卯辰人辛时、巳人壬时、午未人癸时、申人丙时、酉戌人丁时、亥人戊时',
  },
  {
    name: '铁扫帚', cat: '凶', match: 'any', fixed: '年月·男女', by: '年支·农历月',
    targets: (c) => {
      const yz = c.yearZhiIndex;
      if (yz === undefined || c.lunarMonth === undefined) return [];
      const tri = triGroup(yz);
      const maleM = [1, 4, 6, 2][tri];
      const femaleM = [12, 7, 9, 8][tri];
      const isF = c.gender === 'female';
      return c.lunarMonth === (isF ? femaleM : maleM) ? [0] : [];
    },
    desc: '传统认为主破财败家之象（民俗婚配常忌），重在勤俭经营',
    source: '申子辰男正女腊、巳酉丑男六女九、寅午戌男四女七、亥卯未男二女八（以农历月与性别查）',
  },
  {
    name: '五鬼星', cat: '凶', match: 'monthzhi', by: '月令',
    targets: (c) => [((c.monthZhiIndex + 2) % 12 + 12) % 12],
    desc: '传统认为主暗耗是非、小人缠绕',
    source: '五鬼星以月支查：子见辰、丑见巳、寅见午……顺行二位',
  },
  {
    name: '丧门', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [((c.yearZhiIndex + 2) % 12 + 12) % 12],
    desc: '传统认为主孝服哭泣之事，忌临丧仪之地',
    source: '丧门者，岁前二辰也（子年见寅、丑年见卯……）',
  },
  {
    name: '吊客', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [((c.yearZhiIndex + 10) % 12 + 12) % 12],
    desc: '传统认为主吊丧探病之扰、亲友之悲',
    source: '吊客者，岁后二辰也（子年见戌、丑年见亥……）',
  },
  {
    name: '披麻', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [((c.yearZhiIndex + 9) % 12 + 12) % 12],
    desc: '传统认为主戴孝服丧之象、心情悲戚之事',
    source: '披麻者，岁后三辰也（子年见酉、丑年见戌……）',
  },
  {
    name: '官符（五鬼）', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [((c.yearZhiIndex + 4) % 12 + 12) % 12],
    desc: '传统认为主官非口舌、文书纠纷之扰',
    source: '官符者，岁前四辰（第五位五鬼星）：子年见辰、丑年见巳……',
  },
  {
    name: '死符（小耗）', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [((c.yearZhiIndex + 5) % 12 + 12) % 12],
    desc: '传统认为主小耗破财、疾病之扰',
    source: '死符者，岁前五辰（第六位），又名小耗',
  },
  {
    name: '岁破（大耗）', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [((c.yearZhiIndex + 6) % 12 + 12) % 12],
    desc: '传统认为主大耗钱财、破败之象',
    source: '岁破者，岁前六辰（第七位），即年支对冲，又名大耗',
  },
  {
    name: '白虎', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [((c.yearZhiIndex + 8) % 12 + 12) % 12],
    desc: '传统认为主伤病烦扰、宜慎养护',
    source: '白虎者，岁后四辰（第九位）：子年见申、丑年见酉……',
  },
  {
    name: '病符', cat: '凶', match: 'zhi', by: '年支',
    targets: (c) => [((c.yearZhiIndex + 11) % 12 + 12) % 12],
    desc: '传统认为主疾病缠绵、健康之扰',
    source: '病符者，岁后一辰（第十二位）：子年见亥、丑年见子……',
  },
  {
    name: '天罗', cat: '凶', match: 'any', fixed: '四支', by: '年支·日支',
    targets: (c) => ([Z.戌, Z.亥].includes(c.yearZhiIndex) || [Z.戌, Z.亥].includes(c.dayZhiIndex)) ? [Z.戌, Z.亥] : [],
    desc: '传统认为主疾病与官非之扰，宜行事谨慎（文化象征意义）',
    source: '戌亥为天罗，辰巳为地网，火命人尤忌戌亥',
  },
  {
    name: '地网', cat: '凶', match: 'any', fixed: '四支', by: '年支·日支',
    targets: (c) => ([Z.辰, Z.巳].includes(c.yearZhiIndex) || [Z.辰, Z.巳].includes(c.dayZhiIndex)) ? [Z.辰, Z.巳] : [],
    desc: '传统认为主困滞牵缠之扰，宜守正待时',
    source: '戌亥为天罗，辰巳为地网，水命人尤忌辰巳',
  },

  // ================= 六、空亡类（2） =================
  {
    name: '空亡', cat: '中', match: 'zhi', by: '日柱',
    targets: (c) => {
      let idx = -1;
      for (let i = 0; i < 60; i++) {
        if (i % 10 === c.dayGanIndex && i % 12 === c.dayZhiIndex) { idx = i; break; }
      }
      if (idx < 0) return [];
      const xun = idx - (idx % 10); // 所在旬首（甲位）
      return [(xun + 10) % 12, (xun + 11) % 12];
    },
    desc: '旬空之支，传统认为其宫位所主六亲之力虚而不实，逢合逢冲可解',
    source: '甲子旬戌亥空、甲戌旬申酉空……以日柱所在旬查四柱地支',
  },
  {
    name: '截路空亡', cat: '凶', match: 'hourzhi', by: '日干',
    targets: (c) => ({
      0: b('申', '酉'), 5: b('申', '酉'),
      1: b('午', '未'), 6: b('午', '未'),
      2: b('辰', '巳'), 7: b('辰', '巳'),
      3: b('寅', '卯'), 8: b('寅', '卯'),
      4: b('子', '丑'), 9: b('子', '丑'),
    }[c.dayGanIndex] || []),
    desc: '传统认为时遇截路，主谋事中途受阻、行路遇阻之象',
    source: '甲己日申酉时、乙庚日午未时、丙辛日辰巳时、丁壬日寅卯时、戊癸日子丑时',
  },

  // ================= 七、日柱特殊日（10） =================
  {
    name: '魁罡', cat: '中', match: 'day', by: '日柱',
    targets: () => ['庚辰', '庚戌', '壬辰', '戊戌'],
    desc: '传统认为主性刚聪明、有决断力，逢冲则易生波折',
    source: '壬辰庚戌与庚辰，戊戌魁罡四座神，不见财官刑煞并，身行旺地贵无伦',
  },
  {
    name: '十灵日', cat: '吉', match: 'day', by: '日柱',
    targets: () => ['甲辰', '乙亥', '丙辰', '丁酉', '戊午', '庚戌', '庚寅', '辛亥', '壬寅', '癸未'],
    desc: '传统认为主聪灵通达、领悟力强',
    source: '甲辰乙亥丙辰丁酉戊午庚戌庚寅辛亥壬寅癸未为十灵日',
  },
  {
    name: '日德', cat: '吉', match: 'day', by: '日柱',
    targets: () => ['甲寅', '丙辰', '戊辰', '庚辰', '壬戌'],
    desc: '传统认为主心地厚道、多遇援助',
    source: '甲寅、丙辰、戊辰、庚辰、壬戌五日为日德',
  },
  {
    name: '日贵', cat: '吉', match: 'day', by: '日柱',
    targets: () => ['丁酉', '丁亥', '癸卯', '癸巳'],
    desc: '传统认为日支坐天乙贵人，主气质清贵、多得尊长提携',
    source: '丁酉、丁亥、癸卯、癸巳四日，天乙贵人在日支，为日贵',
  },
  {
    name: '六秀日', cat: '中', match: 'day', by: '日柱',
    targets: () => ['丙午', '丁未', '戊子', '戊午', '己丑', '己未'],
    desc: '传统认为主生性聪敏、秀气内藏，文才艺术有缘',
    source: '丙午、丁未、戊子、戊午、己丑、己未六日为六秀',
  },
  {
    name: '八专', cat: '中', match: 'day', by: '日柱',
    targets: () => ['甲寅', '乙卯', '丁未', '戊戌', '己未', '庚申', '辛酉', '癸丑'],
    desc: '传统认为干支同气（八专），主性情率直、行事专一',
    source: '甲寅、乙卯、丁未、戊戌、己未、庚申、辛酉、癸丑八日为八专（干支同气）',
  },
  {
    name: '九丑', cat: '凶', match: 'day', by: '日柱',
    targets: () => ['丁酉', '戊子', '戊午', '己卯', '己酉', '辛卯', '辛酉', '壬子', '壬午'],
    desc: '传统认为主自尊心强、情事易有风波',
    source: '丁酉、戊子、戊午、己卯、己酉、辛卯、辛酉、壬子、壬午九日为九丑',
  },
  {
    name: '十恶大败', cat: '凶', match: 'day', by: '日柱',
    targets: () => ['甲辰', '乙巳', '壬申', '丙申', '丁亥', '庚辰', '戊戌', '癸亥', '辛巳', '己丑'],
    desc: '传统认为又称无禄日，主财禄难聚、宜开源节流',
    source: '甲辰乙巳与壬申，丙申丁亥及庚辰，戊戌癸亥辛巳己丑，仓库存金化作尘（十日禄入空亡）',
  },
  {
    name: '四废', cat: '凶', match: 'day', by: '日柱·四季',
    targets: (c) => {
      const s = seasonOf(c.monthZhiIndex);
      return [['庚申', '辛酉'], ['壬子', '癸亥'], ['甲寅', '乙卯'], ['丙午', '丁巳']][s];
    },
    desc: '传统认为主做事有始无终、身弱多疲，宜专一深耕',
    source: '春庚申辛酉、夏壬子癸亥、秋甲寅乙卯、冬丙午丁巳——干支与季节旺气相悖为四废',
  },
  {
    name: '进神', cat: '吉', match: 'day', by: '日柱',
    targets: () => ['甲子', '甲午', '己卯', '己酉'],
    desc: '传统认为主凡事积极精进、进取得功',
    source: '甲子甲午阳进神，己卯己酉号为阴；男带进神多出众，女带进神穿戴好风光',
  },
  {
    name: '退神', cat: '凶', match: 'day', by: '日柱',
    targets: () => ['壬辰', '壬戌', '丁丑', '丁未'],
    desc: '传统认为主遇事易退、进退失据，宜谋定后动',
    source: '壬辰壬戌丁丑丁未为退神：若问退神不是强，两家财帛各分光',
  },

  // ================= 八、时柱/结构类（10） =================
  {
    name: '金神', cat: '凶', match: 'hour', by: '时柱',
    targets: () => ['乙丑', '己巳', '癸酉'],
    desc: '传统认为时带金神，主性格刚毅、入火乡而发，忌水乡',
    source: '金神者：乙丑、己巳、癸酉三时也——金神入火乡，富贵天下响',
  },
  {
    name: '禄马交驰', cat: '吉', match: 'any', fixed: '时柱', by: '日支·时干',
    targets: (c) => {
      const dz = c.dayZhiIndex, hg = c.stems?.hour, hz = c.hourZhiIndex;
      if (dz === undefined || hg === undefined || hz === undefined) return [];
      const tri = triGroup(dz);
      const horse = [Z.寅, Z.申, Z.亥, Z.巳][tri]; // 申子辰寅、寅午戌申、巳酉丑亥、亥卯未巳
      const reqGan = { 0: [0], 1: [6], 2: [8], 3: [2, 4] }[tri]; // 甲、庚、壬、丙戊
      return hz === horse && reqGan.includes(hg) ? [0] : [];
    },
    desc: '传统认为禄马同宫交驰，主升迁发财、名利兼得',
    source: '寅午戌马在申时干得庚，亥卯未马在巳时干得丙戊，申子辰马在寅时干得甲，巳酉丑马在亥时干得壬——忌冲破空亡',
  },
  {
    name: '天元一气', cat: '吉', match: 'any', fixed: '四干', by: '四柱天干',
    targets: (c) => {
      const s = [c.stems?.year, c.stems?.month, c.stems?.day, c.stems?.hour];
      return s.every((x) => x !== undefined) && new Set(s).size === 1 ? [0] : [];
    },
    desc: '传统认为四干纯一，为特殊命式，气象专一而气势宏大',
    source: '天元一气格：四柱天干同为一字（如四甲、四乙等）',
  },
  {
    name: '四生（四马）', cat: '中', match: 'any', fixed: '四支', by: '四柱地支',
    targets: (c) => {
      const zs = [c.yearZhiIndex, c.monthZhiIndex, c.dayZhiIndex, c.hourZhiIndex];
      if (zs.some((x) => x === undefined)) return [];
      const ok = new Set(zs).size === 4 && zs.every((x) => [Z.寅, Z.申, Z.巳, Z.亥].includes(x));
      return ok ? [0] : [];
    },
    desc: '传统认为四支全寅申巳亥（五行长生之地），主一生多动多变化',
    source: '寅申巳亥为四生（四马）之地，四支全者谓之四生局',
  },
  {
    name: '四正（四败）', cat: '中', match: 'any', fixed: '四支', by: '四柱地支',
    targets: (c) => {
      const zs = [c.yearZhiIndex, c.monthZhiIndex, c.dayZhiIndex, c.hourZhiIndex];
      if (zs.some((x) => x === undefined)) return [];
      const ok = new Set(zs).size === 4 && zs.every((x) => [Z.子, Z.午, Z.卯, Z.酉].includes(x));
      return ok ? [0] : [];
    },
    desc: '传统认为四支全子午卯酉（沐浴之地），主性情鲜明、爱憎强烈',
    source: '子午卯酉为四正（四败、桃花之地），四支全者谓之四正局',
  },
  {
    name: '四库（四墓）', cat: '中', match: 'any', fixed: '四支', by: '四柱地支',
    targets: (c) => {
      const zs = [c.yearZhiIndex, c.monthZhiIndex, c.dayZhiIndex, c.hourZhiIndex];
      if (zs.some((x) => x === undefined)) return [];
      const ok = new Set(zs).size === 4 && zs.every((x) => [Z.辰, Z.戌, Z.丑, Z.未].includes(x));
      return ok ? [0] : [];
    },
    desc: '传统认为四支全辰戌丑未（墓库之地），主沉稳厚藏、物聚而不露',
    source: '辰戌丑未为四库（四墓）之地，四支全者谓之四库局',
  },
  {
    name: '天干连珠', cat: '吉', match: 'any', fixed: '四干', by: '四柱天干',
    targets: (c) => {
      const s = [c.stems?.year, c.stems?.month, c.stems?.day, c.stems?.hour];
      if (s.some((x) => x === undefined)) return [];
      const ok = (s[1] - s[0] + 10) % 10 === 1 && (s[2] - s[0] + 10) % 10 === 2 && (s[3] - s[0] + 10) % 10 === 3;
      return ok ? [0] : [];
    },
    desc: '传统认为四干依次相连（如甲乙丙丁），主气势连贯、发展顺遂',
    source: '天干连珠：年月日时天干依次相连为一气而生',
  },
  {
    name: '地支连茹', cat: '吉', match: 'any', fixed: '四支', by: '四柱地支',
    targets: (c) => {
      const zs = [c.yearZhiIndex, c.monthZhiIndex, c.dayZhiIndex, c.hourZhiIndex];
      if (zs.some((x) => x === undefined)) return [];
      const ok = (zs[1] - zs[0] + 12) % 12 === 1 && (zs[2] - zs[0] + 12) % 12 === 2 && (zs[3] - zs[0] + 12) % 12 === 3;
      return ok ? [0] : [];
    },
    desc: '传统认为四支依次相连（如子丑寅卯），主根基绵密、步步而升',
    source: '地支连茹：年月日时地支依次相连（顺连为顺茹）',
  },
  {
    name: '天干三朋', cat: '中', match: 'any', fixed: '四干', by: '四柱天干',
    targets: (c) => {
      const s = [c.stems?.year, c.stems?.month, c.stems?.day, c.stems?.hour];
      if (s.some((x) => x === undefined)) return [];
      return s.some((x) => s.filter((y) => y === x).length === 3) ? [0] : [];
    },
    desc: '传统认为三干同气（三朋），主某一五行势力偏重、性情偏执而专',
    source: '天干三朋：四干之中三字相同（如三甲一乙）',
  },
  {
    name: '两干不杂', cat: '吉', match: 'any', fixed: '四干', by: '四柱天干',
    targets: (c) => {
      const s = [c.stems?.year, c.stems?.month, c.stems?.day, c.stems?.hour];
      if (s.some((x) => x === undefined)) return [];
      return s[0] === s[2] && s[1] === s[3] && s[0] !== s[1] ? [0] : [];
    },
    desc: '传统认为两干两两不杂（如甲乙甲乙），主命式清而不杂',
    source: '两干不杂：年日同干、月时同干，两干相间而不杂',
  },
  {
    name: '墙内桃花', cat: '吉', match: 'any', fixed: '年月支', by: '日支·年月',
    targets: (c) => {
      const t = [Z.酉, Z.卯, Z.午, Z.子][triGroup(c.dayZhiIndex)];
      if (c.hourZhiIndex === t) return []; // 时支见者为墙外，另计
      const zs = [c.yearZhiIndex, c.monthZhiIndex];
      return zs.some((x) => x === t) ? [0] : [];
    },
    desc: '传统认为桃花在年月为墙内桃花，主夫妻恩爱、家庭情趣佳',
    source: '以日支三合起桃花，落年月二支者为墙内桃花（与时支墙外桃花相对）',
  },
  {
    name: '悬针', cat: '凶', match: 'any', fixed: '四柱字形', by: '四柱字形',
    targets: (c) => {
      const s = [c.stems?.year, c.stems?.month, c.stems?.day, c.stems?.hour];
      const zs = [c.yearZhiIndex, c.monthZhiIndex, c.dayZhiIndex, c.hourZhiIndex];
      if (s.some((x) => x === undefined) || zs.some((x) => x === undefined)) return [];
      const chars = s.map((x) => GAN[x]).join('') + zs.map((x) => ZHI[x]).join('');
      const set = ['甲', '辛', '卯', '午', '申']; // 字形如悬针之字
      const n = [...chars].filter((ch) => set.includes(ch)).length;
      return n >= 3 ? [0] : [];
    },
    desc: '传统认为柱中「甲、辛、卯、午、申」等悬针字形偏多，主劳碌操心之象',
    source: '悬针煞：柱中多见甲、辛、卯、午、申等字形如针之字（三字以上）',
  },
  {
    name: '破月（骨髓破）', cat: '凶', match: 'any', fixed: '年月·男女', by: '年支·农历月',
    targets: (c) => {
      const yz = c.yearZhiIndex;
      if (yz === undefined || c.lunarMonth === undefined) return [];
      const isF = c.gender === 'female';
      if (isF) {
        // 女破月：正月卯未亥、三月寅午戌、四月丑巳酉、六月子辰申
        const T = { 1: [Z.卯, Z.未, Z.亥], 3: [Z.寅, Z.午, Z.戌], 4: [Z.丑, Z.巳, Z.酉], 6: [Z.子, Z.辰, Z.申] };
        return (T[c.lunarMonth] || []).includes(yz) ? [0] : [];
      }
      // 男破月歌：正蛇二鼠三月牛，四猴五兔六月狗，七猪八马九羊头，十月虎、冬月鸡、腊月龙
      const maleM = { 0: 2, 1: 12, 2: 3, 3: 5, 4: 12, 5: 6, 6: 8, 7: 9, 8: 4, 9: 1, 10: 6, 11: 10 };
      // 上表按年支索引：巳1 鼠2 牛3 猴4 兔5 狗6 亥7 午8 未9 寅10 酉11 辰12 —— 重写为直表
      const M = { 5: 1, 0: 2, 1: 3, 8: 4, 3: 5, 10: 6, 11: 7, 6: 8, 7: 9, 2: 10, 9: 11, 4: 12 };
      void maleM;
      return M[yz] === c.lunarMonth ? [0] : [];
    },
    desc: '传统认为生于破月（骨髓破），主亲缘聚散、事宜勤俭稳守',
    source: '男破月：正蛇二鼠三月牛，四猴五兔六月狗，七猪八马九羊头，十月猛虎冬金鸡，腊月老龙不抬头；女破月：正月兔羊猪、三月虎马狗、四月牛蛇鸡、六月鼠龙猴',
  },
  {
    name: '冲天煞', cat: '凶', match: 'any', fixed: '年月/日时', by: '年月·日时',
    targets: (c) => {
      const s = [c.stems?.year, c.stems?.month, c.stems?.day, c.stems?.hour];
      const zs = [c.yearZhiIndex, c.monthZhiIndex, c.dayZhiIndex, c.hourZhiIndex];
      if (s.some((x) => x === undefined) || zs.some((x) => x === undefined)) return [];
      const ym = s[0] === s[1] && zs[0] === zs[1];
      const dh = s[2] === s[3] && zs[2] === zs[3];
      return (ym || dh) ? [0] : [];
    },
    desc: '传统认为年月或日时干支全同（伏吟），主少年多磨、运途反复',
    source: '生日对时人短寿，生年对月寿不长——年月同、日时同为冲天煞',
  },
  {
    name: '水溺煞', cat: '凶', match: 'day', by: '日柱',
    targets: () => ['丙子', '癸未', '癸丑'],
    desc: '传统认为主涉水之厄，日常忌冒险戏水（带咸池、金神、羊刃者尤重）',
    source: '水溺煞：丙子、癸未、癸丑三日见之，带咸池、金神、羊刃者重',
  },
];

const POS_LABEL = { yearZhiIndex: '年支', monthZhiIndex: '月支', dayZhiIndex: '日支', hourZhiIndex: '时支' };
const GAN_LABEL = { year: '年干', month: '月干', day: '日干', hour: '时干' };

/**
 * 计算全部神煞
 * @param {object} c 上下文：
 *   yearGanIndex/yearZhiIndex/monthZhiIndex/dayGanIndex/dayZhiIndex/hourZhiIndex
 *   stems: { year, month, day, hour } 天干索引
 *   gender: 'male'|'female'；yearGanYang: 年干是否阳；lunarMonth: 农历月（铁扫帚用）
 */
export function computeShensha(c) {
  const out = [];
  const zhiList = [
    { k: 'yearZhiIndex', i: c.yearZhiIndex },
    { k: 'monthZhiIndex', i: c.monthZhiIndex },
    { k: 'dayZhiIndex', i: c.dayZhiIndex },
    { k: 'hourZhiIndex', i: c.hourZhiIndex },
  ];
  const ganList = [
    { k: 'year', i: c.stems?.year },
    { k: 'month', i: c.stems?.month },
    { k: 'day', i: c.stems?.day },
    { k: 'hour', i: c.stems?.hour },
  ];

  for (const rule of SHENSHA_RULES) {
    try {
      const targets = rule.targets(c) || [];
      if (!targets.length) continue;

      if (rule.match === 'custom') {
        const hit = rule.resolve(c);
        if (hit && typeof hit === 'object') {
          if (hit.gan !== undefined) {
            const gl = ganList.find((x) => x.i === hit.gan);
            if (gl) {
              out.push({
                name: rule.name, cat: rule.cat, position: GAN_LABEL[gl.k],
                desc: rule.desc, source: rule.source, by: rule.by,
              });
            }
          } else if (hit.zhi !== undefined) {
            const zl = zhiList.find((x) => x.i === hit.zhi);
            if (zl) {
              out.push({
                name: rule.name, cat: rule.cat, position: POS_LABEL[zl.k],
                desc: rule.desc, source: rule.source, by: rule.by,
              });
            }
          }
        }
        continue;
      }

      if (rule.match === 'day') {
        const dayName = GAN[c.dayGanIndex] + ZHI[c.dayZhiIndex];
        if (targets.includes(dayName)) {
          out.push({
            name: rule.name, cat: rule.cat, position: '日柱',
            desc: rule.desc, source: rule.source, by: rule.by,
          });
        }
        continue;
      }

      if (rule.match === 'hour') {
        const hourName = GAN[c.stems?.hour] + ZHI[c.hourZhiIndex];
        if (hourName && targets.includes(hourName)) {
          out.push({
            name: rule.name, cat: rule.cat, position: '时柱',
            desc: rule.desc, source: rule.source, by: rule.by,
          });
        }
        continue;
      }

      if (rule.match === 'monthzhi') {
        if (c.monthZhiIndex !== undefined && targets.includes(c.monthZhiIndex)) {
          out.push({
            name: rule.name, cat: rule.cat, position: '月支',
            desc: rule.desc, source: rule.source, by: rule.by,
          });
        }
        continue;
      }

      if (rule.match === 'dayzhi') {
        if (c.dayZhiIndex !== undefined && targets.includes(c.dayZhiIndex)) {
          out.push({
            name: rule.name, cat: rule.cat, position: '日支',
            desc: rule.desc, source: rule.source, by: rule.by,
          });
        }
        continue;
      }

      if (rule.match === 'hourzhi') {
        if (c.hourZhiIndex !== undefined && targets.includes(c.hourZhiIndex)) {
          out.push({
            name: rule.name, cat: rule.cat, position: '时支',
            desc: rule.desc, source: rule.source, by: rule.by,
          });
        }
        continue;
      }

      if (rule.match === 'gan') {
        for (const gl of ganList) {
          if (gl.i !== undefined && targets.includes(gl.i)) {
            out.push({
              name: rule.name, cat: rule.cat, position: GAN_LABEL[gl.k],
              desc: rule.desc, source: rule.source, by: rule.by,
            });
            break;
          }
        }
        continue;
      }

      if (rule.match === 'any') {
        out.push({
          name: rule.name, cat: rule.cat, position: rule.fixed || '命局',
          desc: rule.desc, source: rule.source, by: rule.by,
        });
        continue;
      }

      // default: zhi
      for (const zl of zhiList) {
        if (zl.i !== undefined && targets.includes(zl.i)) {
          out.push({
            name: rule.name, cat: rule.cat, position: POS_LABEL[zl.k],
            desc: rule.desc, source: rule.source, by: rule.by,
          });
          break; // 同名煞只记最靠前的一处
        }
      }
    } catch {
      // 单条规则异常不影响整体
    }
  }
  return out;
}

export { triGroup };
