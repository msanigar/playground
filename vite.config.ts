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
    rollupOptions: {
      // Remove rtcstats from external - let it be bundled
    },
  },
  define: {
    // Fix for libraries that reference process.env
    'process.env': {},
    global: 'globalThis',
  },
});
