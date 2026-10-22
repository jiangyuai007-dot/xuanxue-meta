/**
 * P1 探针：报告流式链路端到端验收
 *
 * 验证四件事：
 *   1. SSE 逐章推送（事件序 start → chapter* → done，每章带来源与耗时）
 *   2. 一次性 JSON（?mode=json）
 *   3. 复用已有命盘时不重复烧 AI（reused=true，秒回）
 *   4. 报告整页 HTML 走 AI 固定骨架版式（含排盘区与章节卡）
 *
 * 用法：node scripts/p1_stream_probe.mjs [--force-local]
 */

import { writeFileSync } from 'node:fs';
import { listChapters } from '../src/core/reportPlan.js';
import { SECTION_PRICE } from '../src/commerce/sku.js';

const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:8787';
const FORCE_LOCAL = process.argv.includes('--force-local');

// 故意换一套生辰：默认走冷启动，才能验证真实的逐章生成与推送，而不是打缓存
const INPUT = {
  type: 'bazi', year: 1996, month: 8, day: 20, hour: 3, minute: 40,
  city: '上海', useTrueSolarTime: true, calendar: 'gregorian', gender: 'female',
};

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };

function parseSse(raw) {
  let event = '';
  let data = '';
  for (const line of String(raw).split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim();
  }
  let payload = {};
  try { payload = JSON.parse(data); } catch { /* ignore */ }
  return { event, data: payload };
}

/** 逐读 SSE，按 \n\n 切帧 */
async function readSse(res, onFrame) {
  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = parseSse(raw);
      if (ev.event) await onFrame(ev);
    }
  }
}

const t0 = Date.now();
let factPackId = '';
let token = '';
let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failures += 1;
  say(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '　' + extra : ''}`);
};

try {
  // ---------- 1. AI 在线状态（Key 由服务进程自取：AGNES_API_KEY / AGNES_KEY_FILE，探针不碰 Key）
  const h = await (await fetch(`${BASE}/api/health`)).json();
  say(`[0] 服务 AI 状态：apiKeyFile=${process.env.AGNES_KEY_FILE || '（未设）'} health.ok=${h.ok}`);

  // 静态护栏：计划里的付费章必须在价表里有定价，否则会被判成「锁定」
  const planChapters = listChapters('bazi').filter((c) => !c.free).map((c) => c.key);
  const priced = planChapters.filter((k) => SECTION_PRICE.bazi[k]);
  check('价表覆盖计划全部付费章', priced.length === planChapters.length,
    planChapters.filter((k) => !priced.includes(k)).join(',') || `${priced.length}/${planChapters.length}`);

  // ---------- 2. SSE 逐章
  say(`\n[1] SSE 逐章推送（force-local=${FORCE_LOCAL}）`);
  const tSse = Date.now();
  const res = await fetch(`${BASE}/api/report/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: INPUT }),
    signal: AbortSignal.timeout(180000),
  });
  const ct = String(res.headers.get('content-type') || '');
  check('SSE 响应类型', /text\/event-stream/.test(ct), ct);
  const frames = { start: null, chapter: [], fallback: [], done: null };
  let noCacheHeader = String(res.headers.get('cache-control') || '');
  await readSse(res, async (ev) => {
    // 到达时刻必须在这里打戳：等收完再算就全是同一个时间戳了
    if (ev.event === 'start') frames.start = { ...ev.data, __t: Date.now() - tSse };
    else if (ev.event === 'chapter') frames.chapter.push({ ...ev.data, __t: Date.now() - tSse });
    else if (ev.event === 'fallback') frames.fallback.push(ev.data);
    else if (ev.event === 'done') frames.done = { ...ev.data, __t: Date.now() - tSse };
  });
  const sseMs = Date.now() - tSse;
  check('start 事件带排盘区', !!frames.start && !!frames.start.panHtml, `章节 ${frames.start?.chapters?.length ?? 0}`);
  check('逐章数量 ≥ 10', frames.chapter.length >= 10, `收到 ${frames.chapter.length} 章`);
  check('done 事件存在', !!frames.done);
  frames.chapter.forEach((c, i) => {
    const prev = i === 0 ? frames.start?.__t ?? 0 : frames.chapter[i - 1].__t;
    say(`      ${String(i + 1).padStart(2)} ${c.key.padEnd(8)} ${String(c.source).padEnd(6)} 单章 ${String(c.latencyMs).padStart(5)}ms  到达 +${String(c.__t - prev).padStart(6)}ms  html ${c.html.length}B`);
  });
  if (frames.done) {
    say(`      汇总 source=${frames.done.source} ai=${frames.done.aiCount} cache=${frames.done.cacheCount} local=${frames.done.localCount} total=${frames.done.totalMs}ms`);
    check('来源如实标记', frames.done.localCount > 0 ? frames.done.source === 'local-fallback' || frames.done.source === 'ai' : frames.done.source === 'ai' || frames.done.source === 'cache' || frames.done.source === 'local-fallback');
    token = frames.done.reportToken || '';
  }
  check('所有章节卡非空', frames.chapter.every((c) => c.html && c.html.length > 100));
  check('章节卡版式统一', frames.chapter.every((c) => /^<section class="rp-(ch|lock)"/.test(c.html)));
  check('至少一章带依据溯源', frames.chapter.some((c) => /rp-basis/.test(c.html)));
  check('全站免费下无锁定章节', frames.chapter.every((c) => c.unlocked === true && !/rp-lock/.test(c.html)));
  // 逐章性：首章到达明显早于整份结束（真推送，不是攒一刀）。
  // 全缓存回放是瞬时的，这时没法证明「逐章」，只校验到达序单调。
  const monotonic = frames.chapter.every((c, i) => i === 0 || c.__t >= frames.chapter[i - 1].__t);
  check('章节按到达序推进（不倒序）', monotonic);
  if (sseMs >= 1500) {
    const firstMs = frames.chapter[0]?.__t ?? sseMs;
    check('首章先于整份到达（真逐章）', firstMs < sseMs - 500, `首章 ${firstMs}ms / 整份 ${sseMs}ms`);
  } else {
    say('      （全缓存回放，瞬时完成，跳过「逐章耗时」断言）');
  }
  say(`      SSE 全程 ${sseMs}ms，缓存头 ${noCacheHeader}`);

  // ---------- 3. 整页 HTML
  factPackId = frames.start?.factPackId || '';
  if (factPackId && token) {
    say('\n[2] 报告整页 HTML');
    const tHtml = Date.now();
    const hr = await fetch(`${BASE}/api/report/${factPackId}/html?t=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(60000) });
    const page = await hr.text();
    check('整页 HTTP 200', hr.status === 200, `${Date.now() - tHtml}ms ${page.length}B`);
    check('整页用 AI 骨架版式', page.includes('rp-hd-bar') && page.includes('rp-pts'));
    check('整页无免责声明块', !/传统命理文化的规则化推演/.test(page));
    const cards = (page.match(/<section class="rp-ch"/g) || []).length;
    check('整页含全部章节卡', cards >= 10, `${cards} 张（rp-pan=${page.includes('rp-pan')} rp-wrap=${page.includes('rp-wrap')}）`);
    const bad = await fetch(`${BASE}/api/report/${factPackId}/html`);
    check('无令牌访问被拒 403', bad.status === 403, `HTTP ${bad.status}`);
    const nf = await fetch(`${BASE}/api/report/nope-xxx/html?t=${encodeURIComponent(token)}`);
    check('不存在的报告 404', nf.status === 404, `HTTP ${nf.status}`);
    const marks = ['rp-wrap', 'rp-hd-bar', 'rp-pts', 'rp-basis', 'rp-adv', 'rp-hd', 'rp-lock'];
    say(`      版式标记：${marks.map((m) => `${m}=${page.includes(m) ? '1' : '0'}`).join(' ')}`);
    writeFileSync('.p1_report.html', page, 'utf8');
  }

  // ---------- 4. 一次性 JSON
  say('\n[3] 一次性 JSON（?mode=json）');
  const jr = await fetch(`${BASE}/api/report/stream?mode=json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: INPUT, factPackId }),
    signal: AbortSignal.timeout(180000),
  });
  const jd = await jr.json();
  check('JSON 一次性返回 ok', jr.status === 200 && jd.ok === true);
  check('JSON 章节数 ≥ 10', (jd.chapters || []).length >= 10, `${(jd.chapters || []).length} 章`);
  check('JSON 每章带 html', (jd.chapters || []).every((c) => c.html && c.html.length > 100));
  check('JSON 章节全部解锁', (jd.chapters || []).every((c) => c.unlocked === true));
  check('JSON 返回报告令牌', !!jd.reportToken);

  // ---------- 5. 复用不重烧
  say('\n[4] 复用已有命盘');
  const tR = Date.now();
  const rr = await fetch(`${BASE}/api/report/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: INPUT, factPackId }),
    signal: AbortSignal.timeout(60000),
  });
  const reused = { start: null, chapter: 0, done: null };
  await readSse(rr, async (ev) => {
    if (ev.event === 'start') reused.start = ev.data;
    else if (ev.event === 'chapter') reused.chapter += 1;
    else if (ev.event === 'done') reused.done = ev.data;
  });
  const rMs = Date.now() - tR;
  check('复用标记 reused=true', reused.start?.reused === true);
  check('复用仍逐章推回', reused.chapter >= 10, `${reused.chapter} 章 / ${rMs}ms`);
  check('复用提示来自缓存', reused.done?.reused === true);
} catch (e) {
  failures += 1;
  say(`FAIL  探针异常：${e.message}`);
}

say(`\n==== ${failures === 0 ? 'P1 全绿' : `失败 ${failures} 项`} ====`);
writeFileSync('.p1_probe.log', lines.join('\n'), 'utf8');
process.exit(failures === 0 ? 0 : 1);
