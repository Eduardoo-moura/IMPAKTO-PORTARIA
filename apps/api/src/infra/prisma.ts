/**
 * Cliente Prisma único do processo.
 *
 * O desktop abre uma `SQLiteConnection` por formulário, com a string literal
 * repetida em 9 arquivos e 3 variantes divergentes. Aqui há um ponto só.
 */

import { PrismaClient } from '@prisma/client';
import { env, ehProducao } from '../config/env.js';

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalParaPrisma.prisma ??
  new PrismaClient({
    log: ehProducao ? ['warn', 'error'] : ['warn', 'error'],
    datasources: { db: { url: env.DATABASE_URL } },
  });

// Evita esgotar o pool com o hot-reload do tsx em desenvolvimento.
if (!ehProducao) globalParaPrisma.prisma = prisma;

/**
 * `BigInt` não é serializável em JSON, e todos os ids do schema são BigInt.
 * Converter na borda evita `TypeError` em toda resposta.
 */
export const idParaTexto = (valor: bigint | null | undefined): string | null =>
  valor === null || valor === undefined ? null : valor.toString();
