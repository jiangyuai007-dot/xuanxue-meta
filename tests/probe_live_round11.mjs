/**
 * 线上探针（8787）：六爻多爻动/卦辞 + 奇门选项/四柱表 + 静态缓存策略
 */
const BASE = 'http://127.0.0.1:8787';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  [' + detail + ']' : ''}`); }
  else { fail++; console.log(`  ✗ ${name}  [${detail}]`); }
};

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

const IN = { year: 2026, month: 9, day: 26, hour: 21, minute: 30, city: '北京' };

console.log('— 静态资源缓存策略 —');
const appJs = await fetch(BASE + '/app.js');
ok('app.js no-store', (appJs.headers.get('cache-control') || '').includes('no-store'), appJs.headers.get('cache-control'));

console.log('— 六爻线上 —');
const counts = [];
for (let d = 20; d <= 26; d++) {
  const r = await post('/api/paipan', { input: { ...IN, type: 'liuyao', day: d } });
  counts.push(r.json?.facts?.dongYao?.length ?? -1);
}
ok('时间起卦：7 天动爻数不全为 1', !counts.every((c) => c === 1), JSON.stringify(counts));
ok('动爻数 0~6', counts.every((c) => c >= 0 && c <= 6));

const rn = await post('/api/paipan', { input: { ...IN, type: 'liuyao', method: 'name', guaName: '水火既济' } });
ok('卦名起卦：水火既济', rn.json?.facts?.benGua?.name === '水火既济' && rn.json.facts.dongYao.length === 0, rn.json?.facts?.benGua?.name);
ok('卦辞解释块出现', (rn.json?.chartHtml || '').includes('卦辞') && rn.json.chartHtml.includes('断语'));
ok('四柱 21px 加粗样式', rn.json?.chartHtml?.includes('font-size:21px') && rn.json.chartHtml.includes('font-weight:800'));

console.log('— 奇门线上 —');
const q1 = await post('/api/paipan', { input: { ...IN, type: 'qimen', juMethod: 'custom', customJu: 3 } });
ok('自选局数 3 局', q1.json?.facts?.ju === 3, q1.json?.facts?.juName);
ok('四柱表渲染', (q1.json?.chartHtml || '').includes('四柱') && q1.json.chartHtml.includes('节气'));
ok('寄宫/起局 chip', q1.json?.chartHtml?.includes('寄坤二宫') && q1.chartHtml !== '');
const q2 = await post('/api/paipan', { input: { ...IN, type: 'qimen', jiGong: 'yangGenYinKun' } });
ok('阳艮阴坤寄宫', !!q2.json?.facts?.jiGongName, q2.json?.facts?.jiGongName);

console.log('— 版本 —');
ok('liuyao engine 1.4.0', rn.json?.meta?.engineVersion === '1.4.0', rn.json?.meta?.engineVersion);
ok('qimen engine 1.1.0', q1.json?.meta?.engineVersion === '1.1.0', q1.json?.meta?.engineVersion);

console.log(`\n结果：${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
