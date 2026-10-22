/**
 * P0 门禁 · 账号区（mine.html）—— 静态结构 + 真浏览器实测。
 *
 * 盯三件事（这三件历史上都真实坏过）：
 *   1. [hidden] 被作者样式的 display:flex 吃掉 → 已登录 / 未登录 / 登录表单 / 注册表单
 *      四套同时渲染，叠成一团（P0-2 原始截图就是这个鬼样子）。
 *   2. label 与输入框没对齐（原来是 flex + align-items:flex-end，两条标签落在不同的基线上）。
 *   3. 订单弹层用 hidden 打开，但 .xj-modal 本体是 display:none 只有 .show 才 flex → 点了没反应。
 *
 * 跑之前服务要已在 8787（脚本会注册一个 probe*@example.com 的临时账号再退出，不落库报告）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://127.0.0.1:8787';

const pass = [];
const fail = [];
const check = (name, ok, extra = '') => (ok ? pass : fail).push(`${name}${extra ? '　' + extra : ''}`);

// ---------------------------------------------------------------- 静态
const html = fs.readFileSync(path.join(ROOT, 'web/mine.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');

const A = [];
const a = (n, ok, x = '') => A.push([n, ok, x]);

a('全局兜底 [hidden]{display:none!important}', /\[hidden\]\{display:none!important\}/.test(css));
a('已登录态用 flex 排版 .mr-acct-on', css.includes('.mr-acct-on{display:flex'));
a('未登录态用 flex 排版 .mr-acct-off', css.includes('.mr-acct-off{display:flex'));
a('分段切换 .mr-seg 存在', css.includes('.mr-seg{display:inline-flex'));
a('分段激活态走 [aria-selected=true]', css.includes('.mr-seg button[aria-selected="true"]'));
a('表单走 grid 五列对齐', /\.mr-form\{display:grid[^}]*grid-template-columns:auto minmax\(200px,1fr\) auto minmax\(200px,1fr\) auto/.test(css));
a('标签右对齐贴输入框', css.includes('.mr-lb{font-size:var(--fs-xs);color:var(--sub);letter-spacing:1px;text-align:right'));
a('输入框统一圆角与高', css.includes('.mr-in{width:100%') && css.includes('min-height:40px'));
a('窄屏 collapse 成单列', css.includes('.mr-form{grid-template-columns:1fr'));

a('mine.html 有已登录区块 #acctOnline', html.includes('id="acctOnline"'));
a('mine.html 有未登录区块 #acctGuest', html.includes('id="acctGuest"'));
a('已登录区块初始 hidden', /id="acctOnline"[^>]*\shidden/.test(html));
a('登录表单初始可见（无 hidden）', !/#formLogin[^>]*\shidden/.test(html));
a('注册表单初始 hidden', /id="formRegister"[^>]*\shidden/.test(html));
a('分段控件带 role=tablist', html.includes('role="tablist"'));
a('两个 tab 都有 aria-selected', (html.match(/aria-selected=/g) || []).length === 2);
a('两个 tab 都有 aria-controls', (html.match(/aria-controls=/g) || []).length === 2);
a('密码框有 aria-describedby 说明', (html.match(/aria-describedby="(lg|rg)PwdHint"/g) || []).length === 2);
a('已登录态有头像位 #acctAvatar', html.includes('id="acctAvatar"'));
a('已登录态右对齐操作区', html.includes('class="mr-acct-acts"'));

console.log('\n【A 静态结构】');
A.forEach(([n, ok, x]) => { check(n, ok, x); console.log(ok ? `  ✓ ${n}${x ? '　' + x : ''}` : `  ✗ ${n}${x ? '　' + x : ''}`); });

// ---------------------------------------------------------------- 浏览器
const B = [];
const b = (n, ok, x = '') => B.push([n, ok, x]);

await withBrowser(async (br) => {
  const p = await br.page({ url: 'about:blank', w: 1440, h: 900, mobile: false });
  await p.goto(`${BASE}/mine.html`, 1500);
  for (let i = 0; i < 40; i += 1) {
    if (await p.evaluate(`document.getElementById('mrList')?.getAttribute('aria-busy')==='false'`)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const vis = `(id)=>{const e=document.getElementById(id);if(!e)return null;const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}`;

  const g1 = await p.evaluate(`(()=>{const v=${vis};return {online:v('acctOnline'),guest:v('acctGuest'),login:v('formLogin'),reg:v('formRegister')};})()`);
  b('未登录：只显示未登录区块', g1.online === false && g1.guest === true);
  b('未登录：只显示登录表单', g1.login === true && g1.reg === false);

  const al = await p.evaluate(`(()=>{
    const bs=(s)=>document.querySelectorAll(s)[0].getBoundingClientRect();
    const ri=(id)=>document.getElementById(id).getBoundingClientRect();
    return {lb1:bs('.mr-lb').top, lb2:document.querySelectorAll('.mr-lb')[1].getBoundingClientRect().top,
      t1:ri('lgEmail').top, t2:ri('lgPwd').top,
      h1:Math.round(ri('lgEmail').height), h2:Math.round(ri('lgPwd').height),
      w1:Math.round(ri('lgEmail').width), w2:Math.round(ri('lgPwd').width)};})()`);
  b('两个标签同一基线', Math.abs(al.lb1 - al.lb2) <= 1, `top ${al.lb1.toFixed(1)} / ${al.lb2.toFixed(1)}`);
  b('两个输入框顶部对齐', Math.abs(al.t1 - al.t2) <= 1, `top ${al.t1.toFixed(1)} / ${al.t2.toFixed(1)}`);
  b('两个输入框等高', al.h1 === al.h2, `${al.h1} / ${al.h2}`);
  b('两个输入框等宽（grid 1fr 生效）', Math.abs(al.w1 - al.w2) <= 1, `${al.w1} / ${al.w2}`);

  await p.evaluate(`document.getElementById('btnToRegister').click()`);
  await new Promise((r) => setTimeout(r, 300));
  const g2 = await p.evaluate(`(()=>{const v=${vis};return {login:v('formLogin'),reg:v('formRegister'),
    selReg:document.getElementById('tabRegister').getAttribute('aria-selected'),
    selLg:document.getElementById('tabLogin').getAttribute('aria-selected'),
    lb1:document.querySelectorAll('#formRegister .mr-lb')[0].getBoundingClientRect().top,
    lb2:document.querySelectorAll('#formRegister .mr-lb')[1].getBoundingClientRect().top};})()`);
  b('切注册：注册表可见、登录表隐藏', g2.reg === true && g2.login === false);
  b('切注册：tab aria-selected 翻转', g2.selReg === 'true' && g2.selLg === 'false');
  b('注册表单标签同样对齐', Math.abs(g2.lb1 - g2.lb2) <= 1);

  // 真实注册走一遍完整链路
  const mail = `probe${Date.now()}@example.com`;
  const pwd = 'probe12345';
  await p.evaluate(`(()=>{document.getElementById('rgEmail').value=${JSON.stringify(mail)};document.getElementById('rgPwd').value=${JSON.stringify(pwd)};})()`);
  await p.evaluate(`document.querySelector('#formRegister button[type=submit]').click()`);
  for (let i = 0; i < 60; i += 1) {
    // 注意：箭头函数体紧跟 () 调用会被解析成 Unexpected token '('，必须自己包一层括号
    if (await p.evaluate(`(${vis})('acctOnline')`)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const g3 = await p.evaluate(`(()=>{const v=${vis};return {online:v('acctOnline'),guest:v('acctGuest'),
    email:document.getElementById('acctEmail').textContent,
    avatar:document.getElementById('acctAvatar').textContent,
    tag:document.querySelector('#acctOnline .mr-tag').textContent.replace(/\\s/g,''),
    avW:Math.round(document.getElementById('acctAvatar').getBoundingClientRect().width)};})()`);
  b('注册后切到已登录态', g3.online === true && g3.guest === false);
  b('已登录态回填邮箱', g3.email === mail, g3.email);
  b('头像取邮箱首字', g3.avatar === mail[0].toUpperCase(), g3.avatar);
  b('徽章文案为已登录', g3.tag === '已登录', g3.tag);
  b('头像是 42px 圆章', g3.avW === 42, String(g3.avW));

  // 订单弹层：这条曾经是坏的（hidden 打开 + .xj-modal{display:none}）
  await p.evaluate(`document.getElementById('btnOrders').click()`);
  await new Promise((r) => setTimeout(r, 700));
  const m1 = await p.evaluate(`(()=>{const e=document.getElementById('xjOrdersModal');const r=e.getBoundingClientRect();
    return {w:Math.round(r.width),h:Math.round(r.height),d:getComputedStyle(e).display};})()`);
  b('订单弹层真能打开', m1.w > 0 && m1.h > 0, `display=${m1.d}`);
  b('订单列表有内容', await p.evaluate(`document.getElementById('xjOrdersList').textContent.trim().length>0`));
  await p.evaluate(`document.getElementById('xjOrdersClose').click()`);
  await new Promise((r) => setTimeout(r, 400));
  b('订单弹层能关闭', await p.evaluate(`document.getElementById('xjOrdersModal').getBoundingClientRect().width===0`));

  await p.evaluate(`document.getElementById('btnLogout').click()`);
  await new Promise((r) => setTimeout(r, 900));
  const g4 = await p.evaluate(`(()=>{const v=${vis};return {online:v('acctOnline'),guest:v('acctGuest'),login:v('formLogin')};})()`);
  b('退出后退回未登录态', g4.online === false && g4.guest === true);
  b('退出后表单回到登录页', g4.login === true);

  // 窄屏
  await p.emulate({ w: 375, h: 812, mobile: true });
  await new Promise((r) => setTimeout(r, 600));
  const n1 = await p.evaluate(`(()=>{const ri=(id)=>document.getElementById(id).getBoundingClientRect();
    return {w1:Math.round(ri('lgEmail').width),w2:Math.round(ri('lgPwd').width),
      lbL:document.querySelectorAll('.mr-lb')[0].getBoundingClientRect().left,
      inL:ri('lgEmail').left};})()`);
  b('窄屏单列：输入框等宽', n1.w1 === n1.w2, `${n1.w1} / ${n1.w2}`);
  b('窄屏标签与输入框同一左边界', Math.abs(n1.lbL - n1.inL) <= 1, '');
  b('窄屏无横向溢出', await p.evaluate(`document.documentElement.scrollWidth<=375`));

  await p.close();
});

console.log('\n【B 浏览器实测】');
B.forEach(([n, ok, x]) => { check(n, ok, x); console.log(ok ? `  ✓ ${n}${x ? '　' + x : ''}` : `  ✗ ${n}${x ? '　' + x : ''}`); });

const total = pass.length + fail.length;
console.log('\n' + '—'.repeat(46));
console.log(`P0 账号区门禁：通过 ${pass.length} · 失败 ${fail.length}`);
if (fail.length) {
  console.log('失败项：');
  fail.forEach((f) => console.log('  · ' + f));
  process.exit(1);
}
console.log('EXIT=0');
