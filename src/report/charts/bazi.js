/**
 * 八字专业排盘 —— 对标问真八字（去重降噪 · 首屏核心结论优先 · 神煞胶囊化版）
 *
 * 用户视角重构要点：
 *   1. 首屏一眼看重点（.bz-head）：顶部直接呈现「日主 / 旺衰评分 / 格局 / 喜用神」四大核心指标卡，
 *      不再在四柱总表上方重复画一套冗余的四柱大卡片；
 *   2. 子视图默认定位「① 核心命盘」（#bzv-core checked）：排盘后一屏聚焦「四柱十神藏干总表 + 六柱同参 + 大运流年横轨」，
 *      需要看胎命身/称骨、冲合连线图、神煞速查时点顶部胶囊秒切，彻底告别手机端无尽下拉；
 *   3. 四柱总表（.bz-matrix）与六柱同参（.bz-six-grid）在手机端 100% 自适应一屏宽度，无需左右拖拽；
 *   4. 神煞区（.bz-shensha）从 22 个巨型方框重构为「按柱分层紧凑吉凶胶囊 + 顶部点击释义栏」，高度压缩 75%。
 */

import { GAN_WX, ZHI_WX, WX_COLOR, WX_BG, wxOf, esc, list, scoped } from './shared.js';
import { GAN, ZHI, GAN_WUXING, ganzhiOfIndex, shishen, indexOfGanzhi, cangganOf } from '../../core/ganzhi.js';
import { solarTerm } from '../../core/astro.js';
import { chengguBrief } from '../../interpret/chengguDetail.js';
import { jdnToYmd } from '../../core/julian.js';
import { SHENSHA_RULES } from '../../core/shensha.js';
import { computeSixPillarImpact } from '../../engines/bazi.js';

const KEYS = ['year', 'month', 'day', 'hour'];
const POS_LABEL = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' };
const REL_LABEL = {
  he: '合', chong: '冲', xing: '刑', hai: '害', po: '破',
  sanhe: '三合', banhe: '半合', gongju: '拱局', sanhui: '三会',
  binglin: '并临', tkdc: '天克地冲', thdh: '天合地合',
};
const REL_COLOR = {
  he: '#b0812b', banhe: '#b0812b', gongju: '#c9a961', chong: '#b3392c',
  xing: '#6b5640', hai: '#8b8172', po: '#8b8172', sanhe: '#2f7d52', sanhui: '#2f7d52',
  binglin: '#8a3ab9', tkdc: '#b3392c', thdh: '#2f7d52',
};

const yearGanzhi = (y) => {
  const i = ((y - 4) % 60 + 60) % 60;
  return ganzhiOfIndex(i);
};

// ============================================================ 顶部核心结论卡（一眼看懂命局）

function headerRow(f, input) {
  const dm = f.dayMaster || {};
  const st = f.strength || {};
  const ys = f.yongshen || {};
  const gender = input?.gender === 'female' ? '女命（坤造）' : '男命（乾造）';
  const solar = input
    ? `公历 ${input.year}-${String(input.month).padStart(2, '0')}-${String(input.day).padStart(2, '0')} ${String(input.hour ?? 0).padStart(2, '0')}:${String(input.minute ?? 0).padStart(2, '0')}`
    : '';
  const lunarText = f.lunar
    ? `农历 ${f.lunar.yearGanzhi}（${f.lunar.zodiac}）年${f.lunar.monthName}${f.lunar.isLeap ? '（闰）' : ''}${f.lunar.dayName}`
    : '';
  const xk = list(f.xunkong);
  const favTags = list(ys.favorable).map((e) => `<b style="color:${WX_COLOR[e]}">${esc(e)}</b>`).join(' ');
  const unfavTags = list(ys.unfavorable).map((e) => `<s style="color:#9a8f7c">${esc(e)}</s>`).join(' ');

  return `<div class="bz-head">
    <div class="bz-head-top">
      <div class="bz-title">
        <span class="bz-name">${esc(input?.name || gender)}</span>
        <span class="bz-tagline">${esc(solar)}　｜　${esc(lunarText)}</span>
      </div>
      <span class="bz-xk-pill">旬空：<b>${esc(xk.join('')) || '—'}</b>${list(f.xunkongPositions).length ? `（${esc(f.xunkongPositions.join('·'))}落空）` : ''}</span>
    </div>
    <div class="bz-kpis">
      <div class="bz-kpi">
        <i>日主元神</i>
        <strong><span style="color:${wxOf(dm.gan)}">${esc(dm.gan || '—')}</span>${esc(dm.element || '')}<em>${dm.yang ? '阳' : '阴'}</em></strong>
      </div>
      <div class="bz-kpi">
        <i>能量旺衰</i>
        <strong>${st.score ?? '—'}分 · <b>${esc(st.level || '中和')}</b></strong>
      </div>
      <div class="bz-kpi">
        <i>命局成格</i>
        <strong>${esc(f.pattern?.name || '正格')}</strong>
      </div>
      <div class="bz-kpi wide">
        <i>喜忌取用</i>
        <strong>喜 ${favTags || '—'}　<small>忌 ${unfavTags || '—'}</small></strong>
      </div>
    </div>
  </div>`;
}

function gzColored(v) {
  const s = String(v ?? '');
  if (s.length === 2 && GAN_WX[s[0]] && (ZHI_WX[s[1]] || GAN_WX[s[1]])) {
    return `<b style="color:${wxOf(s[0])}">${esc(s[0])}</b><b style="color:${wxOf(s[1])}">${esc(s[1])}</b>`;
  }
  return `<b>${esc(v)}</b>`;
}

const TERM_EL = {
  立春: '木', 雨水: '木', 惊蛰: '木', 春分: '木', 清明: '木', 谷雨: '木',
  立夏: '火', 小满: '火', 芒种: '火', 夏至: '火', 小暑: '火', 大暑: '火',
  立秋: '金', 处暑: '金', 白露: '金', 秋分: '金', 寒露: '金', 霜降: '金',
  立冬: '水', 小雪: '水', 大雪: '水', 冬至: '水', 小寒: '水', 大寒: '水',
};
const WX_SET = new Set(['金', '木', '水', '火', '土']);
const naEl = (nayin) => { const c = String(nayin || '').slice(-1); return WX_SET.has(c) ? c : ''; };
const MINGGUA_COLOR = { 东四命: '#2f7d52', 西四命: '#c9a227' };

function infoColored(key, v) {
  const s = String(v ?? '');
  if (key === '生肖') return `<b>${esc(s)}</b>`;
  if (key === '出生节气') {
    const elx = TERM_EL[s] || (TERM_EL[s.slice(0, 2)] || '');
    return elx ? `<b style="color:${WX_COLOR[elx]}">${esc(s)}</b>` : `<b>${esc(s)}</b>`;
  }
  if (key === '纳音（年）') {
    const elx = naEl(s);
    return elx ? `<b style="color:${WX_COLOR[elx]}">${esc(s)}</b>` : `<b>${esc(s)}</b>`;
  }
  if (key === '命卦') {
    const g = s.includes('东四命') ? '东四命' : s.includes('西四命') ? '西四命' : '';
    if (g) return `<b style="color:${MINGGUA_COLOR[g]}">${esc(s)}</b>`;
    return `<b>${esc(s)}</b>`;
  }
  if (key === '月令') return `<b>${esc(s)}</b>`;
  if (key === '旬空') {
    return `<b>${[...s].map((ch) => (ZHI_WX[ch]
      ? `<span style="color:${WX_COLOR[ZHI_WX[ch]]}">${esc(ch)}</span>`
      : esc(ch))).join('')}</b>`;
  }
  return gzColored(v);
}

function infoTable(f) {
  const t = f.time || {};
  const cells = [
    ['出生节气', f.solarTerms?.current || '—'],
    ['胎元', f.taiyuan?.name || '—'],
    ['命宫', f.mingGong?.name || '—'],
    ['身宫', f.shenGong?.name || '—'],
    ['生肖', f.lunar?.zodiac || '—'],
    ['纳音（年）', f.nayin?.year || '—'],
    ['命卦', f.mingGua ? `${f.mingGua.name}卦·${f.mingGua.group}` : '—'],
    ['旬空', (f.xunkong || []).join('、') + (f.xunkongPositions?.length ? `（${f.xunkongPositions.join('、')}）` : '')],
    ['月令', f.fourPillars.month.zhi + '月（第 ' + (f.monthOrder || '—') + ' 序）'],
  ];
  if (t.cityName) cells.push(['出生地', `${t.cityName}`]);
  if (t.lon !== undefined) cells.push(['经度', `${Number(t.lon).toFixed(2)}°E`]);
  if (t.solarHour !== undefined) cells.push(['真太阳时', `${Number(t.solarHour).toFixed(2)} 时`]);
  return `<div class="bz-info">
    ${cells.map(([k, v]) => `<div class="bz-info-cell"><i>${esc(k)}</i><span class="bz-info-v">${infoColored(k, v)}</span></div>`).join('')}
  </div>`;
}

function matrixTable(f) {
  const p = f.fourPillars;
  const rows = [
    { label: '宫位', render: (k) => `<span class="bz-pal">${esc((f.palaces?.[k]?.name) || '')}</span>` },
    { label: '主星', render: (k) => `<span class="bz-ss">${k === 'day' ? '<b>日主</b>' : esc(p[k].shishen)}</span>` },
    { label: '天干', render: (k) => `<span class="bz-big" style="color:${wxOf(p[k].gan)}">${p[k].gan}</span>` },
    { label: '地支', render: (k) => `<span class="bz-big" style="color:${wxOf(p[k].zhi)}">${p[k].zhi}</span>` },
    {
      label: '藏干',
      render: (k) => list(p[k].canggan).map((c) =>
        `<span class="bz-cg" style="color:${wxOf(c.gan)}">${c.gan}<i>${esc(c.shishen || '')}</i></span>`).join(''),
    },
    { label: '星运', render: (k) => `<span class="bz-mid bz-cs">${esc(f.changsheng?.[k]?.state || '—')}</span>` },
    { label: '自坐', render: (k) => `<span class="bz-mid">${esc(f.zizuo?.[k]?.state || '—')}</span>` },
    {
      label: '空亡',
      render: (k) => {
        const on = list(f.xunkong).includes(p[k].zhi);
        return on
          ? `<span class="bz-kw" title="旬空${esc(list(f.xunkong).join('、'))}：此柱地支落空">空亡</span>`
          : '<span class="bz-none">—</span>';
      },
    },
    { label: '纳音', render: (k) => `<span class="bz-na">${esc(p[k].nayin)}</span>` },
  ];

  const head = KEYS.map((k) => `<th class="${k === 'day' ? 'day-col' : ''}">${POS_LABEL[k]}</th>`).join('');
  const body = rows.map((r) =>
    `<tr><td class="bz-rowlabel">${r.label}</td>${KEYS.map((k) => `<td class="${k === 'day' ? 'day-col' : ''}">${r.render(k)}</td>`).join('')}</tr>`).join('');

  return `<div class="bz-mscroll"><table class="bz-matrix"><thead><tr><th class="bz-rowlabel">四柱</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function relationsRow(f) {
  const all = list(f.relations?.all);
  if (!all.length) return '<div class="bz-rel-empty">命局干支之间无显著冲合刑会关系</div>';
  return `<div class="bz-rel">
    ${all.map((r) => `<span class="bz-rel-chip" title="${esc(r.source || '')}">
      <em style="background:${REL_COLOR[r.type] || '#8b8172'}">${REL_LABEL[r.type] || '关'}</em>
      <b>${esc(r.name)}</b>
      <i>${esc((r.labels || []).join('·'))}</i>
    </span>`).join('')}
  </div>`;
}

const zhiBenShishen = (dayGanIndex, zhiIndex) => {
  const cg = cangganOf(zhiIndex, dayGanIndex);
  return cg.length ? (cg[0].shishen || '') : '';
};

const WU_HU_DUN = { 0: 2, 5: 2, 1: 4, 6: 4, 2: 6, 7: 6, 3: 8, 8: 8, 4: 0, 9: 0 };

function liuyueData(Y, tz = 8) {
  const JIE = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 0, 2];
  const days = JIE.map((idx, i) => {
    const yy = (i === 12 || idx === 0) ? Y + 1 : Y;
    return Math.floor(solarTerm(yy, idx).jdUtc + tz / 24 + 0.5);
  });
  const out = [];
  for (let m = 0; m < 12; m++) {
    const start = days[m];
    const count = days[m + 1] - start;
    const { year, month, day } = jdnToYmd(start);
    const ganIndex = (WU_HU_DUN[yearGanzhi(Y).ganIndex] + m) % 10;
    const zhiIndex = (m + 2) % 12;
    out.push([indexOfGanzhi(ganIndex, zhiIndex), year, month, day, count]);
  }
  return out;
}

function chengGuCard(f) {
  const cg = f.chengGu;
  if (!cg) return '';
  const barW = Math.min(100, (cg.totalQian / 71) * 100);
  const brief = chengguBrief(cg);
  const briefHtml = brief ? `
    <div class="bz-cg2-brief">
      <div class="bz-cg2-brief-h">白话解读</div>
      <p class="bz-cg2-gist">${esc(brief.gist)}</p>
      ${brief.points.length ? `<ul class="bz-cg2-pts">${brief.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    </div>` : '';
  return `<div class="bz-cg2">
    <div class="bz-link-title">称骨算命（袁天罡）<span class="bz-link-sub">农历年·月·日·时骨重相加，查《称骨歌》</span></div>
    <div class="bz-cg2-top">
      <span class="bz-cg2-total">${esc(cg.totalText)}</span>
      <span class="bz-score bz-cg2-bar"><i style="width:${barW.toFixed(1)}%;background:#b0812b"></i></span>
    </div>
    <div class="bz-cg2-parts">
      ${cg.parts.map((x) => `<span class="bz-cg2-part"><i>${x.k}</i><b>${esc(x.label)}</b><em>${esc(x.text)}</em></span>`).join('')}
    </div>
    <div class="bz-cg2-verse">${esc(cg.verse)}</div>
    ${briefHtml}
    <div class="bz-cg2-note">${esc(cg.note)} · 民俗文化参考</div>
  </div>`;
}

function linkChart(f, extra = '') {
  const all = list(f.relations?.all);
  const ganRels = all.filter((r) => (r.labels?.[0] || '').includes('干')).slice(0, 4);
  const zhiRels = all.filter((r) => (r.labels?.[0] || '').includes('支')).slice(0, 5);
  const idxOf = (k) => KEYS.indexOf(k);
  const W = 640;
  const ganY = 66;
  const zhiY = 158;
  const colLabelY = 232;
  const cx = (i) => 104 + i * 144;
  const H = colLabelY + 8;

  const ganArcs = ganRels.map((r, i) => {
    const pts = list(r.keys).map(idxOf).filter((x) => x >= 0).sort((a, b) => a - b);
    if (pts.length < 2) return '';
    const x1 = cx(pts[0]);
    const x2 = cx(pts[pts.length - 1]);
    const apexY = 16 + i * 14;
    const color = REL_COLOR[r.type] || '#8b8172';
    const midX = (x1 + x2) / 2;
    const dash = ['he', 'banhe', 'gongju', 'sanhe', 'sanhui'].includes(r.type) ? '0' : '4 3';
    const short = r.name.slice(0, 2);
    return `<path d="M ${x1} ${ganY - 19} Q ${midX} ${apexY} ${x2} ${ganY - 19}" fill="none" stroke="${color}" stroke-width="1.7" stroke-dasharray="${dash}" opacity=".9"/>
      <text x="${midX}" y="${apexY - 4}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${color}">${REL_LABEL[r.type] || ''}·${esc(short)}</text>`;
  }).join('');

  const zhiArcs = zhiRels.map((r, i) => {
    const pts = list(r.keys).map(idxOf).filter((x) => x >= 0).sort((a, b) => a - b);
    if (pts.length < 2) return '';
    const x1 = cx(pts[0]);
    const x2 = cx(pts[pts.length - 1]);
    const dipY = zhiY + 36 + i * 14;
    const color = REL_COLOR[r.type] || '#8b8172';
    const midX = (x1 + x2) / 2;
    const dash = ['he', 'banhe', 'gongju', 'sanhe', 'sanhui'].includes(r.type) ? '0' : '4 3';
    return `<path d="M ${x1} ${zhiY + 19} Q ${midX} ${dipY} ${x2} ${zhiY + 19}" fill="none" stroke="${color}" stroke-width="1.7" stroke-dasharray="${dash}" opacity=".9"/>
      <text x="${midX}" y="${dipY + 12}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${color}">${REL_LABEL[r.type] || ''}</text>`;
  }).join('');

  const nodeRow = (y, pick) => KEYS.map((k, i) => {
    const p = f.fourPillars[k];
    const ch = pick(p);
    const day = k === 'day';
    return `<g>
      <rect x="${cx(i) - 30}" y="${y - 19}" width="60" height="38" rx="9" fill="${day ? '#f3e8cf' : '#fffdf8'}" stroke="${day ? '#c9a961' : '#d8cba9'}" stroke-width="${day ? 1.6 : 1}"/>
      <text x="${cx(i)}" y="${y + 8}" text-anchor="middle" font-size="21" font-weight="700" font-family="'Noto Serif SC',serif" fill="${wxOf(ch)}">${ch}</text>
    </g>`;
  }).join('');

  const colLabels = KEYS.map((k, i) =>
    `<text x="${cx(i)}" y="${colLabelY}" text-anchor="middle" font-size="11" fill="#8b8172">${POS_LABEL[k]}${k === 'day' ? '（日元）' : ''}</text>`).join('');
  const rowLabels = `<text x="34" y="${ganY + 6}" text-anchor="middle" font-size="11" fill="#8b8172">天干</text>
    <text x="34" y="${zhiY + 6}" text-anchor="middle" font-size="11" fill="#8b8172">地支</text>`;

  return `<div class="bz-linkwrap">
    <div class="bz-link-title">四柱互动连线<span class="bz-link-sub">上弧＝天干关系　下弧＝地支关系</span></div>
    <div class="bz-linkscroll"><svg viewBox="0 0 ${W} ${H}" class="bz-linksvg" xmlns="http://www.w3.org/2000/svg">
      ${ganArcs}${zhiArcs}
      ${nodeRow(ganY, (p) => p.gan)}
      ${nodeRow(zhiY, (p) => p.zhi)}
      ${rowLabels}${colLabels}
    </svg></div>
    <div class="bz-legend">
      ${['合', '冲', '刑', '害', '破', '三合', '三会'].map((lb, i) => {
    const key = ['he', 'chong', 'xing', 'hai', 'po', 'sanhe', 'sanhui'][i];
    return `<span><i style="background:${REL_COLOR[key]}"></i>${lb}</span>`;
  }).join('')}
      <span class="bz-legend-note">实线为合会，虚线为冲刑害破</span>
    </div>
    ${extra}
  </div>`;
}

function elementBar(f) {
  const pct = f.elementPercent || {};
  const total = Object.values(pct).reduce((a, b) => a + Number(b || 0), 0) || 100;
  const segs = Object.entries(pct).map(([el, v]) =>
    `<span class="bz-seg" style="width:${(Number(v) / total) * 100}%;background:${WX_COLOR[el]}"><i>${el}${v}%</i></span>`).join('');
  return `<div class="bz-el">
    <div class="bz-elbar">${segs}</div>
    <div class="bz-elnote">五行能量占比（含地支藏干本气1.0 / 中气0.6 / 余气0.3加权）</div>
  </div>`;
}

function conclusionPanel(f) {
  const dm = f.dayMaster;
  const st = f.strength || {};
  const ys = f.yongshen || {};
  const dy = f.dayun || {};
  const nowYear = new Date().getFullYear();
  const cur = list(dy.steps).find((s) => nowYear >= s.fromYear && nowYear <= s.toYear)
    || list(dy.steps).find((s) => s.order === 1);
  const favTags = list(ys.favorable).map((e) => `<b style="color:${WX_COLOR[e]}">${e}</b>`).join('、');
  const unfavTags = list(ys.unfavorable).map((e) => `<s style="color:#8b8172">${e}</s>`).join('、');

  return `<div class="bz-concl">
    <div class="bz-concl-row"><span class="k">强弱依据</span><span class="v sm">${esc(list(st.basis).join('；') || '—')}</span></div>
    <div class="bz-concl-row"><span class="k">格局依据</span><span class="v sm">${esc(f.pattern?.name || '—')}（${esc(f.pattern?.basis || '—')}）</span></div>
    <div class="bz-concl-row"><span class="k">用神取法</span><span class="v sm">喜用 ${favTags} ｜ 忌 ${unfavTags}（${esc(ys.basis || '—')}）</span></div>
    ${cur ? `<div class="bz-concl-row"><span class="k">当前大运</span><span class="v sm">${cur.startAge}–${cur.startAge + 9} 岁行 <b>${cur.name}</b> 运（${esc(cur.shishen)} · ${cur.fromYear}–${cur.toYear}年）｜${esc(dy.basis || '')}</span></div>` : ''}
  </div>`;
}

/**
 * 神煞速查表（胶囊化紧凑版：高度减少 75%，点击任意神煞胶囊即刻弹出/显示起法与白话释义）
 */
function shenshaTable(f) {
  const all = list(f.shensha);
  if (!all.length) return '';
  const CAT_LABEL = { 吉: '吉', 中: '平', 凶: '凶' };
  const ORDER4 = [
    ['年', '年柱'],
    ['月', '月柱'],
    ['日', '日柱'],
    ['时', '时柱'],
    ['命', '全局'],
  ];
  const posOf = (x) => (x.position || '命局').charAt(0) === '命' ? '命' : (x.position || '').charAt(0);
  const firstHit = all[0] || {};
  const defaultTip = firstHit.name
    ? `<b>${esc(firstHit.name)}（${esc(firstHit.position || '本盘')} · ${CAT_LABEL[firstHit.cat] || '平'}）</b>：${esc(firstHit.desc || firstHit.note || '')}　<small>〔起法：${esc(firstHit.by || '')} · ${esc(firstHit.source || '')}〕</small>`
    : '点击下方任意神煞标签查看传统起法口诀与象意解读';

  const rows = ORDER4.map(([key, title]) => {
    const items = all.filter((x) => posOf(x) === key);
    if (!items.length) return '';
    return `<div class="bz-ss-row">
      <span class="bz-ss-pos">${esc(title)}</span>
      <div class="bz-ss-pills">
        ${items.map((x) => {
          const catCls = x.cat === '吉' ? 'j' : x.cat === '凶' ? 'x' : 'z';
          const detailText = `${x.desc || x.note || ''}\n【所在柱位】${x.position || title}\n【起法依据】${x.by || '传统神煞'}（${x.source || ''}）`;
          return `<span class="bz-ss-item pill-${catCls} qm-el" data-t="神煞「${esc(x.name)}」（${CAT_LABEL[x.cat] || '平'}）" data-x="${esc(detailText)}" title="${esc(x.desc || x.note || '')}">
            <em class="bz-ss-dot">${CAT_LABEL[x.cat] || '平'}</em><b>${esc(x.name)}</b>
          </span>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  const hitNames = new Set(all.map((x) => x.name));
  const libRows = SHENSHA_RULES.map((r) => {
    const on = hitNames.has(r.name);
    return `<span class="bz-ss-lib${on ? ' on' : ''} qm-el" data-t="神煞规则「${esc(r.name)}」" data-x="【起法】${esc(r.by || '')}：${esc(r.source || '')}\n【释义】${esc(r.desc || '')}">${esc(r.name)}</span>`;
  }).join('');

  return `<div class="bz-shensha">
    <div class="bz-ss-hd">
      <span class="bz-link-title" style="margin:0">命盘神煞速查（命中 ${all.length} 项 · 点击任意标签查看释义）</span>
      <span class="bz-ss-legend"><i class="j">吉神</i><i class="x">凶煞</i><i class="z">中性</i></span>
    </div>
    <div class="bz-ss-hint">${defaultTip}</div>
    <div class="bz-ss-table">${rows}</div>
    <details class="bz-ss-all">
      <summary>展开核对规则库全部 ${SHENSHA_RULES.length} 项（金色＝本盘命中）</summary>
      <div class="bz-ss-libgrid">${libRows}</div>
    </details>
  </div>`;
}

/** 序列化六柱互动项供前端下钻联动 */
function serializeSixRels(six) {
  return list(six?.all).slice(0, 10).map((r) => ({
    t: r.type || 'he',
    b: REL_LABEL[r.type] || '关',
    c: REL_COLOR[r.type] || '#8b8172',
    n: r.name || '',
    l: (r.labels || []).join('·'),
  }));
}

/** 大运与六柱同参时间轨道 */
function timeTrack(f) {
  const steps = list(f.dayun?.steps);
  if (!steps.length) return '';
  const nowYear = new Date().getFullYear();
  const dmGan = f.fourPillars.day.ganIndex;
  const tz = f.time?.tzOffset ?? 8;
  const curIdx = Math.max(0, steps.findIndex((s) => nowYear >= s.fromYear && nowYear <= s.toYear));
  const curStep = steps[curIdx] || steps[0];
  const initYear = (nowYear >= curStep.fromYear && nowYear <= curStep.toYear) ? nowYear : curStep.fromYear;
  const initLnGz = yearGanzhi(initYear);
  const initSix = computeSixPillarImpact(f.fourPillars, curStep, { ...initLnGz, year: initYear });
  const initRels = serializeSixRels(initSix);

  const radios = steps.map((s, i) =>
    `<input type="radio" name="bzdy" class="bz-dy-r" id="bzdy${i}"${i === curIdx ? ' checked' : ''}>`).join('');

  const tabs = `<div class="bz-dy-tabs" role="tablist">` + steps.map((s, i) => {
    const active = i === curIdx;
    const defYear = (nowYear >= s.fromYear && nowYear <= s.toYear) ? nowYear : s.fromYear;
    const defGz = yearGanzhi(defYear);
    const defSix = computeSixPillarImpact(f.fourPillars, s, { ...defGz, year: defYear });
    const defRels = serializeSixRels(defSix);
    const dyZss = zhiBenShishen(dmGan, s.zhiIndex);
    const lySss = shishen(dmGan, defGz.ganIndex);
    const lyZss = zhiBenShishen(dmGan, defGz.zhiIndex);
    return `<label for="bzdy${i}" class="bz-dy-chip${active ? ' on' : ''}"
      data-dy-gz="${esc(s.name)}" data-dy-age="${s.startAge}–${s.startAge + 9}岁" data-dy-ss="${esc(s.shishen)}·${esc(dyZss)}"
      data-ly-year="${defYear}" data-ly-gz="${esc(defGz.name)}" data-ly-ss="${esc(lySss)}·${esc(lyZss)}"
      data-six="${esc(JSON.stringify(defRels))}"
      title="${s.fromYear}–${s.toYear} 年　天干${esc(s.shishen)}·支本气${esc(dyZss)}">
      <em>${s.startAge}–${s.startAge + 9}岁</em>
      <b style="color:${wxOf(s.gan)}">${s.name}</b>
      <span class="bz-ss-pair">${esc(s.shishen)}</span>
    </label>`;
  }).join('') + '</div>';

  const panels = steps.map((s, i) => {
    const years = [];
    const dyZss = zhiBenShishen(dmGan, s.zhiIndex);
    for (let y = s.fromYear; y <= s.toYear; y++) {
      const gz = yearGanzhi(y);
      const sShi = shishen(dmGan, gz.ganIndex);
      const zShi = zhiBenShishen(dmGan, gz.zhiIndex);
      const mData = liuyueData(y, tz);
      const sixY = computeSixPillarImpact(f.fourPillars, s, { ...gz, year: y });
      const relsY = serializeSixRels(sixY);
      years.push(`<span class="bz-ly${y === nowYear ? ' now' : ''}"
        data-m="${esc(JSON.stringify(mData))}"
        data-dy-gz="${esc(s.name)}" data-dy-age="${s.startAge}–${s.startAge + 9}岁" data-dy-ss="${esc(s.shishen)}·${esc(dyZss)}"
        data-ly-year="${y}" data-ly-gz="${esc(gz.name)}" data-ly-ss="${esc(sShi)}·${esc(zShi)}"
        data-six="${esc(JSON.stringify(relsY))}"
        title="${y} 年 ${gz.name}　点击联动六柱同参并展开流月／流日">
        <em>${y}</em><b>${gz.name}</b><i>${sShi}</i></span>`);
    }
    const impacts = list(s.impact?.all);
    return `<div class="bz-dy-panel bz-dy-p${i}">
      <div class="bz-step-head">
        <span class="bz-step-age">${s.startAge}–${s.startAge + 9} 岁（${s.fromYear}–${s.toYear}）</span>
        <span class="bz-step-gz" style="color:${wxOf(s.gan)}">${s.name}</span>
        <span class="bz-step-ss">${esc(s.shishen)}</span>
        ${impacts.length ? `<span class="bz-step-hit" title="${esc(impacts.map((x) => x.name).join('、'))}">原局互动 ${impacts.length} 项</span>` : ''}
      </div>
      <div class="bz-step-ly">${years.join('')}</div>
      <div class="bz-drill-hint">💡 点选上方任意大运或流年，实时联动「六柱同参」并展开流月／流日</div>
    </div>`;
  }).join('');

  const p = f.fourPillars;
  const initDyZss = zhiBenShishen(dmGan, curStep.zhiIndex);
  const initLySss = shishen(dmGan, initLnGz.ganIndex);
  const initLyZss = zhiBenShishen(dmGan, initLnGz.zhiIndex);
  const sixRelHtml = initRels.length
    ? initRels.map((r) => `<span class="bz-rel-chip"><em style="background:${r.c}">${esc(r.b)}</em><b>${esc(r.n)}</b><i>${esc(r.l)}</i></span>`).join('')
    : '<span class="bz-rel-empty">当前岁运与原局平和</span>';

  const sixBar = `<div class="bz-six">
    <div class="bz-six-hd">
      <b>六柱同参 · 岁运实时合参</b>
      <span class="bz-six-sub">原局四柱 + 当前大运 + 当前流年实时冲合</span>
    </div>
    <div class="bz-six-grid">
      ${KEYS.map((k) => `<div class="bz-six-col">
        <i>${POS_LABEL[k]}</i>
        <b><span style="color:${wxOf(p[k].gan)}">${p[k].gan}</span><span style="color:${wxOf(p[k].zhi)}">${p[k].zhi}</span></b>
        <em>${k === 'day' ? '日元' : esc(p[k].shishen)}</em>
      </div>`).join('')}
      <div class="bz-six-col dyn dy" data-role="six-dy">
        <i>大运·<u data-role="six-dy-age">${curStep.startAge}-${curStep.startAge + 9}</u></i>
        <b data-role="six-dy-gz"><span style="color:${wxOf(curStep.gan)}">${curStep.gan}</span><span style="color:${wxOf(curStep.zhi)}">${curStep.zhi}</span></b>
        <em data-role="six-dy-ss">${esc(curStep.shishen)}</em>
      </div>
      <div class="bz-six-col dyn ly" data-role="six-ly">
        <i>流年·<u data-role="six-ly-year">${initYear}</u></i>
        <b data-role="six-ly-gz"><span style="color:${wxOf(initLnGz.gan)}">${initLnGz.gan}</span><span style="color:${wxOf(initLnGz.zhi)}">${initLnGz.zhi}</span></b>
        <em data-role="six-ly-ss">${esc(initLySss)}</em>
      </div>
    </div>
    <div class="bz-six-rels" data-role="six-rels">${sixRelHtml}</div>
  </div>`;

  const dynCss = steps.map((s, i) =>
    `#bzdy${i}:checked~.bz-dy-tabs label[for="bzdy${i}"]{border-color:#b0812b;background:#f3e8cf;box-shadow:0 1px 5px rgba(80,60,30,.15)}
#bzdy${i}:checked~.bz-dy-p${i}{display:block}`).join('\n');

  return `<div class="bz-track" data-dm="${dmGan}">
    <style class="bz-dy-style">${dynCss}</style>
    ${radios}
    <div class="bz-link-title">大运与流年排盘（横向滑动切换十年大运）</div>
    ${tabs}
    ${panels}
    ${sixBar}
  </div>`;
}

// ============================================================ 主入口

export function renderBazi(factPack) {
  const f = factPack.facts;
  const input = factPack.input || {};

  // 默认选中 bzv-core（① 核心命盘），避免首屏把 9 个区块全堆在一起让手机用户无尽下拉
  const subTabs = `
    <input type="radio" name="bzview" class="bz-v-r" id="bzv-core" checked>
    <input type="radio" name="bzview" class="bz-v-r" id="bzv-detail">
    <input type="radio" name="bzview" class="bz-v-r" id="bzv-graph">
    <input type="radio" name="bzview" class="bz-v-r" id="bzv-shensha">
    <input type="radio" name="bzview" class="bz-v-r" id="bzv-all">
    <div class="bz-subtabs" role="tablist" aria-label="八字盘面子视图切换">
      <label for="bzv-core" data-bv="core">① 核心命盘</label>
      <label for="bzv-shensha" data-bv="shensha">② 神煞速查</label>
      <label for="bzv-graph" data-bv="graph">③ 干支图谱</label>
      <label for="bzv-detail" data-bv="detail">④ 命主与称骨</label>
      <label for="bzv-all" data-bv="all">全部全览</label>
    </div>`;

  const html = `<div class="bz">
    ${headerRow(f, input)}
    ${subTabs}
    <div class="bz-sec" data-bsec="core">${matrixTable(f)}${timeTrack(f)}${conclusionPanel(f)}</div>
    <div class="bz-sec" data-bsec="shensha">${shenshaTable(f)}</div>
    <div class="bz-sec" data-bsec="graph">${elementBar(f)}${relationsRow(f)}${linkChart(f)}</div>
    <div class="bz-sec" data-bsec="detail">${infoTable(f)}${chengGuCard(f)}</div>
  </div>`;

  return scoped('bz', CSS, html);
}

// ============================================================ 样式

const CSS = `
.bz{max-width:840px;margin:0 auto;color:#3a352c;font-family:"PingFang SC","Microsoft YaHei",sans-serif}
.bz *{box-sizing:border-box}

.bz-v-r{position:absolute;opacity:0;pointer-events:none;width:0;height:0}
.bz-subtabs{display:flex;gap:4px;margin:8px 0 12px;padding:4px;background:#f4ede0;border:1px solid #dfd3bc;border-radius:10px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.bz-subtabs label{flex:1 0 auto;text-align:center;font-size:12.5px;font-weight:600;color:#6b5640;padding:6px 10px;border-radius:7px;cursor:pointer;user-select:none;transition:all .15s;white-space:nowrap}
.bz-subtabs label:hover{color:#2f2a22;background:rgba(255,255,255,.65)}
#bzv-all:checked~.bz-subtabs label[data-bv="all"],
#bzv-core:checked~.bz-subtabs label[data-bv="core"],
#bzv-detail:checked~.bz-subtabs label[data-bv="detail"],
#bzv-graph:checked~.bz-subtabs label[data-bv="graph"],
#bzv-shensha:checked~.bz-subtabs label[data-bv="shensha"]{background:linear-gradient(135deg,#c9a961,#b0812b);color:#241f17;box-shadow:0 1px 4px rgba(80,60,30,.2)}
#bzv-core:checked~.bz-sec:not([data-bsec="core"]){display:none}
#bzv-detail:checked~.bz-sec:not([data-bsec="detail"]){display:none}
#bzv-graph:checked~.bz-sec:not([data-bsec="graph"]){display:none}
#bzv-shensha:checked~.bz-sec:not([data-bsec="shensha"]){display:none}

/* 顶部核心结论卡 */
.bz-head{background:linear-gradient(135deg,#fffdf9,#f7efe0);border:1px solid #dfd2b8;border-radius:12px;padding:12px 14px;margin-bottom:8px}
.bz-head-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;padding-bottom:10px;border-bottom:1px dashed #e3d7c0}
.bz-title{display:flex;flex-direction:column;gap:2px}
.bz-name{font-family:"Noto Serif SC",serif;font-size:17px;font-weight:700;color:#2f2a22}
.bz-tagline{font-size:12px;color:#7a6e5d}
.bz-xk-pill{font-size:11.5px;color:#6b5640;background:#fffdf8;border:1px solid #dfd2b8;border-radius:999px;padding:2px 10px;white-space:nowrap}
.bz-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
.bz-kpi{background:#fffdf9;border:1px solid #e6dcc8;border-radius:8px;padding:7px 9px;min-width:0}
.bz-kpi i{display:block;font-style:normal;font-size:10.5px;color:#8b8172}
.bz-kpi strong{display:block;font-size:14px;color:#2f2a22;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bz-kpi strong em{font-style:normal;font-size:10.5px;color:#8b8172;margin-left:3px;font-weight:400}
.bz-kpi strong small{font-size:11.5px;font-weight:400;color:#8b8172}

/* 四柱核心专业盘表（一屏自适应） */
.bz-mscroll{width:100%;overflow-x:auto}
.bz-matrix{width:100%;border-collapse:collapse;margin-bottom:12px;table-layout:fixed;border-radius:10px;overflow:hidden}
.bz-matrix th,.bz-matrix td{border:1px solid #e5dbc7;padding:7px 4px;text-align:center;font-size:12px;background:#fffdf9;word-break:keep-all}
.bz-matrix th{background:#f5efe2;font-weight:700;color:#6b5640;font-size:12px}
.bz-matrix th.day-col,.bz-matrix td.day-col{background:#fdf7e7}
.bz-matrix td:first-child,.bz-matrix th:first-child{width:52px;background:#f5efe2;color:#7a6e5d;font-size:11px;font-weight:600}
.bz-pal{font-size:11px;color:#9a7720;background:#f3e8cf;border-radius:4px;padding:1px 5px}
.bz-ss{font-size:12px;color:#5c4b37;font-weight:600}
.bz-big{font-family:"Noto Serif SC",serif;font-size:26px;font-weight:800;line-height:1.15}
.bz-cg{font-family:"Noto Serif SC",serif;font-size:13px;font-weight:700;display:block;line-height:1.45}
.bz-cg i{font-family:"PingFang SC",sans-serif;font-style:normal;font-size:10px;color:#8b8172;margin-left:2px;font-weight:400}
.bz-mid{font-size:11.5px;color:#6b5640}
.bz-cs{color:#2f7d52;font-weight:600}
.bz-na{font-size:11px;color:#8b8172}
.bz-kw{font-size:10.5px;color:#b3392c;background:#fbeae7;border-radius:3px;padding:1px 4px;font-weight:600}
.bz-none{color:#d0c7b6}

/* 大运横滑条与六柱同参单行 */
.bz-track{margin:10px 0}
.bz-dy-r{position:absolute;opacity:0;pointer-events:none;width:0;height:0}
.bz-link-title{font-size:12.5px;font-weight:700;color:#5c4b37;margin-bottom:6px}
.bz-link-sub{font-weight:400;color:#8b8172;margin-left:6px;font-size:11px}
.bz-dy-tabs{display:flex;flex-wrap:nowrap;gap:6px;margin-bottom:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px}
.bz-dy-chip{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:1px;background:#fffdf9;border:1px solid #e5dbc7;border-radius:9px;padding:5px 9px;cursor:pointer;min-width:60px;transition:all .15s;user-select:none}
.bz-dy-chip em{font-style:normal;font-size:10px;color:#8b8172;white-space:nowrap}
.bz-dy-chip b{font-family:"Noto Serif SC",serif;font-size:16px;font-weight:700;line-height:1.2}
.bz-dy-chip span{font-size:10px;color:#6b5640;white-space:nowrap}
.bz-dy-panel{display:none;border:1px solid #e5dbc7;border-radius:10px;padding:9px 10px;background:#fffdf9;margin-bottom:10px}
.bz-step-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.bz-step-age{font-size:11.5px;color:#6b5640;font-weight:600}
.bz-step-gz{font-family:"Noto Serif SC",serif;font-size:16px;font-weight:700}
.bz-step-ss{font-size:11px;color:#8b8172}
.bz-step-hit{font-size:10px;color:#fff;background:#2f7d52;border-radius:4px;padding:1px 6px}
.bz-step-ly{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
.bz-ly{display:flex;flex-direction:column;align-items:center;background:#f7f2e6;border:1px solid #e5dbc7;border-radius:7px;padding:4px 2px;font-size:12px;line-height:1.3;cursor:pointer;min-width:0}
.bz-ly em{font-style:normal;font-size:9.5px;color:#8b8172}
.bz-ly b{font-family:"Noto Serif SC",serif;font-size:13px}
.bz-ly i{font-style:normal;font-size:9.5px;color:#9a7720}
.bz-ly.now{background:#2f7d52;border-color:#2f7d52;color:#fff}
.bz-ly.now em,.bz-ly.now i{color:#d8efe2}
.bz-ly.on{border-color:#b0812b;background:#f3e8cf}

.bz-six{background:linear-gradient(180deg,#fffdf9,#faf4e6);border:1px solid #dccba9;border-radius:10px;padding:10px 12px;margin-top:8px}
.bz-six-hd{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.bz-six-hd b{font-size:12.5px;color:#2f2a22}
.bz-six-sub{font-size:10.5px;color:#8b8172}
.bz-six-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin-bottom:8px}
.bz-six-col{display:flex;flex-direction:column;align-items:center;gap:1px;background:#fffdf9;border:1px solid #e5dbc7;border-radius:8px;padding:5px 2px;min-width:0}
.bz-six-col.dyn.dy{background:#fdf6e4;border-color:#c9a961}
.bz-six-col.dyn.ly{background:#eff7f2;border-color:#8ab89d}
.bz-six-col i{font-style:normal;font-size:9.5px;color:#8b8172;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.bz-six-col i u{text-decoration:none;font-weight:600;color:#5c4b37}
.bz-six-col b{font-family:"Noto Serif SC",serif;font-size:17px;font-weight:800;line-height:1.2}
.bz-six-col em{font-style:normal;font-size:9.5px;color:#6b5640;white-space:nowrap}
.bz-six-rels{display:flex;flex-wrap:wrap;gap:5px;padding-top:6px;border-top:1px dashed #e5dbc7}

.bz-rel{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.bz-rel-chip{display:inline-flex;align-items:center;gap:4px;background:#faf6ee;border:1px solid #e5dbc7;border-radius:6px;padding:2px 7px;font-size:11px}
.bz-rel-chip em{font-style:normal;color:#fff;border-radius:3px;padding:0 4px;font-size:9.5px;font-weight:700}
.bz-rel-chip b{color:#3a352c;font-weight:600}
.bz-rel-chip i{font-style:normal;color:#8b8172}
.bz-rel-empty{font-size:11.5px;color:#8b8172;padding:4px 0}

/* 神煞胶囊化紧凑设计 */
.bz-shensha{background:#fffdf9;border:1px solid #e5dbc7;border-radius:11px;padding:12px 14px;margin:8px 0}
.bz-ss-hd{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.bz-ss-legend{display:flex;gap:6px;font-size:10.5px}
.bz-ss-legend i{font-style:normal;padding:1px 6px;border-radius:4px}
.bz-ss-legend i.j{background:#e7f4ec;color:#1f6e43}
.bz-ss-legend i.x{background:#fbeae7;color:#b3392c}
.bz-ss-legend i.z{background:#f4efe4;color:#7a6e5d}
.bz-ss-hint{background:#faf5e8;border:1px dashed #d8c8a8;border-radius:7px;padding:7px 10px;font-size:12px;color:#4a3f30;line-height:1.55;margin-bottom:10px}
.bz-ss-hint small{color:#8b7961}
.bz-ss-table{display:flex;flex-direction:column;gap:7px}
.bz-ss-row{display:grid;grid-template-columns:56px 1fr;gap:8px;align-items:flex-start;padding-bottom:7px;border-bottom:1px dotted #ece4d4}
.bz-ss-row:last-child{border-bottom:0;padding-bottom:0}
.bz-ss-pos{font-size:11.5px;font-weight:700;color:#6b5640;background:#f5efe2;border:1px solid #e2d6be;border-radius:5px;padding:3px 0;text-align:center}
.bz-ss-pills{display:flex;flex-wrap:wrap;gap:6px}
.bz-ss-item{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;font-size:12px;cursor:pointer;border:1px solid #e2d6be;background:#fffdf9;transition:transform .12s}
.bz-ss-item:hover{transform:translateY(-1px)}
.bz-ss-item b{font-weight:600;color:#2f2a22}
.bz-ss-dot{font-style:normal;font-size:9.5px;font-weight:700;padding:0 4px;border-radius:999px}
.bz-ss-item.pill-j{border-color:#bfe0cc;background:#f3faf6}
.bz-ss-item.pill-j .bz-ss-dot{background:#2f7d52;color:#fff}
.bz-ss-item.pill-x{border-color:#eec5bd;background:#fdf4f2}
.bz-ss-item.pill-x .bz-ss-dot{background:#b3392c;color:#fff}
.bz-ss-item.pill-z .bz-ss-dot{background:#cfc3ae;color:#4a3f30}
.bz-ss-all{margin-top:10px;padding-top:6px;border-top:1px dashed #e5dbc7}
.bz-ss-all summary{cursor:pointer;font-size:11.5px;color:#8b8172;user-select:none}
.bz-ss-libgrid{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}
.bz-ss-lib{font-size:10.5px;background:#faf6ee;border:1px solid #e7ddc9;color:#8b8172;border-radius:4px;padding:2px 6px;cursor:pointer}
.bz-ss-lib.on{background:#f3e8cf;border-color:#c9a961;color:#8a6514;font-weight:700}

/* 其它区块 */
.bz-info{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:7px;margin-bottom:12px}
.bz-info-cell{background:#faf6ee;border:1px solid #e7ddc9;border-radius:9px;padding:7px 10px}
.bz-info-cell i{display:block;font-style:normal;font-size:10.5px;color:#8b8172}
.bz-info-cell .bz-info-v{display:block;margin-top:2px;font-size:13.5px;font-weight:700;color:#3a352c}
.bz-linkwrap{margin:10px 0;background:#faf6ee;border:1px solid #e7ddc9;border-radius:11px;padding:10px}
.bz-linksvg{width:100%;height:auto;display:block}
.bz-legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;font-size:11px;color:#8b8172}
.bz-legend span{display:inline-flex;align-items:center;gap:4px}
.bz-legend i{width:12px;height:2px;display:inline-block}
.bz-el{margin:10px 0}
.bz-elbar{display:flex;height:20px;border-radius:10px;overflow:hidden;background:#faf6ee;border:1px solid #e7ddc9}
.bz-seg{display:flex;align-items:center;justify-content:center}
.bz-seg i{font-style:normal;font-size:10px;color:#fff;font-weight:600}
.bz-elnote{font-size:11px;color:#8b8172;margin-top:4px}
.bz-concl{background:#faf6ee;border:1px solid #e5dbc7;border-radius:10px;padding:10px 12px;margin:10px 0}
.bz-concl-row{display:flex;gap:8px;padding:4px 0;border-bottom:1px dashed #e7ddc9;font-size:12px;align-items:baseline}
.bz-concl-row:last-child{border-bottom:0}
.bz-concl-row .k{width:56px;flex:0 0 56px;color:#8b8172;font-size:11.5px}
.bz-concl-row .v{flex:1;min-width:0;line-height:1.6}
.bz-score{display:inline-block;width:100px;height:7px;border-radius:4px;background:#efe8d8;overflow:hidden;vertical-align:middle}
.bz-score i{display:block;height:100%}
.bz-cg2{background:#fffdf9;border:1px solid #e5dbc7;border-radius:11px;padding:12px 14px;margin:10px 0}
.bz-cg2-top{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.bz-cg2-total{font-family:"Noto Serif SC",serif;font-size:22px;font-weight:800;color:#9a7720}
.bz-cg2-bar{flex:1;height:8px}
.bz-cg2-parts{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.bz-cg2-part{display:inline-flex;align-items:center;gap:5px;background:#faf6ee;border:1px solid #e7ddc9;border-radius:6px;padding:3px 8px;font-size:12px}
.bz-cg2-part i{font-style:normal;color:#8b8172}
.bz-cg2-part em{font-style:normal;color:#b0812b;font-weight:600}
.bz-cg2-verse{font-family:"Noto Serif SC",serif;font-size:16px;font-weight:700;color:#9a7720;line-height:1.75;background:#faf4e4;border-left:3px solid #b0812b;border-radius:0 8px 8px 0;padding:8px 12px}
.bz-cg2-brief{margin-top:8px;background:#faf6ee;border-radius:8px;padding:8px 10px}
.bz-cg2-brief-h{font-size:11.5px;font-weight:700;color:#6b5640;margin-bottom:4px}
.bz-cg2-gist{margin:0;font-size:12.5px;line-height:1.7}
.bz-cg2-pts{margin:6px 0 0;padding-left:16px;font-size:12px;line-height:1.65}
.bz-cg2-note{font-size:10.5px;color:#8b8172;margin-top:6px}
.bz-drill-hint{font-size:10.5px;color:#8b8172;margin-top:6px}
.bz-lym-bar{flex:1 1 100%;width:100%;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;margin-top:8px;padding:7px;background:#f6f1e6;border:1px solid #e7ddc9;border-radius:8px}
.bz-lym-head{grid-column:1/-1;font-size:11px;font-weight:600;color:#6b5640;padding-bottom:2px;border-bottom:1px dashed #e7ddc9}
.bz-lym{display:flex;flex-direction:column;align-items:center;background:#fffdf8;border:1px solid #e7ddc9;border-radius:6px;padding:3px 2px;cursor:pointer}
.bz-lym em{font-style:normal;font-size:8.5px;color:#8b8172}
.bz-lym b{font-family:"Noto Serif SC",serif;font-size:13px;font-weight:700}
.bz-lym i{font-style:normal;font-size:8.5px;color:#6b5640}
.bz-lym.on{border-color:#b0812b;background:#f3e8cf}
.bz-lri-grid{flex:1 1 100%;width:100%;margin-top:6px;padding:7px;background:#faf6ee;border:1px solid #e7ddc9;border-radius:8px}
.bz-lri-head{font-size:10.5px;color:#8b8172;margin-bottom:5px}
.bz-lri-cells{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:3px}
.bz-lri{display:flex;flex-direction:column;align-items:center;background:#fffdf8;border:1px solid #e7ddc9;border-radius:6px;padding:2px;font-size:11px;font-weight:600}
.bz-lri em,.bz-lri i{font-style:normal;font-size:8px;color:#8b8172}

@media (max-width:640px){
  .bz-head{padding:10px}
  .bz-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
  .bz-subtabs label{font-size:11.5px;padding:5px 8px}
  .bz-matrix th,.bz-matrix td{padding:5px 2px;font-size:11px}
  .bz-matrix td:first-child,.bz-matrix th:first-child{width:40px;font-size:10px}
  .bz-big{font-size:21px}
  .bz-cg{font-size:11.5px}
  .bz-cg i{font-size:9px}
  .bz-six-col b{font-size:14.5px}
  .bz-six-col i,.bz-six-col em{font-size:8.5px}
}
`;

export default renderBazi;
