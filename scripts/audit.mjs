#!/usr/bin/env node
/**
 * 真机级验收工具（PM 用）· CDP 版
 *
 * 为什么不用 --window-size：Windows 上 headless Chrome 有约 500px 最小窗宽，
 * 且 --force-device-scale-factor 不参与 --window-size 换算，导致 375 视口实测失真。
 * 本工具改用 Chrome DevTools Protocol 的 Emulation.setDeviceMetricsOverride，
 * 视口由协议强制指定，与宿主窗口无关，因此 360/375/414 都是真的。
 *
 * 产出：
 *  - shots/<vp>_<page>.png        真视口截图
 *  - shots/<vp>_<page>.scroll.png 整页长图（报告态更真实）
 *  - .audit.json / .audit.log     结构化审计结果
 * 不合格退出码 2。
 *
 * 用法：node scripts/audit.mjs [port] [--only=m] [--full]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SHOTS = path.join(ROOT, 'shots');
const PORT = Number(process.argv[2] || 8787);
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const FULL = process.argv.includes('--full');
const CHROME_CANDS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = CHROME_CANDS.find((c) => fs.existsSync(c));
if (!CHROME) { console.error('未找到 Chrome'); process.exit(1); }

fs.mkdirSync(SHOTS, { recursive: true });
const PAGES = ['bazi.html', 'liuyao.html', 'qimen.html', 'ziwei.html'];
const VIEWPORTS = [
  { name: 's', w: 360, h: 780, mobile: true },
  { name: 'm', w: 375, h: 812, mobile: true },
  { name: 'l', w: 414, h: 896, mobile: true },
  { name: 't', w: 768, h: 1024, mobile: true },
  { name: 'd', w: 1280, h: 900, mobile: false },
].filter((v) => !ONLY || v.name === ONLY);

const DBG = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- Chrome 启动
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xuanxue-cdp-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${DBG}`, '--remote-allow-origins=*',
  `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

async function waitReady() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${DBG}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* not yet */ }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

// ---------------------------------------------------------------- CDP 会话
class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.onEvent = () => {}; }

  static async open(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Session(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && s.pending.has(m.id)) {
        const { resolve, reject } = s.pending.get(m.id);
        s.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) s.onEvent(m);
    };
    return s;
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP 超时: ' + method)); } }, 30000);
    });
  }

  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

async function newTab(url) {
  const r = await fetch(`http://127.0.0.1:${DBG}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const t = await r.json();
  return t;
}
async function closeTab(id) {
  try { await fetch(`http://127.0.0.1:${DBG}/json/close/${id}`); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- 审计脚本（页面内执行）
const AUDIT_JS = `(() => {
  const de = document.documentElement;
  const cw = de.clientWidth;
  const bad = [], small = [], tiny = [], clipped = [];
  const desc = (el) => {
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).join('.');
    const id = el.id ? '#' + el.id : '';
    return el.tagName.toLowerCase() + id + (cls ? '.' + cls : '');
  };
  const inScroller = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') return true;
      p = p.parentElement;
    }
    return false;
  };
  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    if (r.right > cw + 1 && !inScroller(el)) {
      bad.push(desc(el) + ' right=' + Math.round(r.right));
    }
    // 文本被容器裁掉（溢出隐藏且内容更宽）
    if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis') {
      clipped.push(desc(el) + ' sw=' + el.scrollWidth + '>cw=' + el.clientWidth);
    }
    // 过小字号
    const fs = parseFloat(cs.fontSize);
    if (el.children.length === 0 && (el.textContent || '').trim().length > 1 && fs < 11) {
      tiny.push(desc(el) + ' ' + fs + 'px');
    }
  });
  document.querySelectorAll('button,select,input,a.btn,[role=button],label.chk,label.leap,.seg>button').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.height < 32) {
      small.push(desc(el) + ' h=' + Math.round(r.height));
    }
  });
  const worst = bad.length ? Math.round(Math.max(...bad.map((s) => Number(s.split('right=')[1])))) - cw : 0;
  return JSON.stringify({
    cw, sw: de.scrollWidth,
    overflow: Math.max(0, de.scrollWidth - cw),
    elOverflow: Math.max(0, worst),
    smallTap: small.length,
    clipped: clipped.length,
    tinyFont: tiny.length,
    bad: bad.slice(0, 14), small: small.slice(0, 10),
    clipList: clipped.slice(0, 8), tinyList: tiny.slice(0, 8),
  });
})()`;

const SETTLE_JS = `(document.readyState === 'complete')`;

async function shootPage(vp, page) {
  const url = `http://127.0.0.1:${PORT}/${page}?t=${Date.now()}`;
  const tab = await newTab(url);
  const s = await Session.open(tab.webSocketDebuggerUrl);
  try {
    await s.send('Page.enable');
    await s.send('Runtime.enable');
    await s.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.mobile,
    });
    await s.send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile, maxTouchPoints: 5 });
    await s.send('Page.navigate', { url });
    // 等页面稳定
    for (let i = 0; i < 40; i += 1) {
      await sleep(300);
      const r = await s.send('Runtime.evaluate', { expression: SETTLE_JS, returnByValue: true });
      if (r.result && r.result.value === true && i >= 3) break;
    }
    await sleep(900);
    const ev = await s.send('Runtime.evaluate', { expression: AUDIT_JS, returnByValue: true });
    const d = JSON.parse(ev.result.value);
    d.viewport = vp.name; d.wantW = vp.w; d.page = page;
    d.drift = Math.abs(d.cw - vp.w);

    const shot = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(SHOTS, `${vp.name}_${page.replace('.html', '')}.png`), Buffer.from(shot.data, 'base64'));

    if (FULL && vp.name !== 'd') {
      const m = await s.send('Page.getLayoutMetrics');
      const h = Math.min(6000, Math.ceil(m.contentSize.height));
      await s.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: h, deviceScaleFactor: 1, mobile: vp.mobile });
      await sleep(600);
      const shot2 = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(SHOTS, `${vp.name}_${page.replace('.html', '')}.scroll.png`), Buffer.from(shot2.data, 'base64'));
    }
    return d;
  } finally {
    s.close();
    await closeTab(tab.id);
  }
}

// ---------------------------------------------------------------- 主流程
(async () => {
  let ver;
  try { ver = await waitReady(); } catch (e) { console.error(String(e)); chrome.kill(); process.exit(1); }
  console.log(`Chrome ${(ver.Browser || '').split(' ').pop()} 已就绪 · 端口 ${DBG}\n`);

  const results = [];
  for (const vp of VIEWPORTS) {
    for (const p of PAGES) {
      try {
        const d = await shootPage(vp, p);
        results.push(d);
        const bad = d.overflow > 0 || d.elOverflow > 0 || d.smallTap > 0 || d.clipped > 0 || d.tinyFont > 0;
        const drift = d.drift > 2;
        console.log(`${bad || drift ? 'FAIL' : 'OK  '} ${vp.name} ${p.padEnd(12)} 视口=${d.cw}/${vp.w}${drift ? '(失真!)' : ''} 溢出=${d.overflow} 越界=${d.elOverflow} 小触控=${d.smallTap} 文本裁切=${d.clipped} 小字=${d.tinyFont}`);
        if (d.bad.length) console.log('       越界: ' + d.bad.join(' | '));
        if (d.small.length) console.log('       小触控: ' + d.small.join(', '));
        if (d.clipList.length) console.log('       裁切: ' + d.clipList.join(' | '));
        if (d.tinyList.length) console.log('       小字: ' + d.tinyList.join(', '));
      } catch (e) {
        console.log(`ERR  ${vp.name} ${p} ${String(e.message || e).slice(0, 160)}`);
        results.push({ viewport: vp.name, page: p, error: String(e.message || e) });
      }
    }
  }

  fs.writeFileSync(path.join(ROOT, '.audit.json'), JSON.stringify(results, null, 1));
  const fails = results.filter((r) => !r.error && (r.overflow > 0 || r.elOverflow > 0 || r.smallTap > 0 || r.clipped > 0 || r.tinyFont > 0 || r.drift > 2)).length;
  const errs = results.filter((r) => r.error).length;
  console.log(`\n视口数=${VIEWPORTS.length} 页面数=${PAGES.length} 不合格=${fails} 错误=${errs}`);
  chrome.kill();
  process.exit(fails || errs ? 2 : 0);
})();
