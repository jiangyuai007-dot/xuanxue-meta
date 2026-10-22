/** 线上核验：童子煞入库 + 神煞全量库可核对 + 起法悬停 */
import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8787';
const LOG = [];
const out = (s) => { LOG.push(s); console.log(s); };
let pass = 0; let fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; out(`  ✓ ${n}${e ? ' → ' + e : ''}`); } else { fail++; out(`  ✗ ${n}${e ? ' → ' + e : ''}`); } };

async function waitHealth() {
  for (let i = 0; i < 20; i++) {
    try { const d = await (await fetch(BASE + '/api/health')).json(); if (d.ok) return true; } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const input = { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', calendar: 'solar', city: '北京' };

(async () => {
 try {
  const healthy = await waitHealth();
  ok('服务健康', healthy);
  if (!healthy) { out('\n合计：0 通过 / 1 失败'); fs.writeFileSync(new URL('./.probe_live_tz.log', import.meta.url), LOG.join('\n'), 'utf8'); process.exit(1); }

  const r = await fetch(BASE + '/api/paipan', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }),
  });
  const raw = await r.text();
  let d = {};
  try { d = JSON.parse(raw); } catch (e) { out('  解析失败：' + raw.slice(0, 300)); }
  if (r.status !== 200) out(`  非 200 响应：${r.status} ${raw.slice(0, 300)}`);
  const html = d.chartHtml || '';
  ok('接口 200', r.status === 200, String(r.status));
  ok('engine=1.5.1', String(d.engine || d.meta?.engineVersion || '').includes('1.5.1'), String(d.engine || d.meta?.engineVersion));

  const libStart = html.indexOf('bz-ss-libgrid');
  const libEnd = html.indexOf('</div>', libStart);
  const lib = html.slice(libStart, libEnd);
  const libNames = [...lib.matchAll(/class="bz-ss-lib(?: on)?"[^>]*>([^<]+)</g)].map((m) => m[1]);
  ok('全量规则库渲染', libNames.length >= 108, String(libNames.length));
  for (const n of ['童子煞', '真童子', '太极贵人', '十灵日', '十恶大败', '阴差阳错', '日贵', '魁罡']) {
    ok(`库中可见：${n}`, libNames.includes(n));
  }
  ok('命中项高亮标记', lib.includes('bz-ss-lib on'));
  ok('悬停起法依据', html.includes('【起法依据·'));

  // 换一盘：找一个命中童子煞的（1993-04-05 之类也行，这里扫几组取首个命中）
  let hitInput = null;
  for (const [y, m, dd, h] of [[2026, 3, 5, 10], [2026, 4, 12, 8], [2026, 9, 3, 20], [2026, 10, 17, 6], [2026, 12, 3, 14]]) {
    const rr = await fetch(BASE + '/api/paipan', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: { type: 'bazi', year: y, month: m, day: dd, hour: h, minute: 0, gender: 'male', calendar: 'solar' } }),
    });
    const dd2 = await rr.json();
    if ((dd2.chartHtml || '').includes('class="bz-ss-lib on"') && /童子煞/.test(dd2.chartHtml)) { hitInput = [y, m, dd, h]; break; }
  }
  ok('存在线上童子煞命中样本', !!hitInput, hitInput ? hitInput.join('-') : '未找到');

  fs.writeFileSync(new URL('./.probe_live_tz.log', import.meta.url), LOG.join('\n') + `\n\n合计：${pass} 通过 / ${fail} 失败\n`, 'utf8');
  out(`\n合计：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
 } catch (e) {
  out('异常：' + (e && e.stack ? e.stack : String(e)));
  fs.writeFileSync(new URL('./.probe_live_tz.log', import.meta.url), LOG.join('\n'), 'utf8');
  process.exit(1);
 }
})();
