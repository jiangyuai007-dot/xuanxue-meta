/**
 * 内部小工具：raw HTTP 探针（非门禁）。
 * 用法：node scripts/p2_http.mjs <path> [method] [json body]
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const path = process.argv[2] || '/api/health';
const method = (process.argv[3] || 'GET').toUpperCase();
const body = process.argv[4];
const opt = { method, headers: {} };
if (body) {
  opt.headers['Content-Type'] = 'application/json';
  opt.body = body;
}
const t0 = Date.now();
const r = await fetch(BASE + path, opt);
const txt = await r.text();
console.log(`STATUS=${r.status} ${Date.now() - t0}ms CT=${r.headers.get('content-type') || ''}`);
console.log(txt.slice(0, 1200));
process.exit(0);
