// 餐次是**数据**：库里存的就是这几个中文值（menu_slots.meal_slot）。
// 显示时用 i18n/domain.js 里的 domainLabel(locale, 'meal', ...) 翻译。
// 只排午饭和晚饭：早饭各人各吃。要跟后端 server/src/recommend.js 保持一致。
export const MEAL_SLOTS = ['午餐', '晚餐'];
