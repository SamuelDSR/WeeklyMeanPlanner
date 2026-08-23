// 这些中文是**数据**，不是界面文案：菜品分类、食材分类、餐次、单位都存在数据库里
// （menu_slots.meal_slot、recipes.category、ingredients.unit …）。
//
// 所以翻译只发生在"显示"这一层：库里永远存中文，切语言不会改动任何数据，
// 家人各用各的语言也不会打架。认不出来的值（用户自己打的单位）原样显示。
// 早餐已经不排了（见迁移 012），但译名留着：
// 老库里归档过的早餐记录在历史页还要显示，餐次名是跟着数据走的
const MEALS = {
  早餐: { en: 'Breakfast', fr: 'Petit-déj.' },
  午餐: { en: 'Lunch', fr: 'Déjeuner' },
  晚餐: { en: 'Dinner', fr: 'Dîner' },
};

const RECIPE_CATEGORIES = {
  全部: { en: 'All', fr: 'Tout' },
  蔬菜: { en: 'Vegetables', fr: 'Légumes' },
  水果: { en: 'Fruit', fr: 'Fruits' },
  肉类: { en: 'Meat', fr: 'Viande' },
  鱼类: { en: 'Fish', fr: 'Poisson' },
  蛋奶豆制品: { en: 'Eggs & dairy', fr: 'Œufs & laitier' },
  主食: { en: 'Staples', fr: 'Féculents' },
  汤羹: { en: 'Soup', fr: 'Soupe' },
};

const INGREDIENT_CATEGORIES = {
  蔬菜类: { en: 'Vegetables', fr: 'Légumes' },
  水果类: { en: 'Fruit', fr: 'Fruits' },
  肉禽类: { en: 'Meat & poultry', fr: 'Viande & volaille' },
  水产类: { en: 'Fish & seafood', fr: 'Poisson & fruits de mer' },
  蛋奶类: { en: 'Eggs & dairy', fr: 'Œufs & laitier' },
  干货粮油: { en: 'Dry goods & oils', fr: 'Épicerie & huiles' },
  调料: { en: 'Seasoning', fr: 'Condiments' },
  其他: { en: 'Other', fr: 'Autre' },
};

// 主食名：家庭自己建的（staples.name），常见的几个给个译名，
// 自己新增的名字认不出来就原样显示
const STAPLES = {
  米饭: { en: 'Rice', fr: 'Riz' },
  面条: { en: 'Noodles', fr: 'Nouilles' },
  意面: { en: 'Pasta', fr: 'Pâtes' },
  馒头: { en: 'Steamed bun', fr: 'Pain vapeur' },
  米粉: { en: 'Rice noodles', fr: 'Nouilles de riz' },
  面包: { en: 'Bread', fr: 'Pain' },
  土豆: { en: 'Potatoes', fr: 'Pommes de terre' },
  玉米: { en: 'Corn', fr: 'Maïs' },
  藜麦: { en: 'Quinoa', fr: 'Quinoa' },
  粥: { en: 'Congee', fr: 'Congee' },
};

// 单位：g/kg/ml/L 各语言一样，不用翻；中文特有的和"适量"这类要翻
const UNITS = {
  斤: { en: 'jin (500g)', fr: 'jin (500g)' },
  两: { en: 'liang (50g)', fr: 'liang (50g)' },
  个: { en: 'pc', fr: 'pce' },
  只: { en: 'whole', fr: 'pièce' },
  颗: { en: 'pc', fr: 'pce' },
  根: { en: 'stalk', fr: 'brin' },
  片: { en: 'slice', fr: 'tranche' },
  块: { en: 'piece', fr: 'morceau' },
  条: { en: 'strip', fr: 'filet' },
  瓣: { en: 'clove', fr: 'gousse' },
  把: { en: 'bunch', fr: 'botte' },
  张: { en: 'sheet', fr: 'feuille' },
  勺: { en: 'spoon', fr: 'cuillère' },
  汤匙: { en: 'tbsp', fr: 'c. à soupe' },
  茶匙: { en: 'tsp', fr: 'c. à café' },
  杯: { en: 'cup', fr: 'tasse' },
  瓶: { en: 'bottle', fr: 'bouteille' },
  罐: { en: 'can', fr: 'boîte' },
  盒: { en: 'box', fr: 'barquette' },
  袋: { en: 'bag', fr: 'sachet' },
  包: { en: 'pack', fr: 'paquet' },
  份: { en: 'serving', fr: 'portion' },
  适量: { en: 'to taste', fr: 'selon goût' },
  少许: { en: 'a pinch', fr: 'une pincée' },
};

const UNIT_GROUPS = {
  质量: { en: 'Weight', fr: 'Poids' },
  体积: { en: 'Volume', fr: 'Volume' },
  数量: { en: 'Count', fr: 'Quantité' },
  '容器 / 器具': { en: 'Containers', fr: 'Contenants' },
  不计量: { en: 'Unmeasured', fr: 'Non mesuré' },
};

const TABLES = {
  staple: STAPLES,
  meal: MEALS,
  recipeCategory: RECIPE_CATEGORIES,
  ingredientCategory: INGREDIENT_CATEGORIES,
  unit: UNITS,
  unitGroup: UNIT_GROUPS,
};

// kind: staple | meal | recipeCategory | ingredientCategory | unit | unitGroup
export function domainLabel(locale, kind, value) {
  if (!value) return value ?? '';
  if (locale === 'zh') return value;
  return TABLES[kind]?.[value]?.[locale] ?? value;
}
