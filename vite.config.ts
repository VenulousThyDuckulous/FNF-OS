import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `base: './'` keeps every emitted asset path relative, so the same build works
 * at https://user.github.io/FNF-OS/ and at any custom domain without rebuilding.
 * Routing is hash-based for the same reason: GitHub Pages has no SPA rewrite.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
