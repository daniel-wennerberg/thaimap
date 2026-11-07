import { defineConfig } from 'vite';

// `npm run dev` serves the app with hot reload and proxies the family API to the Node server (npm run server).
export default defineConfig({
  base: './', // works at / (Node server) and at /thaimap/ (GitHub Pages)
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
  build: { outDir: 'dist', sourcemap: true },
});
