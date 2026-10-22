/**
 * 命盘渲染公共层
 * 只做「事实包 → 视觉」的转换，不产生任何新的命理判断。
 * 每个命盘模块自带作用域样式（scoped CSS），保证 Web 预览、导出报告、分享卡视觉一致。
 */

/** 天干 → 五行 */
export const GAN_WX = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土',
  庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

/** 地支 → 五行 */
export const ZHI_WX = {
  寅: '木', 卯: '木', 巳: '火', 午: '火', 辰: '土', 戌: '土',
  丑: '土', 未: '土', 申: '金', 酉: '金', 亥: '水', 子: '水',
};

/** 五行色（金=金、土=棕，五色可辨，不与品牌金冲突） */
export const WX_COLOR = {
  木: '#2f7d52',
  火: '#c0392b',
  土: '#9c6b3f',
  金: '#c9a227',
  水: '#2b6ba6',
};

/** 五行底色 */
export const WX_BG = {
  木: 'rgba(47,125,82,.10)',
  火: 'rgba(192,57,43,.10)',
  土: 'rgba(156,107,63,.12)',
  金: 'rgba(201,162,39,.12)',
  水: 'rgba(43,107,166,.10)',
};

/** 取任意天干/地支的五行色 */
export const wxOf = (x) => WX_COLOR[GAN_WX[x] || ZHI_WX[x]] || '#6b5640';

/** 取任意天干/地支的五行 */
export const elementOf = (x) => GAN_WX[x] || ZHI_WX[x] || '';

/** HTML 转义 */
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** 公共：命盘外框（宣纸质感 + 竖排标题不使用，保持横向易读） */
export const PAPER =
  'background:linear-gradient(180deg,#fffdf8,#fbf7ee);' +
  'border:1px solid #e6ddc9;border-radius:14px;' +
  'box-shadow:0 1px 0 #fff inset,0 10px 26px -18px rgba(80,60,30,.45);';

/** 公共：小徽标 */
export const chipStyle =
  'display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:5px;' +
  'font-size:11px;line-height:1.7;background:#f5f0e6;color:#7d705a;border:1px solid #e8e0cd;';

/** 拼接作用域化的命盘：样式名带 zoom 类前缀，避免污染宿主页面 */
export function scoped(prefix, css, html) {
  return `<style class="${prefix}-style">${css}</style>${html}`;
}

/** 安全取数组 */
export const list = (v) => (Array.isArray(v) ? v : []);
