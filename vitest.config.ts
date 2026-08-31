import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts'],
    environment: 'node',
    // Prepara o ambiente ANTES de qualquer import da aplicação: config/env.ts
    // lê process.env no momento em que é carregado.
    setupFiles: ['apps/api/src/testes/ambiente.ts'],
    // Os testes de integração compartilham um banco: rodar os arquivos em
    // paralelo faria um truncar a tabela que o outro está usando.
    fileParallelism: false,
    coverage: { reporter: ['text', 'html'], include: ['packages/shared/src/**', 'apps/api/src/**'] },
  },
});
