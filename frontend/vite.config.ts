import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the frontend runs on :5173 and proxies API calls to the Fastify
// backend on :8080. In production the backend serves the built assets directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
