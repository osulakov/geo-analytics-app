import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { vesselsApiPlugin } from './vite-plugins/vessels-api';

export default defineConfig({
  plugins: [react(), vesselsApiPlugin()],
  server: {
    port: 5173,
  },
});
