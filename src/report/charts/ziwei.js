/**
 * 紫微斗数十二宫盘（交互版，对标文墨天机）
 *
 * 交互（纯 CSS radio/checkbox + :checked，无脚本依赖）：
 *  1. 点任意宫位 → 该宫高亮，金色虚线「三方四正」+ 彩色「宫干四化飞星箭头（禄/权/科/忌）」同步绘制；
 *  2. 点各宫右上角的大限岁段 → 切换十年大限盘：十二宫名重排为大限十二宫、
 *     大限命宫金圈、下方面板显示大限干四化与十年流年（可点）；
 *  3. 点大限面板里的流年年份 → 流年盘：十二宫名重排为流年十二宫、
 *     流年命宫金圈、面板显示流年干支四化；
 *  4. 「精简/全盘」切换按钮 → 一键显隐博士/长生/将前/岁前 48 颗杂曜，适配手机窄屏；
 *  5. 「本命盘」按钮一键回到本命宫名。
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
.zw2{--ink:#2f2a22;--sub:#8b8172;--gold:#b0812b;--line:#e7ddc9;
  max-width:780px;margin:0 auto;color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px}
.zw2 *{box-sizing:border-box}
.zw2 .r{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.zw2 .hd{text-align:center;padding:12px 10px 10px;background:linear-gradient(180deg,#fffdf8,#faf6ee);border:1px solid var(--line);border-radius:12px 12px 0 0}
.zw2 .hd .t{font-family:"Noto Serif SC",serif;font-size:19px;font-weight:700;letter-spacing:4px;color:#2f2a22}
.zw2 .hd .m{margin-top:5px;font-size:11.5px;color:var(--sub)}
.zw2 .hd .h4{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:8px}
.zw2 .hd .h4 i{font-style:normal;font-size:11px;border-radius:4px;padding:1px 7px;color:#fff}
.zw2 .bwrap{position:relative}
.zw2 .board{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:1fr;gap:4px;padding:8px;background:#fbf7ec;border:1px solid var(--line);border-top:none}
.zw2 .zp{background:#fffdf8;border:1px solid var(--line);border-radius:8px;padding:6px 7px 7px;min-height:176px;display:flex;flex-direction:column;transition:box-shadow .15s,background .15s;position:relative}
.zw2 .zp.ming{background:#f3e8cf;border-color:#c9a961}
.zw2 .zp.shen{box-shadow:0 0 0 2px rgba(176,129,43,.55)}
.zw2 .zh{display:flex;align-items:baseline;justify-content:flex-start;gap:5px;margin-top:2px;cursor:pointer;user-select:none}
.zw2 .zn{font-family:"Noto Serif SC",serif;font-size:13.5px;font-weight:700;letter-spacing:1px;color:#6b5640;white-space:nowrap}
.zw2 .dxns{display:none}
.zw2 .dxns i{display:none;font-style:normal;font-family:"Noto Serif SC",serif;font-size:13.5px;font-weight:700;letter-spacing:1px;color:#6b5640;white-space:nowrap}
.zw2 .lns{display:contents}
.zw2 .lns i{display:none;font-style:normal;font-family:"Noto Serif SC",serif;font-size:13.5px;font-weight:700;letter-spacing:1px;color:#9a7720;white-space:nowrap}
.zw2 .zp.ming .zn,.zw2 .zp.ming .dxns i{color:#9a7720}
.zw2 .zp.ming .lns i{color:#9a7720}
.zw2 .zg{font-size:13.5px;color:#8b8172;white-space:nowrap;letter-spacing:1px}
.zw2 .zg b{font-family:"Noto Serif SC",serif;font-weight:700}
.zw2 .zw-dtl-btn{margin-left:auto;font-style:normal;font-size:10px;color:#8b8172;background:#f5efe2;border:1px solid #dfd5c0;border-radius:4px;padding:0 4px;line-height:1.5;cursor:pointer;flex:0 0 auto}
.zw2 .zw-dtl-btn:hover{border-color:#b0812b;color:#9a7720;background:#fdf6e3}
.zw2 .zp.ming .zg{color:#9a7720}
.zw2 .zd{display:block;font-size:15px;font-weight:800;color:#b3392c;cursor:pointer;user-select:none;padding:1px 3px;letter-spacing:.5px;line-height:1.4;border-radius:4px}
.zw2 .zd:hover{background:#fdeeea}
.zw2 .zd.cur{text-decoration:underline;text-underline-offset:3px}
.zw2 .zp.ming .zd{color:#b3392c}
.zw2 .zp.ming .zd:hover{background:#fdeeea}
.zw2 .zly{margin-top:2px;font-size:10px;color:#b3a88f;letter-spacing:.3px;white-space:nowrap;overflow:hidden}
.zw2 .zcell{display:flex;flex-direction:column;flex:1;cursor:pointer;user-select:none;border-radius:8px;min-height:0}
.zw2 .zcell:hover{background:rgba(176,129,43,.07)}
.zw2 .zb{flex:1;margin-top:3px;display:flex;flex-direction:column;gap:2px}
.zw2 .ms{font-size:14.5px;font-weight:600;letter-spacing:.5px;display:flex;align-items:center;gap:2px}
.zw2 .bd{font-style:normal;font-size:9.5px;color:#b3a88f;font-weight:400;margin-left:1px}
.zw2 .bd.bad{color:#c05a4e;font-weight:700}
.zw2 .ms em{font-style:normal;font-size:9.5px;line-height:14px;width:14px;height:14px;border-radius:3px;color:#fff;text-align:center;flex:0 0 auto}
.zw2 .fsgrid{margin-top:3px;display:grid;grid-template-columns:1fr 1fr;gap:1px 4px}
.zw2 .fs{font-size:11.5px;color:#968b78;display:flex;align-items:center;gap:2px}
.zw2 .zp.ming .fs{color:#968b78}
.zw2 .fs em{font-style:normal;font-size:9px;line-height:12px;width:12px;height:12px;border-radius:2px;color:#fff;text-align:center}
.zw2 .zzgrid{margin-top:2px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 4px}
.zw2 .zz{font-size:9.5px;color:#b8ad97;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zw2 .zp.ming .zz{color:#b3a276}
#zw-simp:checked ~ .bwrap .zzgrid{display:none}
#zw-simp:checked ~ .modebar .mbtn-sub{background:#2f7d52;color:#fff;border-color:#2f7d52}
.zw2 .kongcell{margin-top:4px;font-size:10.5px;color:#c0b7a4;font-style:italic}
.zw2 .js{font-size:12px;font-weight:600;letter-spacing:.5px;color:#b9ae98;font-style:italic}
.zw2 .mid{grid-column:2 / span 2;grid-row:2 / span 2;background:linear-gradient(180deg,#fffdf8,#faf6ee);
  border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;justify-content:center;gap:5px;
  position:relative;z-index:4}
.zw2 .mid .mttl{text-align:center;font-family:"Noto Serif SC",serif;font-size:13px;font-weight:700;letter-spacing:3px;color:#2f2a22}
.zw2 .mid .mrow{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;color:#6b5640;border-bottom:1px dotted #e3d9c4;padding:2.5px 0}
.zw2 .mid .mrow b{color:#2f2a22;font-weight:600}
.zw2 .mid .sz4 i{font-style:normal;margin-left:4px;letter-spacing:.5px}
.zw2 .mid .mhc4{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end}
.zw2 .mid .mhc{font-style:normal;font-size:9.5px;line-height:15px;border-radius:3px;padding:0 4px;color:#fff;white-space:nowrap}
.zw2 .mid .tip{font-size:10px;color:#8b8172;text-align:center;margin-top:2px}
/* 三方四正虚线 + 宫干四化飞星曲线 */
.zw2 .lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5}
.zw2 .lines g{opacity:0;transition:opacity .15s}
.zw2 .lines line{stroke:#d8cba9;stroke-width:1.3;stroke-dasharray:6 5}
.zw2 .lines circle{fill:rgba(251,247,236,.85);stroke:#d8cba9;stroke-width:1.1}
.zw2 .lines path.fly-path{fill:none;stroke-width:1.5;opacity:.85}
.zw2 .lines text.fly-lbl{font-size:8.5px;font-weight:700;paint-order:stroke;stroke:#fffdf8;stroke-width:2.5px}
/* 模式条 / 面板 */
.zw2 .modebar{border:1px solid var(--line);border-top:none;background:#f3e8cf;padding:7px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.zw2 .mbtn{font-size:12.5px;font-weight:700;color:#fff;background:#b0812b;border-radius:4px;padding:3px 12px;cursor:pointer;user-select:none}
.zw2 .mbtn:hover{background:#9a7720}
.zw2 .mbtn-sub{background:#fffdf8;color:#6b5640;border:1px solid #d8cba9;font-weight:600}
.zw2 .mbtn-sub:hover{background:#faf3df;color:#9a7720}
.zw2 .mtip{font-size:11px;color:#a2977f}
.zw2 .dxnav{border:1px solid var(--line);border-top:none;background:#f3e8cf;padding:8px 10px;display:flex;flex-wrap:wrap;gap:5px;justify-content:center}
.zw2 .dxnav label{font-size:12.5px;color:#6b5640;border:1px solid #e7ddc9;border-radius:4px;padding:3px 10px;cursor:pointer;background:#fffdf8;user-select:none;font-weight:600}
.zw2 .dxnav label:hover{border-color:#b0812b;color:#9a7720}
.zw2 .dxnav label[data-cur]{border-color:#b3392c;color:#b3392c}
.zw2 .panels{border:1px solid var(--line);border-top:none;border-radius:0 0 12px 12px;background:#fffdf8;padding:0}
.zw2 .modebar+.panels{border-radius:0 0 12px 12px}
.zw2 .panels+.panels{border-top:1px dashed var(--line);border-radius:0}
.zw2 .panels>div{display:none;padding:12px 16px;font-size:13px;color:#6b5640;line-height:1.9}
.zw2 .panels b{color:#2f2a22}
.zw2 .panels .hc{font-style:normal;font-size:11.5px;border-radius:3px;padding:1px 5px;color:#fff;margin:0 1px}
.zw2 .fly-row{margin-top:4px;font-size:12px;color:#6b5640;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.zw2 .fly-chip{display:inline-flex;align-items:center;gap:3px;background:#faf6ee;border:1px solid #e7ddc9;border-radius:4px;padding:1px 6px;font-size:11.5px}
.zw2 .fly-chip i{font-style:normal;font-size:10px;border-radius:3px;padding:0 4px;color:#fff;font-weight:700}
.zw2 .lnl{font-size:12px;color:#9a7720;cursor:pointer;user-select:none;border:1px solid #e7ddc9;border-radius:3px;padding:1px 6px;margin:1px 2px;display:inline-block;background:#fffdf8}
.zw2 .lnl:hover{background:#f3e8cf;border-color:#b0812b}
.zw2 .bn{font-style:normal}
.zw2 .bdx{display:none;font-style:normal}
.zw2 .bdx i{display:none;font-style:normal}
.zw2 .ft{padding:9px 12px 0;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;font-size:11.5px;color:#a2977f}
.zw2 .ft em{font-style:normal;display:inline-flex;align-items:center;gap:4px}
.zw2 .ft em i{width:12px;height:12px;border-radius:3px;display:inline-block}
.zw2 .note{padding:6px 12px 0;font-size:10.5px;color:#8b8172;text-align:center}
@media (max-width:520px){
  .zw2 .board{gap:3px;padding:6px}
  .zw2 .zp{min-height:150px;padding:4px 4px 5px}
  .zw2 .ms{font-size:13px}.zw2 .zn{font-size:12px}.zw2 .zg{font-size:9.5px}
  .zw2 .zd{font-size:14px}
  .zw2 .fsgrid{grid-template-columns:1fr}
  .zw2 .panels>div{padding:10px 11px;font-size:12.5px}
  .zw2 .dxnav{gap:4px;padding:7px 6px}
  .zw2 .dxnav label{font-size:11.5px;padding:3px 7px}
  .zw2 .modebar{padding:6px 8px;gap:6px}
  .zw2 .mbtn{font-size:11.5px;padding:3px 9px}
}
@media (max-width:400px){
  .zw2 .board{gap:2px;padding:4px}
  .zw2 .zp{min-height:132px;padding:3px 2px 4px}
  .zw2 .ms{font-size:11.5px}.zw2 .zn{font-size:10.5px}.zw2 .zg{font-size:8.5px}
  .zw2 .zd{font-size:12.5px}
  .zw2 .dxnav label{font-size:10.5px;padding:2px 5px}
  .zw2 .ft{font-size:10.5px;gap:6px}
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
    const mainRow = mains.map((s) =>
      `<span class="ms" style="color:${elColor(s.wuxing)}">${esc(s.name)}${s.brightness ? `<i class="bd${'陷不'.includes(s.brightness) ? ' bad' : ''}" title="${esc(s.name)}：${esc(s.brightness)}（庙旺得利平不陷七级）">${esc(s.brightness)}</i>` : ''}${huaChip(s.hua)}</span>`).join('');
    const opp = byZhi[ZHI_SEQ[(ci + 6) % 12]];
    const borrow = mains.length === 0
      ? `<span class="js">${list(opp && opp.stars).filter((s) => s.kind === '主星').map((s) => `借${esc(s.name)}`).join('') || '<span class="kongcell">—</span>'}</span>`
      : '';
    const fuRow = fus.map((s) =>
      `<span class="fs">${esc(s.name)}${huaChip(s.hua)}</span>`).join('');
    const zaRow = zas.map((s) => `<span class="zz">${esc(s.name)}</span>`).join('');
    const lnAges = lnAgeByZhi[zhi] || [];
    const zly = `<span class="zly" title="流年命宫落本宫的虚岁：${lnAges.join(',')}">流年 ${lnAges.slice(0, 6).join(',')}</span>`;
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
      `【主星】${mains.length ? mains.map((s) => s.name + (s.brightness ? `(${s.brightness})` : '') + (s.hua ? `[生年化${s.hua.label}]` : '')).join('、') : `空宫（借对宫${opp ? opp.name : ''}：${list(opp && opp.stars).filter((s) => s.kind === '主星').map((s) => s.name).join('、') || '无'}）`}`,
      `【辅星】${fus.length ? fus.map((s) => s.name + (s.hua ? `[生年化${s.hua.label}]` : '')).join('、') : '无'}`,
      `【杂曜】${zas.length ? zas.map((s) => s.name).join('、') : '无'}`,
      dx ? `【大限】${dx.ageStart}–${dx.ageEnd} 岁行本宫（大限干支 ${dx.ganzhi}）` : '',
      flyTxt ? `【宫干飞化（${p.gan}干）】${flyTxt}` : '',
      `【流年虚岁】${lnAges.slice(0, 8).join('、')} 岁`,
    ].filter(Boolean).join('\n');
    return `<div class="${cls}" data-i="${ci}" data-z="${esc(zhi)}" data-zw-title="${esc(dtlTitle)}" data-zw-detail="${esc(dtlBody)}">
      <label class="zcell" for="zwpg-${ci}">
        <div class="zb">${mains.length ? mainRow : borrow}${fus.length ? `<span class="fsgrid">${fuRow}</span>` : (mains.length ? '<span class="kongcell">—</span>' : '')}${zas.length ? `<span class="zzgrid">${zaRow}</span>` : ''}</div>
        ${zly}
      </label>
      ${zd}
      <label class="zh" for="zwpg-${ci}"><span class="zn">${esc(p.name)}${p.isShen ? '<b style="color:#b3392c">身</b>' : ''}</span><span class="dxns">${dxNames}</span><span class="lns">${lnNames}</span><span class="zg">${gzColored(p.ganzhi)}</span><u class="zw-dtl-btn qm-el" data-t="${esc(dtlTitle)}" data-x="${esc(dtlBody)}" title="查看本宫完整星曜与宫干飞化详情">详</u></label>
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

  /* ---------- 隐藏 radio/checkbox：精简开关 + 宫位 + 大限 + 流年 ---------- */
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
    // Phase 2 新增：宫干四化飞星箭头（禄/权/科/忌）
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
    return `${self}{background:#fdf6e3;box-shadow:0 0 0 2px #b0812b;border-color:#b0812b}
${partners}{background:#faf3df;border-color:#cdb271}
#zwpg-${i}:checked ~ .bwrap .lines g[data-sel="${i}"]{opacity:1}`;
  }).join('\n');

  const dxCss = dxList.map((d, k) => {
    const z0 = zhiIndexOf(d.zhi);
    return `#zwdx-${k}:checked ~ .bwrap .zn{display:none}
#zwdx-${k}:checked ~ .bwrap .dxns{display:inline}
#zwdx-${k}:checked ~ .bwrap .dxns i{display:none}
#zwdx-${k}:checked ~ .bwrap .dxns i[data-dx="${k}"]{display:inline}
#zwdx-${k}:checked ~ .bwrap .zp[data-i="${z0}"]{box-shadow:0 0 0 2px rgba(176,129,43,.6)}
#zwdx-${k}:checked ~ .bwrap .zd[data-dxz="${k}"]{background:#b3392c;color:#fff;border-radius:4px}
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
${pre} ~ .bwrap .zp[data-i="${s.zIdx}"]{box-shadow:0 0 0 2px #b3392c}
${pre} ~ .bwrap .zp[data-i="${dz0}"]{box-shadow:0 0 0 2px rgba(176,129,43,.35)}
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
  const benPanel = `<div data-dxp="ben"><b>本命盘</b>　点击任意宫位查看三方四正与宫干四化飞星；点各宫左上角的大限岁段（${esc(dxRange0)} …）切换十年大限盘；点流年年份进入流年盘。</div>`;

  /* ---------- 底部大限速查导航 ---------- */
  const dxNav = `<div class="dxnav"><label data-dxn="ben" for="zwdx-ben">本命</label>` +
    dxList.map((d) => `<label data-dxn="${d.order}" for="zwdx-${d.order}"${d.isCurrent ? ' data-cur="1"' : ''} title="${d.ageStart}-${d.ageEnd} 岁 · ${esc(d.zhi)}宫 · ${esc(d.palace)}">${d.ageStart}-${d.ageEnd}</label>`).join('') + `</div>`;

  /* ---------- 流年面板（120 态） ---------- */
  const lnPanels = lnStates.map((s) => {
    const h = s.sihua;
    return `<div data-lnp="${s.id}"><b>${s.year} ${esc(s.ganzhi)} 流年</b>　流年命宫入 <b>${esc(s.zhi)}宫</b>〔大限 ${esc(s.dxRange)}〕<br>
    流年四化（以${esc(s.ganzhi[0])}干起）：${hc('lu', h.lu)}${hc('quan', h.quan)}${hc('ke', h.ke)}${hc('ji', h.ji)}<br>
    <span style="color:#a2977f">点其它年份切换流年 · 点宫格右上角岁段回大限盘</span></div>`;
  }).join('');

  /* ---------- 顶栏 ---------- */
  const four = f.fourHua || {};
  const headMeta = [
    f.lunar ? `${f.lunar.yearGanzhi}年　${f.lunar.isLeap ? '闰' : ''}${f.lunar.month}月${f.lunar.day}日　生肖${f.lunar.zodiac}` : '',
    `${f.wuXingJu.name}　${f.wuXingJu.number}岁起运`,
    f.xuAge ? `虚岁 ${f.xuAge}` : '',
    f.time && f.time.hourZhi ? `${f.time.hourZhi}时` : '',
    f.time && f.time.cityName ? f.time.cityName : '',
  ].filter(Boolean).join('　·　');

  return `<style class="zw2-style">${CSS}
${selCss}
${dxCss}
${lnCss}
${selPanelsCss}</style><div class="zw2">
    <div class="hd">
      <div class="t">紫微斗数 · 十二宫盘</div>
      <div class="m">${esc(headMeta)}</div>
      <div class="h4">
        <i style="background:${HUA_COLOR.lu}">化禄 ${esc(four.lu ? four.lu.star : '—')}</i>
        <i style="background:${HUA_COLOR.quan}">化权 ${esc(four.quan ? four.quan.star : '—')}</i>
        <i style="background:${HUA_COLOR.ke}">化科 ${esc(four.ke ? four.ke.star : '—')}</i>
        <i style="background:${HUA_COLOR.ji}">化忌 ${esc(four.ji ? four.ji.star : '—')}</i>
      </div>
    </div>
    ${simpCheck}
    ${palaceRadios}
    ${dxRadios}
    ${lnRadios}
    <div class="bwrap">
      <div class="board">${board.join('')}</div>
      <svg class="lines" viewBox="0 0 400 400" preserveAspectRatio="none" width="100%" height="100%">${svgDefs}${lineGroups}</svg>
    </div>
    <div class="modebar">
      <label class="mbtn" for="zwdx-ben">本命盘</label>
      <label class="mbtn mbtn-sub" for="zw-simp" title="切换显示/隐藏四十八杂曜（博士/长生/将前/岁前），小屏推荐精简盘">精简/全盘</label>
      <span class="mtip">点宫位＝三方四正＋宫干四化飞星 · 点岁段或底部条＝大限盘 · 点流年年份＝流年盘</span>
    </div>
    <div class="panels selbar">${selPanels}</div>
    <div class="panels dxbar">${benPanel}${dxPanels}</div>
    <div class="panels lnbar">${lnPanels}</div>
    ${dxNav}
    <div class="ft">
      <em>命宫金框 · 身宫金圈 · 主星按五行着色</em>
      <em><i style="background:${HUA_COLOR.lu}"></i>禄</em>
      <em><i style="background:${HUA_COLOR.quan}"></i>权</em>
      <em><i style="background:${HUA_COLOR.ke}"></i>科</em>
      <em><i style="background:${HUA_COLOR.ji}"></i>忌</em>
      <em style="color:#b0a894">┄ 三方四正＋宫干四化飞星（点宫位变换）</em>
      <em style="color:#b3392c">红色岁段 = 大限入口</em>
    </div>
    ${f.meta && list(f.meta.approximations).length ? `<div class="note">${esc(list(f.meta.approximations)[0])}</div>` : ''}
  </div>`;
}

function middleBlock(f) {
  const row = (k, v) => `<div class="mrow"><span>${esc(k)}</span><b>${v}</b></div>`;
  const ZHI_EL = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
  const GAN_EL = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
  const szCell = (gz) => {
    const s = String(gz || '—');
    if (s.length !== 2) return `<i>${esc(s)}</i>`;
    const g = GAN_EL[s[0]], zz = ZHI_EL[s[1]];
    return `<i><span style="color:${g ? elColor(g) : 'inherit'}">${esc(s[0])}</span><span style="color:${zz ? elColor(zz) : 'inherit'}">${esc(s[1])}</span></i>`;
  };
  const cur = list(f.daXian).find((d) => d.isCurrent);
  const four = f.fourHua || {};
  const hc = (t, s) => (s ? `<i class="mhc" style="background:${HUA_COLOR[t]}">${{ lu: '禄', quan: '权', ke: '科', ji: '忌' }[t]}·${esc(s)}</i>` : '');
  const sd = f.solarDate
    ? `${f.solarDate.year}-${String(f.solarDate.month).padStart(2, '0')}-${String(f.solarDate.day).padStart(2, '0')}`
    : '';
  const lunarStr = f.lunar ? `${f.lunar.isLeap ? '闰' : ''}${f.lunar.month}月${f.lunar.day}日` : '';
  const sz = f.siZhu || {};
  return `<div class="mid">
    <div class="mttl">命　主</div>
    ${row('阳历', `${esc(sd)}${f.time && f.time.hourZhi ? '　' + esc(f.time.hourZhi) + '时' : ''}${f.time && f.time.lateZi ? '<span style="color:#b3392c">(晚子)</span>' : ''}`)}
    ${row('阴历', `${esc(f.lunar ? f.lunar.yearGanzhi : '')}年　${esc(lunarStr)}　生肖${esc(f.lunar ? f.lunar.zodiac : '')}`)}
    <div class="mrow"><span>四柱</span><b class="sz4">${szCell(sz.year)}${szCell(sz.month)}${szCell(sz.day)}${szCell(sz.hour)}</b></div>
    ${row('命主 / 身主', `${esc(f.mingZhu || '—')} · ${esc(f.shenZhu || '—')}`)}
    ${row('五行局', `${esc(f.wuXingJu.name)}　${f.wuXingJu.number}岁起运`)}
    <div class="mrow"><span>生年四化</span><b class="mhc4">${hc('lu', four.lu && four.lu.star)}${hc('quan', four.quan && four.quan.star)}${hc('ke', four.ke && four.ke.star)}${hc('ji', four.ji && four.ji.star)}</b></div>
    ${row('当前大限', cur ? `${cur.ageStart}-${cur.ageEnd} 岁 · ${esc(cur.zhi)}宫（${esc(cur.ganzhi)}）` : '—')}
    <div class="tip">点宫位看三方四正＋宫干飞化 · 点左上岁段或底部条切大限</div>
  </div>`;
}
