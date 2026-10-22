/** 线上探针：8787 神煞 108 / 起法悬停 / 下钻脚本 / 四个页面 */
const BASE = 'http://127.0.0.1:8787';

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n + (e ? '  → ' + e : '')); } };

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null), text: await r.text().catch(() => '') };
}

const PAIPAN = (input) => post('/api/paipan', { input });

(async () => {
  const health = await (await fetch(BASE + '/api/health')).json().catch(() => null);
  ok('health', health && health.ok === true, JSON.stringify(health));

  console.log('== 八字排盘 ==');
  const input = { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', name: '线上核验' };
  const bz = await PAIPAN(input);
  const j = bz.json || {};
  const html = j.chartHtml || j.html || '';
  ok('compute 200', bz.status === 200, String(bz.status));
  ok('engine=1.4.0', String(j.meta?.engineVersion || '').includes('1.4.0'), String(j.meta?.engineVersion));
  const n = (html.match(/class="bz-ss-item"/g) || []).length;
  ok('神煞条目渲染>0', n > 0, 'n=' + n);
  ok('悬停含起法口诀', html.includes('title="【起法依据·'));
  ok('标题标注规则库 108 项', html.includes('规则库 108 项'));
  const hitCount = (html.match(/本盘命中 (\d+) 项/) || [])[1];
  ok('显示本盘命中数', Number(hitCount) >= 15, '命中=' + hitCount);
  ok('大运流年在前', html.indexOf('class="bz-track"') < html.indexOf('class="bz-shensha"'));
  ok('流年带流月数据 data-m', html.includes('data-m="[['));

  console.log('== 前端脚本与页面 ==');
  const drill = await (await fetch(BASE + '/bazi-drill.js')).text();
  ok('下钻脚本可访问', drill.includes('bz-lym-bar'));
  ok('流月条插在流年行之后(parentElement.after)', drill.includes('ly.parentElement.after(bar)'));
  ok('流月条头带年份说明', drill.includes('bz-lym-head'));
  for (const p of ['/bazi.html', '/liuyao.html', '/qimen.html', '/ziwei.html']) {
    const r = await fetch(BASE + p);
    const t = await r.text();
    ok('页面可访问 ' + p, r.status === 200 && t.length > 500, r.status + '/' + t.length);
    if (p === '/bazi.html') ok('八字页加载下钻脚本', t.includes('bazi-drill.js'));
  }

  console.log('== 六爻回归 ==');
  const ly = await PAIPAN({
    type: 'liuyao', year: 2026, month: 9, day: 22, hour: 14, minute: 30,
    method: 'coin', lines: [9, 7, 8, 6, 7, 9], gender: 'male',
  });
  const lyHtml = ly.json?.chartHtml || '';
  ok('六爻 200', ly.status === 200);
  ok('六爻含动爻标记', lyHtml.includes('ymk'));
  ok('六爻含伏神', lyHtml.includes('lfu'));

  console.log(`\n结果: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
