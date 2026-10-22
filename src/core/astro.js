/**
 * 天文计算：太阳视黄经、二十四节气时刻、朔（新月）时刻
 * 依据：Meeus《Astronomical Algorithms》低精度公式（第 25 章太阳、第 22 章月亮）
 * 精度说明（设计文档 D2）：太阳视黄经误差约 ±0.01°（≈±15 分钟），朔时刻误差约 ±10 分钟。
 */

import { ymdToJdn, angleDiff, norm360 } from './julian.js';
import { deltaT } from './time.js';

const RAD = Math.PI / 180;
const J2000 = 2451545.0;

/** 太阳视黄经（度），输入为力学时儒略日 JDE */
export function solarLongitude(jde) {
  const T = (jde - J2000) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M * RAD) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M * RAD) +
    0.000289 * Math.sin(3 * M * RAD);
  const O = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  return norm360(O - 0.00569 - 0.00478 * Math.sin(omega * RAD));
}

/**
 * 二十四节气：索引 0 = 小寒（约 1/5），依次至 23 = 冬至（约 12/21）
 * 太阳视黄经 = 285 + 15 * index
 */
export const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
  '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑',
  '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];

export const TERM_INDEX = Object.fromEntries(SOLAR_TERMS.map((n, i) => [n, i]));

/** 节（非中气）：立春、惊蛰、清明、立夏、芒种、小暑、立秋、白露、寒露、立冬、大雪、小寒 */
export const JIE_INDEXES = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
/** 中气：大寒、雨水、春分、谷雨、小满、夏至、大暑、处暑、秋分、霜降、小雪、冬至 */
export const ZHONGQI_INDEXES = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];

/** 牛顿迭代求解「太阳视黄经 = targetLon」的力学时儒略日 */
function solveSolarLongitude(targetLon, jdeGuess) {
  let jde = jdeGuess;
  for (let i = 0; i < 12; i++) {
    const f = angleDiff(solarLongitude(jde), targetLon);
    const h = 0.0005;
    const d = (angleDiff(solarLongitude(jde + h), targetLon) - angleDiff(solarLongitude(jde - h), targetLon)) / (2 * h);
    if (Math.abs(d) < 1e-9) break;
    const step = f / d;
    jde -= step;
    if (Math.abs(step) < 1e-7) break;
  }
  return jde;
}

/**
 * 某年某节气的时刻
 * @returns {{ jde:number, jdUtc:number, name:string, index:number }}
 */
export function solarTerm(year, index) {
  const targetLon = norm360(285 + 15 * index);
  const guess = ymdToJdn(year, 1, 1) - 0.5 + 4 + index * 15.2184;
  const jde = solveSolarLongitude(targetLon, guess);
  const jdUtc = jde - deltaT(year) / 86400;
  return { jde, jdUtc, name: SOLAR_TERMS[index], index, year };
}

/** 某年全部 24 节气（按索引升序） */
export function solarTermsOfYear(year) {
  return SOLAR_TERMS.map((_, i) => solarTerm(year, i));
}

// ---------------------------------------------------------------- 月亮

/** Meeus 表 22.A Σl 主项：[D, M, M', F, 系数(1e-6 度)] */
const MOON_LON_TERMS = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314],
  [0, 0, 2, 0, 213618], [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332],
  [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066], [2, 0, 1, 0, 53322],
  [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528],
  [0, 0, 1, -2, 10980], [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034],
  [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888], [2, 1, 0, 0, -6766],
  [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
  [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665],
  [0, 1, -2, 0, -2689], [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390],
  [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236], [0, 1, 2, 0, -2120],
  [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048], [2, 0, 1, -2, -1773],
  [2, 0, 0, 2, -1595], [4, -1, -1, 0, 1215], [0, 0, 2, 2, -1110],
  [3, 0, -1, 0, -892], [2, 1, 1, 0, -810], [4, -1, -2, 0, 759],
  [0, 2, -1, 0, -713], [2, 2, -1, 0, -700], [2, 1, -2, 0, 691],
  [2, -1, 0, -2, 596], [4, 0, 1, 0, 549], [0, 0, 4, 0, 537],
  [4, -1, 0, 0, 520], [1, 0, -2, 0, -487], [2, 1, 0, -2, -399],
  [0, 0, 2, -2, -381], [1, 1, 1, 0, 351], [3, 0, -2, 0, -340],
  [4, 0, -3, 0, 330], [2, -1, 2, 0, 327], [0, 2, 1, 0, -323],
  [1, 1, -1, 0, 299], [2, 0, 3, 0, 294],
];

/** 月亮黄经（度），输入 JDE */
export function moonLongitude(jde) {
  const T = (jde - J2000) / 36525;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
  const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;

  let sum = 0;
  for (const [d, m, mp, f, coeff] of MOON_LON_TERMS) {
    const arg = d * D + m * M + mp * Mp + f * F;
    sum += coeff * Math.pow(E, Math.abs(m)) * Math.sin(arg * RAD);
  }
  return norm360(Lp + sum / 1e6);
}

/** 月日角距（度），归一化到 [-180, 180) */
export function elongation(jde) {
  return angleDiff(moonLongitude(jde), solarLongitude(jde));
}

const MEAN_SYNODIC = 29.530588853;

/**
 * 平朔（Meeus 49.1）：k 为朔望月序号，k=0 对应 2000-01-06 前后
 * 注意：高阶项的自变量是 T = k / 1236.85，而非 k 本身
 */
export function meanNewMoonJde(k) {
  const T = k / 1236.85;
  return (
    2451550.09766 +
    MEAN_SYNODIC * k +
    0.00015437 * T * T -
    0.00000015 * T * T * T +
    0.00000000073 * T * T * T * T
  );
}

/**
 * 求真朔：在平朔 ±2.5 天内做「角距过零」区间扫描 + 二分
 * 采用扫描而非牛顿法，避免初值偏差较大时迭代跳到相邻朔望月（曾导致漏朔）
 */
export function trueNewMoonJde(k) {
  const mean = meanNewMoonJde(k);
  const half = 2.5;
  const step = 0.2;
  let lo = null;
  let hi = null;
  let prev = elongation(mean - half);
  for (let x = mean - half + step; x <= mean + half + 1e-9; x += step) {
    const cur = elongation(x);
    // 角距随时间递增，朔即为由负转正的过零点
    if (prev < 0 && cur >= 0 && Math.abs(prev) < 90 && Math.abs(cur) < 90) {
      lo = x - step;
      hi = x;
      break;
    }
    prev = cur;
  }
  if (lo === null) return mean; // 理论上不会发生，退化为平朔
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (elongation(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 由儒略日估算 k */
export function kFromJd(jd) {
  return Math.round((jd - 2451550.09765) / MEAN_SYNODIC);
}

/**
 * 求 [jdFrom, jdTo] 区间内的所有真朔时刻（UT 儒略日，升序）
 * 说明：内部按力学时求解后减去 ΔT 换算为 UT。
 */
export function newMoonsBetween(jdFrom, jdTo) {
  const kStart = kFromJd(jdFrom) - 2;
  const kEnd = kFromJd(jdTo) + 2;
  const raw = [];
  for (let k = kStart; k <= kEnd; k++) {
    const jde = trueNewMoonJde(k);
    const jdUtc = jde - deltaT(approxYearOfJd(jde)) / 86400;
    if (jdUtc >= jdFrom - 1 && jdUtc <= jdTo + 1) raw.push(jdUtc);
  }
  raw.sort((a, b) => a - b);
  // 去重（相邻小于 20 天视为同一朔）
  const out = [];
  for (const jd of raw) {
    if (out.length === 0 || jd - out[out.length - 1] > 20) out.push(jd);
  }
  // 自检：相邻朔间隔应在 29.2 ~ 29.9 天之间
  for (let i = 1; i < out.length; i++) {
    const gap = out[i] - out[i - 1];
    if (gap < 29.2 || gap > 29.9) {
      console.warn(`[astro] 朔间隔异常: ${gap.toFixed(2)} 天 @ JD ${out[i - 1].toFixed(3)}`);
    }
  }
  return out;
}

function approxYearOfJd(jd) {
  return 2000 + (jd - J2000) / 365.25;
}
