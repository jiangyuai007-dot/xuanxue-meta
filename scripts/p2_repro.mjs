/**
 * 内部诊断：同一服务上交替打「已知正常组合」与「疑似卡死组合」，判定是输入还是服务状态。
 * 用法：node scripts/p2_repro.mjs
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const GOOD = { a: { type: 'bazi', calendar: 'gregorian', year: 1990, month: 5, day: 20, hour: 10, minute: 30, gender: 'male', city: '北京' }, b: { type: 'bazi', calendar: 'gregorian', year: 1993, month: 3, day: 8, hour: 14, minute: 20, gender: 'female', city: '上海' } };
const BAD = { a: { type: 'bazi', calendar: 'gregorian', year: 2006, month: 4, day: 3, hour: 11, minute: 15, gender: 'male', city: '南京' }, b: { type: 'bazi', calendar: 'gregorian', year: 2008, month: 9, day: 18, hour: 16, minute: 45, gender: 'female', city: '西安' } };

const step = async (tag, body, ms = 10000) => {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + '/api/hepan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(ms),
    });
    const t = await r.text();
    console.log(`✓ ${tag} ${r.status} ${Date.now() - t0}ms ${t.length}B`);
  } catch (e) {
    console.log(`✗ ${tag} ${e.name === 'TimeoutError' ? `挂起 ${ms}ms` : e.message}（${Date.now() - t0}ms）`);
  }
};

await step('health', null).catch?.(() => {});
try {
  const r = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(8000) });
  console.log('✓ health', r.status, await r.text().then((t) => t.length + 'B'));
} catch (e) { console.log('✗ health 挂起'); }

await step('GOOD 1990/1993', GOOD);
await step('BAD  2006/2008', BAD);
await step('GOOD 再来一次', GOOD);
await step('BAD  再来一次', BAD);
process.exit(0);
