import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // A API é o único backend; nada de SQL nem regra de negócio no frontend.
    proxy: { '/api': { target: 'http://localhost:3333', changeOrigin: true } },
  },
});
