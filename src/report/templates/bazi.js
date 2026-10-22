/**
 * templates/bazi —— 八字报告章节卡渲染（AI 版）
 *
 * 设计铁律：
 *   1. 版式在这里写死，AI 影响不到结构——AI 只喂 slot 文本，怎么排由这里说了算。
 *   2. 所有对外文本必须过合规网关 gate()，本文件是 AI 文案的唯一出口（不可绕过）。
 *   3. basis 只渲染事实编号；编号没过校验（parse.js 已丢掉非法项）时整块不显示。
 */

import { gate, DISCLAIMER, DISCLAIMER_ENABLED } from '../../compliance/gateway.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const CN_NUM = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

/** CSS（作用域前缀 rp-，不污染全局 style.css） */
export const TEMPLATE_CSS = `
.rp-wrap{--rp-line:#e6e0d6;--rp-gold:#b0812b;--rp-txt:#2c2620;--rp-sub:#7a7166;--rp-bg:#fbf8f3}
.rp-wrap{background:var(--rp-bg);color:var(--rp-txt);font:15px/1.9 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:20px;max-width:900px;margin:0 auto}
.rp-hd-bar{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;padding:14px 0 18px;border-bottom:1px solid var(--rp-line);margin-bottom:16px}
.rp-hd-bar h1{font-size:20px;font-weight:700;margin:0}
.rp-meta{font-size:12px;color:var(--rp-sub)}
.rp-src{font-size:12px;color:var(--rp-sub);border:1px solid var(--rp-line);border-radius:999px;padding:2px 8px;margin-left:auto}
.rp-ch{background:#fff;border:1px solid var(--rp-line);border-radius:12px;padding:20px;margin-bottom:16px}
.rp-ch-h{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.rp-no{width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:#f3ece0;color:var(--rp-gold);font-size:13px;font-weight:700;flex:none}
.rp-ch-t{margin:0;font-size:17px;font-weight:700}
.rp-tag{margin-left:auto;font-size:11px;border:1px solid var(--rp-line);color:var(--rp-sub);border-radius:999px;padding:2px 8px}
.rp-tag.free{border-color:#c9a227;color:#8a6d1f;background:#fdf6e0}
.rp-hd{margin:0 0 14px;padding-left:12px;border-left:3px solid var(--rp-gold);font-size:17px;font-weight:600;line-height:1.6}
.rp-sum p{margin:0 0 12px}
.rp-sum p:last-child{margin-bottom:0}
.rp-pts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}
.rp-pt{background:#faf6ef;border:1px solid var(--rp-line);border-radius:10px;padding:12px}
.rp-pt b{display:block;font-size:13px;color:var(--rp-gold);margin-bottom:6px}
.rp-pt span{font-size:13px;line-height:1.75;color:#3a332c}
.rp-basis{margin-top:14px;font-size:12px;color:var(--rp-sub);border-top:1px dashed var(--rp-line);padding-top:10px}
.rp-basis em{font-style:normal;color:var(--rp-gold)}
.rp-adv{margin-top:12px;font-size:14px}
.rp-adv-h{font-size:13px;font-weight:600;color:var(--rp-sub)}
.rp-adv ol{margin:6px 0 0;padding-left:20px}
.rp-adv li{margin-bottom:4px}
.rp-lock{margin:0;padding:34px 20px;text-align:center;background:#fff;border:1px dashed var(--rp-line);border-radius:12px;color:var(--rp-sub);font-size:14px}
.rp-lock b{display:block;font-size:15px;color:var(--rp-txt);margin-bottom:6px}
.rp-sk{background:#fff;border:1px solid var(--rp-line);border-radius:12px;padding:20px;margin-bottom:16px}
.rp-sk-l{height:12px;border-radius:6px;background:linear-gradient(90deg,#f1ece4,#f8f5f0,#f1ece4);background-size:200% 100%;animation:rpSh 1.4s infinite;margin-bottom:10px}
.rp-sk-l.w60{width:60%}.rp-sk-l.w80{width:80%}.rp-sk-l.w40{width:40%}
@keyframes rpSh{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (max-width:640px){
  .rp-wrap{padding:14px}
  .rp-pts{grid-template-columns:1fr}
  .rp-ch{padding:16px}
  .rp-hd{font-size:16px}
}
`;

/** 单章骨架（生成中占位） */
export function renderSkeleton(chapter) {
  const no = CN_NUM[(chapter.order || 1) - 1] || '·';
  return `<section class="rp-sk" data-key="${esc(chapter.key)}">
    <div class="rp-ch-h"><span class="rp-no">${no}</span><h3 class="rp-ch-t">${esc(chapter.title)}</h3><span class="rp-tag">生成中</span></div>
    <div class="rp-sk-l w40"></div><div class="rp-sk-l w80"></div><div class="rp-sk-l w60"></div>
  </section>`;
}

/** 解锁钩子（付费章未解锁） */
function renderLocked(chapter, price) {
  return `<section class="rp-lock" data-key="${esc(chapter.key)}">
    <b>${esc(chapter.title)}</b>
    本章为深度解读内容，解锁后查看完整版　<span class="rp-unlock">${esc(price || '¥0.99')}</span>
  </section>`;
}

/**
 * 渲染一张章节卡
 * @param {object} chapter 章节定义（core/reportPlan.js）
 * @param {object} data    slot 数据（ai/index 产出，已过 parse 校验）
 * @param {{unlocked?:boolean, source?:string, gateSystem?:string}} opts
 *   gateSystem：合规网关的体系名（合盘章传 'hepan'，其余体系沿用 'bazi'）
 */
export function renderChapterCard(chapter, data = {}, opts = {}) {
  if (!opts.unlocked && chapter.free === false) return renderLocked(chapter, opts.price);

  // —— 合规网关：AI 文案的唯一出口 ——
  const parts = [];
  if (data.headline) parts.push({ key: 'headline', text: data.headline });
  if (data.summary) parts.push({ key: 'summary', text: data.summary });
  for (const p of data.points || []) if (p?.d) parts.push({ key: 'point', text: p.d });
  for (const a of data.advice || []) if (a) parts.push({ key: 'advice', text: a });
  const gated = {};
  const gs = opts.gateSystem || 'bazi';
  for (const p of parts) gated[p.key] = gate(p.text, { system: gs, section: chapter.key }).text;

  const summaryParas = String(gated.summary || '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<p>${esc(s)}</p>`)
    .join('');

  const pointCards = (data.points || [])
    .map((p) =>
      p?.d
        ? `<div class="rp-pt"><b>${esc(p.t || '要点')}</b><span>${esc(gated.point || '')}</span></div>`
        : ''
    )
    .join('');

  const basisHtml = (data.basis || []).length
    ? `<div class="rp-basis">依据溯源　<em>${esc(data.basis.join(' · '))}</em></div>`
    : '';

  const adviceHtml = (data.advice || []).length
    ? `<div class="rp-adv"><span class="rp-adv-h">建议</span><ol>${
        (data.advice || []).map((a) => `<li>${esc(a)}</li>`).join('')
      }</ol></div>`
    : '';

  const no = CN_NUM[(chapter.order || 1) - 1] || '·';
  return `<section class="rp-ch" data-key="${esc(chapter.key)}" data-source="${esc(opts.source || '')}">
    <div class="rp-ch-h"><span class="rp-no">${no}</span><h3 class="rp-ch-t">${esc(chapter.title)}</h3>${
    chapter.free ? '<span class="rp-tag free">免费</span>' : '<span class="rp-tag">已解锁</span>'
  }</div>
    ${gated.headline ? `<p class="rp-hd">${esc(gated.headline)}</p>` : ''}
    ${summaryParas ? `<div class="rp-sum">${summaryParas}</div>` : ''}
    ${pointCards ? `<div class="rp-pts">${pointCards}</div>` : ''}
    ${basisHtml}
    ${adviceHtml}
  </section>`;
}

/**
 * 整份报告页
 * @param {object} p
 * @param {{panHtml:string, chapters:Array, source:string, factPackId:string, system?:string}} p
 */
export function renderReportPage(p) {
  const { panHtml = '', chapters = [], source = 'ai', factPackId = '', system = 'bazi', title = '八字命理解读报告' } = p;
  // 章节卡两种入参都吃：整页组装传 {chapter,data}，逐章产物传已渲染好的 html
  const cards = chapters
    .map((c) =>
      c.html
        ? c.html
        : renderChapterCard(c.chapter, c.data, { unlocked: c.unlocked !== false, source: c.source })
    )
    .join('\n');
  const genAt = new Date().toLocaleString('zh-CN', { hour12: false });
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${TEMPLATE_CSS}</style>
</head>
<body><div class="rp-wrap">
  <div class="rp-hd-bar">
    <h1>${esc(title)}</h1>
    <span class="rp-meta">生成于 ${esc(genAt)} · 事实包 ${esc(factPackId)}</span>
    <span class="rp-src">${esc(source === 'ai' ? 'AI 深度解读' : source === 'cache' ? 'AI（缓存）' : '本地规则解读')}</span>
  </div>
  ${panHtml}
  ${cards}
  ${DISCLAIMER_ENABLED ? `<div class="rp-meta" style="text-align:center;padding:16px 0">${esc(DISCLAIMER)}</div>` : ''}
</div></body></html>`;
}

export { esc as e };
