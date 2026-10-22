/**
 * 儒略日（Julian Day Number）与公历互转
 * 采用 Fliegel–Van Flandern 算法，格里高利历（proleptic Gregorian）。
 * JDN 为整数日号；JD = JDN - 0.5 表示该日 00:00 UT。
 */

/** 公历年月日 -> 儒略日号（整数） */
export function ymdToJdn(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** 儒略日号 -> { year, month, day } */
export function jdnToYmd(jdn) {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

/** 星期：0=周日, 1=周一 ... 6=周六（JDN 0 为周一） */
export function jdnToWeekday(jdn) {
  return ((jdn + 1) % 7 + 7) % 7;
}

export const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** 公历年月日时分秒（UT）-> 小数儒略日 */
export function ymdhmsToJd(year, month, day, hour = 0, minute = 0, second = 0) {
  return ymdToJdn(year, month, day) - 0.5 + (hour + minute / 60 + second / 3600) / 24;
}

/** 小数儒略日 -> { year, month, day, hour, minute }（UT，四舍五入到分钟） */
export function jdToYmdhms(jd) {
  const jdn = Math.floor(jd + 0.5);
  const frac = jd + 0.5 - jdn;
  const ymd = jdnToYmd(jdn);
  let minutes = Math.round(frac * 1440);
  if (minutes >= 1440) {
    minutes -= 1440;
    const next = jdnToYmd(jdn + 1);
    return { ...next, hour: Math.floor(minutes / 60), minute: minutes % 60 };
  }
  return { ...ymd, hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

/** 一年中的第几天（1 起） */
export function dayOfYear(year, month, day) {
  return ymdToJdn(year, month, day) - ymdToJdn(year, 1, 1) + 1;
}

/** 该年是否为闰年（格里高利历） */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 该年天数 */
export function daysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}

/** 该月天数 */
export function daysInMonth(year, month) {
  const table = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return table[month - 1];
}

/** 角度差归一化到 [-180, 180) */
export function angleDiff(a, b) {
  let d = (a - b) % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** 角度归一化到 [0, 360) */
export function norm360(x) {
  return ((x % 360) + 360) % 360;
}
