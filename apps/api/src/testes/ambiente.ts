/**
 * Preparação do ambiente de teste.
 *
 * Roda ANTES de qualquer import de módulo da aplicação (`setupFiles` do
 * Vitest), porque `config/env.ts` lê `process.env` no momento em que é
 * importado.
 *
 * Aponta para um banco **separado** (`impakto_test`): os testes truncam
 * tabelas, e apontar para o banco de homologação apagaria o que estivesse lá.
 * A troca é feita aqui, e não no `.env`, para não haver como esquecer.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '..', '..', '..', '..');
const arquivoEnv = resolve(raiz, '.env');

if (existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL não definida. Crie o .env a partir do .env.example.');
}

// Mesmo servidor, banco com sufixo _test.
if (!/\/impakto_test(\?|$)/.test(url)) {
  process.env.DATABASE_URL = url.replace(/\/impakto(\?|$)/, '/impakto_test$1');
}

if (!/\/impakto_test(\?|$)/.test(process.env.DATABASE_URL!)) {
  throw new Error(
    `Recusando rodar testes fora do banco de teste. DATABASE_URL aponta para: ${process.env.DATABASE_URL}`,
  );
}

process.env.NODE_ENV = 'test';
// Silencioso por padrão; LOG_TESTE=debug mostra o log da aplicação ao investigar.
process.env.LOG_LEVEL = process.env.LOG_TESTE ?? 'fatal';
process.env.JWT_SECRET ??= 'segredo-apenas-para-testes-com-mais-de-32-caracteres';
