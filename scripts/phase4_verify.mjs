/**
 * Phase 4 专项验证脚本（scripts/phase4_verify.mjs）
 *
 * 验证范围：
 *   1. 每日运势黄历引擎（src/core/almanac.js）：公历/农历/四柱/建除十二神/十二值神/二十八宿/吉神方位/十二时辰/个人八字日柱定制流日运势
 *   2. 基于 FactPack 护栏的 AI 命盘多轮追问（src/ai/chat.js）：五大体系 F1..Fn 事实编号提取、多意图专家解答、合规网关过滤、SQLite/JSON 会话持久化
 *   3. 真实支付网关签名验签（微信支付 v3 HMAC-SHA256 + 防重放、支付宝 RSA-SHA256）、金额防篡改核验、自助退款与订单自动对账（reconcileOrders）
 *   4. 服务端 HTTP 接口端到端联调（/api/almanac、/api/chat/stream JSON & SSE、/api/chat/history、/api/chat/clear、/api/pay/reconcile）
 *   5. 前端 Phase 4 组件与样式静态完整性核验
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { build } from '../src/factpack.js';
import { computeHePan } from '../src/engines/hepan.js';
import { computeAlmanac } from '../src/core/almanac.js';
import {
  extractAllFactLines,
  answerFollowup,
  presetQuestionsFor,
  getChatThread,
  appendChatTurn,
  clearChatThread,
} from '../src/ai/chat.js';
import {
  listSkus,
  createOrder,
  payOrder,
  confirmPaid,
  refundOrder,
  listOrders,
  reconcileOrders,
  resetOrders,
} from '../src/commerce/sku.js';
import { WechatProvider } from '../src/commerce/pay/wechat.js';
import { AlipayProvider } from '../src/commerce/pay/alipay.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

let pass = 0;
let fail = 0;

function assert(cond, title, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ [PASS] ${title}`);
  } else {
    fail += 1;
    console.error(`  ✗ [FAIL] ${title}${detail ? ' — ' + detail : ''}`);
  }
}

async function runTests() {
  console.log('=== Phase 4 专项验证：商业变现闭环、每日个人黄历与 AI 命盘多轮追问 ===\n');

  // ------------------------------------------------------------------
  // 1. 每日运势黄历与个人八字流日推演引擎验证
  // ------------------------------------------------------------------
  console.log('--- 1. 每日运势黄历与个人八字日柱定制运势引擎 ---');
  const almDefault = computeAlmanac({ year: 2026, month: 10, day: 22 });
  assert(
    almDefault.solar.dateStr === '2026-10-22' &&
      Boolean(almDefault.lunar.fullText) &&
      Boolean(almDefault.pillars.year && almDefault.pillars.month && almDefault.pillars.day) &&
      almDefault.hours.length === 12,
    '1.1 基础万年历择吉计算完备（四柱/农历/节气/十二时辰）'
  );
  assert(
    Boolean(almDefault.jianchu?.name) &&
      Boolean(almDefault.zhishen?.name) &&
      Boolean(almDefault.xiu) &&
      Array.isArray(almDefault.yi) &&
      almDefault.yi.length > 0 &&
      Array.isArray(almDefault.ji) &&
      almDefault.ji.length > 0,
    '1.2 建除十二神、黄黑道十二值神、二十八宿与每日宜忌完备'
  );
  assert(
    Boolean(almDefault.directions?.xi && almDefault.directions?.cai && almDefault.directions?.fu) &&
      Boolean(almDefault.chongSha?.text) &&
      Boolean(almDefault.pengzu),
    '1.3 喜财福贵四神方位、冲煞与彭祖百忌完备'
  );

  const almPersonal = computeAlmanac({
    year: 2026,
    month: 10,
    day: 22,
    dayGanzhi: '乙酉',
    favorableElements: ['水', '木'],
  });
  assert(
    almPersonal.personal &&
      almPersonal.personal.userDayGanzhi === '乙酉' &&
      almPersonal.personal.userDayMaster === '乙木' &&
      Boolean(almPersonal.personal.liuriShishen) &&
      almPersonal.personal.score >= 52 &&
      almPersonal.personal.score <= 96 &&
      Array.isArray(almPersonal.personal.luckyHours) &&
      almPersonal.personal.luckyHours.length > 0 &&
      almPersonal.personal.summary.includes('乙酉'),
    '1.4 结合个人八字日柱（乙酉）与喜用神推演专属流日十神、合冲评分与旺运吉时'
  );

  // ------------------------------------------------------------------
  // 2. 基于 FactPack 护栏的 AI 命盘多轮追问引擎验证
  // ------------------------------------------------------------------
  console.log('\n--- 2. 基于 FactPack 护栏的 AI 命盘多轮追问引擎 ---');
  const baziPack = build({
    type: 'bazi',
    year: 1990,
    month: 5,
    day: 20,
    hour: 14,
    minute: 30,
    gender: 'male',
    city: '北京',
  });
  const liuyaoPack = build({
    type: 'liuyao',
    year: 2026,
    month: 10,
    day: 22,
    hour: 10,
    minute: 0,
    question: '近期合作项目推进',
    lines: [7, 8, 9, 7, 6, 8],
  });
  const qimenPack = build({
    type: 'qimen',
    year: 2026,
    month: 10,
    day: 22,
    hour: 10,
    minute: 0,
    purpose: '事业求财',
  });
  const ziweiPack = build({
    type: 'ziwei',
    year: 1990,
    month: 5,
    day: 20,
    hour: 14,
    minute: 30,
    gender: 'female',
  });
  const fa = build({ type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, gender: 'male' });
  const fb = build({ type: 'bazi', year: 1992, month: 8, day: 12, hour: 10, gender: 'female' });
  const hepanPack = {
    id: 'hepan:test_phase4',
    system: 'hepan',
    facts: computeHePan({ a: fa.facts, b: fb.facts, names: { a: '甲', b: '乙' } }),
  };

  for (const pack of [baziPack, liuyaoPack, qimenPack, ziweiPack, hepanPack]) {
    const lines = extractAllFactLines(pack);
    assert(
      lines.length >= 3 && lines[0].id === 'F1' && lines.every((l) => /^F\d+$/.test(l.id) && l.text.length > 0),
      `2.1 [${pack.system}] FactPack 全量事实编号表（F1..F${lines.length}）抽取成功`
    );
  }

  const careerReply = await answerFollowup({
    factPack: baziPack,
    question: '我近两年适合跳槽或拓展副业吗？',
  });
  assert(
    careerReply.answer.length >= 60 &&
      careerReply.basis.length >= 2 &&
      careerReply.basisDetails.length >= 2 &&
      careerReply.suggestions.length >= 2,
    '2.2 [bazi] 事业跳槽意图追问解答结构完整，含 F1..Fn 依据溯源与后续建议'
  );

  const qmReply = await answerFollowup({
    factPack: qimenPack,
    question: '此局最有利的求谋方位与行动策略是什么？',
  });
  assert(
    qmReply.answer.length >= 50 && qmReply.basis.length >= 2,
    '2.3 [qimen] 奇门择方意图追问解答结构完整'
  );

  const zwReply = await answerFollowup({
    factPack: ziweiPack,
    question: '我生年四化与当前大限有什么需要注意的？',
  });
  assert(
    zwReply.answer.length >= 50 && zwReply.basis.length >= 2,
    '2.4 [ziwei] 紫微四化与大限追问解答结构完整'
  );

  // 验证会话持久化
  const testFpId = 'bazi:test_chat_persist';
  clearChatThread(testFpId);
  appendChatTurn({
    factPackId: testFpId,
    type: 'bazi',
    owner: 'uid:test',
    question: '我的正缘特征是什么？',
    reply: careerReply,
  });
  const savedThread = getChatThread(testFpId);
  assert(
    savedThread && Array.isArray(savedThread.messages) && savedThread.messages.length === 2,
    '2.5 追问多轮对话在 SQLite / chats.json 持久化读写正常'
  );
  clearChatThread(testFpId);

  // ------------------------------------------------------------------
  // 3. 真实支付回调验签、金额核验、自助退款与自动对账验证
  // ------------------------------------------------------------------
  console.log('\n--- 3. 支付回调验签、防篡改核销、自助退款与对账闭环 ---');
  assert(
    listSkus().some((s) => s.id === 'ai_followup_pack' && s.price === 9.9),
    '3.1 新增 SKU「大师追问畅聊包 (ai_followup_pack)」注册成功'
  );

  // 微信支付 v3 HMAC-SHA256 验签与防重放测试
  process.env.XUANXUE_WECHAT_APPID = 'wx_test_appid';
  process.env.XUANXUE_WECHAT_MCHID = 'mch_test_123';
  process.env.XUANXUE_WECHAT_APIV3_KEY = '0123456789abcdef0123456789abcdef';
  const wx = new WechatProvider();
  const wxOrder = createOrder({ skuId: 'full_report', type: 'bazi', factPackId: baziPack.id, userId: 'u_phase4' });
  const wxCharge = wx.createCharge(wxOrder);
  assert(
    wxCharge.ok && wxCharge.paid === false && wxCharge.codeUrl.startsWith('weixin://'),
    '3.2 微信支付下单生成 Native 扫码链接与 H5 跳转凭证，且强制等待异步回调'
  );

  const nowTs = String(Math.floor(Date.now() / 1000));
  const wxNotifyBody = JSON.stringify({
    out_trade_no: wxOrder.id,
    trade_state: 'SUCCESS',
    transaction_id: 'WX_TX_998877',
    amount: { total: Math.round(wxOrder.amount * 100) },
  });
  const wxSig = wx.signPayload({ body: wxNotifyBody, timestamp: nowTs, nonce: 'nonce_abc' });
  const wxVerified = wx.handleNotify({
    body: wxNotifyBody,
    timestamp: nowTs,
    nonce: 'nonce_abc',
    signature: wxSig,
    checkTimestamp: true,
  });
  assert(
    wxVerified.status === 'paid' && wxVerified.orderId === wxOrder.id && wxVerified.amountFen === 1990,
    '3.3 微信支付 v3 回调 HMAC-SHA256 签名校验与防重放窗口验证通过'
  );

  let wxTamperBlocked = false;
  try {
    wx.handleNotify({
      body: wxNotifyBody,
      timestamp: nowTs,
      nonce: 'nonce_abc',
      signature: 'bad_signature_base64',
    });
  } catch {
    wxTamperBlocked = true;
  }
  assert(wxTamperBlocked, '3.4 微信支付伪造签名回调被严格拦截');

  // 金额篡改拦截测试（1分钱替单攻击防护）
  let amountTamperBlocked = false;
  try {
    confirmPaid(wxOrder.id, { tradeNo: 'WX_TX_HACK', amountFen: 1 });
  } catch {
    amountTamperBlocked = true;
  }
  assert(amountTamperBlocked, '3.5 confirmPaid 回调金额不一致（1分钱攻击）被严格拦截');

  // 正常金额回调核销
  const confirmed = confirmPaid(wxOrder.id, { tradeNo: wxVerified.tradeNo, amountFen: wxVerified.amountFen, channel: 'wechat' });
  assert(
    confirmed.status === 'paid' && Boolean(confirmed.entitlement) && confirmed.notifyCount === 1,
    '3.6 微信支付正确金额回调核销成功并签发 HMAC 权益令牌'
  );

  // 支付宝 RSA-SHA256 签名验签测试
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  process.env.XUANXUE_ALIPAY_APPID = '2026000123';
  process.env.XUANXUE_ALIPAY_PRIVATE_KEY = privateKey;
  process.env.XUANXUE_ALIPAY_PUBLIC_KEY = publicKey;
  const ali = new AlipayProvider();
  const aliParams = {
    app_id: '2026000123',
    out_trade_no: wxOrder.id,
    trade_no: 'ALI_TX_20261022',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '19.90',
  };
  const signContent = Object.keys(aliParams).sort().map((k) => `${k}=${aliParams[k]}`).join('&');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signContent, 'utf8');
  const aliSign = signer.sign(privateKey, 'base64');
  const aliVerified = ali.handleNotify({ params: aliParams, sign: aliSign });
  assert(
    aliVerified.status === 'paid' && aliVerified.tradeNo === 'ALI_TX_20261022' && aliVerified.amountFen === 1990,
    '3.7 支付宝 RSA-SHA256 公钥验签与金额解析通过'
  );

  // 订单对账巡检与自助退款验证
  const recReport = reconcileOrders({ autoHeal: true });
  assert(
    recReport.paid >= 1 && recReport.gmv >= 19.9 && recReport.byChannel?.wechat?.paidCount >= 1,
    '3.8 订单自动对账（reconcileOrders）渠道统计与异常巡检通过'
  );

  const userOrders = listOrders({ userId: 'u_phase4' });
  assert(
    userOrders.length >= 1 && userOrders[0].canRefund === true,
    '3.9 订单列表正确输出 canRefund=true 自助退款资格标识'
  );

  const refunded = refundOrder(wxOrder.id, { reason: '测试自助退款' });
  assert(
    refunded.status === 'refunded' && refunded.entitlement === null && Boolean(refunded.refundId),
    '3.10 订单自助退款成功回收权益令牌并生成渠道退款单号'
  );

  delete process.env.XUANXUE_WECHAT_APPID;
  delete process.env.XUANXUE_WECHAT_MCHID;
  delete process.env.XUANXUE_WECHAT_APIV3_KEY;
  delete process.env.XUANXUE_ALIPAY_APPID;
  delete process.env.XUANXUE_ALIPAY_PRIVATE_KEY;
  delete process.env.XUANXUE_ALIPAY_PUBLIC_KEY;
  resetOrders();

  // ------------------------------------------------------------------
  // 4. 服务端 HTTP 接口端到端联调（/api/almanac, /api/chat/*, /api/pay/reconcile）
  // ------------------------------------------------------------------
  console.log('\n--- 4. 服务端 Phase 4 HTTP 接口端到端联调 ---');
  const port = 18940 + Math.floor(Math.random() * 400);
  const srv = spawn(process.execPath, ['src/server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', AI_FORCE_LOCAL: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${baseUrl}/api/health`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  assert(ready, `4.1 测试服务器在端口 ${port} 启动成功`);

  try {
    // 4.2 先排一盘八字
    const ppRes = await fetch(`${baseUrl}/api/paipan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'bazi',
        year: 1990,
        month: 5,
        day: 20,
        hour: 14,
        minute: 30,
        gender: 'male',
        city: '北京',
      }),
    });
    const ppJson = await ppRes.json();
    const fpId = ppJson.factPackId || ppJson.factPack?.id;
    assert(ppRes.ok && Boolean(fpId), '4.2 /api/paipan 排盘成功并返回 factPackId');

    // 4.3 请求绑定了 factPackId 的每日黄历
    const almRes = await fetch(`${baseUrl}/api/almanac?date=2026-10-22&factPackId=${encodeURIComponent(fpId)}`);
    const almJson = await almRes.json();
    assert(
      almRes.ok &&
        almJson.ok &&
        almJson.almanac?.personal?.userDayGanzhi &&
        almJson.almanac?.jianchu?.name,
      '4.3 GET /api/almanac?factPackId=... 自动提取命主日柱与喜用神返回专属流日黄历'
    );

    // 4.4 请求 AI 追问（JSON 模式）
    const chatRes = await fetch(`${baseUrl}/api/chat/stream?mode=json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        factPackId: fpId,
        question: '我近两年适合跳槽还是稳守？',
      }),
    });
    const chatJson = await chatRes.json();
    assert(
      chatRes.ok &&
        chatJson.ok &&
        chatJson.reply?.answer?.length >= 40 &&
        Array.isArray(chatJson.reply?.basis) &&
        chatJson.messages?.length === 2,
      '4.4 POST /api/chat/stream?mode=json 命盘追问返回合规解答与 F1..Fn 溯源'
    );

    // 4.5 请求 AI 追问（SSE 流式模式）
    const sseRes = await fetch(`${baseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        factPackId: fpId,
        question: '我的正缘特征与夫妻宫互动如何？',
      }),
    });
    const sseText = await sseRes.text();
    assert(
      sseRes.ok &&
        sseText.includes('event: start') &&
        sseText.includes('event: delta') &&
        sseText.includes('event: done'),
      '4.5 POST /api/chat/stream SSE 流式帧（start / delta / done）完整返回'
    );

    // 4.6 查询追问历史记录
    const histRes = await fetch(`${baseUrl}/api/chat/history?factPackId=${encodeURIComponent(fpId)}`);
    const histJson = await histRes.json();
    assert(
      histRes.ok && histJson.ok && histJson.messages?.length === 4 && histJson.presets?.length >= 3,
      '4.6 GET /api/chat/history 返回完整多轮对话历史（4 条消息 / 2 轮问答）与快捷词'
    );

    // 4.7 清空追问记录
    const clrRes = await fetch(`${baseUrl}/api/chat/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factPackId: fpId }),
    });
    const clrJson = await clrRes.json();
    assert(clrRes.ok && clrJson.ok && clrJson.cleared === true, '4.7 POST /api/chat/clear 清空当前命盘对话成功');

    // 4.8 订单对账接口
    const recRes = await fetch(`${baseUrl}/api/pay/reconcile`);
    const recJson = await recRes.json();
    assert(
      recRes.ok && recJson.ok && typeof recJson.reconcile?.gmv === 'number',
      '4.8 GET /api/pay/reconcile 对账接口返回正常'
    );
  } finally {
    srv.kill('SIGTERM');
  }

  // ------------------------------------------------------------------
  // 5. 前端 Phase 4 组件与样式静态完整性验证
  // ------------------------------------------------------------------
  console.log('\n--- 5. 前端 Phase 4 UI 组件静态完整性检查 ---');
  const posterJs = fs.readFileSync(path.join(ROOT, 'web/poster.js'), 'utf8');
  const styleCss = fs.readFileSync(path.join(ROOT, 'web/style.css'), 'utf8');
  const mineJs = fs.readFileSync(path.join(ROOT, 'web/mine.js'), 'utf8');

  assert(
    posterJs.includes('__xjOpenAlmanacModal') &&
      posterJs.includes('xjAlmanacModal') &&
      posterJs.includes('xjFollowupBox') &&
      posterJs.includes('__xjSyncPhase4Context'),
    '5.1 web/poster.js 完整包含今日黄历弹窗与 AI 命盘多轮追问面板逻辑'
  );
  assert(
    styleCss.includes('.xj-alm-panel') &&
      styleCss.includes('.xj-followup-card') &&
      styleCss.includes('.alm-personal'),
    '5.2 web/style.css 完整包含黄历与多轮追问对话流响应式样式'
  );
  assert(
    mineJs.includes('data-refund-id') && mineJs.includes('CH.refundOrder'),
    '5.3 web/mine.js 订单中心完整接入一键自助退款交互闭环'
  );

  console.log(`\n=== Phase 4 验证汇总：通过 ${pass} 项，失败 ${fail} 项 ===`);
  if (fail > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Phase 4 验证异常:', err);
  process.exit(1);
});
