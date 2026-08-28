// 会员卡的码格式。
//
// 只放我们**能画出来**的格式（前端用 JsBarcode / qrcode 渲染），
// 而且每种都要校验：码错了在收银台扫不出来，比没有还尴尬。
export const CARD_FORMATS = [
  { value: 'CODE128', label: 'Code 128', kind: '1d' }, // 最通用，什么字符都能编
  { value: 'EAN13', label: 'EAN-13', kind: '1d', digits: 13 },
  { value: 'EAN8', label: 'EAN-8', kind: '1d', digits: 8 },
  { value: 'UPC', label: 'UPC-A', kind: '1d', digits: 12 },
  { value: 'CODE39', label: 'Code 39', kind: '1d' },
  { value: 'ITF', label: 'ITF', kind: '1d' },
  { value: 'QR', label: 'QR', kind: '2d' },
  // PDF417：堆叠式二维码，又宽又扁。法国这边有些会员卡、驾照、登机牌用它。
  { value: 'PDF417', label: 'PDF417', kind: '2d' },
];

const BY_VALUE = new Map(CARD_FORMATS.map((f) => [f.value, f]));

export function isValidFormat(format) {
  return BY_VALUE.has(format);
}

// EAN/UPC 的最后一位是校验位，算错了扫码枪直接不认。
// 这里只做校验、不自动改用户输入 —— 悄悄改数字比报错更糟。
export function ean13CheckDigit(digits12) {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function ean8CheckDigit(digits7) {
  let sum = 0;
  for (let i = 0; i < 7; i += 1) {
    sum += Number(digits7[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function upcCheckDigit(digits11) {
  let sum = 0;
  for (let i = 0; i < 11; i += 1) {
    sum += Number(digits11[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

const CODE39_CHARS = /^[0-9A-Z\-. $/+%]*$/;

// 返回 { error } 或 { value: 规范化后的码 }
export function validateCode(code, format) {
  const raw = String(code ?? '').trim();
  if (!raw) return { error: '卡号不能为空' };
  if (raw.length > 512) return { error: '卡号太长了' };
  if (!isValidFormat(format)) return { error: '不认识这个码的格式' };

  // QR 和 PDF417 都是二维码，容量大、什么都能装（网址、会员号、一串 JSON）
  if (format === 'QR' || format === 'PDF417') return { value: raw };

  // 1D 码不允许出现空白：扫码枪读不出来，而且常常是复制粘贴带进来的
  const compact = raw.replace(/\s/g, '');

  if (format === 'CODE128') {
    // Code128 能编 ASCII 32-126，超出范围的画不出来
    if (!/^[\x20-\x7e]+$/.test(compact)) return { error: 'Code 128 只支持普通 ASCII 字符' };
    return { value: compact };
  }

  if (format === 'CODE39') {
    const upper = compact.toUpperCase();
    if (!CODE39_CHARS.test(upper)) {
      return { error: 'Code 39 只支持数字、大写字母和 - . $ / + % 空格' };
    }
    return { value: upper };
  }

  if (format === 'ITF') {
    if (!/^\d+$/.test(compact)) return { error: 'ITF 只能是数字' };
    // ITF 必须是偶数位（两位一组编码）
    if (compact.length % 2 !== 0) return { error: 'ITF 的位数必须是偶数' };
    return { value: compact };
  }

  // 剩下是定长数字码，还要验校验位
  const spec = BY_VALUE.get(format);
  if (!/^\d+$/.test(compact)) return { error: `${spec.label} 只能是数字` };
  if (compact.length !== spec.digits) {
    return { error: `${spec.label} 要 ${spec.digits} 位数字，你输入了 ${compact.length} 位` };
  }

  const body = compact.slice(0, -1);
  const given = Number(compact.slice(-1));
  const expected =
    format === 'EAN13' ? ean13CheckDigit(body)
    : format === 'EAN8' ? ean8CheckDigit(body)
    : upcCheckDigit(body);

  if (given !== expected) {
    return {
      error: `${spec.label} 校验位不对（最后一位应该是 ${expected}）。核对一下卡上的数字，或者改用 Code 128。`,
    };
  }
  return { value: compact };
}
