/**
 * 「AI 生成后报告不显示」修复的浏览器端闭环验证。
 *
 * 背景（线上真 bug）：浏览器表单 input.value 是字符串（"2006"），
 * 原 normalizeInput 原样放行 → lunar/astro 里 '2006'+1 拼成 '20061' → 天文计算死循环
 * → node 服务 100% CPU → 前端永远拿不到响应，排盘区/报告区一片空白。
 *
 * 本脚本用真实 headless Chrome 走完整用户路径：
 *   打开合盘页 → 点「合盘」→ 点「完整报告」 → 抓 #reportBody 实际 DOM。
 * 只信 DOM 里真有章节卡，不信接口 200。
 *
 * 用法：node scripts/ui_report_check.mjs
 */
import { withBrowser } from './cdp.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? '　' + extra : ''}`);
  ok ? pass++ : fail++;
};

async function waitFor(page, js, timeoutMs, label) {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(js);
    if (v) return { ok: true, ms: Date.now() - t0, v };
    if (Date.now() - t0 > timeoutMs) return { ok: false, ms: Date.now() - t0, v, label };
    await sleep(400);
  }
}

const run = async (br, { w, h, mobile, tag }) => {
  // 注意：/json/new?<url> 在本机偶发不落地，必须「先开 about:blank + Page.navigate」
  const page = await br.page({ w, h, mobile });
  await page.goto(`${BASE}/hepan.html`, 2500);
  await sleep(600);
  const landed = await page.evaluate('location.href + " | chart=" + !!document.getElementById("chart")');
  if (!/hepan/.test(landed)) throw new Error(`导航没落到 hepan.html：${landed}`);
  const trace = [`landed=${landed.split('|')[1]}`];

  await page.evaluate(`(() => { const e = document.getElementById('btnPaipan'); if (e) e.click(); return 'ok'; })()`);
  const paipan = await waitFor(
    page,
    `(() => { const c = document.getElementById('chart'); return c && c.style.display !== 'none' && c.innerHTML.length > 100 ? c.innerHTML.length : 0; })()`,
    25000,
    '排盘区'
  );
  check(`[${tag}] 点「合盘」后排盘区渲染出内容`, paipan.ok, `len=${paipan.v || 0} ${paipan.ms}ms`);
  trace.push(`paipan=${paipan.ms}ms`);

  // 复现用的脏组合：把任何一方年份改成 2006（原死循环组合），确认不再卡死
  const dirty = await page.evaluate(`(() => {
    const y = document.getElementById('bYear');
    if (!y) return 'no-node';
    y.value = '2006'; y.dispatchEvent(new Event('input'));
    return y.value;
  })()`);
  check(`[${tag}] 表单字段为字符串形态（复现脏输入）`, dirty === '2006', `bYear=${dirty}`);

  if (dirty === '2006') {
    const again = await waitFor(
      page,
      `(() => { const c = document.getElementById('chart'); return c && c.style.display !== 'none' && c.innerHTML.length > 100 ? c.innerHTML.length : 0; })()`,
      25000,
      '重排区'
    );
    check(`[${tag}] 脏年份（"2006"）重排不卡死`, again.ok, `len=${again.v || 0} ${again.ms}ms`);
    trace.push(`dirty-repaipan=${again.ms}ms`);
  }

  await page.evaluate(`(() => { const e = document.getElementById('btnReport'); if (e) e.click(); return 'ok'; })()`);
  // 只认真章节卡 .rp-ch：骨架 .rp-sk 也是 <section>，用 section 数会「骨架期假通过」
  const body = await waitFor(
    page,
    `(() => {
       const b = document.getElementById('reportBody');
       const ch = b ? b.querySelectorAll('.rp-ch').length : 0;
       const sk = b ? b.querySelectorAll('.rp-sk').length : -1;
       return ch >= 6 && sk === 0 ? ch : 0;
     })()`,
    150000,
    '报告区'
  );
  check(`[${tag}] 「完整报告」后报告区出现真章节卡`, body.ok, `章节=${body.v || 0} ${body.ms}ms`);
  trace.push(`report=${body.ms}ms`);

  const stat = await page.evaluate(`(() => {
    const b = document.getElementById('reportBody');
    const html = b ? b.innerHTML : '';
    return {
      len: html.length,
      sections: b ? b.querySelectorAll('.rp-ch').length : 0,
      basis: b ? b.querySelectorAll('.rp-basis').length : 0,
      skeleton: b ? b.querySelectorAll('.rp-sk').length : 0,
      src: (document.getElementById('reportSrc') || {}).textContent || '',
      display: b ? b.style.display : '',
      msg: (document.getElementById('msg') || {}).textContent || '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);
  console.log(`      报告区 ${stat.len}B / ${stat.sections} 卡 / 依据溯源 ${stat.basis} 处 / 骨架残留 ${stat.skeleton} / 来源「${stat.src}」/ 提示「${stat.msg}」/ display=${stat.display} / 横向溢出 ${stat.overflow}`);
  check(`[${tag}] 报告区有实质内容（>2000B）`, stat.len > 2000, `${stat.len}B`);
  check(`[${tag}] 6 章全部落地（无骨架残留）`, stat.sections >= 6 && stat.skeleton === 0, `${stat.sections} 卡 / 骨架 ${stat.skeleton}`);
  check(`[${tag}] 无错误提示`, !/失败|错误|开小差|不可用|请稍后/.test(stat.msg), `「${stat.msg}」`);
  check(`[${tag}] 报告区可见`, stat.display !== 'none');
  check(`[${tag}] 无横向溢出`, stat.overflow <= 0, `overflow=${stat.overflow}`);

  await page.shot(`shots/ui-report-${tag}.png`, true);
  await page.close();
  console.log(`      轨迹：${trace.join(' | ')}`);
};

await withBrowser(async (br) => {
  await run(br, { w: 1440, h: 900, mobile: false, tag: 'desktop' });
  await run(br, { w: 390, h: 844, mobile: true, tag: 'mobile' });
});

console.log(`\n———— 浏览器闭环：通过 ${pass} · 失败 ${fail} ————`);
process.exit(fail ? 1 : 0);
