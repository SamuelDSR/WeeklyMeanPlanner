// 常见商家的预设，主要照着法国这边的日常来。
//
// 目的只有一个：让「加一张卡」变成「点一下商家 -> 扫码 -> 完了」，
// 名字、颜色、常见码制都不用手填。
//
// 不放商标图片：一是版权，二是几十个 logo 图会把安装包撑大，
// 而且离线还得缓存。用品牌色 + 首字母，货架上认卡本来也是先认颜色。
//
// format 只是**预设**，真正的码制以扫出来的为准（扫码器会自己报）。
export const CARD_BRANDS = [
  // 超市 / 食品
  { slug: 'carrefour', name: 'Carrefour', color: '#004E9F', short: 'C', format: 'EAN13', group: 'grocery' },
  { slug: 'leclerc', name: 'E.Leclerc', color: '#0055A4', short: 'L', format: 'EAN13', group: 'grocery' },
  { slug: 'auchan', name: 'Auchan', color: '#E2001A', short: 'A', format: 'EAN13', group: 'grocery' },
  { slug: 'superu', name: 'Super U', color: '#E4032E', short: 'U', format: 'EAN13', group: 'grocery' },
  { slug: 'intermarche', name: 'Intermarché', color: '#E30613', short: 'I', format: 'EAN13', group: 'grocery' },
  { slug: 'lidl', name: 'Lidl', color: '#0050AA', short: 'Li', format: 'EAN13', group: 'grocery' },
  { slug: 'aldi', name: 'Aldi', color: '#00549F', short: 'Al', format: 'EAN13', group: 'grocery' },
  { slug: 'picard', name: 'Picard', color: '#00539F', short: 'P', format: 'EAN13', group: 'grocery' },
  { slug: 'monoprix', name: 'Monoprix', color: '#EE7203', short: 'M', format: 'EAN13', group: 'grocery' },
  { slug: 'franprix', name: 'Franprix', color: '#95C11F', short: 'F', format: 'EAN13', group: 'grocery' },
  { slug: 'casino', name: 'Casino', color: '#E30613', short: 'Ca', format: 'EAN13', group: 'grocery' },
  { slug: 'cora', name: 'Cora', color: '#E30613', short: 'Co', format: 'EAN13', group: 'grocery' },
  { slug: 'biocoop', name: 'Biocoop', color: '#5C9A2E', short: 'B', format: 'EAN13', group: 'grocery' },
  { slug: 'grandfrais', name: 'Grand Frais', color: '#00843D', short: 'GF', format: 'EAN13', group: 'grocery' },

  // 餐饮
  { slug: 'mcdonalds', name: "McDonald's", color: '#FFC72C', short: 'M', format: 'QR', group: 'food' },
  { slug: 'burgerking', name: 'Burger King', color: '#D62300', short: 'BK', format: 'QR', group: 'food' },
  { slug: 'starbucks', name: 'Starbucks', color: '#00704A', short: 'S', format: 'CODE128', group: 'food' },
  { slug: 'paul', name: 'Paul', color: '#1D1D1B', short: 'P', format: 'EAN13', group: 'food' },

  // 家居 / 百货 / 运动
  { slug: 'leroymerlin', name: 'Leroy Merlin', color: '#78BE20', short: 'LM', format: 'EAN13', group: 'home' },
  { slug: 'castorama', name: 'Castorama', color: '#0072CE', short: 'Ct', format: 'EAN13', group: 'home' },
  { slug: 'ikea', name: 'IKEA', color: '#0058A3', short: 'IK', format: 'EAN13', group: 'home' },
  { slug: 'decathlon', name: 'Decathlon', color: '#0082C3', short: 'D', format: 'EAN13', group: 'home' },
  { slug: 'fnac', name: 'Fnac', color: '#E1A81E', short: 'Fn', format: 'EAN13', group: 'home' },
  { slug: 'darty', name: 'Darty', color: '#E2001A', short: 'Da', format: 'EAN13', group: 'home' },
  { slug: 'action', name: 'Action', color: '#0056A4', short: 'Ac', format: 'EAN13', group: 'home' },

  // 药妆 / 加油 / 其它
  { slug: 'sephora', name: 'Sephora', color: '#000000', short: 'Se', format: 'EAN13', group: 'other' },
  { slug: 'yvesrocher', name: 'Yves Rocher', color: '#006F45', short: 'YR', format: 'EAN13', group: 'other' },
  { slug: 'pharmacie', name: 'Pharmacie', color: '#00A94F', short: '✚', format: 'CODE128', group: 'other' },
  { slug: 'total', name: 'TotalEnergies', color: '#ED0000', short: 'T', format: 'EAN13', group: 'other' },
  { slug: 'sncf', name: 'SNCF', color: '#8D1B3D', short: 'SN', format: 'QR', group: 'other' },
];

const BY_SLUG = new Map(CARD_BRANDS.map((b) => [b.slug, b]));

export function findBrand(slug) {
  return BY_SLUG.get(slug) || null;
}

export function isValidBrand(slug) {
  return typeof slug === 'string' && BY_SLUG.has(slug);
}
