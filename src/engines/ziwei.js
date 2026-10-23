/**
 * 紫微斗数排盘引擎 —— 确定性，只产事实，不做解读
 *
 * 算法来源（已与公开权威资料核对，见 docs/架构设计.md 附录）：
 *  - 命宫/身宫：寅起正月顺数到生月，逆/顺数生时为命/身宫
 *  - 十二宫：以命宫为顺时针起点，固定顺序命名
 *  - 五行局：命宫干支纳音五行（水二/木三/金四/土五/火六），局数即起运岁数
 *  - 紫微落宫：采用「起紫微星表」查表法（5 局 × 30 日），不依赖易错的公式
 *  - 天府落宫：紫府对照表
 *  - 十四主星：紫微系逆时针、天府系顺时针，固定空档布列
 *  - 火星/铃星：按《紫微斗数全书》标准口诀（寅午戌人丑卯方、申子辰人寅戌扬、巳酉丑人卯戌位、亥卯未人酉戌房，起子时顺数至生时）
 *  - 四化：生年十天干四化 + 十二宫宫干四化飞星矩阵（化禄/化权/化科/化忌飞入宫位、自化、冲宫）
 */

import { resolveDateTime } from '../core/time.js';
import { toLunar } from '../core/lunar.js';
import { jdToYmdhms } from '../core/julian.js';
import { computePillars, normalizeInput } from './bazi.js';
import {
  GAN, ZHI, GAN_WUXING, ZHI_WUXING, GAN_YANG, WUXING,
  ganzhiOfIndex, nayinOfIndex, indexOfGanzhi,
} from '../core/ganzhi.js';

// 五虎遁：年干 -> 寅宫（正月）天干
const WU_HU_DUN = { 0: 2, 5: 2, 1: 4, 6: 4, 2: 6, 7: 6, 3: 8, 8: 8, 4: 0, 9: 0 };

/** 命主：以命宫地支起（子贪狼、丑亥巨门、寅戌禄存、卯酉文曲、辰申廉贞、巳未武曲、午破军） */
const MING_ZHU = {
  子: '贪狼', 丑: '巨门', 寅: '禄存', 卯: '文曲', 辰: '廉贞', 巳: '武曲',
  午: '破军', 未: '武曲', 申: '廉贞', 酉: '文曲', 戌: '巨门', 亥: '贪狼',
};
/** 身主：以生年年支起（子午火、丑未铃、寅申相、卯酉梁、辰戌机、巳亥同） */
const SHEN_ZHU = {
  子: '火星', 午: '火星', 丑: '铃星', 未: '铃星', 寅: '天相', 申: '天相',
  卯: '天梁', 酉: '天梁', 辰: '天机', 戌: '天机', 巳: '天同', 亥: '天同',
};

/** 地支索引 */
const ZI = Object.fromEntries(ZHI.map((z, i) => [z, i]));
const zidx = (n) => ZI[n];

/** 十二宫顺时针顺序（从命宫起） */
export const PALACE_ORDER = [
  '命宫', '父母宫', '福德宫', '田宅宫', '官禄宫', '交友宫',
  '迁移宫', '疾厄宫', '财帛宫', '子女宫', '夫妻宫', '兄弟宫',
];

/** 纳音五行 -> 五行局数 */
const NAYIN_TO_JU = { 金: 4, 木: 3, 水: 2, 火: 6, 土: 5 };

/** 起紫微星表：局名 -> 日(1..30) 落宫地支 */
export const ZIWEI_TABLE = {
  水二局: ['丑', '寅', '寅', '卯', '卯', '辰', '辰', '巳', '巳', '午', '午', '未', '未', '申', '申',
    '酉', '酉', '戌', '戌', '亥', '亥', '子', '子', '丑', '丑', '寅', '寅', '卯', '卯', '辰'],
  木三局: ['辰', '丑', '寅', '巳', '寅', '卯', '午', '卯', '辰', '未', '辰', '巳', '申', '巳', '午',
    '酉', '午', '未', '戌', '未', '申', '亥', '申', '酉', '子', '酉', '戌', '丑', '戌', '亥'],
  金四局: ['亥', '辰', '丑', '寅', '子', '巳', '寅', '卯', '丑', '午', '卯', '辰', '寅', '未', '辰',
    '巳', '卯', '申', '巳', '午', '辰', '酉', '午', '未', '巳', '戌', '未', '申', '午', '亥'],
  土五局: ['午', '亥', '辰', '丑', '寅', '未', '子', '巳', '寅', '卯', '申', '丑', '午', '卯', '辰',
    '酉', '寅', '未', '辰', '巳', '戌', '卯', '申', '巳', '午', '亥', '辰', '酉', '午', '未'],
  火六局: ['酉', '午', '亥', '辰', '丑', '寅', '戌', '未', '子', '巳', '寅', '卯', '亥', '申', '丑',
    '午', '卯', '辰', '子', '酉', '寅', '未', '辰', '巳', '丑', '戌', '卯', '申', '巳', '午'],
};

/** 紫府对照表：紫微地支 -> 天府地支 */
export const ZIFU_MAP = {
  子: '辰', 丑: '卯', 寅: '寅', 卯: '丑', 辰: '子', 巳: '亥',
  午: '戌', 未: '酉', 申: '申', 酉: '未', 戌: '午', 亥: '巳',
};

/** 十四主星（紫微系逆时针 / 天府系顺时针，相对步数） */
const ZIWEI_STARS = [
  { name: '紫微', sys: 'zi', step: 0, wuxing: '土' },
  { name: '天机', sys: 'zi', step: 1, wuxing: '木' },
  { name: '太阳', sys: 'zi', step: 3, wuxing: '火' },
  { name: '武曲', sys: 'zi', step: 4, wuxing: '金' },
  { name: '天同', sys: 'zi', step: 5, wuxing: '水' },
  { name: '廉贞', sys: 'zi', step: 8, wuxing: '火' },
];
const TIANFU_STARS = [
  { name: '天府', sys: 'fu', step: 0, wuxing: '土' },
  { name: '太阴', sys: 'fu', step: 1, wuxing: '水' },
  { name: '贪狼', sys: 'fu', step: 2, wuxing: '水' },
  { name: '巨门', sys: 'fu', step: 3, wuxing: '水' },
  { name: '天相', sys: 'fu', step: 4, wuxing: '水' },
  { name: '天梁', sys: 'fu', step: 5, wuxing: '土' },
  { name: '七杀', sys: 'fu', step: 6, wuxing: '金' },
  { name: '破军', sys: 'fu', step: 10, wuxing: '水' },
];

/** 十四主星亮度表（七级：庙>旺>得>利>平>不>陷） */
export const BRIGHTNESS = {
  紫微: '平庙旺旺得旺庙庙旺旺得旺',
  天机: '庙陷得旺利平庙陷得旺利平',
  太阳: '陷不旺庙旺旺旺得得陷不陷',
  武曲: '旺庙得利庙平旺庙得利庙平',
  天同: '旺不利平平庙陷不旺平平庙',
  廉贞: '平利庙平利陷平利庙平利陷',
  天府: '庙庙庙得庙得得庙得旺庙得',
  太阴: '庙庙旺陷陷陷不不利不旺庙',
  贪狼: '旺庙平利庙陷旺庙平利庙陷',
  巨门: '旺不庙庙陷旺旺不庙庙陷旺',
  天相: '庙庙庙陷得得庙得庙陷得得',
  天梁: '庙旺庙庙庙陷庙旺陷得庙陷',
  七杀: '旺庙庙旺庙平旺庙庙庙庙平',
  破军: '庙旺得陷旺平庙旺得陷旺平',
};

/** 生年十天干四化表：化禄/化权/化科/化忌（导出供流年及宫干飞星复用） */
export const SIHUA = {
  0: { lu: '廉贞', quan: '破军', ke: '武曲', ji: '太阳' }, // 甲
  1: { lu: '天机', quan: '天梁', ke: '紫微', ji: '太阴' }, // 乙
  2: { lu: '天同', quan: '天机', ke: '文昌', ji: '廉贞' }, // 丙
  3: { lu: '太阴', quan: '天同', ke: '天机', ji: '巨门' }, // 丁
  4: { lu: '贪狼', quan: '太阴', ke: '右弼', ji: '天机' }, // 戊
  5: { lu: '武曲', quan: '贪狼', ke: '天梁', ji: '文曲' }, // 己
  6: { lu: '太阳', quan: '武曲', ke: '太阴', ji: '天同' }, // 庚
  7: { lu: '巨门', quan: '太阳', ke: '文曲', ji: '文昌' }, // 辛
  8: { lu: '天梁', quan: '紫微', ke: '左辅', ji: '武曲' }, // 壬
  9: { lu: '破军', quan: '巨门', ke: '太阴', ji: '贪狼' }, // 癸
};

/** 天魁/天钺（年干，地支） */
const TIANKUI_TIANYUE = {
  0: ['丑', '未'], 4: ['丑', '未'], 6: ['丑', '未'],
  1: ['子', '申'], 5: ['子', '申'],
  2: ['亥', '酉'], 3: ['亥', '酉'],
  7: ['午', '寅'],
  8: ['卯', '巳'], 9: ['卯', '巳'],
};

/** 禄存（年干，地支） */
const LU_CUN = { 0: '寅', 1: '卯', 2: '巳', 4: '巳', 3: '午', 5: '午', 6: '申', 7: '酉', 8: '亥', 9: '子' };

/** 时辰索引：真太阳时小时 -> 地支 */
function hourZhiIndex(hourFloat) {
  return Math.floor((hourFloat + 1) / 2) % 12;
}

/** 地支三合局 */
function sanhe(zhiIndex) {
  if ([zidx('申'), zidx('子'), zidx('辰')].includes(zhiIndex)) return '水';
  if ([zidx('寅'), zidx('午'), zidx('戌')].includes(zhiIndex)) return '火';
  if ([zidx('巳'), zidx('酉'), zidx('丑')].includes(zhiIndex)) return '金';
  return '木'; // 亥卯未
}

/**
 * 主入口
 */
export function computeZiwei(input) {
  // Phase 1 修复：统一走 normalizeInput 收敛字符串生辰并支持农历/闰月输入转换
  const src = normalizeInput(input);
  const dt = resolveDateTime(src);
  const { jdUtc, jdSolar } = dt;
  const solarHour = ((jdSolar + 0.5) % 1) * 24;
  const h = hourZhiIndex(solarHour);
  const lateZi = solarHour >= 23;

  // Phase 1 修复：晚子时（23:00–23:59）农历日顺延至次日，与四柱日干支进位严格对齐
  const lunar = toLunar(lateZi ? jdSolar + 1 / 24 : jdSolar, 0);
  // 闰月分界规则：默认 'split15'（15日及以前作本月，15日后作下月），支持 'next'（作下月）、'current'（作本月）
  const leapRule = src.leapMonthRule || 'split15';
  const lMonth = lunar.isLeap
    ? (leapRule === 'next'
      ? (lunar.month % 12) + 1
      : leapRule === 'current'
        ? lunar.month
        : (lunar.day > 15 ? (lunar.month % 12) + 1 : lunar.month))
    : lunar.month;
  const lDay = lunar.day;
  const yearGan = lunar.yearGanzhi[0];
  const yearGanIndex = GAN.indexOf(yearGan);
  const yearZhiIndex = zidx(lunar.yearGanzhi[1]);

  // 命宫 / 身宫
  const base = (2 + (lMonth - 1)) % 12; // 寅起正月顺数到生月
  const mingIndex = (base - h + 12) % 12; // 逆数生时
  const shenIndex = (base + h) % 12; // 顺数生时

  // 十二宫干（五虎遁起寅宫）
  const yinGan = WU_HU_DUN[yearGanIndex];
  const palaceGan = []; // 按地支序
  for (let z = 0; z < 12; z++) {
    palaceGan[z] = (yinGan + ((z - 2 + 12) % 12)) % 10;
  }
  // 命宫干支
  const mingGanIndex = palaceGan[mingIndex];
  const mingGzIndex = indexOfGanzhi(mingGanIndex, mingIndex);
  const mingNayin = nayinOfIndex(mingGzIndex);
  const juName = NAYIN_TO_JU[mingNayin[mingNayin.length - 1]] ? juFull(mingNayin[mingNayin.length - 1]) : '土五局';
  const juNum = NAYIN_TO_JU[juName ? juName[0] : '土'];

  // 五行局
  const wuxing = juName[0];
  const ju = { name: juName, number: juNum, startAge: juNum, element: wuxing };

  // 紫微落宫（查表）
  const day = Math.min(30, Math.max(1, lDay));
  const ziweiZhi = ZIWEI_TABLE[juName][day - 1];
  const ziweiIndex = zidx(ziweiZhi);
  const tianfuZhi = ZIFU_MAP[ziweiZhi];
  const tianfuIndex = zidx(tianfuZhi);

  // 十四主星落宫
  const starAt = {}; // 星名 -> 地支序
  for (const s of ZIWEI_STARS) {
    starAt[s.name] = (ziweiIndex - s.step + 12) % 12;
  }
  for (const s of TIANFU_STARS) {
    starAt[s.name] = (tianfuIndex + s.step) % 12;
  }

  // 辅星
  const fuStars = {};
  fuStars['左辅'] = (4 + (lMonth - 1)) % 12; // 辰起正月顺数
  fuStars['右弼'] = (10 - (lMonth - 1) + 12) % 12; // 戌起正月逆数
  fuStars['文昌'] = (10 + h) % 12; // 戌起子时顺数
  fuStars['文曲'] = (4 - h + 12) % 12; // 辰起子时逆数
  const [kui, yue] = TIANKUI_TIANYUE[yearGanIndex] || ['丑', '未'];
  fuStars['天魁'] = zidx(kui);
  fuStars['天钺'] = zidx(yue);
  const luZhi = zidx(LU_CUN[yearGanIndex]);
  fuStars['禄存'] = luZhi;
  fuStars['擎羊'] = (luZhi + 1) % 12;
  fuStars['陀罗'] = (luZhi - 1 + 12) % 12;

  // Phase 2 精进：火星 / 铃星按《紫微斗数全书》标准安火铃诀（寅午戌人丑卯方、申子辰人寅戌扬、巳酉丑人卯戌位、亥卯未人酉戌房，子时起顺数至生时）
  const sh = sanhe(yearZhiIndex);
  const huoBase = { 火: zidx('丑'), 水: zidx('寅'), 金: zidx('卯'), 木: zidx('酉') }[sh];
  const lingBase = { 火: zidx('卯'), 水: zidx('戌'), 金: zidx('戌'), 木: zidx('戌') }[sh];
  fuStars['火星'] = (huoBase + h) % 12;
  fuStars['铃星'] = (lingBase + h) % 12;

  // 红鸾 / 天喜
  fuStars['红鸾'] = (yearZhiIndex + 1) % 12;
  fuStars['天喜'] = (fuStars['红鸾'] + 6) % 12;

  // —— 杂曜 ——
  const za = {};
  za['天姚'] = (zidx('丑') + lMonth - 1) % 12;
  za['天刑'] = (zidx('酉') + lMonth - 1) % 12;
  za['天巫'] = (zidx('巳') + lMonth - 1) % 12;
  za['天月'] = (zidx('戌') + lMonth - 1) % 12;
  za['阴煞'] = (zidx('寅') + lMonth - 1) % 12;
  za['地劫'] = (zidx('亥') + h) % 12;
  za['地空'] = (zidx('亥') - h + 24) % 12;
  za['封诰'] = (zidx('寅') + h) % 12;
  za['天马'] = zidx({ 水: '寅', 火: '申', 金: '亥', 木: '巳' }[sanhe(yearZhiIndex)]);
  za['天哭'] = (zidx('午') - yearZhiIndex + 24) % 12;
  za['天虚'] = (zidx('午') + yearZhiIndex) % 12;
  za['龙池'] = (zidx('辰') + yearZhiIndex) % 12;
  za['凤阁'] = (zidx('戌') - yearZhiIndex + 24) % 12;
  const GU_TABLE = { 子: '寅', 丑: '寅', 寅: '巳', 卯: '巳', 辰: '巳', 巳: '申', 午: '申', 未: '申', 申: '亥', 酉: '亥', 戌: '亥', 亥: '寅' };
  const GUA_TABLE2 = { 子: '戌', 丑: '戌', 寅: '丑', 卯: '丑', 辰: '丑', 巳: '辰', 午: '辰', 未: '辰', 申: '未', 酉: '未', 戌: '未', 亥: '戌' };
  za['孤辰'] = zidx(GU_TABLE[ZHI[yearZhiIndex]]);
  za['寡宿'] = zidx(GUA_TABLE2[ZHI[yearZhiIndex]]);
  za['破碎'] = zidx(['巳', '丑', '酉'][yearZhiIndex % 3]);
  za['天才'] = (mingIndex + yearZhiIndex) % 12;
  za['天寿'] = (shenIndex + yearZhiIndex) % 12;
  const bday = Math.min(30, Math.max(1, lDay));
  za['三台'] = (fuStars['左辅'] + bday - 1) % 12;
  za['八座'] = (fuStars['右弼'] - bday + 1 + 360) % 12;
  za['恩光'] = (fuStars['文昌'] + bday - 1) % 12;
  za['天贵'] = (fuStars['文曲'] + bday - 1) % 12;
  const JK = { 0: ['申', '酉'], 1: ['午', '未'], 2: ['辰', '巳'], 3: ['寅', '卯'], 4: ['子', '丑'], 5: ['子', '丑'], 6: ['申', '酉'], 7: ['午', '未'], 8: ['辰', '巳'], 9: ['寅', '卯'] };
  za['截空'] = zidx(JK[yearGanIndex][0]);
  za['截空2'] = zidx(JK[yearGanIndex][1]);
  za['天伤'] = (mingIndex + 8) % 12;
  za['天使'] = (mingIndex + 6) % 12;
  za['台辅'] = (zidx('午') + yearZhiIndex) % 12;

  // —— 博士十二神 ——
  const BOSHI = ['博士', '力士', '青龙', '小耗', '将军', '奏书', '飞廉', '喜神', '病符', '大耗', '伏兵', '官府'];
  const maleFlag = src.gender !== 'female';
  const forwardShi = (GAN_YANG[yearGanIndex] && maleFlag) || (!GAN_YANG[yearGanIndex] && !maleFlag);
  const shiDir = forwardShi ? 1 : -1;
  const boshiList = BOSHI.map((nm, i) => ({ name: nm, zi: (luZhi + shiDir * i + 360) % 12 }));

  // —— 长生十二神 ——
  const CHANG12 = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养'];
  const csStart = { 水二局: '申', 木三局: '亥', 金四局: '巳', 土五局: '申', 火六局: '寅' }[juName];
  const changList = CHANG12.map((nm, i) => ({ name: nm, zi: (zidx(csStart) + shiDir * i + 360) % 12 }));

  // —— 将前十二星 ——
  const JIANG12 = ['将星', '攀鞍', '岁驿', '息神', '华盖', '劫煞', '灾煞', '天煞', '指背', '咸池', '月煞', '亡神'];
  const jiangStart = { 水: '子', 火: '午', 金: '酉', 木: '卯' }[sanhe(yearZhiIndex)];
  const jiangList = JIANG12.map((nm, i) => ({ name: nm, zi: (zidx(jiangStart) + i) % 12 }));

  // —— 岁前十二星 ——
  const SUI12 = ['岁建', '晦气', '丧门', '贯索', '官符', '小耗', '大耗', '龙德', '白虎', '天德', '吊客', '病符'];
  const suiList = SUI12.map((nm, i) => ({ name: nm, zi: (yearZhiIndex + i) % 12 }));

  // 生年四化
  const hua = SIHUA[yearGanIndex];
  const huaMark = {}; // 星名 -> 化禄/权/科/忌
  for (const t of ['lu', 'quan', 'ke', 'ji']) {
    huaMark[hua[t]] = { type: t, label: { lu: '禄', quan: '权', ke: '科', ji: '忌' }[t] };
  }

  // 星名 -> 落宫地支索引（主星 + 辅星，供生年四化与十二宫宫干飞星查表）
  const starZhiMap = { ...starAt, ...fuStars };
  const zhiToPalaceName = {};
  for (let i = 0; i < 12; i++) {
    const z = (mingIndex + i) % 12;
    zhiToPalaceName[z] = PALACE_ORDER[i];
  }

  // Phase 2 新增：十二宫宫干四化飞星矩阵（飞入何宫、是否自化、化忌冲何宫）
  const computeFlyHua = (ganIdx, fromZhiIdx) => {
    const shMap = SIHUA[ganIdx] || {};
    const out = { gan: GAN[ganIdx] };
    for (const [key, label] of [['lu', '禄'], ['quan', '权'], ['ke', '科'], ['ji', '忌']]) {
      const star = shMap[key] || '';
      const targetZhiIndex = starZhiMap[star] !== undefined ? starZhiMap[star] : fromZhiIdx;
      const chongZhiIndex = (targetZhiIndex + 6) % 12;
      out[key] = {
        type: key,
        label,
        star,
        targetZhiIndex,
        targetZhi: ZHI[targetZhiIndex],
        targetPalace: zhiToPalaceName[targetZhiIndex] || '',
        isSelf: targetZhiIndex === fromZhiIdx,
        isOpposite: targetZhiIndex === (fromZhiIdx + 6) % 12,
        chongZhiIndex,
        chongZhi: ZHI[chongZhiIndex],
        chongPalace: zhiToPalaceName[chongZhiIndex] || '',
      };
    }
    return out;
  };

  // 组装十二宫
  const palaces = {};
  const palaceSihua = {};
  for (let i = 0; i < 12; i++) {
    const z = (mingIndex + i) % 12;
    const gzIndex = indexOfGanzhi(palaceGan[z], z);
    const gz = ganzhiOfIndex(gzIndex);
    const stars = [];
    for (const s of [...ZIWEI_STARS, ...TIANFU_STARS]) {
      if (starAt[s.name] === z) stars.push({ name: s.name, kind: '主星', wuxing: s.wuxing, hua: huaMark[s.name] || null, brightness: (BRIGHTNESS[s.name] || '')[z] || null });
    }
    for (const [nm, zi] of Object.entries(fuStars)) {
      if (zi === z) stars.push({ name: nm, kind: '辅星', wuxing: fuWuxing(nm), hua: huaMark[nm] || null });
    }
    for (const [nm, zi] of Object.entries(za)) {
      if (zi === z) stars.push({ name: nm === '截空2' ? '截空' : nm, kind: '杂', wuxing: fuWuxing(nm === '截空2' ? '截空' : nm) });
    }
    for (const grp of [boshiList, changList, jiangList, suiList]) {
      for (const s of grp) {
        if (s.zi === z) stars.push({ name: s.name, kind: '杂', wuxing: fuWuxing(s.name) });
      }
    }
    const flyHua = computeFlyHua(palaceGan[z], z);
    palaceSihua[PALACE_ORDER[i]] = flyHua;
    palaces[PALACE_ORDER[i]] = {
      name: PALACE_ORDER[i],
      zhiIndex: z,
      zhi: ZHI[z],
      ganzhi: gz.name,
      gan: gz.gan,
      zhiName: ZHI[z],
      stars,
      flyHua,
      isMing: i === 0,
      isShen: z === shenIndex,
    };
  }

  // 大限
  const yangYear = GAN_YANG[yearGanIndex];
  const male = src.gender !== 'female';
  const forward = (yangYear && male) || (!yangYear && male === false);
  const birthYear = jdToYmdhms(jdUtc).year;
  const nowYear = new Date().getFullYear();
  const xuAge = nowYear - birthYear + 1; // 虚岁
  const daXian = [];
  for (let i = 0; i < 12; i++) {
    const z = (mingIndex + (forward ? i : -i) + 12) % 12;
    const startAge = juNum + i * 10;
    const dxGz = ganzhiOfIndex(indexOfGanzhi(palaceGan[z], z));
    const dxHua = SIHUA[palaceGan[z]];
    daXian.push({
      order: i,
      palace: PALACE_ORDER[z === mingIndex ? 0 : (z - mingIndex + 12) % 12],
      zhi: ZHI[z],
      zhiIndex: z,
      ganzhi: dxGz.name,
      sihua: { lu: dxHua.lu, quan: dxHua.quan, ke: dxHua.ke, ji: dxHua.ji },
      flyHua: computeFlyHua(palaceGan[z], z),
      ageStart: startAge,
      ageEnd: startAge + 9,
      isCurrent: xuAge >= startAge && xuAge <= startAge + 9,
      liuNian: Array.from({ length: 10 }, (_, j) => {
        const y = birthYear + startAge - 1 + j;
        const gz = ganzhiOfIndex(((y - 4) % 60 + 60) % 60);
        return { year: y, ganzhi: gz.name, zhi: gz.zhi };
      }),
    });
  }

  const now = new Date();
  const cy = now.getFullYear();
  const curGzIndex = ((cy - 4) % 60 + 60) % 60;
  const liuNianZhiIndex = zidx(ganzhiOfIndex(curGzIndex).zhi);

  const fourHuaDetail = (t) => {
    const st = hua[t];
    const zi = starZhiMap[st];
    return {
      star: st,
      zhi: zi !== undefined ? ZHI[zi] : '',
      palace: zi !== undefined ? zhiToPalaceName[zi] : '',
    };
  };

  return {
    birthYear,
    xuAge,
    mingZhu: MING_ZHU[ZHI[mingIndex]],
    shenZhu: SHEN_ZHU[ZHI[yearZhiIndex]],
    solarDate: (() => { const d = jdToYmdhms(Math.floor(jdSolar + 0.5)); return { year: d.year, month: d.month, day: d.day }; })(),
    siZhu: (() => {
      const p = computePillars(jdUtc, jdSolar);
      return { year: p.year.name, month: p.month.name, day: p.day.name, hour: p.hour.name };
    })(),
    mingGong: { zhi: ZHI[mingIndex], zhiIndex: mingIndex, ganzhi: ganzhiOfIndex(mingGzIndex).name },
    shenGong: { zhi: ZHI[shenIndex], zhiIndex: shenIndex },
    lunar: {
      yearGanzhi: lunar.yearGanzhi,
      zodiac: lunar.zodiac,
      month: lunar.month,
      effectiveMonth: lMonth,
      leapMonthRule: leapRule,
      day: lDay,
      isLeap: lunar.isLeap,
    },
    wuXingJu: ju,
    ziweiZhi,
    tianfuZhi,
    fourHua: {
      lu: fourHuaDetail('lu'),
      quan: fourHuaDetail('quan'),
      ke: fourHuaDetail('ke'),
      ji: fourHuaDetail('ji'),
    },
    palaceSihua,
    starPositions: starAt,
    fuStarPositions: Object.fromEntries(Object.entries(fuStars).map(([k, v]) => [k, ZHI[v]])),
    palaces,
    daXian,
    liuNian: { year: cy, zhi: ZHI[liuNianZhiIndex], mingGongZhi: ZHI[liuNianZhiIndex] },
    time: {
      jdUtc, jdSolar, solarHour, hourZhi: ZHI[h], lateZi,
      cityName: dt.cityName, lon: dt.lon, lat: dt.lat,
    },
    meta: {
      approximations: [],
    },
  };
}

function juFull(wuxingChar) {
  return { 水: '水二局', 木: '木三局', 金: '金四局', 土: '土五局', 火: '火六局' }[wuxingChar];
}

function fuWuxing(name) {
  const m = {
    左辅: '土', 右弼: '水', 文昌: '金', 文曲: '水', 天魁: '火', 天钺: '火',
    禄存: '土', 擎羊: '金', 陀罗: '金', 火星: '火', 铃星: '火', 红鸾: '水', 天喜: '水',
  };
  return m[name] || '土';
}

// 1.5.0: Phase 2 精进 —— 火星/铃星按全书标准口诀精确安放 + 十二宫宫干四化飞星矩阵 (flyHua / palaceSihua)
export const ZIWEI_ENGINE_VERSION = '1.5.0';
