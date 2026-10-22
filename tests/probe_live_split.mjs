/**
 * 线上端到端探针（8787）：四独立页 / 根跳转 / 八字神煞与大运上移 / 六爻摇卦变卦推导与缓存键
 */
const BASE = 'http://127.0.0.1:8787';
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra); }
};

const get = async (p) => {
  const r = await fetch(BASE + p, { redirect: 'manual' });
  return { status: r.status, text: await r.text(), location: r.headers.get('location') };
};
const post = async (p, body) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
};

// ---------- 页面 ----------
for (const p of ['bazi.html', 'liuyao.html', 'qimen.html', 'ziwei.html']) {
  const r = await get('/' + p);
  ok('page:' + p, r.status === 200 && r.text.includes('data-sys'), 'status=' + r.status);
}
const root = await get('/');
ok('root-redirect', root.status === 302 && root.location === '/bazi.html', root.status + '->' + root.location);
const appjs = await get('/app.js');
ok('appjs-served', appjs.status === 200 && appjs.text.includes('CURRENT_SYS'));
const drill = await get('/bazi-drill.js');
ok('drill-served', drill.status === 200);

// ---------- 健康与引擎版本 ----------
const health = await get('/api/health');
ok('health', health.status === 200 && JSON.parse(health.text).ok === true);

// ---------- 八字 ----------
const bz = await post('/api/paipan', { input: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' } });
ok('bazi:ok', bz.status === 200 && bz.data.ok, JSON.stringify(bz.data.error || ''));
ok('bazi:engine-1.3.0', bz.data.meta.engineVersion === '1.3.0', bz.data.meta.engineVersion);
const ss = bz.data.facts.shensha.map((s) => s.name);
ok('bazi:shensha-空亡', ss.includes('空亡'), ss.join(','));
ok('bazi:shensha-count', bz.data.facts.shensha.length >= 8, String(bz.data.facts.shensha.length));
const html = bz.data.chartHtml;
const trackPos = html.indexOf('class="bz-track"');
const relPos = html.indexOf('class="bz-rel"');
ok('bazi:dayun-before-relations', trackPos > 0 && relPos > trackPos, `track=${trackPos} rel=${relPos}`);
ok('bazi:drill-data-m', html.includes('data-m="['));
ok('bazi:shensha-grid', html.includes('bz-ss-grid'));
ok('bazi:verse-style', html.includes('font-weight:800;color:#8a4a12'));

// ---------- 六爻（摇卦，同一输入两次→缓存命中；不同爻→不同卦） ----------
const lyInput = { type: 'liuyao', method: 'coin', lines: [9, 7, 8, 6, 7, 9], year: 2026, month: 9, day: 26, hour: 14, minute: 0, category: 'wealth', question: '线上探针' };
const ly1 = await post('/api/paipan', { input: lyInput });
const ly2 = await post('/api/paipan', { input: lyInput });
ok('ly:ok', ly1.status === 200 && ly1.data.ok, JSON.stringify(ly1.data.error || ''));
ok('ly:engine-1.3.0', ly1.data.meta.engineVersion === '1.3.0', ly1.data.meta.engineVersion);
ok('ly:cache-key-lines', ly2.data.meta.cacheHit === true && ly2.data.factPackId === ly1.data.factPackId);

const ly = ly1.data.facts;
const dong = ly.dongYao.map((d) => d.index);
ok('ly:dong-0,3,5', JSON.stringify(dong) === JSON.stringify([0, 3, 5]), JSON.stringify(dong));
const ben = ly.lines.map((l) => (l.yang ? 1 : 0));
const exp = [...ben];
for (const i of dong) exp[i] = 1 - exp[i];
const bia = ly.bianLines.map((l) => (l.yang ? 1 : 0));
ok('ly:bian-derivation', JSON.stringify(exp) === JSON.stringify(bia), `${exp} vs ${bia}`);
const fu = ly.lines.filter((l) => l.fuShow);
const present = new Set(ly.lines.map((l) => l.liuqin));
ok('ly:fu-missing-only', fu.every((l) => !present.has(l.fuLiuqin)) && new Set(fu.map((l) => l.fuLiuqin)).size === fu.length, fu.map((l) => l.fuLiuqin + '@' + l.position).join(','));
ok('ly:html-fu', (ly1.data.chartHtml.match(/class="lfu/g) || []).length === fu.length);
ok('ly:html-ymk', ly1.data.chartHtml.includes('ymk') && !ly1.data.chartHtml.includes('class="mk"'));

// 不同爻输入 → 不同卦（缓存键区分 lines）
const ly3 = await post('/api/paipan', { input: { ...lyInput, lines: [7, 7, 7, 7, 7, 7] } });
ok('ly:different-lines-diff-id', ly3.data.factPackId !== ly1.data.factPackId && ly3.data.facts.benGua.name === '乾为天', ly3.data.facts.benGua.name);

console.log(`\n==== ${pass} PASS / ${fail} FAIL ====`);
process.exit(fail ? 1 : 0);
