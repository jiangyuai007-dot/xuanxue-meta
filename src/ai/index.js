/**
 * ai/index —— 编排层
 *
 * 单次调用只负责一章；一章坏了只坏一章（这是相对旧实现最大的改进）。
 * 三级降级：缓存 → AI → 本地规则引擎。全部失败也一定有内容（source 会如实标记）。
 *
 * 对外主要两个函数：
 *   generateChapter()  单章（供 SSE 逐章推送）
 *   generateReport()   整份（内部按并发池推进，逐章回调）
 */

import { getChapter, listChapters, buildFactLines, PLAN_VERSION } from '../core/reportPlan.js';
import * as cache from './cache.js';
import * as client from './client.js';
import { makeRequestSpec } from './schema.js';
import { buildSystem, buildUser, buildRetryUser } from './prompt.js';
import { parseChapterResponse } from './parse.js';

/** 本地章节 key → 本地规则引擎的 key（用于兜底时的文本来源） */
const LOCAL_KEY_MAP = {
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

/** 本地规则引擎兜底：把本地文案转成 slot 结构（版式仍由渲染层写死） */
async function localFallback(chapter, facts, factLines) {
  const localKey = LOCAL_KEY_MAP[chapter.key];
  const warnings = ['已回落本地规则引擎（AI 不可用）'];
  // 依据溯源同样只认真实编号：本地兜底也走 slot 协议，版式与 AI 章完全一致
  const basis = factLines.slice(0, 4).map((l) => l.id);

  // 神煞章本地无独立章节，直接用事实行拼一段客观描述
  if (!localKey) {
    return {
      data: {
        headline: `${chapter.title}`,
        summary: factLines.map((l) => l.text).join('；'),
        points: [],
        basis,
        advice: [],
      },
      warnings,
    };
  }

  let sections = [];
  try {
    // 动态引入，避免主进程启动就被 55KB 的解读器拖慢
    const mod = await import('../interpret/bazi/index.js');
    sections = mod.baziSections(facts) || [];
  } catch (e) {
    warnings.push(`本地兜底读取失败：${e.message}`);
  }
  const sec = sections.find((s) => s.key === localKey);
  if (!sec) {
    return { data: { headline: chapter.title, summary: '', points: [], basis, advice: [] }, warnings };
  }

  return parseLocalText(sec.text, chapter, warnings, basis);
}

/** 本地纯文本 → slot 结构 */
function parseLocalText(text, chapter, warnings, basis = []) {
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
      // 小标题取句首短语（到第一个标点为止，≤6 字），避免本地兜底硬截出来的半截话
      .map((l) => ({ t: (l.split(/[，。、：；,.]/)[0] || l).slice(0, 6) || '要点', d: l }));

  const summary = text
    .replace(/【要点】[\s\S]*?(?=\n【|$)/, '')
    .replace(/【依据溯源】[\s\S]*?(?=\n【|$)/, '')
    .replace(/【建议】[\s\S]*?$/, '')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const points = toPoints(seg('要点'));

  return {
    data: {
      headline: summary.slice(0, chapter.slots.headline?.max ?? 24),
      summary,
      points: points || [],
      basis,
      advice: seg('建议')
        .split('\n')
        .map((l) => l.replace(/^[-·*]\s*/, '').trim())
        .filter((l) => l.length > 4)
        .slice(0, 3),
    },
    warnings,
  };
}

/**
 * 生成单章
 * @param {object} p
 * @param {string} p.system
 * @param {string} p.chapterKey
 * @param {object} p.facts        factpack.facts
 * @param {string} p.factPackId
 * @param {boolean} [p.useCache]  默认 true
 * @returns {Promise<{key,title,free,order,data,source,warnings,latencyMs,via,error}>}
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
  // system 必须传下去：合盘（hepan）的抽取器和八字是两套
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
        // tool 路径失败：用精简 user 再叫一次（明确要求 JSON）
        const r2 = await client.chat({
          messages: [
            { role: 'system', content: buildSystem(chapter) },
            { role: 'user', content: buildRetryUser(chapter, factLines) },
          ],
          max_tokens: spec.maxTokens,
          temperature: 0.2,
          // 实测 agnes 支持 json_object 模式：工具调用被截断时走这条，返回干净 JSON
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
  const local = await localFallback(chapter, facts, factLines);
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

/**
 * 整份报告的来源汇总口径（纯函数，便于单测）：
 * ai 优先 → cache 次之（缓存里存的就是 AI 产物，不是本地兜底）→ 真的一章 AI 都没拿到才 local-fallback。
 */
export function aggSource(results) {
  const n = (s) => (results || []).filter((r) => r && r.source === s).length;
  if (n('ai') > 0) return 'ai';
  if (n('cache') > 0) return 'cache';
  return 'local-fallback';
}

/**
 * 生成整份报告（逐章推进，并发受 client 池约束）
 * @param {object} p { system, factPackId, facts, useCache, onChapter(chapterResult, progress) }
 * @returns {Promise<{chapters:Array, source, warnings, totalMs, aiCount, localCount, cacheCount}>}
 */
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

  // 分批并发：批次大小跟随 AI 并发池，批次内串行，避免限流
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
