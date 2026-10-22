/** 内部小工具：sleep <ms>（本机 bash 没有 sleep） */
await new Promise((r) => setTimeout(r, Number(process.argv[2] || 3000)));
console.log('slept ' + (process.argv[2] || 3000) + 'ms');
process.exit(0);
