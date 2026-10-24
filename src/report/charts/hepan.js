/**
 * report/charts/hepan —— 八字合盘商业尊享级工作台（v2.4）
 *
 * 六大专业模块（支持顶部胶囊一键分栏筛选 & 全览模式）：
 *   1. 六维合婚总评 Hero 卡（综合契合指数 + 三大核心批断卡 + 六维进度条 + 六边形 SVG 雷达图）
 *   2. 双方八字完整细盘对照（四柱十神、五行着色干支、藏干副星、纳音、十二长生、空亡、喜用忌神、胎元命宫命卦、核心神煞）
 *   3. 四柱逐柱对轨合参表（年柱根基配 · 月柱门户配 · 日柱夫妻正宫配 · 时柱子女晚景配）
 *   4. 五行能量与喜用神双向互补矩阵 + 八宅命卦婚配卡
 *   5. 跨盘贵人/禄神/红鸾桃花互查 + 跨盘干支合冲张力对照
 *   6. 2025–2030 未来六年双人岁运同步共振日历（婚嫁/置业/合作吉年榜）
 */

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const WX_COLOR = { 木: '#2e6f40', 火: '#b83b2b', 土: '#8c6224', 金: '#9a731c', 水: '#24588a' };
const wxColor = (e) => WX_COLOR[e] || '#3a3228';

const CSS = `
.hp-wrap{--hp-line:#e2d8c5;--hp-gold:#9e731e;--hp-ink:#241e18;--hp-sub:#6e6356;--hp-bg:#fbf8f2;--hp-bad:#b33c2e;--hp-good:#1f6e43;
  background:var(--hp-bg);color:var(--hp-ink);font:13.5px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:12px;border-radius:12px}
.hp-wrap *{box-sizing:border-box}
/* 顶部模块快速切换栏 */
.hp-subnav{display:flex;gap:6px;flex-wrap:wrap;padding:6px;background:#f4ecdc;border:1px solid var(--hp-line);border-radius:10px;margin-bottom:12px}
.hp-snav-btn{flex:1 1 auto;border:1px solid transparent;background:transparent;color:#5c4e3c;font-size:12px;font-weight:600;padding:5px 10px;border-radius:7px;cursor:pointer;white-space:nowrap;transition:all .15s}
.hp-snav-btn:hover{background:rgba(255,255,255,.6)}
.hp-snav-btn.on{background:#9e731e;color:#fff;border-color:#875f12;box-shadow:0 2px 6px rgba(158,115,30,.25)}
.hp-wrap[data-hp-view="overview"] [data-hp-sec]:not([data-hp-sec="overview"]),
.hp-wrap[data-hp-view="pillars"] [data-hp-sec]:not([data-hp-sec="pillars"]),
.hp-wrap[data-hp-view="rels"] [data-hp-sec]:not([data-hp-sec="rels"]),
.hp-wrap[data-hp-view="timeline"] [data-hp-sec]:not([data-hp-sec="timeline"]){display:none !important}
/* —— Module 1: Hero 六维结论卡 —— */
.hp-hero{display:grid;grid-template-columns:1.25fr 0.75fr;gap:16px;align-items:center;
  background:linear-gradient(135deg,#fffdf9 0%,#f6ecda 100%);border:1px solid #d8c8a8;border-top:3px solid var(--hp-gold);border-radius:12px;padding:16px 18px}
.hp-hero-left{display:flex;flex-direction:column;gap:8px;min-width:0}
.hp-hero-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.hp-score-group{display:flex;align-items:baseline;gap:12px}
.hp-score{font-size:54px;font-weight:800;line-height:1;color:var(--hp-gold);font-family:"Noto Serif SC",serif}
.hp-score-l{font-size:11.5px;color:var(--hp-sub);letter-spacing:1.5px}
.hp-grade{display:inline-block;font-size:13px;font-weight:700;padding:3px 12px;border-radius:999px;background:var(--hp-gold);color:#fff}
.hp-pro-tag{font-size:11px;color:#7a5a18;background:#efe2c4;border:1px solid #d5be8c;padding:2px 9px;border-radius:6px;font-weight:600}
.hp-hero-note{font-size:13px;line-height:1.55;color:#3d352c;font-weight:500}
/* 三大核心批断卡 */
.hp-verdicts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:2px}
.hp-vcard{background:rgba(255,255,255,.78);border:1px solid #e2d5bc;border-radius:8px;padding:7px 9px;min-width:0}
.hp-vcard-hd{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:3px}
.hp-vcard-hd b{font-size:11.5px;color:#3a2f21}
.hp-vcard-hd span{font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;background:#efe4cd;color:#825b12;white-space:nowrap}
.hp-vcard-tx{font-size:11px;color:#5c5042;line-height:1.45}
/* 六维进度条 */
.hp-dims{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-top:4px;padding-top:8px;border-top:1px dashed #dfd3bc}
.hp-dim-item{font-size:11.5px}
.hp-dim-hd{display:flex;justify-content:space-between;color:#4f4334;margin-bottom:2px}
.hp-dim-hd b{color:var(--hp-gold)}
.hp-dim-bar{height:6px;background:#eadfce;border-radius:4px;overflow:hidden}
.hp-dim-bar i{display:block;height:100%;background:linear-gradient(90deg,#c9a449,#9e711b);border-radius:4px}
.hp-radar-box{display:flex;flex-direction:column;align-items:center;justify-content:center}
.hp-radar{width:100%;max-width:270px;height:auto}
.hp-radar-cap{font-size:11px;color:var(--hp-sub);margin-top:3px;font-weight:600}
/* —— Module 2: 双方八字完整细盘对照 —— */
.hp-parties{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.hp-side{background:#fffdf9;border:1px solid var(--hp-line);border-radius:10px;padding:11px 12px;min-width:0}
.hp-side.a{border-top:3px solid var(--hp-gold)}
.hp-side.b{border-top:3px solid #7d5b8c}
.hp-side-h{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;flex-wrap:wrap}
.hp-side-h b{font-size:15px;font-family:"Noto Serif SC",serif;color:#241d15}
.hp-side-meta{font-size:11.5px;color:var(--hp-sub)}
.hp-master{margin-bottom:8px;display:flex;flex-wrap:wrap;gap:4px;font-size:11px;color:var(--hp-sub)}
.hp-master i{font-style:normal;background:#f4ede0;border:1px solid #e4d8c3;border-radius:6px;padding:1px 7px;color:#4a3e30}
.hp-master i b{font-weight:700;color:var(--hp-gold)}
/* 四柱细盘网格 */
.hp-pills{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}
.hp-pill{background:#faf5ea;border:1px solid #e2d6c1;border-radius:8px;padding:6px 3px;text-align:center;min-width:0;display:flex;flex-direction:column;gap:2px}
.hp-pill.is-day{background:#f7eedb;border-color:#cbb17c}
.hp-pill .pn{font-size:10px;color:#7a6f60;display:flex;align-items:center;justify-content:center;gap:2px}
.hp-pill .kong-tag{font-size:9px;background:#f2dedb;color:#a8382b;padding:0 3px;border-radius:3px;font-weight:700}
.hp-pill .ss-top{font-size:10.5px;color:#7d6538;font-weight:600;min-height:15px}
.hp-pill .gz-box{display:flex;flex-direction:column;line-height:1.15;padding:2px 0;font-family:"Noto Serif SC",serif;font-size:19px;font-weight:800}
.hp-pill .cg-box{font-size:9.5px;color:#5c5143;background:rgba(255,255,255,.65);border-radius:4px;padding:2px 2px;line-height:1.35;min-height:28px;display:flex;flex-direction:column;justify-content:center}
.hp-pill .ny-box{font-size:9.5px;color:#7a6c59;border-top:1px dashed #e2d6c1;padding-top:2px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* 喜忌与宫位神煞尾栏 */
.hp-side-foot{margin-top:8px;padding-top:7px;border-top:1px dashed #e5dac7;display:flex;flex-direction:column;gap:4px;font-size:11px}
.hp-yongshen-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px}
.hp-ys-good{background:#e7f4ec;color:#1f6e43;border:1px solid #bce0c9;padding:1px 7px;border-radius:5px;font-weight:600}
.hp-ys-bad{background:#faecea;color:#a63a2b;border:1px solid #ebcbc6;padding:1px 7px;border-radius:5px}
.hp-extra-row{color:#6b5f50;display:flex;flex-wrap:wrap;gap:6px;font-size:10.5px}
.hp-ss-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:1px}
.hp-ss-chip{font-size:10px;padding:1px 6px;border-radius:4px;background:#f3ece0;color:#66543a;border:1px solid #e0d3bc}
.hp-ss-chip.ji{background:#fbf3dd;color:#855d10;border-color:#dec484;font-weight:600}
/* —— Module 3: 四柱逐柱对轨合参表 + 五行喜用互补矩阵 —— */
.hp-sec-card{margin-top:10px;background:#fffdf9;border:1px solid var(--hp-line);border-radius:10px;padding:12px 14px}
.hp-sec-h{font-size:13.5px;font-weight:700;color:#241d15;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;font-family:"Noto Serif SC",serif}
.hp-sec-h small{font-family:-apple-system,"PingFang SC",sans-serif;font-weight:400;color:var(--hp-sub);font-size:11px}
.hp-pm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.hp-pm-card{background:#faf6ec;border:1px solid #e4d9c5;border-radius:8px;padding:8px 10px}
.hp-pm-card.is-day{background:#f8efe0;border-color:#cfb47c}
.hp-pm-top{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px}
.hp-pm-top b{font-size:12px;color:#2f261b}
.hp-pm-badge{font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:99px}
.hp-pm-badge.good{background:#e4f3ea;color:#1f6e43;border:1px solid #b8dec6}
.hp-pm-badge.mid{background:#f1eadb;color:#785c24;border:1px solid #d9c8a5}
.hp-pm-badge.warn{background:#fbeae7;color:#ad392b;border:1px solid #ebbdb6}
.hp-pm-vs{display:flex;align-items:center;gap:8px;font-family:"Noto Serif SC",serif;font-size:14px;font-weight:700;color:#3a2e1e;margin:3px 0}
.hp-pm-vs span{font-family:-apple-system,sans-serif;font-size:11px;font-weight:400;color:#7a6d5c}
.hp-pm-detail{font-size:11px;color:#594e40;line-height:1.45}
/* 五行喜用双向互补对比条 */
.hp-wx-rows{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.hp-wx-row{display:grid;grid-template-columns:46px 1fr 78px;align-items:center;gap:8px;font-size:11.5px;background:#faf6ee;padding:5px 8px;border-radius:7px;border:1px solid #ebe1cf}
.hp-wx-lbl{font-weight:700;display:flex;align-items:center;gap:4px}
.hp-wx-bars{display:flex;flex-direction:column;gap:3px}
.hp-wx-track{display:flex;align-items:center;gap:6px;font-size:10.5px;color:#5c5042}
.hp-wx-track i{font-style:normal;width:32px;flex-shrink:0}
.hp-wx-bar-bg{flex:1;height:6px;background:#e8dfd0;border-radius:4px;overflow:hidden}
.hp-wx-bar-fill{height:100%;border-radius:4px}
.hp-wx-tag{font-size:10.5px;text-align:center;padding:2px 5px;border-radius:5px;background:#f0e7d5;color:#6e5525;font-weight:600}
.hp-wx-tag.comp{background:#e4f3ea;color:#1f6e43;border:1px solid #b8dec6}
.hp-minggua-box{margin-top:8px;padding:8px 10px;background:#f6efe0;border:1px solid #dfd0b2;border-radius:8px;font-size:11.5px;color:#4a3e2e;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}
/* —— Module 4: 跨盘贵人桃花 & 干支合冲 —— */
.hp-noble-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px}
.hp-noble-card{background:linear-gradient(135deg,#fffcf5,#f7edd8);border:1px solid #dec99a;border-radius:8px;padding:8px 10px}
.hp-noble-hd{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px}
.hp-noble-hd b{font-size:12px;color:#6e4f10}
.hp-noble-hd span{font-size:10px;font-weight:700;background:#9e731e;color:#fff;padding:1px 7px;border-radius:99px}
.hp-noble-tx{font-size:11px;color:#524637;line-height:1.45}
.hp-rel-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hp-rel-col .t{font-size:12px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:4px}
.hp-rel-col.good .t{color:var(--hp-good)}
.hp-rel-col.bad .t{color:var(--hp-bad)}
.hp-rel-chips{display:flex;flex-direction:column;gap:5px}
.hp-rel-card{font-size:12px;line-height:1.5;padding:6px 8px;border-radius:7px;border:1px solid #e8dfd0;background:#faf6ee}
.hp-rel-col.good .hp-rel-card{background:#f3faf6;border-color:#c8e3d2}
.hp-rel-col.bad .hp-rel-card{background:#fdf5f3;border-color:#edd0c9}
.hp-rel-card b{color:#2c2620}
.hp-rel-card .hp-where{margin-left:5px;font-size:10.5px;color:#7a6e5d;background:rgba(255,255,255,.75);padding:0 5px;border-radius:4px}
.hp-rel-empty{font-size:12px;color:var(--hp-sub);padding:4px 0}
/* —— Module 5: 未来六年双人岁运共振日历 —— */
.hp-tl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.hp-tl-card{background:#faf6ec;border:1px solid #e3d7c1;border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:4px}
.hp-tl-card.good{background:#f4faf6;border-color:#c2e0cd}
.hp-tl-card.warn{background:#fdf6f4;border-color:#ebd0c9}
.hp-tl-hd{display:flex;align-items:center;justify-content:space-between;gap:4px}
.hp-tl-yr{font-family:"Noto Serif SC",serif;font-size:13.5px;font-weight:800;color:#2c241b}
.hp-tl-score{font-size:11.5px;font-weight:700;color:var(--hp-gold)}
.hp-tl-tag{font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:4px;background:#efe5d0;color:#6e521b;align-self:flex-start}
.hp-tl-card.good .hp-tl-tag{background:#dff2e6;color:#1f6e43}
.hp-tl-card.warn .hp-tl-tag{background:#fae5e1;color:#a8382b}
.hp-tl-notes{font-size:10.5px;color:#5c5042;line-height:1.4}
.hp-foot{margin-top:10px;font-size:11px;color:var(--hp-sub);text-align:center}
@media (max-width:720px){
  .hp-wrap{padding:8px}
  .hp-subnav{gap:4px;padding:4px}
  .hp-snav-btn{font-size:11px;padding:4px 6px}
  .hp-hero{grid-template-columns:1fr;gap:10px;padding:12px}
  .hp-verdicts{grid-template-columns:1fr;gap:6px}
  .hp-dims{grid-template-columns:1fr}
  .hp-parties{grid-template-columns:1fr;gap:8px}
  .hp-pm-grid{grid-template-columns:1fr}
  .hp-noble-grid{grid-template-columns:1fr}
  .hp-rel-cols{grid-template-columns:1fr;gap:8px}
  .hp-tl-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
  .hp-score{font-size:44px}
  .hp-pill .gz-box{font-size:17px}
}
`;

function renderParty(p) {
  const pills = (p.pills || []).map((x) => {
    const isDay = x.posKey === 'day';
    const cgHtml = (x.canggan || []).length
      ? x.canggan.map((c) => `<span><b style="color:${wxColor(c.wuxing)}">${esc(c.gan)}</b>·${esc(c.shishen || '')}</span>`).join('')
      : '<span>—</span>';
    return `<div class="hp-pill${isDay ? ' is-day' : ''}">
      <span class="pn">${esc(x.label)}柱${x.isKong ? '<em class="kong-tag">空</em>' : ''}</span>
      <span class="ss-top">${esc(x.shishen || '日主')}</span>
      <span class="gz-box">
        <span style="color:${wxColor(x.wuxingGan)}">${esc(x.gan)}</span>
        <span style="color:${wxColor(x.wuxingZhi)}">${esc(x.zhi)}</span>
      </span>
      <span class="cg-box">${cgHtml}</span>
      <span class="ny-box">${esc(x.nayin || '—')}${x.changsheng ? ` · ${esc(x.changsheng)}` : ''}</span>
    </div>`;
  }).join('');

  const genderLabel = p.gender === 'female' ? '坤造' : '乾造';
  const master = [
    `${genderLabel} · 生肖<b>${esc(p.zodiac || '—')}</b>`,
    `日主 <b>${esc(p.dayGan || '')}${esc(p.dayMasterElement)}</b>（${esc(p.strengthLevel || '中和')}）`,
    `格局 <b>${esc(p.patternName || '正格')}</b>`,
    p.curDayun ? `现行 <b>${esc(p.curDayun.name)}</b>运` : '',
  ].filter(Boolean).map((s) => `<i>${s}</i>`).join('');

  const favStr = (p.yongFavorable || []).join('、') || '水、木';
  const unfavStr = (p.yongUnfavorable || []).join('、') || '火、土';

  const extraItems = [
    p.taiyuan ? `胎元：${esc(p.taiyuan)}` : '',
    p.mingGong ? `命宫：${esc(p.mingGong)}` : '',
    p.mingGua ? `命卦：${esc(p.mingGua.name)}卦（${esc(p.mingGua.group)}）` : '',
    (p.xunkong || []).length ? `旬空：${esc(p.xunkong.join('、'))}` : '',
  ].filter(Boolean).map((t) => `<span>${t}</span>`).join(' ｜ ');

  const ssHtml = (p.keyShensha || []).slice(0, 6).map((s) => {
    const isJi = s.cat === '吉' || /贵人|红鸾|天喜|金舆|禄/.test(s.name);
    return `<span class="hp-ss-chip${isJi ? ' ji' : ''}" title="${esc(s.desc)}">${esc(s.name)}(${esc(s.position)})</span>`;
  }).join('');

  return `<div class="hp-side ${p.side}">
    <div class="hp-side-h">
      <b>${esc(p.name)} · 四柱细盘</b>
      <span class="hp-side-meta">${esc(p.dayGanzhi)}日柱 · ${esc(p.calendarLabel || '')}</span>
    </div>
    <div class="hp-master">${master}</div>
    <div class="hp-pills">${pills}</div>
    <div class="hp-side-foot">
      <div class="hp-yongshen-row">
        <span class="hp-ys-good">✦ 喜用神：${esc(favStr)}</span>
        <span class="hp-ys-bad">忌神：${esc(unfavStr)}</span>
      </div>
      ${extraItems ? `<div class="hp-extra-row">${extraItems}</div>` : ''}
      ${ssHtml ? `<div class="hp-ss-row">${ssHtml}</div>` : ''}
    </div>
  </div>`;
}

function renderRadar(dims) {
  const n = dims.length || 6;
  if (n < 3) return '';
  const cx = 155, cy = 98, R = 56;
  const ang = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const val = (d) => Math.max(0.22, Math.min(1, 0.5 + ((Number(d.score) || 0) / (Number(d.weight) || 20)) * 0.5));
  const rings = [0.35, 0.68, 1]
    .map((f) => `<polygon points="${dims.map((_, i) => pt(i, R * f).join(',')).join(' ')}" fill="none" stroke="#dfd3bc" stroke-width="1"/>`)
    .join('');
  const axes = dims
    .map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#dfd3bc"/>`; })
    .join('');
  const dataPts = dims.map((d, i) => pt(i, R * val(d)).join(',')).join(' ');
  const dots = dims
    .map((d, i) => { const [x, y] = pt(i, R * val(d)); return `<circle cx="${x}" cy="${y}" r="3" fill="#9e731e"/>`; })
    .join('');
  const labels = dims
    .map((d, i) => {
      const [lx, ly] = pt(i, R + 16);
      const anchor = Math.abs(lx - cx) < 10 ? 'middle' : lx > cx ? 'start' : 'end';
      return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" font-weight="600" fill="#5c4a32">${esc(d.label)}</text>`;
    })
    .join('');
  return `<svg class="hp-radar" viewBox="0 0 310 196" role="img" aria-label="六维正统合婚契合度雷达图">${rings}${axes}<polygon points="${dataPts}" fill="rgba(158,115,30,0.20)" stroke="#9e731e" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

function renderHero(f) {
  const dims = f.dims || [];
  const dimBars = dims.map((d) => {
    const pct = Math.max(20, Math.min(100, Math.round(50 + ((Number(d.score) || 0) / (Number(d.weight) || 20)) * 50)));
    return `<div class="hp-dim-item">
      <div class="hp-dim-hd"><span>${esc(d.label)}</span><b>${pct}分</b></div>
      <div class="hp-dim-bar"><i style="width:${pct}%"></i></div>
    </div>`;
  }).join('');

  const verdicts = (f.coreVerdicts || []).map((v) => `<div class="hp-vcard">
    <div class="hp-vcard-hd"><b>${esc(v.title)}</b><span>${esc(v.badge)}</span></div>
    <div class="hp-vcard-tx">${esc(v.text)}</div>
  </div>`).join('');

  return `<div class="hp-hero">
    <div class="hp-hero-left">
      <div class="hp-hero-top">
        <div class="hp-score-group">
          <div class="hp-score">${Number(f.score) || 0}</div>
          <div>
            <span class="hp-grade">${esc(f.grade || '—')}</span>
            <div class="hp-score-l" style="margin-top:3px">综合契合指数</div>
          </div>
        </div>
        <span class="hp-pro-tag">✦ 子平正统六维合婚 · 专业详批盘</span>
      </div>
      <div class="hp-hero-note">${esc(f.headline || f.gradeDesc || '')}</div>
      ${verdicts ? `<div class="hp-verdicts">${verdicts}</div>` : ''}
      ${dimBars ? `<div class="hp-dims">${dimBars}</div>` : ''}
    </div>
    <div class="hp-radar-box">${renderRadar(dims)}<div class="hp-radar-cap">六维正统合婚雷达</div></div>
  </div>`;
}

function renderPillarAndWuxingSection(f, a, b) {
  const matches = f.pillarMatches || [];
  const pmHtml = matches.map((m) => `<div class="hp-pm-card${m.pos === 'day' ? ' is-day' : ''}">
    <div class="hp-pm-top">
      <b>${esc(m.title)}</b>
      <span class="hp-pm-badge ${esc(m.badgeTone || 'mid')}">${esc(m.badge)}</span>
    </div>
    <div class="hp-pm-vs">
      ${esc(a.name)}【${esc(m.aPillar)}】 <span>(${esc(m.aShishen)})</span>
      ↔
      ${esc(b.name)}【${esc(m.bPillar)}】 <span>(${esc(m.bShishen)})</span>
    </div>
    <div class="hp-pm-detail">
      <div>• 天干与地支：${esc(m.ganText)} ； ${esc(m.zhiText)}</div>
      <div>• 柱位纳音：${esc(m.nayinText)}</div>
    </div>
  </div>`).join('');

  const wxLines = f.wuxing?.lines || [];
  const wxHtml = wxLines.map((l) => {
    const isComp = l.kind === '互补';
    return `<div class="hp-wx-row">
      <div class="hp-wx-lbl" style="color:${wxColor(l.element)}">
        <span>${esc(l.element)}行</span>
      </div>
      <div class="hp-wx-bars">
        <div class="hp-wx-track">
          <i>${esc(a.short)} ${l.aPercent}%</i>
          <div class="hp-wx-bar-bg"><div class="hp-wx-bar-fill" style="width:${Math.min(100, l.aPercent * 1.8)}%;background:${wxColor(l.element)}"></div></div>
          ${l.aNeed ? '<b style="color:#1f6e43">★喜用</b>' : ''}
        </div>
        <div class="hp-wx-track">
          <i>${esc(b.short)} ${l.bPercent}%</i>
          <div class="hp-wx-bar-bg"><div class="hp-wx-bar-fill" style="width:${Math.min(100, l.bPercent * 1.8)}%;background:${wxColor(l.element)};opacity:.75"></div></div>
          ${l.bNeed ? '<b style="color:#1f6e43">★喜用</b>' : ''}
        </div>
      </div>
      <div class="hp-wx-tag${isComp ? ' comp' : ''}">${esc(l.kind)}</div>
    </div>`;
  }).join('');

  const mg = f.mingGuaMatch;
  const mgHtml = mg
    ? `<div class="hp-minggua-box">
        <div><b>🧭 八宅命卦与安家方位：</b>${esc(a.name)}${esc(mg.aGua)} × ${esc(b.name)}${esc(mg.bGua)} —— <b>${esc(mg.badge)}</b></div>
        <div style="color:#6b5c47">${esc(mg.desc)}</div>
      </div>`
    : '';

  return `<div data-hp-sec="pillars">
    <div class="hp-sec-card">
      <div class="hp-sec-h"><span>四柱逐柱对轨合参（年根基 · 月门户 · 日夫妻宫 · 时晚景）</span><small>以日柱夫妻宫为第一枢机，四柱同参</small></div>
      <div class="hp-pm-grid">${pmHtml}</div>
    </div>
    <div class="hp-sec-card">
      <div class="hp-sec-h"><span>五行能量分布与喜用神双向互补图谱</span><small>带 ★喜用 标记之五行若得对方高占比滋养，即为上等互补</small></div>
      <div class="hp-wx-rows">${wxHtml}</div>
      ${mgHtml}
    </div>
  </div>`;
}

function renderRelsAndNobleSection(f) {
  const crossSs = f.crossShensha?.all || [];
  const nobleHtml = crossSs.length
    ? `<div class="hp-noble-grid">${crossSs.map((n) => `<div class="hp-noble-card">
        <div class="hp-noble-hd"><b>✦ ${esc(n.title)}</b><span>${esc(n.badge)}</span></div>
        <div class="hp-noble-tx">${esc(n.desc)}</div>
      </div>`).join('')}</div>`
    : `<div class="hp-rel-empty" style="margin-bottom:8px">双方四柱神煞各自中正独立，以日柱与五行喜用互补为主轴。</div>`;

  const he = f.he || [];
  const bad = f.conflicts || [];
  const listCards = (arr, empty) =>
    arr.length
      ? `<div class="hp-rel-chips">${arr.map((r) => `<div class="hp-rel-card"><b>${esc(r.name)}</b><span class="hp-where">${esc(r.keyText || '跨柱')}</span>${r.note ? `<div style="font-size:11px;color:#6b5f50;margin-top:2px">${esc(r.note)}</div>` : ''}</div>`).join('')}</div>`
      : `<div class="hp-rel-empty">${empty}</div>`;

  return `<div class="hp-sec-card" data-hp-sec="rels">
    <div class="hp-sec-h"><span>跨盘天乙贵人 · 专禄福星 · 红鸾桃花互查</span><small>检视一方命盘地支是否落入另一方的贵人、禄神与正缘星</small></div>
    ${nobleHtml}
    <div class="hp-sec-h" style="margin-top:8px;padding-top:8px;border-top:1px dashed #e5dac7">
      <span>跨盘干支合冲张力对照</span><small>相合相引 ${he.length} 项 · 需磨合张力 ${bad.length} 项</small>
    </div>
    <div class="hp-rel-cols">
      <div class="hp-rel-col good"><div class="t">✦ 相合相引（默契加分项）</div>${listCards(he, '未见跨盘直接合化，以五行互补论')}</div>
      <div class="hp-rel-col bad"><div class="t">⚡ 需要注意（日常磨合项）</div>${listCards(bad, '双方柱位无明显刑冲，气场平和')}</div>
    </div>
  </div>`;
}

function renderTimelineSection(f, a, b) {
  const tl = f.timeline || [];
  if (!tl.length) return '';
  const cards = tl.map((y) => `<div class="hp-tl-card ${esc(y.tone || 'mid')}">
    <div class="hp-tl-hd">
      <span class="hp-tl-yr">${esc(y.year)} ${esc(y.ganzhi)}年</span>
      <span class="hp-tl-score">共振 ${esc(y.syncScore)}分</span>
    </div>
    <span class="hp-tl-tag">${esc(y.tag)}</span>
    <div class="hp-tl-notes">
      <div><b>${esc(a.short)}：</b>${esc(y.aNote)}</div>
      <div><b>${esc(b.short)}：</b>${esc(y.bNote)}</div>
    </div>
  </div>`).join('');

  return `<div class="hp-sec-card" data-hp-sec="timeline">
    <div class="hp-sec-h"><span>2025–2030 未来六年双人岁运共振日历</span><small>结合双方喜用神与流年太岁合冲夫妻宫推演婚嫁/置业/协同吉年</small></div>
    <div class="hp-tl-grid">${cards}</div>
  </div>`;
}

export function renderHePanChart(facts) {
  const f = facts || {};
  const parties = f.parties || [];
  const a = parties[0] || null;
  const b = parties[1] || null;
  if (!a || !b) return '';
  return `<style>${CSS}</style>
<div class="hp-wrap" data-hp-view="all">
  <div class="hp-subnav" role="tablist" aria-label="合盘模块快速筛选">
    <button type="button" class="hp-snav-btn on" onclick="var w=this.closest('.hp-wrap');w.setAttribute('data-hp-view','all');w.querySelectorAll('.hp-snav-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')">全部全览</button>
    <button type="button" class="hp-snav-btn" onclick="var w=this.closest('.hp-wrap');w.setAttribute('data-hp-view','overview');w.querySelectorAll('.hp-snav-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')">① 六维总评与双盘</button>
    <button type="button" class="hp-snav-btn" onclick="var w=this.closest('.hp-wrap');w.setAttribute('data-hp-view','pillars');w.querySelectorAll('.hp-snav-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')">② 四柱对轨与喜用</button>
    <button type="button" class="hp-snav-btn" onclick="var w=this.closest('.hp-wrap');w.setAttribute('data-hp-view','rels');w.querySelectorAll('.hp-snav-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')">③ 贵人桃花与合冲</button>
    <button type="button" class="hp-snav-btn" onclick="var w=this.closest('.hp-wrap');w.setAttribute('data-hp-view','timeline');w.querySelectorAll('.hp-snav-btn').forEach(b=>b.classList.remove('on'));this.classList.add('on')">④ 六年岁运共振</button>
  </div>
  <div data-hp-sec="overview">
    ${renderHero(f)}
    <div class="hp-parties">
      ${renderParty(a)}
      ${renderParty(b)}
    </div>
  </div>
  ${renderPillarAndWuxingSection(f, a, b)}
  ${renderRelsAndNobleSection(f)}
  ${renderTimelineSection(f, a, b)}
  <div class="hp-foot">正统子平合婚以日柱（夫妻宫）、喜用神互补及跨盘贵人岁运为核心，指数供传统文化交流参考。</div>
</div>`;
}
