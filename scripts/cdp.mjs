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
import http from 'node:http';
import crypto from 'node:crypto';

/* —— Node 18 零依赖 RFC6455 WebSocket 客户端垫片（Node 21+ 直接使用原生 globalThis.WebSocket） —— */
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class MiniWebSocket {
    constructor(url) {
      this.url = url;
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.onclose = null;
      this._socket = null;
      this._buf = Buffer.alloc(0);
      this._connect();
    }
    _connect() {
      const u = new URL(this.url);
      const key = crypto.randomBytes(16).toString('base64');
      const req = http.request({
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13',
        },
      });
      req.on('upgrade', (res, socket, head) => {
        this._socket = socket;
        if (head && head.length) this._onData(head);
        socket.on('data', (chunk) => this._onData(chunk));
        socket.on('error', (err) => { if (this.onerror) this.onerror(err); });
        socket.on('close', () => { if (this.onclose) this.onclose(); });
        if (this.onopen) this.onopen();
      });
      req.on('error', (err) => { if (this.onerror) this.onerror(err); });
      req.end();
    }
    _onData(chunk) {
      this._buf = Buffer.concat([this._buf, chunk]);
      while (this._buf.length >= 2) {
        const b0 = this._buf[0];
        const b1 = this._buf[1];
        const opcode = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let len = b1 & 0x7f;
        let offset = 2;
        if (len === 126) {
          if (this._buf.length < 4) return;
          len = this._buf.readUInt16BE(2);
          offset = 4;
        } else if (len === 127) {
          if (this._buf.length < 10) return;
          len = Number(this._buf.readBigUInt64BE(2));
          offset = 10;
        }
        const maskLen = masked ? 4 : 0;
        if (this._buf.length < offset + maskLen + len) return;
        let payload = this._buf.subarray(offset + maskLen, offset + maskLen + len);
        if (masked) {
          const mask = this._buf.subarray(offset, offset + 4);
          payload = Buffer.from(payload);
          for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        }
        this._buf = this._buf.subarray(offset + maskLen + len);
        if (opcode === 0x01 && this.onmessage) {
          this.onmessage({ data: payload.toString('utf8') });
        } else if (opcode === 0x08) {
          this.close();
          return;
        } else if (opcode === 0x09) {
          this._sendFrame(0x0a, payload);
        }
      }
    }
    _sendFrame(opcode, dataBuf) {
      if (!this._socket || this._socket.destroyed) return;
      const mask = crypto.randomBytes(4);
      const len = dataBuf.length;
      let head;
      if (len < 126) {
        head = Buffer.alloc(2);
        head[0] = 0x80 | opcode;
        head[1] = 0x80 | len;
      } else if (len < 65536) {
        head = Buffer.alloc(4);
        head[0] = 0x80 | opcode;
        head[1] = 0x80 | 126;
        head.writeUInt16BE(len, 2);
      } else {
        head = Buffer.alloc(10);
        head[0] = 0x80 | opcode;
        head[1] = 0x80 | 127;
        head.writeBigUInt64BE(BigInt(len), 2);
      }
      const masked = Buffer.alloc(len);
      for (let i = 0; i < len; i++) masked[i] = dataBuf[i] ^ mask[i & 3];
      this._socket.write(Buffer.concat([head, mask, masked]));
    }
    send(str) {
      this._sendFrame(0x01, Buffer.from(String(str), 'utf8'));
    }
    close() {
      try { if (this._socket) this._socket.destroy(); } catch { /* ignore */ }
    }
  };
}

const CHROME_CANDS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];
export const CHROME = CHROME_CANDS.find((c) => fs.existsSync(c));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

export async function withBrowser(fn, { dbg = pickPort(), extraArgs = [] } = {}) {
  if (!CHROME) throw new Error('未找到 Chrome');
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xuanxue-cdp-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${dbg}`, '--remote-allow-origins=*',
    `--user-data-dir=${userDir}`, '--no-proxy-server', '--no-first-run', '--no-default-browser-check',
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
        const close = async () => { try { s.close(); } catch { /* ignore */ } };
        return Object.assign(s, { close });
      },
    };
    return await fn(api);
  } finally {
    cleanup();
  }
}
