import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev: run the FastAPI backend on :8000 (see README).
    proxy: { '/api': 'http://localhost:8000' },
  },
  build: {
    // React + recharts are ~560 kB minified (~160 kB gzip), split into one long-cached vendor chunk.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: { manualChunks: { vendor: ['react', 'react-dom', 'recharts'] } },
    },
  },
});
