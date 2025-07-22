import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
  ],
  optimizeDeps: {
    include: ['react/jsx-runtime'],
  },
  build: {
    // Use esbuild instead of rollup to avoid platform binary issues
    minify: 'esbuild',
    rollupOptions: {
      // Disable rollup optimizations that require platform binaries
      treeshake: false,
    },
  },
  define: {
    // Fix for libraries that reference process.env
    'process.env': {},
    global: 'globalThis',
  },
  esbuild: {
    // Use esbuild for transformations
    target: 'es2020',
  },
}); 