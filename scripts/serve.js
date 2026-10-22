/**
 * 本地服务启动器（前台运行）
 * - 自动从 8787 起寻找空闲端口，避免端口冲突直接退出
 * - 服务与启动器同进程：窗口存活即服务存活，关闭窗口即停止
 * - 服务 ready 后自动打开浏览器
 * 运行：node scripts/serve.js
 */
import net from 'node:net';
import os from 'node:os';
import { exec } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// —— 日志落盘：所有输出同时写入 data/serve.log，便于排查 ——
const LOG = path.join(ROOT, 'data', 'serve.log');
function appendLog(line) {
  try { fs.appendFileSync(LOG, line + '\n'); } catch { /* 忽略日志写入失败 */ }
}
console.log = ((orig) => (...a) => { orig(...a); appendLog(a.join(' ')); })(console.log.bind(console));
console.error = ((orig) => (...a) => { orig(...a); appendLog('[ERR] ' + a.join(' ')); })(console.error.bind(console));
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
}

function isPortFree(port) {
  // 必须与服务的监听地址一致（默认 0.0.0.0）；若这里只探测 127.0.0.1，
  // 已运行的 0.0.0.0 实例会让探测"看起来空闲"，从而端口漂移到下一个，导致用户按 8787 打开却打不开。
  const host = process.env.HOST || '0.0.0.0';
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

/** 本机非回环 IPv4：给手机/平板在同 Wi-Fi 下访问 */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

async function findPort(start = 8787, tries = 30) {
  for (let p = start; p < start + tries; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`未能在 ${start} ~ ${start + tries - 1} 范围内找到空闲端口`);
}

/** 指定端口上是否已经有一个健康的实例 */
async function probeHealth(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`);
    if (!r.ok) return false;
    const j = await r.json();
    return !!j.ok;
  } catch {
    return false;
  }
}

/** 拉起默认浏览器（自启场景用 XZ_NO_BROWSER=1 跳过） */
function openBrowser(url) {
  if (process.env.XZ_NO_BROWSER === '1') return;
  setTimeout(() => {
    try {
      exec(`start "" "${url}"`);
      log('[就绪] 已在浏览器打开 ' + url);
    } catch {
      log('[提示] 未能自动打开浏览器，请手动访问 ' + url);
    }
  }, 900);
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'src', 'server', 'index.js'))) {
    console.error('[错误] 未找到 src/server/index.js，请确认项目目录完整：' + ROOT);
    process.exit(1);
  }

  const PREFERRED = Number(process.env.PORT || 8787);

  // 已有一个实例在跑（含助手后台拉起的）：直接复用并打开，避免端口漂移到 8788 造成"按旧地址打不开"
  const alive = await probeHealth(PREFERRED);
  if (alive) {
    const url = `http://127.0.0.1:${PREFERRED}`;
    log('============================================');
    log('  玄机 · 东方命理内容平台  —  本地服务');
    log('  检测到服务已在运行，直接复用：' + url);
    lanAddresses().forEach((ip) => log('  手机/平板（同一 Wi-Fi）: http://' + ip + ':' + PREFERRED));
    log('============================================');
    openBrowser(url);
    return;
  }

  const port = await findPort(PREFERRED);
  process.env.PORT = String(port);
  const url = `http://127.0.0.1:${port}`;

  log('============================================');
  log('  玄机 · 东方命理内容平台  —  本地服务');
  log('  本机访问: ' + url);
  const lans = lanAddresses();
  if (lans.length) {
    lans.forEach((ip) => log('  手机/平板（同一 Wi-Fi）: http://' + ip + ':' + port));
    log('  手机打不开时：多半是防火墙拦了端口，允许一次即可');
  } else {
    log('  未探测到局域网地址，仅本机可访问');
  }
  log('  关闭本窗口（或按 Ctrl+C）即停止服务');
  log('============================================');

  // 等服务监听后再打开浏览器（XZ_NO_BROWSER=1 时跳过，供开机自启使用）
  openBrowser(url);

  await import('../src/server/index.js');
}

main().catch((e) => {
  console.error('[启动失败] ' + (e && e.message ? e.message : String(e)));
  console.error('请检查上方报错信息，或确认 Node 可用后重试。');
  process.exit(1);
});