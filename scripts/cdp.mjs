/**
 * CDP（Chrome DevTools Protocol）公共库 —— 零依赖设备模拟驱动
 * 用法：
 *   const b = await withBrowser(async (br) => { const p = await br.page(url, {w,h,mobile}); ... });
 *   // p: { send(method, params), evaluate(js), shot(file), goto(url), waitSettle(ms), close() }
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME_CANDS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
export const CHROME = CHROME_CANDS.find((c) => fs.existsSync(c));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 挑一个空闲的调试端口。
 * 早期版本写死 9333：一旦上一次的 headless Chrome 没被回收干净，新实例绑不上 9333，
 * 却仍然继续跑 —— 结果页面被开到旧实例里，表现为 Page.navigate / captureScreenshot 随机超时。
 * 这里随机化端口 + 启动后确认就绪（withBrowser 内会校验），从根上避免串实例。
 */
function pickPort() {
  return 9333 + Math.floor(Math.random() * 500);
}

export class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; }

  static async open(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const s = new Session(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && s.pending.has(m.id)) {
        const { resolve, reject } = s.pending.get(m.id);
        s.pending.delete(m.id);
        m.error ? reject(new Error(m.method + ': ' + JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) s.handlers.forEach((h) => h(m));
    };
    // 浏览器进程被回收（ECONNRESET）时 socket 会抛 'error'：必须显式接管，
    // 否则未处理的 error 事件会让进程以退出码 1 结束，门禁脚本永远“失败”。
    ws.onerror = () => { /* 关闭期噪声，忽略 */ };
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

  onEvent(fn) { this.handlers.push(fn); }

  async evaluate(js) {
    const r = await this.send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('页面执行错误: ' + (r.exceptionDetails.text || '') + JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 200));
    return r.result ? r.result.value : undefined;
  }

  async goto(url, settleMs = 1200) {
    await this.send('Page.navigate', { url });
    await sleep(settleMs);
  }

  async shot(file, fullPage = false) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fullPage) {
      const m = await this.send('Page.getLayoutMetrics');
      const h = Math.min(8000, Math.ceil(m.cssContentSize ? m.cssContentSize.height : m.contentSize.height));
      await this.send('Emulation.setDeviceMetricsOverride', {
        width: this.vw, height: h, deviceScaleFactor: 1, mobile: this.mobile,
      });
      await sleep(500);
      const s = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
      // 还原视口
      await this.send('Emulation.setDeviceMetricsOverride', {
        width: this.vw, height: this.vh, deviceScaleFactor: 1, mobile: this.mobile,
      });
      await sleep(400);
    } else {
      const s = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
    }
    return file;
  }

  async emulate({ w, h, mobile }) {
    this.vw = w; this.vh = h; this.mobile = !!mobile;
    await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: !!mobile, maxTouchPoints: 5 });
  }

  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

/**
 * 启动 headless Chrome 并提供 page() 工厂；返回值 await 后自动杀进程。
 * @param {(br: {page: (opts:{url?:string,w:number,h:number,mobile?:boolean})=>Promise<Session & {close:()=>Promise<void>}>}) => Promise<T>} fn
 */
export async function withBrowser(fn, { dbg = pickPort(), extraArgs = [] } = {}) {
  if (!CHROME) throw new Error('未找到 Chrome');
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xuanxue-cdp-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${dbg}`, '--remote-allow-origins=*',
    `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', ...extraArgs, 'about:blank',
  ], { stdio: 'ignore' });

  const cleanup = () => { try { chrome.kill(); } catch { /* ignore */ } try { fs.rmSync(userDir, { recursive: true, force: true }); } catch { /* ignore */ } };
  try {
    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      try {
        const r = await fetch(`http://127.0.0.1:${dbg}/json/version`);
        if (r.ok) { ready = true; break; }
      } catch { /* not yet */ }
      await sleep(250);
    }
    // 起不来就别硬闯：否则会连到别的 Chrome 实例上（旧实例占着端口 → 页面开错浏览器 → 各种诡异超时）
    if (!ready) throw new Error(`Chrome 调试端口 ${dbg} 未在 15s 内就绪，疑似被其他实例占用`);
    const api = {
      async page({ url = 'about:blank', w = 375, h = 812, mobile = true } = {}) {
        const r = await fetch(`http://127.0.0.1:${dbg}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
        const t = await r.json();
        const s = await Session.open(t.webSocketDebuggerUrl);
        await s.send('Page.enable');
        await s.send('Runtime.enable');
        await s.emulate({ w, h, mobile });
        await sleep(300);
        // 关闭标签：只关 WebSocket，不再发 HTTP /json/close —— 浏览器进程结束时统一回收，
        // 避免并发关闭时大量 fetch 拒绝引发未处理拒绝递归刷屏（RangeError）。
        const close = async () => { try { s.close(); } catch { /* ignore */ } };
        return Object.assign(s, { close });
      },
    };
    return await fn(api);
  } finally {
    cleanup();
  }
}
