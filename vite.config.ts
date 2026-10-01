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
      // Registered in main.tsx, which reloads the page once a new version has taken over.
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false,
      workbox: {
        // Without these, a new service worker waits until every tab is closed, and the old cached
        // app keeps running against freshly fetched data in a newer format.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg}'],
        globIgnores: ['data/**'],
        runtimeCaching: [
          {
            // Always the current data when online; the cache only serves offline use.
            urlPattern: ({ url }) => /\/data\/.+\.json$/.test(url.pathname),
            handler: 'NetworkFirst',
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
