/**
 * report/charts/hepan —— 八字合盘排盘图（结论卡 + 四维雷达 + 双命盘对照 + 关系明细）
 *
 * 铁律：只消费合盘 facts 画图，不产生任何命理判断、不出现任何吉凶结论词。
 * 样式前缀 hp-，作用域在本文件内自带 <style>，绝不污染全局 style.css。
 *
 * 版式遵循主流命理产品「结论优先 + 渐进分层」：
 *   hero 契合指数卡（大分数 + 等级 + 一句话 + 四维雷达图）
 *   → 双方命盘对照（双卡）
 *   → 柱位互动（相合 / 需要注意 两栏）
 */

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 五行配色（与既有排盘图保持一致，避免四体系观感分裂） */
const WX_COLOR = { 木: '#4b8a5a', 火: '#c1553f', 土: '#a8813f', 金: '#6f7c8c', 水: '#3f6f96' };
const wxColor = (e) => WX_COLOR[e] || '#888';

const CSS = `
.hp-wrap{--hp-line:#e6e0d6;--hp-gold:#b0812b;--hp-ink:#2c2620;--hp-sub:#7a7166;--hp-bg:#fbf8f3;--hp-bad:#b3604f;--hp-good:#2f6f9f;
  background:var(--hp-bg);color:var(--hp-ink);font:14px/1.7 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:16px;border-radius:14px}
/* —— hero 结论卡 —— */
.hp-hero{display:grid;grid-template-columns:minmax(200px,300px) 1fr;gap:20px;align-items:center;
  background:linear-gradient(135deg,#fffdf8,#f6efe2);border:1px solid var(--hp-line);border-radius:14px;padding:20px 22px}
.hp-hero-left{display:flex;flex-direction:column;align-items:flex-start}
.hp-hero-top{display:flex;align-items:baseline;gap:10px}
.hp-score{font-size:60px;font-weight:800;line-height:1;color:var(--hp-gold);letter-spacing:-1px}
.hp-score-l{font-size:13px;color:var(--hp-sub);letter-spacing:3px}
.hp-grade{display:inline-block;font-size:15px;font-weight:700;margin-top:12px;padding:3px 16px;border-radius:999px;background:var(--hp-gold);color:#fff;letter-spacing:1px}
.hp-hero-note{margin-top:10px;font-size:13px;line-height:1.75;color:#4a423a}
.hp-radar-box{display:flex;flex-direction:column;align-items:center}
.hp-radar{width:100%;max-width:340px;height:auto}
.hp-radar-cap{font-size:11px;color:var(--hp-sub);margin-top:2px;letter-spacing:1px}
/* —— 双方命盘对照 —— */
.hp-parties{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
.hp-side{background:#fff;border:1px solid var(--hp-line);border-radius:12px;padding:14px}
.hp-side.a{border-top:3px solid var(--hp-gold)}
.hp-side.b{border-top:3px solid #8a7ba8}
.hp-side-h{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}
.hp-side-h b{font-size:15px}
.hp-side-h span{font-size:12px;color:var(--hp-sub)}
.hp-pills{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.hp-pill{background:#faf6ef;border:1px solid var(--hp-line);border-radius:8px;padding:8px 4px;text-align:center}
.hp-pill .pn{display:block;font-size:11px;color:var(--hp-sub)}
.hp-pill .gz{display:block;font-size:19px;font-weight:700;letter-spacing:1px;line-height:1.4}
.hp-pill .ss{display:block;font-size:11px;color:var(--hp-gold);min-height:16px}
.hp-master{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;font-size:12px;color:var(--hp-sub)}
.hp-master i{font-style:normal;background:#f3ede3;border-radius:999px;padding:1px 8px}
.hp-master i b{font-weight:600;color:var(--hp-gold)}
.hp-bars{margin-top:8px}
.hp-bars div{display:flex;align-items:center;gap:6px;font-size:11px;line-height:1.9}
.hp-bars .k{width:14px}
.hp-bars .tr{flex:1;height:7px;background:#efe9df;border-radius:4px;overflow:hidden}
.hp-bars .fl{height:100%;border-radius:4px}
.hp-bars .v{width:30px;text-align:right;color:var(--hp-sub)}
/* —— 柱位互动 —— */
.hp-rel{margin-top:14px;background:#fff;border:1px solid var(--hp-line);border-radius:12px;padding:12px 14px}
.hp-rel-h{font-size:13px;font-weight:700;margin-bottom:8px}
.hp-rel-h small{font-weight:400;color:var(--hp-sub);font-size:11px}
.hp-rel-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.hp-rel-col .t{font-size:12px;font-weight:600;margin-bottom:6px}
.hp-rel-col.good .t{color:var(--hp-good)}
.hp-rel-col.bad .t{color:var(--hp-bad)}
.hp-rel-col ul{margin:0;padding-left:16px}
.hp-rel-col li{font-size:12px;line-height:1.85;color:#3a332c}
.hp-rel-col li .hp-where{margin-left:6px;font-size:11px;color:var(--hp-sub)}
.hp-rel-empty{font-size:12px;color:var(--hp-sub)}
.hp-foot{margin-top:12px;font-size:11px;color:var(--hp-sub);text-align:center}
@media (max-width:720px){
  .hp-wrap{padding:12px}
  .hp-hero{grid-template-columns:1fr;gap:14px}
  .hp-parties{grid-template-columns:1fr;gap:10px}
  .hp-rel-cols{grid-template-columns:1fr;gap:8px}
  .hp-pills{grid-template-columns:repeat(2,1fr)}
  .hp-score{font-size:52px}
}
`;

/** 一方命盘区 */
function renderParty(p) {
  const pills = (p.pills || []).map(
    (x) => `<div class="hp-pill">
      <span class="pn">${esc(x.label)}</span>
      <span class="gz">${esc(x.name)}</span>
      <span class="ss">${esc(x.shishen || '')}</span>
    </div>`
  ).join('');

  const bars = Object.entries(p.elementPercent || {})
    .map(([k, v]) => `<div><span class="k" style="color:${wxColor(k)}">${esc(k)}</span>
      <span class="tr"><span class="fl" style="width:${Math.max(0, Math.min(100, Number(v) || 0))}%;background:${wxColor(k)}"></span></span>
      <span class="v">${Number(v) || 0}%</span></div>`)
    .join('');

  const master = [
    `日主 <b>${esc(p.dayMasterElement)}</b>`,
    `${esc(p.strengthLevel || '—')}`,
    `生肖 ${esc(p.zodiac || '—')}`,
    `格局 ${esc(p.patternName || '—')}`,
    `纳音 ${esc((p.pills || [])[2]?.nayin || '—')}`,
  ].map((s) => `<i>${s}</i>`).join('');

  return `<div class="hp-side ${p.side}">
    <div class="hp-side-h"><b>${esc(p.name)}</b><span>${esc(p.dayGanzhi)}日柱 · ${esc(p.calendarLabel || '')}</span></div>
    <div class="hp-pills">${pills}</div>
    <div class="hp-master">${master}</div>
    <div class="hp-bars">${bars}</div>
  </div>`;
}

/** 四维契合度雷达图（SVG，无第三方依赖） */
function renderRadar(dims) {
  const n = dims.length || 4;
  if (n < 3) return ''; // 少于 3 轴不成图，退回空
  const cx = 160, cy = 104, R = 58;
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const val = (d) => Math.max(0.06, Math.min(1, (Number(d.score) || 0) / (Number(d.weight) || 1)));
  const rings = [0.25, 0.5, 0.75, 1]
    .map((f) => `<polygon points="${dims.map((_, i) => pt(i, R * f).join(',')).join(' ')}" fill="none" stroke="#ece5da" stroke-width="1"/>`)
    .join('');
  const axes = dims
    .map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#ece5da"/>`; })
    .join('');
  const dataPts = dims.map((d, i) => pt(i, R * val(d)).join(',')).join(' ');
  const dots = dims
    .map((d, i) => { const [x, y] = pt(i, R * val(d)); return `<circle cx="${x}" cy="${y}" r="2.6" fill="#b0812b"/>`; })
    .join('');
  const labels = dims
    .map((d, i) => {
      const [lx, ly] = pt(i, R + 17);
      const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
      return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="#7a7166">${esc(d.label)}</text>`;
    })
    .join('');
  return `<svg class="hp-radar" viewBox="0 0 320 200" role="img" aria-label="四维契合度雷达图">${rings}${axes}<polygon points="${dataPts}" fill="rgba(176,129,43,0.16)" stroke="#b0812b" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

/** hero 结论卡：大分数 + 等级 + 一句话 + 雷达 */
function renderHero(f) {
  const dims = f.dims || [];
  return `<div class="hp-hero">
    <div class="hp-hero-left">
      <div class="hp-hero-top"><div class="hp-score">${Number(f.score) || 0}</div><div class="hp-score-l">契合指数</div></div>
      <div class="hp-grade">${esc(f.grade || '—')}</div>
      <div class="hp-hero-note">${esc(f.gradeDesc || '')}</div>
    </div>
    <div class="hp-radar-box">${renderRadar(dims)}<div class="hp-radar-cap">四维契合度 · 越向外越契合</div></div>
  </div>`;
}

/** 关系连线区：合项与冲克项分两栏 */
function renderRels(f) {
  const he = f.he || [];
  const bad = f.conflicts || [];
  const list = (arr, empty) =>
    arr.length
      ? `<ul>${arr.map((r) => `<li>${esc(r.name)}<span class="hp-where">${esc(r.keyText || (r.from && r.to ? `${r.from.sideLabel}${r.from.pos} ↔ ${r.to.sideLabel}${r.to.pos}` : '跨柱'))}</span>${r.note ? `　${esc(r.note)}` : ''}</li>`).join('')}</ul>`
      : `<div class="hp-rel-empty">${empty}</div>`;
  return `<div class="hp-rel">
    <div class="hp-rel-h">柱位互动　<small>合 ${he.length} 项 · 冲刑害破 ${bad.length} 项（按传统合参口径列出，不含吉凶判断）</small></div>
    <div class="hp-rel-cols">
      <div class="hp-rel-col good"><div class="t">相合相引</div>${list(he, '未见相合之处')}</div>
      <div class="hp-rel-col bad"><div class="t">需要注意</div>${list(bad, '未见冲刑害破')}</div>
    </div>
  </div>`;
}

/**
 * 合盘排盘图
 * @param {object} facts  engines/hepan 产出
 */
export function renderHePanChart(facts) {
  const f = facts || {};
  const parties = f.parties || [];
  const a = parties[0] || null;
  const b = parties[1] || null;
  if (!a || !b) return '';
  return `<style>${CSS}</style>
<div class="hp-wrap">
  ${renderHero(f)}
  <div class="hp-parties">
    ${renderParty(a)}
    ${renderParty(b)}
  </div>
  ${renderRels(f)}
  <div class="hp-foot">合参以日柱（夫妻宫）为要，指数为传统合参规则下的量化参考，不构成任何关系结论。</div>
</div>`;
}
