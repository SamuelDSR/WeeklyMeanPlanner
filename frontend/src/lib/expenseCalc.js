// 记账小键盘上的加减。
//
// 「早餐 21 + 午餐 35」这种是记账时最常见的动作 —— 先算再记等于多按一次计算器。
//
// 绝不用 eval / new Function：这串东西来自输入框，虽然是本地的，
// 但把用户输入当代码执行是不该开的头。只有 + 和 −，自己扫一遍就够了。
const MAX = 1e9;

// 把表达式切成 [数字, 运算符, 数字, ...]
function tokenize(expr) {
  const tokens = [];
  let current = '';
  for (const ch of String(expr)) {
    if (ch === '+' || ch === '-') {
      // 开头的负号属于第一个数字，不是运算符
      if (current === '' && tokens.length === 0 && ch === '-') {
        current = '-';
        continue;
      }
      if (current === '' || current === '-') return null; // 连着两个运算符
      tokens.push(current, ch);
      current = '';
    } else if (ch >= '0' && ch <= '9') {
      current += ch;
    } else if (ch === '.') {
      if (current.includes('.')) return null; // 一个数里两个小数点
      current += current === '' || current === '-' ? '0.' : '.';
    } else if (ch === ' ') {
      // 忽略空格
    } else {
      return null; // 出现了不认识的字符
    }
  }
  if (current === '' || current === '-') return null; // 以运算符结尾
  tokens.push(current);
  return tokens;
}

// 算出结果；算不出来返回 null。只有加减，从左往右扫一遍即可。
export function evaluateExpression(expr) {
  const raw = String(expr ?? '').trim().replace(/,/g, '.');
  if (!raw) return null;
  const tokens = tokenize(raw);
  if (!tokens) return null;

  let total = Number(tokens[0]);
  if (!Number.isFinite(total)) return null;
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = Number(tokens[i + 1]);
    if (!Number.isFinite(n)) return null;
    total = op === '+' ? total + n : total - n;
  }
  if (!Number.isFinite(total) || Math.abs(total) > MAX) return null;
  // 浮点：0.1+0.2 得收一下
  return Math.round(total * 100) / 100;
}

// 表达式里有没有运算符（决定要不要在旁边显示「= 结果」）
export function hasOperator(expr) {
  return /\d\s*[+-]/.test(String(expr ?? ''));
}

// 按一个键，返回新的表达式字符串。
// 所有「能不能按」的判断都收在这里，界面只管把键画出来。
export function pressKey(expr, key) {
  const s = String(expr ?? '');

  if (key === 'back') return s.slice(0, -1);
  if (key === 'clear') return '';

  if (key === '+' || key === '-') {
    if (s === '') return key === '-' ? '-' : ''; // 允许以负号开头
    if (/[+\-.]$/.test(s)) return s.slice(0, -1) + key; // 换掉末尾的运算符
    return s + key;
  }

  if (key === '.') {
    if (s === '' || /[+-]$/.test(s)) return `${s}0.`;
    // 当前这一段数字里已经有小数点了就不再加
    const lastNumber = s.split(/[+-]/).pop();
    if (lastNumber.includes('.')) return s;
    return s + '.';
  }

  if (key >= '0' && key <= '9') {
    // 小数点后最多两位 —— 记账没有第三位小数，早点拦住比事后四舍五入好
    const lastNumber = s.split(/[+-]/).pop();
    if (lastNumber.includes('.') && lastNumber.split('.')[1].length >= 2) return s;
    // 不允许 007 这种前导零
    if (lastNumber === '0') return s.slice(0, -1) + key;
    return s + key;
  }

  return s;
}
