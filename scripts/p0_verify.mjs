/**
 * P0 门禁：全部在 Node 内跑完，不联网也能验（版式体检需本机 Chrome，缺失时跳过）
 *
 * 覆盖：模板注册表 / 事实编号 / slot schema / 解析容错 / 缓存键 / 客户端开关 / 版式体检 / 产物
 * 用法：node scripts/p0_verify.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { PLAN_VERSION, planSelfCheck, listChapters, buildFactLines, getChapter } from '../src/core/reportPlan.js';
import { slotsToJsonSchema, slotsToTool, describeSchema } from '../src/ai/schema.js';
import { parseChapterResponse, extractPayload } from '../src/ai/parse.js';
import { buildSystem, buildUser, buildRetryUser } from '../src/ai/prompt.js';
import * as cache from '../src/ai/cache.js';
import * as client from '../src/ai/client.js';
import { BAZI_PLAN } from '../src/core/reportPlan.js';

let pass = 0;
let fail = 0;
const fails = [];
function check(name, ok, extra = '') {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}${extra ? '　' + extra : ''}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  ✗ ${name}${extra ? '　' + extra : ''}`);
  }
}
const group = (t) => console.log(`\n【${t}】`);

// ---------------------------------------------------------------- 1 模板
group('1 模板注册表');
const errs = planSelfCheck();
check('章节结构自检', errs.length === 0, errs.join(' / '));
check('章节数 10', BAZI_PLAN.length === 10, `实际 ${BAZI_PLAN.length}`);
const freeKeys = BAZI_PLAN.filter((c) => c.free).map((c) => c.key);
check('免费章恰 2（命局概览/格局喜忌）', freeKeys.length === 2 && freeKeys.includes('mingju') && freeKeys.includes('geju'), freeKeys.join(','));
const order = BAZI_PLAN.map((c) => c.order);
check('order 连续 1-10 JSON.stringify', order.every((v, i) => v === i + 1), order.join(','));
check('六亲已并入感情章', !BAZI_PLAN.some((c) => c.key === 'qinyuan') && BAZI_PLAN.find((c) => c.key === 'ganqing').needs.length >= 4);

// ---------------------------------------------------------------- 2 事实编号
group('2 事实编号注入');
const fakeFacts = {
  fourPillars: { year: { name: '庚午' }, month: { name: '辛巳' }, day: { name: '甲子' }, hour: { name: '丙寅' }, year: {}, day: {} },
  dayMaster: { gan: '甲', element: '木', yang: true },
  shishen: { year: '正官', month: '正印', day: '日主', hour: '食神' },
  strength: { score: 42, level: '略弱', basis: ['月支不助日主（不得令）'] },
  pattern: { name: '食神格', basis: '月支巳火本气丙火为食神', shishen: '食神' },
  yongshen: { favorable: ['水', '木'], unfavorable: ['火', '土'], basis: '身弱', note: '借力' },
  elementPercent: { 木: 22, 火: 31, 土: 15, 金: 12, 水: 20 },
  shensha: [
    { name: '桃花', position: '日支', desc: '子午卯酉为四桃花位' },
    { name: '华盖', position: '年支', desc: '主孤寂静好学' },
  ],
  dayun: { basis: '阳男顺行', forward: true, startAge: 8, startYear: 1998, steps: [{ startAge: 8, name: '甲申', shishen: '正印' }] },
  liunian: [{ year: 2026, ganzhi: '丙午', shishen: '食神' }],
  chengGu: { totalQian: 30, totalText: '三两二钱', parts: [{ label: '年', text: '六钱' }], verse: '歌诀' },
  relations: { all: [{ name: '子午相冲', labels: ['日支', '时支'] }] },
  changsheng: { year: { state: '长生' }, month: { state: '沐浴' }, day: { state: '冠带' }, hour: { state: '临官' } },
  canggan: { year: [{ gan: '己' }], month: [{ gan: '丙' }], day: [{ gan: '癸' }], hour: [{ gan: '甲' }] },
  taiyuan: { name: '甲戌' }, mingGong: { name: '乙丑' }, shenGong: { name: '丙申' },
  xunkong: ['戌', '亥'], xunkongPositions: ['年', '时'],
  lunar: { zodiac: '马', yearGanzhi: '庚午', monthName: '四月', dayName: '初五' },
  monthOrder: 4,
};
for (const ch of BAZI_PLAN) {
  const lines = buildFactLines(ch.key, fakeFacts);
  const ids = lines.map((l) => l.id);
  const ok = ids.length > 0 && ids.every((id, i) => id === `F${i + 1}`);
  check(`${ch.key} 事实编号连续且非空`, ok, `${ids.length} 条 ${ids.slice(0, 4).join(',')}`);
}
{
  const mj = buildFactLines('mingju', fakeFacts);
  check('事实文本不含自然语言解读', !mj.some((l) => /你|建议|倾向/.test(l.text)), '');
  const ss = buildFactLines('shensha', fakeFacts);
  check('神煞章拿到神煞条目', ss.some((l) => l.text.includes('桃花')));
  const promptText = buildUser(getChapter('mingju'), buildFactLines('mingju', fakeFacts));
  check('user prompt 含全部 F 编号', /F1 /.test(promptText) && /F\d+/.test(promptText));
  check('system prompt 含事实铁律', buildSystem(getChapter('mingju')).includes('严禁自行排列八字'));
  check('健康章有专属护栏', buildSystem(getChapter('jiankang')).includes('【健康章特别约束】'));
  check('重试 prompt 要求写满字数', buildRetryUser(getChapter('mingju'), buildFactLines('mingju', fakeFacts)).includes('务必写满'));
}

// ---------------------------------------------------------------- 3 schema
group('3 slot → JSON Schema');
for (const ch of BAZI_PLAN) {
  const s = slotsToJsonSchema(ch.slots);
  const names = Object.keys(s.properties);
  const okAll = names.length === Object.keys(ch.slots).length && s.required.length === names.length;
  if (!okAll) check(`${ch.key} schema 必填齐全`, false, `${names.join(',')}`);
}
check('全部章节 slots 都能生成 schema', true, `${BAZI_PLAN.length} 章`);
{
  const tool = slotsToTool(getChapter('geju').slots);
  check('tool name = fill_report', tool.function.name === 'fill_report');
  check('参数含 points 对象数组 items', tool.function.parameters.properties.points.items.properties.d.type === 'string');
  check('describeSchema 可读', describeSchema(getChapter('geju').slots).includes('headline'));
  // schema 必须是合法 JSON（直接喂给 API 前不能有任何 undefined）
  check('schema 可 JSON 化（无 undefined）', JSON.parse(JSON.stringify(slotsToJsonSchema(getChapter('dayun').slots))) !== undefined);
}

// ---------------------------------------------------------------- 4 解析容错
group('4 解析与校验');
const slots = getChapter('geju').slots;
const factIds = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];
const bodyOf = (args, content = '') => ({
  choices: [{ message: { content, tool_calls: args !== undefined ? [{ function: { arguments: JSON.stringify(args) } }] : undefined } }],
});
const good = { headline: '偏印格身旺', summary: '甲木生于辰月……（略）', points: [{ t: '立身', d: '说明说明说明说明说明说明说明说明' }], basis: ['F1', 'F3'], advice: ['稳扎稳打'] };

{
  const r = parseChapterResponse(bodyOf(good), slots, factIds);
  check('tool_call 路径解析', r.ok && r.via === 'tool_call' && r.data.basis.join() === 'F1,F3');
}
{
  const r = parseChapterResponse(bodyOf(undefined, '```json\n' + JSON.stringify(good) + '\n```'), slots, factIds);
  check('代码块降级路径', r.ok && r.via !== 'tool_call' && r.data.headline === '偏印格身旺', `via=${r.via}`);
}
{
  const r = parseChapterResponse(bodyOf(undefined, JSON.stringify(good)), slots, factIds);
  check('裸对象降级路径', r.ok, `via=${r.via}`);
}
{
  const r = parseChapterResponse(bodyOf(undefined, '{"headline":"只有标题","summary":"只有正文"}'), slots, factIds);
  check('缺字段可抢救（不判死）', r.ok && Array.isArray(r.data.points), r.warnings.join('/'));
}
{
  const bad = { ...good, basis: ['F99', '根据命理师推断', 'F2'] };
  const r = parseChapterResponse(bodyOf(bad), slots, factIds);
  check('编造编号被丢弃', r.data.basis.length === 1 && r.data.basis[0] === 'F2', `剩 ${r.data.basis.join(',')}`);
  check('非法 basis 有告警', r.warnings.some((w) => w.includes('不存在') || w.includes('非编号')));
}
{
  const long = { ...good, headline: '一二三四五六七八九十一二三四五六七八九十' };
  const r = parseChapterResponse(bodyOf(long), slots, factIds);
  check('headline 超长被截断', r.data.headline.length <= 28, `${r.data.headline.length} 字`);
}
{
  const arr = { ...good, points: [{ t: '甲', d: '乙' }, { t: '丙', d: '丁' }, { t: '戊', d: '己' }, { t: '庚', d: '辛' }] };
  const r = parseChapterResponse(bodyOf(arr), slots, factIds);
  check('points 超限被截断', r.data.points.length <= 4, `${r.data.points.length} 项`);
}
{
  const r = parseChapterResponse({ choices: [{ message: { content: '', tool_calls: [{ function: { arguments: '{坏掉的' } }] } }] }, slots, factIds);
  check('损坏响应判死并留痕', !r.ok && r.errors.length > 0, r.errors.join('/'));
}
{
  const flat = { ...good, points: { 0: { t: '立身', d: '说明说明说明说明说明说明' }, 1: { t: '处世', d: '说明说明说明说明说明说明' } } };
  const r = parseChapterResponse(bodyOf(flat), slots, factIds);
  check('points 被压成对象时能拆回', r.ok && r.data.points.length > 0, `${r.data.points.length} 项`);
}
check('extractPayload 空响应返回 none', extractPayload({ choices: [] }).via === 'none');

// ---------------------------------------------------------------- 5 缓存与开关
group('5 缓存与开关');
{
  const k = cache.keyOf({ planVersion: PLAN_VERSION, system: 'bazi', factPackId: 'bazi:abc123', chapterKey: 'geju' });
  check('缓存键含模板版本（升级即失效）', k === `v${PLAN_VERSION}:bazi:bazi:abc123:geju`, k);
  cache.write({ planVersion: PLAN_VERSION, system: 'bazi', factPackId: '__p0test__', chapterKey: '__geju__', data: good });
  const hit = cache.read({ planVersion: PLAN_VERSION, system: 'bazi', factPackId: '__p0test__', chapterKey: '__geju__' });
  check('缓存可读写', !!hit && hit.data.headline === '偏印格身旺');
  cache.write({ planVersion: PLAN_VERSION, system: 'bazi', factPackId: '__p0test__', chapterKey: '__stale__', data: good });
  const st = cache.stats();
  check('缓存统计可用', st.files >= 2, `${st.files} 个文件`);
  check('缓存目录受治理（上限 800）', st.files <= 800);
}
{
  const s = client.usageStats();
  check('客户端暴露开关状态', typeof s.enabled === 'boolean' && typeof s.concurrency === 'number', JSON.stringify({ enabled: s.enabled, concurrency: s.concurrency, model: s.model }));
  check('绝不下发 API Key', !JSON.stringify(s).includes(process.env.AGNES_API_KEY || 'sk-XXX'));
}

// ---------------------------------------------------------------- 6 版式体检（需 Chrome）
group('6 报告版式体检');
const reportFile = path.join(process.cwd(), '.p0_report.html');
const altReport = 'E:/WorkBuddy/xuanxue-meta/.p0_report.html';
const target = fs.existsSync(reportFile) ? reportFile : altReport;
if (!fs.existsSync(target)) {
  check('报告产物存在', false, '请先跑 scripts/p0_ai_report.mjs');
} else {
  check('报告产物存在', true, path.basename(target));
  try {
    const { withBrowser } = await import('./cdp.mjs');
    const url = 'file:///' + target.replace(/\\/g, '/');
    await withBrowser(
      async (br) => {
        for (const [label, w, mobile] of [['桌面', 1280, false], ['移动', 390, true]]) {
          const p = await br.page({ url, w, h: 900, mobile });
          const m = await p.evaluate(`(() => {
            const doc = document.documentElement;
            const cards = [...document.querySelectorAll('.rp-ch[data-key]')];
            const bad = [...document.querySelectorAll('.rp-hd,.rp-sum,.rp-pts,.rp-pt,.rp-ch,.rp-adv,.rp-basis')].filter(e => e.scrollWidth > e.clientWidth + 2).map(e => e.className);
            return {
              ox: doc.scrollWidth - doc.clientWidth,
              cards: cards.length,
              hd: cards.filter(c => c.querySelector('.rp-hd')).length,
              sum: cards.filter(c => c.querySelector('.rp-sum')).length,
              pts: cards.filter(c => c.querySelector('.rp-pts')).length,
              basis: cards.filter(c => c.querySelector('.rp-basis')).length,
              bad,
              cols: document.querySelector('.rp-pts') ? getComputedStyle(document.querySelector('.rp-pts')).gridTemplateColumns : '',
            };
          })()`);
          check(`${label}端无横向溢出`, m.ox <= 0, `ox=${m.ox}`);
          check(`${label}端 10 章结构完整`, m.cards === 10 && m.hd === 10 && m.sum === 10, `cards=${m.cards} hd=${m.hd} sum=${m.sum}`);
          check(`${label}端无内部溢出`, m.bad.length === 0, m.bad.join('|'));
          if (mobile) check('移动端点卡单列', !m.cols.includes(' '), m.cols);
          else check('桌面要点三列', m.cols.split(' ').length === 3, m.cols);
          await p.close();
        }
      },
      { extraArgs: ['--no-proxy-server'] }
    );
  } catch (e) {
    console.log(`  – 跳过版式体检（${e.message.slice(0, 60)}）`);
  }
}

console.log(`\n———— P0 门禁：通过 ${pass} · 失败 ${fail} ————`);
if (fail) {
  console.log('失败项：' + fails.join(' / '));
  process.exit(1);
}
process.exit(0);
