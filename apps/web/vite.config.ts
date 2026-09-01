import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    /**
     * Saída na RAIZ do repositório, não em `apps/web/dist`.
     *
     * É um lugar só, usado por todos: o `outputDirectory` do Vercel, a API
     * quando serve o frontend na mesma URL, e o `npm run hml`. A alternativa
     * -- construir aqui e copiar para a raiz no deploy -- já falhou no Vercel
     * com `cp: cannot stat 'apps/web/dist'`, e um passo de cópia que só roda
     * em produção é justamente o que ninguém testa.
     */
    outDir: '../../dist',
    // Exigido pelo Vite para limpar um diretório fora da raiz do projeto.
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // A API é o único backend; nada de SQL nem regra de negócio no frontend.
    proxy: { '/api': { target: 'http://localhost:3333', changeOrigin: true } },
  },
});
