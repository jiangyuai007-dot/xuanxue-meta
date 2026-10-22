/**
 * P0 端到端脚本：真 Key 跑通「事实 → AI → 结构化 slot → 固定版式」全链路
 *
 * 用法：
 *   node scripts/p0_ai_report.mjs                 # 跑全 10 章，出 .p0_report.html
 *   node scripts/p0_ai_report.mjs --force-local    # 只验本地兜底路径（不联网）
 *   node scripts/p0_ai_report.mjs --only=geju,xingge
 *   node scripts/p0_ai_report.mjs --sample=1990-05-05T10:00, male, Beijing
 *
 * API Key 优先取环境变量 AGNES_API_KEY，其次读桌面 agnes.txt（第一行）。
 * 绝不把 Key 写进源码。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (name, def = null) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : true;
};

// —— Key 注入必须在 import ai 层之前 ——
if (!process.env.AGNES_API_KEY) {
  const keyFile = 'C:/Users/Administrator/Desktop/agnes.txt';
  if (fs.existsSync(keyFile)) {
    const line = fs.readFileSync(keyFile, 'utf8').split('\n').map((s) => s.trim()).find((s) => s.startsWith('sk-'));
    if (line) {
      process.env.AGNES_API_KEY = line;
      console.log('[key] 已从桌面 agnes.txt 载入');
    }
  }
}
if (flag('force-local')) process.env.AI_FORCE_LOCAL = '1';
const only = flag('only', null);
const noCache = flag('no-cache', false);

// —— 动态引入（模块初始化时要读 env）——
const { build } = await import('../src/factpack.js');
const { planSelfCheck, listChapters } = await import('../src/core/reportPlan.js');
const { generateReport, generateChapter } = await import('../src/ai/index.js');
const client = await import('../src/ai/client.js');
const { renderReportPage } = await import('../src/report/templates/bazi.js');
const { renderBazi } = await import('../src/report/charts/bazi.js');

// ---------------------------------------------------------------- 自检
const planErrs = planSelfCheck();
if (planErrs.length) {
  console.error('✗ 模板注册表自检未通过：');
  for (const e of planErrs) console.error('   ', e);
  process.exit(1);
}
console.log('✓ reportPlan 自检通过（10 章 / 2 免费章 / needs 引用齐全）');

// ---------------------------------------------------------------- 样本
const input = {
  type: 'bazi',
  calendar: 'solar',
  year: 1990, month: 5, day: 5, hour: 10, minute: 0,
  gender: 'male',
  city: 'Beijing',
  useTrueSolarTime: true,
};
console.log('✓ 样本输入：', JSON.stringify(input));

const factPack = build(input);
if ((factPack.meta?.warnings || []).length) console.log('  ⚠ 事实包告警：', factPack.meta.warnings.join(' / '));
console.log('✓ 事实包：', factPack.id, '（引擎', factPack.meta.engineVersion + '）');

// ---------------------------------------------------------------- 跑章
const allKeys = listChapters('bazi').map((c) => c.key);
const keys = only ? String(only).split(',').filter(Boolean) : allKeys;

const t0 = Date.now();
const report = await generateReport({
  system: 'bazi',
  factPackId: factPack.id,
  facts: factPack.facts,
  useCache: !noCache, // 默认走缓存（同八字复跑秒开、零成本）；--no-cache 强制真调
  onChapter: (r, prog) => {
    const mark = r.source === 'ai' ? 'AI ' : r.source === 'cache' ? '缓存' : '本地';
    console.log(`  [${prog.done}/${prog.total}] ${r.key.padEnd(10)} ${mark} ${String(r.latencyMs).padStart(6)}ms  via=${r.via || '-'}`);
    for (const w of r.warnings) console.log(`        ⚠ ${w}`);
    if (r.error) console.log(`        ✗ ${r.error}`);
  },
});

console.log('\n———— 汇总 ————');
console.log(`总耗时 ${report.totalMs}ms（墙钟 ${Date.now() - t0}ms）｜AI ${report.aiCount} 章 · 缓存 ${report.cacheCount} 章 · 本地兜底 ${report.localCount} 章`);
for (const r of report.chapters) {
  const d = r.data || {};
  console.log(
    `  ${r.key.padEnd(10)} ${String(r.source).padEnd(6)} summary=${String(d.summary || '').length}字 points=${(d.points || []).length} basis=[${(d.basis || []).join(',')}]`
  );
}

// ---------------------------------------------------------------- 出报告
const chapters = report.chapters.map((r) => ({
  chapter: { key: r.key, title: r.title, order: r.order, free: r.free },
  data: r.data,
  source: r.source,
  unlocked: true,
}));
const panHtml = `<div class="rp-pan">${renderBazi(factPack)}</div>`;
const html = renderReportPage({
  panHtml,
  chapters,
  source: report.chapters.some((r) => r.source === 'ai') ? 'ai' : 'local',
  factPackId: factPack.id,
});
const outFile = path.join(ROOT, '.p0_report.html');
fs.writeFileSync(outFile, html, 'utf8');
console.log(`✓ 报告已输出：${outFile}`);

const usage = client.usageStats();
console.log('✓ 调用计量：', JSON.stringify(usage));
process.exit(0);
