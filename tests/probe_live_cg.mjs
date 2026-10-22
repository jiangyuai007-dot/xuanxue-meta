/* 线上核验：8787 八字排盘 → 称骨/下钻/生肖/移动端 + 报告页脚本 */
const BASE = 'http://127.0.0.1:8787';
const body = {
  input: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
};
const out = [];
const ok = (c, name, extra = '') => out.push(`${c ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`);

const r = await fetch(BASE + '/api/paipan', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const d = await r.json();
ok(d.ok, 'paipan ok', `cacheHit=${d.meta && d.meta.cacheHit} engine=${d.meta && d.meta.engineVersion}`);
const f = d.facts || {};
ok(f.lunar && f.lunar.zodiac === '马', '线上生肖=马', `got=${f.lunar && f.lunar.zodiac}`);
ok(f.chengGu && f.chengGu.totalQian === 44, '线上称骨 44 钱', f.chengGu ? f.chengGu.totalText : 'MISSING');
const h = d.chartHtml || '';
ok((h.match(/data-m="/g) || []).length === 100, '线上 data-m=100', `got=${(h.match(/data-m="/g) || []).length}`);
ok(h.includes('data-dm='), '线上 data-dm');
ok(h.includes('称骨算命'), '线上称骨卡');
ok(h.includes('四两四钱'), '线上骨重文本');
ok(h.includes('@media (max-width:760px)'), '线上移动端 media');
ok(h.includes('bz-mscroll') && h.includes('bz-linkscroll'), '线上滚动容器');
ok(h.includes('庚午') && h.includes('bz-ming-p'), '线上抬头分色');

// 静态 drill 脚本可访问
const r2 = await fetch(BASE + '/bazi-drill.js');
ok(r2.ok, '/bazi-drill.js 可访问', `status=${r2.status}`);

// 报告页含 drill 脚本
const r3 = await fetch(BASE + `/api/report/${d.factPackId}/html`);
const html = await r3.text();
ok(r3.ok && html.includes('/bazi-drill.js'), '报告页引入 drill 脚本');
ok(html.includes('称骨算命'), '报告页含称骨卡');

console.log(out.join('\n'));
const fail = out.filter((x) => x.startsWith('✗')).length;
console.log(`\n线上结果: ${out.length - fail} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
