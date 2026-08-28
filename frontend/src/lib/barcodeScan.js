// 用摄像头扫会员卡上的条码。
//
// 两条路：
//   1. 浏览器自带 BarcodeDetector（Chrome / Android）—— 快，而且不用下载任何东西
//   2. 没有就按需加载 zxing 的 wasm 解码器（iOS Safari 到现在都没有这个 API）
//
// wasm **必须从我们自己的服务器上取**：zxing-wasm 默认去 jsDelivr 拿，
// 那样一来装成 App 之后没网就扫不了，而且这是个自建应用，不该偷偷依赖外部 CDN。
// 用 vite 的 ?url 把它打进产物里，路径自己指过去。

// 我们支持的码格式 <-> 检测器返回的名字
const FROM_DETECTOR = {
  ean_13: 'EAN13',
  ean_8: 'EAN8',
  upc_a: 'UPC',
  upc_e: 'UPC',
  code_128: 'CODE128',
  code_39: 'CODE39',
  itf: 'ITF',
  qr_code: 'QR',
  pdf417: 'PDF417',
};

// 交给检测器的格式白名单：只找我们画得出来的，找得更快也更少认错
const WANTED = Object.keys(FROM_DETECTOR);

// 这几个是**必须**能扫的，法国这边的会员卡基本都在里面。
// 原生少了其中任何一个就退到 wasm；
// 而 upc_a 这类（美国零售用得多、这边少见）缺了就缺了，
// 不值得为它让每个人多下 1 MB。
const REQUIRED = ['ean_13', 'ean_8', 'code_128', 'code_39', 'itf', 'qr_code', 'pdf417'];

let detectorPromise = null;

export function hasNativeDetector() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

// 原生检测器认不认得全我们要的格式（认不全就得下载 wasm）。
// 界面上用它来提示「第一次扫要多等几秒」。
export async function nativeCoversAll() {
  if (!hasNativeDetector()) return false;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    return REQUIRED.every((f) => supported.includes(f));
  } catch {
    return false;
  }
}

// 摄像头只在安全上下文（https / localhost）里能用。
// 从局域网 IP 用明文 http 打开时 getUserMedia 根本不存在 —— 得早点告诉用户，
// 而不是让他点了按钮之后对着一片黑。
export function cameraAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

async function loadDetector() {
  if (hasNativeDetector()) {
    // 构造器传了平台不支持的格式会直接抛 NotSupportedError，所以先问一遍。
    // 各家实现支持的格式并不一样（PDF417 尤其参差），不能想当然。
    let supported = [];
    try {
      supported = await window.BarcodeDetector.getSupportedFormats();
    } catch {
      supported = [];
    }
    const usable = WANTED.filter((f) => supported.includes(f));
    // 必需的格式都在就用原生（零下载），能多认几个是几个。
    // 缺了必需的（常见是 PDF417）才退到 wasm —— 缺的往往正是用户要扫的那张。
    if (REQUIRED.every((f) => supported.includes(f))) {
      return new window.BarcodeDetector({ formats: usable });
    }
  }
  // 按需加载：1 MB 的 wasm 不该让每个人在打开应用时就下载
  const [{ BarcodeDetector, setZXingModuleOverrides }, wasmUrl] = await Promise.all([
    import('barcode-detector/pure'),
    import('zxing-wasm/reader/zxing_reader.wasm?url').then((m) => m.default),
  ]);
  // 关键一步：指到我们自己服务器上的那份，不走 CDN
  setZXingModuleOverrides({ locateFile: (path) => (path.endsWith('.wasm') ? wasmUrl : path) });
  return new BarcodeDetector({ formats: WANTED });
}

export function getDetector() {
  if (!detectorPromise) detectorPromise = loadDetector();
  return detectorPromise;
}

// 把检测结果整理成我们要的形状；认不出格式的按 CODE128 处理（它什么都能编）
function toResult(barcode) {
  if (!barcode?.rawValue) return null;
  return {
    code: String(barcode.rawValue).trim(),
    format: FROM_DETECTOR[barcode.format] || 'CODE128',
    detectedAs: barcode.format,
  };
}

// 从一帧视频里找码。找不到返回 null（正常，下一帧继续）
export async function detectFromSource(source) {
  const detector = await getDetector();
  const found = await detector.detect(source);
  return found?.length ? toResult(found[0]) : null;
}

// 从一张图片文件里找码 —— 相机权限给不了、或者卡的照片已经在相册里时用这条路
export async function detectFromFile(file) {
  const bitmap = await createImageBitmap(file);
  try {
    return await detectFromSource(bitmap);
  } finally {
    bitmap.close?.();
  }
}
