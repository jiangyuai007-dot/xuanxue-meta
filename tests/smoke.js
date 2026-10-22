/**
 * HTTP 端到端冒烟：启动服务 → 调用全部接口 → 关闭服务
 * 运行：node tests/smoke.js
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { DISCLAIMER, DISCLAIMER_ENABLED } from '../src/compliance/gateway.js';
const DISC12 = DISCLAIMER.slice(0, 12);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PORT = Number(process.env.SMOKE_PORT || 8899);
const BASE = `http://127.0.0.1:${PORT}`;
const LOG = path.join(ROOT, '.smoke-server.log');

let pass = 0;
let fail = 0;
function t(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

const logFd = fs.openSync(LOG, 'w');
// 清空历史订单，保证冒烟结果可复现
try {
  fs.rmSync(path.join(ROOT, 'data', 'orders.json'), { force: true });
} catch {
  /* ignore */
}
const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', logFd, logFd],
  windowsHide: true,
});

async function waitReady(timeoutMs = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function post(p, body) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function get(p) {
  const r = await fetch(BASE + p);
  return { status: r.status, data: await r.json().catch(() => ({})), text: await r.text().catch(() => '') };
}

(async () => {
  try {
    const ready = await waitReady();
    t('服务启动并响应 /api/health', ready, fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').slice(0, 200) : '');
    if (!ready) throw new Error('服务未就绪');

    const h = await get('/api/health');
    t('health 返回 ok', h.data.ok === true, JSON.stringify(h.data));

    const idx = await fetch(BASE + '/');
    const html = await idx.text();
    t('首页可访问且含八字入口', idx.status === 200 && html.includes('八字'), `status=${idx.status}`);

    const css = await fetch(BASE + '/style.css');
    t('静态资源可访问', css.status === 200 && (await css.text()).includes('--gold'), `status=${css.status}`);

    const cities = await get('/api/cities');
    t('城市列表接口', cities.data.cities?.length > 10, String(cities.data.cities?.length));

    const skus = await get('/api/skus');
    t('SKU 列表接口', skus.data.skus?.length >= 4, String(skus.data.skus?.length));

    // 八字
    const pp = await post('/api/paipan', {
      input: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
    });
    t('八字排盘接口', pp.status === 200 && pp.data.ok === true, pp.data.error || '');
    t('排盘返回四柱', pp.data.facts?.fourPillars?.year?.name === '庚午', JSON.stringify(pp.data.facts?.fourPillars?.year));
    t('排盘返回图表 HTML', typeof pp.data.chartHtml === 'string' && pp.data.chartHtml.length > 100);

    const rep = await post('/api/report', {
      input: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
    });
    t('报告接口', rep.status === 200 && rep.data.ok === true, rep.data.error || '');
    // —— 全站免费模式：所有章节直接可读，不存在锁定章 ——
    t('免费模式：无锁定章节', rep.data.interpretation?.sections?.every((s) => s.preview !== true) === true,
      JSON.stringify((rep.data.interpretation?.sections || []).filter((s) => s.preview).map((s) => s.key)));
    t('免费模式：全部章节直接可读', (rep.data.unlocked || []).length >= 9, JSON.stringify(rep.data.unlocked));

    // 付费链路本身仍然可用（保留在 XUANXUE_PAID=1 模式下），凭证签发与验签必须正常
    const ordRes = await post('/api/order', { skuId: 'single_section', sectionKey: 'xingge', system: 'bazi' });
    const paidRes = ordRes.status === 200 ? await post(`/api/order/${ordRes.data.order.id}/pay`, {}) : null;
    const ent = paidRes && paidRes.data && paidRes.data.order ? paidRes.data.order.entitlement : null;
    t('支付后返回服务端权益凭证', !!ent, ent ? 'token 已签发' : '未拿到 entitlement');
    t('订单创建与支付接口可用', ordRes.status === 200 && paidRes && paidRes.data?.order?.status === 'paid', '');
    t('不存在的章节键下单被拒', (await post('/api/order', { skuId: 'single_section', sectionKey: 'career', system: 'bazi' })).status === 400, '');

    // —— 隐私门禁（P0）：报告页 / 分享卡必须带有效令牌 ——
    const fpId0 = rep.data.factPackId;
    const noTok = await get(`/api/report/${fpId0}/html`);
    t('报告页无令牌 → 403', noTok.status === 403, 'status=' + noTok.status);
    const badTok = await get(`/api/report/${fpId0}/html?t=tampered-token`);
    t('报告页令牌被篡改 → 403', badTok.status === 403, 'status=' + badTok.status);
    const tokRes = await post('/api/report', {
      input: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
    });
    const okTok = await get(`/api/report/${tokRes.data.factPackId}/html?t=${encodeURIComponent(tokRes.data.reportToken || '')}`);
    t('报告页有效令牌 → 200', okTok.status === 200, 'status=' + okTok.status);

    const fpId = rep.data.factPackId;

    // 六爻 / 奇门
    const ly = await post('/api/report', {
      input: { type: 'liuyao', year: 2026, month: 9, day: 22, hour: 10, city: '北京', category: 'career', question: '今年工作变动如何' },
    });
    t('六爻报告接口', ly.status === 200 && ly.data.interpretation?.sections?.length === 5, ly.data.error || String(ly.data.interpretation?.sections?.length));

    const qm = await post('/api/report', {
      input: { type: 'qimen', year: 2026, month: 9, day: 22, hour: 10, city: '北京', purpose: 'wealth' },
    });
    t('奇门报告接口', qm.status === 200 && qm.data.interpretation?.sections?.length === 4, qm.data.error || String(qm.data.interpretation?.sections?.length));

    // 紫微
    const zw = await post('/api/paipan', {
      input: { type: 'ziwei', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
    });
    t('紫微排盘接口', zw.status === 200 && zw.data.ok === true, zw.data.error || '');
    t('紫微返回命宫与十二宫', !!zw.data.facts?.mingGong && Object.keys(zw.data.facts?.palaces || {}).length === 12, JSON.stringify(zw.data.facts?.mingGong));
    t('紫微排盘图表含命宫', typeof zw.data.chartHtml === 'string' && zw.data.chartHtml.includes('命宫'), `len=${zw.data.chartHtml?.length}`);

    const zr = await post('/api/report', {
      input: { type: 'ziwei', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
    });
    t('紫微报告接口', zr.status === 200 && zr.data.interpretation?.sections?.length === 6, zr.data.error || String(zr.data.interpretation?.sections?.length));
    t('紫微报告免费可读（无锁定章）', zr.data.interpretation?.sections?.every((s) => s.preview !== true) === true);
    // 免责声明随 DISCLAIMER_ENABLED 总开关双向校验：开→各章必须含，关→各章必须不含
    t(`紫微报告章节${DISCLAIMER_ENABLED ? '均含' : '均不含'}免责`, zr.data.interpretation?.sections?.every((s) => s.text.includes(DISC12) === DISCLAIMER_ENABLED) === true, `DISCLAIMER_ENABLED=${DISCLAIMER_ENABLED}`);
    const zfpId = zr.data.factPackId;

    // 报告页/分享卡需带服务端签发的访问令牌（隐私修复后）
    const zTok = encodeURIComponent(zr.data.reportToken || '');
    const zhtml = await fetch(`${BASE}/api/report/${zfpId}/html?t=${zTok}`);
    const ztext = await zhtml.text();
    t(`紫微报告页 HTML${DISCLAIMER_ENABLED ? '含免责' : '（免责已按开关关闭）'}`, zhtml.status === 200 && ztext.includes('命宫') && ztext.includes(DISC12) === DISCLAIMER_ENABLED, `status=${zhtml.status}`);

    const zcard = await fetch(`${BASE}/api/report/${zfpId}/sharecard.svg?t=${zTok}`);
    const zctext = await zcard.text();
    t('紫微分享卡 SVG', zcard.status === 200 && zctext.startsWith('<svg'), `status=${zcard.status}`);

    // 订单
    const order = await post('/api/order', { skuId: 'single_section', sectionKey: 'dayun', system: 'bazi', factPackId: fpId });
    t('创建订单', order.status === 200 && order.data.order?.status === 'pending', order.data.error || '');
    const paid = await post(`/api/order/${order.data.order.id}/pay`, {});
    t('模拟支付', paid.data.order?.status === 'paid', JSON.stringify(paid.data));

    // 不得售卖该体系并不存在的章节（否则用户付了钱拿不到内容）
    const bogus = await post('/api/order', { skuId: 'single_section', sectionKey: 'career', system: 'bazi' });
    t('不存在的章节键下单被拒', bogus.status === 400 && bogus.data.ok === false, 'status=' + bogus.status);

    // 订单→解锁闭环：必须走服务端签发的权益凭证
    const ent1 = paid && paid.data && paid.data.order ? paid.data.order.entitlement : null;
    const rep2 = await post('/api/report', {
      input: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
      entitlements: ent1 ? [ent1] : [],
    });
    t('支付后凭权益凭证解锁对应章节', rep2.status === 200 && rep2.data.unlocked?.includes('dayun') === true, JSON.stringify(rep2.data.unlocked));

    // 安全门禁：无账号体系时「服务端订单回退」必须默认关闭，否则一人买单、所有访客免单
    const repNoEnt = await post('/api/report', {
      input: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
    });
    t('免费模式：不带凭证也全部可读', repNoEnt.status === 200 && (repNoEnt.data.unlocked || []).length >= 9,
      JSON.stringify(repNoEnt.data.unlocked));

    // 全量包：支付后凭凭证解锁该体系全部付费章节
    const full = await post('/api/order', { skuId: 'full_report', system: 'bazi', factPackId: fpId });
    const fullPaid = await post(`/api/order/${full.data.order.id}/pay`, {});
    const entFull = fullPaid && fullPaid.data && fullPaid.data.order ? fullPaid.data.order.entitlement : null;
    const rep3 = await post('/api/report', {
      input: { type: 'bazi', year: 1990, month: 5, day: 20, hour: 14, minute: 30, gender: 'male', city: '北京' },
      entitlements: entFull ? [entFull] : [],
    });
    t('全量包凭凭证解锁全部章节', rep3.data.unlocked?.length >= 9, JSON.stringify(rep3.data.unlocked));

    // 商品合规门禁：不得售卖未交付的能力（追问功能未实现，full_plus 已下架）
    const skuIds = (rep3.data.skus || []).map((s) => s.id);
    t('未交付能力的 SKU 已下架', skuIds.length > 0 && !skuIds.includes('full_plus'), skuIds.join(','));

    // 报告页与分享卡（同样需令牌：rep 响应里已下发 reportToken）
    const rTok = encodeURIComponent(rep.data.reportToken || '');
    const rhtml = await fetch(`${BASE}/api/report/${fpId}/html?t=${rTok}`);
    const rtext = await rhtml.text();
    t('报告页 HTML', rhtml.status === 200 && rtext.includes('<!DOCTYPE html>') && rtext.includes('庚午'), `status=${rhtml.status}`);

    const card = await fetch(`${BASE}/api/report/${fpId}/sharecard.svg?t=${rTok}`);
    const ctext = await card.text();
    t('分享卡 SVG', card.status === 200 && ctext.startsWith('<svg'), `status=${card.status}`);

    // 错误处理
    const bad = await post('/api/paipan', { input: { type: 'unknown', year: 2000, month: 1, day: 1 } });
    t('非法体系返回 400', bad.status === 400 && bad.data.ok === false, `status=${bad.status}`);

    const badOrder = await post('/api/order', { skuId: 'not_exist' });
    t('未知 SKU 返回 400', badOrder.status === 400, `status=${badOrder.status}`);

    const nf = await fetch(`${BASE}/api/report/nonexistent/html`);
    t('不存在的报告返回 404', nf.status === 404, `status=${nf.status}`);

    console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  } catch (e) {
    fail++;
    console.log('冒烟异常：' + e.message);
  } finally {
    child.kill();
    try {
      fs.closeSync(logFd);
    } catch {
      /* ignore */
    }
    process.exit(fail === 0 ? 0 : 1);
  }
})();
