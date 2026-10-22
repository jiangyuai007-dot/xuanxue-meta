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
import { renderReportPage, TEMPLATE_CSS } from '../report/templates/bazi.js';
import { renderHePanPage, hepanLocalChapters } from '../report/templates/hepan.js';
import { listChapters } from '../core/reportPlan.js';
import { sessionUserOf, resolvePurchased, buildReport } from '../ai/service.js';
import { computeHePan } from '../engines/hepan.js';
import { CITIES } from '../core/time.js';
import {
  listSkus, createOrder, payOrder, getOrder, unlockedSections, orderStats, SECTION_PRICE, skuSectionKeys,
  listOrders, refundOrder, confirmPaid, markConsumed, closeExpiredOrders,
} from '../commerce/sku.js';
import { entitledSections } from '../commerce/entitle.js';
import { listChannels, handleNotify } from '../commerce/pay/index.js';
import { register as accountRegister, login as accountLogin, verifySession, logout as accountLogout, userStats } from '../account/user.js';
import { saveReport, listReports, getReport, getReportByPackId, removeReport, touchReport } from '../account/reportstore.js';
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
// 默认监听全部网卡：手机/平板需通过局域网 IP 访问做真机验收。
// 只想本机访问时，用 HOST=127.0.0.1 启动即可。
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
  '.png': 'image/png', '.ico': 'image/x-icon',
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
 * @param {object} req
 * @param {object} res
 * @param {{status:number, contentType:string, buf:Buffer, cacheControl?:string, extraHeaders?:object}} opt
 */
function respond(req, res, { status, contentType, buf, cacheControl, extraHeaders = {} }) {
  // 待附加头（首次下发的设备 cookie）优先级最低，显式 extraHeaders 可覆盖
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
  // 根路径 302 到八字独立页（四体系已拆分为独立页面）
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
  const mime = MIME[ext] || 'application/octet-stream';
  // HTML 仍 no-store（保证改版即时生效）；其余静态资源 public + max-age + ETag。
  let cacheControl = 'no-store, must-revalidate';
  const extra = {};
  if (ext !== '.html') {
    cacheControl = 'public, max-age=300';
    extra['ETag'] = '"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"';
  }
  respond(req, res, { status: 200, contentType: mime, buf, cacheControl, extraHeaders: extra });
}

async function handleApi(req, res, urlPath, body) {
  if (urlPath === '/api/health') {
    return sendJson(req, res, 200, { ok: true, ts: new Date().toISOString(), cache: cacheStats(), orders: orderStats(), reports: reports.size });
  }
  if (urlPath === '/api/cities' && req.method === 'GET') {
    return sendJson(req, res, 200, { cities: CITIES });
  }
  if (urlPath === '/api/skus' && req.method === 'GET') {
    return sendJson(req, res, 200, { skus: listSkus() });
  }
  // 章节卡样式：让前端报告区挂一次 <link> 即可复用渲染层的唯一一份 CSS
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
      reports.set(fp.id, { factPack: fp, interpretation: null });
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
    // 复用已生成报告时跳过输入校验；否则必须先校验入参
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
      // 生成全量（已解锁）解读作为唯一数据来源：锁定章节的「钩子」与解锁后的正文
      // 都来自同一份经过合规网关（gateSections）的文本，杜绝绕过合规出口。
      const full = await interpret(fp, { unlocked: paidKeys });
      // 已购集合：等价迁移到 ai/service.resolvePurchased（行为与上面三路径完全一致）。
      // 核心不变：只认「服务端签发的权益凭证」或「服务端已支付订单」，前端传来的
      // purchased 裸章节键数组一律不采信（可伪造，等于白送全部付费内容）。
      const purchasedSet = resolvePurchased({ system, body, req });
      if (Array.isArray(body.purchased)) logError(new Error('收到已废弃的 purchased 字段，已忽略（防伪造）'), 'report deprecated-field');
      // 登录态在响应里还要用（user 字段），这里只取一次
      const sessionUser = sessionUserOf(req);
      const sections = full.sections.map((s) => {
        // 所有章节都下发字数：锁定章用于「解锁后可读约 N 字」，已解锁章保持字段一致，
        // 避免前端在已解锁状态下读到 undefined 而显示「约 0 字」。
        const gated = s.text || '';
        const rawBody = gated.includes(DISCLAIMER) ? gated.slice(0, gated.indexOf(DISCLAIMER)) : gated;
        const clean = rawBody.replace(/\s+/g, ' ').trim();
        const words = rawBody.replace(/\s+/g, '').length;
        // 免费章节（不在付费键表中）或已购章节 → 直接给完整内容
        if (!paidKeys.includes(s.key) || purchasedSet.has(s.key)) {
          return { ...s, preview: false, words };
        }
        // 锁定章节：截取合规正文前 120 字作为「钩子」（真实内容，非编造），不暴露解锁后全文。
        // 原实现在此拼接免责声明，现改由 DISCLAIMER_ENABLED 总开关控制（当前关闭）。
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
      reports.set(fp.id, { factPack: fp, interpretation });
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
        // 报告页访问令牌（10 分钟有效）：报告页/分享卡必须带 ?t= 才能打开，防止 URL 转发泄露命盘
        reportToken: issueReportToken(fp.id, { ttl: 10 * 60 * 1000 }),
        reportUrl: reportUrl(fp.id, issueReportToken(fp.id, { ttl: 10 * 60 * 1000 })),
      });
    } catch (e) {
      logError(e, 'report build');
      return sendJson(req, res, 500, { ok: false, error: '服务器开小差了，请稍后重试', code: 'INTERNAL' });
    }
  }

// ---------------------------------------------------------------- 报告流式生成（SSE 逐章）

/** SSE 起手：禁一切中间层缓冲，否则逐章推送会被攒成一坨 */
function sseStart(res) {
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx 反向代理默认会缓冲响应体，这行告诉它别管
    'X-Accel-Buffering': 'no',
  });
  res.write(': ok\n\n');
}

function sseSend(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** 心跳 + 收尾：心跳只为让代理层别掐连接 */
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

/** 取查询串（URL 解析失败时退化成空 Map，不阻断主流程） */
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
    // 复用判定必须早于下面「先落盘」那步：saved 一写进 LRU 就把上一份章节卡盖成空数组了
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
    // 先落 LRU：即使客户端中途断开，整页报告 / 分享卡仍可用（结果不丢）
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
      // 已生成过：直接回放，绝不二次烧 AI 额度
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

/** 合盘缓存 id：由双方输入稳定序列化而来（换顺序也算同一份合盘，可直接复用） */
function hepanIdOf(a, b, names) {
  const stable = (o) => JSON.stringify(o || {}, Object.keys(o || {}).sort());
  const str = `${stable(a)}|${stable(b)}|${stable(names || {})}`;
  return 'hepan:' + crypto.createHash('sha1').update(str).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------- 云历史归属（P0-2）
//
// 游客身份用服务端下发的随机 httpOnly cookie，而不是前端传来的设备字符串：
// 后者可被伪造去枚举/读取别人的历史（前端那份 localStorage 时代的老毛病）。
// SameSite=Lax：跨站表单/脚本带不来这个 cookie，所以删除与续期动作天然防 CSRF。

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

/** 本请求待附加的响应头（respond 出口统一合并：显式 extraHeaders 优先） */
function pendingHeaders(res) {
  if (!res.__extra) res.__extra = {};
  return res.__extra;
}

/** 游客设备 ID：没有就现发一个 httpOnly cookie（首次访问 /api/reports* 时下发） */
function ensureDid(req, res) {
  const cur = didOf(req);
  if (cur) return cur;
  const did = crypto.randomBytes(16).toString('hex');
  pendingHeaders(res)['Set-Cookie'] =
    `${DID_COOKIE}=${did}; Path=/; Max-Age=${DID_MAX_AGE_SEC}; HttpOnly; SameSite=Lax`;
  return did;
}

/** 归属：登录用户走 uid，游客走 did；返回的是「写库用的 owner 串」 */
function ownerOf(req, res) {
  const u = sessionUserOf(req);
  if (u) return { owner: 'uid:' + u.id, user: u };
  return { owner: 'did:' + ensureDid(req, res), user: null };
}

/**
 * 按云历史记录重排命盘（确定性：同参数永远同一份盘）。
 * 只做「排盘」这一层（不调 AI、不生成章节），生成报告走原有的 /api/report/stream 链路。
 * @param {object} rec 云历史记录（含 payload）
 * @returns {{ factPack:object, reused:boolean }}
 */
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
    reports.set(pack.id, {
      factPack: pack,
      interpretation: null,
      ai: { source: 'ai', aiCount: 0, cacheCount: 0, localCount: 0, chapters: [] },
      generatedAt: Date.now(),
    });
    return { factPack: pack, reused: false };
  }
  const v = validateInput(payload);
  if (!v.ok) throw new Error(v.error);
  const fp = build(payload);
  const reused = reports.has(fp.id);
  if (!reused) {
    reports.set(fp.id, { factPack: fp, interpretation: null, ai: { source: 'ai', aiCount: 0, cacheCount: 0, localCount: 0, chapters: [] }, generatedAt: Date.now() });
  }
  return { factPack: fp, reused };
}

/**
 * 取命盘：内存 LRU 优先；没命中就回落到云历史记录重建（重启服务后老分享链接依然能开）。
 * @param {string} id factPackId
 */
function loadEntry(id) {
  const hit = id && reports.get(id);
  if (hit && hit.factPack) return hit;
  const rec = getReportByPackId(id);
  if (!rec) return null;
  // 云历史重建只保证能重排出命盘，没有 AI 章节 → 走本地规则解读
  return { factPack: rebuildFromRecord(rec).factPack, interpretation: null, ai: null };
}

function loadPack(id) {
  const e = loadEntry(id);
  return e ? e.factPack : null;
}

/** 合盘排盘接口：双方各排一次盘（本地确定性），再算跨盘关系 */
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

    // 复用已有合盘时直接回盘图与指数，不重算（排盘引擎开销已在 factpack 缓存里）
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

/** 合盘报告流：SSE 逐章 / ?mode=json 一次性 */
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
    // 复用判定必须早于「先落盘」那步（与 /api/report/stream 同一个坑，别再踩第二遍）
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
    // 先落 LRU：客户端中途断开，整页报告与分享卡仍可用
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

// ---------------------------------------------------------------- 账号（登录后才可查订单/退款）

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
    if (r.status === 'paid') confirmPaid(r.orderId, { tradeNo: r.tradeNo });
    return sendJson(req, res, 200, { ok: true });
  } catch (e) {
    logError(e, 'pay notify');
    return sendJson(req, res, 400, { ok: false, error: e.message || '回调处理失败', code: 'BAD_INPUT' });
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
    // 归属校验：只能退本人订单（游客订单未绑账号，需先登录绑定）
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
      // 下单错误来自商业层，已为中文业务提示，不泄露内部字段
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
    // 分享卡同报告页：命盘属个人隐私，必须带有效访问令牌（先判存在 → 404，再判令牌 → 403）
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
    // 内存表没命中（重启 / LRU 淘汰过）时，回落到云历史记录按参数重排：
    // 老分享链接不会因为服务重启而变成「报告不存在」。
    const pack = loadPack(htmlMatch[1]);
    if (!pack) {
      return respond(req, res, { status: 404, contentType: 'text/plain; charset=utf-8', buf: Buffer.from('报告不存在，请先生成报告', 'utf8'), cacheControl: 'no-store' });
    }
    const rec = { factPack: pack };
    // P0 隐私修复：报告页含完整命盘与出生时间，必须校验访问令牌，禁止仅凭 URL 直取
    if (!verifyReportToken(htmlMatch[1], reportTokenOf(req))) {
      return respond(req, res, { status: 403, contentType: 'text/plain; charset=utf-8', buf: Buffer.from('报告链接已失效，请重新生成', 'utf8'), cacheControl: 'no-store' });
    }
    let html;
    if (rec.ai && Array.isArray(rec.ai.chapters) && rec.ai.chapters.length) {
      // AI 固定骨架版式：与逐章推送、整页报告同一套渲染层（AI 只填 slot，版式写死）
      // 按体系选整页模板：合盘有独立抬头（契合指数/分档）与双栏排盘区，不能套八字那版
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
      // 本地规则兜底：服务重启后从云历史重建的合盘没有 AI 章节
      // （注意不能走 interpret()，它的 BUILDERS 没登记 hepan，硬调会抛「无解读器」）
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
  //
  // 只存「输入参数 + 标签」，打开时按参数确定性重排：体积小、隐私面小，且与现有
  // /api/report/stream 完全复用（同样的缓存命中逻辑，第二次打开走内存表）。
  // 游客也能存（httpOnly 设备 cookie），登录后可跨设备。

  if (urlPath === '/api/reports' && req.method === 'POST') {
    try {
      const rec = body.record || body;
      const system = String(rec.system || rec.type || '');
      if (!['bazi', 'liuyao', 'qimen', 'ziwei', 'hepan'].includes(system)) {
        return sendJson(req, res, 400, { ok: false, error: '不支持的体系类型', code: 'BAD_INPUT' });
      }
      const { owner } = ownerOf(req, res);
      if (!owner) return sendJson(req, res, 401, { ok: false, error: '保存失败，请刷新页面重试', code: 'UNAUTHORIZED' });
      // 参数校验与重建完全同构：先过一遍校验，避免把非法输入写进历史（否则以后永远打不开）
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
    // 归属校验：游客靠 did、登录用户靠 uid，两者都不匹配一律当不存在（不泄露「存在但不属于你」）
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
    // 归属校验：不是自己的，一律 404（比对 403 更少泄露信息）
    if (rec.owner !== owner) {
      return sendJson(req, res, 404, { ok: false, error: '报告不存在或已删除', code: 'NOT_FOUND' });
    }
    try {
      const { factPack, reused } = rebuildFromRecord(rec);
      // 打开 → 10 分钟短令牌（自己看）；分享 → 7 天长令牌（可转发给他人）
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

  // 限流（按 IP + 接口维度；本地回环白名单免限流）
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
  // 启动时清理一次过期/超额缓存，并关闭超时未支付订单
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

/* —— 优雅退出：处理 SIGINT/SIGTERM，先停收新连接再强制退出 —— */
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logInfo(`收到 ${signal}，开始优雅退出…`);
  server.close(() => {
    logInfo('已停止接收新连接，退出');
    process.exit(0);
  });
  // 超时强制退出，避免 keep-alive 连接拖死关停
  setTimeout(() => {
    logInfo('优雅退出超时，强制退出');
    process.exit(0);
  }, 8000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { server };
