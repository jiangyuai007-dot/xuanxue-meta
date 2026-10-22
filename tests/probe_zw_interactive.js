/* 紫微交互盘探针：验证引擎新字段 + 图表交互结构 */
import { computeZiwei } from '../src/engines/ziwei.js';
import { renderZiwei } from '../src/report/charts/ziwei.js';

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra); }
};

const f = computeZiwei({ year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });

// 引擎新事实
t('birthYear/虚岁', f.birthYear === 1990 && f.xuAge >= 36 && f.xuAge <= 38, `birthYear=${f.birthYear} xuAge=${f.xuAge}`);
t('大限12步', f.daXian.length === 12);
t('大限带干支', f.daXian.every((d) => d.ganzhi && d.ganzhi.length === 2), JSON.stringify(f.daXian[0]));
t('大限带四化', f.daXian.every((d) => d.sihua && d.sihua.lu && d.sihua.quan && d.sihua.ke && d.sihua.ji));
t('大限流年10年', f.daXian.every((d) => d.liuNian.length === 10 && d.liuNian[0].year === 1990 + d.ageStart - 1), JSON.stringify(f.daXian[0].liuNian?.[0]));
t('恰好一个当前大限', f.daXian.filter((d) => d.isCurrent).length === 1, JSON.stringify(f.daXian.filter((d) => d.isCurrent)));
t('命主/身主', typeof f.mingZhu === 'string' && f.mingZhu.length >= 2 && typeof f.shenZhu === 'string' && f.shenZhu.length >= 2, `${f.mingZhu}/${f.shenZhu}`);
t('四柱齐全', f.siZhu && [f.siZhu.year, f.siZhu.month, f.siZhu.day, f.siZhu.hour].every((x) => x && x.length === 2), JSON.stringify(f.siZhu));
t('阳历生日', f.solarDate && f.solarDate.year === 1990, JSON.stringify(f.solarDate));
console.log('  命主/身主:', f.mingZhu, '/', f.shenZhu, ' 四柱:', `${f.siZhu.year} ${f.siZhu.month} ${f.siZhu.day} ${f.siZhu.hour}`);
const cur = f.daXian.find((d) => d.isCurrent);
console.log('  当前大限:', `${cur.ageStart}-${cur.ageEnd}岁 ${cur.zhi}宫 ${cur.ganzhi}`, '四化', JSON.stringify(cur.sihua));

// 图表交互结构（只数 HTML 部分，排除 <style> 里的选择器）
const html = renderZiwei(f);
const body = html.slice(html.lastIndexOf('</style>'));
const t2 = (name, re, n) => t(name, (body.match(re) || []).length === n, String((body.match(re) || []).length));
t2('宫位radio 12', /name="zwpg"/g, 12);
t2('大限radio 13', /name="zwdx"/g, 13);
t2('虚线组12', /data-sel="\d+"/g, 12);
t2('虚线36条', /<line /g, 36);
t2('大限宫名重排144', /data-dx="\d+"/g, 144);
t2('大限面板13', /data-dxp=/g, 13);
t2('宫位面板12', /data-selp=/g, 12);
// 流年盘（下一步功能）
t2('流年radio 120', /name="zwln"/g, 120);
t2('流年名重排1440', /data-ln="\d+-\d+"/g, 1440);
t2('流年面板120', /data-lnp="\d+-\d+"/g, 120);
t('流年双条件CSS 720(120态×6规则)', (html.match(/#zwdx-\d+:checked ~ #ln-\d+-\d+:checked/g) || []).length === 720, String((html.match(/#zwdx-\d+:checked ~ #ln-\d+-\d+:checked/g) || []).length));
t2('流年label 120', /class="lnl"/g, 120);
t('本命盘按钮', html.includes('class="mbtn"'));
t('中宫不再被虚线压住(z-index 4)', /\.mid\{[^}]*z-index:4/.test(html));
t('选中态CSS生成', html.includes('#zwpg-' + ['子丑寅卯辰巳午未申酉戌亥'.indexOf(f.mingGong.zhi)] + ':checked ~ .bwrap .lines'));
t('本命盘面板默认', html.includes('data-dxp="ben"'));
t('流年面板含干支', html.includes('十年流年'));
t('当前大限标注', html.includes('·今'));
t('中宫当前大限', html.includes('当前大限'));
// 文墨版式补齐（第三轮）
t2('底部大限导航13', /data-dxn=/g, 13);
t('中宫四柱', body.includes('四柱'));
t('中宫生年四化章', body.includes('生年四化') && (body.match(/class="mhc"/g) || []).length === 4, String((body.match(/class="mhc"/g) || []).length));
t('中宫命主身主', body.includes('命主 / 身主'));
t('导航选中态CSS', html.includes('#zwdx-ben:checked ~ .dxnav label[data-dxn="ben"]'));
t('中宫阳历行', body.includes('阳历'));
// 第四轮：文墨版式（大号大限岁段 + 宫名底部 + 流年岁数行）
t2('大号岁段按钮12', /data-dxz="/g, 12);
t('岁段选中态CSS', html.includes('.zd[data-dxz="') && html.includes('{background:#b03a2e;color:#fff'));
t2('流年岁数行12', /class="zly"/g, 12);
t('宫名底部布局', !body.includes('class="zsub"'));
t('宫名行含干支', (body.match(/class="zg">/g) || []).length === 12, String((body.match(/class="zg">/g) || []).length));
console.log('  流年岁数抽查(命宫' + f.mingGong.zhi + '):', (body.match(/流年 ([\d,]+)/) || [])[1]);
// 第五轮：庙旺利陷 + 绿块修复 + 浅灰虚线
const allStars = Object.values(f.palaces).flatMap((p) => p.stars).filter((s) => s.kind === '主星');
t('主星14颗全带亮度', allStars.length === 14 && allStars.every((s) => s.brightness && '庙旺得利平不陷'.includes(s.brightness)), JSON.stringify(allStars.map((s) => s.name + s.brightness)));
t2('亮度小字14', /class="bd[" ]/g, 14);
t('亮度陷标红CSS', html.includes('.bd.bad'));
t('命宫不再深绿底', !html.includes('#2f5f52') && /\.zp\.ming\{background:#fdf3dd/.test(html));
t('虚线浅灰', html.includes('stroke:#c3baa8'));
t('虚线不被中宫压住(z-index 5)', /\.lines\{[^}]*z-index:5/.test(html));

// 三方四正正确性抽查：命宫在 f.mingGong.zhi，三方=+4/+8，对宫=+6
const Z = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const mi = Z.indexOf(f.mingGong.zhi);
const partners = [Z[(mi + 4) % 12], Z[(mi + 8) % 12], Z[(mi + 6) % 12]];
console.log('  命宫', f.mingGong.zhi, '三方四正:', partners.join(' '));
t('三方四正含对宫', partners.includes(Z[(mi + 6) % 12]));

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
