import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Unified PrintPress portal. In dev, API calls are proxied to the Express
 * backend so the browser only ever talks to one origin. Point the proxy at a
 * different backend port with VITE_API_TARGET (or BACKEND_PORT).
 *
 *   npm run build         -> dist/            (standalone bundle)
 *   npm run build:server  -> ../backend/public (what the API serves)
 */
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  const target = env.VITE_API_TARGET || `http://localhost:${env.BACKEND_PORT || 5000}`;
  const proxy = { target, changeOrigin: true };

  return {
    plugins: [react()],
    server: {
      port: 3001,
      strictPort: false,
      proxy: { '/api': proxy, '/uploads': proxy },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
