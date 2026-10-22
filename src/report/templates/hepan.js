/**
 * templates/hepan —— 合盘报告整页渲染
 *
 * 与八字报告共用同一套章节卡版式（rp-*），保证跨体系观感一致：
 * 章节卡直接转发给 bazi 模板的 renderChapterCard（它已支持 gateSystem / price 两个参数），
 * 这样以后改版式只有一处，不会出现「八字改了合盘没改」的漂移。
 *
 * 铁律：
 *   1. 所有对外文案必须过合规网关 gate()，本文件是合盘文案的唯一出口。
 *   2. 版式写死，AI 只喂 slot 文本，影响不到结构。
 */

import { DISCLAIMER, DISCLAIMER_ENABLED } from '../../compliance/gateway.js';
import { renderChapterCard, TEMPLATE_CSS } from './bazi.js';
import { listChapters } from '../../core/reportPlan.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export { esc as e };

/** 合盘默认解锁价（锁定卡展示用） */
export const HEPAN_LOCK_PRICE = '¥9.9';

/**
 * 合盘章节卡
 * @param {object} chapter 章节定义（core/reportPlan.js）
 * @param {object} data    slot 数据（ai/index 产出，已过 parse 校验）
 * @param {{unlocked?:boolean, source?:string, price?:string}} opts
 */
export function renderHePanChapterCard(chapter, data = {}, opts = {}) {
  return renderChapterCard(chapter, data, {
    ...opts,
    gateSystem: 'hepan',
    price: opts.price || HEPAN_LOCK_PRICE,
  });
}

/** 单章骨架（生成中占位） */
export function renderHePanSkeleton(chapter) {
  const no = ['①', '②', '③', '④', '⑤', '⑥'][(chapter.order || 1) - 1] || '·';
  return `<section class="rp-sk" data-key="${esc(chapter.key)}">
    <div class="rp-ch-h"><span class="rp-no">${no}</span><h3 class="rp-ch-t">${esc(chapter.title)}</h3><span class="rp-tag">生成中</span></div>
    <div class="rp-sk-l w40"></div><div class="rp-sk-l w80"></div><div class="rp-sk-l w60"></div>
  </section>`;
}

/**
 * 合盘本地规则版六章（服务重启后从云历史重建、手上没有 AI 章节时走这条）
 *
 * 为什么不在 interpret() 里做：interpret 的 BUILDERS 只登记了 bazi/liuyao/qimen/ziwei
 * 四套，合盘没有解读器，硬调会抛「无解读器：hepan」。这里直接消费引擎 facts 里
 * 现成的四维明细（dims/score/grade/headline）产出章节，文案同样只过一次网关。
 *
 * 返回结构与 AI 逐章一致（renderHePanPage 不区分来源），保证两种路径观感相同。
 *
 * @param {object} f hepanFacts（engines/hepan.js 产出）
 * @returns {Array<{chapter:object, data:{headline?:string, summary:string, points?:Array}, unlocked:boolean, source:string}>}
 */
export function hepanLocalChapters(f = {}) {
  const dimOf = (k) => (f.dims || []).find((d) => d.dim === k) || null;
  const score = Number.isFinite(f.score) ? f.score : null;
  const nameOf = (p) => (p && (p.name || p.nickname)) || '';
  const A = (f.parties || [])[0];
  const B = (f.parties || [])[1];
  const nm = `${nameOf(A) || '甲方'} × ${nameOf(B) || '乙方'}`;
  const hero = A && B ? `${nameOf(A) || '甲方'}（${nameOf(B) || '乙方'}）` : '';

  // 四维现成分数：给「总分怎么来的」一个可核对的落地说明，不虚构新事实
  const dimText = (f.dims || [])
    .map((d) => `${d.label} ${d.score} 分`)
    .join('，');
  const day = dimOf('day');
  const combine = dimOf('combine');
  const wuxing = dimOf('wuxing');
  const zodiac = dimOf('zodiac');

  const chapters = listChapters('hepan').map((c) => {
    const data = { summary: '', headline: '', points: [] };
    if (c.key === 'hetong') {
      data.headline = f.headline || '';
      data.summary = `${nm} 契合指数 ${score === null ? '—' : score} 分（${f.grade || ''}），按四维加权合成：` +
        dimText + `。${f.gradeDesc || ''}`;
    } else if (c.key === 'ganzhi') {
      data.headline = combine?.label || '天干地支合参';
      data.summary = combine
        ? `本项得分 ${combine.score} 分。合处 ${(combine.items || []).map((i) => i.name).join('、') || '无'}；` +
          `冲刑 ${(combine.conflicts || []).map((i) => i.name).join('、') || '无'}。${combine.note || ''}`
        : '合盘未返回此项明细，建议重新提交双方生辰后查看。';
    } else if (c.key === 'riyu') {
      data.headline = day?.label || '日柱与夫妻宫';
      data.summary = day
        ? `本项得分 ${day.score} 分。${day.note || ''}日柱为两人关系基调，此项在总分中权重最高（0.8）。`
        : '合盘未返回此项明细。';
    } else if (c.key === 'wuxing') {
      data.headline = wuxing?.label || '五行与用神互补';
      data.summary = wuxing
        ? `本项得分 ${wuxing.score} 分。互补线索 ${(wuxing.lines || []).filter((l) => l.kind === '互补').map((l) => l.name).join('、') || '无明显互补'}；` +
          `${wuxing.note || ''}`
        : '合盘未返回此项明细。';
    } else if (c.key === 'chongke') {
      data.headline = '需要注意的冲刑';
      const all = [...((combine && combine.conflicts) || []), ...(zodiac && zodiac.conflicts ? zodiac.conflicts : [])];
      data.summary = all.length
        ? `可注意：${all.map((i) => i.name).join('、')}。冲刑多为主观感受层面的磨合项，并非定论，宜结合其他维度一起看。`
        : '双方干支未见明显冲刑，磨合上以沟通方式为主。';
    } else if (c.key === 'xiangchu') {
      data.headline = '相处建议';
      data.summary = `以当前 ${score === null ? '—' : score} 分（${f.grade || '未分档'}）的整体倾向看，` +
        `${hero || '双方'}宜在${(day && day.note) || '日柱基调'}所显的节奏上多留余量；` +
        `冲刑项${((combine && combine.conflicts && combine.conflicts.length) || 0) ? '需留出磨合空间' : '不构成主要摩擦点'}。` +
        `以上为传统文化视角的倾向性参考，不构成任何关系或决策建议。`;
    }
    return {
      chapter: c,
      data,
      unlocked: true,
      source: 'local',
    };
  });
  return chapters;
}

/**
 * 合盘整页
 * @param {object} p
 * @param {{panHtml:string, chapters:Array, source:string, factPackId:string,
 *          system?:string, title?:string, score?:number, grade?:string}} p
 */
export function renderHePanPage(p) {
  const {
    panHtml = '', chapters = [], source = 'ai', factPackId = '',
    system = 'hepan', title = '八字合盘报告', score, grade,
  } = p;
  const cards = chapters
    .map((c) => (c.html ? c.html : renderHePanChapterCard(c.chapter, c.data, { unlocked: c.unlocked !== false, source: c.source })))
    .join('\n');
  const genAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const scoreBadge = Number.isFinite(score)
    ? `<span class="rp-src">契合指数 ${esc(score)} 分 · ${esc(grade || '')}</span>`
    : '';
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
    ${scoreBadge}
    <span class="rp-src">${esc(source === 'ai' ? 'AI 深度解读' : source === 'cache' ? 'AI（缓存）' : '本地规则解读')}</span>
  </div>
  ${panHtml}
  ${cards}
  ${DISCLAIMER_ENABLED ? `<div class="rp-meta" style="text-align:center;padding:16px 0">${esc(DISCLAIMER)}</div>` : ''}
</div></body></html>`;
}
