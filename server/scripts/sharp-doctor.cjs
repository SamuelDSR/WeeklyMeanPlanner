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
console.log('cpu model   ', sh("grep -m1 'model name' /proc/cpuinfo").replace(/^.*:\s*/, '') || '(读不到)');

// sharp >= 0.33 的 Linux x64 预编译库要求 x86-64-v2 微架构。
// CPU 太老（很多 NAS 上的 Atom / 老 Celeron）就用不了 —— 这时 binding 能加载，
// 但 sharp 会主动把它扔掉（见 sharp.cjs 里 _isUsingX64V2 那一段）。
const V2_FLAGS = ['cx16', 'popcnt', 'sse3', 'ssse3', 'sse4_1', 'sse4_2'];
if (process.arch === 'x64') {
  const flags = sh("grep -m1 '^flags' /proc/cpuinfo");
  if (flags && flags !== '(n/a)') {
    const have = V2_FLAGS.filter((f) => new RegExp(`\\b${f}\\b`).test(flags));
    const missing = V2_FLAGS.filter((f) => !have.includes(f));
    console.log('x86-64-v2   ', missing.length === 0
      ? '满足 (' + have.join(' ') + ')'
      : '**不满足**，缺: ' + missing.join(' ') + '  <- sharp 的预编译库跑不了');
    // 虚拟机里最常见的原因不是 CPU 老，而是**虚拟机把 CPU 特性屏蔽了**：
    // Proxmox 默认的 kvm64 就不暴露 SSE4.2，宿主机再新也没用。
    if (missing.length > 0) {
      const model = sh("grep -m1 'model name' /proc/cpuinfo");
      const virt = /QEMU|KVM|Virtual|Common/i.test(model);
      console.log('              ',
        virt
          ? '看着像虚拟机的通用 CPU 型号 -> 大概率是虚拟机的 CPU type 设成了 kvm64 之类，'
            + '把真实 CPU 特性屏蔽掉了。改成 host / x86-64-v2-AES 再关机重启即可。'
          : '不像虚拟化的通用型号 -> 可能真的是老 CPU（Atom / 老 Celeron）。');
    }
  } else {
    console.log('x86-64-v2   ', '(读不到 /proc/cpuinfo)');
  }
}

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

// 直接问 binding 自己：CPU 够不够 v2
console.log('\n=== binding 自报 CPU 支持情况 ===');
for (const pkg of ['sharp-linux-x64', 'sharp-linuxmusl-x64']) {
  const libdir = path.join(dir, pkg, 'lib');
  if (!fs.existsSync(libdir)) continue;
  for (const f of fs.readdirSync(libdir).filter((n) => n.endsWith('.node'))) {
    try {
      const b = require(path.join(libdir, f));
      if (typeof b._isUsingX64V2 === 'function') {
        const ok = b._isUsingX64V2();
        console.log(`  ${pkg}: _isUsingX64V2() = ${ok}${ok ? '' : '   <- 就是这里！sharp 会因此拒绝使用它'}`);
      }
    } catch {
      // 上面已经报过加载失败了
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
