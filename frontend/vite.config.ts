import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal typing so this config does not need @types/node.
declare const process: { env: Record<string, string | undefined> };

// Where /api is proxied in dev: localhost outside Docker, the backend service inside compose.
const apiProxy = process.env.API_PROXY ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': apiProxy, '/docs': apiProxy, '/openapi.json': apiProxy },
  },
  build: {
    // React + recharts are ~560 kB minified (~160 kB gzip), split into one long-cached vendor chunk.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: { manualChunks: { vendor: ['react', 'react-dom', 'recharts'] } },
    },
  },
});
