import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const root = resolve(__dirname, 'src/renderer');

export default defineConfig({
  root,
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: resolve(root, 'dashboard.html'),
        ticker: resolve(root, 'ticker.html'),
      },
    },
  },
});
