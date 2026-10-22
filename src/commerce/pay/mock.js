/**
 * 模拟支付渠道 —— 用于内测与回归测试
 * 语义必须诚实：它是"模拟下单并立即记账"，不代表任何真实资金流转。
 */

import { BaseProvider, newTradeNo } from './provider.js';

export class MockProvider extends BaseProvider {
  constructor() {
    super('mock', '模拟支付');
  }

  isConfigured() {
    return true;
  }

  createCharge(order) {
    // 模拟渠道：立即判定为已支付（业务层据此签发权益凭证）
    return { ok: true, channel: this.id, tradeNo: newTradeNo(this.id), paid: true, note: '模拟支付，未发生真实扣款' };
  }

  handleNotify(payload = {}) {
    return { orderId: payload.orderId || null, status: 'paid', tradeNo: payload.tradeNo || newTradeNo(this.id) };
  }

  refund(order) {
    return { ok: true, refundId: 'RF' + newTradeNo(this.id).slice(2), channel: this.id };
  }
}
