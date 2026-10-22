/**
 * 后台常驻启动 HTTP 服务。
 *
 * 为什么需要这个脚本：本机 Bash 包装器不稳定（缺少 coreutils，进程组会被回收），
 * 直接用 `node src/server/index.js &` 启动的服务常随父 shell 一起被杀。
 * 本脚本在 Windows 上改用 Start-Process 脱离当前 Job Object 启动，父进程退出后服务仍存活。
 *
 * 用法：node scripts/start.js
 * 日志：data/server.log / data/server.err.log
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const serverPath = path.join(root, 'src', 'server', 'index.js');
const outLog = path.join(dataDir, 'server.log');
const errLog = path.join(dataDir, 'server.err.log');
const PORT = process.env.PORT || '8787';
const URL = `http://127.0.0.1:${PORT}`;

const out = (s) => fs.writeSync(1, s + '\n');

async function alive() {
  try {
    const r = await fetch(`${URL}/api/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function waitAlive(ms = 10000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await alive()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

if (await alive()) {
  out(`服务已在运行: ${URL}`);
  process.exit(0);
}

if (process.platform === 'win32') {
  const ps = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process -FilePath '${process.execPath}' -ArgumentList '${serverPath}' -WorkingDirectory '${root}' -WindowStyle Hidden -RedirectStandardOutput '${outLog}' -RedirectStandardError '${errLog}'`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let err = '';
  ps.stderr.on('data', (d) => (err += d));
  await new Promise((r) => ps.on('exit', r));
  if (err.trim()) out(`[warn] ${err.trim()}`);
} else {
  const log = fs.openSync(outLog, 'a');
  const child = spawn(process.execPath, [serverPath], {
    cwd: root,
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();
  out(`SPAWNED pid=${child.pid}`);
}

const ok = await waitAlive();
out(ok ? `服务已启动: ${URL}` : `启动失败，请查看 ${errLog} 或 ${outLog}`);
out(`日志: ${outLog}`);
process.exit(ok ? 0 : 1);
