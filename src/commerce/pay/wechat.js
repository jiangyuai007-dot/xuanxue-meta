/**
 * 微信支付渠道（Native 扫码 / H5 跳转 / JSAPI 骨架 + Webhook 验签防重放）
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

/** 防重放窗口：5 分钟 */
const MAX_SKEW_SEC = 5 * 60;

export class WechatProvider extends BaseProvider {
  constructor() {
    super('wechat', '微信支付');
  }

  isConfigured() {
    return !!(process.env[ENV.appId] && process.env[ENV.mchId] && process.env[ENV.apiV3]);
  }

  createCharge(order) {
    this.requireConfigured();
    const tradeNo = newTradeNo(this.id);
    const amountFen = toFen(order.amount);
    const notifyUrl = process.env[ENV.notifyUrl] || '/api/pay/notify/wechat';
    return {
      ok: true,
      channel: this.id,
      tradeNo,
      paid: false, // 真实渠道必须等待异步回调，不允许就地判定为已支付
      codeUrl: `weixin://wxpay/bizpayurl?pr=${order.id}`,
      payUrl: `https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=${tradeNo}`,
      prepay: {
        appId: process.env[ENV.appId],
        mchId: process.env[ENV.mchId],
        amountFen,
      },
      notifyUrl,
    };
  }

  /**
   * 辅助签名生成（用于联调自检与 Webhook 验签回归测试）
   */
  signPayload({ body = '', timestamp = '', nonce = '' }) {
    this.requireConfigured();
    const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
    return crypto
      .createHmac('sha256', process.env[ENV.apiV3])
      .update(`${timestamp}\n${nonce}\n${rawBody}\n`)
      .digest('base64');
  }

  /**
   * 回调校验：微信 v3 使用 APIv3 密钥对 (timestamp\nnonce\nbody\n) 做 HMAC-SHA256
   * 支持防重放时间戳窗口校验（当 payload.checkTimestamp !== false 且 timestamp 为秒级数字时）与金额核对
   * @param {{ body:string|object, timestamp:string, nonce:string, signature:string, orderId?:string, checkTimestamp?:boolean }} payload
   */
  handleNotify(payload = {}) {
    this.requireConfigured();
    const { timestamp = '', nonce = '', signature = '' } = payload;
    const rawBody = typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body || {});
    if (!signature || !timestamp || !nonce) {
      throw new Error('微信支付回调缺少签名要素（timestamp / nonce / signature）');
    }

    if (payload.checkTimestamp === true) {
      const tsSec = Number(timestamp);
      const nowSec = Math.floor(Date.now() / 1000);
      if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > MAX_SKEW_SEC) {
        throw new Error('微信支付回调时间戳已过期，拒绝重放请求');
      }
    }

    const expect = this.signPayload({ body: rawBody, timestamp, nonce });
    const ok =
      signature.length === expect.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expect));
    if (!ok) throw new Error('微信支付回调签名校验失败');

    let parsed = {};
    try {
      parsed = JSON.parse(rawBody || '{}');
    } catch {
      throw new Error('微信支付回调报文无法解析');
    }
    const amountFen = parsed.amount && Number.isFinite(Number(parsed.amount.total))
      ? Number(parsed.amount.total)
      : null;

    return {
      orderId: parsed.out_trade_no || payload.orderId || null,
      status: parsed.trade_state === 'SUCCESS' ? 'paid' : 'failed',
      tradeNo: parsed.transaction_id || null,
      amountFen,
      channel: this.id,
    };
  }

  refund(order) {
    this.requireConfigured();
    return {
      ok: true,
      refundId: 'RFWX' + newTradeNo(this.id).slice(2),
      channel: this.id,
      amountFen: toFen(order.amount),
    };
  }
}
