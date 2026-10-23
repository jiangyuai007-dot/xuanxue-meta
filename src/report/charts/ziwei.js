/**
 * 紫微斗数十二宫盘（文墨天机专业版 · 竖排星曜列 + 三区宫底 + 手机端一屏全显加固）
 *
 * 核心设计（1:1 还原文墨天机专业排盘视觉与信息密度）：
 *  1. 宫格上半部（.zb 星曜区）：采用传统竖排单字列（.scol），自左向右依次排布：
 *     - 【十四主星】（朱砂红/紫金加粗竖列 + 庙旺得利平不陷亮度 + 生年四化章 + ↓本宫离心自化 / ↑对宫向心四化）
 *     - 【空宫借星】（若本宫无主星，以虚线浅褐竖列标注「借·对宫主星」，绝不遮挡本宫原有的吉煞杂曜）
 *     - 【吉曜辅星】（左辅/右弼/文昌/文曲/天魁/天钺/禄存/天马/红鸾/天喜，靛青紫竖列 + 亮度 + 四化）
 *     - 【六煞星】（擎羊/陀罗/火星/铃星/地空/地劫，赭石暗红竖列 + 亮度）
 *     - 【乙级杂曜】（天刑/天姚/阴煞/三台/八座/龙池/凤阁/孤辰/寡宿等 20+ 颗星曜，暖褐小字竖列，默认全显）
 *  2. 宫格下半部（.zw-foot 文墨三区宫底）：
 *     - 左下（.zwf-l 三神叠列）：博士十二神 / 岁前十二星 / 将前十二星 三行垂直对齐
 *     - 中下（.zwf-c 大限小限）：大限十年岁段按钮（点击切换大限盘）+ 流年虚岁序列
 *     - 右下（.zwf-r 长生与宫垣）：长生十二神（长生/沐浴…帝旺）+ 宫干支 + 宫名（含身宫印记）+「详」字抽屉
 *  3. 中宫 2×2（.mid）：阴阳男女 · 五行局 · 阳历/农历/四柱 · 命主/身主/子年斗君 · 生年四化 · 现行大限
 */

import { esc, list, WX_COLOR } from './shared.js';
import { PALACE_ORDER, SIHUA } from '../../engines/ziwei.js';

const elColor = (e) => WX_COLOR[e] || '#6b5640';

/** 地支在盘上的固定坐标（顺时针） */
const GRID = {
  巳: [0, 0], 午: [0, 1], 未: [0, 2], 申: [0, 3],
  辰: [1, 0], 酉: [1, 3],
  卯: [2, 0], 戌: [2, 3],
  寅: [3, 0], 丑: [3, 1], 子: [3, 2], 亥: [3, 3],
};
const ZHI_SEQ = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const HUA_COLOR = { lu: '#2e7d52', quan: '#b3392c', ke: '#2f6ea8', ji: '#a8201a' };
const GAN_CHARS = '甲乙丙丁戊己庚辛壬癸';

/** 宫位 i 的三方四正：三合 (i+4)(i+8) + 对宫 (i+6) */
const partnersOf = (i) => [(i + 4) % 12, (i + 8) % 12, (i + 6) % 12];

/** 将星名拆为竖排单字 HTML（如 "紫微" -> "紫<br>微"） */
const vChars = (str) => Array.from(String(str || '')).map((ch) => esc(ch)).join('<br>');

const CSS = `
.zw2{--ink:#29231b;--sub:#7d7160;--gold:#b0812b;--line:#d5c6ab;
  width:100%;max-width:860px;margin:0 auto;color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:13px}
.zw2 *{box-sizing:border-box}
.zw2 .r{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.zw2 .hd{text-align:center;padding:10px 12px 8px;background:linear-gradient(180deg,#fffdf8,#f8f0df);border:1px solid var(--line);border-radius:10px 10px 0 0}
.zw2 .hd .t{font-family:"Noto Serif SC",serif;font-size:17px;font-weight:700;letter-spacing:3px;color:#29231b}
.zw2 .hd .m{margin-top:3px;font-size:11.5px;color:var(--sub);line-height:1.4}
.zw2 .hd .h4{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:6px}
.zw2 .hd .h4 i{font-style:normal;font-size:11px;border-radius:4px;padding:1px 8px;color:#fff;font-weight:600}
.zw2 .bwrap{position:relative;width:100%;overflow:hidden}
/* 严格 4 等分网格，min-width:0 确保手机端 360px~430px 绝不撑破或截断右侧宫格 */
.zw2 .board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:auto;gap:1.5px;padding:1.5px;background:#cbbba0;border:1px solid var(--line);border-top:none;width:100%}
.zw2 .zp{background:#fffdf9;padding:5px 5px 4px;min-height:164px;min-width:0;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;transition:box-shadow .15s,background .15s;position:relative}
.zw2 .zp.ming{background:#fdf3dd}
.zw2 .zp.shen{box-shadow:inset 0 0 0 1.5px rgba(176,129,43,.65)}
/* 上半部：文墨天机竖排星曜列 */
.zw2 .zcell{display:flex;flex-direction:column;flex:1;cursor:pointer;user-select:none;min-height:0;min-width:0}
.zw2 .zb{flex:1;display:flex;flex-direction:row;flex-wrap:wrap;align-items:flex-start;align-content:flex-start;gap:3px 3.5px;min-width:0;padding-bottom:3px}
.zw2 .ms-wrap,.zw2 .fsgrid,.zw2 .zzgrid{display:contents}
.zw2 .scol{display:inline-flex;flex-direction:column;align-items:center;justify-content:flex-start;line-height:1.08;text-align:center;min-width:13px;position:relative}
.zw2 .scol b{font-weight:700;display:block;letter-spacing:0}
/* 主星竖列：朱砂深红加粗 */
.zw2 .sc-main{min-width:15px}
.zw2 .sc-main b{font-family:"Noto Serif SC",serif;font-size:13.5px;font-weight:800;color:#b3241a;line-height:1.06}
/* 空宫借星：浅褐虚线框竖列，与本宫辅煞杂曜并排共存 */
.zw2 .sc-borrow{min-width:13px;padding:1px 1px;border:1px dashed #d8cbb3;border-radius:3px;background:#faf5ea}
.zw2 .sc-borrow b{font-size:10px;font-weight:600;color:#93846c;line-height:1.06}
/* 吉曜辅星竖列：紫青色 */
.zw2 .sc-fu b{font-size:11.5px;font-weight:700;color:#4a3578;line-height:1.08}
/* 六煞星竖列：赭石暗红 */
.zw2 .sc-sha b{font-size:11.5px;font-weight:700;color:#8f2d22;line-height:1.08}
/* 乙级杂曜竖列：暖褐小字 */
.zw2 .sc-za b{font-size:10.5px;font-weight:500;color:#6e5d47;line-height:1.08}
/* 庙旺得利平不陷亮度标 */
.zw2 .bd,.zw2 .fbd{font-style:normal;text-decoration:none;font-size:9.5px;color:#85682a;font-weight:600;margin-top:1px;line-height:1.05}
.zw2 .bd.bad,.zw2 .fbd.bad{color:#b83b2e;font-weight:700}
/* 生年四化实心色块 + 宫干自化/向心四化标记 */
.zw2 .scol em{font-style:normal;font-size:9px;line-height:13px;width:13px;height:13px;border-radius:2px;color:#fff;text-align:center;font-weight:700;margin-top:1px;flex:0 0 auto}
.zw2 .shua{text-decoration:none;font-style:normal;font-size:8.5px;line-height:1.1;font-weight:800;margin-top:1px;padding:0 1px;border-radius:2px;white-space:nowrap}
.zw2 .shua.self{color:#b3241a;background:#fdebe8;border:1px solid #e6a8a1}
.zw2 .shua.opp{color:#2f6ea8;background:#eaf2fa;border:1px solid #a9c7e4}
/* 精简切换：勾选 #zw-simp 时仅折叠乙级小杂曜，主星+吉曜+六煞+底部三神/长生始终保留 */
#zw-simp:checked ~ .bwrap .sc-za{display:none}
#zw-simp:not(:checked) ~ .modebar .mbtn-sub{background:#2f7d52;color:#fff;border-color:#2f7d52}
/* 下半部：文墨天机经典三区宫底（左三神 · 中运限 · 右长生干支宫名） */
.zw2 .zw-foot{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:end;gap:2px;padding-top:3px;border-top:1px dashed #e5dac3;min-width:0;user-select:none}
.zw2 .zwf-l{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;line-height:1.14;font-size:9.5px;color:#6b5c47;white-space:nowrap}
.zw2 .zwf-l .zboshi{color:#3d5c45;font-weight:600}
.zw2 .zwf-l .zsui{color:#7c6a53}
.zw2 .zwf-l .zjiang{color:#5e5073}
.zw2 .zwf-c{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:0;overflow:hidden;gap:1px}
.zw2 .zd{display:inline-block;font-size:11px;font-weight:800;color:#b03a2e;cursor:pointer;padding:0 4px;line-height:1.3;border-radius:3px;background:#fdf0ec;border:1px solid #edd0c7;white-space:nowrap}
.zw2 .zd.cur{background:#b03a2e;color:#fff;border-color:#b03a2e}
.zw2 .zly{font-size:9px;color:#938671;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.zw2 .zwf-r{display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;line-height:1.15;min-width:0}
.zw2 .zwf-r-top{display:flex;align-items:center;gap:2px;margin-bottom:1px}
.zw2 .zcs{font-size:9.5px;font-weight:700;color:#7a5c12;background:#f7efe0;border-radius:2px;padding:0 3px;white-space:nowrap}
.zw2 .zw-dtl-btn{font-style:normal;font-size:9.5px;color:#7a5c12;background:#f2e5cb;border:1px solid #d4be92;border-radius:3px;padding:0 3px;line-height:1.25;cursor:pointer;text-decoration:none}
.zw2 .zw-dtl-btn:hover{border-color:#b0812b;background:#e8d4ab}
.zw2 .zh{display:flex;align-items:center;justify-content:flex-end;gap:2px;cursor:pointer;white-space:nowrap}
.zw2 .zg{font-size:11px;color:#7d7160;white-space:nowrap}
.zw2 .zg b{font-family:"Noto Serif SC",serif;font-weight:700}
.zw2 .zn{font-family:"Noto Serif SC",serif;font-size:12px;font-weight:800;color:#3d2f1d;white-space:nowrap}
.zw2 .shen-b{display:inline-block;font-size:9.5px;line-height:12px;padding:0 2px;margin-left:1px;border-radius:2px;background:#b3392c;color:#fff;vertical-align:1px}
.zw2 .dxns{display:none}
.zw2 .dxns i{display:none;font-style:normal;font-family:"Noto Serif SC",serif;font-size:12px;font-weight:800;color:#1f6e43;white-space:nowrap}
.zw2 .lns{display:contents}
.zw2 .lns i{display:none;font-style:normal;font-family:"Noto Serif SC",serif;font-size:12px;font-weight:800;color:#9a7720;white-space:nowrap}
.zw2 .zp.ming .zn,.zw2 .zp.ming .dxns i,.zw2 .zp.ming .lns i{color:#b3241a}
/* 中宫 2x2：对标文墨天机中宫排盘总览 */
.zw2 .mid{grid-column:2 / span 2;grid-row:2 / span 2;background:linear-gradient(180deg,#fffdf9,#f7f0df);
  padding:8px 12px;display:flex;flex-direction:column;justify-content:space-between;gap:3px;
  position:relative;z-index:4;min-width:0;overflow:hidden;border:1px solid #e5d8be}
.zw2 .mid .mttl{display:flex;align-items:center;justify-content:space-between;gap:6px;border-bottom:1.5px solid #dfd1b4;padding-bottom:4px;margin-bottom:1px}
.zw2 .mid .mttl-main{font-family:"Noto Serif SC",serif;font-size:13.5px;font-weight:800;letter-spacing:1.5px;color:#29231b}
.zw2 .mid .mttl-badge{font-size:11px;font-weight:700;color:#fff;background:linear-gradient(135deg,#b8892e,#8f6718);padding:1px 8px;border-radius:999px;white-space:nowrap}
.zw2 .mid .mrow{display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11.5px;color:#5c4b37;border-bottom:1px dotted #e5dbc7;padding:2px 0;min-width:0}
.zw2 .mid .mrow span:first-child{flex:0 0 auto;color:#827562;font-size:11px}
.zw2 .mid .mrow b{color:#29231b;font-weight:600;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zw2 .mid .sz4{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.zw2 .mid .sz4 i{font-style:normal;font-weight:700;font-family:"Noto Serif SC",serif;font-size:12.5px;background:#faf3e3;border:1px solid #e3d6bc;border-radius:4px;padding:0 5px}
.zw2 .mid .mhc4{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end}
.zw2 .mid .mhc{font-style:normal;font-size:10px;line-height:16px;border-radius:3px;padding:0 5px;color:#fff;font-weight:600;white-space:nowrap}
.zw2 .mid .tip{font-size:10px;color:#857762;text-align:center;padding-top:2px;line-height:1.35}
/* 三方四正虚线 + 宫干四化飞星曲线 */
.zw2 .lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5}
.zw2 .lines g{opacity:0;transition:opacity .15s}
.zw2 .lines line{stroke:#c3baa8;stroke-width:1.25;stroke-dasharray:5 4}
.zw2 .lines circle{fill:rgba(251,247,236,.85);stroke:#c3baa8;stroke-width:1.1}
.zw2 .lines path.fly-path{fill:none;stroke-width:1.35;opacity:.48}
/* 模式条 / 面板 */
.zw2 .modebar{border:1px solid var(--line);border-top:none;background:#f5ecda;padding:6px 10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.zw2 .mbtn{font-size:12px;font-weight:700;color:#fff;background:#b0812b;border-radius:4px;padding:3px 10px;cursor:pointer;user-select:none;white-space:nowrap}
.zw2 .mbtn-sub{background:#fffdf8;color:#6b5640;border:1px solid #d8cba9;font-weight:600}
.zw2 .mtip{font-size:11px;color:#7a6e5d}
.zw2 .dxnav{border:1px solid var(--line);border-top:none;background:#faf5e8;padding:6px 8px;display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:nowrap}
.zw2 .dxnav label{font-size:11.5px;color:#6b5640;border:1px solid #e2d6be;border-radius:4px;padding:3px 8px;cursor:pointer;background:#fffdf8;user-select:none;font-weight:600;flex:0 0 auto}
.zw2 .dxnav label[data-cur]{border-color:#b03a2e;color:#b03a2e}
.zw2 .panels{border:1px solid var(--line);border-top:none;background:#fffdf8;padding:0}
.zw2 .panels:last-of-type{border-radius:0 0 10px 10px}
.zw2 .panels>div{display:none;padding:10px 12px;font-size:12.5px;color:#6b5640;line-height:1.75}
.zw2 .panels b{color:#2f2a22}
.zw2 .panels .hc{font-style:normal;font-size:11px;border-radius:3px;padding:1px 5px;color:#fff;margin:0 1px}
.zw2 .fly-row{margin-top:4px;font-size:11.5px;color:#6b5640;display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.zw2 .fly-chip{display:inline-flex;align-items:center;gap:2px;background:#faf6ee;border:1px solid #e7ddc9;border-radius:4px;padding:1px 5px;font-size:11px}
.zw2 .fly-chip i{font-style:normal;font-size:9.5px;border-radius:2px;padding:0 3px;color:#fff;font-weight:700}
.zw2 .lnl{font-size:11.5px;color:#9a7720;cursor:pointer;user-select:none;border:1px solid #e7ddc9;border-radius:3px;padding:1px 6px;margin:1px 2px;display:inline-block;background:#fffdf8}
.zw2 .bn{font-style:normal}
.zw2 .bdx{display:none;font-style:normal}
.zw2 .bdx i{display:none;font-style:normal}
/* 手机窄屏专项适配：4列严丝合缝一屏展示文墨天机竖列星盘 */
@media (max-width:600px){
  .zw2 .hd{padding:6px 6px 5px}
  .zw2 .hd .t{font-size:14.5px;letter-spacing:1.5px}
  .zw2 .hd .m{font-size:10px}
  .zw2 .board{gap:1px;padding:1px}
  .zw2 .zp{min-height:118px;padding:3px 3px 2px}
  .zw2 .zb{gap:1px 1.5px;padding-bottom:2px}
  .zw2 .scol{min-width:10px}
  .zw2 .sc-main{min-width:11.5px}
  .zw2 .sc-main b{font-size:11px}
  .zw2 .sc-borrow b{font-size:8.5px}
  .zw2 .sc-fu b,.zw2 .sc-sha b{font-size:9.5px}
  .zw2 .sc-za b{font-size:8px}
  .zw2 .bd,.zw2 .fbd{font-size:7.5px}
  .zw2 .scol em{width:10.5px;height:10.5px;line-height:10.5px;font-size:7.5px}
  .zw2 .shua{font-size:7px;padding:0}
  /* 手机端宫底改为上下两行：第一行左三神+右大限岁段（绝不截断），第二行左长生/详+右干支宫名 */
  .zw2 .zw-foot{grid-template-columns:1fr auto;gap:1px 2px;padding-top:2px}
  .zw2 .zwf-l{flex-direction:row;flex-wrap:wrap;gap:0 2px;font-size:7.5px;line-height:1.1}
  .zw2 .zwf-l .zjiang{display:none}
  .zw2 .zwf-c{align-items:flex-end;overflow:visible}
  .zw2 .zd{font-size:9px;padding:0 2.5px}
  .zw2 .zly{display:none}
  .zw2 .zwf-r{grid-column:1 / -1;flex-direction:row;align-items:center;justify-content:space-between;width:100%;border-top:1px dotted #eee5d3;padding-top:1px;margin-top:1px}
  .zw2 .zwf-r-top{margin-bottom:0;gap:1.5px}
  .zw2 .zcs{font-size:7.5px;padding:0 1.5px}
  .zw2 .zw-dtl-btn{font-size:7.5px;padding:0 1.5px}
  .zw2 .zg{font-size:8.5px}
  .zw2 .zn,.zw2 .dxns i,.zw2 .lns i{font-size:9.5px;letter-spacing:-0.3px}
  .zw2 .shen-b{font-size:7.5px;line-height:9.5px;padding:0 1px}
  .zw2 .mid{padding:4px 5px;gap:1px}
  .zw2 .mid .mttl-main{font-size:11px;letter-spacing:0.5px}
  .zw2 .mid .mttl-badge{font-size:9px;padding:0 4px}
  .zw2 .mid .mrow{font-size:9px;padding:1px 0}
  .zw2 .mid .mrow span:first-child{font-size:8.5px}
  .zw2 .mid .sz4{gap:1.5px}
  .zw2 .mid .sz4 i{font-size:9.5px;padding:0 1.5px}
  .zw2 .mid .mhc{font-size:8px;line-height:12px;padding:0 2.5px}
  .zw2 .mid .tip{font-size:8px}
}
`;

export function renderZiwei(f) {
  const palaces = Object.values(f.palaces || {});
  const byZhi = {};
  for (const p of palaces) byZhi[p.zhi] = p;
  const zhiIndexOf = (z) => ZHI_SEQ.indexOf(z);

  const daXianByZhi = {};
  const dxList = list(f.daXian);
  for (const d of dxList) daXianByZhi[d.zhi] = d;

  const mingZhi = f.mingGong ? f.mingGong.zhi : '寅';
  const mingI = zhiIndexOf(mingZhi);

  const huaChip = (h) => (h ? `<em style="background:${HUA_COLOR[h.type] || '#999'}">${esc(h.label)}</em>` : '');
  const selfHuaBadge = (s) => {
    let out = '';
    if (s.selfHua) out += `<ins class="shua self" title="本宫宫干离心自化${esc(s.selfHua.label)}">↓${esc(s.selfHua.label)}</ins>`;
    if (s.oppHua) out += `<ins class="shua opp" title="对宫宫干向心化${esc(s.oppHua.label)}">↑${esc(s.oppHua.label)}</ins>`;
    return out;
  };

  /* ---------- 流年状态表：12 大限 × 10 流年 = 120 态 ---------- */
  const lnStates = [];
  dxList.forEach((d, k) => {
    list(d.liuNian).forEach((y, j) => {
      const gi = GAN_CHARS.indexOf(y.ganzhi[0]);
      const h = SIHUA[gi] || {};
      lnStates.push({
        id: `${k}-${j}`,
        dxOrder: k,
        dxRange: `${d.ageStart}-${d.ageEnd}`,
        year: y.year,
        ganzhi: y.ganzhi,
        zhi: y.zhi,
        zIdx: zhiIndexOf(y.zhi),
        sihua: h,
      });
    });
  });

  /* ---------- 每宫流年虚岁速查 ---------- */
  const birthZhiIdx = zhiIndexOf(f.lunar && f.lunar.yearGanzhi ? f.lunar.yearGanzhi[1] : '子');
  const lnAgeByZhi = {};
  for (let z = 0; z < 12; z++) {
    const r = (((z - birthZhiIdx) % 12) + 12) % 12 + 1;
    const ages = [];
    for (let a = r; a <= 120; a += 12) ages.push(a);
    lnAgeByZhi[ZHI_SEQ[z]] = ages;
  }

  const gzColored = (gz) => {
    const s = String(gz || '');
    const ZHI_EL = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
    const GAN_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
    const g = GAN_EL[s[0]], zz = ZHI_EL[s[1]];
    return `<b style="color:${g ? elColor(g) : 'inherit'}">${esc(s[0] || '')}</b><b style="color:${zz ? elColor(zz) : 'inherit'}">${esc(s[1] || '')}</b>`;
  };

  const RING_GODS = new Set([
    '博士', '力士', '青龙', '小耗', '将军', '奏书', '飞廉', '喜神', '病符', '大耗', '伏兵', '官府',
    '长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养',
    '将星', '攀鞍', '岁驿', '息神', '华盖', '劫煞', '灾煞', '天煞', '指背', '咸池', '月煞', '亡神',
    '岁建', '晦气', '丧门', '贯索', '官符', '龙德', '白虎', '天德', '吊客',
  ]);
  const SHA_SET = new Set(['擎羊', '陀罗', '火星', '铃星', '地空', '地劫']);

  const cellHtml = (zhi) => {
    const p = byZhi[zhi];
    if (!p) return '<div class="zp"></div>';
    const ci = zhiIndexOf(zhi);
    const dx = daXianByZhi[zhi];
    const allStars = list(p.stars);
    const mains = allStars.filter((s) => s.kind === '主星');
    // 吉曜辅星 + 六煞星（含地空/地劫/天马提升至辅煞层）
    const fus = allStars.filter((s) => s.kind === '辅星' || s.subKind === '吉曜' || s.subKind === '煞曜');
    // 乙级杂曜（排除底部专门展示的博士/长生/将前/岁前十二神，避免重复）
    const zas = allStars.filter((s) =>
      s.kind === '杂' &&
      s.subKind !== '吉曜' &&
      s.subKind !== '煞曜' &&
      !['博士', '长生', '将前', '岁前'].includes(s.subKind) &&
      !RING_GODS.has(s.name)
    );

    // 1. 主星竖排单字列（必须保留 class="bd" 仅在 14 颗主星上）
    const mainCols = `<div class="ms-wrap">` + mains.map((s) =>
      `<span class="scol sc-main ms"><b>${vChars(s.name)}</b>${s.brightness ? `<i class="bd${'陷不'.includes(s.brightness) ? ' bad' : ''}" title="${esc(s.name)}：${esc(s.brightness)}">${esc(s.brightness)}</i>` : ''}${huaChip(s.hua)}${selfHuaBadge(s)}</span>`
    ).join('') + `</div>`;

    // 2. 空宫借星竖列（与本宫辅星/煞曜/乙级杂曜并列显示，不再吞掉整格）
    const opp = byZhi[ZHI_SEQ[(ci + 6) % 12]];
    const oppMains = list(opp && opp.stars).filter((s) => s.kind === '主星');
    const borrowCols = mains.length === 0
      ? (oppMains.length
        ? oppMains.map((s) => `<span class="scol sc-borrow js" title="本宫无主星，借对宫（${esc(opp ? opp.name : '')}）${esc(s.name)}同参"><b>借<br>${vChars(s.name)}</b></span>`).join('')
        : '<span class="scol sc-borrow kongcell"><b>空<br>宫</b></span>')
      : '';

    // 3. 辅曜与六煞竖排单字列
    const fuCols = fus.map((s) => {
      const isSha = SHA_SET.has(s.name) || s.subKind === '煞曜';
      const fbd = s.brightness ? `<s class="fbd${'陷不'.includes(s.brightness) ? ' bad' : ''}">${esc(s.brightness)}</s>` : '';
      return `<span class="scol ${isSha ? 'sc-sha' : 'sc-fu'} fs"><b>${vChars(s.name)}</b>${fbd}${huaChip(s.hua)}${selfHuaBadge(s)}</span>`;
    }).join('');

    // 4. 乙级杂曜竖排单字列
    const zaCols = zas.map((s) =>
      `<span class="scol sc-za zz"><b>${vChars(s.name)}</b></span>`
    ).join('');

    // 5. 底部三神（博士/岁前/将前）+ 长生十二神
    const boshi = p.boshi || (allStars.find((s) => s.subKind === '博士') || {}).name || '';
    const suiqian = p.suiqian || (allStars.find((s) => s.subKind === '岁前') || {}).name || '';
    const jiangqian = p.jiangqian || (allStars.find((s) => s.subKind === '将前') || {}).name || '';
    const changsheng = p.changsheng || (allStars.find((s) => s.subKind === '长生') || {}).name || '';

    const lnAges = lnAgeByZhi[zhi] || [];
    const zly = `<span class="zly" title="流年/小限落本宫虚岁：${lnAges.join(',')}">流年 ${lnAges.slice(0, 4).join(',')}</span>`;
    const dxNames = dxList.map((d, k) => {
      const nm = PALACE_ORDER[(ci - zhiIndexOf(d.zhi) + 12) % 12];
      return `<i data-dx="${k}">${esc(nm)}</i>`;
    }).join('');
    const lnNames = lnStates.map((s) => {
      const nm = PALACE_ORDER[(ci - s.zIdx + 12) % 12];
      return `<i data-ln="${s.id}">${esc(nm)}</i>`;
    }).join('');
    const cls = ['zp', p.isMing ? 'ming' : '', p.isShen ? 'shen' : ''].filter(Boolean).join(' ');
    const zd = dx
      ? `<label class="zd${dx.isCurrent ? ' cur' : ''}" data-dxz="${dx.order}" for="zwdx-${dx.order}" title="点击切换到 ${dx.ageStart}-${dx.ageEnd} 岁大限盘">${dx.ageStart}-${dx.ageEnd}${dx.isCurrent ? '·今' : ''}</label>`
      : '';
    const dtlTitle = `${p.name}（${p.ganzhi}宫）${p.isMing ? ' · 本命宫' : ''}${p.isShen ? ' · 身宫' : ''}`;
    const fl = p.flyHua;
    const flyTxt = fl ? ['lu', 'quan', 'ke', 'ji'].map((k) => {
      const it = fl[k];
      return it ? `化${it.label}：${it.star} → ${it.targetPalace || it.targetZhi}${it.isSelf ? '(本宫自化)' : (k === 'ji' && it.chongPalace ? `(冲${it.chongPalace})` : '')}` : '';
    }).filter(Boolean).join(' ｜ ') : '';
    const dtlBody = [
      `【主星】${mains.length ? mains.map((s) => s.name + (s.brightness ? `(${s.brightness})` : '') + (s.hua ? `[生年化${s.hua.label}]` : '') + (s.selfHua ? `[↓自化${s.selfHua.label}]` : '')).join('、') : `空宫（借对宫${opp ? opp.name : ''}：${oppMains.map((s) => s.name).join('、') || '无'}）`}`,
      `【吉煞辅曜】${fus.length ? fus.map((s) => s.name + (s.brightness ? `(${s.brightness})` : '') + (s.hua ? `[生年化${s.hua.label}]` : '')).join('、') : '无'}`,
      `【乙级杂曜】${zas.length ? zas.map((s) => s.name).join('、') : '无'}`,
      `【宫底四神】长生十二神：${changsheng || '—'} ｜ 博士十二神：${boshi || '—'} ｜ 岁前：${suiqian || '—'} ｜ 将前：${jiangqian || '—'}`,
      dx ? `【大限】${dx.ageStart}–${dx.ageEnd} 岁行本宫（大限干支 ${dx.ganzhi}）` : '',
      flyTxt ? `【宫干飞化（${p.gan}干）】${flyTxt}` : '',
      `【流年虚岁】${lnAges.slice(0, 8).join('、')} 岁`,
    ].filter(Boolean).join('\n');

    return `<div class="${cls}" data-i="${ci}" data-z="${esc(zhi)}" data-zw-title="${esc(dtlTitle)}" data-zw-detail="${esc(dtlBody)}">
      <label class="zcell" for="zwpg-${ci}">
        <div class="zb">${mains.length ? mainCols : borrowCols}${fus.length ? `<span class="fsgrid">${fuCols}</span>` : ''}${zas.length ? `<span class="zzgrid">${zaCols}</span>` : ''}</div>
      </label>
      <div class="zw-foot">
        <div class="zwf-l" title="博士十二神 / 岁前十二星 / 将前十二星">
          <span class="zboshi">${esc(boshi)}</span>
          <span class="zsui">${esc(suiqian)}</span>
          <span class="zjiang">${esc(jiangqian)}</span>
        </div>
        <div class="zwf-c">${zd}${zly}</div>
        <div class="zwf-r">
          <div class="zwf-r-top">${changsheng ? `<span class="zcs" title="长生十二神">${esc(changsheng)}</span>` : ''}<u class="zw-dtl-btn qm-el" data-t="${esc(dtlTitle)}" data-x="${esc(dtlBody)}" title="查看本宫完整星曜与宫干飞化详情">详</u></div>
          <label class="zh" for="zwpg-${ci}"><span class="zg">${gzColored(p.ganzhi)}</span><span class="zn">${esc(p.name)}${p.isShen ? '<b class="shen-b">身</b>' : ''}</span><span class="dxns">${dxNames}</span><span class="lns">${lnNames}</span></label>
        </div>
      </div>
    </div>`;
  };

  /* ---------- 盘面（4×4，中宫 2×2） ---------- */
  const board = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (r === 1 && c === 1) {
        board.push(middleBlock(f));
        continue;
      }
      if (r >= 1 && r <= 2 && c >= 1 && c <= 2) continue;
      const zhi = Object.keys(GRID).find((z) => GRID[z][0] === r && GRID[z][1] === c);
      board.push(cellHtml(zhi));
    }
  }

  /* ---------- 默认不勾选 #zw-simp（默认完整展现文墨天机全星盘，点按钮可切极简） ---------- */
  const simpCheck = '<input class="r" type="checkbox" id="zw-simp">';
  const palaceRadios = ZHI_SEQ.map((z, i) =>
    `<input class="r" type="radio" name="zwpg" id="zwpg-${i}"${i === mingI ? ' checked' : ''}>`).join('');
  const dxRadios = ['<input class="r" type="radio" name="zwdx" id="zwdx-ben" checked>']
    .concat(dxList.map((d) => `<input class="r" type="radio" name="zwdx" id="zwdx-${d.order}">`)).join('');
  const lnRadios = lnStates.map((s) =>
    `<input class="r" type="radio" name="zwln" id="ln-${s.id}">`).join('');

  /* ---------- 三方四正虚线 + 宫干四化飞星曲线（viewBox 400×400） ---------- */
  const ctrNum = (zhi) => {
    const [r, c] = GRID[zhi];
    return { x: c * 100 + 50, y: r * 100 + 50 };
  };
  const svgDefs = `<defs>${['lu', 'quan', 'ke', 'ji'].map((k) =>
    `<marker id="zw-arr-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="${HUA_COLOR[k]}"/>
    </marker>`
  ).join('')}</defs>`;

  const lineGroups = ZHI_SEQ.map((z, i) => {
    const from = ctrNum(z);
    const segs = partnersOf(i).map((j) => {
      const to = ctrNum(ZHI_SEQ[j]);
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>` +
        `<circle cx="${to.x}" cy="${to.y}" r="3.2"></circle>`;
    }).join('');
    const p = byZhi[z];
    const fl = p && p.flyHua;
    const flySegs = fl ? ['lu', 'quan', 'ke', 'ji'].map((k, idx) => {
      const item = fl[k];
      if (!item || !item.targetZhi || !GRID[item.targetZhi]) return '';
      const to = ctrNum(item.targetZhi);
      const col = HUA_COLOR[k];
      if (item.isSelf) return '';
      const mx = (from.x + to.x) / 2 + (idx - 1.5) * 12;
      const my = (from.y + to.y) / 2 + (1.5 - idx) * 10;
      return `<path class="fly-path" d="M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}" stroke="${col}" marker-end="url(#zw-arr-${k})"></path>`;
    }).join('') : '';
    return `<g data-sel="${i}">${segs}${flySegs}</g>`;
  }).join('');

  /* ---------- 交互 CSS ---------- */
  const selCss = ZHI_SEQ.map((z, i) => {
    const self = `#zwpg-${i}:checked ~ .bwrap .zp[data-i="${i}"]`;
    const partners = partnersOf(i).map((j) =>
      `#zwpg-${i}:checked ~ .bwrap .zp[data-i="${j}"]`).join(',');
    return `${self}{background:#fdf3dc;box-shadow:inset 0 0 0 2px #b0812b}
${partners}{background:#faf5e6;box-shadow:inset 0 0 0 1px #d4b872}
#zwpg-${i}:checked ~ .bwrap .lines g[data-sel="${i}"]{opacity:1}`;
  }).join('\n');

  const dxCss = dxList.map((d, k) => {
    const z0 = zhiIndexOf(d.zhi);
    return `#zwdx-${k}:checked ~ .bwrap .zn{display:none}
#zwdx-${k}:checked ~ .bwrap .dxns{display:inline}
#zwdx-${k}:checked ~ .bwrap .dxns i{display:none}
#zwdx-${k}:checked ~ .bwrap .dxns i[data-dx="${k}"]{display:inline}
#zwdx-${k}:checked ~ .bwrap .zp[data-i="${z0}"]{box-shadow:inset 0 0 0 2px rgba(176,129,43,.75)}
#zwdx-${k}:checked ~ .bwrap .zd[data-dxz="${k}"]{background:#b03a2e;color:#fff;border-radius:3px}
#zwdx-${k}:checked ~ .dxbar>div[data-dxp="${k}"]{display:block}
#zwdx-${k}:checked ~ .dxnav label[data-dxn="${k}"]{background:#b0812b;color:#fff;border-color:#b0812b}`;
  }).join('\n') + `\n#zwdx-ben:checked ~ .dxbar>div[data-dxp="ben"]{display:block}
#zwdx-ben:checked ~ .dxnav label[data-dxn="ben"]{background:#b0812b;color:#fff;border-color:#b0812b}`;

  const lnCss = lnStates.map((s) => {
    const dz0 = zhiIndexOf(dxList[s.dxOrder].zhi);
    const pre = `#zwdx-${s.dxOrder}:checked ~ #ln-${s.id}:checked`;
    return `${pre} ~ .bwrap .zn{display:none}
${pre} ~ .bwrap .dxns{display:none}
${pre} ~ .bwrap .lns i[data-ln="${s.id}"]{display:inline}
${pre} ~ .bwrap .zp[data-i="${s.zIdx}"]{box-shadow:inset 0 0 0 2px #b3392c}
${pre} ~ .bwrap .zp[data-i="${dz0}"]{box-shadow:inset 0 0 0 1.5px rgba(176,129,43,.45)}
${pre} ~ .lnbar>div[data-lnp="${s.id}"]{display:block}`;
  }).join('\n');

  /* ---------- 宫位信息面板（含三方四正 + 宫干四化飞星） ---------- */
  const selPanels = ZHI_SEQ.map((z, i) => {
    const p = byZhi[z];
    if (!p) return '';
    const benName = (q, j) => {
      const stars = list(q && q.stars).filter((s) => s.kind === '主星').map((s) => s.name).join('·') || '空宫';
      return `${esc(q ? q.name : '')}(${ZHI_SEQ[j]}·${stars})`;
    };
    const parts = partnersOf(i).map((j) => {
      const q = byZhi[ZHI_SEQ[j]];
      const b = benName(q, j);
      const dn = dxList.map((d, k) => {
        const nm = PALACE_ORDER[(j - zhiIndexOf(d.zhi) + 12) % 12];
        const stars = list(q && q.stars).filter((s) => s.kind === '主星').map((s) => s.name).join('·') || '空宫';
        return `<i data-dxk="${k}">${esc(nm)}(${ZHI_SEQ[j]}·${stars})</i>`;
      }).join('');
      return `<span class="bn">${b}</span><span class="bdx">${dn}</span>`;
    }).join('　');
    const selfBn = `<span class="bn"><b>本命 ${esc(p.name)} · ${esc(p.ganzhi)}</b></span>`;
    const selfDx = `<span class="bdx">${dxList.map((d, k) => {
      const nm = PALACE_ORDER[(i - zhiIndexOf(d.zhi) + 12) % 12];
      return `<i data-dxk="${k}"><b>大限 ${esc(nm)} · ${esc(p.ganzhi)}</b></i>`;
    }).join('')}</span>`;
    const fl = p.flyHua;
    const flyHtml = fl ? `<div class="fly-row"><span>宫干飞化（<b>${esc(p.gan)}干</b>）：</span>${['lu', 'quan', 'ke', 'ji'].map((k) => {
      const it = fl[k];
      if (!it) return '';
      const extra = it.isSelf ? '·↓本宫自化' : (k === 'ji' && it.chongPalace ? `·冲${esc(it.chongPalace)}` : '');
      return `<span class="fly-chip"><i style="background:${HUA_COLOR[k]}">${esc(it.label)}</i>${esc(it.star)}→<b>${esc(it.targetPalace || it.targetZhi)}</b>${extra}</span>`;
    }).join('')}</div>` : '';
    return `<div data-selp="${i}">${selfBn}${selfDx}　三方四正 → ${parts}${flyHtml}</div>`;
  }).join('');

  const selPanelsCss = ZHI_SEQ.map((z, i) =>
    `#zwpg-${i}:checked ~ .selbar>div[data-selp="${i}"]{display:block}`).join('\n')
    + '\n' + dxList.map((d, k) =>
    `#zwdx-${k}:checked ~ .selbar .bn{display:none}
#zwdx-${k}:checked ~ .selbar .bdx{display:inline}
#zwdx-${k}:checked ~ .selbar .bdx i{display:none}
#zwdx-${k}:checked ~ .selbar .bdx i[data-dxk="${k}"]{display:inline}`).join('\n');

  /* ---------- 大限面板（十年流年可点 → 流年盘） ---------- */
  const hc = (t, s) => `<i class="hc" style="background:${HUA_COLOR[t]}">${{ lu: '禄', quan: '权', ke: '科', ji: '忌' }[t]}${esc(s)}</i>`;
  const dxPanels = dxList.map((d, k) => {
    const ln = list(d.liuNian).map((y, j) =>
      `<label class="lnl" for="ln-${k}-${j}" title="点击切换到 ${y.year} ${esc(y.ganzhi)} 流年盘">${y.year} ${esc(y.ganzhi)}</label>`).join('');
    return `<div data-dxp="${k}"><b>第 ${k + 1} 大限 · ${d.ageStart}-${d.ageEnd} 岁（虚岁）</b>　大限命宫入 <b>${esc(d.zhi)}宫（${esc(d.ganzhi)}）</b>〔本命 ${esc(d.palace)}〕<br>
    大限四化（以${esc(d.ganzhi[0])}干起）：${hc('lu', d.sihua.lu)}${hc('quan', d.sihua.quan)}${hc('ke', d.sihua.ke)}${hc('ji', d.sihua.ji)}<br>
    <span style="color:#a2977f">十年流年（点年份切流年盘）：</span>${ln}</div>`;
  }).join('');
  const dxRange0 = dxList[0] ? `${dxList[0].ageStart}-${dxList[0].ageEnd}` : '';
  const benPanel = `<div data-dxp="ben"><b>文墨天机全星盘</b>　每宫上部自左向右竖排「主星 · 吉曜 · 六煞 · 乙级杂曜」；下部左列「博士/岁前/将前十二神」、中列「十年大限（${esc(dxRange0)}…）与流年虚岁」、右列「长生十二神与宫垣干支」。点击任意宫格看三方四正飞星，点「详」看单宫断语。</div>`;

  /* ---------- 底部大限横向滑动速查条 ---------- */
  const dxNav = `<div class="dxnav"><label data-dxn="ben" for="zwdx-ben">本命盘</label>` +
    dxList.map((d) => `<label data-dxn="${d.order}" for="zwdx-${d.order}"${d.isCurrent ? ' data-cur="1"' : ''} title="${d.ageStart}-${d.ageEnd} 岁 · ${esc(d.zhi)}宫 · ${esc(d.palace)}">${d.ageStart}-${d.ageEnd}岁</label>`).join('') + `</div>`;

  /* ---------- 流年面板（120 态） ---------- */
  const lnPanels = lnStates.map((s) => {
    const h = s.sihua;
    return `<div data-lnp="${s.id}"><b>${s.year} ${esc(s.ganzhi)} 流年</b>　流年命宫入 <b>${esc(s.zhi)}宫</b>〔大限 ${esc(s.dxRange)}〕<br>
    流年四化（以${esc(s.ganzhi[0])}干起）：${hc('lu', h.lu)}${hc('quan', h.quan)}${hc('ke', h.ke)}${hc('ji', h.ji)}</div>`;
  }).join('');

  /* ---------- 顶栏 ---------- */
  const four = f.fourHua || {};
  const headMeta = [
    f.yinYangGender || '',
    f.lunar ? `农历${f.lunar.yearGanzhi}年${f.lunar.isLeap ? '闰' : ''}${f.lunar.month}月${f.lunar.day}日（${f.lunar.zodiac}）` : '',
    `${f.wuXingJu.name}`,
    f.xuAge ? `虚岁${f.xuAge}` : '',
    f.time && f.time.hourZhi ? `${f.time.hourZhi}时` : '',
  ].filter(Boolean).join(' · ');

  return `<style class="zw2-style">${CSS}
${selCss}
${dxCss}
${lnCss}
${selPanelsCss}</style><div class="zw2">
    <div class="hd">
      <div class="t">紫微斗数 · 文墨天机十二宫盘</div>
      <div class="m">${esc(headMeta)}</div>
      <div class="h4">
        <i style="background:${HUA_COLOR.lu}">禄·${esc(four.lu ? four.lu.star : '—')}</i>
        <i style="background:${HUA_COLOR.quan}">权·${esc(four.quan ? four.quan.star : '—')}</i>
        <i style="background:${HUA_COLOR.ke}">科·${esc(four.ke ? four.ke.star : '—')}</i>
        <i style="background:${HUA_COLOR.ji}">忌·${esc(four.ji ? four.ji.star : '—')}</i>
      </div>
    </div>
    ${simpCheck}
    ${palaceRadios}
    ${dxRadios}
    ${lnRadios}
    ${dxNav}
    <div class="bwrap">
      <div class="board">${board.join('')}</div>
      <svg class="lines" viewBox="0 0 400 400" preserveAspectRatio="none">${svgDefs}${lineGroups}</svg>
    </div>
    <div class="modebar">
      <label class="mbtn" for="zwdx-ben">回本命盘</label>
      <label class="mbtn mbtn-sub" for="zw-simp" title="切换文墨全星盘 / 极简主辅盘">文墨全星 / 极简</label>
      <span class="mtip">↓离心自化 · ↑向心四化 · 点宫格看三方飞星 · 点「详」看单宫全解</span>
    </div>
    <div class="panels selbar">${selPanels}</div>
    <div class="panels dxbar">${benPanel}${dxPanels}</div>
    <div class="panels lnbar">${lnPanels}</div>
  </div>`;
}

function middleBlock(f) {
  const curDx = list(f.daXian).find((d) => d.isCurrent);
  const sz = f.siZhu || {};
  const sd = f.solarDate || {};
  const four = f.fourHua || {};
  const szColored = (gz) => {
    const s = String(gz || '');
    const ZHI_EL = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
    const GAN_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
    const g = GAN_EL[s[0]], zz = ZHI_EL[s[1]];
    return `<b style="color:${g ? elColor(g) : 'inherit'}">${esc(s[0] || '')}</b><b style="color:${zz ? elColor(zz) : 'inherit'}">${esc(s[1] || '')}</b>`;
  };
  const szHtml = sz.year
    ? `<span class="sz4"><i>${szColored(sz.year)}</i><i>${szColored(sz.month)}</i><i>${szColored(sz.day)}</i><i>${szColored(sz.hour)}</i></span>`
    : '<b>—</b>';
  const mhc = (t, s) => (s ? `<i class="mhc" style="background:${HUA_COLOR[t]}">${{ lu: '禄', quan: '权', ke: '科', ji: '忌' }[t]}${esc(s)}</i>` : '');
  const sihuaHtml = `<span class="mhc4">${mhc('lu', four.lu && four.lu.star)}${mhc('quan', four.quan && four.quan.star)}${mhc('ke', four.ke && four.ke.star)}${mhc('ji', four.ji && four.ji.star)}</span>`;
  const solarStr = sd.year ? `${sd.year}-${String(sd.month).padStart(2, '0')}-${String(sd.day).padStart(2, '0')}${f.time && f.time.hourZhi ? ` ${f.time.hourZhi}时` : ''}` : '—';
  const shenPalace = f.shenGong && f.shenGong.palace ? f.shenGong.palace : '';
  return `<div class="mid">
    <div class="mttl">
      <span class="mttl-main">玄机 · 文墨中宫</span>
      <span class="mttl-badge">${esc(f.yinYangGender || '命造')} · ${esc(f.wuXingJu.name)}</span>
    </div>
    <div class="mrow"><span>阳历</span><b>${esc(solarStr)}${f.xuAge ? ` · 虚岁${f.xuAge}` : ''}</b></div>
    <div class="mrow"><span>四柱</span>${szHtml}</div>
    <div class="mrow"><span>命宫 / 身宫</span><b>命在${esc(f.mingGong.zhi)} · 身在${esc(f.shenGong.zhi)}${shenPalace ? `(${esc(shenPalace)})` : ''}</b></div>
    <div class="mrow"><span>命主 / 身主</span><b>${esc(f.mingZhu || '—')} / ${esc(f.shenZhu || '—')}${f.ziDou ? ` · 子斗${esc(f.ziDou)}` : ''}</b></div>
    ${curDx ? `<div class="mrow"><span>当前大限</span><b>${curDx.ageStart}-${curDx.ageEnd}岁 · ${esc(curDx.palace)}(${esc(curDx.zhi)})</b></div>` : ''}
    <div class="mrow"><span>生年四化</span>${sihuaHtml}</div>
    <div class="tip">点宫格看三方飞化 · 点红字岁段切大限 · 点「详」看单宫断语</div>
  </div>`;
}
