/**
 * UI 审计截图：桌面 + 移动 双端，覆盖各体系入口页与合盘报告态。
 * 落到 shots/ui-audit/ 下，供人工 / 模型评审。
 *
 * 用法：node scripts/ui_audit_shots.mjs
 *
 * 两个本机踩过的坑（改脚本前先看这里）：
 * 1. 同一个浏览器里同时挂着多个标签页时，后台标签 Page.captureScreenshot 会超时 —— 必须「一页一关」。
 * 2. 页面里的 infinite CSS 动画（style.css .sp / .ring）会让 headless 一直等「稳定帧」—— 截图前先注入冻结样式。
 */
import fs from 'node:fs';
import { withBrowser } from './cdp.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = 'shots/ui-audit';
fs.mkdirSync(OUT, { recursive: true });

const DESK = { w: 1440, h: 900, mobile: false };
const MOB = { w: 390, h: 844, mobile: true };

const FREEZE_CSS = '*,*::before,*::after{animation:none!important;transition:none!important}';

// [路径, 文件名前缀, 视口, 是否需要先填表点「合盘」]
const JOBS = [
  ['/', '01-index', DESK],
  ['/', '01-index', MOB],
  ['/bazi.html', '02-bazi', DESK],
  ['/bazi.html', '02-bazi', MOB],
  ['/hepan.html', '03-hepan', DESK],
  ['/hepan.html', '03-hepan', MOB],
  ['/liuyao.html', '04-liuyao', DESK],
  ['/qimen.html', '05-qimen', DESK],
  ['/ziwei.html', '06-ziwei', DESK],
  ['/audit.html', '07-audit', DESK],
];

async function main() {
  const shots = [];
  await withBrowser(async (br) => {
    for (const [route, name, vp] of JOBS) {
      const p = await br.page({ url: BASE + route, w: vp.w, h: vp.h, mobile: vp.mobile });
      try {
        await new Promise((r) => setTimeout(r, 1500));
        await p.evaluate(`(()=>{let s=document.getElementById('__xjFreeze');if(!s){s=document.createElement('style');s.id='__xjFreeze';document.head.appendChild(s);}s.textContent=${JSON.stringify(FREEZE_CSS)};return 1;})()`);
        const f = `${OUT}/${name}-${vp.mobile ? 'mobile' : 'desktop'}.png`;
        await p.shot(f);
        shots.push(f);
        console.log(`✓ ${f}`);
      } catch (e) {
        console.log(`✗ ${name} ${e.message}`);
      } finally {
        await p.close();
      }
    }
  });
  console.log('SHOTS:\n' + shots.join('\n'));
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
