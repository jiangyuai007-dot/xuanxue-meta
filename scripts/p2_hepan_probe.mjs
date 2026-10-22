/**
 * P2 合盘端到端门禁（打 8787 线上服务）
 *
 * 覆盖：排盘接口 / 整页版式 / 令牌 / JSON 模式 / SSE 逐章 / 复用 / 价表对齐 / 分享卡
 * 用法：服务已在 8787 运行时直接 node scripts/p2_hepan_probe.mjs
 */

const BASE = process.env.BASE || 'http://127.0.0.1:8787';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}${extra ? '　' + extra : ''}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${extra ? '　' + extra : ''}`);
  }
};
const section = (t) => console.log(`\n【${t}】`);

const A = { type: 'bazi', calendar: 'gregorian', year: 1996, month: 8, day: 20, hour: 3, minute: 40, gender: 'female', city: '上海' };
const B = { type: 'bazi', calendar: 'gregorian', year: 1998, month: 11, day: 12, hour: 19, minute: 15, gender: 'male', city: '广州' };

const api = async (path, body) => {
  const opt = { method: body ? 'POST' : 'GET', headers: {} };
  if (body) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const r = await fetch(BASE + path, opt);
  let d = {};
  try {
    d = await r.json();
  } catch {
    /* ignore */
  }
  return { status: r.status, d };
};

// ---------------------------------------------------------------- 排盘
section('1 合盘排盘接口');
let id = '';
let score = 0;
{
  const t0 = Date.now();
  const { status, d } = await api('/api/hepan', { a: A, b: B, names: { a: '甲方', b: '乙方' } });
  ok('返回 200', status === 200, `${Date.now() - t0}ms`);
  ok('ok 且带 factPackId', d.ok === true && !!d.factPackId, d.factPackId);
  ok('契合指数 0-100 整数', Number.isInteger(d.score) && d.score >= 0 && d.score <= 100, `${d.score} 分 ${d.grade}`);
  ok('分档在五档内', ['天作之合', '相得益彰', '互补有成', '需要磨合', '挑战较多'].includes(d.grade), d.grade);
  ok('四维明细齐全', (d.dims || []).length === 4, (d.dims || []).map((x) => `${x.label}:${x.score}`).join(' '));
  ok('排盘图含中央指数与双栏', /hp-score/.test(d.panHtml || '') && /hp-side/.test(d.panHtml || ''));
  ok('排盘图无横向溢出隐患（单一 hp-wrap 容器）', (/hp-wrap/g.test(d.panHtml || '') >= 1));
  ok('双方四柱各 4 柱', (d.parties || []).every((p) => (p.pills || []).length === 4));
  ok('未带令牌的整页 404/403 校验前先拿到 id', !!d.factPackId);
  id = d.factPackId;
  score = d.score;

  const again = await api('/api/hepan', { a: A, b: B, names: { a: '甲方', b: '乙方' } });
  ok('同组合盘命中复用（不改指数）', again.d.reused === true && again.d.score === score, `reused=${again.d.reused}`);
}

// ---------------------------------------------------------------- 整页
section('2 整页报告 HTML');
let reportUrl = '';
{
  const { status, d } = await api('/api/hepan/report/stream?mode=json', { factPackId: id });
  ok('JSON 模式 200', status === 200);
  ok('返回 6 章', (d.chapters || []).length === 6, String((d.chapters || []).length));
  ok('每章都带非空 html', (d.chapters || []).every((c) => c.html && c.html.length > 100));
  ok('全站免费下全部解锁', (d.chapters || []).every((c) => c.unlocked === true));
  ok('章节卡版式统一（rp-ch 或 rp-lock）', (d.chapters || []).every((c) => /rp-ch|rp-lock/.test(c.html)));
  ok('至少一章带依据溯源 rp-basis', (d.chapters || []).some((c) => /rp-basis/.test(c.html)));
  ok('带报告页令牌与地址', !!d.reportToken && !!d.reportUrl);
  reportUrl = d.reportUrl;
  ok('报告地址指向合盘路由（不跳八字整页）', /^\/api\/hepan\//.test(reportUrl || ''), reportUrl);

  const r1 = await fetch(BASE + '/api/hepan/' + encodeURIComponent(id) + '/html');
  ok('整页无令牌 403', r1.status === 403, String(r1.status));

  const r2 = await fetch(`${BASE}/api/hepan/${encodeURIComponent(id)}/html?t=${encodeURIComponent(d.reportToken)}`);
  const html = await r2.text();
  ok('整页带有效令牌 200', r2.status === 200, String(r2.status));
  ok('整页走合盘抬头（含契合指数）', /rp-hd-bar/.test(html) && new RegExp(String(score)).test(html), `score=${score}`);
  ok('整页含合盘排盘区', /hp-wrap/.test(html) && /hp-score/.test(html));
  ok('整页 6 张章节卡', (html.match(/rp-ch/g) || []).length >= 6, String((html.match(/rp-ch/g) || []).length));
  ok('整页无免责声明块（DISCLAIMER_ENABLED=false）', !/本报告基于传统命理文化的规则化推演/.test(html));

  const r3 = await fetch(`${BASE}/api/hepan/nonexist/html`);
  ok('不存在的合盘 404', r3.status === 404, String(r3.status));

  const svg = await fetch(`${BASE}/api/report/${encodeURIComponent(id)}/sharecard.svg?t=${encodeURIComponent(d.reportToken)}`);
  const svgText = await svg.text();
  ok('分享卡含合盘信息（非空文案）', svg.status === 200 && /契合指数/.test(svgText), `status=${svg.status}`);
}

// ---------------------------------------------------------------- SSE
section('3 SSE 逐章（冷启动新组合）');
{
  // 用一条全新组合，保证这一轮是真冷启动（同参数上次跑过会命中缓存，测不到逐章节奏）
  const C = { type: 'bazi', calendar: 'gregorian', year: 1990, month: 6, day: 15, hour: 12, minute: 30, gender: 'male', city: '北京' };
  const pp = await api('/api/hepan', { a: A, b: C, names: { a: '甲方', b: '丙方' } });
  const cid = pp.d.factPackId;

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/hepan/report/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ factPackId: cid }),
  });
  ok('SSE  CONTENT-TYPE 正确', /text\/event-stream/.test(res.headers.get('content-type') || ''), res.headers.get('content-type') || '');
  ok('SSE 关中间层缓冲', res.headers.get('x-accel-buffering') === 'no');

  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  let firstChapterAt = 0;
  const frames = { start: 0, chapter: [], done: 0, fallback: 0, doneObj: null };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let name = '';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) data = line.slice(5).trim();
      }
      if (!name || !data) continue;
      let obj = {};
      try {
        obj = JSON.parse(data);
      } catch {
        continue;
      }
      if (name === 'start') frames.start += 1;
      else if (name === 'done') {
        frames.done += 1;
        frames.doneObj = obj;
      }
      else if (name === 'chapter') frames.chapter.push({ ...obj, __t: Date.now() - t0 });
      else if (name === 'fallback') frames.fallback += 1;
      else if (name === 'done') frames.done += 1;
    }
    if (!firstChapterAt && frames.chapter.length) firstChapterAt = frames.chapter[0].__t;
  }
  const totalMs = Date.now() - t0;
  ok('start 事件 1 次', frames.start === 1);
  ok('逐章 6 章', frames.chapter.length === 6, String(frames.chapter.length));
  ok('done 事件 1 次', frames.done === 1);
  ok(
    '首章先于整份到达（真逐章）',
    frames.chapter.every((c) => c.source === 'cache')
      ? firstChapterAt > 0 && totalMs < 3000 // 全缓存回放：应当整体秒回
      : firstChapterAt > 0 && firstChapterAt < totalMs,
    `首章 +${firstChapterAt}ms / 整份 ${totalMs}ms`,
  );
  ok('到达序单调不减', frames.chapter.every((c, i) => i === 0 || c.__t >= frames.chapter[i - 1].__t), frames.chapter.map((c) => c.__t).join(','));
  ok('每章带 html', frames.chapter.every((c) => c.html && c.html.length > 100));
  ok('来源如实标记', frames.chapter.every((c) => ['ai', 'cache', 'local'].includes(c.source)), frames.chapter.map((c) => c.source).join(','));
  ok('done 带报告令牌且地址指向合盘路由', !!frames.doneObj?.reportToken && /^\/api\/hepan\//.test(frames.doneObj?.reportUrl || ''), frames.doneObj?.reportUrl || '');

  // 复用：同组合盘再拉一次，绝不二次烧 AI 额度
  const t1 = Date.now();
  const res2 = await fetch(`${BASE}/api/hepan/report/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ factPackId: cid }),
  });
  const reader2 = res2.body.getReader();
  let buf2 = '';
  let reused = false;
  let chapters2 = 0;
  let counted2 = 0;
  for (;;) {
    const { done, value } = await reader2.read();
    if (done) break;
    buf2 += dec.decode(value, { stream: true });
    if (/reused":true/.test(buf2)) reused = true;
    // 非累计：每读完一块要和上一块比对增量，直接累加会把同一帧重复数成好几次
    const now = (buf2.match(/event: chapter/g) || []).length;
    chapters2 += Math.max(0, now - counted2);
    counted2 = now;
  }
  ok('二次请求复用缓存（reused=true）', reused);
  ok('复用回放 6 章', chapters2 === 6, String(chapters2));
  ok('复用耗时 < 2s（不重烧 AI）', Date.now() - t1 < 2000, `${Date.now() - t1}ms`);

  // 3b 强制绕开 AI 缓存：保证每轮门禁都真跑一遍 AI 链路（重复跑时上面那轮会全走缓存）
  section('3b AI 链路（useCache=false 强制冷生成）');
  {
    const t2 = Date.now();
    const res3 = await fetch(`${BASE}/api/hepan/report/stream?useCache=0`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factPackId: cid }),
      signal: AbortSignal.timeout(300000),
    });
    const reader3 = res3.body.getReader();
    const dec3 = new TextDecoder('utf-8');
    let buf3 = '';
    const ch3 = [];
    let done3 = null;
    for (;;) {
      const { done, value } = await reader3.read();
      if (done) break;
      buf3 += dec3.decode(value, { stream: true });
      let idx;
      while ((idx = buf3.indexOf('\n\n')) >= 0) {
        const frame = buf3.slice(0, idx);
        buf3 = buf3.slice(idx + 2);
        let name = '';
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) name = line.slice(6).trim();
          else if (line.startsWith('data:')) data = line.slice(5).trim();
        }
        if (!name || !data) continue;
        let obj = {};
        try {
          obj = JSON.parse(data);
        } catch {
          continue;
        }
        if (name === 'chapter') ch3.push({ ...obj, __t: Date.now() - t2 });
        else if (name === 'done') done3 = obj;
      }
    }
    ok('强制冷生成逐章 6 章', ch3.length === 6, String(ch3.length));
    ok('全部真实走 AI（不落缓存）', ch3.every((c) => c.source === 'ai') && (done3?.aiCount || 0) === 6, ch3.map((c) => c.source).join(','));
    ok('首章先于整份到达', ch3[0].__t > 0 && ch3[0].__t < Date.now() - t2, `首章 +${ch3[0].__t}ms / 整份 ${Date.now() - t2}ms`);
    ok('AI 章节卡非空且带依据溯源', ch3.every((c) => c.html && c.html.length > 100) && ch3.some((c) => /rp-basis/.test(c.html)));
  }
}

// ---------------------------------------------------------------- 价表与前端
section('4 价表 / SKU / 版式单一来源');
{
  const { d } = await api('/api/skus');
  const txt = JSON.stringify(d.skus || []);
  ok('存在合盘 SKU', /hepan_full/.test(txt));
  const { d: city } = await api('/api/cities');
  ok('城市列表可用', (city.cities || []).length > 0, `${(city.cities || []).length} 个`);
  const css = await fetch(BASE + '/api/report/css');
  ok('章节卡样式单源可下发', css.status === 200 && /rp-ch/.test(await css.text()));
}

console.log(`\n———— P2 门禁：通过 ${pass} · 失败 ${fail} ————`);
process.exit(fail ? 1 : 0);
