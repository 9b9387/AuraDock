import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      external: [
        'electron',
        '@google/adk',
        '@google/genai',
        'undici',
        'fsevents',
        'sqlite3',
      ],
    },
  },
});
