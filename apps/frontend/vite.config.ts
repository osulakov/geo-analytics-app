import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { vesselsApiPlugin } from './vite-plugins/vessels-api';

export default defineConfig({
  plugins: [react(), vesselsApiPlugin()],
  server: {
    port: 5173,
    // Auth APIs go through the Node backend; everything under /api stays
    // direct-from-DB via the vessels-api dev plugin.
    proxy: {
      '/auth': {
        target: process.env.BACKEND_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '/aois': {
        target: process.env.BACKEND_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '/jobs': {
        target: process.env.BACKEND_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      // OpenAI image-analysis endpoint (backend).
      '/openai': {
        target: process.env.BACKEND_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      // Image storage microservice (media_bucket).
      '/media': {
        target: process.env.MEDIA_URL ?? 'http://localhost:4100',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/media/, ''),
      },
    },
  },
});
