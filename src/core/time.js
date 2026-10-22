/**
 * 时间处理：时区、真太阳时、ΔT、城市经纬度
 * 假设（见设计文档 D3/D4）：
 *  - 1900 年后中国境内统一按 UTC+8 处理
 *  - ΔT 采用十年表线性插值
 */

import { ymdToJdn, dayOfYear, angleDiff } from './julian.js';

export const DEFAULT_TZ = 8;

/** 主要城市经纬度（东经为正，北纬为正） */
export const CITIES = [
  { name: '北京', lon: 116.41, lat: 39.9 },
  { name: '上海', lon: 121.47, lat: 31.23 },
  { name: '广州', lon: 113.26, lat: 23.13 },
  { name: '深圳', lon: 114.06, lat: 22.55 },
  { name: '天津', lon: 117.2, lat: 39.13 },
  { name: '重庆', lon: 106.55, lat: 29.56 },
  { name: '成都', lon: 104.07, lat: 30.57 },
  { name: '杭州', lon: 120.15, lat: 30.27 },
  { name: '南京', lon: 118.8, lat: 32.06 },
  { name: '武汉', lon: 114.31, lat: 30.6 },
  { name: '西安', lon: 108.94, lat: 34.34 },
  { name: '沈阳', lon: 123.43, lat: 41.8 },
  { name: '哈尔滨', lon: 126.53, lat: 45.8 },
  { name: '长春', lon: 125.32, lat: 43.82 },
  { name: '济南', lon: 117.0, lat: 36.65 },
  { name: '青岛', lon: 120.38, lat: 36.07 },
  { name: '郑州', lon: 113.63, lat: 34.75 },
  { name: '长沙', lon: 112.94, lat: 28.23 },
  { name: '南昌', lon: 115.89, lat: 28.68 },
  { name: '福州', lon: 119.3, lat: 26.08 },
  { name: '厦门', lon: 118.09, lat: 24.48 },
  { name: '合肥', lon: 117.28, lat: 31.86 },
  { name: '昆明', lon: 102.83, lat: 24.88 },
  { name: '贵阳', lon: 106.63, lat: 26.65 },
  { name: '南宁', lon: 108.37, lat: 22.82 },
  { name: '海口', lon: 110.32, lat: 20.04 },
  { name: '兰州', lon: 103.83, lat: 36.06 },
  { name: '西宁', lon: 101.78, lat: 36.62 },
  { name: '银川', lon: 106.28, lat: 38.47 },
  { name: '乌鲁木齐', lon: 87.62, lat: 43.82 },
  { name: '拉萨', lon: 91.11, lat: 29.65 },
  { name: '呼和浩特', lon: 111.75, lat: 40.84 },
  { name: '太原', lon: 112.55, lat: 37.87 },
  { name: '石家庄', lon: 114.51, lat: 38.04 },
  { name: '苏州', lon: 120.62, lat: 31.32 },
  { name: '无锡', lon: 120.3, lat: 31.57 },
  { name: '宁波', lon: 121.55, lat: 29.87 },
  { name: '温州', lon: 120.7, lat: 28.0 },
  { name: '东莞', lon: 113.75, lat: 23.04 },
  { name: '佛山', lon: 113.12, lat: 23.02 },
  { name: '香港', lon: 114.17, lat: 22.32 },
  { name: '澳门', lon: 113.55, lat: 22.2 },
  { name: '台北', lon: 121.52, lat: 25.03 },
  { name: '高雄', lon: 120.3, lat: 22.63 },
  // —— 地级市补充 ——
  { name: '唐山', lon: 118.18, lat: 39.63 }, { name: '保定', lon: 115.48, lat: 38.87 },
  { name: '邯郸', lon: 114.54, lat: 36.63 }, { name: '秦皇岛', lon: 119.6, lat: 39.94 },
  { name: '大同', lon: 113.3, lat: 40.08 }, { name: '包头', lon: 109.84, lat: 40.66 },
  { name: '鞍山', lon: 122.99, lat: 41.11 }, { name: '吉林', lon: 126.55, lat: 43.84 },
  { name: '大庆', lon: 125.1, lat: 46.59 }, { name: '齐齐哈尔', lon: 123.92, lat: 47.35 },
  { name: '大连', lon: 121.62, lat: 38.91 }, { name: '烟台', lon: 121.39, lat: 37.52 },
  { name: '潍坊', lon: 119.16, lat: 36.71 }, { name: '洛阳', lon: 112.45, lat: 34.62 },
  { name: '开封', lon: 114.31, lat: 34.8 }, { name: '襄阳', lon: 112.12, lat: 32.01 },
  { name: '宜昌', lon: 111.29, lat: 30.69 }, { name: '岳阳', lon: 113.13, lat: 29.36 },
  { name: '株洲', lon: 113.13, lat: 27.83 }, { name: '衡阳', lon: 112.57, lat: 26.89 },
  { name: '常德', lon: 111.69, lat: 29.04 }, { name: '汕头', lon: 116.68, lat: 23.35 },
  { name: '湛江', lon: 110.36, lat: 21.27 }, { name: '中山', lon: 113.39, lat: 22.52 },
  { name: '惠州', lon: 114.42, lat: 23.11 }, { name: '珠海', lon: 113.58, lat: 22.27 },
  { name: '南宁', lon: 108.37, lat: 22.82 }, { name: '柳州', lon: 109.43, lat: 24.33 },
  { name: '桂林', lon: 110.29, lat: 25.27 }, { name: '遵义', lon: 106.93, lat: 27.73 },
  { name: '绵阳', lon: 104.68, lat: 31.47 }, { name: '宜宾', lon: 104.64, lat: 28.75 },
  { name: '南充', lon: 106.11, lat: 30.84 },
  { name: '曲靖', lon: 103.8, lat: 25.5 },   { name: '咸阳', lon: 108.71, lat: 34.33 },
  { name: '宝鸡', lon: 107.24, lat: 34.36 },
  { name: '克拉玛依', lon: 84.87, lat: 45.58 }, { name: '日喀则', lon: 88.88, lat: 29.27 },
  { name: '徐州', lon: 117.18, lat: 34.26 }, { name: '扬州', lon: 119.42, lat: 32.39 },
  { name: '南通', lon: 120.86, lat: 32.01 }, { name: '常州', lon: 119.97, lat: 31.81 },
  { name: '嘉兴', lon: 120.76, lat: 30.75 }, { name: '绍兴', lon: 120.58, lat: 30.03 },
  { name: '金华', lon: 119.65, lat: 29.08 }, { name: '台州', lon: 121.42, lat: 28.66 },
  { name: '泉州', lon: 118.59, lat: 24.91 }, { name: '漳州', lon: 117.65, lat: 24.51 },
  { name: '赣州', lon: 114.93, lat: 25.85 }, { name: '九江', lon: 116.0, lat: 29.71 },
  { name: '上饶', lon: 117.94, lat: 28.45 }, { name: '阜阳', lon: 115.82, lat: 32.9 },
  { name: '芜湖', lon: 118.38, lat: 31.33 },   { name: '蚌埠', lon: 117.39, lat: 32.92 },
  { name: '临汾', lon: 111.52, lat: 36.09 },
  { name: '鄂尔多斯', lon: 109.78, lat: 39.61 },
  { name: '三亚', lon: 109.51, lat: 18.25 },
  { name: '新加坡', lon: 103.82, lat: 1.35 },
  { name: '东京', lon: 139.69, lat: 35.69 },
  { name: '纽约', lon: -74.01, lat: 40.71 },
  { name: '洛杉矶', lon: -118.24, lat: 34.05 },
  { name: '伦敦', lon: -0.13, lat: 51.51 },
  { name: '悉尼', lon: 151.21, lat: -33.87 },
];

export function lookupCity(name) {
  if (!name) return null;
  const s = String(name).trim();
  return CITIES.find((c) => c.name === s) || CITIES.find((c) => c.name.includes(s)) || null;
}

/** ΔT（秒）：十年表线性插值 */
const DELTA_T_TABLE = [
  [1900, -2.7], [1910, 10.5], [1920, 21.2], [1930, 24.4], [1940, 24.3],
  [1950, 29.2], [1960, 33.1], [1970, 40.2], [1980, 50.5], [1990, 56.9],
  [2000, 63.8], [2010, 66.1], [2020, 69.4], [2030, 74.0], [2040, 80.0],
  [2050, 87.0], [2060, 95.0], [2070, 104.0], [2080, 114.0], [2090, 125.0],
  [2100, 137.0],
];

export function deltaT(year) {
  const t = DELTA_T_TABLE;
  if (year <= t[0][0]) return t[0][1];
  if (year >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (let i = 0; i < t.length - 1; i++) {
    if (year >= t[i][0] && year <= t[i + 1][0]) {
      const r = (year - t[i][0]) / (t[i + 1][0] - t[i][0]);
      return t[i][1] + r * (t[i + 1][1] - t[i][1]);
    }
  }
  return t[t.length - 1][1];
}

/** 时差方程 EoT（分钟）：真太阳时 = 平太阳时 + EoT */
export function equationOfTime(year, month, day) {
  const n = dayOfYear(year, month, day);
  const b = (2 * Math.PI * (n - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/** 本地（标准时区）时间 -> UT 小数儒略日 */
export function localToJdUtc(year, month, day, hour = 0, minute = 0, tzOffset = DEFAULT_TZ) {
  return ymdToJdn(year, month, day) - 0.5 + (hour + minute / 60 - tzOffset) / 24;
}

/**
 * UT 儒略日 + 经度 -> 真太阳时儒略日
 * 平太阳时 = UT + lon/15 小时；真太阳时 = 平太阳时 + EoT
 */
export function utcToTrueSolarJd(jdUtc, lon) {
  const mean = jdUtc + lon / 360;
  // 用该时刻对应的公历日计算 EoT
  const approx = jdToApproxYmd(mean);
  const eot = equationOfTime(approx.year, approx.month, approx.day);
  return mean + eot / 1440;
}

function jdToApproxYmd(jd) {
  // 仅用于求 EoT，精度到日即可
  const z = Math.floor(jd + 0.5);
  const a = z + 32044;
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

/**
 * 归一化输入时间与地点，产出排盘用基准时间
 * @returns {{ jdUtc:number, jdSolar:number, tzOffset:number, lon:number, lat:number, cityName:string }}
 */
export function resolveDateTime(input) {
  const tzOffset = Number.isFinite(input.tzOffset) ? input.tzOffset : DEFAULT_TZ;
  let lon = input.lon;
  let lat = input.lat;
  let cityName = input.city || '';
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    const c = lookupCity(cityName);
    if (c) {
      lon = c.lon;
      lat = c.lat;
      cityName = c.name;
    } else {
      lon = 120 - tzOffset * 15; // fallback：时区中央经线
      lat = 35;
      cityName = cityName || `UTC${tzOffset >= 0 ? '+' : ''}${tzOffset}`;
    }
  }
  const jdUtc = localToJdUtc(input.year, input.month, input.day, input.hour || 0, input.minute || 0, tzOffset);
  const jdSolar = input.useTrueSolarTime === false ? jdUtc + lon / 360 : utcToTrueSolarJd(jdUtc, lon);
  return { jdUtc, jdSolar, tzOffset, lon, lat, cityName };
}

export { angleDiff };
