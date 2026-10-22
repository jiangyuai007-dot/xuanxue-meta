/**
 * 等待服务就绪（内部小工具，非门禁）：轮询 /api/health 直到 READY。
 * 用法：node scripts/p2_wait_ready.mjs [超时毫秒，默认 30000]
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const LIMIT = Number(process.argv[2] || 30000);
const t0 = Date.now();
for (;;) {
  try {
    const r = await fetch(BASE + '/api/health');
    const j = await r.json();
    if (j.ok === true || j.status === 'READY' || j.status === 'ok') {
      console.log(`READY after ${Date.now() - t0}ms · ${JSON.stringify(j)}`);
      process.exit(0);
    }
  } catch {
    /* 还没起来 */
  }
  if (Date.now() - t0 > LIMIT) {
    console.log(`TIMEOUT after ${LIMIT}ms`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 300));
}
