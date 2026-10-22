/**
 * 农历（夏历）转换
 * 规则：
 *  1. 月首 = 朔（新月）所在之日（按当地民用日，默认 UTC+8）
 *  2. 含「冬至」之月为十一月
 *  3. 自十一月起顺排：无中气之月为上一月之闰月
 *  4. 农历年干支 = 正月初一所在公历年的干支（(year-4) mod 60）
 */

import { ymdToJdn, jdnToYmd } from './julian.js';
import { solarTerm, newMoonsBetween, ZHONGQI_INDEXES } from './astro.js';
import { GAN, ZHI, ganzhiOfJdn } from './ganzhi.js';

const DEFAULT_TZ = 8;

/** 地支 → 生肖 */
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

/** UT 儒略日 -> 当地民用日号 */
function localDay(jdUtc, tz = DEFAULT_TZ) {
  return Math.floor(jdUtc + tz / 24 + 0.5);
}

/** 当地民用日号 -> 该日 00:00 的 UT 儒略日 */
function localDayToJdUtc(day, tz = DEFAULT_TZ) {
  return day - 0.5 - tz / 24;
}

const cache = new Map();

/** 某公历年内的全部中气（当地民用日号，升序） */
function zhongqiDays(year) {
  const key = `zq:${year}`;
  if (cache.has(key)) return cache.get(key);
  const out = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const idx of ZHONGQI_INDEXES) {
      out.push(localDay(solarTerm(y, idx).jdUtc, DEFAULT_TZ));
    }
  }
  const s = out.sort((a, b) => a - b);
  cache.set(key, s);
  return s;
}

function hasZhongqi(startDay, endDay, year) {
  const zq = zhongqiDays(year);
  for (const d of zq) {
    if (d >= startDay && d < endDay) return true;
  }
  return false;
}

/**
 * 构建农历年（正月落在公历年 gy 的那一年的月份表）
 * @returns {{ gy:number, yearGanzhiIndex:number, yearGanzhi:string, months:Array }}
 */
export function buildLunarYear(gy) {
  // 防御：浏览器表单 input.value 传进来的是字符串，'2006'+1 会拼成 '20061'，
  // 天文计算拿到脏年份会跑飞（实测把整个服务进程 100% CPU 打死，页面就像"报告出不来"）。
  // 统一在这里收敛成合法整数，脏数据一律上抛，绝不让它进下游。
  gy = Number(gy);
  if (!Number.isInteger(gy) || gy < 1900 || gy > 2100) {
    throw new Error(`非法农历年份：${gy}`);
  }
  const key = `ly:${gy}`;
  if (cache.has(key)) return cache.get(key);

  // 冬至（公历年 gy-1 的十二月）
  const winter = solarTerm(gy - 1, 23);
  const wDay = localDay(winter.jdUtc, DEFAULT_TZ);

  const from = localDayToJdUtc(wDay - 45, DEFAULT_TZ);
  const to = localDayToJdUtc(wDay + 460, DEFAULT_TZ);
  const nms = newMoonsBetween(from, to);
  const nmDays = nms.map((jd) => localDay(jd, DEFAULT_TZ));

  // 找到含冬至的月（十一月）
  let i11 = -1;
  for (let i = 0; i < nmDays.length - 1; i++) {
    if (nmDays[i] <= wDay && wDay < nmDays[i + 1]) {
      i11 = i;
      break;
    }
  }
  if (i11 < 0) throw new Error(`无法定位十一月（冬至 ${winter.jdUtc}）`);

  // 自十一月顺排 16 个月
  const months = [];
  let nextNum = 11;
  let prevNum = 11;
  for (let j = i11; j < nmDays.length - 1 && months.length < 16; j++) {
    const start = nmDays[j];
    const end = nmDays[j + 1];
    const has = hasZhongqi(start, end, gy);
    let num;
    let isLeap = false;
    if (has) {
      num = nextNum;
      prevNum = num;
      nextNum = nextNum >= 12 ? 1 : nextNum + 1;
    } else {
      num = prevNum;
      isLeap = true;
    }
    months.push({ start, end, num, isLeap, length: end - start });
  }

  // 找到正月
  const p = months.findIndex((m) => m.num === 1 && !m.isLeap);
  if (p < 0) throw new Error('无法定位正月');
  const yearMonths = [];
  for (let k = p; k < months.length; k++) {
    if (k > p && months[k].num === 1 && !months[k].isLeap) break; // 进入下一年
    yearMonths.push(months[k]);
  }

  const gz = ganzhiOfJdn(months[p].start);
  const yearGanzhiIndex = (gy - 4) % 60 < 0 ? ((gy - 4) % 60) + 60 : (gy - 4) % 60;
  const result = {
    gy,
    months: yearMonths,
    zhengYueDay: months[p].start,
    yearGanzhiIndex,
    yearGanzhi: GAN[yearGanzhiIndex % 10] + ZHI[yearGanzhiIndex % 12],
    zodiac: ZODIAC[yearGanzhiIndex % 12],
    _winterDay: wDay,
    _gzRaw: gz,
  };
  cache.set(key, result);
  return result;
}

/**
 * UT 儒略日 -> 农历
 * @returns {{ gy, yearGanzhi, zodiac, month, monthName, isLeap, day, dayName }}
 */
export function toLunar(jdUtc, tz = DEFAULT_TZ) {
  const t = localDay(jdUtc, tz);
  const g = jdnToYmd(t);
  for (const gy of [g.year - 1, g.year, g.year + 1]) {
    const ly = buildLunarYear(gy);
    for (const m of ly.months) {
      if (t >= m.start && t < m.end) {
        const day = t - m.start + 1;
        return {
          gy: ly.gy,
          yearGanzhi: ly.yearGanzhi,
          zodiac: ly.zodiac,
          month: m.num,
          monthName: (m.isLeap ? '闰' : '') + CN_NUM[m.num] + '月',
          isLeap: m.isLeap,
          day,
          dayName: day === 10 ? '初十' : CN_DAY[day - 1],
          monthLength: m.length,
        };
      }
    }
  }
  throw new Error('农历转换失败：' + jdUtc);
}

/**
 * 农历 -> 当地民用日号
 * @param {number} gy 农历年对应的公历年
 */
export function lunarToLocalDay(gy, month, day, isLeap = false) {
  const ly = buildLunarYear(gy);
  const m = ly.months.find((x) => x.num === month && (!!x.isLeap === !!isLeap));
  if (!m) {
    throw new Error(`农历 ${gy} 年 ${isLeap ? '闰' : ''}${month}月 不存在`);
  }
  if (day < 1 || day > m.length) {
    throw new Error(`农历日 ${day} 超出范围（该月 ${m.length} 天）`);
  }
  return m.start + day - 1;
}

/** 农历 -> 公历 { year, month, day } */
export function lunarToSolar(gy, month, day, isLeap = false, tz = DEFAULT_TZ) {
  const d = lunarToLocalDay(gy, month, day, isLeap);
  return jdnToYmd(d);
}

/** 列出某农历年的闰月（无则返回 null） */
export function leapMonthOf(gy) {
  const ly = buildLunarYear(gy);
  const m = ly.months.find((x) => x.isLeap);
  return m ? { month: m.num, startSolar: jdnToYmd(m.start) } : null;
}

const CN_NUM = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const CN_DAY = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

export { localDay, localDayToJdUtc };
