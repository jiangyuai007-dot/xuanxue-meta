/**
 * ai/index —— 编排层
 *
 * 单次调用只负责一章；一章坏了只坏一章（这是相对旧实现最大的改进）。
 * 三级降级：缓存 → AI → 本地规则引擎。全部失败也一定有内容（source 会如实标记）。
 *
 * Phase 2 升级：支持八字、合盘、六爻、奇门、紫微五大体系统一走 Slot 协议与本地规则引擎兜底。
 */

import { getChapter, listChapters, buildFactLines, PLAN_VERSION } from '../core/reportPlan.js';
import * as cache from './cache.js';
import * as client from './client.js';
import { makeRequestSpec } from './schema.js';
import { buildSystem, buildUser, buildRetryUser } from './prompt.js';
import { parseChapterResponse } from './parse.js';

/** 八字本地章节 key → 本地规则引擎的 key */
const BAZI_LOCAL_KEY_MAP = {
  mingju: 'mingju',
  geju: 'geju',
  xingge: 'xingge',
  jiankang: 'jiankang',
  ganqing: 'ganqing',
  shiye: 'shiye',
  caiyun: 'caiyun',
  dayun: 'dayun',
  chenggu: 'chenggu',
};

/** 本地规则引擎兜底：把各体系本地文案转成统一 slot 结构（版式仍由渲染层写死） */
async function localFallback(chapter, facts, factLines, system = 'bazi') {
  const warnings = ['已回落本地规则引擎（AI 不可用）'];
  const basis = factLines.slice(0, 4).map((l) => l.id);

  try {
    if (system === 'hepan') {
      const mod = await import('../report/templates/hepan.js');
      const items = mod.hepanLocalChapters(facts) || [];
      const found = items.find((x) => x.chapter?.key === chapter.key);
      if (found && found.data) {
        const pts = (found.data.points && found.data.points.length)
          ? found.data.points
          : factLines.slice(0, 3).map((l) => ({
              t: (l.text.split(/[：:，。]/)[0] || chapter.title).slice(0, 8),
              d: l.text,
            }));
        return {
          data: {
            headline: found.data.headline || chapter.title,
            summary: found.data.summary || factLines.map((l) => l.text).join('；'),
            points: pts,
            basis,
            advice: found.data.advice || [],
          },
          warnings,
        };
      }
    } else if (system === 'liuyao') {
      const mod = await import('../interpret/deep/liuyaoBuild.js');
      const sections = mod.liuyaoChapters(facts) || [];
      const sec = sections.find((s) => s.key === chapter.key);
      if (sec) return parseLocalText(sec.text, chapter, warnings, basis, factLines);
    } else if (system === 'qimen') {
      const mod = await import('../interpret/deep/qimenBuild.js');
      const sections = mod.qimenChapters(facts) || [];
      const sec = sections.find((s) => s.key === chapter.key);
      if (sec) return parseLocalText(sec.text, chapter, warnings, basis, factLines);
    } else if (system === 'ziwei') {
      const mod = await import('../interpret/deep/ziweiBuild.js');
      const sections = mod.ziweiChapters(facts) || [];
      const sec = sections.find((s) => s.key === chapter.key);
      if (sec) return parseLocalText(sec.text, chapter, warnings, basis, factLines);
    } else {
      const localKey = BAZI_LOCAL_KEY_MAP[chapter.key];
      if (localKey) {
        const mod = await import('../interpret/bazi/index.js');
        const sections = mod.baziSections(facts) || [];
        const sec = sections.find((s) => s.key === localKey);
        if (sec) return parseLocalText(sec.text, chapter, warnings, basis, factLines);
      }
    }
  } catch (e) {
    warnings.push(`本地兜底读取失败：${e.message}`);
  }

  // 通用事实行兜底（如八字神煞章或奇门四害与吉凶格局章）
  const fallbackPts = factLines.slice(0, Math.min(3, factLines.length)).map((l) => {
    const [head, ...rest] = String(l.text || '').split(/[：:]/);
    return {
      t: (head || chapter.title).slice(0, 8),
      d: (rest.length ? rest.join('：') : l.text).slice(0, 90),
    };
  });
  return {
    data: {
      headline: `${chapter.title}核心盘面特征`,
      summary: factLines.map((l) => l.text).join('；') || `${chapter.title}已根据本地确定性排盘完成结构化梳理。`,
      points: fallbackPts,
      basis,
      advice: ['结合自身现实条件与长远规划理性参考，切勿将传统命理概念作为唯一决策依据。'],
    },
    warnings,
  };
}

/** 本地纯文本 → slot 结构 */
function parseLocalText(text, chapter, warnings, basis = [], factLines = []) {
  const seg = (tag) => {
    const m = text.match(new RegExp(`【${tag}】([\\s\\S]*?)(?=\\n【|$)`));
    return m ? m[1] : '';
  };
  const toPoints = (block) =>
    block
      .split('\n')
      .map((l) => l.replace(/^[-·*]\s*/, '').trim())
      .filter((l) => l.length > 4)
      .slice(0, chapter.slots.points?.max ?? 4)
      .map((l) => ({ t: (l.split(/[，。、：；,.]/)[0] || l).slice(0, 8) || '要点', d: l }));

  const summary = text
    .replace(/【要点】[\s\S]*?(?=\n【|$)/, '')
    .replace(/【依据溯源】[\s\S]*?(?=\n【|$)/, '')
    .replace(/【建议】[\s\S]*?$/, '')
    .replace(/\n{2,}/g, '\n')
    .trim();

  let points = toPoints(seg('要点'));
  if (!points.length && factLines.length) {
    points = factLines.slice(0, 3).map((l) => {
      const [head, ...rest] = String(l.text || '').split(/[：:]/);
      return {
        t: (head || chapter.title).slice(0, 8),
        d: (rest.length ? rest.join('：') : l.text).slice(0, 90),
      };
    });
  }

  let advice = seg('建议')
    .split('\n')
    .map((l) => l.replace(/^[-·*]\s*/, '').trim())
    .filter((l) => l.length > 4)
    .slice(0, 3);
  if (!advice.length && chapter.slots?.advice) {
    advice = ['以上分析基于盘面固有结构推演，建议结合当前实际处境稳步推进。'];
  }

  const firstSentence = (summary.split(/[。！？\n]/)[0] || summary).trim();
  return {
    data: {
      headline: firstSentence.slice(0, chapter.slots.headline?.max ?? 26),
      summary,
      points: points || [],
      basis,
      advice,
    },
    warnings,
  };
}

/**
 * 生成单章
 */
export async function generateChapter(p) {
  const { system = 'bazi', chapterKey, facts = {}, factPackId = '', useCache = true } = p;
  const chapter = getChapter(chapterKey, system);
  if (!chapter) {
    return { key: chapterKey, title: chapterKey, order: 0, free: false, data: {}, source: 'none', warnings: [`未知章节 ${chapterKey}`], latencyMs: 0, error: 'unknown-chapter' };
  }

  const started = Date.now();
  const ctx = { planVersion: PLAN_VERSION, system, factPackId: factPackId || 'adhoc', chapterKey };

  // 1) 缓存
  if (useCache) {
    const hit = cache.read(ctx);
    if (hit?.data) {
      return { ...pick(chapter), data: hit.data, source: 'cache', warnings: ['命中缓存'], latencyMs: Date.now() - started, via: 'cache' };
    }
  }

  // 本章事实行（AI 与本地兜底共用，编号即依据溯源的白名单）
  const factLines = buildFactLines(chapterKey, facts, system);

  // 2) AI（不可用/失败 → 直接落本地）
  let aiData = null;
  let aiMeta = { via: 'none', warnings: [], error: '' };
  if (client.isAvailable()) {
    const spec = makeRequestSpec(chapter);
    const r = await client.chat({
      messages: [
        { role: 'system', content: buildSystem(chapter) },
        { role: 'user', content: buildUser(chapter, factLines, { free: chapter.free }) },
      ],
      tools: [spec.tool],
      tool_choice: spec.toolChoice,
      max_tokens: spec.maxTokens,
      temperature: 0.35,
    });
    if (r.ok) {
      const parsed = parseChapterResponse(r.body, chapter.slots, factLines.map((f) => f.id));
      if (parsed.ok) {
        aiData = parsed.data;
        aiMeta = { via: parsed.via, warnings: parsed.warnings, error: '' };
      } else {
        const r2 = await client.chat({
          messages: [
            { role: 'system', content: buildSystem(chapter) },
            { role: 'user', content: buildRetryUser(chapter, factLines) },
          ],
          max_tokens: spec.maxTokens,
          temperature: 0.2,
          response_format: { type: 'json_object' },
        });
        if (r2.ok) {
          const parsed2 = parseChapterResponse(r2.body, chapter.slots, factLines.map((f) => f.id));
          if (parsed2.ok) {
            aiData = parsed2.data;
            aiMeta = { via: `json-fallback(${parsed2.via})`, warnings: parsed2.warnings, error: '' };
          } else {
            aiMeta = { via: 'none', warnings: parsed2.warnings, error: parsed2.errors.join('｜') };
          }
        } else {
          aiMeta = { via: 'none', warnings: [], error: r2.error };
        }
      }
      if (!aiData) aiMeta.error = aiMeta.error || r.error;
    } else {
      aiMeta = { via: 'none', warnings: [], error: r.error };
    }
  } else {
    aiMeta = { via: 'none', warnings: [], error: client.FORCE_LOCAL ? 'AI_FORCE_LOCAL=1' : 'AI 未启用' };
  }

  if (aiData) {
    if (useCache) cache.write({ ...ctx, data: aiData });
    return {
      ...pick(chapter),
      data: aiData,
      source: 'ai',
      warnings: aiMeta.warnings,
      latencyMs: Date.now() - started,
      via: aiMeta.via,
    };
  }

  // 3) 本地兜底（用户无感）
  const local = await localFallback(chapter, facts, factLines, system);
  return {
    ...pick(chapter),
    data: local.data,
    source: 'local',
    warnings: [...local.warnings, ...aiMeta.warnings],
    latencyMs: Date.now() - started,
    via: 'local-fallback',
    error: aiMeta.error,
  };
}

const pick = (chapter) => ({ key: chapter.key, title: chapter.title, order: chapter.order, free: !!chapter.free });

export function aggSource(results) {
  const n = (s) => (results || []).filter((r) => r && r.source === s).length;
  if (n('ai') > 0) return 'ai';
  if (n('cache') > 0) return 'cache';
  return 'local-fallback';
}

export async function generateReport(p) {
  const { system = 'bazi', facts, factPackId = '', useCache = true, onChapter } = p;
  const chapters = listChapters(system);
  const results = [];

  const worker = async (chapter) => {
    const r = await generateChapter({ system, chapterKey: chapter.key, facts, factPackId, useCache });
    results.push(r);
    if (typeof onChapter === 'function') {
      onChapter(r, { done: results.length, total: chapters.length, index: chapter.order });
    }
    return r;
  };

  const size = Math.max(1, Math.min(client.CONFIG.concurrency, chapters.length));
  for (let i = 0; i < chapters.length; i += size) {
    await Promise.all(chapters.slice(i, i + size).map(worker));
  }

  results.sort((a, b) => (a.order || 0) - (b.order || 0));
  const count = (s) => results.filter((r) => r.source === s).length;
  return {
    chapters: results,
    source: aggSource(results),
    aiCount: count('ai'),
    cacheCount: count('cache'),
    localCount: count('local'),
    totalMs: results.reduce((a, b) => a + b.latencyMs, 0),
    warnings: results.flatMap((r) => r.warnings.map((w) => `${r.key}: ${w}`)),
  };
}

export { client, cache, PLAN_VERSION };
