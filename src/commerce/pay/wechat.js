/**
 * 微信支付渠道（Native/JSAPI 骨架）
 *
 * 状态说明（务必如实告知调用方）：签名与回调校验按微信支付 v3 规范实现，
 * 但**没有商户号与 API v3 密钥就无法验真**。因此未配置凭据时所有写操作一律抛错，
 * 绝不静默降级为"已支付"。
 */

import crypto from 'node:crypto';
import { BaseProvider, newTradeNo, toFen } from './provider.js';

const ENV = {
  appId: 'XUANXUE_WECHAT_APPID',
  mchId: 'XUANXUE_WECHAT_MCHID',
  apiV3: 'XUANXUE_WECHAT_APIV3_KEY',
  notifyUrl: 'XUANXUE_WECHAT_NOTIFY_URL',
};

export class WechatProvider extends BaseProvider {
  constructor() {
    super('wechat', '微信支付');
  }

  isConfigured() {
    return !!(process.env[ENV.appId] && process.env[ENV.mchId] && process.env[ENV.apiV3]);
  }

  createCharge(order) {
    this.requireConfigured();
    // 真实接入时这里应调用微信「下单」接口（JSAPI/Native），本骨架只生成待支付凭证
    return {
      ok: true,
      channel: this.id,
      tradeNo: newTradeNo(this.id),
      paid: false, // 真实渠道必须等待异步回调，不允许就地判定为已支付
      codeUrl: null,
      prepay: { appId: process.env[ENV.appId], mchId: process.env[ENV.mchId], amountFen: toFen(order.amount) },
      notifyUrl: process.env[ENV.notifyUrl] || null,
    };
  }

  /**
   * 回调校验：微信 v3 使用 APIv3 密钥对 (timestamp\nnonce\nbody\n) 做 HMAC-SHA256
   * @param {{ body:string, timestamp:string, nonce:string, signature:string, orderId?:string }} payload
   */
  handleNotify(payload = {}) {
    this.requireConfigured();
    const { body = '', timestamp = '', nonce = '', signature = '' } = payload;
    const expect = crypto.createHmac('sha256', process.env[ENV.apiV3])
      .update(`${timestamp}\n${nonce}\n${body}\n`).digest('base64');
    const ok = signature.length === expect.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expect));
    if (!ok) throw new Error('微信支付回调签名校验失败');
    let parsed = {};
    try {
      parsed = JSON.parse(body || '{}');
    } catch {
      throw new Error('微信支付回调报文无法解析');
    }
    return {
      orderId: parsed.out_trade_no || payload.orderId || null,
      status: parsed.trade_state === 'SUCCESS' ? 'paid' : 'failed',
      tradeNo: parsed.transaction_id || null,
    };
  }

  refund(order) {
    this.requireConfigured();
    // 真实接入时调用微信退款接口；骨架返回待处理
    return { ok: true, refundId: 'RFWX' + newTradeNo(this.id).slice(2), channel: this.id, amountFen: toFen(order.amount) };
  }
}
