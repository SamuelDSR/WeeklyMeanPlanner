// 直接逐个 require @img 下的 .node，把**真正的**错误打出来。
//
// 为什么需要这个：sharp 自己的错误处理有 bug（sharp.cjs / sharp.mjs 里
// `err.code.endsWith(...)` 假设每个错误都带 .code），动态库加载失败抛出的错误
// 没有 .code，于是它自己崩成一句 TypeError，把真正的原因整段盖掉。
// 这个脚本绕过 sharp，直接加载 binding，所以能看到实话。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sh = (cmd) => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '(n/a)';
  }
};

console.log('=== 环境 ===');
console.log('node        ', process.version, process.platform, process.arch);
console.log('libc        ', sh('ldd --version 2>&1 | head -1') || sh('ls /lib/ld-musl* 2>/dev/null'));
console.log('kernel      ', sh('uname -r'));
console.log('cpu flags   ', (sh("grep -m1 '^flags' /proc/cpuinfo").match(/\b(avx2|avx512f|sse4_2)\b/g) || []).join(' ') || '(读不到)');

const dir = path.join(__dirname, '..', 'node_modules', '@img');
console.log('\n=== @img 里的包 ===');
if (!fs.existsSync(dir)) {
  console.log('目录不存在:', dir, '-> optional 依赖根本没装上');
  process.exit(1);
}
for (const pkg of fs.readdirSync(dir).sort()) {
  let ver = '?';
  try {
    ver = require(path.join(dir, pkg, 'package.json')).version;
  } catch {}
  console.log(`  ${pkg.padEnd(34)} ${ver}`);
}

console.log('\n=== 逐个直接加载 binding（真正的报错在这里）===');
let loadedAny = false;
for (const pkg of fs.readdirSync(dir).sort()) {
  const libdir = path.join(dir, pkg, 'lib');
  if (!fs.existsSync(libdir)) continue;
  for (const f of fs.readdirSync(libdir).filter((n) => n.endsWith('.node'))) {
    const full = path.join(libdir, f);
    // ldd 能直接看出缺哪个 .so
    const missing = sh(`ldd ${full} 2>&1 | grep -i 'not found'`);
    try {
      require(full);
      console.log(`  OK    ${pkg}/${f}`);
      loadedAny = true;
    } catch (e) {
      console.log(`  FAIL  ${pkg}/${f}`);
      console.log(`        code = ${e.code}`);
      console.log(`        msg  = ${String(e.message).split('\n')[0]}`);
      if (missing) console.log(`        ldd  = ${missing.replace(/\n/g, ' | ')}`);
    }
  }
}

console.log('\n=== 再试一次 require("sharp") ===');
try {
  const s = require('sharp');
  console.log('  OK, libvips', s.versions.vips);
} catch (e) {
  console.log('  FAIL:', String(e.message).split('\n')[0]);
}

if (!loadedAny) {
  console.log('\n没有任何 binding 能加载 —— 上面每条 FAIL 的 code/msg 就是真正的原因。');
  process.exit(1);
}
