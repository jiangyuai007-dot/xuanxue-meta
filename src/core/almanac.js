/**
 * Phase 4：每日运势黄历与个人八字流日推演引擎（src/core/almanac.js）
 *
 * 功能定位：
 *   1. 传统择吉万年历（确定性算法，零外部依赖）：
 *      - 公历/农历转换、四柱干支（年柱/月柱/日柱）、纳音五行、值日生肖、节气交接倒计时
 *      - 建除十二神（建/除/满/平/定/执/破/危/成/收/开/闭）及黄黑道十二值神（青龙/明堂等）
 *      - 二十八星宿值日、每日宜忌事项（yi / ji）、彭祖百忌、冲煞方位
 *      - 每日吉神方位（喜神、财神、福神、阳贵人、阴贵人）与十二时辰吉凶表（五鼠遁起时柱）
 *   2. 结合个人八字日柱与喜用神的「专属流日运势」推演（提升 DAU 留存）：
 *      - 当传入用户的日柱干支（如 `乙酉`）与喜用神五行（如 `['水', '木']`）时，
 *        自动计算今日流日天干对命主的「流日十神」、流日地支与命主夫妻宫（日支）的「合冲刑害」、
 *        今日综合能量评分（0~100）、旺运色彩、黄金时辰与合规行事锦囊。
 */

import { ymdToJdn } from './julian.js';
import { solarTerm } from './astro.js';
import { toLunar } from './lunar.js';
import {
  GAN,
  ZHI,
  GAN_WUXING,
  ZHI_WUXING,
  ganzhiOfIndex,
  ganzhiOfJdn,
  nayinOfIndex,
  indexOfGanzhi,
  shishen,
  isSheng,
  isKe,
} from './ganzhi.js';
import { localToJdUtc } from './time.js';
import { gate } from '../compliance/gateway.js';

const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** 建除十二神 */
const JIANCHU = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭'];

const JIANCHU_META = {
  建: { luck: '平', desc: '万物生育强健之象，宜出行、上任、洽谈，忌开仓、动土', yi: ['出行', '会友', '上任', '洽谈', '祈福'], ji: ['动土', '开仓', '安葬'] },
  除: { luck: '吉', desc: '除旧布新、扫除积弊之象，宜清洁、解除、求医、整理规划', yi: ['除服', '清洁', '解除', '沐浴', '整理规划'], ji: ['嫁娶', '远行', '赴任'] },
  满: { luck: '吉', desc: '丰收圆满、充盈汇聚之象，宜祈福、签约、开市、纳财、会亲友', yi: ['祈福', '开市', '签约', '立券', '纳财', '会友'], ji: ['动土', '栽种', '服药'] },
  平: { luck: '平', desc: '平正安稳、不偏不倚之象，宜修造、粉刷、日常事务推进', yi: ['修饰垣墙', '平治道涂', '日常办公', '会友'], ji: ['开市', '立券', '远行'] },
  定: { luck: '吉', desc: '安定稳固、谋事可成之象，宜签约、纳采、交易、安床、定计', yi: ['冠笄', '纳采', '签约', '交易', '定计', '安床'], ji: ['词讼', '出行', '乘船'] },
  执: { luck: '平', desc: '执守成规、固守本业之象，宜捕捉、修造、签约守成，忌远行移徙', yi: ['祭祀', '修造', '签约', '收纳', '守成'], ji: ['开市', '移徙', '远行'] },
  破: { luck: '凶', desc: '日月相冲、破旧立新之象，宜破屋坏垣、断舍离，大事勿用', yi: ['破屋坏垣', '断舍离', '复盘清账'], ji: ['嫁娶', '签约', '开市', '搬迁', '置业'] },
  危: { luck: '平', desc: '居安思危、谨慎行事之象，宜祈福、安床、静思筹备，忌登高涉险', yi: ['祈福', '安床', '祭祀', '静思复盘'], ji: ['登高', '行船', '动土', '远行'] },
  成: { luck: '吉', desc: '万物成就、诸事顺遂之象，宜开业、签约、入学、嫁娶、搬迁', yi: ['开市', '立券', '签约', '入学', '嫁娶', '移徙', '求财'], ji: ['词讼', '争执'] },
  收: { luck: '吉', desc: '收敛归藏、收获成果之象，宜纳财、收账、进货、储蓄、结项', yi: ['纳财', '收账', '进货', '修仓', '入学', '签约'], ji: ['安葬', '针灸', '无节制开销'] },
  开: { luck: '吉', desc: '生气大开、通达四方之象，宜开市、动工、出行、嫁娶、拓展人脉', yi: ['开市', '交易', '立券', '出行', '移徙', '会友', '求职'], ji: ['安葬', '动土破垣'] },
  闭: { luck: '凶', desc: '天地闭塞、收敛静养之象，宜筑堤、补垣、内省复盘，忌开业远行', yi: ['筑堤', '补垣', '塞穴', '内省读书', '整理档案'], ji: ['开市', '出行', '求医', '嫁娶'] },
};

/** 十二值神（黄道六神：青龙、明堂、金匮、天德、玉堂、司命） */
const ZHISHEN = [
  { name: '青龙', type: '黄道', luck: '吉' },
  { name: '明堂', type: '黄道', luck: '吉' },
  { name: '天刑', type: '黑道', luck: '凶' },
  { name: '朱雀', type: '黑道', luck: '凶' },
  { name: '金匮', type: '黄道', luck: '吉' },
  { name: '天德', type: '黄道', luck: '吉' },
  { name: '白虎', type: '黑道', luck: '凶' },
  { name: '玉堂', type: '黄道', luck: '吉' },
  { name: '天牢', type: '黑道', luck: '凶' },
  { name: '玄武', type: '黑道', luck: '凶' },
  { name: '司命', type: '黄道', luck: '吉' },
  { name: '勾陈', type: '黑道', luck: '凶' },
];

/** 十二月支起青龙的起始地支索引（子午月起申、丑未月起戌、寅申月起子、卯酉月起寅、辰戌月起辰、巳亥月起午） */
const QINGLONG_START_ZHI = [8, 10, 0, 2, 4, 6, 8, 10, 0, 2, 4, 6];

/** 二十八星宿 */
const XIU_28 = [
  '角木蛟', '亢金龙', '氐土貉', '房日兔', '心月狐', '尾火虎', '箕水豹',
  '斗木獬', '牛金牛', '女土蝠', '虚日鼠', '危月燕', '室火猪', '壁水貐',
  '奎木狼', '娄金狗', '胃土雉', '昴日鸡', '毕月乌', '觜火猴', '参水猿',
  '井木犴', '鬼金羊', '柳土獐', '星日马', '张月鹿', '翼火蛇', '轸水蚓',
];

/** 彭祖百忌 */
const PENGZU_GAN = {
  甲: '甲不开仓财物耗散', 乙: '乙不栽植千株不长', 丙: '丙不修灶必见灾殃', 丁: '丁不剃头头必生疮', 戊: '戊不受田田主不祥',
  己: '己不破券二比并亡', 庚: '庚不经络织机虚张', 辛: '辛不合酱主人不尝', 壬: '壬不泱水更难提防', 癸: '癸不词讼理弱敌强',
};
const PENGZU_ZHI = {
  子: '子不问卜自惹祸殃', 丑: '丑不冠带主不还乡', 寅: '寅不祭祀神鬼不尝', 卯: '卯不穿井水泉不香',
  辰: '辰不哭泣必主重丧', 巳: '巳不远行财物伏藏', 午: '午不苫盖屋主更张', 未: '未不服药毒气入肠',
  申: '申不安床鬼祟入房', 酉: '酉不会客醉坐颠狂', 戌: '戌不吃犬作怪上床', 亥: '亥不嫁娶不利新郎',
};

/** 日干推四神方位（喜神、财神、福神、阳贵、阴贵） */
const DIR_BY_GAN = {
  甲: { xi: '东北', cai: '东北', fu: '东南', yangGui: '西南', yinGui: '东北' },
  乙: { xi: '西北', cai: '东北', fu: '东南', yangGui: '正北', yinGui: '西南' },
  丙: { xi: '西南', cai: '正西', fu: '正东', yangGui: '西北', yinGui: '正西' },
  丁: { xi: '正南', cai: '正西', fu: '正东', yangGui: '西北', yinGui: '正西' },
  戊: { xi: '东南', cai: '正北', fu: '正北', yangGui: '东北', yinGui: '西南' },
  己: { xi: '东北', cai: '正北', fu: '正南', yangGui: '正北', yinGui: '西南' },
  庚: { xi: '西北', cai: '正东', fu: '西南', yangGui: '东北', yinGui: '西南' },
  辛: { xi: '西南', cai: '正东', fu: '西北', yangGui: '东北', yinGui: '正南' },
  壬: { xi: '正南', cai: '正南', fu: '西北', yangGui: '正东', yinGui: '东南' },
  癸: { xi: '东南', cai: '正南', fu: '正西', yangGui: '东南', yinGui: '正东' },
};

/** 三合局煞方：申子辰煞南，寅午戌煞北，巳酉丑煞东，亥卯未煞西 */
function shaDirectionOf(zhiIdx) {
  if ([8, 0, 4].includes(zhiIdx)) return '南';
  if ([2, 6, 10].includes(zhiIdx)) return '北';
  if ([5, 9, 1].includes(zhiIdx)) return '东';
  return '西';
}

/** 推算指定公历日（正午 12:00）的年柱、月柱、日柱与节气 */
function computeDayPillars(year, month, day) {
  const jdUtc = localToJdUtc(year, month, day, 12, 0, 8);
  const jdn = ymdToJdn(year, month, day);

  // 1) 年柱：以立春（idx=2）为界
  const lichun = solarTerm(year, 2);
  const baziYear = jdUtc >= lichun.jdUtc ? year : year - 1;
  const yearGz = ganzhiOfIndex((baziYear - 4) % 60);

  // 2) 月柱：按十二节（偶序号节气）定月支
  const jieEvents = [];
  for (const y of [year - 1, year, year + 1]) {
    for (let k = 0; k < 12; k++) {
      const termIdx = k * 2;
      const t = solarTerm(y, termIdx);
      const monthZhiIndex = (k + 1) % 12;
      jieEvents.push({ jdUtc: t.jdUtc, monthZhiIndex, termName: t.name });
    }
  }
  jieEvents.sort((a, b) => a.jdUtc - b.jdUtc);
  let curJie = jieEvents[0];
  for (const ev of jieEvents) {
    if (ev.jdUtc <= jdUtc) curJie = ev;
    else break;
  }
  const monthZhiIndex = curJie.monthZhiIndex;
  const monthNumFromYin = (monthZhiIndex - 2 + 12) % 12;
  const startGan = ((yearGz.ganIndex % 5) * 2 + 2) % 10;
  const monthGanIndex = (startGan + monthNumFromYin) % 10;
  const monthGz = ganzhiOfIndex(indexOfGanzhi(monthGanIndex, monthZhiIndex));

  // 3) 日柱
  const dayGz = ganzhiOfJdn(jdn);

  // 4) 当前节气与下一节气
  const allTerms = [];
  for (const y of [year - 1, year, year + 1]) {
    for (let i = 0; i < 24; i++) {
      allTerms.push(solarTerm(y, i));
    }
  }
  allTerms.sort((a, b) => a.jdUtc - b.jdUtc);
  let curTerm = allTerms[0];
  let nextTerm = allTerms[allTerms.length - 1];
  for (let i = 0; i < allTerms.length; i++) {
    if (allTerms[i].jdUtc <= jdUtc) {
      curTerm = allTerms[i];
      if (allTerms[i + 1]) nextTerm = allTerms[i + 1];
    } else {
      break;
    }
  }
  const daysToNextTerm = Math.max(0, Math.ceil(nextTerm.jdUtc - jdUtc));

  return {
    jdUtc,
    jdn,
    yearGz,
    monthGz,
    dayGz,
    curTerm: { name: curTerm.name, index: curTerm.index },
    nextTerm: { name: nextTerm.name, daysUntil: daysToNextTerm },
  };
}

/** 计算当日十二时辰干支与黄黑道吉凶 */
function computeTwelveHours(dayGanIndex, dayZhiIndex) {
  const startHourGan = (dayGanIndex % 5) * 2; // 五鼠遁元
  const qinglongStart = QINGLONG_START_ZHI[dayZhiIndex] ?? 0;
  const ranges = [
    '23:00-01:00', '01:00-03:00', '03:00-05:00', '05:00-07:00',
    '07:00-09:00', '09:00-11:00', '11:00-13:00', '13:00-15:00',
    '15:00-17:00', '17:00-19:00', '19:00-21:00', '21:00-23:00',
  ];
  const out = [];
  for (let z = 0; z < 12; z++) {
    const g = (startHourGan + z) % 10;
    const shenIdx = (z - qinglongStart + 12) % 12;
    const shen = ZHISHEN[shenIdx];
    out.push({
      zhiIndex: z,
      zhi: ZHI[z],
      gan: GAN[g],
      ganzhi: GAN[g] + ZHI[z],
      timeRange: ranges[z],
      shen: shen.name,
      type: shen.type,
      luck: shen.luck,
    });
  }
  return out;
}

/** 六合与六冲表 */
const LIUHE_PAIR = { 0: 1, 1: 0, 2: 11, 11: 2, 3: 10, 10: 3, 4: 9, 9: 4, 5: 8, 8: 5, 6: 7, 7: 6 };

/**
 * 结合用户个人八字日柱（如 `乙酉`）与喜用五行推演今日专属运势
 */
function computePersonalFortune({ dayGz, jianchuMeta, zhishen, hours, userDayGanzhi, favorableElements = [] }) {
  const cleanGz = String(userDayGanzhi || '').trim();
  if (cleanGz.length < 2) return null;
  const uGan = cleanGz[0];
  const uZhi = cleanGz[1];
  const uGanIdx = GAN.indexOf(uGan);
  const uZhiIdx = ZHI.indexOf(uZhi);
  if (uGanIdx < 0 || uZhiIdx < 0) return null;

  const uElement = GAN_WUXING[uGanIdx];
  const dGanElement = GAN_WUXING[dayGz.ganIndex];
  const dZhiElement = ZHI_WUXING[dayGz.zhiIndex];
  const ss = shishen(uGanIdx, dayGz.ganIndex);

  // 1) 日支互动判定
  let branchRel = '日支平顺相参';
  let relDelta = 0;
  if (LIUHE_PAIR[uZhiIdx] === dayGz.zhiIndex) {
    branchRel = `${uZhi}${dayGz.zhi}六合（人缘协同、贵人助力增强）`;
    relDelta = +10;
  } else if ((uZhiIdx + 6) % 12 === dayGz.zhiIndex) {
    branchRel = `${uZhi}${dayGz.zhi}相冲（日支逢冲，宜稳守节奏、减少正面争执）`;
    relDelta = -10;
  } else if (uZhiIdx === dayGz.zhiIndex) {
    branchRel = `${uZhi}${dayGz.zhi}伏吟同气（专注自我复盘，防固执己见）`;
    relDelta = 0;
  } else if (isSheng(dZhiElement, ZHI_WUXING[uZhiIdx])) {
    branchRel = `流日地支${dayGz.zhi}${dZhiElement}相生夫妻宫${uZhi}（内在气场充沛）`;
    relDelta = +5;
  }

  // 2) 喜用神契合度
  const favList = Array.isArray(favorableElements) && favorableElements.length
    ? favorableElements
    : [];
  let favDelta = 0;
  if (favList.includes(dGanElement)) favDelta += 8;
  if (favList.includes(dZhiElement)) favDelta += 8;

  // 3) 建除与黄黑道修正
  const baseScore = 76;
  const jcDelta = jianchuMeta.luck === '吉' ? +6 : jianchuMeta.luck === '凶' ? -6 : 0;
  const zsDelta = zhishen.luck === '吉' ? +4 : -3;
  const score = Math.max(52, Math.min(96, baseScore + relDelta + favDelta + jcDelta + zsDelta));

  const grade = score >= 86
    ? '大吉 · 顺水推舟'
    : score >= 76
      ? '中吉 · 稳步进取'
      : score >= 66
        ? '平顺 · 循序渐进'
        : '韬光 · 宜静勿躁';

  // 4) 十神主题锦囊
  const shishenAdviceMap = {
    比肩: '今日比肩主事，同辈协作与社交联络增多，适合团队共创与信息对齐，财务上注意明算账。',
    劫财: '今日劫财透出，人情往来与竞争意识升温，适合推进高执行力任务，宜控制非计划内的消费。',
    食神: '今日食神当值，思维舒展、审美与表达力在线，极利头脑风暴、内容创作、聚餐会友与身心放松。',
    伤官: '今日伤官主事，灵感敏锐、敢于突破常规，适合攻克技术难点或创新提案，沟通中宜留三分余地。',
    偏财: '今日偏财透干，对商机与资源整合较为敏感，适合商务拓展、客户拜访与盘活存量资源。',
    正财: '今日正财主事，脚踏实地、务实高效，适合推进主业交付、合同核对、预算规划与资产盘点。',
    七杀: '今日七杀当值，目标感与抗压执行力凸显，适合集中清理积压难题，注意劳逸结合、避免急躁。',
    正官: '今日正官主事，秩序井然、利树立专业口碑，适合汇报沟通、制度梳理、合规审批与长辈交流。',
    偏印: '今日偏印透出，洞察力与独立思考能力增强，适合深度研究、复盘总结与学习新工具。',
    正印: '今日正印当值，贵人提携与长辈助力明显，适合请教前辈、考证进修、签约沉淀与静心养神。',
  };

  const colorMap = {
    木: '竹青、松石绿、翠色',
    火: '朱砂红、暖橘、绛紫',
    土: '米白、驼色、暖黄',
    金: '月白、银灰、浅杏',
    水: '玄黑、藏青、雾霾蓝',
  };
  const luckyElem = favList[0] || dGanElement || uElement;
  const luckyColors = colorMap[luckyElem] || '月白、竹青、玄黑';

  // 选出今日对命主最吉利的 3 个时辰（黄道吉时 + 不与命主日支相冲）
  const luckyHours = hours
    .filter((h) => h.luck === '吉' && (h.zhiIndex + 6) % 12 !== uZhiIdx)
    .slice(0, 3)
    .map((h) => `${h.zhi}时(${h.timeRange})`);

  const rawSummary =
    `您的本命日柱为「${cleanGz}（${uGan}${uElement}）」，逢今日「${dayGz.name}（${dGanElement}${dZhiElement}）」流日，天干透出「${ss}」，地支呈现「${branchRel}」。` +
    `${shishenAdviceMap[ss] || '今日宜顺应节律、稳步推进既定计划。'}`;

  return {
    userDayGanzhi: cleanGz,
    userDayMaster: `${uGan}${uElement}`,
    liuriShishen: ss,
    branchRelation: branchRel,
    score,
    grade,
    luckyElement: luckyElem,
    luckyColors,
    luckyHours,
    summary: gate(rawSummary, { system: 'bazi', section: 'almanac' }).text,
  };
}

/**
 * 计算指定日期的完整运势黄历（含可选的个人日柱定制运势）
 * @param {{ year?:number, month?:number, day?:number, dayGanzhi?:string, favorableElements?:string[] }} [opts]
 */
export function computeAlmanac(opts = {}) {
  // 默认按北京时间（UTC+8）取今日公历年月日
  const nowBj = new Date(Date.now() + 8 * 3600 * 1000);
  const year = Number(opts.year) || nowBj.getUTCFullYear();
  const month = Number(opts.month) || (nowBj.getUTCMonth() + 1);
  const day = Number(opts.day) || nowBj.getUTCDate();

  if (!Number.isInteger(year) || year < 1901 || year > 2099) {
    throw new Error('黄历查询年份需在 1901–2099 之间');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('黄历日期参数不合法');
  }

  const { jdUtc, jdn, yearGz, monthGz, dayGz, curTerm, nextTerm } = computeDayPillars(year, month, day);
  const lunar = toLunar(jdUtc, 8);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];

  // 建除十二神：以月支与日支之差推算
  const jcIdx = (dayGz.zhiIndex - monthGz.zhiIndex + 12) % 12;
  const jcName = JIANCHU[jcIdx];
  const jcMeta = JIANCHU_META[jcName];

  // 黄黑道十二值神
  const qlStart = QINGLONG_START_ZHI[monthGz.zhiIndex] ?? 0;
  const zsIdx = (dayGz.zhiIndex - qlStart + 12) % 12;
  const zhishen = ZHISHEN[zsIdx];

  // 二十八宿
  const xiu = XIU_28[((jdn + 11) % 28 + 28) % 28];

  // 冲煞（正冲地支 + 天干相克冲 + 三合煞方）
  const chongZhiIdx = (dayGz.zhiIndex + 6) % 12;
  const chongGanIdx = (dayGz.ganIndex + 4) % 10;
  const chongZodiac = ZODIAC[chongZhiIdx];
  const chongGanzhi = GAN[chongGanIdx] + ZHI[chongZhiIdx];
  const shaDir = shaDirectionOf(dayGz.zhiIndex);

  // 彭祖百忌
  const pengzu = `${PENGZU_GAN[dayGz.gan]}，${PENGZU_ZHI[dayGz.zhi]}`;

  // 四神吉方
  const directions = DIR_BY_GAN[dayGz.gan] || DIR_BY_GAN.甲;

  // 十二时辰吉凶
  const hours = computeTwelveHours(dayGz.ganIndex, dayGz.zhiIndex);

  // 个人定制日运（若传入了命主日柱）
  const personal = computePersonalFortune({
    dayGz,
    jianchuMeta: jcMeta,
    zhishen,
    hours,
    userDayGanzhi: opts.dayGanzhi || '',
    favorableElements: opts.favorableElements || [],
  });

  const pad = (n) => String(n).padStart(2, '0');
  return {
    solar: {
      year,
      month,
      day,
      dateStr: `${year}-${pad(month)}-${pad(day)}`,
      weekday,
    },
    lunar: {
      yearGanzhi: lunar.yearGanzhi,
      zodiac: lunar.zodiac,
      monthName: lunar.monthName,
      dayName: lunar.dayName,
      isLeap: lunar.isLeap,
      fullText: `农历${lunar.yearGanzhi}（${lunar.zodiac}）年${lunar.monthName}${lunar.dayName}`,
    },
    pillars: {
      year: yearGz.name,
      month: monthGz.name,
      day: dayGz.name,
      dayGan: dayGz.gan,
      dayZhi: dayGz.zhi,
      dayElement: `${GAN_WUXING[dayGz.ganIndex]}${ZHI_WUXING[dayGz.zhiIndex]}`,
      nayin: nayinOfIndex(dayGz.index),
    },
    solarTerm: {
      current: curTerm.name,
      next: nextTerm.name,
      daysUntilNext: nextTerm.daysUntil,
    },
    jianchu: {
      name: jcName,
      title: `${jcName}日`,
      luck: jcMeta.luck,
      desc: jcMeta.desc,
    },
    zhishen: {
      name: zhishen.name,
      type: zhishen.type,
      luck: zhishen.luck,
      label: `${zhishen.name}（${zhishen.type}${zhishen.luck}日）`,
    },
    xiu,
    yi: jcMeta.yi,
    ji: jcMeta.ji,
    chongSha: {
      chongZodiac,
      chongGanzhi,
      shaDir,
      text: `日冲${chongZodiac}（${chongGanzhi}）· 煞${shaDir}`,
    },
    pengzu,
    directions,
    hours,
    personal,
  };
}
