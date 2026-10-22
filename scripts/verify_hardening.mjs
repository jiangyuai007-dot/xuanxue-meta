#!/usr/bin/env node
/**
 * PM 门禁 · 服务端加固复验（长期保留，可反复跑）
 * 用法：node scripts/verify_hardening.mjs 8787
 * 退出码 0 = 全通过，1 = 有失败
 */
import fs from 'node:fs';
import http from 'node:http';

const PORT = Number(process.argv[2] || 8787);
const B = `http://127.0.0.1:${PORT}`;
const out = [];
const results = [];
const step = (n, ok, note) => { results.push({ n, ok, note }); out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${note ? ' — ' + note : ''}`); };
const log = (s) => out.push(s);

const postJson = async (p, body, headers = {}) => {
  const r = await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { /* ignore */ }
  return { s: r.status, j, h: r.headers };
};
const good = { type: 'bazi', year: 1990, month: 3, day: 15, hour: 14, minute: 30, city: '北京', calendar: 'gregorian', gender: 'male' };

(async () => {
  // 1) 入参校验：异常输入必须 400 + 中文 + 不泄漏堆栈
  const badCases = [
    ['空输入', {}],
    ['年份越界 1800', { ...good, year: 1800 }],
    ['非法日期 2000-02-31', { ...good, year: 2000, month: 2, day: 31 }],
    ['月份 13', { ...good, month: 13 }],
    ['小时 25', { ...good, hour: 25 }],
    ['城市不在白名单', { ...good, city: '火星市' }],
    ['未知体系', { ...good, type: 'foo' }],
  ];
  let leak = 0; let notBad = 0; let notZh = 0;
  for (const [name, body] of badCases) {
    const r = await postJson('/api/paipan', body);
    const err = r.j && r.j.error || '';
    if (r.s !== 400) notBad++;
    if (/Error|undefined|reading|at |stack|\.js:/i.test(err)) leak++;
    if (!/[一-龥]/.test(err)) notZh++;
    log(`  [${name}] status=${r.s} error=${JSON.stringify(err).slice(0, 90)}`);
  }
  step('非法入参全部 400', notBad === 0, `非400数量=${notBad}`);
  step('错误信息不泄漏堆栈/内部字段', leak === 0, `泄漏数量=${leak}`);
  step('错误信息为中文可读', notZh === 0, `非中文数量=${notZh}`);

  // 2) 正常输入仍可用
  let okCount = 0;
  for (const sys of ['bazi', 'liuyao', 'qimen', 'ziwei']) {
    const r = await postJson('/api/paipan', { ...good, type: sys });
    if (r.s === 200 && r.j && r.j.ok) okCount++;
  }
  step('四体系正常排盘 200', okCount === 4, `${okCount}/4`);

  // 3) 安全响应头
  const h = await (await fetch(B + '/bazi.html')).headers;
  const need = { 'x-content-type-options': 'nosniff', 'x-frame-options': null, 'referrer-policy': null, 'content-security-policy': null };
  const missing = Object.keys(need).filter((k) => !h.get(k));
  step('安全响应头齐备', missing.length === 0, missing.length ? '缺失=' + missing.join(',') : `nosniff=${h.get('x-content-type-options')}`);

  // 4) gzip（必须用原生 http 测：fetch/undici 会自动解压，量到的是解压后字节，会误判）
  const rawGet = (p, ae) => new Promise((res) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p, headers: { 'Accept-Encoding': ae } }, (r) => {
      let n = 0; r.on('data', (c) => { n += c.length; }); r.on('end', () => res({ ce: r.headers['content-encoding'] || '', bytes: n }));
    });
  });
  const gz = await rawGet('/app.js', 'gzip');
  const raw2 = await rawGet('/app.js', 'identity');
  step('启用 gzip 压缩', gz.ce === 'gzip' && gz.bytes < raw2.bytes * 0.9,
    `传输 ${raw2.bytes}B → ${gz.bytes}B（${(gz.bytes / raw2.bytes * 100).toFixed(0)}%）`);

  // 5) 限流（非白名单 IP）
  let codes = {};
  for (let i = 0; i < 80; i++) {
    const r = await postJson('/api/paipan', { ...good, type: 'qimen' }, { 'X-Forwarded-For': '203.0.113.7' });
    codes[r.s] = (codes[r.s] || 0) + 1;
  }
  step('限流生效（出现 429）', (codes[429] || 0) > 0, `状态码分布=${JSON.stringify(codes)}`);

  // 6) 缓存治理与内存上限
  const health = await (await fetch(B + '/api/health')).json();
  step('缓存文件数在治理上限内', health.cache.files <= 600, `files=${health.cache.files} bytes=${(health.cache.bytes / 1048576).toFixed(1)}MB`);

  // 7) 日志落盘
  const logDir = 'E:/WorkBuddy/xuanxue-meta/data/logs';
  const hasLog = fs.existsSync(logDir) && fs.readdirSync(logDir).length > 0;
  step('访问/错误日志已落盘', hasLog, hasLog ? fs.readdirSync(logDir).join(',') : '目录为空');

  fs.writeFileSync('E:/WorkBuddy/xuanxue-meta/.tail.log', out.join('\n'));
  const fails = results.filter((r) => !r.ok).length;
  console.log(out.join('\n'));
  console.log(`\n加固复验：${results.length - fails}/${results.length} 通过`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
