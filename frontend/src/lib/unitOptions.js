// 单位列表是一份静态数据，整个会话只取一次就够了
import { api } from './api';

let pending;

export function fetchUnitGroups() {
  if (!pending) {
    pending = api
      .get('/units')
      .then((data) => data.unitGroups || [])
      .catch((err) => {
        pending = undefined; // 失败了别把错误缓存住，下次再试
        throw err;
      });
  }
  return pending;
}
