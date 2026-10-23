/**
 * 支付宝渠道（电脑网站支付 / 手机 H5 网站支付骨架 + RSA-SHA256 回调验签）
 *
 * 同样遵循「未配置凭据就明确报错」原则：不存在静默降级为已支付的路径。
 */

import crypto from 'node:crypto';
import { BaseProvider, newTradeNo, toFen } from './provider.js';

const ENV = {
  appId: 'XUANXUE_ALIPAY_APPID',
  privateKey: 'XUANXUE_ALIPAY_PRIVATE_KEY',
  publicKey: 'XUANXUE_ALIPAY_PUBLIC_KEY',
  notifyUrl: 'XUANXUE_ALIPAY_NOTIFY_URL',
};

export class AlipayProvider extends BaseProvider {
  constructor() {
    super('alipay', '支付宝');
  }

  isConfigured() {
    return !!(process.env[ENV.appId] && process.env[ENV.privateKey] && process.env[ENV.publicKey]);
  }

  createCharge(order) {
    this.requireConfigured();
    const tradeNo = newTradeNo(this.id);
    const notifyUrl = process.env[ENV.notifyUrl] || '/api/pay/notify/alipay';
    const orderString = `app_id=${process.env[ENV.appId]}&total_amount=${Number(order.amount).toFixed(2)}&out_trade_no=${order.id}&subject=${encodeURIComponent(order.skuName || order.skuId)}`;
    return {
      ok: true,
      channel: this.id,
      tradeNo,
      paid: false, // 等异步回调
      payUrl: `https://openapi.alipay.com/gateway.do?${orderString}`,
      orderString,
      notifyUrl,
    };
  }

  /**
   * 回调校验：支付宝异步通知需对「待签名串（排除 sign 与 sign_type 后按字典序拼接）」做 RSA-SHA256 验签
   * @param {{ params?:Record<string,string>, sign?:string, signType?:string }} payload
   */
  handleNotify(payload = {}) {
    this.requireConfigured();
    const { params = {}, sign = '' } = payload;
    if (!sign) throw new Error('支付宝回调缺少签名 sign');
    const keys = Object.keys(params).filter((k) => k !== 'sign' && k !== 'sign_type' && params[k] !== undefined && params[k] !== '').sort();
    const content = keys.map((k) => `${k}=${params[k]}`).join('&');
    let ok = false;
    try {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(content, 'utf8');
      ok = verifier.verify(process.env[ENV.publicKey], Buffer.from(sign, 'base64'));
    } catch {
      ok = false;
    }
    if (!ok) throw new Error('支付宝回调签名校验失败');

    const totalAmt = params.total_amount !== undefined ? Number(params.total_amount) : NaN;
    const amountFen = Number.isFinite(totalAmt) ? toFen(totalAmt) : null;

    return {
      orderId: params.out_trade_no || null,
      status: ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status) ? 'paid' : 'failed',
      tradeNo: params.trade_no || null,
      amountFen,
      channel: this.id,
    };
  }

  refund(order) {
    this.requireConfigured();
    return {
      ok: true,
      refundId: 'RFAL' + newTradeNo(this.id).slice(2),
      channel: this.id,
      amountFen: toFen(order.amount),
    };
  }
}
