import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  server: {
    // 本地开发：前端跑在 :5173，后端跑在 :3000，用 Vite 的代理把 /api 和 /uploads
    // 转发过去，这样前端代码里始终用相对路径 /api/... 就行，不用区分开发/生产环境
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: '持家',
        short_name: '持家',
        description: '一家人的日子：排菜单、算开销、共享会员卡',
        theme_color: '#2C4A6B',
        background_color: '#EEF1EF',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // injectManifest：SW 由我们自己写（src/sw.js），构建时把预缓存清单注进去。
      // 换成自定义 SW 的唯一原因是要处理 push / notificationclick —— 自动生成的做不到。
      // 运行时缓存策略搬到了 src/sw.js 里，注释也在那边。
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
});
