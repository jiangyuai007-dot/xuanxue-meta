/**
 * P0-3 可访问性（二）：给"没有可访问名"的控件补 aria-label；并修正 style.css 里几处低对比色。
 * 幂等：只给「不含 aria-label 且 id 在映射表内」的控件补。
 *
 * ⚠️ 注：label 的 for= / role=group + aria-labelledby 那部分（p0_a11y_fix 的第一版）属一次性结构改写，
 *    已经在 2026-10-06 直接落到 5 个 html 上了，这个文件不负责那段；只在新增/改动表单控件时用得到。
 *
 * 用法：node scripts/p0_a11y_fix.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const log = [];

const TIME = ['year', 'month', 'day', 'hour', 'minute'];
const TIME_CN = { year: '年', month: '月', day: '日', hour: '时', minute: '分' };

/** 每个页面：id → aria-label */
function table(file) {
  const t = {};
  const addPrefix = (p, suff) => {
    for (const k of TIME) t[p + k] = `${p}${suff}${TIME_CN[k]}`;
  };
  if (file === 'bazi.html' || file === 'ziwei.html') addPrefix('', '出生');
  if (file === 'liuyao.html') addPrefix('', '起卦');
  if (file === 'qimen.html') addPrefix('', '起局');
  if (file === 'hepan.html') { addPrefix('a', '甲方出生'); addPrefix('b', '乙方出生'); }

  const shared = {
    isLeap: '闰月', leap: '闰月', useSolar: '真太阳时校正', solar: '真太阳时校正',
    aSolar: '真太阳时校正（甲方）', bSolar: '真太阳时校正（乙方）',
    aIsLeap: '甲方案例是否闰月', bIsLeap: '乙方案例是否闰月',
    gender: '性别', aGender: '甲方性别', bGender: '乙方性别',
    calendar: '历法', aCalendar: '甲方历法', bCalendar: '乙方历法',
    city: '出生地', aCity: '甲方出生地', bCity: '乙方出生地',
    aName: '甲方姓名（可留空）', bName: '乙方姓名（可留空）',
    method: '起卦方式', juMethod: '起局方式', panType: '盘式与寄宫',
    purpose: '所测事由', category: '事项分类', guaName: '卦名',
    n1: '上卦数', n2: '下卦数', m1: '上卦数', m2: '下卦数', m3: '参动数',
    customJu: '自定义局数', jiGong: '寄宫宫位',
  };
  return Object.assign(t, shared);
}

for (const f of ['bazi.html', 'hepan.html', 'liuyao.html', 'qimen.html', 'ziwei.html']) {
  const fp = path.join(web, f);
  let s = fs.readFileSync(fp, 'utf8');
  const t = table(f);
  let n = 0;

  const re = /<(input|select|textarea)\b([^>]*)>/g;
  const edits = [];
  let m;
  while ((m = re.exec(s))) {
    const tagName = m[1];
    const attrs = m[2];
    if (/aria-label(ledby)?=/.test(attrs)) continue;
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    const label = t[id];
    if (!label) continue;
    edits.push({ index: m.index, len: tagName.length + 1, to: `<${tagName} aria-label="${label}"` });
    n += 1;
  }
  edits.sort((a, b) => b.index - a.index);
  for (const e of edits) s = s.slice(0, e.index) + e.to + s.slice(e.index + e.len);
  fs.writeFileSync(fp, s);
  log.push(`${f} 补 aria-label ${n} 处`);
}

/* ---- style.css：几处实测不达标的文字色 ---- */
const cssPath = path.join(web, 'style.css');
let css = fs.readFileSync(cssPath, 'utf8');
// .intro-ic 44px 装饰符号：opacity .65 会把金色压到 3.4:1，直接去掉不透明即可（44px 属大字，3:1 也够，但更稳）
css = css.replace('.intro-ic{font-size:44px;color:var(--gold);opacity:.65;', '.intro-ic{font-size:44px;color:var(--gold-ink);opacity:.85;');
fs.writeFileSync(cssPath, css);
log.push('style.css .intro-ic 去 opacity 0.65 + 转 --gold-ink');

fs.writeFileSync(path.join(root, '.a11y-fix2.log'), log.join('\n'));
console.log(log.join('\n'));
