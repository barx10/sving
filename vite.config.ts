import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Sving – norsk MC-turplanlegger',
        short_name: 'Sving',
        description: 'Planlegg svingete og naturskjønne MC-turer i Norge',
        lang: 'no',
        theme_color: '#2D332A',
        background_color: '#F4F4EF',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Riders lose coverage exactly where the good roads are. Tiles they have
        // already looked at stay available offline, which is the difference
        // between a usable map on a mountain pass and a blank grey grid.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname.endsWith('basemaps.cartocdn.com') ||
              url.hostname.endsWith('cache.kartverket.no'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 1500, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Seasonal pass status is worth showing stale rather than not at all.
            urlPattern: ({ url }) => url.pathname === '/api/hazards',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'hazards',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    // Set DISABLE_HMR=true to turn off hot reload and file watching, which some
    // hosted editors need to avoid reload loops while files are being written.
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
