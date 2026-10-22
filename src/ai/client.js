/**
 * client —— agnes（OpenAI 兼容）调用客户端
 *
 * 零第三方依赖：只用 node:fetch（全局 fetch）+ AbortController。
 * 四条工程约束：超时、重试、并发池、计量日志。全部走 env，可一键关停。
 *
 * 环境变量：
 *   AGNES_API_KEY     必填（否则客户端为 disabled 状态，调用直接回落本地）
 *   AGNES_KEY_FILE    备选：指向存放 sk- 的 txt（如桌面 agnes.txt），省去每次手抄 Key
 *   AGNES_BASE_URL    默认 https://apihub.agnes-ai.com/v1
 *   AGNES_MODEL       默认 agnes-2.5-flash
 *   AGNES_TIMEOUT_MS  默认 40000
 *   AI_ENABLED        默认 '1'（设 '0' 关闭 AI，全站走本地）
 *   AI_FORCE_LOCAL    ='1' 时强制本地（灰度/压测用）
 *   AI_CONCURRENCY    默认 2
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const USAGE_LOG = path.join(ROOT, 'data', 'ai-usage.log');

export const AI_ENABLED = process.env.AI_ENABLED !== '0' && process.env.AI_ENABLED !== 'false';
export const FORCE_LOCAL = process.env.AI_FORCE_LOCAL === '1';

/**
 * Key 只从环境里拿，绝不写进源码。
 * 给桌面 txt 文件留一个入口（AGNES_KEY_FILE）：值为文件里以 sk- 开头的那一行。
 * 这样「Key 存在桌面的 agnes.txt，代码里一行密钥都没有」这条底线才守得住。
 */
function readKeyFromFile() {
  const p = process.env.AGNES_KEY_FILE;
  if (!p) return '';
  try {
    const txt = fs.readFileSync(p, 'utf8');
    return txt.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('sk-')) || '';
  } catch {
    return '';
  }
}

const apiKey = process.env.AGNES_API_KEY || readKeyFromFile();

export const CONFIG = {
  apiKey,
  baseUrl: (process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1').replace(/\/+$/, ''),
  model: process.env.AGNES_MODEL || 'agnes-2.5-flash',
  timeoutMs: Number(process.env.AGNES_TIMEOUT_MS || 40000),
  // 实测：agnes 免费额度有 rate limit，并发 3 必撞 429。默认降到 2，留余量。
  concurrency: Number(process.env.AI_CONCURRENCY || 2),
  maxRetries: Number(process.env.AI_MAX_RETRIES || 1),
  // 429 退避阶梯（毫秒）
  backoff: [1500, 3000, 6000],
};

/** 客户端是否可用（没 Key 就别白跑网络） */
export function isAvailable() {
  return AI_ENABLED && !FORCE_LOCAL && Boolean(CONFIG.apiKey);
}

// 启动播报一次：没有 Key 时会静默回落本地，必须让用户看得见
if (!globalThis.__aiAnnounced) {
  globalThis.__aiAnnounced = true;
  const state = !AI_ENABLED ? '未启用（AI_ENABLED=0）'
    : FORCE_LOCAL ? '已强制本地（AI_FORCE_LOCAL=1）'
      : CONFIG.apiKey ? '已启用 ' + CONFIG.model
        : '未配置 Key（报告回落本地规则引擎）';
  console.log(`[AI] ${state}`);
}

// ------------------------------------------------------------------ 并发池

let inflight = 0;
const waiters = [];
const currentPool = () => inflight;

function acquire() {
  return new Promise((resolve, reject) => {
    const task = () => {
      inflight += 1;
      const release = () => {
        inflight -= 1;
        const next = waiters.shift();
        if (next) next();
      };
      resolve(release);
    };
    if (inflight < CONFIG.concurrency) task();
    else waiters.push(task);
  });
}

function withPool(fn) {
  return acquire()
    .catch(() => {
      throw new Error('并发池异常');
    })
    .then((release) => fn().finally(release));
}

// ------------------------------------------------------------------ 计量

function getUsage() {
  try {
    if (!fs.existsSync(USAGE_LOG)) return { calls: 0, promptTokens: 0, completionTokens: 0, fail: 0 };
    const text = fs.readFileSync(USAGE_LOG, 'utf8');
    const lines = text.split('\n').filter((l) => l.trim());
    const sum = { calls: 0, promptTokens: 0, completionTokens: 0, fail: 0 };
    for (const l of lines) {
      try {
        const o = JSON.parse(l);
        sum.calls += 1;
        sum.promptTokens += o.promptTokens || 0;
        sum.completionTokens += o.completionTokens || 0;
        if (o.ok === false) sum.fail += 1;
      } catch {
        /* ignore */
      }
    }
    return sum;
  } catch {
    return { calls: 0, promptTokens: 0, completionTokens: 0, fail: 0 };
  }
}

function logUsage(row) {
  try {
    const dir = path.dirname(USAGE_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(USAGE_LOG, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n', 'utf8');
  } catch {
    /* 计量失败不影响主流程 */
  }
}

/**
 * 单条 chat/completions 调用（含 1 次重试）
 * @param {{messages:Array, tools?:Array, tool_choice?:object, max_tokens?:number, temperature?:number}} req
 * @returns {Promise<{ ok:boolean, body?:object, error?:string, attempts:number, latencyMs:number }>}
 */
export async function chat(req) {
  if (!isAvailable()) return { ok: false, error: 'AI 未启用或无 API Key（AI_ENABLED / AGNES_API_KEY）', attempts: 0, latencyMs: 0 };

  const url = `${CONFIG.baseUrl}/chat/completions`;
  const started = Date.now();
  const attempts = (req.attempts ?? 0) + 1;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const call = async (temperature) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CONFIG.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: ac.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CONFIG.apiKey}`,
        },
        body: JSON.stringify({
          model: CONFIG.model,
          messages: req.messages,
          temperature,
          max_tokens: req.max_tokens ?? 1500,
          ...(req.tools ? { tools: req.tools, tool_choice: req.tool_choice } : {}),
          ...(req.response_format ? { response_format: req.response_format } : {}),
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        const status = res.status;
        // 429 / 5xx：退避后重试（限流是暂时的，直接判死会白白丢一章）
        const retryable = status === 429 || status >= 500;
        return { ok: false, error: `HTTP ${status} ${txt.slice(0, 120)}`, status, retryable };
      }
      const body = await res.json();
      return { ok: true, body };
    } catch (e) {
      const err = e?.name === 'AbortError' ? `超时 ${CONFIG.timeoutMs}ms` : (e?.message || String(e)).slice(0, 160);
      return { ok: false, error: err };
    } finally {
      clearTimeout(timer);
    }
  };

  // 退避重试（仅限流/服务端错误）
  const withBackoff = async (temperature) => {
    let last = null;
    for (let i = 0; i <= CONFIG.backoff.length; i++) {
      const r = await call(temperature);
      if (r.ok) return r;
      last = r;
      if (!r.retryable || i === CONFIG.backoff.length) break;
      await sleep(CONFIG.backoff[i]);
    }
    return last;
  };

  return withPool(async () => {
    let r = await withBackoff(req.temperature ?? 0.35);
    if (!r.ok && attempts <= CONFIG.maxRetries) {
      // 重试：降温度 + 换更明确的措辞（prompt 层给的是精简版 messages）
      r = await withBackoff(0.2);
    }
    const latencyMs = Date.now() - started;
    const usage = r.ok ? r.body?.usage || {} : {};
    logUsage({
      model: CONFIG.model,
      ok: r.ok,
      attempts,
      latencyMs,
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
      finishReason: r.ok ? r.body?.choices?.[0]?.finish_reason || '' : '',
      error: r.ok ? '' : r.error,
      maxTokens: req.max_tokens ?? 800,
    });
    return { ...r, attempts, latencyMs };
  });
}

/** 供健康检查用：当前调用统计 + 配置（不含 Key） */
export function usageStats() {
  return {
    enabled: isAvailable(),
    forcedLocal: FORCE_LOCAL,
    model: CONFIG.model,
    baseUrl: CONFIG.baseUrl,
    timeoutMs: CONFIG.timeoutMs,
    concurrency: CONFIG.concurrency,
    inflight: currentPool(),
    ...getUsage(),
  };
}

export { isAvailable as enabled, getUsage as usage, USAGE_LOG };
