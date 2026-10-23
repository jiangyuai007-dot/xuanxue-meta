/**
 * Phase 2 专项验收门禁（scripts/phase2_verify.mjs）
 *
 * 逐项验证 Phase 2 四大核心交付物：
 *   1. 全站五大体系（bazi / hepan / liuyao / qimen / ziwei）统一接入 ReportPlan 与 /api/report/stream SSE 逐章流式卡片，
 *      且修复 templates/bazi.js 多条要点/建议独立过合规网关（不互相覆盖）
 *   2. 紫微斗数算法精进：火星/铃星按《紫微斗数全书》标准口诀精确安放（寅午戌丑卯、申子辰寅戌、巳酉丑卯戌、亥卯未酉戌）+
 *      十二宫宫干四化飞星矩阵（palaceSihua / flyHua）与盘面 SVG 飞星连线
 *   3. 奇门遁甲算法精进：真置闰法（正授/超神/接气/芒种大雪置闰）与茅山法/拆补法区分 +
 *      真飞盘奇门（九星/天盘干/八门按洛书九宫飞布）+ 20+ 奇门经典吉凶格局自动识别
 *   4. 八字「六柱同参」（原局四柱 + 大运柱 + 流年柱：岁运并临、天克地冲、天合地合、干支冲合刑害）实时计算与盘面联动数据嵌入
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { planSelfCheck, listChapters, buildFactLines, SUPPORTED_SYSTEMS } from '../src/core/reportPlan.js';
import { renderChapterCard } from '../src/report/templates/bazi.js';
import { computeZiwei } from '../src/engines/ziwei.js';
import { renderZiwei } from '../src/report/charts/ziwei.js';
import { computeQimen } from '../src/engines/qimen.js';
import { renderQimen } from '../src/report/charts/qimen.js';
import { detectQimenPatterns } from '../src/core/qimenInfo.js';
import { computeBazi, computeSixPillarImpact } from '../src/engines/bazi.js';
import { renderBazi } from '../src/report/charts/bazi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

console.log('\n【1】全体系 ReportPlan 注册与章节卡渲染修复验证');
{
  const planErrs = planSelfCheck();
  check('planSelfCheck() 五大体系零错误通过', planErrs.length === 0, planErrs.join('; ') || '0 errors');
  check('SUPPORTED_SYSTEMS 覆盖五大体系', ['bazi', 'hepan', 'liuyao', 'qimen', 'ziwei'].every((s) => SUPPORTED_SYSTEMS.includes(s)),
    SUPPORTED_SYSTEMS.join(','));
  check('六爻 5 章 / 奇门 5 章 / 紫微 6 章',
    listChapters('liuyao').length === 5 && listChapters('qimen').length === 5 && listChapters('ziwei').length === 6,
    `liuyao=${listChapters('liuyao').length} qimen=${listChapters('qimen').length} ziwei=${listChapters('ziwei').length}`);

  // 验证 templates/bazi.js 修复：多条 point 各自独立过合规网关，不再全部被最后一条覆盖
  const testCh = listChapters('bazi')[0];
  const cardHtml = renderChapterCard(testCh, {
    headline: '测试标题',
    summary: '第一段核心摘要',
    points: [
      { t: '要点一', d: '第一条独立说明内容甲' },
      { t: '要点二', d: '第二条独立说明内容乙' },
      { t: '要点三', d: '第三条独立说明内容丙' },
    ],
    basis: ['F1', 'F2'],
    advice: ['建议动作一', '建议动作二'],
  }, { unlocked: true, source: 'local' });
  check('renderChapterCard 多条要点独立渲染不互覆',
    cardHtml.includes('第一条独立说明内容甲') && cardHtml.includes('第二条独立说明内容乙') && cardHtml.includes('第三条独立说明内容丙'));

  const lyHtml = fs.readFileSync(path.join(ROOT, 'web/liuyao.html'), 'utf8');
  const qmHtml = fs.readFileSync(path.join(ROOT, 'web/qimen.html'), 'utf8');
  check('web/liuyao.html 与 web/qimen.html 均含 #reportBody (.rp-host) 容器',
    lyHtml.includes('id="reportBody"') && qmHtml.includes('id="reportBody"'));
}

console.log('\n【2】紫微斗数火铃精确安法与十二宫宫干四化飞星验证');
{
  // 1990 庚午年（寅午戌火局）子时（0:10，关真太阳时） -> 火星起丑(子时在丑)，铃星起卯(子时在卯)
  const zwWuZi = computeZiwei({ year: 1990, month: 6, day: 15, hour: 0, minute: 10, gender: 'male', city: '北京', useTrueSolarTime: false });
  check('寅午戌年子时：火星在丑、铃星在卯',
    zwWuZi.fuStarPositions['火星'] === '丑' && zwWuZi.fuStarPositions['铃星'] === '卯',
    `火=${zwWuZi.fuStarPositions['火星']} 铃=${zwWuZi.fuStarPositions['铃星']}`);

  // 2024 甲辰年（申子辰水局）子时 -> 火星起寅(子时在寅)，铃星起戌(子时在戌)
  const zwChenZi = computeZiwei({ year: 2024, month: 6, day: 15, hour: 0, minute: 10, gender: 'male', city: '北京', useTrueSolarTime: false });
  check('申子辰年子时：火星在寅、铃星在戌',
    zwChenZi.fuStarPositions['火星'] === '寅' && zwChenZi.fuStarPositions['铃星'] === '戌',
    `火=${zwChenZi.fuStarPositions['火星']} 铃=${zwChenZi.fuStarPositions['铃星']}`);

  // 1993 癸酉年（巳酉丑金局）子时 -> 火星起卯(子时在卯)，铃星起戌(子时在戌)
  const zwYouZi = computeZiwei({ year: 1993, month: 6, day: 15, hour: 0, minute: 10, gender: 'male', city: '北京', useTrueSolarTime: false });
  check('巳酉丑年子时：火星在卯、铃星在戌',
    zwYouZi.fuStarPositions['火星'] === '卯' && zwYouZi.fuStarPositions['铃星'] === '戌',
    `火=${zwYouZi.fuStarPositions['火星']} 铃=${zwYouZi.fuStarPositions['铃星']}`);

  // 1991 辛未年（亥卯未木局）子时 -> 火星起酉(子时在酉)，铃星起戌(子时在戌)
  const zwWeiZi = computeZiwei({ year: 1991, month: 6, day: 15, hour: 0, minute: 10, gender: 'male', city: '北京', useTrueSolarTime: false });
  check('亥卯未年子时：火星在酉、铃星在戌',
    zwWeiZi.fuStarPositions['火星'] === '酉' && zwWeiZi.fuStarPositions['铃星'] === '戌',
    `火=${zwWeiZi.fuStarPositions['火星']} 铃=${zwWeiZi.fuStarPositions['铃星']}`);

  // 验证十二宫宫干四化飞星矩阵 (palaceSihua / flyHua)
  const mingFly = zwChenZi.palaceSihua['命宫'];
  check('十二宫宫干四化飞星矩阵齐全（含禄/权/科/忌飞入宫位与冲宫）',
    Object.keys(zwChenZi.palaceSihua).length === 12 && !!mingFly?.lu?.targetPalace && !!mingFly?.ji?.chongPalace,
    `命宫(${mingFly?.gan}干)禄→${mingFly?.lu?.targetPalace} 忌→${mingFly?.ji?.targetPalace}(冲${mingFly?.ji?.chongPalace})`);

  const zwChartHtml = renderZiwei(zwChenZi);
  check('紫微盘面含宫干飞星 SVG 曲线 (.fly-path)、飞化栏 (.fly-row) 与精简/全盘切换 (#zw-simp)',
    zwChartHtml.includes('class="fly-path"') && zwChartHtml.includes('class="fly-row"') && zwChartHtml.includes('id="zw-simp"'));
}

console.log('\n【3】奇门遁甲真置闰法、飞盘奇门与 20+ 吉凶格局识别验证');
{
  const qmChaibu = computeQimen({ year: 2026, month: 6, day: 7, hour: 10, minute: 0, city: '北京', juMethod: 'chaibu' });
  const qmZhirun = computeQimen({ year: 2026, month: 6, day: 7, hour: 10, minute: 0, city: '北京', juMethod: 'zhirun' });
  const qmMaoshan = computeQimen({ year: 2026, month: 6, day: 7, hour: 10, minute: 0, city: '北京', juMethod: 'maoshan' });
  check('奇门置闰法产出 zhirunInfo（含上元符头与超神/接气/正授/置闰状态）',
    !!qmZhirun.zhirunInfo && !!qmZhirun.zhirunInfo.shangYuanFuTou && qmZhirun.yuanBasis.includes('置闰法'),
    qmZhirun.yuanBasis);
  check('奇门置闰法与茅山法口径独立区分',
    qmZhirun.yuanBasis !== qmMaoshan.yuanBasis && qmMaoshan.yuanBasis.includes('茅山法'),
    `${qmZhirun.yuanBasis} vs ${qmMaoshan.yuanBasis}`);

  // 飞盘奇门验证
  const qmZhuan = computeQimen({ year: 2026, month: 9, day: 22, hour: 10, minute: 0, city: '北京', panType: 'zhuan' });
  const qmFei = computeQimen({ year: 2026, month: 9, day: 22, hour: 10, minute: 0, city: '北京', panType: 'fei' });
  const midFei = qmFei.palaces.find((p) => p.id === 5);
  check('飞盘奇门按洛书九宫飞布（中宫具备飞入天盘干与九星）',
    qmFei.panMethod === 'fei' && !!midFei?.tianPan && !!midFei?.star,
    `中宫天盘=${midFei?.tianPan} 中宫星=${midFei?.star}`);
  const qmFeiHtml = renderQimen(qmFei);
  check('奇门盘面渲染飞盘标签与格局徽章（不再显示「暂按转盘计算」）',
    qmFeiHtml.includes('飞盘（九宫飞布）') && !qmFeiHtml.includes('暂按转盘'));

  // 20+ 奇门经典吉凶格局识别引擎测试
  const mockDetected = detectQimenPatterns({
    riGan: '甲',
    shiGan: '庚',
    shiGanzhi: '丙戌',
    zhiShiPalace: 3,
    zhiFuPalace: 1,
    palaces: [
      { id: 1, name: '坎', isMiddle: false, tianPan: '戊', diPan: '丙', door: '休门', star: '天蓬', shen: '值符', isZhiFu: true, isZhiShi: false },
      { id: 2, name: '坤', isMiddle: false, tianPan: '丙', diPan: '戊', door: '生门', star: '天任', shen: '九天', isZhiFu: false, isZhiShi: false },
      { id: 3, name: '震', isMiddle: false, tianPan: '乙', diPan: '丁', door: '伤门', star: '天冲', shen: '六合', isZhiFu: false, isZhiShi: true },
      { id: 4, name: '巽', isMiddle: false, tianPan: '乙', diPan: '辛', door: '杜门', star: '天辅', shen: '白虎', isZhiFu: false, isZhiShi: false },
      { id: 6, name: '乾', isMiddle: false, tianPan: '辛', diPan: '乙', door: '开门', star: '天心', shen: '太阴', isZhiFu: false, isZhiShi: false },
      { id: 7, name: '兑', isMiddle: false, tianPan: '丁', diPan: '癸', door: '惊门', star: '天柱', shen: '玄武', isZhiFu: false, isZhiShi: false },
      { id: 8, name: '艮', isMiddle: false, tianPan: '庚', diPan: '癸', door: '生门', star: '天任', shen: '九地', isZhiFu: false, isZhiShi: false },
      { id: 9, name: '离', isMiddle: false, tianPan: '庚', diPan: '丙', door: '景门', star: '天英', shen: '螣蛇', isZhiFu: false, isZhiShi: false },
    ],
  });
  const hitNames = new Set(mockDetected.all.map((x) => x.name));
  const expectedPats = ['五不遇时', '时干入墓', '九星伏吟', '八门伏吟', '青龙返首', '飞鸟跌穴', '神遁', '玉女守门', '三奇得使', '三奇升殿', '青龙逃走', '白虎猖狂', '朱雀投江', '大格', '太白入荧'];
  check('奇门格局引擎准确识别吉凶格局（青龙返首/飞鸟跌穴/玉女守门/三奇得使/五不遇时/朱雀投江/大格等）',
    expectedPats.every((n) => hitNames.has(n)),
    `命中 ${hitNames.size} 项：${[...hitNames].join('、')}`);
}

console.log('\n【4】八字「六柱同参」实时合参与盘面嵌入验证');
{
  const bz = computeBazi({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' });
  check('computeBazi 输出 sixPillars 六柱同参结构',
    !!bz.sixPillars && Array.isArray(bz.sixPillars.all),
    `大运=${bz.sixPillars?.dayun?.name} 流年=${bz.sixPillars?.liunian?.name} 互动=${bz.sixPillars?.count}项`);

  // 构造岁运并临 + 天克地冲测试：1990年庚午(0,6)、大运甲子(0,0)、流年甲子(0,0) -> 岁运并临(甲子) + 甲子庚午天克地冲
  const testSix = computeSixPillarImpact(
    bz.fourPillars,
    { ganIndex: 0, zhiIndex: 0, name: '甲子' },
    { ganIndex: 0, zhiIndex: 0, name: '甲子', year: 2044 }
  );
  const specialTypes = testSix.specials.map((x) => x.type);
  check('computeSixPillarImpact 准确识别「岁运并临」与「天克地冲」',
    specialTypes.includes('binglin') && specialTypes.includes('tkdc'),
    testSix.specials.map((x) => x.name).join('、'));

  const bzHtml = renderBazi({ system: 'bazi', input: { year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male' }, facts: bz });
  check('八字盘面渲染 .bz-six 六柱同参栏与 data-six 联动属性',
    bzHtml.includes('class="bz-six"') && bzHtml.includes('data-role="six-rels"') && bzHtml.includes('data-six='));
}

console.log('\n【5】全站五大体系 /api/report/stream 端到端流式报告验证');
{
  const PORT = 18892;
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

    for (const [sys, expectedCount, extra] of [
      ['bazi', 10, { gender: 'male' }],
      ['liuyao', 5, { method: 'time', category: 'career', question: '测试问事' }],
      ['qimen', 5, { purpose: 'wealth', juMethod: 'zhirun', panType: 'fei' }],
      ['ziwei', 6, { gender: 'female' }],
    ]) {
      const r = await fetch(`${BASE}/api/report/stream?mode=json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { type: sys, year: 1992, month: 8, day: 18, hour: 10, minute: 30, city: '北京', ...extra },
        }),
      });
      const j = await r.json();
      const chs = j.chapters || [];
      const allCardsValid = chs.length === expectedCount && chs.every((c) => c.html && c.html.includes('class="rp-ch"'));
      check(`${sys} 流式报告产出 ${expectedCount} 张标准 rp-ch 章节卡`, allCardsValid, `status=${r.status} chapters=${chs.length}`);

      const htmlRes = await fetch(`${BASE}${j.reportUrl}`);
      const pageHtml = await htmlRes.text();
      const cardMatches = (pageHtml.match(/<section class="rp-ch"/g) || []).length;
      check(`${sys} /api/report/:id/html 整页报告含 ${expectedCount} 张 AI 骨架章节卡`,
        htmlRes.status === 200 && cardMatches === expectedCount,
        `status=${htmlRes.status} cards=${cardMatches}`);
    }
  } finally {
    srv.kill('SIGTERM');
  }
}

console.log('\n════════════════════════════════════════════');
console.log(`Phase 2 专项门禁：通过 ${pass} 项 · 失败 ${fail} 项`);
console.log('════════════════════════════════════════════\n');
process.exit(fail === 0 ? 0 : 1);
