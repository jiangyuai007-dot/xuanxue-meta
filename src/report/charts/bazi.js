/**
 * 八字专业排盘 —— 产品级规格
 *
 * 结构（自上而下）：
 *  ① 案例抬头      姓名/性别/四柱一句式命式
 *  ② 命主信息密表  阳历·阴历·真太阳时·经度·节气·胎元·命宫·身宫·命卦·旬空
 *  ③ 干支矩阵表    行=属性（十神/天干/地支/藏干/藏干十神/自坐/长生/纳音）列=四柱
 *  ④ 干支关系行    逐条列出，并附起法依据
 *  ⑤ 四柱连线图    SVG 动态绘制冲合刑害会
 *  ⑥ 五行分布     含藏干加权的堆叠条
 *  ⑦ 结论面板      日主/强弱/格局/喜忌/当前运
 *  ⑧ 神煞表       按吉凶分组
 *  ⑨ 三轨时间矩阵  大运（含十年流年逐年对齐）
 *
 * 铁律：只呈现事实包已有数据，不产生新的命理判断。
 */

import { GAN_WX, ZHI_WX, WX_COLOR, WX_BG, wxOf, esc, list, scoped } from './shared.js';
import { GAN, ZHI, GAN_WUXING, ganzhiOfIndex, shishen, indexOfGanzhi, cangganOf } from '../../core/ganzhi.js';
import { solarTerm } from '../../core/astro.js';
import { chengguBrief } from '../../interpret/chengguDetail.js';
import { jdnToYmd } from '../../core/julian.js';
import { SHENSHA_RULES } from '../../core/shensha.js';

const KEYS = ['year', 'month', 'day', 'hour'];
const POS_LABEL = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' };
const POS_SHORT = { year: '年', month: '月', day: '日', hour: '时' };
const REL_LABEL = {
  he: '合', chong: '冲', xing: '刑', hai: '害', po: '破',
  sanhe: '三合', banhe: '半合', gongju: '拱局', sanhui: '三会',
};
const REL_COLOR = {
  he: '#b0812b', banhe: '#b0812b', gongju: '#c9a961', chong: '#b3392c',
  xing: '#6b5640', hai: '#8b8172', po: '#8b8172', sanhe: '#2f7d52', sanhui: '#2f7d52',
};

const yearGanzhi = (y) => {
  const i = ((y - 4) % 60 + 60) % 60;
  return ganzhiOfIndex(i);
};

// ============================================================ 片段

function headerRow(f, input) {
  const p = f.fourPillars;
  const gender = input?.gender === 'female' ? '女命' : '男命';
  const solar = input ? `${input.year}年${input.month}月${input.day}日 ${String(input.hour ?? 0).padStart(2, '0')}:${String(input.minute ?? 0).padStart(2, '0')}` : '';
  const lunarText = f.lunar
    ? `${f.lunar.yearGanzhi}年 ${f.lunar.zodiac} ${f.lunar.monthName}${f.lunar.isLeap ? '（闰）' : ''}${f.lunar.dayName}`
    : '';
  const xk = list(f.xunkong);
  // 四柱抬头：每柱一张竖排大字卡（柱名 → 天干 → 地支 → 十神 → 空亡），日柱高亮
  return `<div class="bz-head">
    <div class="bz-title">
      <span class="bz-name">${esc(input?.name || '命主案例')}</span>
      <span class="bz-tagline">${gender}　${esc(solar)}</span>
      <span class="bz-tagline">农历：${esc(lunarText) || '—'}</span>
    </div>
    <div class="bz-ming">
      ${KEYS.map((k) => {
    const onVoid = xk.includes(p[k].zhi);
    return `<div class="bz-pillar${k === 'day' ? ' day' : ''}">
          <i class="pl-name">${POS_LABEL[k]}${k === 'day' ? ' · 日元' : ''}</i>
          <b class="pl-gz" style="color:${wxOf(p[k].gan)}">${p[k].gan}</b>
          <b class="pl-gz" style="color:${wxOf(p[k].zhi)}">${p[k].zhi}</b>
          <i class="pl-ss">${k === 'day' ? '我' : esc(p[k].shishen || '—')}</i>
          <em class="${onVoid ? 'on' : ''}" title="${onVoid ? `此柱地支落旬空（旬空：${esc(xk.join('、'))}），力量减弱` : '未落空亡'}">${onVoid ? '空亡' : '·'}</em>
        </div>`;
  }).join('')}
    </div>
  </div>
  <div class="bz-lunar">旬空：${esc(xk.join('、')) || '—'}${list(f.xunkongPositions).length ? `（${esc(f.xunkongPositions.join('、'))}落空）` : ''}</div>`;
}

/** 干支样值按五行着色（值恰为「干+支」两字时） */
function gzColored(v) {
  const s = String(v ?? '');
  if (s.length === 2 && GAN_WX[s[0]] && (ZHI_WX[s[1]] || GAN_WX[s[1]])) {
    return `<b style="color:${wxOf(s[0])}">${esc(s[0])}</b><b style="color:${wxOf(s[1])}">${esc(s[1])}</b>`;
  }
  return `<b>${esc(v)}</b>`;
}

/** 十二辟卦节气五行（四立分季，季末土寄从简按当季） */
const TERM_EL = {
  立春: '木', 雨水: '木', 惊蛰: '木', 春分: '木', 清明: '木', 谷雨: '木',
  立夏: '火', 小满: '火', 芒种: '火', 夏至: '火', 小暑: '火', 大暑: '火',
  立秋: '金', 处暑: '金', 白露: '金', 秋分: '金', 寒露: '金', 霜降: '金',
  立冬: '水', 小雪: '水', 大雪: '水', 冬至: '水', 小寒: '水', 大寒: '水',
};
/** 纳音尾字即五行（路旁土→土、白蜡金→金、泉中水→水、杨柳木→木、炉中火→火） */
const WX_SET = new Set(['金', '木', '水', '火', '土']);
const naEl = (nayin) => { const c = String(nayin || '').slice(-1); return WX_SET.has(c) ? c : ''; };

/** 东四命统一墨绿、西四命统一赤金（八宅派惯例，不再跟随卦的五行走） */
const MINGGUA_COLOR = { 东四命: '#2f7d52', 西四命: '#c9a227' };

/** 信息区值着色：节气/纳音按五行标色，命卦按东四/西四命分色，月令与生肖一律留黑 */
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
    // 形如「坎卦·东四命」：按命卦所属东/西四命统一上色
    const g = s.includes('东四命') ? '东四命' : s.includes('西四命') ? '西四命' : '';
    if (g) return `<b style="color:${MINGGUA_COLOR[g]}">${esc(s)}</b>`;
    return `<b>${esc(s)}</b>`;
  }
  if (key === '月令') {
    // 形如「巳月（第 4 序）」：月令只表序号，不加五行色（用户要求一律留黑）
    return `<b>${esc(s)}</b>`;
  }
  if (key === '旬空') {
    // 逐个地支按五行标色
    return `<b>${[...s].map((ch) => (ZHI_WX[ch]
      ? `<span style="color:${WX_COLOR[ZHI_WX[ch]]}">${esc(ch)}</span>`
      : esc(ch))).join('')}</b>`;
  }
  return gzColored(v);
}

function infoTable(f) {
  const t = f.time || {};
  // 命宫/身宫/命卦/旬空原来套一圈金框做高亮，四色并排太吵 → 一律走普通卡片底
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
    {
      label: '宫位', render: (k) => `<span class="bz-pal">${esc((f.palaces?.[k]?.name) || '')}</span>`,
    },
    {
      label: '十神', render: (k) => `<span class="bz-ss">${k === 'day' ? '日主·我' : esc(p[k].shishen)}</span>`,
    },
    {
      label: '天干', render: (k) => `<span class="bz-big" style="color:${wxOf(p[k].gan)}">${p[k].gan}</span>`,
    },
    {
      label: '地支', render: (k) => `<span class="bz-big" style="color:${wxOf(p[k].zhi)}">${p[k].zhi}</span>`,
    },
    {
      // 空亡：与四柱同列严格对齐（落空者标红）
      label: '空亡',
      render: (k) => {
        const on = list(f.xunkong).includes(p[k].zhi);
        return on
          ? `<span class="bz-kw" title="旬空${esc(list(f.xunkong).join('、'))}：此柱地支落空，力量减弱">空亡</span>`
          : '<span class="bz-none">—</span>';
      },
    },
    {
      label: '藏干',
      render: (k) => list(p[k].canggan).map((c) =>
        `<span class="bz-cg" style="color:${wxOf(c.gan)}">${c.gan}<i>${(c.type || '').slice(0, 1)}</i></span>`).join('') || '<span class="bz-none">—</span>',
    },
    {
      label: '藏干十神',
      render: (k) => `<span class="bz-mid">${list(p[k].canggan).map((c) => esc(c.shishen)).join(' ') || '—'}</span>`,
    },
    {
      label: '自坐', render: (k) => `<span class="bz-mid">${esc(f.zizuo?.[k]?.state || '—')}</span>`,
    },
    {
      label: '长生', render: (k) => {
        const st = f.changsheng?.[k]?.state || '—';
        return `<span class="bz-mid bz-cs">${esc(st)}</span>`;
      },
    },
    {
      label: '纳音', render: (k) => `<span class="bz-na">${esc(p[k].nayin)}</span>`,
    },
  ];

  const head = KEYS.map((k) => `<th>${POS_LABEL[k]}</th>`).join('');
  const body = rows.map((r) =>
    `<tr><td class="bz-rowlabel">${r.label}</td>${KEYS.map((k) => `<td>${r.render(k)}</td>`).join('')}</tr>`).join('');

  return `<div class="bz-mscroll"><table class="bz-matrix"><thead><tr><th class="bz-rowlabel"></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
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

/** 地支本气十神：取地支藏干本气，按日主定十神（用于大运/流年双十神显示） */
const zhiBenShishen = (dayGanIndex, zhiIndex) => {
  const cg = cangganOf(zhiIndex, dayGanIndex);
  return cg.length ? (cg[0].shishen || '') : '';
};

/** 五虎遁：年干索引 -> 寅月天干索引（流月干支用） */
const WU_HU_DUN = { 0: 2, 5: 2, 1: 4, 6: 4, 2: 6, 7: 6, 3: 8, 8: 8, 4: 0, 9: 0 };

/**
 * 流年 Y 的十二流月数据（以「节」为界，寅月起）：
 * 返回 [[月干支序, 起始公历年, 月, 日, 天数] × 12]，供前端流月/流日下钻。
 */
function liuyueData(Y, tz = 8) {
  const JIE = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 0, 2]; // 寅..丑各月之交节 + 次年立春
  const days = JIE.map((idx, i) => {
    const yy = (i === 12 || idx === 0) ? Y + 1 : Y;
    return Math.floor(solarTerm(yy, idx).jdUtc + tz / 24 + 0.5); // 当地民用日号（UTC+8 基准）
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

/** 称骨卡：骨重拆解 + 称骨歌诀 + 免费白话导读 */
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
    <div class="bz-cg2-note">${esc(cg.note)} · 民俗文化参考 　｜　 九维白话详解（性格·事业·财运·感情·六亲·健康·人生节奏）见解读报告《称骨算命·白话详解》章节（¥0.99）</div>
  </div>`;
}

/** 四柱连线图：天干一排在上、地支一排在下；天干关系画上弧，地支关系画下弧；下方内嵌大运流年块 */
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

  // 上弧：天干关系（五合 / 四冲）
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

  // 下弧：地支关系（合会 / 冲刑害破）
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
    <div class="bz-elnote">五行占比含藏干加权（本气 1.0 / 中气 0.6 / 余气 0.3）</div>
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
  const favTags = list(ys.favorable).map((e) => `<b style="color:${WX_COLOR[e]}">${e}</b>`).join('');
  const unfavTags = list(ys.unfavorable).map((e) => `<s style="color:#8b8172">${e}</s>`).join('');

  return `<div class="bz-concl">
    <div class="bz-concl-row">
      <span class="k">日主</span>
      <span class="v"><b style="color:${wxOf(dm.gan)};font-size:19px">${dm.gan}</b> · ${dm.element}${dm.yang ? '（阳）' : '（阴）'}</span>
    </div>
    <div class="bz-concl-row">
      <span class="k">强弱</span>
      <span class="v">
        <span class="bz-score"><i style="width:${st.score || 0}%;background:${(st.score || 0) >= 58 ? '#b0812b' : (st.score || 0) >= 42 ? '#2f7d52' : '#4a7d95'}"></i></span>
        <b>${st.score || 0}</b> · ${esc(st.level || '—')}
      </span>
    </div>
    <div class="bz-concl-row"><span class="k">格局</span><span class="v">${esc(f.pattern?.name || '—')}</span></div>
    <div class="bz-concl-row"><span class="k">强弱依据</span><span class="v sm">${esc(list(st.basis).join('；') || '—')}</span></div>
    <div class="bz-concl-row"><span class="k">格局依据</span><span class="v sm">${esc(f.pattern?.basis || '—')}</span></div>
    <div class="bz-concl-row"><span class="k">五行喜忌</span><span class="v">喜 ${favTags}　忌 ${unfavTags}</span></div>
    <div class="bz-concl-row"><span class="k">用神依据</span><span class="v sm">${esc(ys.basis || '—')}</span></div>
    ${cur ? `<div class="bz-concl-row"><span class="k">当前大运</span><span class="v">${cur.startAge}–${cur.startAge + 9} 岁 <b>${cur.name}</b>（${esc(cur.shishen)}）· ${cur.fromYear}–${cur.toYear}</span></div>` : ''}
    <div class="bz-concl-row"><span class="k">起运</span><span class="v sm">${esc(dy.basis || '—')}</span></div>
  </div>`;
}

function shenshaTable(f) {
  const all = list(f.shensha);
  if (!all.length) return '';
  // 按年/月/日/时分层归类（宫位自上而下），吉凶用颜色＋文字徽标双重标注
  const CAT_LABEL = { 吉: '吉', 中: '中', 凶: '凶' };
  const ORDER4 = [
    ['年', '年柱（祖上·早年）'],
    ['月', '月柱（父母·兄弟）'],
    ['日', '日柱（自身·配偶）'],
    ['时', '时柱（子女·晚景）'],
    ['命', '命局全局'],
  ];
  const posOf = (x) => (x.position || '命局').charAt(0) === '命' ? '命' : (x.position || '').charAt(0);
  const blocks = ORDER4.map(([key, title]) => {
    const items = all.filter((x) => posOf(x) === key);
    if (!items.length) return '';
    return `<div class="bz-ss-block">
      <span class="bz-ss-pos">${esc(title)}</span>
      <div class="bz-ss-grid">
        ${items.map((x) => `<span class="bz-ss-item" title="【起法依据·${esc(x.by || '')}】${esc(x.source || '')}">
          <b>${esc(x.name)}</b><i>${esc(x.position || '')}</i>
          <em class="bz-ss-badge bd-${x.cat === '吉' ? 'j' : x.cat === '凶' ? 'x' : 'z'}">${CAT_LABEL[x.cat] || '中'}</em>
          <em class="bz-ss-desc">${esc(x.desc || x.note || '')}</em>
        </span>`).join('')}
      </div>
    </div>`;
  }).join('');
  const hitNames = new Set(all.map((x) => x.name));
  const libRows = SHENSHA_RULES.map((r) => {
    const on = hitNames.has(r.name);
    return `<span class="bz-ss-lib${on ? ' on' : ''}" title="【起法依据·${esc(r.by || '')}】${esc(r.source || '')}　${esc(r.desc || '')}">${esc(r.name)}</span>`;
  }).join('');
  return `<div class="bz-shensha">
    <div class="bz-link-title">神煞（按柱分层 · 本盘命中 ${all.length} 项 · 规则库 ${SHENSHA_RULES.length} 项 · 徽标颜色区分吉凶）</div>
    ${blocks}
    <details class="bz-ss-all">
      <summary>核对规则库全部 ${SHENSHA_RULES.length} 项（亮色＝本盘已命中，浅色＝未命中）</summary>
      <div class="bz-ss-libgrid">${libRows}</div>
    </details>
  </div>`;
}

/** 大运：点击切换（纯 CSS radio 实现），流年可再点出流月、流月点出流日（见 web/bazi-drill.js） */
function timeTrack(f) {
  const steps = list(f.dayun?.steps);
  if (!steps.length) return '';
  const nowYear = new Date().getFullYear();
  const dmGan = f.fourPillars.day.ganIndex;
  const tz = f.time?.tzOffset ?? 8;
  const curIdx = Math.max(0, steps.findIndex((s) => nowYear >= s.fromYear && nowYear <= s.toYear));

  const radios = steps.map((s, i) =>
    `<input type="radio" name="bzdy" class="bz-dy-r" id="bzdy${i}"${i === curIdx ? ' checked' : ''}>`).join('');

  const tabs = `<div class="bz-dy-tabs" role="tablist">` + steps.map((s, i) => {
    const active = i === curIdx;
    return `<label for="bzdy${i}" class="bz-dy-chip${active ? ' on' : ''}" title="${s.fromYear}–${s.toYear} 年　天干${esc(s.shishen)}·支本气${esc(zhiBenShishen(dmGan, s.zhiIndex))}">
      <em>${s.startAge}<i>–</i>${s.startAge + 9}</em>
      <b style="color:${wxOf(s.gan)}">${s.name}</b>
      <span class="bz-ss-pair">${esc(s.shishen)}<i>${esc(zhiBenShishen(dmGan, s.zhiIndex))}</i></span>
    </label>`;
  }).join('') + '</div>';

  const panels = steps.map((s, i) => {
    const years = [];
    for (let y = s.fromYear; y <= s.toYear; y++) {
      const gz = yearGanzhi(y);
      const sShi = shishen(dmGan, gz.ganIndex);
      const zShi = zhiBenShishen(dmGan, gz.zhiIndex);
      const mData = liuyueData(y, tz);
      years.push(`<span class="bz-ly${y === nowYear ? ' now' : ''}" data-m="${esc(JSON.stringify(mData))}" title="${y} 年 ${gz.name}　点击展开流月／流日">
        <em>${y}</em>${gz.name}<i>${sShi}${zShi}</i><u>▾</u></span>`);
    }
    const impacts = list(s.impact?.all);
    return `<div class="bz-dy-panel bz-dy-p${i}">
      <div class="bz-step-head">
        <span class="bz-step-age">${s.startAge}–${s.startAge + 9} 岁</span>
        <span class="bz-step-gz" style="color:${wxOf(s.gan)}">${s.name}</span>
        <span class="bz-step-ss">${esc(s.shishen)}</span>
        <span class="bz-step-year">${s.fromYear}–${s.toYear} 年</span>
        ${impacts.length ? `<span class="bz-step-hit" title="${esc(impacts.map((x) => x.name).join('、'))}">与命局互动 ${impacts.length} 项</span>` : ''}
      </div>
      <div class="bz-step-ly">${years.join('')}</div>
      <div class="bz-drill-hint">点流年 → 十二流月　·　点流月 → 逐日干支（再点收起）</div>
    </div>`;
  }).join('');

  // 每一步运一对 :checked 规则（选中 → 高亮 tab + 显示面板）
  const dynCss = steps.map((s, i) =>
    `#bzdy${i}:checked~.bz-dy-tabs label[for="bzdy${i}"]{border-color:#b0812b;background:#f3e8cf;box-shadow:0 1px 6px rgba(80,60,30,.18)}
#bzdy${i}:checked~.bz-dy-p${i}{display:block}`).join('\n');

  return `<div class="bz-track" data-dm="${dmGan}">
    <style class="bz-dy-style">${dynCss}</style>
    ${radios}
    <div class="bz-link-title">大运 · 点击切换查看十年流年（默认展开当前运，当前年高亮）</div>
    ${tabs}
    ${panels}
  </div>`;
}

// ============================================================ 主入口

export function renderBazi(factPack) {
  const f = factPack.facts;
  const input = factPack.input || {};

  const html = `<div class="bz">
    ${headerRow(f, input)}
    ${infoTable(f)}
    ${matrixTable(f)}
    ${timeTrack(f)}
    ${relationsRow(f)}
    ${linkChart(f)}
    ${elementBar(f)}
    ${conclusionPanel(f)}
    ${chengGuCard(f)}
    ${shenshaTable(f)}
  </div>`;

  return scoped('bz', CSS, html);
}

// ============================================================ 样式

const CSS = `
.bz{max-width:840px;margin:0 auto;color:#3a352c;font-family:"PingFang SC","Microsoft YaHei",sans-serif}
.bz *{box-sizing:border-box}
/* —— 抬头：左侧文字、右侧四柱竖排大字卡 —— */
.bz-head{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;padding-bottom:14px;border-bottom:2px solid #e7ddc9}
.bz-title{display:flex;flex-direction:column;gap:4px}
.bz-name{font-family:"Noto Serif SC",serif;font-size:22px;font-weight:700;color:#2f2a22;letter-spacing:2px}
.bz-tagline{font-size:12.5px;color:#8b8172;letter-spacing:.5px}
.bz-ming{display:flex;gap:12px;align-items:stretch}
.bz-pillar{display:flex;flex-direction:column;align-items:center;gap:2px;
  background:#fffdf8;border:1px solid #d8cba9;border-radius:12px;padding:10px 17px 8px;min-width:96px}
.bz-pillar.day{background:#f3e8cf;border-color:#c9a961;box-shadow:0 2px 12px rgba(80,60,30,.18)}
.bz-pillar .pl-name{font-style:normal;font-size:11px;color:#8b8172;letter-spacing:3px;line-height:1.6;white-space:nowrap}
.bz-pillar .pl-gz{font-family:"Noto Serif SC",serif;font-size:40px;font-weight:800;line-height:1.22}
.bz-pillar .pl-ss{font-style:normal;font-size:11.5px;color:#6b5640;line-height:1.6;white-space:nowrap}
.bz-pillar em{font-style:normal;font-size:10px;line-height:1.8;color:#8b8172}
.bz-pillar em.on{color:#b3392c;font-weight:700;border:1px solid #ecc8b8;background:#fbeae7;border-radius:3px;padding:0 5px}
.bz-lunar{font-size:12.5px;color:#8b8172;margin:9px 0 14px}
/* —— 命主信息卡 —— */
.bz-info{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:9px;margin-bottom:18px}
.bz-info-cell{background:#faf6ee;border:1px solid #e7ddc9;border-radius:12px;padding:9px 12px}
.bz-info-cell i{display:block;font-style:normal;font-size:11px;color:#8b8172;letter-spacing:1px}
.bz-info-cell .bz-info-v{display:block;margin-top:3px;font-size:15px;font-weight:700;color:#3a352c;line-height:1.5}
.bz-info-cell .bz-info-v b{font-weight:inherit}
.bz-matrix{width:100%;border-collapse:collapse;margin-bottom:6px;table-layout:fixed}
.bz-matrix th,.bz-matrix td{border:1px solid #e7ddc9;padding:8px 4px;text-align:center;font-size:12px;background:#fffdf8}
.bz-matrix th{background:#f6f1e6;font-weight:600;color:#8b8172;font-size:12px;letter-spacing:1px}
.bz-matrix td:first-child,.bz-matrix th:first-child{width:74px}
.bz-rowlabel{background:#f6f1e6;color:#8b8172;font-size:11px;font-weight:600;letter-spacing:1px}
.bz-pal{font-size:11px;color:#b0812b;background:#f3e8cf;border-radius:4px;padding:1px 5px}
.bz-ss{font-size:12px;color:#6b5640}
.bz-big{font-family:"Noto Serif SC",serif;font-size:26px;font-weight:800;line-height:1.1}
.bz-cg{font-family:"Noto Serif SC",serif;font-size:14px;font-weight:600;margin:0 3px;display:inline-block}
.bz-cg i{font-style:normal;font-size:9px;color:#8b8172;margin-left:1px}
.bz-mid{font-size:12px;color:#6b5640}
.bz-cs{color:#2f7d52}
.bz-na{font-size:11px;color:#8b8172;letter-spacing:1px}
.bz-none{color:#ccc}
.bz-rel{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0 4px}
.bz-rel-chip{display:inline-flex;align-items:center;gap:5px;background:#faf6ee;border:1px solid #e7ddc9;border-radius:8px;padding:3px 8px;font-size:11px;cursor:help}
.bz-rel-chip em{font-style:normal;color:#fff;border-radius:3px;padding:0 4px;font-size:10px;font-weight:700}
.bz-rel-chip b{color:#3a352c;font-weight:600}
.bz-rel-chip i{font-style:normal;color:#8b8172}
.bz-rel-empty{font-size:12px;color:#8b8172;padding:8px 0}
.bz-linkwrap{margin:14px 0 6px;background:#faf6ee;border:1px solid #e7ddc9;border-radius:12px;padding:12px}
.bz-link-title{font-size:12px;font-weight:600;color:#8b8172;letter-spacing:1px;margin-bottom:8px}
.bz-linksvg{width:100%;height:auto;display:block}
.bz-legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:11px;color:#8b8172}
.bz-legend span{display:inline-flex;align-items:center;gap:4px}
.bz-legend i{width:14px;height:2px;border-radius:1px;display:inline-block}
.bz-legend-note{color:#8b8172}
.bz-el{margin:16px 0}
.bz-elbar{display:flex;height:22px;border-radius:12px;overflow:hidden;background:#faf6ee;border:1px solid #e7ddc9}
.bz-seg{display:flex;align-items:center;justify-content:center;transition:width .3s}
.bz-seg i{font-style:normal;font-size:10px;color:#fff;font-weight:600;text-shadow:0 1px 2px rgba(0,0,0,.2)}
.bz-elnote{font-size:11px;color:#8b8172;margin-top:5px}
.bz-concl{background:linear-gradient(180deg,#fffdf8,#faf6ee);border:1px solid #e7ddc9;border-radius:12px;padding:14px 16px;margin:16px 0}
.bz-concl-row{display:flex;gap:10px;padding:5px 0;border-bottom:1px dashed #e7ddc9;font-size:13px;align-items:center;flex-wrap:wrap}
.bz-concl-row:last-child{border-bottom:0}
.bz-concl-row .k{width:64px;flex:0 0 auto;color:#8b8172;font-size:12px}
.bz-concl-row .v{flex:1;min-width:0;line-height:1.7}
.bz-concl-row .v.sm{font-size:11.5px;color:#8b8172}
.bz-score{display:inline-block;width:120px;height:7px;border-radius:4px;background:#faf6ee;overflow:hidden;vertical-align:middle;margin-right:6px}
.bz-score i{display:block;height:100%;border-radius:4px}
.bz-concl-row s{text-decoration:line-through}
.bz-shensha{margin:16px 0}
.bz-ss-block{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}
.bz-ss-pos{font-size:11px;font-weight:700;border-radius:4px;padding:3px 0;width:118px;text-align:center;flex:0 0 118px;margin-top:2px;
  background:#faf6ee;color:#8b8172;border:1px solid #e7ddc9;letter-spacing:1px}
.bz-ss-badge{font-style:normal;flex:0 0 auto;font-size:10px;font-weight:700;border-radius:3px;padding:1px 5px;line-height:1.5}
.bd-j{background:#e9f1ec;color:#2f7d52;border:1px solid #e9f1ec}
.bd-x{background:#fbeae7;color:#b3392c;border:1px solid #f0d3cc}
.bd-z{background:#faf6ee;color:#8b8172;border:1px solid #e7ddc9}
.bz-ss-desc{font-style:normal;flex:1;min-width:0}
.bz-ss-grid{flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(226px,1fr));gap:6px;min-width:0}
.bz-ss-item{display:flex;flex-direction:column;gap:1px;background:#fffdf8;border:1px solid #e7ddc9;border-radius:8px;padding:5px 9px;min-width:0}
.bz-ss-top{display:flex;align-items:center;gap:6px;min-width:0}
.bz-ss-top b{font-size:12.5px;font-weight:700;color:#3a352c;cursor:help;white-space:nowrap}
.bz-ss-top i{font-style:normal;font-size:10px;color:#b0812b;cursor:help;white-space:nowrap}
.bz-ss-top .bz-ss-badge{margin-left:auto}
.bz-ss-item b{font-size:12.5px;font-weight:700;color:#3a352c;cursor:help}
.bz-ss-item i{font-style:normal;font-size:10px;color:#b0812b;cursor:help}
.bz-ss-item em{font-style:normal;font-size:10.5px;color:#8b8172;line-height:1.55}
.bz-ss-all{margin-top:10px}
.bz-ss-all summary{cursor:pointer;font-size:11.5px;color:#8b8172;padding:3px 0;user-select:none}
.bz-ss-all summary:hover{color:#5b5240}
.bz-ss-libgrid{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}
.bz-ss-lib{font-size:10.5px;background:#faf6ee;border:1px solid #e7ddc9;color:#8b8172;border-radius:4px;padding:2px 6px;cursor:help}
.bz-ss-lib.on{background:#f3e8cf;border-color:#d8cba9;color:#9a7720;font-weight:700}
.bz-track{margin:16px 0 4px}
.bz-dy-r{position:absolute;opacity:0;pointer-events:none;width:0;height:0}
.bz-link-sub{font-weight:400;color:#8b8172;margin-left:8px;letter-spacing:0}
.bz-dy-tabs{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:10px}
.bz-dy-chip{display:flex;flex-direction:column;align-items:center;gap:1px;background:#fffdf8;border:1px solid #e7ddc9;border-radius:12px;padding:6px 10px 5px;cursor:pointer;min-width:62px;transition:all .15s;user-select:none}
.bz-dy-chip:hover{border-color:#d8cba9}
.bz-dy-chip em{font-style:normal;font-size:10px;color:#8b8172}
.bz-dy-chip em i{font-style:normal;margin:0 1px}
.bz-dy-chip b{font-family:"Noto Serif SC",serif;font-size:17px;font-weight:700;line-height:1.2}
.bz-dy-chip span{font-size:10px;color:#6b5640}
.bz-dy-panel{display:none;border:1px solid #e7ddc9;border-radius:12px;padding:10px 12px;background:#fffdf8}
.bz-step-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px}
.bz-step-age{font-size:11px;color:#8b8172}
.bz-step-gz{font-family:"Noto Serif SC",serif;font-size:18px;font-weight:700}
.bz-step-ss{font-size:11px;color:#6b5640}
.bz-step-year{font-size:11px;color:#8b8172}
.bz-step-hit{font-size:10px;color:#fff;background:#2f7d52;border-radius:4px;padding:1px 6px;cursor:help}
.bz-step-ly{display:flex;flex-wrap:wrap;gap:4px}
.bz-ly{display:flex;flex-direction:column;align-items:center;background:#f6f1e6;border:1px solid #e7ddc9;border-radius:8px;padding:5px 6px;font-size:13px;min-width:54px;line-height:1.4;cursor:pointer}
.bz-ly em{font-style:normal;font-size:9px;color:#8b8172}
.bz-ly i{font-style:normal;font-size:9px;color:#b0812b}
.bz-ly.now{background:#2f7d52;border-color:#2f7d52}
.bz-ly.now em,.bz-ly.now i{color:#cfe0d8}
.bz-ly.now{color:#f3efe4}
.bz-ly u{font-style:normal;text-decoration:none;font-size:8px;color:#8b8172;line-height:1}
.bz-ly.now u{color:#cfe0d8}
.bz-ly.on{border-color:#b0812b;background:#f3e8cf;box-shadow:0 1px 6px rgba(80,60,30,.18)}
.bz-ly.on em,.bz-ly.on u{color:#9a7720}
.bz-ly.now.on{background:#2f7d52}
/* —— 称骨卡 —— */
.bz-cg2{background:linear-gradient(180deg,#fffdf8,#fbf6ea);border:1px solid #e7ddc9;border-radius:12px;padding:14px 16px;margin:16px 0}
.bz-cg2-top{display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}
.bz-cg2-total{font-family:"Noto Serif SC",serif;font-size:27px;font-weight:800;color:#9a7720;letter-spacing:2px}
.bz-cg2-bar{flex:1;min-width:120px;height:8px;margin:0}
.bz-cg2-parts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.bz-cg2-part{display:inline-flex;align-items:center;gap:6px;background:#faf6ee;border:1px solid #e7ddc9;border-radius:8px;padding:4px 10px}
.bz-cg2-part i{font-style:normal;font-size:11px;color:#8b8172}
.bz-cg2-part b{font-size:13px;color:#3a352c}
.bz-cg2-part em{font-style:normal;font-size:12px;color:#b0812b;font-weight:600}
.bz-cg2-verse{font-family:"Noto Serif SC",serif;font-size:19px;font-weight:800;color:#9a7720;line-height:1.9;letter-spacing:1px;
  background:linear-gradient(90deg,#f3e8cf,#faf6ee);border-left:4px solid #b0812b;border-radius:0 12px 12px 0;padding:10px 14px;margin-top:4px}
.bz-cg2-brief{margin-top:10px;background:#fffdf8;border:1px solid #e7ddc9;border-radius:12px;padding:10px 13px}
.bz-cg2-brief-h{font-size:12px;font-weight:700;color:#6b5640;letter-spacing:1.5px;margin-bottom:5px}
.bz-cg2-gist{margin:0;font-size:13.5px;line-height:1.85;color:#4a4034}
.bz-cg2-pts{margin:8px 0 0;padding-left:17px}
.bz-cg2-pts li{font-size:13px;line-height:1.8;color:#5a4f40;margin-bottom:2px}
.bz-cg2-note{font-size:10.5px;color:#8b8172;margin-top:8px}
/* —— 流月 / 流日下钻（网格对齐 · 独占整行 · 不溢出） —— */
.bz-drill-hint{font-size:10.5px;color:#8b8172;margin-top:8px}
.bz-lym-bar{flex:1 1 100%;width:100%;display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:5px;margin-top:9px;padding:9px;background:#f6f1e6;border:1px solid #e7ddc9;border-radius:8px;box-sizing:border-box}
.bz-lym-head{grid-column:1/-1;font-size:11px;font-weight:600;color:#6b5640;letter-spacing:1px;padding-bottom:2px;border-bottom:1px dashed #e7ddc9}
.bz-lym{display:flex;flex-direction:column;align-items:center;gap:1px;background:#fffdf8;border:1px solid #e7ddc9;border-radius:8px;padding:4px 4px;min-width:0;cursor:pointer;user-select:none}
.bz-lym:hover{border-color:#d8cba9}
.bz-lym em{font-style:normal;font-size:9px;color:#8b8172;white-space:nowrap}
.bz-lym b{font-family:"Noto Serif SC",serif;font-size:14px;font-weight:700;line-height:1.2;white-space:nowrap}
.bz-lym i{font-style:normal;font-size:9px;color:#6b5640;white-space:nowrap}
.bz-lym.on{border-color:#b0812b;background:#f3e8cf}
.bz-lri-grid{flex:1 1 100%;width:100%;box-sizing:border-box;margin-top:8px;padding:9px;background:#faf6ee;border:1px solid #e7ddc9;border-radius:8px}
.bz-lri-head{font-size:11px;color:#8b8172;margin-bottom:7px}
.bz-lri-cells{display:grid;grid-template-columns:repeat(auto-fill,minmax(50px,1fr));gap:4px}
.bz-lri{display:flex;flex-direction:column;align-items:center;background:#fffdf8;border:1px solid #e7ddc9;border-radius:8px;padding:3px 2px;min-width:0;line-height:1.35;overflow:hidden}
.bz-lri em{font-style:normal;font-size:8.5px;color:#8b8172;white-space:nowrap}
.bz-lri{font-size:11.5px;font-weight:600;color:#3a352c}
.bz-lri span{white-space:nowrap}
.bz-lri i{font-style:normal;font-size:8.5px;color:#b0812b;font-weight:400;white-space:nowrap}
.bz-mscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.bz-linkscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
/* —— 手机端适配 —— */
@media (max-width:760px){
  .bz{max-width:100%}
  .bz-head{flex-direction:column;align-items:flex-start;gap:12px}
  .bz-ming{gap:8px;width:100%;justify-content:space-between}
  .bz-pillar{min-width:0;flex:1;padding:8px 6px 6px;border-radius:12px}
  .bz-pillar .pl-gz{font-size:30px}
  .bz-pillar .pl-name{font-size:10px;letter-spacing:1px}
  .bz-info{grid-template-columns:repeat(2,1fr)}
  .bz-info-cell .bz-info-v{font-size:13.5px}
  .bz-info-cell i{font-size:9.5px}
  .bz-matrix{min-width:540px}
  .bz-linksvg{min-width:600px}
  .bz-dy-chip{min-width:56px;padding:5px 8px 4px}
  .bz-dy-chip b{font-size:15px}
  .bz-ly{min-width:48px;font-size:12px;padding:4px 5px}
  .bz-lym-bar{grid-template-columns:repeat(auto-fill,minmax(54px,1fr));padding:7px}
  .bz-lri-cells{grid-template-columns:repeat(auto-fill,minmax(44px,1fr))}
  .bz-ss-block{flex-direction:column;gap:5px}
  .bz-ss-grid{grid-template-columns:1fr}
  .bz-concl-row .k{width:52px;flex-basis:52px}
  .bz-concl-row{font-size:12.5px}
  .bz-cg2-total{font-size:22px}
  .bz-cg2-verse{font-size:15.5px;padding:8px 11px}
  .bz-name{font-size:17px}
  .bz-big{font-size:22px}
}
@media (max-width:400px){
  .bz-info{grid-template-columns:1fr 1fr}
  .bz-ming{gap:6px}
  .bz-pillar .pl-gz{font-size:26px}
  .bz-dy-tabs{gap:5px}
  .bz-ly{min-width:44px}
}`;

export default renderBazi;
