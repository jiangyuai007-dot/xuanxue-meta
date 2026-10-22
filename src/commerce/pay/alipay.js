/**
 * 支付宝渠道（电脑网站支付 / 手机网站支付骨架）
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
    return {
      ok: true,
      channel: this.id,
      tradeNo: newTradeNo(this.id),
      paid: false, // 等异步回调
      payUrl: null,
      orderString: `app_id=${process.env[ENV.appId]}&total_amount=${order.amount}&out_trade_no=${order.id}`,
      notifyUrl: process.env[ENV.notifyUrl] || null,
    };
  }

  /**
   * 回调校验：支付宝异步通知需对「待签名串」用支付宝公钥做 RSA-SHA256 验签
   * @param {{ params?:Record<string,string>, sign?:string, signType?:string }} payload
   */
  handleNotify(payload = {}) {
    this.requireConfigured();
    const { params = {}, sign = '' } = payload;
    const keys = Object.keys(params).filter((k) => k !== 'sign' && k !== 'sign_type').sort();
    const content = keys.map((k) => `${k}=${params[k]}`).join('&');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(content, 'utf8');
    const ok = verifier.verify(process.env[ENV.publicKey], Buffer.from(sign, 'base64'));
    if (!ok) throw new Error('支付宝回调签名校验失败');
    return {
      orderId: params.out_trade_no || null,
      status: ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status) ? 'paid' : 'failed',
      tradeNo: params.trade_no || null,
    };
  }

  refund(order) {
    this.requireConfigured();
    return { ok: true, refundId: 'RFAL' + newTradeNo(this.id).slice(2), channel: this.id, amountFen: toFen(order.amount) };
  }
}
