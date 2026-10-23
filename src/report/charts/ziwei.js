/**
 * 紫微斗数十二宫盘（交互版，对标文墨天机 · 手机端一屏全显加固版）
 *
 * 核心升级：
 *  1. 严格使用 `grid-template-columns: repeat(4, minmax(0, 1fr))` + `.zp { min-width: 0; overflow: hidden }`，
 *     彻底杜绝长文本撑破网格导致手机端右半边宫位被截断的问题，360px~430px 手机一屏完整呈现十二宫 + 中宫；
 *  2. 默认勾选 `#zw-simp`（精简模式），首屏隐藏博士/长生/将前/岁前 48 颗小杂曜，盘面清爽大字号，
 *     用户可随时点底部「显隐杂曜」切换全盘；
 *  3. 宫格内部采用文墨天机经典三段式：
 *     - 上部：主星（加粗醒目 + 庙旺利陷 + 生年四化色块）+ 辅星
 *     - 中部：大限岁段（朱红加粗，点击切换十年大限盘）
 *     - 底部宫栏：左干支、中宫名（本命/大限/流年动态重排）、右「详」字抽屉按钮
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
const HUA_COLOR = { lu: '#c99a2e', quan: '#3f6ea8', ke: '#3f8f63', ji: '#b3392c' };
const GAN_CHARS = '甲乙丙丁戊己庚辛壬癸';

/** 宫位 i 的三方四正：三合 (i+4)(i+8) + 对宫 (i+6) */
const partnersOf = (i) => [(i + 4) % 12, (i + 8) % 12, (i + 6) % 12];

const CSS = `
.zw2{--ink:#2f2a22;--sub:#8b8172;--gold:#b0812b;--line:#dccfb8;
  width:100%;max-width:780px;margin:0 auto;color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:13.5px}
.zw2 *{box-sizing:border-box}
.zw2 .r{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.zw2 .hd{text-align:center;padding:10px 10px 8px;background:linear-gradient(180deg,#fffdf8,#faf5e8);border:1px solid var(--line);border-radius:10px 10px 0 0}
.zw2 .hd .t{font-family:"Noto Serif SC",serif;font-size:17px;font-weight:700;letter-spacing:3px;color:#2f2a22}
.zw2 .hd .m{margin-top:4px;font-size:11.5px;color:var(--sub);line-height:1.4}
.zw2 .hd .h4{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;margin-top:6px}
.zw2 .hd .h4 i{font-style:normal;font-size:11px;border-radius:4px;padding:1px 7px;color:#fff;font-weight:600}
.zw2 .bwrap{position:relative;width:100%;overflow:hidden}
/* 关键修复：minmax(0,1fr) 严禁任何子元素撑宽网格列，确保手机端 4 列 100% 在一屏内完整显示 */
.zw2 .board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:auto;gap:2px;padding:2px;background:#dfd3bc;border:1px solid var(--line);border-top:none;width:100%}
.zw2 .zp{background:#fffdf9;padding:5px 5px 4px;min-height:138px;min-width:0;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;transition:box-shadow .15s,background .15s;position:relative}
.zw2 .zp.ming{background:#fdf6e4}
.zw2 .zp.shen{box-shadow:inset 0 0 0 1.5px rgba(176,129,43,.6)}
.zw2 .zh{display:flex;align-items:center;justify-content:space-between;gap:2px;margin-top:3px;padding-top:3px;border-top:1px dashed #ece3d0;cursor:pointer;user-select:none;min-width:0}
.zw2 .zn{font-family:"Noto Serif SC",serif;font-size:12.5px;font-weight:700;color:#5c4730;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zw2 .dxns{display:none}
.zw2 .dxns i{display:none;font-style:normal;font-family:"Noto Serif SC",serif;font-size:12.5px;font-weight:700;color:#5c4730;white-space:nowrap}
.zw2 .lns{display:contents}
.zw2 .lns i{display:none;font-style:normal;font-family:"Noto Serif SC",serif;font-size:12.5px;font-weight:700;color:#9a7720;white-space:nowrap}
.zw2 .zp.ming .zn,.zw2 .zp.ming .dxns i,.zw2 .zp.ming .lns i{color:#b3392c}
.zw2 .zg{font-size:11.5px;color:#8b8172;white-space:nowrap;flex:0 0 auto}
.zw2 .zg b{font-family:"Noto Serif SC",serif;font-weight:700}
.zw2 .zw-dtl-btn{font-style:normal;font-size:10px;color:#7a5c12;background:#f5ecda;border:1px solid #dcc89e;border-radius:3px;padding:0 3px;line-height:1.4;cursor:pointer;flex:0 0 auto;text-decoration:none}
.zw2 .zw-dtl-btn:hover{border-color:#b0812b;background:#efe0be}
.zw2 .zd-row{display:flex;align-items:center;justify-content:space-between;gap:2px;margin-top:2px;min-width:0}
.zw2 .zd{display:inline-block;font-size:12px;font-weight:800;color:#b3392c;cursor:pointer;user-select:none;padding:0 3px;line-height:1.3;border-radius:3px;background:#fdf0ec;white-space:nowrap}
.zw2 .zd.cur{background:#b3392c;color:#fff}
.zw2 .zly{font-size:9.5px;color:#a89c86;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.zw2 .zcell{display:flex;flex-direction:column;flex:1;cursor:pointer;user-select:none;min-height:0;min-width:0}
.zw2 .zb{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.zw2 .ms-wrap{display:flex;flex-wrap:wrap;gap:2px 4px;align-items:center}
.zw2 .ms{font-size:13.5px;font-weight:700;display:inline-flex;align-items:center;gap:1px;line-height:1.25;white-space:nowrap}
.zw2 .bd{font-style:normal;font-size:9.5px;color:#9c8f78;font-weight:500}
.zw2 .bd.bad{color:#c05a4e;font-weight:700}
.zw2 .ms em{font-style:normal;font-size:9px;line-height:13px;width:13px;height:13px;border-radius:2px;color:#fff;text-align:center;flex:0 0 auto}
.zw2 .fsgrid{margin-top:2px;display:flex;flex-wrap:wrap;gap:1px 4px}
.zw2 .fs{font-size:11px;color:#7a6e5d;display:inline-flex;align-items:center;gap:1px;white-space:nowrap;line-height:1.25}
.zw2 .fs em{font-style:normal;font-size:8.5px;line-height:11px;width:11px;height:11px;border-radius:2px;color:#fff;text-align:center}
.zw2 .zzgrid{margin-top:2px;display:flex;flex-wrap:wrap;gap:1px 3px;border-top:1px dotted #eee6d6;padding-top:2px}
.zw2 .zz{font-size:9.5px;color:#a99e88;white-space:nowrap}
#zw-simp:checked ~ .bwrap .zzgrid{display:none}
#zw-simp:not(:checked) ~ .modebar .mbtn-sub{background:#2f7d52;color:#fff;border-color:#2f7d52}
.zw2 .kongcell{font-size:10.5px;color:#c0b7a4;font-style:italic}
.zw2 .js{font-size:11.5px;font-weight:600;color:#a3967e;font-style:italic}
/* 中宫 2x2：紧凑清晰对标文墨天机 */
.zw2 .mid{grid-column:2 / span 2;grid-row:2 / span 2;background:linear-gradient(180deg,#fffdf9,#f8f2e4);
  padding:8px 10px;display:flex;flex-direction:column;justify-content:center;gap:4px;
  position:relative;z-index:4;min-width:0;overflow:hidden}
.zw2 .mid .mttl{text-align:center;font-family:"Noto Serif SC",serif;font-size:13px;font-weight:700;letter-spacing:2px;color:#2f2a22;margin-bottom:2px}
.zw2 .mid .mrow{display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:11.5px;color:#6b5640;border-bottom:1px dotted #e3d9c4;padding:2px 0;min-width:0}
.zw2 .mid .mrow span:first-child{flex:0 0 auto;color:#8b8172}
.zw2 .mid .mrow b{color:#2f2a22;font-weight:600;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zw2 .mid .sz4{display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap}
.zw2 .mid .sz4 i{font-style:normal;font-weight:700;font-family:"Noto Serif SC",serif;font-size:12px}
.zw2 .mid .mhc4{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end}
.zw2 .mid .mhc{font-style:normal;font-size:9.5px;line-height:15px;border-radius:3px;padding:0 4px;color:#fff;white-space:nowrap}
.zw2 .mid .tip{font-size:10px;color:#8b8172;text-align:center;margin-top:2px;line-height:1.35}
/* 三方四正虚线 + 宫干四化飞星曲线 */
.zw2 .lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5}
.zw2 .lines g{opacity:0;transition:opacity .15s}
.zw2 .lines line{stroke:#c9a961;stroke-width:1.2;stroke-dasharray:5 4}
.zw2 .lines circle{fill:rgba(251,247,236,.85);stroke:#c9a961;stroke-width:1.1}
.zw2 .lines path.fly-path{fill:none;stroke-width:1.4;opacity:.85}
.zw2 .lines text.fly-lbl{font-size:8.5px;font-weight:700;paint-order:stroke;stroke:#fffdf8;stroke-width:2.5px}
/* 模式条 / 面板 */
.zw2 .modebar{border:1px solid var(--line);border-top:none;background:#f5ecda;padding:6px 10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.zw2 .mbtn{font-size:12px;font-weight:700;color:#fff;background:#b0812b;border-radius:4px;padding:3px 10px;cursor:pointer;user-select:none;white-space:nowrap}
.zw2 .mbtn-sub{background:#fffdf8;color:#6b5640;border:1px solid #d8cba9;font-weight:600}
.zw2 .mtip{font-size:11px;color:#7a6e5d}
.zw2 .dxnav{border:1px solid var(--line);border-top:none;background:#faf5e8;padding:6px 8px;display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:nowrap}
.zw2 .dxnav label{font-size:11.5px;color:#6b5640;border:1px solid #e2d6be;border-radius:4px;padding:3px 8px;cursor:pointer;background:#fffdf8;user-select:none;font-weight:600;flex:0 0 auto}
.zw2 .dxnav label[data-cur]{border-color:#b3392c;color:#b3392c}
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
.zw2 .ft{padding:8px 8px 0;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;font-size:11px;color:#8b8172}
.zw2 .ft em{font-style:normal;display:inline-flex;align-items:center;gap:3px}
.zw2 .ft em i{width:10px;height:10px;border-radius:2px;display:inline-block}
.zw2 .note{padding:4px 8px 0;font-size:10.5px;color:#8b8172;text-align:center}
/* 手机窄屏专项适配：4列严丝合缝一屏展示 */
@media (max-width:600px){
  .zw2 .hd{padding:8px 6px 6px}
  .zw2 .hd .t{font-size:15.5px;letter-spacing:2px}
  .zw2 .hd .m{font-size:10.5px}
  .zw2 .board{gap:1.5px;padding:1.5px}
  .zw2 .zp{min-height:112px;padding:3px 3px 2px}
  .zw2 .ms{font-size:12px}
  .zw2 .bd{font-size:8.5px}
  .zw2 .ms em{width:11px;height:11px;line-height:11px;font-size:8px}
  .zw2 .fs{font-size:10px}
  .zw2 .zz{font-size:8.5px}
  .zw2 .zd{font-size:10.5px;padding:0 2px}
  .zw2 .zly{display:none}
  .zw2 .zh{margin-top:2px;padding-top:2px;gap:1px}
  .zw2 .zn,.zw2 .dxns i,.zw2 .lns i{font-size:11px;letter-spacing:0}
  .zw2 .zg{font-size:10px;letter-spacing:0}
  .zw2 .zw-dtl-btn{font-size:9px;padding:0 2px}
  .zw2 .mid{padding:5px 6px;gap:2px}
  .zw2 .mid .mttl{font-size:11.5px;letter-spacing:1px}
  .zw2 .mid .mrow{font-size:10px;padding:1.5px 0}
  .zw2 .mid .sz4 i{font-size:10.5px}
  .zw2 .mid .mhc{font-size:8.5px;line-height:13px;padding:0 3px}
  .zw2 .mid .tip{font-size:9px}
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

  const cellHtml = (zhi) => {
    const p = byZhi[zhi];
    if (!p) return '<div class="zp"></div>';
    const ci = zhiIndexOf(zhi);
    const dx = daXianByZhi[zhi];
    const mains = list(p.stars).filter((s) => s.kind === '主星');
    const fus = list(p.stars).filter((s) => s.kind === '辅星');
    const zas = list(p.stars).filter((s) => s.kind === '杂');
    const mainRow = `<div class="ms-wrap">` + mains.map((s) =>
      `<span class="ms" style="color:${elColor(s.wuxing)}">${esc(s.name)}${s.brightness ? `<i class="bd${'陷不'.includes(s.brightness) ? ' bad' : ''}" title="${esc(s.name)}：${esc(s.brightness)}">${esc(s.brightness)}</i>` : ''}${huaChip(s.hua)}</span>`).join('') + `</div>`;
    const opp = byZhi[ZHI_SEQ[(ci + 6) % 12]];
    const borrow = mains.length === 0
      ? `<span class="js">${list(opp && opp.stars).filter((s) => s.kind === '主星').map((s) => `借${esc(s.name)}`).join('') || '<span class="kongcell">空宫</span>'}</span>`
      : '';
    const fuRow = fus.map((s) =>
      `<span class="fs">${esc(s.name)}${huaChip(s.hua)}</span>`).join('');
    const zaRow = zas.map((s) => `<span class="zz">${esc(s.name)}</span>`).join('');
    const lnAges = lnAgeByZhi[zhi] || [];
    const zly = `<span class="zly" title="流年命宫落本宫的虚岁：${lnAges.join(',')}">${lnAges.slice(0, 4).join('/')}岁</span>`;
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
      ? `<label class="zd${dx.isCurrent ? ' cur' : ''}" data-dxz="${dx.order}" for="zwdx-${dx.order}" title="点击切换到 ${dx.ageStart}-${dx.ageEnd} 岁大限盘">${dx.ageStart}-${dx.ageEnd}</label>`
      : '';
    const dtlTitle = `${p.name}（${p.ganzhi}宫）${p.isMing ? ' · 本命宫' : ''}${p.isShen ? ' · 身宫' : ''}`;
    const fl = p.flyHua;
    const flyTxt = fl ? ['lu', 'quan', 'ke', 'ji'].map((k) => {
      const it = fl[k];
      return it ? `化${it.label}：${it.star} → ${it.targetPalace || it.targetZhi}${it.isSelf ? '(本宫自化)' : (k === 'ji' && it.chongPalace ? `(冲${it.chongPalace})` : '')}` : '';
    }).filter(Boolean).join(' ｜ ') : '';
    const dtlBody = [
      `【主星】${mains.length ? mains.map((s) => s.name + (s.brightness ? `(${s.brightness})` : '') + (s.hua ? `[生年化${s.hua.label}]` : '')).join('、') : `空宫（借对宫${opp ? opp.name : ''}：${list(opp && opp.stars).filter((s) => s.kind === '主星').map((s) => s.name).join('、') || '无'}）`}`,
      `【辅星】${fus.length ? fus.map((s) => s.name + (s.hua ? `[生年化${s.hua.label}]` : '')).join('、') : '无'}`,
      `【杂曜】${zas.length ? zas.map((s) => s.name).join('、') : '无'}`,
      dx ? `【大限】${dx.ageStart}–${dx.ageEnd} 岁行本宫（大限干支 ${dx.ganzhi}）` : '',
      flyTxt ? `【宫干飞化（${p.gan}干）】${flyTxt}` : '',
      `【流年虚岁】${lnAges.slice(0, 8).join('、')} 岁`,
    ].filter(Boolean).join('\n');
    return `<div class="${cls}" data-i="${ci}" data-z="${esc(zhi)}" data-zw-title="${esc(dtlTitle)}" data-zw-detail="${esc(dtlBody)}">
      <label class="zcell" for="zwpg-${ci}">
        <div class="zb">${mains.length ? mainRow : borrow}${fus.length ? `<span class="fsgrid">${fuRow}</span>` : ''}${zas.length ? `<span class="zzgrid">${zaRow}</span>` : ''}</div>
      </label>
      <div class="zd-row">${zd}${zly}</div>
      <label class="zh" for="zwpg-${ci}"><span class="zg">${gzColored(p.ganzhi)}</span><span class="zn">${esc(p.name)}${p.isShen ? '<b style="color:#b3392c">·身</b>' : ''}</span><span class="dxns">${dxNames}</span><span class="lns">${lnNames}</span><u class="zw-dtl-btn qm-el" data-t="${esc(dtlTitle)}" data-x="${esc(dtlBody)}" title="查看本宫完整星曜与宫干飞化详情">详</u></label>
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

  /* ---------- 默认勾选 #zw-simp（精简盘），彻底解决手机端拥挤 ---------- */
  const simpCheck = '<input class="r" type="checkbox" id="zw-simp" checked>';
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
      if (item.isSelf) {
        const ox = from.x + (idx - 1.5) * 14;
        const oy = from.y - 28;
        return `<text class="fly-lbl" x="${ox}" y="${oy}" text-anchor="middle" fill="${col}">自化${item.label}</text>`;
      }
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
#zwdx-${k}:checked ~ .bwrap .zd[data-dxz="${k}"]{background:#b3392c;color:#fff;border-radius:3px}
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
      const extra = it.isSelf ? '·本宫自化' : (k === 'ji' && it.chongPalace ? `·冲${esc(it.chongPalace)}` : '');
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
  const benPanel = `<div data-dxp="ben"><b>本命盘</b>　点任意宫位看三方四正与宫干飞化；点各宫红字岁段（${esc(dxRange0)} …）或上方横条切换十年大限盘；点宫格右下角「详」字弹出单宫完整星曜与断语。</div>`;

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
      <div class="t">紫微斗数 · 十二宫盘</div>
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
      <label class="mbtn mbtn-sub" for="zw-simp" title="切换显示或隐藏 48 颗博士/长生/将前/岁前杂曜">显隐杂曜</label>
      <span class="mtip">点宫格看飞星 · 点「详」看单宫全解</span>
    </div>
    <div class="panels selbar">${selPanels}</div>
    <div class="panels dxbar">${benPanel}${dxPanels}</div>
    <div class="panels lnbar">${lnPanels}</div>
  </div>`;
}

function middleBlock(f) {
  const curDx = list(f.daXian).find((d) => d.isCurrent);
  const sz = f.siZhu || {};
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
  return `<div class="mid">
    <div class="mttl">${esc(f.yinYangGender || '紫微命盘')} · ${esc(f.wuXingJu.name)}</div>
    <div class="mrow"><span>四柱</span>${szHtml}</div>
    <div class="mrow"><span>命/身宫</span><b>命${esc(f.mingGong.zhi)} · 身${esc(f.shenGong.zhi)}（${esc(f.shenGong.palace)}）</b></div>
    <div class="mrow"><span>命/身主</span><b>${esc(f.mingZhu || '—')} / ${esc(f.shenZhu || '—')}</b></div>
    <div class="mrow"><span>紫/府位</span><b>紫微在${esc(f.ziweiZhi)} · 天府在${esc(f.tianfuZhi)}</b></div>
    ${curDx ? `<div class="mrow"><span>现行大限</span><b>${curDx.ageStart}-${curDx.ageEnd}岁 · ${esc(curDx.palace)}(${esc(curDx.zhi)})</b></div>` : ''}
    <div class="mrow"><span>生年四化</span>${sihuaHtml}</div>
    <div class="tip">点宫格飞四化 · 点「详」看单宫断语</div>
  </div>`;
}
