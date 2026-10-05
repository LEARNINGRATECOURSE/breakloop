import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      manifest: {
        name: 'BreakLoop',
        short_name: 'BreakLoop',
        description: 'Work smarter, rest better. Privacy-first break timer with analog clock.',
        theme_color: '#e44b3c',
        background_color: '#070908',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      // Registered manually in src/utils/service-worker.ts (production only)
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        rollupFormat: 'iife',
      },
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
  },
});
