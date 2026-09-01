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
 * Os testes TRUNCAM tabelas. Nunca podem tocar no banco de trabalho.
 *
 * Com tudo no Supabase, homologação e testes dividem o mesmo servidor e são
 * separados por SCHEMA: `public` é a homologação, `teste` é descartável. A
 * trava abaixo é o que impede um `npm test` distraído apagar a homologação —
 * ela exige `schema=teste` explícito e falha fechada em qualquer outro caso.
 *
 * Vale para PostgreSQL local também: basta apontar `DATABASE_URL_TESTE` para
 * um banco cujo nome termine em `_test`.
 */
const url = process.env.DATABASE_URL_TESTE;
if (!url) {
  throw new Error(
    'Defina DATABASE_URL_TESTE no .env. Ela precisa apontar para o schema `teste` ' +
      '(Supabase) ou para um banco terminado em `_test` (PostgreSQL local).',
  );
}

const ehSchemaDeTeste = /[?&]schema=teste(&|$)/.test(url);
const ehBancoDeTeste = /_test(\?|$)/.test(url);

if (!ehSchemaDeTeste && !ehBancoDeTeste) {
  throw new Error(
    'Recusando rodar os testes: DATABASE_URL_TESTE não aponta para schema=teste nem ' +
      `para um banco _test. Valor: ${url.replace(/:[^:@]*@/, ':***@')}`,
  );
}

process.env.DATABASE_URL = url;
// Migrations e DDL dos testes usam a mesma conexão.
process.env.DIRECT_URL = url;

process.env.NODE_ENV = 'test';
// Silencioso por padrão; LOG_TESTE=debug mostra o log da aplicação ao investigar.
process.env.LOG_LEVEL = process.env.LOG_TESTE ?? 'fatal';
process.env.JWT_SECRET ??= 'segredo-apenas-para-testes-com-mais-de-32-caracteres';
