/**
 * 支付渠道注册表 —— 业务层唯一入口
 * 上层只调用 listChannels / createCharge / handleNotify / refundCharge，
 * 不直接依赖任何具体渠道实现。
 */

import { MockProvider } from './mock.js';
import { WechatProvider } from './wechat.js';
import { AlipayProvider } from './alipay.js';

const REGISTRY = [new MockProvider(), new WechatProvider(), new AlipayProvider()];

/** 渠道列表（供前端展示：enabled=false 的渠道不可选，并给出原因） */
export function listChannels() {
  return REGISTRY.map((p) => ({
    id: p.id,
    name: p.name,
    enabled: p.isConfigured(),
    note: p.isConfigured() ? '' : '未配置商户凭据，暂不可用',
  }));
}

export function getProvider(channelId) {
  const p = REGISTRY.find((x) => x.id === channelId);
  if (!p) throw new Error(`未知支付渠道: ${channelId}`);
  return p;
}

/** 发起收款；真实渠道返回 paid:false，必须等回调 */
export function createCharge({ order, channel = 'mock' }) {
  return getProvider(channel).createCharge(order);
}

/** 处理异步回调，返回归一化结果 */
export function handleNotify(channel, payload) {
  return getProvider(channel).handleNotify(payload);
}

/** 退款（渠道层） */
export function refundCharge({ order, channel = 'mock' }) {
  return getProvider(channel || 'mock').refund(order);
}
