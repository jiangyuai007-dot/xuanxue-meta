/**
 * P0-1 门禁：衬线字体子集是否真的落地并在浏览器里命中。
 *
 * 背景：全站 --serif 指名 "Noto Serif SC"，但仓库原先既无 @font-face 也无字体 CDN →
 *       Android 掉无衬线、Windows 掉宋体，40px 四柱大字的仪式感全丢（UI 审计 P0-1）。
 *
 * 校验四件事：
 *   1. subset.css 存在且声明了 @font-face
 *   2. woff2 文件存在、体积合理、是合法 woff2（魔数 wOF2）
 *   3. 5 个排盘页都挂上了 <link href="fonts/subset.css">
 *   4. 真浏览器里 document.fonts.check() 对干支/宫位名这些关键词返回 true
 *
 * 用法：服务已在 8787 运行时 node scripts/p0_font_check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const WEB = path.join(ROOT, 'web');
const PAGES = ['bazi.html', 'hepan.html', 'liuyao.html', 'qimen.html', 'ziwei.html'];

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${extra ? '　' + extra : ''}`);
  ok ? pass++ : fail++;
};

// —— 1. 产物存在
console.log('\n【1 产物】');
const cssPath = path.join(WEB, 'fonts', 'subset.css');
check('subset.css 存在', fs.existsSync(cssPath));
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
const faceCount = (css.match(/@font-face/g) || []).length;
check('声明了 @font-face', faceCount >= 3, `${faceCount} 条`);
check('带 font-display:swap（字体没 ready 时先用系统衬线，不白屏）', /font-display:\s*swap/.test(css));

const woff2s = fs.existsSync(path.join(WEB, 'fonts'))
  ? fs.readdirSync(path.join(WEB, 'fonts')).filter((f) => f.endsWith('.woff2'))
  : [];
check('woff2 文件已产出', woff2s.length >= 1, woff2s.join(', '));
for (const w of woff2s) {
  const p = path.join(WEB, 'fonts', w);
  const buf = fs.readFileSync(p);
  const isWoff2 = buf.length > 4 && buf.toString('latin1', 0, 4) === 'wOF2';
  check(`${w} 是合法 woff2（魔数 wOF2）`, isWoff2, `${(buf.length / 1024).toFixed(1)} KB`);
}

// —— 2. 页面挂载
console.log('\n【2 页面挂载】');
for (const p of PAGES) {
  const fp = path.join(WEB, p);
  if (!fs.existsSync(fp)) {
    check(`${p} 存在`, false);
    continue;
  }
  const html = fs.readFileSync(fp, 'utf8');
  check(`${p} 挂上 fonts/subset.css`, /href="fonts\/subset\.css"/.test(html));
}

// —— 3. 真浏览器命中
console.log('\n【3 浏览器实测】');
await withBrowser(async (br) => {
  const page = await br.page({ w: 1440, h: 900, mobile: false });
  await page.goto(BASE + '/bazi.html', 1800);
  // 干支、宫位、十神 —— 全都是衬线位的字符
  const r = await page.evaluate(`(async()=>{
    await document.fonts.ready;
    const keys = [
      ['玄','品牌字'],['甲','天干'],['子','地支'],['命宫','宫位名'],['正官','十神'],
      ['乙','次天干'],['大运','图表标题'],['空亡','标签'],
    ];
    const out = {};
    for (const [k, label] of keys) out[label+':'+k] = document.fonts.check('700 40px "Noto Serif SC"', k);
    out.__loaded = [...document.fonts].map(f => f.family + '/' + f.weight + '/' + f.status).join('|');
    return out;
  })()`);
  for (const [k, v] of Object.entries(r)) {
    if (k === '__loaded') continue;
    check(`字体命中 ${k}`, v === true);
  }
  console.log(`      文档内字体状态：${r.__loaded}`);
  await page.close();
});

console.log(`\n———— P0-1 字体门禁：通过 ${pass} · 失败 ${fail} ————`);
process.exit(fail ? 1 : 0);
