import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { banner } from './tools/banner.js';

// Print one clear "open this" box once Vite is listening (the API process only prints a one-liner in dev).
const strataBanner = () => ({
  name: 'strata-banner',
  configureServer(server) {
    server.httpServer?.once('listening', () => setTimeout(() => {
      const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${server.config.server.port}/`;
      console.log(banner(['Strata is running (development)', '', `Open the app:   ${url.replace(/\/$/, '')}`, 'API (no UI):    http://localhost:3001', '', 'Press Ctrl+C to stop']));
    }, 150));
  },
});

// The server refuses state-changing requests whose Origin is another site. Behind the dev proxy the browser's Origin is Vite's
// port, so present the request as coming from the API's own origin (Host is rewritten by changeOrigin).
const target = 'http://localhost:3001';
const api = {
  target,
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('proxyReq', (req) => req.getHeader('origin') && req.setHeader('origin', target));
    proxy.on('proxyReqWs', (req) => req.getHeader('origin') && req.setHeader('origin', target));
  },
};

export default defineConfig({
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') },
  plugins: [react(), tailwindcss(), strataBanner()],
  resolve: { alias: { '@': fileURLToPath(new URL('./client/src', import.meta.url)) } },
  server: { port: 5173, proxy: { '/api': api, '/hubs': { ...api, ws: true } } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
