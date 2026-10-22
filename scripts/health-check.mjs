/**
 * 服务健康检查：依次探测 8787-8792，找到命理平台即打印地址并以 0 退出。
 */
import net from 'node:net';

function probe(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port, timeout: 800 }, () => {
      s.destroy();
      resolve(port);
    });
    s.on('error', () => resolve(null));
    s.on('timeout', () => { s.destroy(); resolve(null); });
  });
}

for (let p = 8787; p <= 8792; p++) {
  const found = await probe(p);
  if (found) {
    let name = '';
    try {
      const r = await fetch(`http://127.0.0.1:${found}/api/health`);
      const j = await r.json().catch(() => ({}));
      name = j && j.ok !== undefined ? '（/api/health 正常）' : `（HTTP ${r.status}）`;
    } catch { /* 端口开但非本服务 */ }
    console.log(`[OK] 服务运行中: http://127.0.0.1:${found} ${name}`);
    process.exit(0);
  }
}
console.error('[FAIL] 8787-8792 均未发现服务');
process.exit(1);
