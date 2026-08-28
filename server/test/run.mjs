// 跑全部测试：node test/run.mjs（或 npm test）
import { readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = (await readdir(dir))
  .filter((f) => f.endsWith('.test.mjs'))
  .sort();

let failed = 0;
for (const f of files) {
  const mod = await import(path.join(dir, f));
  failed += (await mod.default()) || 0;
}
console.log(failed ? `\n有 ${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
