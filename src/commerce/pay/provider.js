/**
 * 支付渠道抽象层 —— 基类与公共工具（零第三方依赖）
 *
 * 设计目标：
 *  - 上层（sku.js）只依赖统一接口，不关心具体渠道，接入真实支付时不用改业务代码；
 *  - 渠道未配置商户凭据时「明确报错」而不是假装成功——绝不允许出现"点了支付就当已付款"的静默兜底；
 *  - 所有金额以「元」为单位在业务层流转，渠道层负责换算成分（微信/支付宝要求整数分）。
 */

import crypto from 'node:crypto';

/** 生成渠道交易号（可读、可追溯、不重复） */
export function newTradeNo(channel = 'mock') {
  const tag = String(channel).slice(0, 2).toUpperCase().padEnd(2, 'X');
  return `TN${tag}${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/** 元 → 分（避免浮点误差） */
export function toFen(yuan) {
  return Math.round(Number(yuan) * 100);
}

export class BaseProvider {
  constructor(id, name) {
    this.id = id;
    this.name = name;
  }

  /** 凭据是否齐全；不齐全时 createCharge/refund 必须抛错 */
  isConfigured() {
    return true;
  }

  /** 未配置时的统一中文报错 */
  requireConfigured() {
    if (!this.isConfigured()) {
      throw new Error(`${this.name}渠道未配置商户凭据，请联系商户完成配置后使用`);
    }
  }

  /**
   * 发起收款
   * @param {{ id:string, amount:number, skuName:string, userId?:string }} order
   * @returns {{ ok:boolean, channel:string, tradeNo:string, paid:boolean, payUrl?:string, codeUrl?:string }}
   */
  // eslint-disable-next-line no-unused-vars
  createCharge(order) {
    throw new Error(`${this.name}渠道未实现 createCharge`);
  }

  /**
   * 处理异步回调
   * @param {object} payload 渠道原始回调体
   * @returns {{ orderId:string, status:'paid'|'failed', tradeNo:string }}
   */
  // eslint-disable-next-line no-unused-vars
  handleNotify(payload) {
    throw new Error(`${this.name}渠道未实现 handleNotify`);
  }

  /**
   * 退款
   * @param {{ id:string, amount:number }} order
   * @returns {{ ok:boolean, refundId:string }}
   */
  // eslint-disable-next-line no-unused-vars
  refund(order) {
    throw new Error(`${this.name}渠道未实现 refund`);
  }
}

/** 通用 HMAC 签名（微信 v3 风格） */
export function hmacBase64(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('base64');
}
