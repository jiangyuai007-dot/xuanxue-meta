/**
 * 探针：页面拆分 / 神煞补齐 / 流月下钻样式 / 六爻伏神与动爻 / 称骨样式
 * 断言全部通过打印 PASS 清单，任何失败打印 FAIL 并以非零退出。
 */
import { build } from '../src/factpack.js';
import { renderChart } from '../src/report/index.js';
import { SHENSHA_RULES } from '../src/core/shensha.js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra); }
};

// ---------- 1. 四个独立页面 + 首页跳转 ----------
for (const p of ['bazi.html', 'liuyao.html', 'qimen.html', 'ziwei.html']) {
  const file = path.join(ROOT, 'web', p);
  const exists = fs.existsSync(file);
  ok(`page:${p}`, exists);
  if (exists) {
    const html = fs.readFileSync(file, 'utf8');
    ok(`page:${p}:data-sys`, html.includes(`data-sys="${p.replace('.html', '')}"`));
    ok(`page:${p}:nav`, html.includes('href="bazi.html"') && html.includes('href="ziwei.html"'));
  }
}
ok('index-redirect', fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8').includes('url=/bazi.html'));

// ---------- 2. 八字：神煞 / 大运上移 / 下钻 / 称骨 ----------
const baziFp = build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
const baziHtml = renderChart(baziFp);
const ssNames = baziFp.facts.shensha.map((s) => s.name);
ok('shensha:空亡', ssNames.includes('空亡'), ssNames.join(','));
ok('shensha:分组渲染', baziHtml.includes('bz-ss-grid') && baziHtml.includes('bz-ss-item'));
ok('shensha:释义展示', baziHtml.includes('<em>'));
ok('shensha:规则库>=30', SHENSHA_RULES.length >= 30, String(SHENSHA_RULES.length));
ok('shensha:命中>=8', baziFp.facts.shensha.length >= 8, String(baziFp.facts.shensha.length));
ok('dayun-position', baziHtml.indexOf('bz-track') > 0 && baziHtml.indexOf('bz-track') < baziHtml.indexOf('bz-rel">'), `track@${baziHtml.indexOf('bz-track')} rel@${baziHtml.indexOf('bz-rel"')}`);
ok('drill:grid-css', baziHtml.includes('bz-lym-bar{flex:1 1 100%') && baziHtml.includes('repeat(auto-fill,minmax(64px'));
ok('drill:data-m', baziHtml.includes('data-m="['));
ok('chenggu:verse-bold', baziHtml.includes('bz-cg2-verse{') && baziHtml.includes('font-weight:800;color:#8a4a12'));
ok('bazi:bold-800', baziHtml.includes('font-weight:800;line-height:1.1'));
ok('bazi:chenggu-facts', baziFp.facts.chengGu && !!baziFp.facts.chengGu.totalText);

// ---------- 3. 六爻：伏神 / 动爻 / 变卦推导 ----------
const lyFp = build({
  type: 'liuyao', method: 'coin',
  lines: [9, 7, 8, 6, 7, 9], // 初爻老阳、二爻少阳、三爻少阴、四爻老阴、五爻少阳、上爻老阳 → 动爻 0,3
  year: 2026, month: 9, day: 26, hour: 14, minute: 0, category: 'wealth', question: '探针',
});
const ly = lyFp.facts;
const lyHtml = renderChart(lyFp);
const dongIdx = ly.dongYao.map((d) => d.index);
ok('liuyao:coin-dong', JSON.stringify(dongIdx) === JSON.stringify([0, 3, 5]), JSON.stringify(dongIdx));

// 变卦严格由本卦动爻推导
const benLines = ly.lines.map((l) => (l.yang ? 1 : 0));
const expectBian = [...benLines];
for (const i of dongIdx) expectBian[i] = 1 - expectBian[i];
const bianLines = ly.bianLines.map((l) => (l.yang ? 1 : 0));
ok('liuyao:bian-derivation', JSON.stringify(expectBian) === JSON.stringify(bianLines), `${expectBian} vs ${bianLines}`);

// 伏神只出现在所缺六亲且各六亲至多一爻
const fuLines = ly.lines.filter((l) => l.fuShow);
const fuQins = fuLines.map((l) => l.fuLiuqin);
const presentQin = new Set(ly.lines.map((l) => l.liuqin));
ok('liuyao:fu-only-missing', fuQins.every((q) => !presentQin.has(q)), fuQins.join(','));
ok('liuyao:fu-unique', new Set(fuQins).size === fuQins.length, fuQins.join(','));
ok('liuyao:fu-props', lyHtml.includes('伏神') && lyHtml.includes('fuText') === false && (fuQins.length === 0 ? lyHtml.includes('六亲俱全') : true));
// 图中不再为每爻渲染伏神：lfu 出现次数应等于 fuShow 数
const lfuCount = (lyHtml.match(/class="lfu/g) || []).length;
ok('liuyao:fu-render-count', lfuCount === fuLines.length, `html=${lfuCount} fact=${fuLines.length}`);

// 动爻标记 ○/× 标在爻上（ymk），且不再有旧 mk 列
ok('liuyao:ymk-mark', lyHtml.includes('ymk'), '');
ok('liuyao:old-mk-gone', !lyHtml.includes('class="mk"'));
ok('liuyao:coin-name', lyHtml.includes('摇卦（铜钱）'));
ok('liuyao:shi-ying', ly.shiYing && typeof ly.shiYing.shiPosition === 'string');
ok('liuyao:bian-shi', ly.bianLines.some((l) => l.isShi) && ly.bianLines.some((l) => l.isYing));

// 数字起卦（单动爻）回归
const ly2 = build({ type: 'liuyao', method: 'number', numbers: [23, 88], year: 2026, month: 9, day: 26, hour: 14 }).facts;
ok('liuyao:number-dong1', ly2.dongYao.length === 1);

// ---------- 4. 静态页与服务端根跳转 ----------
ok('server:redirect', fs.readFileSync(path.join(ROOT, 'src', 'server', 'index.js'), 'utf8').includes("Location: '/bazi.html'"));

console.log(`\n==== ${pass} PASS / ${fail} FAIL ====`);
process.exit(fail ? 1 : 0);
