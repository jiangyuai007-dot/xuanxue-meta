/**
 * P0-2 门禁：「我的报告」（云历史）四件事是否真的落地
 *
 * 背景：原状态只存在 localStorage —— 换台机器/清缓存就没了，用户没有任何长期资产。
 *      最小可用替代 = 服务端「我的报告」：只存「输入参数 + 标签」，打开时按参数
 *      确定性重排（不落整份报告，隐私面小、体积小），并复用已有 reportUrl(id, token)。
 *
 * 段落 A（静态，必检）
 *   A1 落盘层 reportstore.js 存在且导出关键函数
 *   A2 服务端四接口齐备（保存/列表/删除/open|share）+ 归属由服务端认（cookie/会话，不信前端传参）
 *   A3 列表接口不回传 payload（含出生时间的原参数不能出现在列表里）
 *   A4 5 个排盘页 + mine.html 都挂了 cloud-history.js，顶栏有「我的」入口
 *   A5 各页 btnSaveReport 按钮 + 保存逻辑绑定（app.js / hepan-drill.js）
 *   A6 style.css 有 .mr-* 版式
 *
 * 段落 B（真浏览器，服务不在则跳过）
 *   B1 mine.html 能开、#mrList 存在、消息区 aria-live
 *   B2 /api/reports 首次访问会下发 httpOnly 设备 cookie（游客也能存）
 *
 * 用法：node scripts/p0_myreports_check.mjs    （服务已在 8787 时自动跑段落 B）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const src = path.join(root, 'src');
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PAGES = ['bazi.html', 'hepan.html', 'liuyao.html', 'qimen.html', 'ziwei.html'];

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? '　' + extra : ''}`);
  ok ? pass++ : fail++;
};

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const store = read(path.join(src, 'account', 'reportstore.js'));
const srv = read(path.join(src, 'server', 'index.js'));
const hard = read(path.join(src, 'server', 'hardening.js'));
const css = read(path.join(web, 'style.css'));

/* ================= A1 落盘层 ================= */
console.log('\n【A1 落盘层 reportstore.js】');
check('src/account/reportstore.js 存在', !!store);
for (const fn of ['saveReport', 'listReports', 'getReport', 'getReportByPackId', 'removeReport', 'touchReport']) {
  check(`导出 ${fn}`, new RegExp(`export function ${fn}\\b`).test(store));
}
check('写临时文件再 renameSync（防半截坏档）', /renameSync/.test(store) && /tmp|\.tmp/.test(store));
check('有治理规则（每 owner 上限 / 保留期 / 总量上限）',
  /PER_OWNER_MAX/.test(store) && /RETAIN_MS/.test(store) && /TOTAL_MAX/.test(store));
check('同 owner+system+payload 覆盖旧记录不堆重复', /updated\s*:\s*true/.test(store) && /覆盖|replace/.test(store));

/* ================= A2 服务端接口 ================= */
console.log('\n【A2 服务端接口 + 归属】');
check('POST /api/reports（保存，且先过 validateInput）',
  /urlPath === '\/api\/reports' && req\.method === 'POST'/.test(srv) && /validateInput/.test(srv));
check('GET /api/reports（列表）', /urlPath === '\/api\/reports' && req\.method === 'GET'/.test(srv));
// 路由正则里含 \/ 与 []，用子串包含比正则套正则稳，避免转义地狱
check('DELETE /api/reports/:id（越权 403）',
  srv.includes('mineMatch && req.method === ' + "'DELETE'") && /403/.test(srv));
check('POST /api/reports/:id/(open|share)',
  srv.includes('mineActMatch = urlPath.match(/^\\/api\\/reports\\/([\\w-]+)\\/(open|share)$/)'));
// open/share 两种令牌：share 7 天（可转发），其余 10 分钟（自己看）
check('open 发 10 分钟短令牌、share 发 7 天长令牌',
  srv.includes("const ttl = act === 'share' ? 7 * 24 * 60 * 60 * 1000 : 10 * 60 * 1000;"));
check('open 用 issueReportToken 签发', /issueReportToken\(factPack\.id, \{ ttl \}\)/.test(srv));
check('游客归属走 httpOnly cookie（不信前端传参）',
  /DID_COOKIE = 'xx_did'/.test(srv) && /HttpOnly/.test(srv) && /function ownerOf/.test(srv));
check('ensureDid 首次访问下发设备 cookie', /function ensureDid/.test(srv) && /Set-Cookie/.test(srv));
check('LRU 未命中时回落云历史重建（重启后老链接仍可用）',
  /function loadPack/.test(srv) && /getReportByPackId/.test(srv) && /rebuildFromRecord/.test(srv));
check('rebuildFromRecord 里 hepan 分支专用 hepanIdOf',
  /rebuildFromRecord[\s\S]{0,600}hepan/.test(srv) && /function hepanIdOf/.test(srv));
check('硬化的写接口限流覆盖 /api/reports', /\/api\/reports/.test(hard));
// 归属判定的诚实性：ownerOf 不能读 body 里的 owner/device 字段
const ownerFn = (srv.match(/function ownerOf[\s\S]{0,500}?\n}/) || [''])[0];
check('ownerOf 不采信请求体里的 owner/device 字段',
  !!ownerFn && !/owner\s*[:=]\s*body|deviceId|ownerId/.test(ownerFn.replace(/ownerOf\(/g, '')));

/* ================= A3 隐私面：列表不带 payload ================= */
console.log('\n【A3 隐私面】');
const lsFn = (store.match(/export function listReports[\s\S]*?\n}/) || [''])[0];
check('listReports 返回的字段不含 payload', !!lsFn && !/payload/.test(lsFn));
check('云历史只存输入参数（前端传 payload: currentInput / lastHepanInput）',
  /payload: currentInput/.test(read(path.join(web, 'app.js'))) && /payload: lastHepanInput/.test(read(path.join(web, 'hepan-drill.js'))));

/* ================= A4 前端挂载 ================= */
console.log('\n【A4 前端挂载】');
for (const p of PAGES) {
  const s = read(path.join(web, p));
  check(`${p} 引入 cloud-history.js`, /cloud-history\.js\?/.test(s));
  check(`${p} 顶栏有「我的」入口`, /href="mine\.html"/.test(s));
  check(`${p} 有保存到我的报告按钮`, /id="btnSaveReport"/.test(s));
}
const mine = read(path.join(web, 'mine.html'));
check('mine.html 引入 cloud-history.js 与 mine.js', /cloud-history\.js\?/.test(mine) && /mine\.js\?/.test(mine));
check('mine.html 有报告列表容器 + aria-busy + 消息 aria-live',
  /id="mrList"/.test(mine) && /aria-busy/.test(mine) && /aria-live/.test(mine));
const ch = read(path.join(web, 'cloud-history.js'));
check('cloud-history.js 统一封装 /api/reports 与账号接口',
  /saveReport/.test(ch) && /listReports/.test(ch) && /openReport/.test(ch) && /shareReport/.test(ch) && /removeReport/.test(ch));

/* ================= A5 保存逻辑绑定 ================= */
console.log('\n【A5 保存逻辑】');
const app = read(path.join(web, 'app.js'));
const hep = read(path.join(web, 'hepan-drill.js'));
check('app.js 定义 saveToMyReports 并调 CloudHistory.saveReport',
  /function saveToMyReports/.test(app) && /CloudHistory\.saveReport/.test(app));
check('app.js 绑定 btnSaveReport 点击', /btnSaveReport'\)\.addEventListener\('click', saveToMyReports\)/.test(app));
check('app.js 按钮启用与 btnHtml/btnCard 同步', /function enableSaveReport/.test(app) && /enableSaveReport\(\)/.test(app));
check('hepan-drill.js 定义并绑定合盘保存',
  /saveHepanToMyReports/.test(hep) && /btnSaveReport'\)\.onclick = saveHepanToMyReports/.test(hep));
check('合盘页保存时同步记录入参 lastHepanInput', /lastHepanInput = \{ a: pa, b: pb, names \}/.test(hep));

/* ================= A6 样式 ================= */
console.log('\n【A6 版式】');
for (const c of ['.mr-list', '.mr-item', '.mr-empty', '.mr-acct', '.mr-i-acts', '.mr-i-badge']) {
  check(`style.css 有 ${c}`, css.includes(c));
}

/* ================= B 浏览器实测 ================= */
console.log('\n【B 浏览器实测】');
let bSkip = false;
try {
  await withBrowser(async (br) => {
    const page = await br.page({ w: 1440, h: 900, mobile: false });

    // cdp 的 goto 返回的是 CDP 响应而非 HTTP 响应，且新标签页偶发仍停在 about:blank，
    // 所以导航后要轮询 location.pathname 确认真的落地了，否则后面的断言全是假失败。
    const gotoStable = async (url, tries = 3) => {
      const want = new URL(url).pathname;
      for (let i = 0; i < tries; i++) {
        await page.goto(url, 1500);
        const at = await page.evaluate('({ p: location.pathname, rs: document.readyState })').catch(() => ({ p: '', rs: '' }));
        if (at.p === want) return true;
      }
      return false;
    };

    const navOk = await gotoStable(BASE + '/mine.html');
    check('mine.html 可打开', navOk);
    const r = await page.evaluate(`(() => {
      const l = document.getElementById('mrList');
      const m = document.querySelector('#msg, [aria-live]');
      return {
        hasList: !!l,
        busy: l ? l.getAttribute('aria-busy') : '',
        live: m ? (m.getAttribute('aria-live') || '') : '',
        hasCloud: typeof window.CloudHistory === 'object',
      };
    })()`);
    check('#mrList 存在且标记 aria-busy', r.hasList && r.busy !== null, `aria-busy=${r.busy}`);
    check('消息/状态区有 aria-live', !!r.live, `aria-live=${r.live}`);
    check('页面已加载 CloudHistory 数据层', r.hasCloud === true);

    // 游客也能存：页面脚本加载时已自动 GET /api/reports， cookie 当下就下发。
    // 验点在「前端读不到」—— httpOnly 的 cookie 不该出现在 document.cookie 里；
    // 「确实下发过」由下面的 node 侧冷请求覆盖（浏览器内再 fetch 已不会重复下发）。
    const ck = await page.evaluate(`(async()=>{
      const res = await fetch('/api/reports', { credentials: 'same-origin' });
      let js = '';
      try { js = document.cookie || ''; } catch (e) { js = ''; }
      return { ok: res.ok, jsCookie: js, hasList: !!document.getElementById('mrList') };
    })()`);
    check('GET /api/reports 游客可访问', ck.ok === true);
    check('设备 cookie 是 httpOnly（document.cookie 读不到 xx_did）',
      ck.jsCookie.indexOf('xx_did') === -1, `document.cookie="${ck.jsCookie}"`);

    // 冷请求验证：首次访问确实下发设备 cookie
    const cold = await fetch(BASE + '/api/reports');
    const coldCookies = typeof cold.headers.getSetCookie === 'function' ? cold.headers.getSetCookie() : [];
    const did = coldCookies.find((c) => c.startsWith('xx_did='));
    check('游客首次访问下发设备 cookie', !!did, did ? did.slice(0, 44) + '…' : '未下发');
    if (did) check('设备 cookie 带 HttpOnly + SameSite=Lax', /HttpOnly/i.test(did) && /SameSite=Lax/i.test(did));
    await page.close();
  });
} catch (e) {
  bSkip = true;
  console.log('  ! 浏览器实测跳过（' + (e && e.message ? e.message : e) + '）');
  console.log('    → 先起服务：node src/server/index.js（8787）');
}

console.log(`\n———— P0-2 云历史门禁：通过 ${pass} · 失败 ${fail}${bSkip ? ' · 浏览器段跳过' : ''} ————`);
process.exit(fail ? 1 : 0);
