/**
 * 报告模板注册表（ReportPlan）
 *
 * 定位：整个「AI 报告」架构的中枢契约。
 *   模板定义章 → 挑字段 → 组 prompt → 校验 → 渲染，四步都从这里读口径。
 *
 * 铁律（改这里之前先读）：
 *   1. 本文件只描述「结构」，不产出自然语言。文案一律由 AI 填 slot，或本地兜底。
 *   2. 版式由 report/templates/* 写死，AI 影响不到本文件的 slot 命名。
 *   3. 事实抽取只能取自 factpack 的 facts（本地确定性计算），严禁 AI 自行推算命理事实。
 *   4. needs 里写的字段名，必须能在 ALL_PRESETS 找到对应抽取器，否则视为配置错误。
 *
 * Phase 2 升级：
 *   全站五大体系（bazi / hepan / liuyao / qimen / ziwei）统一注册到 PLAN_TABLE，
 *   全部走 /api/report/stream 逐章流式卡片（rp-ch）与 F1..Fn 事实编号溯源。
 */

/** 模板协议版本：改动 slot 命名/结构时必须+1，用于让旧缓存自动失效 */
export const PLAN_VERSION = '1.1.0';

/** 本地兜底引擎版本（AI 全挂时用它出文案，便于溯源） */
export const FALLBACK_VERSION = 'local-all-2.0';

// ------------------------------------------------------------------
// 一、八字事实抽取器
// ------------------------------------------------------------------

const NAMES = { year: '年', month: '月', day: '日', hour: '时' };
const elPct = (pct) => Object.entries(pct || {}).map(([k, v]) => `${k}${v}%`).join(' ');

/** 神煞按类别分组取前 N 条，避免整包 108 项全塞进 prompt */
function shenshaLines(f, { limit = 24, keep = () => true } = {}) {
  const list = (f.shensha || []).filter(keep).slice(0, limit);
  if (!list.length) return '本命盘未取到该类别神煞';
  return list
    .map((s) => `- ${s.name}${s.position ? `（${s.position}）` : ''}：${String(s.desc || '').slice(0, 40)}`)
    .join('\n');
}

export const FACT_PRESETS = {
  /** 四柱全貌 */
  fourPillars: (f) => {
    const p = f.fourPillars || {};
    return (
      `四柱：${p.year?.name || ''}年 ${p.month?.name || ''}月 ${p.day?.name || ''}日 ${p.hour?.name || ''}时` +
      `\n十神：年干${p.year?.shishen || ''} 月干${p.month?.shishen || ''} 时干${p.hour?.shishen || ''}` +
      `\n日柱：${p.day?.gan || ''}${p.day?.zhi || ''}（日支${p.day?.zhi || ''}为夫妻宫）` +
      `\n纳音：${p.year?.nayin?.name || p.year?.nayin || ''}／${p.month?.nayin?.name || p.month?.nayin || ''}／${p.day?.nayin?.name || p.day?.nayin || ''}／${p.hour?.nayin?.name || p.hour?.nayin || ''}`
    );
  },

  /** 日主与月令 */
  dayMaster: (f) => {
    const dm = f.dayMaster || {};
    const p = f.fourPillars || {};
    return (
      `日主：${dm.gan || ''}（${dm.element || ''}，${dm.yang ? '阳' : '阴'}干）` +
      `\n月令：${p.month?.zhi || ''}月（${f.monthOrder || ''}）` +
      `\n生肖：${f.lunar?.zodiac || ''}｜农历${f.lunar?.yearGanzhi || ''}年${f.lunar?.monthName || ''}`
    );
  },

  /** 十神分布 */
  shishen: (f) => {
    const s = f.shishen || {};
    const order = ['year', 'month', 'day', 'hour'];
    const items = order.filter((k) => s[k]).map((k) => `${NAMES[k]}干${s[k]}`);
    const cg = f.canggan || {};
    const cgText = order
      .filter((k) => cg[k]?.length)
      .map((k) => `${NAMES[k]}支藏${cg[k].map((c) => (c.gan ? c.gan : c)).join('、')}`)
      .join('；');
    return `十神分布：${items.join(' ')}${cgText ? `\n藏干：${cgText}` : ''}`;
  },

  /** 旺衰 */
  strength: (f) => {
    const st = f.strength || {};
    return `日主强弱：${st.level || '—'}（${st.score ?? '—'} 分）\n判定依据：${(st.basis || []).join('；')}`;
  },

  /** 格局 */
  pattern: (f) => {
    const pt = f.pattern || {};
    return `格局：${pt.name || '—'}（取格依据：${pt.basis || '—'}，月令本气十神：${pt.shishen || '—'}）`;
  },

  /** 喜忌用神 */
  yongshen: (f) => {
    const y = f.yongshen || {};
    return (
      `喜用神：${(y.favorable || []).join('、') || '—'}` +
      `\n忌神：${(y.unfavorable || []).join('、') || '—'}` +
      `\n取用依据：${y.basis || '—'}\n补充说明：${y.note || '—'}`
    );
  },

  /** 五行占比 */
  elementPercent: (f) => `五行占比：${elPct(f.elementPercent)}`,

  /** 十二长生 */
  changsheng: (f) => {
    const cs = f.changsheng || {};
    const parts = ['year', 'month', 'day', 'hour']
      .filter((k) => cs[k]?.state)
      .map((k) => `${NAMES[k]}支${cs[k].state}`);
    const zz = f.zizuo?.state;
    return parts.length ? `十二长生：${parts.join('、')}${zz ? `（日主自坐${zz}）` : ''}` : '十二长生：本命盘未取到';
  },

  /** 干支互动（刑冲合害） */
  relations: (f) => {
    const all = (f.relations?.all || []).slice(0, 8);
    if (!all.length) return '干支互动：本命局未见显著合冲刑会害';
    return `干支互动：${all.map((r) => `${r.name}（${(r.labels || []).join('·')}）`).join('；')}`;
  },

  /** 神煞（默认取前 24 条） */
  shensha: (f) => shenshaLines(f),

  /** 神煞·桃花类 */
  shenshaTaohua: (f) => shenshaLines(f, { limit: 16, keep: (s) => /桃花|红艳|咸池|天喜|红鸾|孤辰|寡宿|华盖|沐浴/.test(s.name || s.cat || '') }),

  /** 神煞·性格类 */
  shenshaXingge: (f) => shenshaLines(f, { limit: 16, keep: (s) => /华盖|将星|魁罡|金舆|驿马|羊刃|劫煞|亡神|禄神|天德|月德|德秀|灵枢|福星/.test(s.name || s.cat || '') }),

  /** 大运 */
  dayun: (f) => {
    const d = f.dayun || {};
    const steps = (d.steps || []).slice(0, 8);
    return (
      `大运起法：${d.basis || '—'}｜${d.forward ? '顺' : '逆'}行｜起运约 ${d.startAge} 岁（约 ${d.startYear} 年）` +
      (steps.length
        ? `\n大运次序：${steps.map((s) => `${s.startAge}岁 ${s.name}（${s.shishen}）`).join('；')}`
        : '')
    );
  },

  /** 流年 */
  liunian: (f) => {
    const ln = f.liunian || [];
    if (!ln.length) return '流年：本命盘未取到';
    return `流年：${ln.map((y) => `${y.year}年${y.ganzhi}（${y.shishen}）`).join('；')}`;
  },

  /** 称骨 */
  chengGu: (f) => {
    const cg = f.chengGu;
    if (!cg) return '称骨：本命盘未取到';
    return (
      `称骨：骨重合计 ${cg.totalQian} 钱（${cg.totalText || ''}）` +
      `\n分项：${(cg.parts || []).map((p) => `${p.label}${p.text}`).join('、')}` +
      `\n歌诀：${cg.verse || ''}`
    );
  },

  /** 三垣（胎元/命宫/身宫） */
  sanYuan: (f) =>
    `胎元${f.taiyuan?.name || '—'}｜命宫${f.mingGong?.name || '—'}｜身宫${f.shenGong?.name || '—'}` +
    `\n旬空：${(f.xunkong || []).join('、') || '—'}${f.xunkongPositions?.length ? `（落${f.xunkongPositions.join('、')}）` : ''}`,
};

// ------------------------------------------------------------------
// 一之二、合盘事实抽取器
// ------------------------------------------------------------------

const hpList = (arr, limit = 20, map = (x) => (typeof x === 'string' ? x : x.name)) =>
  (arr || []).slice(0, limit).map(map).filter(Boolean).join('；');

const hpPartyLine = (p) =>
  `${p.name}：${(p.pills || []).map((x) => x.name).join(' ')}　日柱 ${p.dayGanzhi}（日主${p.dayMasterElement}）　` +
  `${p.strengthLevel || ''}　生肖${p.zodiac || ''}　纳音${(p.pills || [])[2]?.nayin || ''}`;

const hpDimsLine = (f) =>
  `合参维度：${(f.dims || [])
    .map((d) => `${d.label} ${d.score > 0 ? '+' : ''}${d.score}/${d.weight}`)
    .join('；')}`;

export const FACT_PRESETS_HEPAN = {
  hepanBasics: (f) =>
    `两名命主：${(f.parties || []).map(hpPartyLine).join('\n')}` +
    `\n契合指数：${f.score}（${f.grade}）　${f.gradeDesc || ''}` +
    `\n${hpDimsLine(f)}` +
    `\n合 ${(f.he || []).length} 项：${hpList(f.he)}　冲刑害破 ${(f.conflicts || []).length} 项：${hpList(f.conflicts)}`,

  hepanCombine: (f) => {
    const he = f.he || [];
    const bad = f.conflicts || [];
    const line = (r) => {
      const who = r.keyText || `${r.from?.sideLabel || ''}${r.from?.pos || ''} ↔ ${r.to?.sideLabel || ''}${r.to?.pos || ''}`;
      return `${r.name}（${who}）${r.note ? '，' + r.note : ''}${r.source ? '［' + r.source + '］' : ''}`;
    };
    return (
      `相合相引：${he.length ? he.map(line).join('\n') : '未见相合之处'}` +
      `\n需要注意：${bad.length ? bad.map(line).join('\n') : '未见冲刑害破'}`
    );
  },

  hepanDay: (f) => {
    const d = f.day || {};
    return (
      `甲方日柱：${f.parties?.[0]?.dayGanzhi || '—'}　乙方日柱：${f.parties?.[1]?.dayGanzhi || '—'}` +
      `\n日柱关系：${hpList(d.items, 8)}` +
      `\n维度分：${d.score}/${d.weight || 30}　权重最高，为合参核心`
    );
  },

  hepanWuxing: (f) => {
    const lines = (f.wuxing?.lines || [])
      .map((l) => `${l.element}：甲${l.aPercent}%／乙${l.bPercent}%${l.aNeed ? '（甲方喜用）' : ''}${l.bNeed ? '（乙方喜用）' : ''}　${l.kind}`)
      .join('；');
    return `五行占比对照：${lines}\n互补项：${hpList(f.complement, 8, (x) => `${x.element}（${x.kind}）`)}`;
  },

  hepanConflict: (f) => {
    const bad = f.conflicts || [];
    if (!bad.length) return '柱位互动：双方未见明显冲刑害破，相处摩擦多来自日常而非盘面';
    return `需要注意：${bad.map((r) => `${r.name}（${(r.keys || []).join('·')}）${r.note ? '，' + r.note : ''}`).join('\n')}`;
  },

  hepanAdvice: (f) =>
    `${hpPartyLine(f.parties?.[0] || {})} ｜ ${hpPartyLine(f.parties?.[1] || {})}` +
    `\n契合指数 ${f.score}（${f.grade}）\n相合 ${(f.he || []).length} 项：${hpList(f.he)}` +
    `\n冲刑害破 ${(f.conflicts || []).length} 项：${hpList(f.conflicts)}` +
    `\n${hpDimsLine(f)}`,
};

// ------------------------------------------------------------------
// 一之三、六爻事实抽取器（Phase 2 新增）
// ------------------------------------------------------------------

const lyLineTag = (l) =>
  `${l.position}：${l.gan || ''}${l.zhi || ''}（${l.zhiElement || ''}·${l.liuqin || ''}·${l.liushen || ''}·${l.wangshuai || ''}` +
  `${l.isShi ? '·世' : ''}${l.isYing ? '·应' : ''}${l.isDong ? '·动' : ''}${l.xunkong ? '·空亡' : ''}${l.yuePo ? '·月破' : ''}` +
  `${l.fuShow ? `·伏${l.fuLiuqin}${l.fuZhi}` : ''}）`;

export const FACT_PRESETS_LIUYAO = {
  liuyaoGua: (f) =>
    `本卦：${f.benGua?.name || '—'}（${f.benGua?.upper || ''}上${f.benGua?.lower || ''}下，${f.benGua?.gong || ''}宫${f.benGua?.gongElement || ''}，${f.benGua?.generation || ''}卦）` +
    `\n变卦：${f.bianGua?.name || '—'}（${f.bianGua?.upper || ''}上${f.bianGua?.lower || ''}下）` +
    `\n四柱与空亡：月建${f.yueJian?.zhi || ''}（${f.yueJian?.element || ''}）｜日辰${f.riJian?.ganzhi || ''}｜旬空${(f.xunkong || []).join('、') || '—'}` +
    `\n卦身：${f.guaShen?.zhi || '—'}（${f.guaShen?.source || ''}）`,

  liuyaoYongshen: (f) => {
    const ysLines = f.yongshenLines || [];
    const fuMissing = (f.lines || []).filter((l) => l.fuShow);
    return (
      `所问事项：${f.question || '通用占问'}（分类：${f.category || 'general'}）` +
      `\n取用神：${f.yongshen || '官鬼'}（${f.yongshenNote || ''}）` +
      `\n用神爻位：${ysLines.length ? ysLines.map(lyLineTag).join('；') : '本卦未现，取伏神参看'}` +
      (fuMissing.length ? `\n伏神提示：${fuMissing.map((l) => `${l.fuLiuqin}${l.fuGan}${l.fuZhi}伏于${l.position}${l.zhi}之下`).join('；')}` : '')
    );
  },

  liuyaoShiYing: (f) => {
    const lines = f.lines || [];
    const shi = f.shiLine || lines[f.shiYing?.shi];
    const ying = lines[f.shiYing?.ying];
    return (
      `世爻：${shi ? lyLineTag(shi) : f.shiYing?.shiPosition || '—'}` +
      `\n应爻：${ying ? lyLineTag(ying) : f.shiYing?.yingPosition || '—'}` +
      `\n六爻全列：${lines.map(lyLineTag).join('；')}`
    );
  },

  liuyaoDongBian: (f) => {
    const lines = f.lines || [];
    const bian = f.bianLines || [];
    const dong = lines.filter((l) => l.isDong);
    if (!dong.length) {
      return `动爻：本卦六爻皆静，无动爻发动，以本卦用神旺衰与世应生克定论\n本卦：${f.benGua?.name || '—'}｜变卦：${f.bianGua?.name || '—'}`;
    }
    return (
      `动爻数量：${dong.length} 爻发动（${dong.map((d) => d.position).join('、')}）` +
      `\n动变明细：${dong.map((d) => `${lyLineTag(d)} → 变${bian[d.index]?.zhi || ''}（${bian[d.index]?.zhiElement || ''}·${bian[d.index]?.liuqin || ''}）`).join('；')}`
    );
  },
};

// ------------------------------------------------------------------
// 一之四、奇门事实抽取器（Phase 2 新增）
// ------------------------------------------------------------------

export const FACT_PRESETS_QIMEN = {
  qimenBasics: (f) =>
    `局象：${f.juName || ''}｜${f.yuan || ''}（${f.yuanBasis || ''}）｜盘式：${f.panMethod === 'fei' ? '飞盘' : '转盘'}` +
    `\n节气：${f.solarTerm || ''}｜日柱${f.pillars?.ri?.ganzhi || ''}｜时柱${f.pillars?.shi?.ganzhi || ''}｜旬首${f.xunShou || ''}（${f.xunShouYi || ''}）` +
    `\n值符：${f.zhiFu?.star || ''}落${f.zhiFu?.palaceName || ''}宫｜值使：${f.zhiShi?.door || ''}落${f.zhiShi?.palaceName || ''}宫` +
    `\n空亡：时旬空${(f.kongWang || []).join('、') || '—'}｜马星：${f.maXing?.zhi || ''}落${f.maXing?.palaceName || '—'}宫`,

  qimenGeju: (f) => {
    const pats = f.patterns || [];
    const sihai = (f.palaces || [])
      .filter((p) => !p.isMiddle && (p.jiXing || p.ruMu || p.menPo || p.kongWang))
      .map((p) => {
        const flags = [p.jiXing ? '击刑' : '', p.ruMu ? '入墓' : '', p.menPo ? '门迫' : '', p.kongWang ? '空亡' : ''].filter(Boolean);
        return `${p.name}宫（${p.tianPan || ''}+${p.diPan || ''}·${p.door || ''}）：${flags.join('、')}`;
      });
    return (
      `命中格局：${pats.length ? pats.map((x) => `${x.name}［${x.type}，${x.palaceName || '全局'}］：${x.desc}`).join('；') : '本局未触发特殊大吉大凶格'}` +
      `\n四害分布：${sihai.length ? sihai.join('；') : '九宫未见明显击刑入墓门迫'}`
    );
  },

  qimenDirection: (f) => {
    const fav = f.favorable || {};
    const top3 = (f.ranking || []).slice(0, 3);
    const dayP = (f.palaces || []).find((p) => p.tianPan === f.pillars?.ri?.gan);
    const hourP = (f.palaces || []).find((p) => p.tianPan === f.pillars?.shi?.gan);
    return (
      `所测事由：${f.purpose?.name || '通用'}（${f.purpose?.note || ''}）` +
      `\n最优吉方：${fav.direction || ''}方（${fav.palaceName || ''}宫，${fav.door || ''}·${fav.star || ''}，评分 ${fav.score ?? 0}，依据：${(fav.why || []).join('、')}）` +
      `\n前三方位：${top3.map((r) => `${r.palaceName}宫(${r.direction}·${r.door}·${r.star}·${r.shen}:${r.score}分)`).join('；')}` +
      `\n主客落宫：日干${f.pillars?.ri?.gan || ''}落${dayP?.name || f.zhiFu?.palaceName || '—'}宫｜时干${f.pillars?.shi?.gan || ''}落${hourP?.name || f.zhiFu?.palaceName || '—'}宫`
    );
  },

  qimenPalaces: (f) =>
    `九宫排布：\n` +
    (f.palaces || [])
      .filter((p) => !p.isMiddle)
      .map(
        (p) =>
          `${p.name}宫（${p.direction}）：天盘${p.tianPan}+地盘${p.diPan}｜${p.door}·${p.star}·${p.shen}` +
          `${p.changsheng ? `·长生${p.changsheng}` : ''}${p.isZhiFu ? '·值符' : ''}${p.isZhiShi ? '·值使' : ''}`
      )
      .join('\n'),
};

// ------------------------------------------------------------------
// 一之五、紫微斗数事实抽取器（Phase 2 新增）
// ------------------------------------------------------------------

export const FACT_PRESETS_ZIWEI = {
  ziweiBasics: (f) =>
    `生辰四柱：${f.siZhu?.year || ''} ${f.siZhu?.month || ''} ${f.siZhu?.day || ''} ${f.siZhu?.hour || ''}｜农历${f.lunar?.yearGanzhi || ''}年${f.lunar?.isLeap ? '闰' : ''}${f.lunar?.month || ''}月${f.lunar?.day || ''}日（生肖${f.lunar?.zodiac || ''}）` +
    `\n命宫：${f.mingGong?.zhi || ''}宫（${f.mingGong?.ganzhi || ''}）｜身宫：${f.shenGong?.zhi || ''}宫｜五行局：${f.wuXingJu?.name || ''}（${f.wuXingJu?.number || ''}岁起运）` +
    `\n命主星：${f.mingZhu || '—'}｜身主星：${f.shenZhu || '—'}｜紫微坐${f.ziweiZhi || ''}宫｜天府坐${f.tianfuZhi || ''}宫` +
    `\n生年四化：禄—${f.fourHua?.lu?.star || ''}　权—${f.fourHua?.quan?.star || ''}　科—${f.fourHua?.ke?.star || ''}　忌—${f.fourHua?.ji?.star || ''}`,

  ziweiPalaces: (f) =>
    `十二宫星曜：\n` +
    Object.values(f.palaces || {})
      .map((p) => {
        const mains = (p.stars || []).filter((s) => s.kind === '主星').map((s) => `${s.name}${s.brightness ? `(${s.brightness})` : ''}${s.hua ? `[化${s.hua.label}]` : ''}`);
        const fus = (p.stars || []).filter((s) => s.kind === '辅星').map((s) => `${s.name}${s.hua ? `[化${s.hua.label}]` : ''}`);
        return `${p.name}（${p.ganzhi || p.zhi}）：主星${mains.join('、') || '空宫'}｜辅星${fus.join('、') || '无'}`;
      })
      .join('\n'),

  ziweiSihua: (f) => {
    const fh = f.fourHua || {};
    const flyLines = Object.values(f.palaces || {})
      .slice(0, 6)
      .map((p) => {
        const fl = p.flyHua;
        if (!fl) return '';
        return `${p.name}(${p.gan}干)飞化：禄入${fl.lu?.targetPalace || '—'}(${fl.lu?.star || ''})、忌入${fl.ji?.targetPalace || '—'}(${fl.ji?.star || ''}${fl.ji?.isSelf ? '·自化忌' : `·冲${fl.ji?.chongPalace || ''}`})`;
      })
      .filter(Boolean);
    return (
      `生年四化落宫：化禄${fh.lu?.star || ''}、化权${fh.quan?.star || ''}、化科${fh.ke?.star || ''}、化忌${fh.ji?.star || ''}` +
      (flyLines.length ? `\n重点宫干飞化：${flyLines.join('；')}` : '')
    );
  },

  ziweiDaXian: (f) => {
    const dx = (f.daXian || []).slice(0, 8);
    const cur = dx.find((d) => d.isCurrent) || dx[0];
    return (
      `当前虚岁：${f.xuAge || '—'}岁｜当前大限：${cur ? `${cur.ageStart}-${cur.ageEnd}岁行${cur.zhi}宫（${cur.ganzhi}，本命${cur.palace}）` : '—'}` +
      `\n大限序列：${dx.map((d) => `${d.ageStart}-${d.ageEnd}岁${d.zhi}宫(${d.palace}·禄${d.sihua?.lu || ''}/忌${d.sihua?.ji || ''})`).join('；')}` +
      `\n当前流年：${f.liuNian?.year || ''}年流年命宫在${f.liuNian?.mingGongZhi || ''}宫`
    );
  },
};

/** 全体系抽取器总表（单盘 + 合盘 + 六爻 + 奇门 + 紫微），buildFactLines 只认这张表 */
export const ALL_PRESETS = {
  ...FACT_PRESETS,
  ...FACT_PRESETS_HEPAN,
  ...FACT_PRESETS_LIUYAO,
  ...FACT_PRESETS_QIMEN,
  ...FACT_PRESETS_ZIWEI,
};

/**
 * 抽取某章的事实并编号（F1..Fn）
 * 编号即护栏：AI 的「依据溯源」只允许引用这里出现过的编号。
 * @param {string} chapterKey
 * @param {object} facts  factpack.facts
 * @param {string} [system] 体系（默认 bazi）
 * @returns {Array<{id:string, text:string}>}
 */
export function buildFactLines(chapterKey, facts, system = 'bazi') {
  const ch = getChapter(chapterKey, system);
  if (!ch) return [];
  const out = [];
  let n = 0;
  for (const need of ch.needs || []) {
    const pick = ALL_PRESETS[need];
    if (!pick) continue;
    let text = '';
    try {
      text = pick(facts);
    } catch {
      text = '';
    }
    if (!text) continue;
    for (const line of String(text).split('\n')) {
      const t = line.trim();
      if (!t) continue;
      n += 1;
      out.push({ id: `F${n}`, text: t });
    }
  }
  return out;
}

// ------------------------------------------------------------------
// 二、章节注册表（五大体系）
// ------------------------------------------------------------------

/** 通用槽位片段（各章复用，减少重复定义） */
const SL = {
  headline: (max = 26) => ({ type: 'string', max, desc: '一句话结论，不超过 %d 字，不要换行' }),
  summary: (min = 120, max = 280) => ({ type: 'string', min, max, desc: '核心解读，%d-%d 字，可分 2-3 段，用 \n 分段' }),
  points: (min = 2, max = 4) => ({
    type: 'array',
    min,
    max,
    desc: '%d-%d 个要点，每个要点一个小标题加一段说明',
    item: { t: { type: 'string', max: 8, desc: '小标题，不超过 8 字' }, d: { type: 'string', min: 30, max: 90, desc: '说明，30-90 字' } },
  }),
  basis: (max = 5) => ({
    type: 'array',
    min: 1,
    max,
    desc: '依据溯源：只填事实编号（形如 F1、F3），2-4 个，不要编造编号，不要写标题或文字',
  }),
  advice: (min = 2, max = 3) => ({
    type: 'array',
    min,
    max,
    desc: '%d-%d 条可执行建议，每条不超过 50 字，不得涉及医疗、投资、法律',
    item: { type: 'string', max: 60, desc: '一条建议' },
  }),
};

const A = (o) => o;

const stdSlots = (hMax = 28, sMin = 160, sMax = 320) =>
  A({
    headline: SL.headline(hMax),
    summary: SL.summary(sMin, sMax),
    points: SL.points(3, 4),
    basis: SL.basis(5),
    advice: SL.advice(2, 3),
  });

export const BAZI_PLAN = [
  {
    key: 'mingju',
    title: '命局概览',
    order: 1,
    free: true,
    maxTokens: 1400,
    needs: ['fourPillars', 'dayMaster', 'strength', 'elementPercent', 'sanYuan'],
    slots: stdSlots(26, 160, 300),
  },
  {
    key: 'geju',
    title: '格局喜忌',
    order: 2,
    free: true,
    maxTokens: 1500,
    needs: ['pattern', 'yongshen', 'strength', 'elementPercent', 'changsheng'],
    slots: stdSlots(28, 180, 320),
  },
  {
    key: 'xingge',
    title: '性格特点',
    order: 3,
    free: false,
    maxTokens: 1600,
    needs: ['dayMaster', 'shishen', 'pattern', 'changsheng', 'shenshaXingge'],
    slots: A({
      headline: SL.headline(24),
      summary: SL.summary(180, 320),
      points: (() => { const p = SL.points(3, 3); p.desc = '3 个要点：优势、盲点、与人相处'; return p; })(),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'jiankang',
    title: '健康提醒',
    order: 4,
    free: false,
    maxTokens: 1500,
    needs: ['elementPercent', 'dayMaster', 'yongshen', 'changsheng', 'shensha'],
    slots: A({
      headline: SL.headline(26),
      summary: SL.summary(160, 280),
      points: SL.points(3, 3),
      basis: SL.basis(5),
      advice: (() => { const a = SL.advice(2, 3); a.desc = '2-3 条生活作息建议，绝不出现病症名、药材、诊疗建议；涉具体内容请指向专业机构'; return a; })(),
    }),
    guard: 'health',
  },
  {
    key: 'ganqing',
    title: '感情婚姻',
    order: 5,
    free: false,
    maxTokens: 1600,
    needs: ['fourPillars', 'relations', 'shishen', 'shenshaTaohua', 'sanYuan'],
    slots: A({
      headline: SL.headline(26),
      summary: SL.summary(180, 320),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(3, 4),
    }),
  },
  {
    key: 'shiye',
    title: '事业方向',
    order: 6,
    free: false,
    maxTokens: 1600,
    needs: ['pattern', 'yongshen', 'shishen', 'strength', 'dayun'],
    slots: A({
      headline: SL.headline(26),
      summary: SL.summary(180, 320),
      points: (() => { const p = SL.points(3, 3); p.desc = '3 个要点：适合的方向、精力投放阶段、容易踩的坑'; return p; })(),
      basis: SL.basis(5),
      advice: SL.advice(2, 3),
    }),
  },
  {
    key: 'caiyun',
    title: '财运走势',
    order: 7,
    free: false,
    maxTokens: 1600,
    needs: ['pattern', 'yongshen', 'shishen', 'dayun', 'liunian'],
    slots: A({
      headline: SL.headline(26),
      summary: SL.summary(180, 320),
      points: SL.points(3, 3),
      basis: SL.basis(5),
      advice: (() => { const a = SL.advice(2, 3); a.desc = '2-3 条财务习惯建议，不得出现具体证券、彩票、收益承诺'; return a; })(),
    }),
  },
  {
    key: 'dayun',
    title: '大运流年',
    order: 8,
    free: false,
    maxTokens: 2000,
    needs: ['dayun', 'liunian', 'yongshen', 'shishen'],
    slots: stdSlots(28, 200, 360),
  },
  {
    key: 'shensha',
    title: '神煞详解',
    order: 9,
    free: false,
    maxTokens: 2000,
    needs: ['shensha'],
    slots: stdSlots(24, 180, 320),
  },
  {
    key: 'chenggu',
    title: '称骨批注',
    order: 10,
    free: false,
    maxTokens: 1400,
    needs: ['chengGu'],
    slots: A({
      headline: SL.headline(24),
      summary: SL.summary(160, 300),
      points: SL.points(3, 4),
      basis: SL.basis(4),
      advice: SL.advice(2, 3),
    }),
  },
];

export const HEWAN_PLAN = [
  {
    key: 'hetong',
    title: '合盘总论',
    order: 1,
    free: true,
    maxTokens: 1500,
    needs: ['hepanBasics'],
    slots: stdSlots(28, 180, 320),
  },
  {
    key: 'ganzhi',
    title: '天干地支合参',
    order: 2,
    free: false,
    maxTokens: 1800,
    needs: ['hepanCombine'],
    slots: stdSlots(28, 180, 320),
  },
  {
    key: 'riyu',
    title: '日柱与夫妻宫',
    order: 3,
    free: false,
    maxTokens: 1800,
    needs: ['hepanDay', 'hepanBasics'],
    slots: stdSlots(28, 200, 340),
  },
  {
    key: 'wuxing',
    title: '五行与用神互补',
    order: 4,
    free: false,
    maxTokens: 1600,
    needs: ['hepanWuxing', 'hepanBasics'],
    slots: stdSlots(28, 180, 320),
  },
  {
    key: 'chongke',
    title: '需要注意的冲刑',
    order: 5,
    free: false,
    maxTokens: 1600,
    needs: ['hepanConflict', 'hepanCombine'],
    slots: A({
      headline: SL.headline(28),
      summary: SL.summary(180, 320),
      points: SL.points(3, 4),
      basis: SL.basis(5),
      advice: SL.advice(3, 4),
    }),
  },
  {
    key: 'xiangchu',
    title: '相处建议',
    order: 6,
    free: false,
    maxTokens: 1600,
    needs: ['hepanAdvice', 'hepanBasics'],
    slots: A({
      headline: SL.headline(26),
      summary: SL.summary(160, 300),
      points: SL.points(3, 4),
      basis: SL.basis(5),
    }),
  },
];

/** 六爻五章（顺序：卦象概览 → 用神分析 → 世应关系 → 动爻与变卦 → 趋势与建议） */
export const LIUYAO_PLAN = [
  {
    key: 'overview',
    title: '卦象概览',
    order: 1,
    free: true,
    maxTokens: 1500,
    needs: ['liuyaoGua'],
    slots: stdSlots(28, 160, 300),
  },
  {
    key: 'yongshen',
    title: '用神分析',
    order: 2,
    free: true,
    maxTokens: 1500,
    needs: ['liuyaoYongshen', 'liuyaoGua'],
    slots: stdSlots(28, 160, 300),
  },
  {
    key: 'shiying',
    title: '世应关系',
    order: 3,
    free: false,
    maxTokens: 1600,
    needs: ['liuyaoShiYing', 'liuyaoGua'],
    slots: stdSlots(28, 180, 320),
  },
  {
    key: 'dongyao',
    title: '动爻与变卦',
    order: 4,
    free: false,
    maxTokens: 1600,
    needs: ['liuyaoDongBian', 'liuyaoGua'],
    slots: stdSlots(28, 180, 320),
  },
  {
    key: 'advice',
    title: '趋势与建议',
    order: 5,
    free: false,
    maxTokens: 1600,
    needs: ['liuyaoYongshen', 'liuyaoShiYing', 'liuyaoDongBian'],
    slots: stdSlots(28, 180, 320),
  },
];

/** 奇门五章（顺序：盘式概览 → 四害与吉凶格局 → 用神方位 → 九宫要点 → 行动建议） */
export const QIMEN_PLAN = [
  {
    key: 'overview',
    title: '盘式概览',
    order: 1,
    free: true,
    maxTokens: 1500,
    needs: ['qimenBasics'],
    slots: stdSlots(28, 160, 300),
  },
  {
    key: 'geju',
    title: '四害与吉凶格局',
    order: 2,
    free: true,
    maxTokens: 1600,
    needs: ['qimenGeju', 'qimenBasics'],
    slots: stdSlots(28, 160, 300),
  },
  {
    key: 'direction',
    title: '用神方位',
    order: 3,
    free: false,
    maxTokens: 1600,
    needs: ['qimenDirection', 'qimenBasics'],
    slots: stdSlots(28, 180, 320),
  },
  {
    key: 'palace',
    title: '九宫要点',
    order: 4,
    free: false,
    maxTokens: 1800,
    needs: ['qimenPalaces', 'qimenGeju'],
    slots: stdSlots(28, 180, 340),
  },
  {
    key: 'advice',
    title: '行动建议',
    order: 5,
    free: false,
    maxTokens: 1600,
    needs: ['qimenDirection', 'qimenGeju', 'qimenBasics'],
    slots: stdSlots(28, 180, 320),
  },
];

/** 紫微六章（顺序：命盘概览 → 十二宫星曜 → 命宫与格局 → 生年四化 → 大限走势 → 流年提示） */
export const ZIWEI_PLAN = [
  {
    key: 'overview',
    title: '命盘概览',
    order: 1,
    free: true,
    maxTokens: 1500,
    needs: ['ziweiBasics'],
    slots: stdSlots(28, 160, 300),
  },
  {
    key: 'palaces',
    title: '十二宫星曜',
    order: 2,
    free: true,
    maxTokens: 1600,
    needs: ['ziweiPalaces', 'ziweiBasics'],
    slots: stdSlots(28, 160, 320),
  },
  {
    key: 'pattern',
    title: '命宫与格局',
    order: 3,
    free: false,
    maxTokens: 1600,
    needs: ['ziweiBasics', 'ziweiPalaces'],
    slots: stdSlots(28, 180, 320),
  },
  {
    key: 'fourhua',
    title: '生年四化',
    order: 4,
    free: false,
    maxTokens: 1600,
    needs: ['ziweiSihua', 'ziweiBasics'],
    slots: stdSlots(28, 180, 320),
  },
  {
    key: 'dayun',
    title: '大限走势',
    order: 5,
    free: false,
    maxTokens: 1800,
    needs: ['ziweiDaXian', 'ziweiBasics'],
    slots: stdSlots(28, 180, 340),
  },
  {
    key: 'liunian',
    title: '流年提示',
    order: 6,
    free: false,
    maxTokens: 1600,
    needs: ['ziweiDaXian', 'ziweiSihua'],
    slots: stdSlots(28, 180, 320),
  },
];

// ------------------------------------------------------------------
// 三、查询接口
// ------------------------------------------------------------------

const PLAN_TABLE = {
  bazi: BAZI_PLAN,
  hepan: HEWAN_PLAN,
  liuyao: LIUYAO_PLAN,
  qimen: QIMEN_PLAN,
  ziwei: ZIWEI_PLAN,
};

export const SUPPORTED_SYSTEMS = Object.keys(PLAN_TABLE);

/** 取章节定义 */
export function getChapter(key, system = 'bazi') {
  const table = PLAN_TABLE[system] || [];
  return table.find((c) => c.key === key) || null;
}

/** 取某体系的全部章节（按 order 排好的） */
export function listChapters(system = 'bazi') {
  return [...(PLAN_TABLE[system] || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** 取某体系的免费章节 key 列表 */
export function freeChapterKeys(system = 'bazi') {
  return listChapters(system).filter((c) => c.free).map((c) => c.key);
}

/** 把 %d 占位替换成实际数字（desc 是模板串） */
export function fillDesc(desc, ...args) {
  let i = 0;
  return String(desc).replace(/%d/g, () => String(args[i++] ?? ''));
}

/** 诊断：needs 引用的 preset 必须都存在 */
function checkPlan(plan, system, errs) {
  for (const ch of plan) {
    if (!ch.key) errs.push(`${system} 章节缺 key`);
    if (!ch.title) errs.push(`${system}:${ch.key} 缺 title`);
    if (typeof ch.order !== 'number') errs.push(`${system}:${ch.key} 缺 order`);
    if (!Array.isArray(ch.needs) || !ch.needs.length) errs.push(`${system}:${ch.key} needs 为空`);
    for (const need of ch.needs || []) {
      if (!ALL_PRESETS[need]) errs.push(`${system}:${ch.key} needs 引用了不存在的抽取器: ${need}`);
    }
    if (!ch.slots || !Object.keys(ch.slots).length) errs.push(`${system}:${ch.key} 缺 slots`);
    for (const [sk, def] of Object.entries(ch.slots || {})) {
      if (def.type !== 'array' || !def.item) continue;
      const it = def.item;
      if (typeof it === 'object' && !Array.isArray(it)) {
        if (Object.keys(it).length === 0) errs.push(`${system}:${ch.key}.${sk} item 是空对象`);
      } else if (it !== 'string' && !(it && it.type)) {
        errs.push(`${system}:${ch.key}.${sk} item 形态不合法（应为 'string' 或 {t,d} 对象）`);
      }
    }
  }
  const keys = plan.map((c) => c.key);
  if (new Set(keys).size !== keys.length) errs.push(`${system} 存在重复章节 key`);
  const orders = plan.map((c) => c.order).sort((x, y) => x - y);
  orders.forEach((o, i) => {
    if (o !== i + 1) errs.push(`${system} order 不连续：${orders.join(',')}`);
  });
}

export function planSelfCheck() {
  const errs = [];
  checkPlan(BAZI_PLAN, 'bazi', errs);
  checkPlan(HEWAN_PLAN, 'hepan', errs);
  checkPlan(LIUYAO_PLAN, 'liuyao', errs);
  checkPlan(QIMEN_PLAN, 'qimen', errs);
  checkPlan(ZIWEI_PLAN, 'ziwei', errs);
  const free = BAZI_PLAN.filter((c) => c.free).map((c) => c.key);
  if (free.length !== 2) errs.push(`八字免费章数量应为 2，当前 ${free.length}: ${free.join(',')}`);
  const freeHp = HEWAN_PLAN.filter((c) => c.free).map((c) => c.key);
  if (freeHp.length !== 1) errs.push(`合盘免费章数量应为 1，当前 ${freeHp.length}: ${freeHp.join(',')}`);
  return errs;
}
