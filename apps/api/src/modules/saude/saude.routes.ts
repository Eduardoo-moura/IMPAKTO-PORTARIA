/**
 * Verificação de disponibilidade.
 *
 * Requisito não-funcional: a portaria opera fora do horário comercial e, se o
 * sistema cair, o fluxo para. Esta rota é o que o monitoramento e o restart
 * automático consultam.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { diaDaPortaria, FUSO_PORTARIA } from '@impakto/shared';
import { prisma } from '../../infra/prisma.js';

export async function rotasDeSaude(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/saude',
    {
      schema: {
        tags: ['saude'],
        summary: 'Estado da API e do banco',
        response: {
          200: z.object({
            estado: z.literal('ok'),
            versao: z.string(),
            banco: z.literal('ok'),
            fuso: z.string(),
            diaDaPortaria: z.string(),
          }),
          503: z.object({
            erro: z.object({ codigo: z.string(), mensagem: z.string() }),
          }),
        },
      },
    },
    async (_req, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        return reply.status(503).send({
          erro: { codigo: 'BANCO_INDISPONIVEL', mensagem: 'Banco de dados indisponível.' },
        });
      }

      return {
        estado: 'ok' as const,
        versao: '0.1.0',
        banco: 'ok' as const,
        fuso: FUSO_PORTARIA,
        diaDaPortaria: diaDaPortaria(),
      };
    },
  );
}
