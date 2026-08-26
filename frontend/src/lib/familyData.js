// 所有对后端 API 的读写都集中在这里，页面组件只调用这些函数
import { api } from './api';
import { poll } from './poll';

// ---------- 菜品库 ----------

export function subscribeRecipes(callback) {
  return poll(async () => (await api.get('/recipes')).recipes, callback);
}

// 一次性读取某道菜，不订阅。
// 编辑表单只需要在打开的时候把服务器上的值填进去一次：如果这里用轮询订阅，
// 每次刷新（定时 8 秒一次、以及窗口重新获得焦点时）都会把用户还没保存的输入覆盖掉。
export async function fetchRecipe(recipeId) {
  const { recipes } = await api.get('/recipes');
  return recipes.find((r) => r.id === Number(recipeId)) || null;
}

export async function saveRecipe(recipeId, data) {
  if (recipeId) {
    await api.put(`/recipes/${recipeId}`, data);
    return recipeId;
  }
  const { id } = await api.post('/recipes', data);
  return id;
}

export async function deleteRecipe(recipeId) {
  await api.delete(`/recipes/${recipeId}`);
}

// 返回 { photoURL, thumbURL }：服务端会把原图压成主图 + 缩略图两个尺寸
export async function uploadRecipePhoto(file) {
  const formData = new FormData();
  formData.append('photo', file);
  return api.upload('/recipes/upload', formData);
}

// ---------- 本周菜谱 ----------

// options.getVersion 见 poll.js：本地刚改过菜单时，别让轮询的旧数据把改动覆盖掉
// week: 'current' | 'next' —— 具体是哪个周一由服务端按家庭时区算
export function subscribeWeeklyMenu(week, callback, options) {
  return poll(async () => (await api.get(`/menu?week=${week}`)).menu, callback, options);
}

// 只往空格子里填，返回 { menu, addedCount }
export async function generateWeeklyMenu(week) {
  return api.post(`/menu/generate?week=${week}`);
}

// 一顿可以有多道菜：传这一格的完整菜品列表（空数组 = 清空这一格）
export async function updateMenuSlot(date, mealSlot, recipeIds) {
  await api.patch('/menu/slot', { date, mealSlot, recipeIds });
}

// 这一顿改成「出去吃」（或改回在家吃）
export async function setSlotEatOut(date, mealSlot, eatOut) {
  if (eatOut) {
    await api.patch('/menu/slot', { date, mealSlot, eatOut: true });
  } else {
    await api.patch('/menu/slot', { date, mealSlot, recipeIds: [] });
  }
}

// 确认本周菜单：「这周就这么吃」，确认过的周进历史
export async function confirmMenu(week) {
  return api.post(`/menu/confirm?week=${week}`);
}

// 取消确认：把这一周从历史里撤下来（撤下来之后才能重新自动排菜）
export async function unconfirmMenu(week) {
  return api.post(`/menu/unconfirm?week=${week}`);
}

// 改完菜单立刻重新拉一次：备餐份数是服务端算的，本地没法凭空更新
export async function fetchWeeklyMenu(week) {
  return (await api.get(`/menu?week=${week}`)).menu;
}

// 过去几周吃了什么 + 汇总统计
export async function fetchHistory(weeks) {
  return api.get(weeks ? `/history?weeks=${weeks}` : '/history');
}

// 给「某一顿」打喜好分。传 null 表示清掉这一顿的单独评分，回到菜谱上的默认值。
export async function rateMeal(slotId, likeScore) {
  return api.patch(`/history/meals/${slotId}/like`, { likeScore });
}

// ---------- 购物清单 ----------

export function subscribeShoppingList(week, callback, options) {
  return poll(async () => (await api.get(`/shopping?week=${week}`)).list, callback, options);
}

export async function generateShoppingList(week) {
  return api.post(`/shopping/generate?week=${week}`); // 返回 { list, missingDishNames }
}

export async function toggleShoppingItem(itemId) {
  return api.patch(`/shopping/item/${itemId}/toggle`);
}

// ---------- 主食（米饭 / 面条 / 意面…）----------

// 返回 { staples, settings: { defaultStapleId, stapleMeals } }
export async function fetchStaples() {
  return api.get('/staples');
}

export async function createStaple(data) {
  return api.post('/staples', data);
}

export async function updateStaple(id, patch) {
  return api.patch(`/staples/${id}`, patch);
}

export async function deleteStaple(id) {
  return api.delete(`/staples/${id}`);
}

// { defaultStapleId?, stapleMeals? }
export async function updateStapleSettings(patch) {
  return api.patch('/staples/settings', patch);
}

// 改某一顿的主食。mode: 'set' | 'none' | 'reset'
//   set    这一顿吃指定的主食
//   none   这一顿不要主食
//   reset  回到跟着家庭默认走
export async function setMealStaple(date, mealSlot, mode, stapleId) {
  const body = { date, mealSlot };
  if (mode === 'none') body.none = true;
  else if (mode === 'reset') body.reset = true;
  else body.stapleId = stapleId;
  await api.patch('/menu/staple', body);
}

// ---------- 用大模型录菜谱 ----------

// 这个功能有没有配置好（没配 LLM_API_KEY 就不显示入口）
export async function fetchImportStatus() {
  return api.get('/recipes/import/status');
}

// 从一段文字或一个网址解析出菜谱草稿。只是预填表单，不落库。
export async function importRecipeDraft({ text, url }) {
  return api.post('/recipes/import', url ? { url } : { text });
}

// 「自己去问，把 JSON 贴回来」用的提示词（和服务端调模型时用的是同一份 schema）
export async function fetchImportPrompt() {
  return (await api.get('/recipes/import/prompt')).prompt;
}

// 把粘贴进来的 JSON 清洗成表单草稿。不需要配置 LLM_API_KEY。
export async function importRecipeFromJson(json) {
  return api.post('/recipes/import/paste', { json });
}
