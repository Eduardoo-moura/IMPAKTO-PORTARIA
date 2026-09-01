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

/**
 * Os testes TRUNCAM tabelas. Nunca podem apontar para o banco de trabalho.
 *
 * A URL de teste vem de `DATABASE_URL_TESTE` quando definida — é o caso desde
 * que o banco de homologação passou a ser o Supabase, onde `DATABASE_URL`
 * aponta para a nuvem. Sem ela, deriva do banco local acrescentando `_test`.
 */
const url = process.env.DATABASE_URL_TESTE ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('Defina DATABASE_URL_TESTE (ou DATABASE_URL) no .env.');
}

process.env.DATABASE_URL = /_test(\?|$)/.test(url)
  ? url
  : url.replace(/\/impakto(\?|$)/, '/impakto_test$1');
// As migrations dos testes usam a mesma conexão.
process.env.DIRECT_URL = process.env.DATABASE_URL;

const alvo = process.env.DATABASE_URL;

if (!/_test(\?|$)/.test(alvo)) {
  throw new Error(
    `Recusando rodar testes fora de um banco de teste. A URL aponta para: ${alvo.replace(/:[^:@]*@/, ':***@')}`,
  );
}

if (/supabase|amazonaws|\.com\//.test(alvo)) {
  throw new Error('Recusando rodar testes contra um banco remoto. Use o PostgreSQL local.');
}

process.env.NODE_ENV = 'test';
// Silencioso por padrão; LOG_TESTE=debug mostra o log da aplicação ao investigar.
process.env.LOG_LEVEL = process.env.LOG_TESTE ?? 'fatal';
process.env.JWT_SECRET ??= 'segredo-apenas-para-testes-com-mais-de-32-caracteres';
