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
    /**
     * Folga para banco remoto. Com o Postgres na nuvem, cada ida e volta custa
     * ~180 ms e um teste de integração faz dezenas delas — o padrão de 5 s
     * estourava de forma intermitente, dando falha onde não havia defeito.
     * Contra Postgres local a suíte inteira roda em segundos e isto não pesa.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: { reporter: ['text', 'html'], include: ['packages/shared/src/**', 'apps/api/src/**'] },
  },
});
