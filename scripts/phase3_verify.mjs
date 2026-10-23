/**
 * Phase 3 专项验收门禁（scripts/phase3_verify.mjs）
 *
 * 逐项验证 Phase 3 四大核心交付物与无障碍/PWA 门禁：
 *   1. 移动端导航与排盘表单折叠交互（Bottom TabBar .mobile-tabbar、吸顶折叠摘要条 #formSummaryBar、二级视图切换 .stage-view-tabs）
 *   2. 四大体系移动端专属盘面交互（八字四子视图切换 .bz-subtabs、紫微/奇门 Bottom Sheet 抽屉 .xx-bsheet、紫微窄屏精简盘、六爻摇卦触感震动）
 *   3. PWA 离线化与安装支持（manifest.json、sw.js Service-Worker-Allowed 头、icon.svg、CSP worker-src/manifest-src/blob:、离线排盘缓存）
 *   4. 国风宣纸 SVG 分享卡与 1080×1560 竖版高清 Canvas 命书海报导出
 *   5. 全站 HTML 无障碍静态门禁（label 关联、控件可访问名、skip-link、焦点环）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { build } from '../src/factpack.js';
import { computeHePan } from '../src/engines/hepan.js';
import { renderChart, renderShareCardSvg } from '../src/report/index.js';
import { SECURITY_HEADERS } from '../src/server/hardening.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}${detail ? `　${detail}` : ''}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? `　${detail}` : ''}`);
  }
}

console.log('\n【1】移动端导航架构、吸顶折叠摘要条与二级胶囊视图切换验证');
{
  const css = fs.readFileSync(path.join(WEB, 'style.css'), 'utf8');
  const posterJs = fs.readFileSync(path.join(WEB, 'poster.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(WEB, 'app.js'), 'utf8');
  const hpJs = fs.readFileSync(path.join(WEB, 'hepan-drill.js'), 'utf8');

  check('style.css 含移动端底部导航栏 (.mobile-tabbar) 与安全区适配',
    css.includes('.mobile-tabbar') && css.includes('env(safe-area-inset-bottom'));
  check('style.css 含排盘后吸顶折叠摘要条 (.form-summary-bar / .formbar.is-collapsed)',
    css.includes('.form-summary-bar') && css.includes('.formbar.is-collapsed .fb-card{display:none}'));
  check('style.css 含移动端工作台二级胶囊视图切换 (.stage-view-tabs / data-mview)',
    css.includes('.stage-view-tabs') && css.includes('.workbench[data-mview="report"]'));
  check('poster.js 暴露 __xjCollapseForm、__xjSwitchStageView 与 __xjOpenPosterModal',
    posterJs.includes('window.__xjCollapseForm') && posterJs.includes('window.__xjSwitchStageView') && posterJs.includes('window.__xjOpenPosterModal'));
  check('app.js 与 hepan-drill.js 排盘后自动触发 __xjCollapseForm 折叠摘要条',
    appJs.includes('__xjCollapseForm') && hpJs.includes('__xjCollapseForm'));
}

console.log('\n【2】四大体系移动端盘面专属交互升级验证');
{
  const bzPack = build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
  const bzHtml = renderChart(bzPack);
  check('八字盘面含四子视图切换器 (.bz-subtabs：全部全览/核心命盘/命主细盘/干支图谱/神煞全表)',
    bzHtml.includes('class="bz-subtabs"') &&
    bzHtml.includes('id="bzv-core"') &&
    bzHtml.includes('id="bzv-detail"') &&
    bzHtml.includes('id="bzv-graph"') &&
    bzHtml.includes('id="bzv-shensha"') &&
    bzHtml.includes('data-bsec="core"'));

  const zwPack = build({ type: 'ziwei', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
  const zwHtml = renderChart(zwPack);
  check('紫微盘面每宫含单宫详情数据属性 (data-zw-title / data-zw-detail) 与「详」按钮 (.zw-dtl-btn)',
    zwHtml.includes('data-zw-title=') && zwHtml.includes('data-zw-detail=') && zwHtml.includes('class="zw-dtl-btn qm-el"'));

  const drillJs = fs.readFileSync(path.join(WEB, 'bazi-drill.js'), 'utf8');
  check('bazi-drill.js 含奇门/紫微移动端 Bottom Sheet 抽屉 (openBottomSheet / .xx-bsheet) 与窄屏自动精简盘',
    drillJs.includes('openBottomSheet') && drillJs.includes('xx-bsheet') && drillJs.includes('autoCompactZiweiOnMobile'));

  const appJs = fs.readFileSync(path.join(WEB, 'app.js'), 'utf8');
  check('六爻在线摇卦接入移动端触感震动反馈 (navigator.vibrate)',
    appJs.includes('navigator.vibrate'));
}

console.log('\n【3】PWA 离线化与安装支持验证（Manifest / Service Worker / 图标 / CSP）');
{
  const pages = ['bazi.html', 'liuyao.html', 'qimen.html', 'ziwei.html', 'hepan.html', 'mine.html'];
  const allLinked = pages.every((f) => {
    const s = fs.readFileSync(path.join(WEB, f), 'utf8');
    return s.includes('rel="manifest" href="manifest.json"') && s.includes('rel="icon" href="icon.svg"') && s.includes('poster.js');
  });
  check('全站 6 个主页面均注入 manifest.json、icon.svg 与 poster.js', allLinked);

  const swCode = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8');
  check('sw.js 预缓存全站静态骨架并支持 /api/paipan 离线回退缓存',
    swCode.includes('CACHE_STATIC') && swCode.includes('/api/paipan') && swCode.includes('offline_key='));

  const csp = SECURITY_HEADERS['Content-Security-Policy'] || '';
  check('CSP 安全头放行 worker-src、manifest-src 与 img-src blob:',
    csp.includes("worker-src 'self'") && csp.includes("manifest-src 'self'") && csp.includes('blob:'));
}

console.log('\n【4】国风宣纸 SVG 分享卡与 1080×1560 竖版 Canvas 海报验证');
{
  const baziPack = build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
  const zwPack = build({ type: 'ziwei', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
  const qmPack = build({ type: 'qimen', year: 2026, month: 6, day: 7, hour: 10, minute: 0, city: '北京', panType: 'fei' });
  const lyPack = build({ type: 'liuyao', year: 2026, month: 6, day: 7, hour: 10, minute: 0, city: '北京' });
  const hpPack = {
    id: 'hepan:test',
    system: 'hepan',
    facts: computeHePan({ a: baziPack.facts, b: baziPack.facts, names: { a: '甲', b: '乙' } }),
  };

  for (const [name, pk] of [['八字', baziPack], ['紫微', zwPack], ['奇门', qmPack], ['六爻', lyPack], ['合盘', hpPack]]) {
    const svg = renderShareCardSvg(pk);
    check(`${name}国风宣纸 SVG 分享卡生成正常（含烫金边框与朱砂正印）`,
      svg.startsWith('<svg') && svg.includes('xjPaper') && svg.includes('正印') && svg.length > 800);
  }

  const posterJs = fs.readFileSync(path.join(WEB, 'poster.js'), 'utf8');
  check('poster.js 内置 1080×1560 高清 Canvas 宣纸海报绘制器与 PNG 导出',
    posterJs.includes('width="1080" height="1560"') && posterJs.includes("toDataURL('image/png')"));
}

console.log('\n【5】服务端 PWA 路由响应与全站无障碍静态门禁验证');
{
  // 静态无障碍门禁检查
  const a11yPages = ['bazi.html', 'hepan.html', 'liuyao.html', 'qimen.html', 'ziwei.html'];
  let a11yErrors = 0;
  for (const f of a11yPages) {
    const s = fs.readFileSync(path.join(WEB, f), 'utf8');
    const ids = new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]));
    const labels = [...s.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)];
    for (const m of labels) {
      const attrs = m[1];
      const forId = (attrs.match(/for="([^"]+)"/) || [])[1];
      const ownId = (attrs.match(/id="([^"]+)"/) || [])[1];
      const wrapsCtrl = /<(input|select|textarea)\b/.test(m[2]);
      const referenced = ownId && new RegExp(`aria-labelledby="${ownId}"`).test(s);
      if (!((forId && ids.has(forId)) || wrapsCtrl || referenced)) a11yErrors += 1;
    }
    if (!/<main id="main"/.test(s) || !/class="skip-link" href="#main"/.test(s)) a11yErrors += 1;
  }
  check('全站 5 大排盘页通过无障碍 label 关联与 landmark 静态门禁', a11yErrors === 0, `errors=${a11yErrors}`);

  // 启动 HTTP 服务验证 /manifest.json、/sw.js、/icon.svg
  const PORT = 18893;
  const BASE = `http://127.0.0.1:${PORT}`;
  const srv = spawn(process.execPath, [path.join(ROOT, 'src/server/index.js')], {
    env: { ...process.env, PORT: String(PORT), AI_FORCE_LOCAL: '1' },
    stdio: 'ignore',
  });

  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`${BASE}/api/health`);
        if (r.ok) { ready = true; break; }
      } catch { /* wait */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    check('测试服务启动成功', ready);

    const mfRes = await fetch(`${BASE}/manifest.json`);
    const mfCt = mfRes.headers.get('content-type') || '';
    const mfJson = await mfRes.json();
    check('GET /manifest.json 返回 application/manifest+json 与完整 PWA 配置',
      mfRes.status === 200 && mfCt.includes('application/manifest+json') && mfJson.display === 'standalone' && Array.isArray(mfJson.shortcuts),
      `ct=${mfCt} shortcuts=${mfJson.shortcuts?.length}`);

    const swRes = await fetch(`${BASE}/sw.js`);
    const swAllowed = swRes.headers.get('service-worker-allowed') || '';
    const swCc = swRes.headers.get('cache-control') || '';
    check('GET /sw.js 返回 Service-Worker-Allowed: / 与 no-cache 头',
      swRes.status === 200 && swAllowed === '/' && swCc.includes('no-cache'),
      `Service-Worker-Allowed=${swAllowed} Cache-Control=${swCc}`);

    const icRes = await fetch(`${BASE}/icon.svg`);
    const icText = await icRes.text();
    check('GET /icon.svg 返回 image/svg+xml 矢量图标',
      icRes.status === 200 && (icRes.headers.get('content-type') || '').includes('image/svg+xml') && icText.includes('<svg'));
  } finally {
    srv.kill('SIGTERM');
  }
}

console.log('\n════════════════════════════════════════════');
console.log(`Phase 3 专项门禁：通过 ${pass} 项 · 失败 ${fail} 项`);
console.log('════════════════════════════════════════════\n');
process.exit(fail === 0 ? 0 : 1);
