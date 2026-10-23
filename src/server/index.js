/**
 * HTTP 服务：静态资源 + JSON API（上线前加固版）
 * 零第三方依赖，仅用 node:http / node:fs / node:zlib / node:crypto
 *
 * 加固项：输入校验、安全响应头、限流、gzip、磁盘/内存资源治理、访问/错误日志、优雅退出。
 * 详见 src/server/hardening.js 与 src/server/log.js。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build, validate, cacheStats, cacheKeyOf, enforceCachePolicy } from '../factpack.js';
import { interpret } from '../interpret/index.js';
import { renderReportHtml, renderChart, renderShareCardSvg } from '../report/index.js';
import { renderReportPage, renderChapterCard, TEMPLATE_CSS } from '../report/templates/bazi.js';
import { renderHePanPage, renderHePanChapterCard, hepanLocalChapters } from '../report/templates/hepan.js';
import { listChapters, PLAN_VERSION } from '../core/reportPlan.js';
import * as aiCache from '../ai/cache.js';
import { aggSource } from '../ai/index.js';
import { sessionUserOf, resolvePurchased, buildReport } from '../ai/service.js';
import { computeHePan } from '../engines/hepan.js';
import { CITIES } from '../core/time.js';
import {
  listSkus, createOrder, payOrder, getOrder, unlockedSections, orderStats, SECTION_PRICE, skuSectionKeys,
  listOrders, refundOrder, confirmPaid, markConsumed, closeExpiredOrders, reconcileOrders,
} from '../commerce/sku.js';
import { entitledSections } from '../commerce/entitle.js';
import { listChannels, handleNotify } from '../commerce/pay/index.js';
import { register as accountRegister, login as accountLogin, verifySession, logout as accountLogout, userStats } from '../account/user.js';
import { saveReport, listReports, getReport, getReportByPackId, removeReport, touchReport } from '../account/reportstore.js';
import { storageStats } from '../storage/db.js';
import { computeAlmanac } from '../core/almanac.js';
import {
  answerFollowup,
  getChatThread,
  appendChatTurn,
  clearChatThread,
  presetQuestionsFor,
} from '../ai/chat.js';
import { issueReportToken, verifyReportToken, reportUrl } from '../commerce/token.js';
import { DISCLAIMER, DISCLAIMER_ENABLED } from '../compliance/gateway.js';
import os from 'node:os';
import {
  SECURITY_HEADERS,
  validateInput,
  rateLimit,
  clientIp,
  maybeGzip,
  LRUCache,
  REPORTS_MAX,
} from './hardening.js';
import { logAccess, logError, logInfo } from './log.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const WEB_DIR = path.join(ROOT, 'web');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

/** 本机非回环 IPv4，用于启动日志里给出手机可直接访问的地址 */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

// 内存报告上限：LRU 淘汰（见 hardening.js REPORTS_MAX）
const reports = new LRUCache(REPORTS_MAX);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json; charset=utf-8',
};

/** 取请求里的报告访问令牌（?t=）：报告页 / 分享卡鉴权用 */
function reportTokenOf(req) {
  try {
    return new URL(req.url, 'http://localhost').searchParams.get('t');
  } catch {
    return null;
  }
}
/**
 * 统一响应出口：应用安全响应头 + 按需 gzip + 访问日志。
 */
function respond(req, res, { status, contentType, buf, cacheControl, extraHeaders = {} }) {
  const headers = { ...res.__extra, ...SECURITY_HEADERS, ...extraHeaders, 'Content-Type': contentType };
  if (cacheControl) headers['Cache-Control'] = cacheControl;

  const { buf: out, encoding } = maybeGzip(req, contentType, buf);
  if (encoding) headers['Content-Encoding'] = encoding;
  headers['Content-Length'] = out.length;

  res.writeHead(status, headers);
  res.end(out);
  logAccess({
    ip: clientIp(req),
    method: req.method,
    path: (req.url || '').split('?')[0],
    status,
    ms: Date.now() - (req.__t0 || Date.now()),
  });
}

function sendJson(req, res, status, data, cacheControl = 'no-store, must-revalidate', extraHeaders = {}) {
  respond(req, res, {
    status,
    contentType: 'application/json; charset=utf-8',
    buf: Buffer.from(JSON.stringify(data), 'utf8'),
    cacheControl,
    extraHeaders,
  });
}

function redirect(req, res, location) {
  const headers = { ...SECURITY_HEADERS, Location: location };
  res.writeHead(302, headers);
  res.end();
  logAccess({ ip: clientIp(req), method: req.method, path: (req.url || '').split('?')[0], status: 302, ms: Date.now() - (req.__t0 || Date.now()) });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

/** 审计注入：仅当 URL 带 __audit=1 时生效，用于产品级验收（横向溢出 / 触控目标 / 可见性） */
const AUDIT_SNIPPET = `
<style>#__audit_out{position:fixed;left:0;bottom:0;z-index:2147483647;background:#000;color:#0f0;font:11px/1.4 monospace;padding:4px;max-width:100%;overflow:hidden;white-space:pre}</style>
<script>
(function(){
  function run(){
    var de=document.documentElement, cw=de.clientWidth, sw=de.scrollWidth;
    var bad=[], small=[];
    document.body.querySelectorAll('*').forEach(function(el){
      var r=el.getBoundingClientRect();
      if(r.width>0 && r.right>cw+1){
        var cls=(typeof el.className==='string'?el.className:'').slice(0,50);
        bad.push(el.tagName.toLowerCase()+(cls?'.'+cls.split(/\\s+/).join('.'):'')+' r='+Math.round(r.right));
      }
    });
    document.body.querySelectorAll('button,select,input,a.btn,[role=button],label.chk').forEach(function(el){
      var r=el.getBoundingClientRect();
      if(r.width>0&&r.height>0&&r.height<32) small.push(el.tagName.toLowerCase()+'.'+(typeof el.className==='string'?el.className:'').slice(0,20)+' h='+Math.round(r.height));
    });
    var worst=bad.length? Math.round(Math.max.apply(null, bad.map(function(s){return Number(s.split('r=')[1]);})))-cw : 0;
    var out={page:location.pathname, cw:cw, sw:sw, overflow:Math.max(0,sw-cw), elOverflow:worst, smallTap:small.length, bad:bad.slice(0,12), small:small.slice(0,8)};
    var pre=document.createElement('pre'); pre.id='__audit_out';
    pre.textContent='__AUDIT__'+JSON.stringify(out);
    document.body.appendChild(pre);
    document.title='AUDIT_'+(out.overflow>0||out.elOverflow>0?'FAIL':'OK');
  }
  if(document.readyState==='complete') setTimeout(run,500); else window.addEventListener('load',function(){setTimeout(run,500);});
})();
</script>`;

function serveStatic(req, res, urlPath) {
  if (urlPath === '/' || urlPath === '') {
    return redirect(req, res, '/bazi.html');
  }
  let rel = urlPath;
  rel = rel.replace(/\?.*$/, '');
  const file = path.join(WEB_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(WEB_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return respond(req, res, { status: 404, contentType: 'text/plain; charset=utf-8', buf: Buffer.from('404 Not Found', 'utf8'), cacheControl: 'no-store' });
  }
  const ext = path.extname(file).toLowerCase();
  let buf = fs.readFileSync(file);
  if (ext === '.html' && req.url.includes('__audit=1')) {
    buf = Buffer.from(buf.toString('utf8').replace('</body>', `${AUDIT_SNIPPET}</body>`), 'utf8');
  }
  const isManifest = path.basename(file) === 'manifest.json';
  const isSw = path.basename(file) === 'sw.js';
  const mime = isManifest ? 'application/manifest+json; charset=utf-8' : (MIME[ext] || 'application/octet-stream');
  let cacheControl = 'no-store, must-revalidate';
  const extra = {};
  if (isSw) {
    cacheControl = 'no-cache, must-revalidate';
    extra['Service-Worker-Allowed'] = '/';
  } else if (ext !== '.html') {
    cacheControl = 'public, max-age=300';
    extra['ETag'] = '"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"';
  }
  respond(req, res, { status: 200, contentType: mime, buf, cacheControl, extraHeaders: extra });
}

async function handleApi(req, res, urlPath, body) {
  if (urlPath === '/api/health') {
    return sendJson(req, res, 200, {
      ok: true,
      ts: new Date().toISOString(),
      cache: cacheStats(),
      orders: orderStats(),
      reports: reports.size,
      storage: storageStats(),
    });
  }
  if (urlPath === '/api/cities' && req.method === 'GET') {
    return sendJson(req, res, 200, { cities: CITIES });
  }
  if (urlPath === '/api/skus' && req.method === 'GET') {
    return sendJson(req, res, 200, { skus: listSkus() });
  }
  if (urlPath === '/api/report/css' && req.method === 'GET') {
    return respond(req, res, {
      status: 200,
      contentType: 'text/css; charset=utf-8',
      buf: Buffer.from(TEMPLATE_CSS, 'utf8'),
      cacheControl: 'public, max-age=300',
    });
  }

  if (urlPath === '/api/paipan' && req.method === 'POST') {
    const v = validateInput(body.input || body);
    if (!v.ok) return sendJson(req, res, 400, { ok: false, error: v.error, code: 'BAD_INPUT' });
    try {
      const fp = build(body.input || body);
      const errs = validate(fp);
      const prev = reports.get(fp.id);
      reports.set(fp.id, {
        factPack: fp,
        interpretation: prev?.interpretation || null,
        ai: prev?.ai || null,
      });
      return sendJson(req, res, 200, {
        ok: true,
        factPackId: fp.id,
        system: fp.system,
        facts: fp.facts,
        meta: fp.meta,
        warnings: errs.length ? errs : fp.meta.warnings,
        chartHtml: renderChart(fp),
      });
    } catch (e) {
      logError(e, 'paipan build');
      return sendJson(req, res, 500, { ok: false, error: '服务器开小差了，请稍后重试', code: 'INTERNAL' });
    }
  }

  if (urlPath === '/api/report' && req.method === 'POST') {
    const reuse = body.factPackId && reports.has(body.factPackId);
    if (!reuse) {
      const v = validateInput(body.input || body);
      if (!v.ok) return sendJson(req, res, 400, { ok: false, error: v.error, code: 'BAD_INPUT' });
    }
    try {
      let fp;
      if (reuse) fp = reports.get(body.factPackId).factPack;
      else fp = build(body.input || body);
      const system = fp.system;
      const paidKeys = Object.keys(SECTION_PRICE[system] || {});
      const full = await interpret(fp, { unlocked: paidKeys });
      const purchasedSet = resolvePurchased({ system, body, req });
      if (Array.isArray(body.purchased)) logError(new Error('收到已废弃的 purchased 字段，已忽略（防伪造）'), 'report deprecated-field');
      const sessionUser = sessionUserOf(req);
      const sections = full.sections.map((s) => {
        const gated = s.text || '';
        const rawBody = gated.includes(DISCLAIMER) ? gated.slice(0, gated.indexOf(DISCLAIMER)) : gated;
        const clean = rawBody.replace(/\s+/g, ' ').trim();
        const words = rawBody.replace(/\s+/g, '').length;
        if (!paidKeys.includes(s.key) || purchasedSet.has(s.key)) {
          return { ...s, preview: false, words };
        }
        const hook = clean.slice(0, 120);
        return {
          ...s,
          preview: true,
          hook,
          words,
          text: (hook + (clean.length > 120 ? '…' : '') + (DISCLAIMER_ENABLED ? '\n\n' + DISCLAIMER : '')).trim(),
        };
      });
      const unlocked = [...purchasedSet];
      const interpretation = { ...full, sections, unlocked };
      const prev = reports.get(fp.id);
      reports.set(fp.id, { factPack: fp, interpretation, ai: prev?.ai || null });
      return sendJson(req, res, 200, {
        ok: true,
        factPackId: fp.id,
        system,
        chartHtml: renderChart(fp),
        interpretation,
        unlocked,
        skus: listSkus(),
        meta: fp.meta,
        channels: listChannels().filter((c) => c.enabled).map((c) => c.id),
        user: sessionUser ? sessionUser.email : null,
        reportToken: issueReportToken(fp.id, { ttl: 10 * 60 * 1000 }),
        reportUrl: reportUrl(fp.id, issueReportToken(fp.id, { ttl: 10 * 60 * 1000 })),
      });
    } catch (e) {
      logError(e, 'report build');
      return sendJson(req, res, 500, { ok: false, error: '服务器开小差了，请稍后重试', code: 'INTERNAL' });
    }
  }

// ---------------------------------------------------------------- 报告流式生成（SSE 逐章）

function sseStart(res) {
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': ok\n\n');
}

function sseSend(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseTail(res) {
  const hb = setInterval(() => {
    if (res.writableEnded) return clearInterval(hb);
    res.write(': ping\n\n');
  }, 15000);
  if (typeof hb.unref === 'function') hb.unref();
  return () => {
    clearInterval(hb);
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };
}

function queryOf(req) {
  try {
    return new URL(req.url, 'http://localhost').searchParams;
  } catch {
    return new Map();
  }
}

if (urlPath === '/api/report/stream' && req.method === 'POST') {
  const q = queryOf(req);
  const mode = q.get('mode') === 'json' ? 'json' : 'sse';
  const useCache = q.get('useCache') !== '0';

  const reuse = body.factPackId && reports.has(body.factPackId);
  logInfo(`报告流请求 mode=${mode} 携带命中盘=${body.factPackId || '(无)'} LRU命中=${reuse ? 1 : 0}`);
  if (!reuse) {
    const v = validateInput(body.input || body);
    if (!v.ok) return sendJson(req, res, 400, { ok: false, error: v.error, code: 'BAD_INPUT' });
  }
  try {
    let fp;
    if (reuse) fp = reports.get(body.factPackId).factPack;
    else fp = build(body.input || body);
    const system = fp.system;
    const cached = reuse ? (reports.get(fp.id)?.ai ?? null) : null;
    logInfo(`报告流请求 mode=${mode} 复用已有章节卡=${cached?.chapters?.length ?? 0}`);
    const purchasedSet = resolvePurchased({ system, body, req });
    const panHtml = renderChart(fp);
    const chapters = listChapters(system).map((c) => ({ key: c.key, title: c.title, order: c.order, free: !!c.free }));
    const token = issueReportToken(fp.id, { ttl: 10 * 60 * 1000 });
    const saved = {
      factPack: fp,
      interpretation: null,
      ai: { source: 'ai', aiCount: 0, cacheCount: 0, localCount: 0, chapters: [] },
      generatedAt: Date.now(),
    };
    reports.set(fp.id, saved);

    if (mode === 'json') {
      const out = await buildReport({ factPack: fp, purchasedSet, useCache });
      saved.ai = { source: out.source, aiCount: out.aiCount, cacheCount: out.cacheCount, localCount: out.localCount, chapters: out.chapters };
      return sendJson(req, res, 200, {
        ok: true,
        factPackId: fp.id,
        system,
        panHtml,
        chapters: out.chapters,
        unlocked: [...purchasedSet],
        source: out.source,
        aiCount: out.aiCount,
        cacheCount: out.cacheCount,
        localCount: out.localCount,
        totalMs: out.totalMs,
        warnings: out.warnings,
        skus: listSkus(),
        meta: fp.meta,
        reportToken: token,
        reportUrl: reportUrl(fp.id, token),
      });
    }

    // —— SSE 模式 ——
    sseStart(res);
    let end = null;
    req.on('aborted', () => end && end());

    if (cached && Array.isArray(cached.chapters) && cached.chapters.length) {
      saved.ai = cached;
      sseSend(res, 'start', { factPackId: fp.id, system, panHtml, chapters, reused: true });
      for (const c of cached.chapters) {
        sseSend(res, 'chapter', {
          key: c.key, title: c.title, order: c.order, free: c.free, unlocked: c.unlocked,
          html: c.html, source: 'cache', latencyMs: 0,
        });
      }
      sseSend(res, 'done', {
        source: cached.source, aiCount: cached.aiCount, cacheCount: cached.cacheCount,
        localCount: cached.localCount, totalMs: 0,
        reportToken: token, reportUrl: reportUrl(fp.id, token), reused: true,
      });
      return sseTail(res)();
    }

    sseSend(res, 'start', { factPackId: fp.id, system, panHtml, chapters, reused: false });
    end = sseTail(res);
    const out = await buildReport({
      factPack: fp,
      purchasedSet,
      useCache,
      onChapter: (item, progress) => {
        saved.ai.chapters.push({
          key: item.key, title: item.title, order: item.order, free: item.free,
          unlocked: item.unlocked, html: item.html, source: item.source,
        });
        if (item.source === 'local') {
          sseSend(res, 'fallback', { key: item.key, reason: item.warnings.join('｜') || 'AI 不可用，已用本地规则引擎' });
        }
        sseSend(res, 'chapter', { ...item, progress });
      },
    });
    saved.ai = { source: out.source, aiCount: out.aiCount, cacheCount: out.cacheCount, localCount: out.localCount, chapters: out.chapters };
    sseSend(res, 'done', {
      source: out.source,
      aiCount: out.aiCount,
      cacheCount: out.cacheCount,
      localCount: out.localCount,
      totalMs: out.totalMs,
      warnings: out.warnings,
      reportToken: token,
      reportUrl: reportUrl(fp.id, token),
    });
    return end();
  } catch (e) {
    logError(e, 'report stream');
    if (!res.headersSent) return sendJson(req, res, 500, { ok: false, error: '服务器开小差了，请稍后重试', code: 'INTERNAL' });
    try {
      res.end();
    } catch {
      /* ignore */
    }
    return;
  }
}

// ---------------------------------------------------------------- 合盘（双命盘关系推演，P2）

function hepanIdOf(a, b, names) {
  const stable = (o) => JSON.stringify(o || {}, Object.keys(o || {}).sort());
  const str = `${stable(a)}|${stable(b)}|${stable(names || {})}`;
  return 'hepan:' + crypto.createHash('sha1').update(str).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------- 云历史归属（P0-2）

const DID_COOKIE = 'xx_did';
const DID_MAX_AGE_SEC = 180 * 24 * 3600;

function didOf(req) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === DID_COOKIE) return part.slice(i + 1).trim();
  }
  return '';
}

function pendingHeaders(res) {
  if (!res.__extra) res.__extra = {};
  return res.__extra;
}

function ensureDid(req, res) {
  const cur = didOf(req);
  if (cur) return cur;
  const did = crypto.randomBytes(16).toString('hex');
  pendingHeaders(res)['Set-Cookie'] =
    `${DID_COOKIE}=${did}; Path=/; Max-Age=${DID_MAX_AGE_SEC}; HttpOnly; SameSite=Lax`;
  return did;
}

function ownerOf(req, res) {
  const u = sessionUserOf(req);
  if (u) return { owner: 'uid:' + u.id, user: u };
  return { owner: 'did:' + ensureDid(req, res), user: null };
}

/**
 * 尝试从磁盘 AI 章节缓存（data/ai-cache）恢复已生成的 AI 章节卡：
 * 解决服务重启或 LRU 淘汰后打开报告链接退化为旧版页面的问题。
 */
function restoreAiChaptersFromDisk(factPack) {
  if (!factPack || !factPack.id || !factPack.system) return null;
  const chapters = listChapters(factPack.system);
  if (!chapters.length) return null;
  const cardFn = factPack.system === 'hepan' ? renderHePanChapterCard : renderChapterCard;
  const restored = [];
  for (const ch of chapters) {
    const hit = aiCache.read({
      planVersion: PLAN_VERSION,
      system: factPack.system,
      factPackId: factPack.id,
      chapterKey: ch.key,
    });
    if (!hit || !hit.data) return null;
    restored.push({
      key: ch.key,
      title: ch.title,
      order: ch.order,
      free: !!ch.free,
      unlocked: true,
      html: cardFn(ch, hit.data, { unlocked: true, source: 'cache' }),
      data: hit.data,
      source: 'cache',
    });
  }
  return {
    source: aggSource(restored),
    aiCount: 0,
    cacheCount: restored.length,
    localCount: 0,
    chapters: restored,
  };
}

function rebuildFromRecord(rec) {
  const payload = rec.payload || {};
  if (rec.system === 'hepan') {
    const a = payload.a || payload.inputA;
    const b = payload.b || payload.inputB;
    const va = validateInput(a);
    const vb = validateInput(b);
    if (!va.ok || !vb.ok) throw new Error((va.ok ? vb : va).error);
    const names = payload.names || { a: '', b: '' };
    const fa = build(a);
    const fb = build(b);
    const pack = {
      id: hepanIdOf(a, b, names),
      system: 'hepan',
      version: 1,
      generatedAt: new Date().toISOString(),
      input: { a, b, names },
      facts: computeHePan({ a: fa.facts, b: fb.facts, names }),
      meta: { warnings: [], cacheHit: false },
    };
    const diskAi = restoreAiChaptersFromDisk(pack);
    reports.set(pack.id, {
      factPack: pack,
      interpretation: null,
      ai: diskAi || { source: 'ai', aiCount: 0, cacheCount: 0, localCount: 0, chapters: [] },
      generatedAt: Date.now(),
    });
    return { factPack: pack, reused: false };
  }
  const v = validateInput(payload);
  if (!v.ok) throw new Error(v.error);
  const fp = build(payload);
  const reused = reports.has(fp.id);
  if (!reused) {
    const diskAi = restoreAiChaptersFromDisk(fp);
    reports.set(fp.id, {
      factPack: fp,
      interpretation: null,
      ai: diskAi || { source: 'ai', aiCount: 0, cacheCount: 0, localCount: 0, chapters: [] },
      generatedAt: Date.now(),
    });
  }
  return { factPack: fp, reused };
}

/**
 * 取命盘与报告上下文：内存 LRU 优先；未命中则回落到云历史记录重建，并尝试恢复磁盘 AI 缓存。
 * @param {string} id factPackId
 */
function loadEntry(id) {
  const hit = id && reports.get(id);
  if (hit && hit.factPack) {
    if (!hit.ai?.chapters?.length && !hit.interpretation) {
      const diskAi = restoreAiChaptersFromDisk(hit.factPack);
      if (diskAi) hit.ai = diskAi;
    }
    return hit;
  }
  const rec = getReportByPackId(id);
  if (!rec) return null;
  const { factPack } = rebuildFromRecord(rec);
  return reports.get(factPack.id) || { factPack, interpretation: null, ai: restoreAiChaptersFromDisk(factPack) };
}

function loadPack(id) {
  const e = loadEntry(id);
  return e ? e.factPack : null;
}

  /** 合盘排盘接口 */
  if (urlPath === '/api/hepan' && req.method === 'POST') {
    try {
      const va = validateInput(body.a || body.inputA);
      const vb = validateInput(body.b || body.inputB);
      if (!va.ok || !vb.ok) {
        return sendJson(req, res, 400, { ok: false, error: (va.ok ? vb : va).error, code: 'BAD_INPUT' });
      }
      const fa = build(body.a || body.inputA);
      const fb = build(body.b || body.inputB);
      const names = { a: body.names?.a || '', b: body.names?.b || '' };
      const hepanFacts = computeHePan({ a: fa.facts, b: fb.facts, names });
      const id = hepanIdOf(body.a || body.inputA, body.b || body.inputB, names);

      const pack = {
        id,
        system: 'hepan',
        version: 1,
        generatedAt: new Date().toISOString(),
        input: { a: body.a || body.inputA, b: body.b || body.inputB, names },
        facts: hepanFacts,
        meta: { warnings: [], cacheHit: false },
      };
      const reuse = reports.has(id);
      if (!reuse) {
        reports.set(id, {
          factPack: pack,
          interpretation: null,
          ai: { source: 'ai', aiCount: 0, cacheCount: 0, localCount: 0, chapters: [] },
          generatedAt: Date.now(),
        });
      }
      return sendJson(req, res, 200, {
        ok: true,
        factPackId: id,
        reused: !!reuse,
        system: 'hepan',
        panHtml: renderChart(pack),
        score: hepanFacts.score,
        grade: hepanFacts.grade,
        gradeDesc: hepanFacts.gradeDesc,
        headline: hepanFacts.headline,
        dims: hepanFacts.dimSummary,
        he: hepanFacts.he.map((x) => ({ name: x.name, keyText: x.keyText, kind: x.kind })),
        conflicts: hepanFacts.conflicts.map((x) => ({ name: x.name, keyText: x.keyText, kind: x.kind })),
        parties: hepanFacts.parties.map((p) => ({
          name: p.name, dayGanzhi: p.dayGanzhi, zodiac: p.zodiac,
          dayMasterElement: p.dayMasterElement, strengthLevel: p.strengthLevel,
          pills: p.pills.map((x) => ({ label: x.label, name: x.name, shishen: x.shishen })),
        })),
        skus: listSkus(),
      });
    } catch (e) {
      logError(e, 'hepan build');
      return sendJson(req, res, 500, { ok: false, error: '服务器开小差了，请稍后重试', code: 'INTERNAL' });
    }
  }

  /** 合盘报告流 */
  if (urlPath === '/api/hepan/report/stream' && req.method === 'POST') {
    const q = queryOf(req);
    const mode = q.get('mode') === 'json' ? 'json' : 'sse';
    const useCache = q.get('useCache') !== '0';
    const id = String(body.factPackId || '');
    try {
      const rec = reports.get(id);
      if (!rec || rec.factPack?.system !== 'hepan') {
        return sendJson(req, res, 404, { ok: false, error: '合盘不存在，请先提交双方生辰', code: 'NOT_FOUND' });
      }
      const cached = (reports.get(id)?.ai ?? null);
      const pack = rec.factPack;
      const system = 'hepan';

      const purchasedSet = resolvePurchased({ system, body, req });
      if (Array.isArray(body.purchased)) logError(new Error('收到已废弃的 purchased 字段，已忽略（防伪造）'), 'hepan deprecated-field');
      const panHtml = renderChart(pack);
      const chapters = listChapters(system).map((c) => ({ key: c.key, title: c.title, order: c.order, free: !!c.free }));
      const token = issueReportToken(id, { ttl: 10 * 60 * 1000 });
      const saved = {
        factPack: pack,
        interpretation: null,
        ai: { source: 'ai', aiCount: 0, cacheCount: 0, localCount: 0, chapters: [] },
        generatedAt: Date.now(),
      };
      reports.set(id, saved);

      if (mode === 'json') {
        const out = await buildReport({ factPack: { ...pack, facts: rec.factPack.facts }, purchasedSet, useCache });
        saved.ai = { source: out.source, aiCount: out.aiCount, cacheCount: out.cacheCount, localCount: out.localCount, chapters: out.chapters };
        return sendJson(req, res, 200, {
          ok: true,
          factPackId: id,
          system,
          panHtml,
          chapters: out.chapters,
          unlocked: [...purchasedSet],
          source: out.source,
          aiCount: out.aiCount,
          cacheCount: out.cacheCount,
          localCount: out.localCount,
          totalMs: out.totalMs,
          warnings: out.warnings,
          score: rec.factPack.facts.score,
          grade: rec.factPack.facts.grade,
          skus: listSkus(),
          reportToken: token,
          reportUrl: reportUrl(id, token, '/api/hepan'),
        });
      }

      sseStart(res);
      let end = null;
      req.on('aborted', () => end && end());

      if (cached && Array.isArray(cached.chapters) && cached.chapters.length) {
        saved.ai = cached;
        sseSend(res, 'start', { factPackId: id, system, panHtml, chapters, reused: true });
        for (const c of cached.chapters) {
          sseSend(res, 'chapter', {
            key: c.key, title: c.title, order: c.order, free: c.free, unlocked: c.unlocked,
            html: c.html, source: 'cache', latencyMs: 0,
          });
        }
        sseSend(res, 'done', {
          source: cached.source, aiCount: cached.aiCount, cacheCount: cached.cacheCount,
          localCount: cached.localCount, totalMs: 0,
          reportToken: token, reportUrl: reportUrl(id, token, '/api/hepan'), reused: true,
        });
        return sseTail(res)();
      }

      sseSend(res, 'start', { factPackId: id, system, panHtml, chapters, reused: false, score: rec.factPack.facts.score, grade: rec.factPack.facts.grade });
      end = sseTail(res);
      const out = await buildReport({
        factPack: { ...pack, facts: rec.factPack.facts },
        purchasedSet,
        useCache,
        onChapter: (item, progress) => {
          saved.ai.chapters.push({
            key: item.key, title: item.title, order: item.order, free: item.free,
            unlocked: item.unlocked, html: item.html, source: item.source,
          });
          if (item.source === 'local') {
            sseSend(res, 'fallback', { key: item.key, reason: item.warnings.join('｜') || 'AI 不可用，已用本地规则引擎' });
          }
          sseSend(res, 'chapter', { ...item, progress });
        },
      });
      saved.ai = { source: out.source, aiCount: out.aiCount, cacheCount: out.cacheCount, localCount: out.localCount, chapters: out.chapters };
      sseSend(res, 'done', {
        source: out.source,
        aiCount: out.aiCount,
        cacheCount: out.cacheCount,
        localCount: out.localCount,
        totalMs: out.totalMs,
        warnings: out.warnings,
        reportToken: token,
        reportUrl: reportUrl(id, token, '/api/hepan'),
      });
      return end();
    } catch (e) {
      logError(e, 'hepan report stream');
      if (!res.headersSent) return sendJson(req, res, 500, { ok: false, error: '服务器开小差了，请稍后重试', code: 'INTERNAL' });
      try {
        res.end();
      } catch {
        /* ignore */
      }
      return;
    }
  }

  // ---------------------------------------------------------------- 账号

  if (urlPath === '/api/auth/register' && req.method === 'POST') {
    try {
      const r = accountRegister({ email: body.email, password: body.password });
      return sendJson(req, res, 200, { ok: true, user: r.user, token: r.token });
    } catch (e) {
      return sendJson(req, res, 400, { ok: false, error: e.message || '注册失败', code: 'BAD_INPUT' });
    }
  }

  if (urlPath === '/api/auth/login' && req.method === 'POST') {
    try {
      const r = accountLogin({ email: body.email, password: body.password });
      return sendJson(req, res, 200, { ok: true, user: r.user, token: r.token });
    } catch (e) {
      return sendJson(req, res, 400, { ok: false, error: e.message || '登录失败', code: 'BAD_INPUT' });
    }
  }

  if (urlPath === '/api/auth/me' && req.method === 'GET') {
    const u = sessionUserOf(req);
    if (!u) return sendJson(req, res, 401, { ok: false, error: '未登录', code: 'UNAUTHORIZED' });
    return sendJson(req, res, 200, { ok: true, user: u });
  }

  if (urlPath === '/api/auth/logout' && req.method === 'POST') {
    accountLogout();
    return sendJson(req, res, 200, { ok: true });
  }

  // ---------------------------------------------------------------- 支付渠道

  if (urlPath === '/api/pay/channels' && req.method === 'GET') {
    return sendJson(req, res, 200, { ok: true, channels: listChannels() });
  }

  const notifyMatch = urlPath.match(/^\/api\/pay\/notify\/([\w-]+)$/);
  if (notifyMatch && req.method === 'POST') {
    try {
      const r = handleNotify(notifyMatch[1], body);
      if (!r.orderId) throw new Error('回调报文缺少订单号');
      let order = null;
      if (r.status === 'paid') {
        order = confirmPaid(r.orderId, {
          tradeNo: r.tradeNo,
          amountFen: r.amountFen,
          channel: r.channel || notifyMatch[1],
        });
      }
      return sendJson(req, res, 200, { ok: true, orderId: r.orderId, status: r.status, tradeNo: r.tradeNo || null, notifiedCount: order?.notifyCount || 1 });
    } catch (e) {
      logError(e, 'pay notify');
      return sendJson(req, res, 400, { ok: false, error: e.message || '回调处理失败', code: 'BAD_INPUT' });
    }
  }

  if (urlPath === '/api/pay/reconcile' && (req.method === 'GET' || req.method === 'POST')) {
    try {
      const report = reconcileOrders({ autoHeal: body.autoHeal !== false });
      return sendJson(req, res, 200, { ok: true, reconcile: report });
    } catch (e) {
      logError(e, 'pay reconcile');
      return sendJson(req, res, 500, { ok: false, error: e.message || '对账巡检失败', code: 'INTERNAL' });
    }
  }

  // ---------------------------------------------------------------- Phase 4：每日运势黄历（结合个人八字日柱）

  if (urlPath === '/api/almanac' && (req.method === 'GET' || req.method === 'POST')) {
    try {
      const q = queryOf(req);
      const fpId = String(body.factPackId || q.get('factPackId') || '').trim();
      let dayGanzhi = String(body.dayGanzhi || q.get('dayGanzhi') || '').trim();
      let favorableElements = Array.isArray(body.favorableElements)
        ? body.favorableElements
        : String(q.get('fav') || '').split(",").map((s) => s.trim()).filter(Boolean);

      if (fpId) {
        const pack = loadPack(fpId);
        if (pack && pack.facts) {
          const f = pack.facts;
          if (!dayGanzhi) {
            dayGanzhi = f.fourPillars?.day?.name || f.siZhu?.day || f.pillars?.ri?.name || f.riChen?.ganzhi || (f.parties && f.parties[0]?.dayGanzhi) || '';
          }
          if (!favorableElements.length && Array.isArray(f.yongshen?.favorable)) {
            favorableElements = f.yongshen.favorable;
          }
        }
      }

      const dateParam = String(body.date || q.get('date') || '').trim();
      let year = Number(body.year || q.get('year') || 0);
      let month = Number(body.month || q.get('month') || 0);
      let day = Number(body.day || q.get('day') || 0);
      if (dateParam && /^\d{4}-\d{1,2}-\d{1,2}$/.test(dateParam)) {
        const parts = dateParam.split('-').map(Number);
        year = parts[0];
        month = parts[1];
        day = parts[2];
      }

      const almanac = computeAlmanac({
        year: year || undefined,
        month: month || undefined,
        day: day || undefined,
        dayGanzhi,
        favorableElements,
      });
      return sendJson(req, res, 200, { ok: true, almanac });
    } catch (e) {
      return sendJson(req, res, 400, { ok: false, error: e.message || '黄历推演失败', code: 'BAD_INPUT' });
    }
  }

  // ---------------------------------------------------------------- Phase 4：基于 FactPack 护栏的 AI 命盘多轮追问

  if (urlPath === '/api/chat/history' && req.method === 'GET') {
    const q = queryOf(req);
    const fpId = String(q.get('factPackId') || '').trim();
    if (!fpId) {
      return sendJson(req, res, 400, { ok: false, error: '缺少 factPackId', code: 'BAD_INPUT' });
    }
    const pack = loadPack(fpId);
    const sys = pack?.system || String(q.get('system') || 'bazi');
    const thread = getChatThread(fpId);
    return sendJson(req, res, 200, {
      ok: true,
      factPackId: fpId,
      system: sys,
      presets: presetQuestionsFor(sys),
      messages: thread?.messages || [],
    });
  }

  if (urlPath === '/api/chat/clear' && req.method === 'POST') {
    const fpId = String(body.factPackId || '').trim();
    if (!fpId) return sendJson(req, res, 400, { ok: false, error: '缺少 factPackId', code: 'BAD_INPUT' });
    const cleared = clearChatThread(fpId);
    return sendJson(req, res, 200, { ok: true, cleared });
  }

  if (urlPath === '/api/chat/stream' && req.method === 'POST') {
    const q = queryOf(req);
    const mode = (q.get('mode') === 'json' || body.mode === 'json') ? 'json' : 'sse';
    const fpId = String(body.factPackId || '').trim();
    const question = String(body.question || '').trim();
    if (!fpId) {
      return sendJson(req, res, 400, { ok: false, error: '请先完成排盘后再发起大师追问', code: 'BAD_INPUT' });
    }
    const pack = loadPack(fpId);
    if (!pack || !pack.facts) {
      return sendJson(req, res, 404, { ok: false, error: '命盘不存在或已过期，请重新点击起盘', code: 'NOT_FOUND' });
    }
    if (question.length < 2 || question.length > 300) {
      return sendJson(req, res, 400, { ok: false, error: '追问内容请控制在 2–300 字之间', code: 'BAD_INPUT' });
    }

    try {
      const { owner } = ownerOf(req, res);
      const thread = getChatThread(fpId);
      const prevMessages = thread?.messages || [];

      if (process.env.XUANXUE_PAID === '1') {
        const userTurnCount = prevMessages.filter((m) => m.role === 'user').length;
        const purchasedSet = resolvePurchased({ system: pack.system, body, req });
        const hasPaidAccess = purchasedSet.size > 0;
        if (userTurnCount >= 3 && !hasPaidAccess) {
          return sendJson(req, res, 402, {
            ok: false,
            error: '免费体验追问次数（3次）已用完，解锁报告或大师追问包即可继续畅聊',
            code: 'PAYMENT_REQUIRED',
            skus: listSkus(),
          });
        }
      }

      if (mode === 'json') {
        const reply = await answerFollowup({ factPack: pack, question, history: prevMessages });
        const updated = appendChatTurn({
          factPackId: fpId,
          system: pack.system,
          owner,
          question,
          reply,
        });
        return sendJson(req, res, 200, {
          ok: true,
          factPackId: fpId,
          system: pack.system,
          reply,
          messages: updated?.messages || [],
        });
      }

      sseStart(res);
      const end = sseTail(res);
      sseSend(res, 'start', { factPackId: fpId, system: pack.system, question });
      const reply = await answerFollowup({ factPack: pack, question, history: prevMessages });
      const updated = appendChatTurn({
        factPackId: fpId,
        system: pack.system,
        owner,
        question,
        reply,
      });

      const chunks = String(reply.answer || '').match(/.{1,24}|\n/g) || [reply.answer];
      for (const chunk of chunks) {
        sseSend(res, 'delta', { text: chunk });
      }
      sseSend(res, 'done', {
        factPackId: fpId,
        system: pack.system,
        reply,
        totalTurns: Math.floor((updated?.messages?.length || 0) / 2),
      });
      return end();
    } catch (e) {
      logError(e, 'chat stream');
      if (!res.headersSent) {
        return sendJson(req, res, 500, { ok: false, error: e.message || '追问服务开小差了，请稍后重试', code: 'INTERNAL' });
      }
      try { res.end(); } catch { /* ignore */ }
      return;
    }
  }

  // ---------------------------------------------------------------- 订单中心

  if (urlPath === '/api/orders' && req.method === 'GET') {
    const u = sessionUserOf(req);
    if (!u) return sendJson(req, res, 401, { ok: false, error: '请先登录再查看订单', code: 'UNAUTHORIZED' });
    return sendJson(req, res, 200, { ok: true, user: u, orders: listOrders({ userId: u.id }) });
  }

  if (urlPath.startsWith('/api/order/') && urlPath.endsWith('/refund') && req.method === 'POST') {
    try {
      const id = urlPath.split('/')[3];
      const u = sessionUserOf(req);
      const o0 = getOrder(id);
      if (!o0) return sendJson(req, res, 404, { ok: false, error: '订单不存在' });
      if (!u || o0.userId !== u.id) {
        return sendJson(req, res, 403, { ok: false, error: '只能对本人订单申请退款', code: 'FORBIDDEN' });
      }
      const o = refundOrder(id, { reason: body.reason || '' });
      return sendJson(req, res, 200, { ok: true, order: o, message: '退款已受理，款项将原路退回' });
    } catch (e) {
      return sendJson(req, res, 400, { ok: false, error: e.message || '退款失败', code: 'BAD_INPUT' });
    }
  }

  if (urlPath === '/api/order' && req.method === 'POST') {
    try {
      const u = sessionUserOf(req);
      const o = createOrder({ ...body, userId: u ? u.id : (body.userId || null) });
      return sendJson(req, res, 200, { ok: true, order: o });
    } catch (e) {
      return sendJson(req, res, 400, { ok: false, error: e.message || '下单失败', code: 'BAD_INPUT' });
    }
  }

  if (urlPath.startsWith('/api/order/') && urlPath.endsWith('/pay') && req.method === 'POST') {
    try {
      const id = urlPath.split('/')[3];
      const o = payOrder(id, { channel: body.channel || 'mock' });
      return sendJson(req, res, 200, { ok: true, order: o });
    } catch (e) {
      return sendJson(req, res, 400, { ok: false, error: e.message || '支付失败', code: 'BAD_INPUT' });
    }
  }

  if (urlPath.startsWith('/api/order/') && req.method === 'GET') {
    const id = urlPath.split('/')[3];
    const o = getOrder(id);
    if (!o) return sendJson(req, res, 404, { ok: false, error: '订单不存在' });
    return sendJson(req, res, 200, { ok: true, order: o });
  }

  const shareMatch = urlPath.match(/^\/api\/report\/([\w.:-]+)\/sharecard\.svg$/);
  if (shareMatch && req.method === 'GET') {
    const pack0 = loadPack(shareMatch[1]);
    if (!pack0) {
      return respond(req, res, { status: 404, contentType: 'text/plain; charset=utf-8', buf: Buffer.from('报告不存在', 'utf8'), cacheControl: 'no-store' });
    }
    if (!verifyReportToken(shareMatch[1], reportTokenOf(req))) {
      return respond(req, res, { status: 403, contentType: 'text/plain; charset=utf-8', buf: Buffer.from('分享链接已失效，请重新生成', 'utf8'), cacheControl: 'no-store' });
    }
    const svg = renderShareCardSvg(pack0);
    return respond(req, res, { status: 200, contentType: 'image/svg+xml; charset=utf-8', buf: Buffer.from(svg, 'utf8'), cacheControl: 'no-store' });
  }

  const htmlMatch = urlPath.match(/^\/api\/report\/([\w.:-]+)\/html$/);
  if (htmlMatch && req.method === 'GET') {
    // Phase 1 修复：调用 loadEntry(id) 保留内存/磁盘中的 rec.ai 章节，不再用 { factPack: pack } 覆盖丢弃
    const rec = loadEntry(htmlMatch[1]);
    const pack = rec && rec.factPack;
    if (!pack) {
      return respond(req, res, { status: 404, contentType: 'text/plain; charset=utf-8', buf: Buffer.from('报告不存在，请先生成报告', 'utf8'), cacheControl: 'no-store' });
    }
    if (!verifyReportToken(htmlMatch[1], reportTokenOf(req))) {
      return respond(req, res, { status: 403, contentType: 'text/plain; charset=utf-8', buf: Buffer.from('报告链接已失效，请重新生成', 'utf8'), cacheControl: 'no-store' });
    }
    let html;
    if (rec.ai && Array.isArray(rec.ai.chapters) && rec.ai.chapters.length) {
      const hp = rec.factPack?.system === 'hepan' ? rec.factPack?.facts || {} : null;
      html = rec.factPack?.system === 'hepan'
        ? renderHePanPage({
            panHtml: renderChart(rec.factPack),
            chapters: rec.ai.chapters,
            source: rec.ai.source,
            factPackId: rec.factPack.id,
            system: 'hepan',
            title: '八字合盘报告',
            score: hp.score,
            grade: hp.grade,
          })
        : renderReportPage({
            panHtml: renderChart(rec.factPack),
            chapters: rec.ai.chapters,
            source: rec.ai.source,
            factPackId: rec.factPack.id,
            system: rec.factPack.system,
          });
    } else {
      if (!rec.interpretation) rec.interpretation = await interpret(rec.factPack, { unlocked: unlockedSections({ system: rec.factPack.system }) });
      html = renderReportHtml({ factPack: rec.factPack, interpretation: rec.interpretation });
    }
    return respond(req, res, { status: 200, contentType: 'text/html; charset=utf-8', buf: Buffer.from(html, 'utf8'), cacheControl: 'no-store' });
  }

  const hepanHtmlMatch = urlPath.match(/^\/api\/hepan\/([\w.:-]+)\/html$/);
  if (hepanHtmlMatch && req.method === 'GET') {
    const entry = loadEntry(hepanHtmlMatch[1]);
    const pack = entry && entry.factPack;
    if (!pack || pack.system !== 'hepan') {
      return respond(req, res, { status: 404, contentType: 'text/plain; charset=utf-8', buf: Buffer.from('合盘不存在，请先提交双方生辰', 'utf8'), cacheControl: 'no-store' });
    }
    if (!verifyReportToken(hepanHtmlMatch[1], reportTokenOf(req))) {
      return respond(req, res, { status: 403, contentType: 'text/plain; charset=utf-8', buf: Buffer.from('报告链接已失效，请重新生成', 'utf8'), cacheControl: 'no-store' });
    }
    const f = pack.facts || {};
    let html;
    const aiChapters = Array.isArray(entry.ai?.chapters) ? entry.ai.chapters : [];
    if (aiChapters.length) {
      html = renderHePanPage({
        panHtml: renderChart(pack),
        chapters: aiChapters,
        source: entry.ai.source || 'ai',
        factPackId: pack.id,
        system: 'hepan',
        title: '八字合盘报告',
        score: f.score,
        grade: f.grade,
      });
    } else {
      html = renderHePanPage({
        panHtml: renderChart(pack),
        chapters: hepanLocalChapters(f),
        source: 'local',
        factPackId: pack.id,
        system: 'hepan',
        title: '八字合盘报告',
        score: f.score,
        grade: f.grade,
      });
    }
    return respond(req, res, { status: 200, contentType: 'text/html; charset=utf-8', buf: Buffer.from(html, 'utf8'), cacheControl: 'no-store' });
  }

  // ---------------------------------------------------------------- 我的报告（云历史，P0-2）

  if (urlPath === '/api/reports' && req.method === 'POST') {
    try {
      const rec = body.record || body;
      const system = String(rec.system || rec.type || '');
      if (!['bazi', 'liuyao', 'qimen', 'ziwei', 'hepan'].includes(system)) {
        return sendJson(req, res, 400, { ok: false, error: '不支持的体系类型', code: 'BAD_INPUT' });
      }
      const { owner } = ownerOf(req, res);
      if (!owner) return sendJson(req, res, 401, { ok: false, error: '保存失败，请刷新页面重试', code: 'UNAUTHORIZED' });
      if (system === 'hepan') {
        const va = validateInput((rec.payload || {}).a || (rec.payload || {}).inputA);
        const vb = validateInput((rec.payload || {}).b || (rec.payload || {}).inputB);
        if (!va.ok || !vb.ok) return sendJson(req, res, 400, { ok: false, error: (va.ok ? vb : va).error, code: 'BAD_INPUT' });
      } else {
        const v = validateInput(rec.payload || rec);
        if (!v.ok) return sendJson(req, res, 400, { ok: false, error: v.error, code: 'BAD_INPUT' });
      }
      const out = saveReport({
        owner,
        system,
        title: String(rec.title || ''),
        subtitle: String(rec.subtitle || ''),
        payload: rec.payload || (system === 'hepan' ? null : rec),
      });
      return sendJson(req, res, 200, { ok: true, id: out.id, updated: out.updated, at: out.updatedAt });
    } catch (e) {
      logError(e, 'reports save');
      return sendJson(req, res, 400, { ok: false, error: e.message || '保存失败', code: 'BAD_INPUT' });
    }
  }

  if (urlPath === '/api/reports' && req.method === 'GET') {
    const { owner, user } = ownerOf(req, res);
    return sendJson(req, res, 200, { ok: true, items: listReports(owner), signedIn: !!user });
  }

  const mineMatch = urlPath.match(/^\/api\/reports\/([\w-]+)$/);
  if (mineMatch && req.method === 'DELETE') {
    const { owner } = ownerOf(req, res);
    const id = mineMatch[1];
    const rec = getReport(id);
    if (!rec) {
      return sendJson(req, res, 404, { ok: false, error: '报告不存在或已删除', code: 'NOT_FOUND' });
    }
    if (rec.owner !== owner) return sendJson(req, res, 403, { ok: false, error: '无权操作该报告', code: 'FORBIDDEN' });
    const ok = removeReport(id, owner);
    return sendJson(req, res, 200, { ok, deleted: ok });
  }

  const mineActMatch = urlPath.match(/^\/api\/reports\/([\w-]+)\/(open|share)$/);
  if (mineActMatch && req.method === 'POST') {
    const act = mineActMatch[2];
    const id = mineActMatch[1];
    const rec = getReport(id);
    if (!rec) return sendJson(req, res, 404, { ok: false, error: '报告不存在或已删除', code: 'NOT_FOUND' });
    const { owner } = ownerOf(req, res);
    if (rec.owner !== owner) {
      return sendJson(req, res, 404, { ok: false, error: '报告不存在或已删除', code: 'NOT_FOUND' });
    }
    try {
      const { factPack, reused } = rebuildFromRecord(rec);
      const ttl = act === 'share' ? 7 * 24 * 60 * 60 * 1000 : 10 * 60 * 1000;
      const token = issueReportToken(factPack.id, { ttl });
      touchReport(id, { factPackId: factPack.id });
      return sendJson(req, res, 200, {
        ok: true,
        act,
        id,
        system: factPack.system,
        factPackId: factPack.id,
        reused,
        reportUrl: reportUrl(factPack.id, token, factPack.system === 'hepan' ? '/api/hepan' : '/api/report'),
        exp: Date.now() + ttl,
      });
    } catch (e) {
      logError(e, 'reports ' + act);
      return sendJson(req, res, 400, { ok: false, error: e.message || '打开失败', code: 'BAD_INPUT' });
    }
  }

  return sendJson(req, res, 404, { ok: false, error: '未知接口: ' + urlPath });
}

const server = http.createServer(async (req, res) => {
  req.__t0 = Date.now();
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const ip = clientIp(req);

  const rl = rateLimit(ip, urlPath, req.method);
  if (!rl.ok) {
    return sendJson(req, res, 429, { ok: false, error: '操作太频繁，请稍后再试', code: 'RATE_LIMITED' }, 'no-store, must-revalidate');
  }

  try {
    if (urlPath.startsWith('/api/')) {
      let body = {};
      if (req.method === 'POST') {
        try {
          body = await readBody(req);
        } catch {
          return sendJson(req, res, 400, { ok: false, error: '请求格式有误，请检查 JSON 后重试', code: 'BAD_INPUT' });
        }
      }
      await handleApi(req, res, urlPath, body);
    } else {
      serveStatic(req, res, urlPath);
    }
  } catch (e) {
    logError(e, `UNHANDLED ${req.method} ${urlPath}`);
    sendJson(req, res, 500, { ok: false, error: '服务器开小差了，请稍后重试', code: 'INTERNAL' });
  }
});

server.listen(PORT, HOST, () => {
  try {
    enforceCachePolicy();
    const closed = closeExpiredOrders();
    if (closed) logInfo(`启动清理：关闭超时未支付订单 ${closed} 笔`);
  } catch {
    /* ignore */
  }
  logInfo(`服务启动监听 ${HOST}:${PORT}`);
  const lans = lanAddresses();
  console.log(`命理内容产品已启动: http://127.0.0.1:${PORT}`);
  console.log(`健康检查: http://127.0.0.1:${PORT}/api/health`);
  if (lans.length) {
    console.log('手机 / 平板同 Wi-Fi 可直接访问：');
    lans.forEach((ip) => console.log(`  http://${ip}:${PORT}`));
    console.log('（若手机打不开，多半是 Windows 防火墙拦截了该端口，允许一次即可）');
  } else {
    console.log('未探测到局域网地址，仅本机可访问。');
  }
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logInfo(`收到 ${signal}，开始优雅退出…`);
  server.close(() => {
    logInfo('已停止接收新连接，退出');
    process.exit(0);
  });
  setTimeout(() => {
    logInfo('优雅退出超时，强制退出');
    process.exit(0);
  }, 8000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { server };
