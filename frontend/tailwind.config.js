/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        porcelain: '#EEF1EF', // 瓷白背景
        ink: '#22302B',       // 墨色正文
        indigo: {
          DEFAULT: '#2C4A6B', // 青花蓝：主品牌色
          dark: '#1D3450',
          light: '#4A6E93',
        },
        persimmon: '#C1442D', // 印章红：强调/操作色
        wheat: '#C99A3E',     // 谷物金：标签/次要强调
        mist: '#DCE3DE',      // 卡片/分隔背景
        matcha: '#5C8A5A',    // 抹茶绿：健康分
      },
      fontFamily: {
        display: ['"Noto Serif SC"', 'serif'],
        sans: ['"Noto Sans SC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(34,48,43,0.06), 0 1px 12px rgba(34,48,43,0.05)',
      },
      keyframes: {
        stamp: {
          '0%': { transform: 'scale(2.2) rotate(-18deg)', opacity: '0' },
          '60%': { transform: 'scale(0.92) rotate(-10deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(-10deg)', opacity: '1' },
        },
      },
      animation: {
        stamp: 'stamp 220ms ease-out forwards',
      },
    },
  },
  plugins: [],
};
