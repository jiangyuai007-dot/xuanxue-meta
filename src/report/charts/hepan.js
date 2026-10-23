/**
 * report/charts/hepan —— 八字合盘排盘图（结论卡 + 四维进度条 + 雷达图 + 双盘紧凑对照 + 互动标签）
 *
 * 用户视角重构：
 *   1. 首屏结论卡（.hp-hero）新增「四维得分明细进度条（日柱夫妻宫 / 天干地支合参 / 五行用神互补 / 生肖年支）」，
 *      一眼看清合盘总分 68 分到底高在哪、低在哪；
 *   2. 双方八字四柱在手机端保持 4 列一行（`repeat(4, minmax(0,1fr))`），不再断成两行四块，高度减半；
 *   3. 柱位互动（相合相引 vs 需要注意）改为高对比度胶囊卡片，摆脱枯燥文字列表。
 */

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const WX_COLOR = { 木: '#4b8a5a', 火: '#c1553f', 土: '#a8813f', 金: '#6f7c8c', 水: '#3f6f96' };
const wxColor = (e) => WX_COLOR[e] || '#888';

const CSS = `
.hp-wrap{--hp-line:#e2d8c5;--hp-gold:#b0812b;--hp-ink:#2c2620;--hp-sub:#7a7166;--hp-bg:#fbf8f2;--hp-bad:#b34738;--hp-good:#257349;
  background:var(--hp-bg);color:var(--hp-ink);font:13.5px/1.65 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:12px;border-radius:12px}
.hp-wrap *{box-sizing:border-box}
/* —— hero 结论卡 —— */
.hp-hero{display:grid;grid-template-columns:1.15fr 0.85fr;gap:16px;align-items:center;
  background:linear-gradient(135deg,#fffdf8,#f5ebd8);border:1px solid var(--hp-line);border-radius:12px;padding:16px 18px}
.hp-hero-left{display:flex;flex-direction:column;gap:8px;min-width:0}
.hp-hero-top{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.hp-score{font-size:52px;font-weight:800;line-height:1;color:var(--hp-gold);font-family:"Noto Serif SC",serif}
.hp-score-l{font-size:12px;color:var(--hp-sub);letter-spacing:2px}
.hp-grade{display:inline-block;font-size:13px;font-weight:700;padding:2px 12px;border-radius:999px;background:var(--hp-gold);color:#fff}
.hp-hero-note{font-size:12.5px;line-height:1.6;color:#4a423a}
.hp-dims{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-top:4px;padding-top:8px;border-top:1px dashed #dfd3bc}
.hp-dim-item{font-size:11.5px}
.hp-dim-hd{display:flex;justify-content:space-between;color:#5c4f3d;margin-bottom:2px}
.hp-dim-hd b{color:var(--hp-gold)}
.hp-dim-bar{height:6px;background:#eadfce;border-radius:4px;overflow:hidden}
.hp-dim-bar i{display:block;height:100%;background:linear-gradient(90deg,#c9a449,#9e711b);border-radius:4px}
.hp-radar-box{display:flex;flex-direction:column;align-items:center}
.hp-radar{width:100%;max-width:260px;height:auto}
.hp-radar-cap{font-size:10.5px;color:var(--hp-sub);margin-top:2px}
/* —— 双方命盘对照 —— */
.hp-parties{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.hp-side{background:#fffdf9;border:1px solid var(--hp-line);border-radius:10px;padding:10px 12px;min-width:0}
.hp-side.a{border-top:3px solid var(--hp-gold)}
.hp-side.b{border-top:3px solid #8a6d9b}
.hp-side-h{display:flex;align-items:baseline;justify-content:space-between;gap:6px;margin-bottom:8px;flex-wrap:wrap}
.hp-side-h b{font-size:14.5px;font-family:"Noto Serif SC",serif}
.hp-side-h span{font-size:11.5px;color:var(--hp-sub)}
.hp-pills{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
.hp-pill{background:#faf5ea;border:1px solid var(--hp-line);border-radius:7px;padding:6px 2px;text-align:center;min-width:0}
.hp-pill .pn{display:block;font-size:10px;color:var(--hp-sub)}
.hp-pill .gz{display:block;font-size:18px;font-weight:800;font-family:"Noto Serif SC",serif;line-height:1.3}
.hp-pill .ss{display:block;font-size:10px;color:var(--hp-gold);min-height:14px}
.hp-master{margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;font-size:11px;color:var(--hp-sub)}
.hp-master i{font-style:normal;background:#f3ede3;border-radius:999px;padding:1px 7px}
.hp-master i b{font-weight:600;color:var(--hp-gold)}
.hp-bars{margin-top:6px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
.hp-wx-chip{background:#faf6ef;border:1px solid #ebe2d3;border-radius:5px;padding:2px 3px;text-align:center;font-size:10.5px}
/* —— 柱位互动 —— */
.hp-rel{margin-top:10px;background:#fffdf9;border:1px solid var(--hp-line);border-radius:10px;padding:10px 12px}
.hp-rel-h{font-size:13px;font-weight:700;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap}
.hp-rel-h small{font-weight:400;color:var(--hp-sub);font-size:11px}
.hp-rel-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hp-rel-col .t{font-size:12px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:4px}
.hp-rel-col.good .t{color:var(--hp-good)}
.hp-rel-col.bad .t{color:var(--hp-bad)}
.hp-rel-chips{display:flex;flex-direction:column;gap:5px}
.hp-rel-card{font-size:12px;line-height:1.5;padding:6px 8px;border-radius:7px;border:1px solid #e8dfd0;background:#faf6ee}
.hp-rel-col.good .hp-rel-card{background:#f3faf6;border-color:#c8e3d2}
.hp-rel-col.bad .hp-rel-card{background:#fdf5f3;border-color:#edd0c9}
.hp-rel-card b{color:#2c2620}
.hp-rel-card .hp-where{margin-left:5px;font-size:10.5px;color:#7a6e5d;background:rgba(255,255,255,.7);padding:0 5px;border-radius:4px}
.hp-rel-empty{font-size:12px;color:var(--hp-sub);padding:4px 0}
.hp-foot{margin-top:8px;font-size:10.5px;color:var(--hp-sub);text-align:center}
@media (max-width:720px){
  .hp-wrap{padding:8px}
  .hp-hero{grid-template-columns:1fr;gap:10px;padding:12px}
  .hp-dims{grid-template-columns:1fr}
  .hp-parties{grid-template-columns:1fr;gap:8px}
  .hp-rel-cols{grid-template-columns:1fr;gap:8px}
  .hp-score{font-size:44px}
  .hp-pill .gz{font-size:16px}
}
`;

function renderParty(p) {
  const pills = (p.pills || []).map(
    (x) => `<div class="hp-pill">
      <span class="pn">${esc(x.label)}</span>
      <span class="gz">${esc(x.name)}</span>
      <span class="ss">${esc(x.shishen || '日主')}</span>
    </div>`
  ).join('');

  const bars = Object.entries(p.elementPercent || {})
    .map(([k, v]) => `<div class="hp-wx-chip"><b style="color:${wxColor(k)}">${esc(k)}</b> ${Number(v) || 0}%</div>`)
    .join('');

  const master = [
    `日主 <b>${esc(p.dayMasterElement)}</b>`,
    `${esc(p.strengthLevel || '—')}`,
    `生肖 ${esc(p.zodiac || '—')}`,
    `${esc(p.patternName || '—')}`,
  ].map((s) => `<i>${s}</i>`).join('');

  return `<div class="hp-side ${p.side}">
    <div class="hp-side-h"><b>${esc(p.name)}</b><span>${esc(p.dayGanzhi)}日柱 · ${esc(p.calendarLabel || '')}</span></div>
    <div class="hp-pills">${pills}</div>
    <div class="hp-master">${master}</div>
    <div class="hp-bars">${bars}</div>
  </div>`;
}

function renderRadar(dims) {
  const n = dims.length || 4;
  if (n < 3) return '';
  const cx = 150, cy = 92, R = 52;
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const val = (d) => Math.max(0.08, Math.min(1, (Number(d.score) || 0) / (Number(d.weight) || 100)));
  const rings = [0.33, 0.66, 1]
    .map((f) => `<polygon points="${dims.map((_, i) => pt(i, R * f).join(',')).join(' ')}" fill="none" stroke="#e2d8c5" stroke-width="1"/>`)
    .join('');
  const axes = dims
    .map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e2d8c5"/>`; })
    .join('');
  const dataPts = dims.map((d, i) => pt(i, R * val(d)).join(',')).join(' ');
  const dots = dims
    .map((d, i) => { const [x, y] = pt(i, R * val(d)); return `<circle cx="${x}" cy="${y}" r="2.8" fill="#b0812b"/>`; })
    .join('');
  const labels = dims
    .map((d, i) => {
      const [lx, ly] = pt(i, R + 15);
      const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
      return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10.5" fill="#6b5640">${esc(d.label)}</text>`;
    })
    .join('');
  return `<svg class="hp-radar" viewBox="0 0 300 184" role="img" aria-label="四维契合度雷达图">${rings}${axes}<polygon points="${dataPts}" fill="rgba(176,129,43,0.18)" stroke="#b0812b" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

function renderHero(f) {
  const dims = f.dims || [];
  const dimBars = dims.map((d) => {
    const pct = Math.max(8, Math.min(100, Math.round(Number(d.score) || 0)));
    return `<div class="hp-dim-item">
      <div class="hp-dim-hd"><span>${esc(d.label)}</span><b>${pct}分</b></div>
      <div class="hp-dim-bar"><i style="width:${pct}%"></i></div>
    </div>`;
  }).join('');

  return `<div class="hp-hero">
    <div class="hp-hero-left">
      <div class="hp-hero-top">
        <div class="hp-score">${Number(f.score) || 0}</div>
        <div>
          <span class="hp-grade">${esc(f.grade || '—')}</span>
          <div class="hp-score-l" style="margin-top:3px">综合契合指数</div>
        </div>
      </div>
      <div class="hp-hero-note">${esc(f.gradeDesc || '')}</div>
      ${dimBars ? `<div class="hp-dims">${dimBars}</div>` : ''}
    </div>
    <div class="hp-radar-box">${renderRadar(dims)}<div class="hp-radar-cap">四维契合度雷达</div></div>
  </div>`;
}

function renderRels(f) {
  const he = f.he || [];
  const bad = f.conflicts || [];
  const listCards = (arr, empty) =>
    arr.length
      ? `<div class="hp-rel-chips">${arr.map((r) => `<div class="hp-rel-card"><b>${esc(r.name)}</b><span class="hp-where">${esc(r.keyText || (r.from && r.to ? `${r.from.sideLabel}${r.from.pos}↔${r.to.sideLabel}${r.to.pos}` : '跨柱'))}</span>${r.note ? `<div style="font-size:11px;color:#6b5f50;margin-top:2px">${esc(r.note)}</div>` : ''}</div>`).join('')}</div>`
      : `<div class="hp-rel-empty">${empty}</div>`;
  return `<div class="hp-rel">
    <div class="hp-rel-h"><span>跨盘干支互动速览</span><small>相合 ${he.length} 项 · 需磨合 ${bad.length} 项</small></div>
    <div class="hp-rel-cols">
      <div class="hp-rel-col good"><div class="t">✦ 相合相引（默契加分项）</div>${listCards(he, '未见跨盘直接合化')}</div>
      <div class="hp-rel-col bad"><div class="t">⚡ 需要注意（日常磨合项）</div>${listCards(bad, '双方柱位无明显刑冲')}</div>
    </div>
  </div>`;
}

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
  <div class="hp-foot">合参以日柱（夫妻宫）与喜用互补为核心，指数供传统文化视角参考。</div>
</div>`;
}
