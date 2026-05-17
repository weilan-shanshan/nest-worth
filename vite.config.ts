import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Nestworth · 净值',
        short_name: 'Nestworth',
        description: '把分散在各 App 的资产汇成一处可视画面 · 100% 本地 · 推理 AI · 多模型交叉',
        theme_color: '#2E9E60',
        background_color: '#EFF6F1',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'zh-CN',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // 字体 - 长期缓存
            urlPattern: /^https:\/\/fonts\.bunny\.net\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // 加密货币行情 - 短期缓存（30 分钟）
            urlPattern: /^https:\/\/api\.coingecko\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'coingecko',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // 汇率 API - 短期缓存
            urlPattern: /^https:\/\/(?:open\.er-api\.com|api\.frankfurter\.app|api\.exchangerate-api\.com)\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'fx-rates',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // LLM 调用永远不缓存（每次必新鲜）
            urlPattern: /^https:\/\/dashscope\.aliyuncs\.com\/.*/,
            handler: 'NetworkOnly'
          }
        ]
      },
      devOptions: {
        enabled: false   // dev 不启 SW，避免缓存调试麻烦
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173
  }
});
