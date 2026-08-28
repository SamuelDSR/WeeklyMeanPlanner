// 只跟这台设备有关的偏好，存 localStorage，不上服务器。
//
// 判断标准是「换一台设备还该不该跟着走」：
//   语言、卡片是否自动横屏 -> 跟设备（手上这台横过来顺手，平板未必）
//   家庭人数、默认货币     -> 跟家庭，存数据库
const PREFIX = 'meal-planner:';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    // 隐私模式下 localStorage 可能整个不可用
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 存不下就算了，下次打开退回默认值，不该因此报错
  }
}

// 打开会员卡时是否自动横过来。一维码横着能长一倍多，但不是人人都习惯。
export const cardLandscape = {
  get: () => read('cardLandscape', true),
  set: (v) => write('cardLandscape', !!v),
};
