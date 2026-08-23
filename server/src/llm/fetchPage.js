// 把一个菜谱网址抓成纯文本，喂给大模型。
//
// 这是「服务器替用户去访问一个任意 URL」，也就是标准的 SSRF 场景：
// 不设防的话，别人可以让我们的容器去访问内网 —— 数据库、Portainer、
// 云厂商的 169.254.169.254 元数据接口（那里能拿到凭证）。
//
// 所以每一跳都要重新检查：
//   1. 只允许 http / https
//   2. 域名解析出来的 IP 不能是内网 / 环回 / 链路本地 / 组播
//   3. 重定向手动跟（fetch 自动跟的话，第二跳就绕过上面的检查了）
//   4. 超时、大小上限、只接受 html/纯文本
import dns from 'dns/promises';
import net from 'net';

const TIMEOUT_MS = 12000;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_REDIRECTS = 3;
const MAX_TEXT_CHARS = 40000; // 再长就没必要喂给模型了

// IPv6 展开成 8 个 16 位分组。'::' 的省略段补零。
// 结尾写成点分十进制的（::ffff:8.8.8.8）先换算成两个 16 位分组，
// 否则 parseInt('8.8.8.8', 16) 会悄悄得到 8，判断就全错了。
function expandIpv6(raw) {
  let ip = raw;
  const dotted = ip.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const [, prefix, a, b, c, d] = dotted;
    const octets = [a, b, c, d].map(Number);
    if (octets.some((o) => o > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    ip = `${prefix}${hi}:${lo}`;
  }
  const [head, tail] = ip.split('::');
  const headParts = head ? head.split(':').filter(Boolean) : [];
  const tailParts = tail !== undefined && tail ? tail.split(':').filter(Boolean) : [];
  if (tail === undefined && headParts.length !== 8) return null;
  const fill = 8 - headParts.length - tailParts.length;
  if (fill < 0) return null;
  const groups = [...headParts, ...Array(fill).fill('0'), ...tailParts];
  return groups.map((g) => parseInt(g, 16));
}

// IPv6 里嵌着 IPv4 的话，把那个 IPv4 抠出来。
//
// 这一步是必须的：URL 解析器会把 http://[::ffff:127.0.0.1] 规范化成
// ::ffff:7f00:1 —— 十六进制形式，看着完全不像 127.0.0.1，
// 但连过去就是本机。只按字符串前缀判断会被这一手绕过去。
function embeddedIpv4(groups) {
  // 前 80 位为 0，第 6 组是 0x0000（IPv4 兼容）或 0xffff（IPv4 映射）
  const prefixZero = groups.slice(0, 5).every((g) => g === 0);
  if (!prefixZero) return null;
  if (groups[5] !== 0xffff && groups[5] !== 0) return null;
  // 全零（:: 本身）和 ::1 交给调用方按 IPv6 处理，别误判成 0.0.0.0
  if (groups[5] === 0 && groups[6] === 0 && groups[7] <= 1) return null;
  const [a, b] = [groups[6], groups[7]];
  return [a >> 8, a & 0xff, b >> 8, b & 0xff].join('.');
}

// 私有 / 保留网段。IPv4 和 IPv6 都要拦。
function isBlockedIp(ip) {
  const type = net.isIP(ip);
  if (type === 0) return true; // 解析不出来就当不安全

  if (type === 4) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;        // 本机 / 私有
    if (p[0] === 169 && p[1] === 254) return true;                     // 链路本地（云元数据）
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;         // 私有
    if (p[0] === 192 && p[1] === 168) return true;                     // 私有
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;        // 运营商级 NAT
    if (p[0] >= 224) return true;                                      // 组播 / 保留
    return false;
  }

  const groups = expandIpv6(ip.toLowerCase());
  if (!groups) return true;

  // 先看有没有嵌 IPv4（::ffff:7f00:1 就是 127.0.0.1）
  const mapped = embeddedIpv4(groups);
  if (mapped) return isBlockedIp(mapped);

  const [g0] = groups;
  if (groups.every((g) => g === 0)) return true;                       // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  if ((g0 & 0xffc0) === 0xfe80) return true;                           // fe80::/10 链路本地
  if ((g0 & 0xfe00) === 0xfc00) return true;                           // fc00::/7  唯一本地
  if ((g0 & 0xff00) === 0xff00) return true;                           // ff00::/8  组播
  return false;
}

async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('网址格式不对');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只支持 http / https 网址');
  }
  // 网址里直接写 IP 的（http://10.0.0.1、http://[::1]）不用查 DNS，直接判。
  // 交给 dns.lookup 的话，各平台对 IP 字面量的处理不一致，行为不好预测。
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(literal)) {
    if (isBlockedIp(literal)) throw new Error('这个网址指向内网地址，不能访问');
    return url;
  }

  // 域名可能同时解析出多个地址，有一个是内网就拒
  let addrs;
  try {
    addrs = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new Error('这个域名解析不了');
  }
  if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) {
    throw new Error('这个网址指向内网地址，不能访问');
  }
  return url;
}

// 读 body，超过上限就掐断（不能只信 content-length，它可以撒谎）
async function readCapped(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error('这个网页太大了');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchPageText(rawUrl) {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertSafeUrl(current); // 每一跳都查
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        redirect: 'manual', // 自己跟，才能逐跳检查
        signal: controller.signal,
        headers: {
          // 有些站点不给无 UA 的请求返回内容
          'User-Agent': 'Mozilla/5.0 (compatible; MealPlanner/1.0; +self-hosted)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
          'Accept-Language': 'zh,en,fr;q=0.8',
        },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error('抓这个网页超时了');
      throw new Error(`抓不到这个网页：${err.message}`);
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('这个网址重定向到了空地址');
      current = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new Error(`这个网页返回了 ${response.status}`);

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('html') && !contentType.includes('text/plain') && contentType) {
      throw new Error('这个网址不是网页（可能是图片或视频），试试直接把菜谱文字贴进来');
    }

    return { text: htmlToText(await readCapped(response)), finalUrl: url.toString() };
  }

  throw new Error('这个网址重定向太多次了');
}

// 极简 HTML -> 文本。不追求完美，只要把菜谱的字留下来给模型看。
export function htmlToText(html) {
  const text = String(html)
    // script/style/noscript 里的东西对模型是纯噪音
    .replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // 换行类标签转成真的换行，配料表的结构才留得住
    .replace(/<\/(p|div|tr|h[1-6]|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();

  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
}

export const __test = { isBlockedIp };
