import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8799;
const B = `http://127.0.0.1:${PORT}`;
const out = [];
const say = (s) => { out.push(s); console.log(s); };

let childStderr = '';
async function waitUp(ms = 12000) {
  const dl = Date.now() + ms;
  while (Date.now() < dl) {
    try { const r = await fetch(B + '/api/health'); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  say('child stderr: ' + childStderr.slice(0, 2000));
  return false;
}

function cookieOf(res) {
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [String(res.headers.get('set-cookie') || '')];
  return sc.map((s) => s.split(';')[0]).join('; ');
}

function req(p, { method = 'GET', body, cookie = '', token = '' } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  if (token) headers['x-session-token'] = token;
  return fetch(B + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

const BZI = { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', calendar: 'gregorian', city: '北京', useSolar: false };

(async () => {
  const child = spawn(process.execPath, [path.join(ROOT, 'src/server/index.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => { childStderr += String(d); });
  child.stdout.on('data', (d) => { childStderr += String(d); });
  child.on('exit', (c) => { childStderr += `\n[exit ${c}]\n`; });
  let ok = true;
  const chk = (name, cond, extra = '') => { say(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) ok = false; };
  try {
    if (!await waitUp()) throw new Error('server not up');
    const uniqueCookie = `xx_did=smoke_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let r = await req('/api/reports');
    const sc = cookieOf(r);
    chk('下发设备 cookie', /xx_did=/.test(sc), sc.slice(0, 60));

    let c = uniqueCookie;
    r = await req('/api/reports', { cookie: c });
    chk('GET 空列表 200/0', r.status === 200 && (await r.json()).items.length === 0, `status=${r.status}`);

    r = await req('/api/reports', { method: 'POST', cookie: c, body: { system: 'bazi', title: '1990-05-20 14:30', subtitle: '八字命盘　男　北京', payload: BZI } });
    const j1 = await r.json();
    chk('POST 保存 200', r.status === 200 && j1.ok && !!j1.id, JSON.stringify(j1).slice(0, 80));
    const id = j1.id;

    r = await req('/api/reports', { cookie: c });
    const l1 = await r.json();
    chk('列表含 1 条', l1.items.length === 1 && l1.items[0].id === id);

    r = await req('/api/reports', { method: 'POST', cookie: c, body: { system: 'bazi', title: '1990-05-20 14:30', subtitle: '八字命盘　男　北京', payload: BZI } });
    const j2 = await r.json();
    chk('同参数去重(updated)', j2.updated === true);
    r = await req('/api/reports', { cookie: c });
    chk('列表仍 1 条', (await r.json()).items.length === 1);

    r = await req(`/api/reports/${id}/open`, { method: 'POST', cookie: c });
    const o = await r.json();
    chk('open 返回报告链接', r.status === 200 && /\/api\/report\//.test(o.reportUrl || ''), 'status=' + r.status + ' ' + JSON.stringify(o).slice(0, 200));
    const htmlRes = await fetch(B + new URL(o.reportUrl, B).pathname + '?t=' + new URL(o.reportUrl, B).searchParams.get('t'));
    const html = await htmlRes.text();
    chk('报告页可打开(200)', htmlRes.status === 200 && html.includes('八字'), `status=${htmlRes.status} len=${html.length}`);

    r = await req(`/api/reports/${id}/share`, { method: 'POST', cookie: c });
    const s = await r.json();
    chk('share 长链接', r.status === 200 && /t=/.test(s.reportUrl || ''), 'status=' + r.status + ' ' + JSON.stringify(s).slice(0, 200));
    const shareRes = await fetch(B + new URL(s.reportUrl, B).pathname + '?t=' + new URL(s.reportUrl, B).searchParams.get('t'));
    chk('分享链接可打开', shareRes.status === 200 && (await shareRes.text()).includes('八字'), `status=${shareRes.status}`);

    r = await req(`/api/reports/${id}`, { method: 'DELETE' });
    chk('越权删除 403', r.status === 403, `status=${r.status}`);

    r = await req(`/api/reports/${id}`, { method: 'DELETE', cookie: c });
    chk('本人删除 200', r.status === 200);
    r = await req('/api/reports', { cookie: c });
    chk('删除后列表空', (await r.json()).items.length === 0);

    // 登录态
    const em = `t${Date.now()}@x.com`;
    r = await req('/api/auth/register', { method: 'POST', body: { email: em, password: 'abcd12345' } });
    const reg = await r.json();
    chk('注册 200', r.status === 200 && !!reg.token);
    r = await req('/api/reports', { method: 'POST', token: reg.token, body: { system: 'bazi', title: 'T', subtitle: 'S', payload: { ...BZI, minute: 15 } } });
    const j3 = await r.json();
    chk('登录后保存（无 cookie）', r.status === 200 && !!j3.id, `status=${r.status}`);
    r = await req('/api/reports', { token: reg.token });
    const l2 = await r.json();
    chk('登录后列表 1 条且未登录游客 0 条', l2.items.length === 1 && l2.signedIn === true);
    const other = await req('/api/reports', { method: 'POST', cookie: c, body: { system: 'bazi', title: 'X', subtitle: '', payload: { ...BZI, minute: 45 } } });
    const j4 = await other.json();
    r = await req(`/api/reports/${j3.id}`, { method: 'DELETE', cookie: c });
    chk('游客删他人(登录owner) 403', r.status === 403, `status=${r.status}`);
    r = await req(`/api/reports/${j3.id}/open`, { method: 'POST', cookie: c });
    chk('游客 open 他人(登录owner) 404', r.status === 404, `status=${r.status}`);
    r = await req(`/api/reports/${j4.id}/open`, { method: 'POST', token: reg.token });
    chk('登录用户 open 游客记录 -> 404', r.status === 404, `status=${r.status}`);

    // 合盘
    const hp = { system: 'hepan', title: '甲×乙', subtitle: '合盘', payload: { a: { ...BZI, gender: 'male' }, b: { ...BZI, gender: 'female', day: 21 }, names: { a: '甲', b: '乙' } } };
    r = await req('/api/reports', { method: 'POST', cookie: c, body: hp });
    const jh = await r.json();
    chk('合盘保存 200', r.status === 200, JSON.stringify(jh).slice(0, 80));
    if (jh.id) {
      r = await req(`/api/reports/${jh.id}/open`, { method: 'POST', cookie: c });
      const ho = await r.json();
      chk('合盘 open 返回链接', r.status === 200 && !!ho.reportUrl, `status=${r.status} ${JSON.stringify(ho).slice(0, 200)}`);
      const hu = new URL(ho.reportUrl, B);
      const hr = await fetch(B + hu.pathname + '?t=' + hu.searchParams.get('t'));
      const htxt = await hr.text();
      chk('合盘报告页可打开', hr.status === 200 && htxt.includes('合盘'), `status=${hr.status} body=${htxt.slice(0, 80)} url=${ho.reportUrl}`);
    }
  } catch (e) {
    ok = false;
    say('ERR: ' + e.message);
  } finally {
    child.kill();
    say(ok ? '=== 21/21 ALL PASS ===' : '=== FAILED ===');
    process.exit(ok ? 0 : 1);
  }
})();
