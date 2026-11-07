import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const DAY = 24 * 3600;

// `npm run dev` serves the app with hot reload and proxies the family API to the Node server (npm run server).
export default defineConfig({
  base: './', // works at / (Node server) and at /thaimap/ (GitHub Pages)
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: true },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registered from src/ui/pwa.ts so we can show "new version" / "ready offline"
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ThaiMap – Family Trip Planner',
        short_name: 'ThaiMap',
        description: 'Map-first Thailand trip planner for the whole family: places, day plans, flights, meetups.',
        lang: 'en',
        theme_color: '#0a0c0f',
        background_color: '#0a0c0f',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        categories: ['travel', 'navigation'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // family API: always live (the store keeps its own on-device snapshot + offline queue)
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            // map tiles you have looked at stay available offline
            urlPattern: /^https:\/\/(server\.arcgisonline\.com|tile\.openstreetmap\.org|[abc]\.tile\.opentopomap\.org)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * DAY, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/unpkg\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'cdn', expiration: { maxEntries: 20, maxAgeSeconds: 365 * DAY }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'font-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 365 * DAY }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
