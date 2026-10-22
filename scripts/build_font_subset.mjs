/**
 * 玄机 · 衬线字体子集构建（P0-1 修复）
 *
 * 问题：全站 --serif 指定 "Noto Serif SC"，但仓库里既没有 @font-face 也没有字体 CDN，
 *       → 用户机器没装这个字体就 fallback：Windows 掉宋体、Android 掉无衬线，
 *         而四柱 40px 大字 / 宫位名 / 品牌字全都靠它撑，直接掉档。
 *
 * 方案：用 Google Fonts 的 `text=` 参数做**服务端子集化**——
 *       它只返回我们真正用到的那几千个字，且三个字重（400/700/900）共用同一个可变字体 woff2，
 *       所以最终只有 1 个文件。字体随 web/ 一起部署，运行时零外部请求，VPS 上也能离线用。
 *
 * 字符集口径（只收真正会落到衬线位的文本，不要把 AI 生成的正文塞进来，那部分是 sans）：
 *   1. web/*.html + web/style.css   —— 页面文案与品牌位
 *   2. src/report/**               —— 命盘图表模板（干支/宫位/星曜/八门，最重的衬线区）
 *   排除：src/interpret（那边是十神/神煞等短标签，主要落在 sans 的报告正文里，
 *         收进来会让子集从 ~1060 字膨胀到 ~1840 字、体积几乎翻倍，而实际观感收益接近 0）、
 *         src/ai（AI 生成正文，走 --sans）、data/（缓存产物）
 *
 * 体积账：CJK 衬线字单个字形很重，1060 字 ≈ 400KB（分 2 片，靠 unicode-range 按需命中），
 * 已配 font-display:swap —— 字体没 ready 时先用系统衬线顶上，不会白屏。
 *
 * 用法：node scripts/build_font_subset.mjs
 *       离线/Google 不可达时脚本会报错退出，不会产出半成品 —— 避免静默退回「字体没落地」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const FONT_DIR = path.join(WEB, 'fonts');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FAMILY = 'Noto+Serif+SC';
const OUT_NAME = 'NotoSerifSC-subset.woff2';
const CSS_NAME = 'subset.css';

/** 收集目录 / 文件里出现过的所有「非 ASCII 可视字符」 */
function collect(files) {
  const set = new Set();
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const ch of txt) {
      const c = ch.codePointAt(0);
      // >U+2000：中文、日文假名、全角标点、常见符号；排除 ASCII 与制表符等控制/半角字符
      if (c > 0x2000) set.add(ch);
    }
  }
  return [...set].sort();
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name.startsWith('.') || f.name === 'node_modules' || f.name === 'data') continue;
    const fp = path.join(dir, f.name);
    if (f.isDirectory()) walk(fp, acc);
    else if (/\.(html|css|js|mjs)$/.test(f.name)) acc.push(fp);
  }
  return acc;
}

async function main() {
  const files = [
    ...fs.readdirSync(WEB).filter((f) => /\.html$/.test(f)).map((f) => path.join(WEB, f)),
    path.join(WEB, 'style.css'),
    ...walk(path.join(ROOT, 'src', 'report')),
  ];
  const chars = collect([...new Set(files)]);
  if (chars.length < 10) throw new Error(`字符集太小（${chars.length}），脚本口径可能坏了，拒绝继续`);
  console.log(`字符集：${files.length} 个源文件 · ${chars.length} 个唯一字符`);

  // text= 参数有长度上限：实测 ≤800 字时 Google 返回「按我们查的字精确切出来的子集」，
  // 一旦超过（约 900 字）它会忽略 text= 直接吐全量 101 个分片（faces=303）。
  // 所以这里按 800 字一批切，每批各自一套 woff2 + unicode-range，浏览器只会下命中的那批。
  const CHUNK = 800;
  const batches = [];
  for (let i = 0; i < chars.length; i += CHUNK) batches.push(chars.slice(i, i + CHUNK));

  fs.mkdirSync(FONT_DIR, { recursive: true });
  const faces = [];
  const out = [];
  for (let bi = 0; bi < batches.length; bi++) {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${FAMILY}:wght@400;700;900&text=${encodeURIComponent(batches[bi].join(''))}`;
    const res = await fetch(cssUrl, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`Google Fonts CSS 请求失败 ${res.status}（第 ${bi + 1}/${batches.length} 批）`);
    const css = await res.text();
    const blocks = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
    if (blocks.length > 6) throw new Error(`第 ${bi + 1} 批退回全量分片（faces=${blocks.length}），CHUNK=${CHUNK} 需要调小`);

    const url = blocks[0].match(/url\((https:[^)]+)\)/)?.[1];
    const range = blocks[0].match(/unicode-range:\s*([^;]+);/)?.[1] || '';
    if (!url || !range) throw new Error(`第 ${bi + 1} 批未解析出 url/unicode-range`);

    const fontRes = await fetch(url, { headers: { 'user-agent': UA } });
    if (!fontRes.ok) throw new Error(`字体下载失败 ${fontRes.status}（第 ${bi + 1} 批）`);
    const buf = Buffer.from(await fontRes.arrayBuffer());
    const name = batches.length === 1 ? OUT_NAME : `NotoSerifSC-subset-${bi + 1}.woff2`;
    fs.writeFileSync(path.join(FONT_DIR, name), buf);
    out.push({ name, size: buf.length });
    console.log(`  第 ${bi + 1}/${batches.length} 批 · ${batches[bi].length} 字 · ${name} ${(buf.length / 1024).toFixed(1)} KB`);

    // 同一可变字体，多字重共用这一份 url —— 每个字重各写一条 @font-face
    for (const b of blocks) {
      const weight = b.match(/font-weight:\s*(\d+)/)?.[1] || '400';
      faces.push(
        `@font-face {\n  font-family: 'Noto Serif SC';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url(../fonts/${name}) format('woff2');\n  unicode-range: ${range};\n}`
      );
    }
  }

  fs.writeFileSync(
    path.join(FONT_DIR, CSS_NAME),
    `/* 自动生成，勿手改 —— 由 scripts/build_font_subset.mjs 产出。
   用途：全站 --serif 依赖的 Noto Serif SC 子集，未落地会导致 Android / Windows 掉成无衬线，
   四柱 40px 大字的仪式感全丢。这里把 Google 的子集搬到本地，运行时零外部请求。 */\n\n${faces.join('\n\n')}\n`
  );
  // 把 @font-face 挂到用得上衬线的页面头上（幂等，重复执行不会重复插）
  // 用 <link> 而不是 CSS 的 @import：@import 会串行阻塞，link 可以并行下载。
  const TARGETS = ['bazi.html', 'hepan.html', 'liuyao.html', 'qimen.html', 'ziwei.html'];
  const TAG = `<link rel="stylesheet" href="fonts/${CSS_NAME}">`;
  let linked = 0;
  for (const t of TARGETS) {
    const fp = path.join(WEB, t);
    if (!fs.existsSync(fp)) continue;
    let html = fs.readFileSync(fp, 'utf8');
    if (html.includes(`href="fonts/${CSS_NAME}"`)) continue;
    // 插到 style.css 的 <link> 之后
    if (!/<link rel="stylesheet" href="style\.css">/.test(html)) throw new Error(`${t} 里找不到 style.css 的 link，插入点需要调整`);
    html = html.replace(/<link rel="stylesheet" href="style\.css">/, `<link rel="stylesheet" href="style.css">\n${TAG}`);
    fs.writeFileSync(fp, html);
    linked++;
    console.log(`  已注入 ${t}`);
  }

  const total = out.reduce((s, o) => s + o.size, 0);
  console.log(`\n完成：web/fonts/${CSS_NAME} + ${out.length} 个 woff2，合计 ${(total / 1024).toFixed(1)} KB，注入 ${linked} 个页面`);
  console.log('（--serif 里的 "Noto Serif SC" 名字没变，@font-face 一挂载就自动命中本地子集，无需改 style.css）');
}

main().catch((e) => {
  console.error('字体子集构建失败：', e.message);
  process.exit(1);
});
