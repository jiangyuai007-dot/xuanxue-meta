/**
 * 可观测性：访问日志 + 错误日志，按天切分落盘到 data/logs/
 * 零第三方依赖，仅用 node:fs/node:path。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOG_DIR = path.join(ROOT, 'data', 'logs');

function pad(n) {
  return String(n).padStart(2, '0');
}
function dateStamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function timeStamp(d) {
  return `${dateStamp(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

let ensured = false;
function ensure() {
  if (ensured) return;
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    ensured = true;
  } catch {
    /* 日志目录不可写不应影响主流程 */
  }
}

function append(name, line) {
  ensure();
  try {
    fs.appendFileSync(path.join(LOG_DIR, name), line + '\n', 'utf8');
  } catch {
    /* 忽略写入失败 */
  }
}

/** 访问日志：时间/IP/方法/路径/状态码/耗时ms */
export function logAccess({ ip, method, path, status, ms }) {
  append(`access-${dateStamp(new Date())}.log`, `${timeStamp(new Date())} ${ip} ${method} ${path} ${status} ${ms}ms`);
}

/** 错误日志落盘（含堆栈），便于事后排查 */
export function logError(err, ctx = '') {
  const when = timeStamp(new Date());
  const stack = err && err.stack ? err.stack : String(err);
  append(`error-${dateStamp(new Date())}.log`, `${when} ${ctx}\n${stack}\n`);
}

/** 普通信息日志（启动、关停、清理等） */
export function logInfo(line) {
  append(`app-${dateStamp(new Date())}.log`, `${timeStamp(new Date())} ${line}`);
}
