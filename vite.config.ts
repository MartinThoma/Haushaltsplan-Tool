/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { budgetData } from './vite-plugins/budgetData.ts';

export default defineConfig({
  // Relative base so the build works on any static host and sub-path.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    budgetData(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        globIgnores: ['data/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('/data/kommunen.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'budget-index' },
          },
          {
            urlPattern: ({ url }) => /\/data\/.+\.json$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'budget-data' },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
