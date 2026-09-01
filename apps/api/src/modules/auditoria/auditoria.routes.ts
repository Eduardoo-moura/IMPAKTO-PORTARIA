/**
 * Consulta da trilha de auditoria.
 *
 * Origem: `Portaria/Frm_Auditoria.cs`. A tela do desktop abre com os últimos
 * `DiasIniciais = 7` dias, sob o menu USUARIOS, e só para o nível 1 — aqui,
 * `auditoria.ver`, que só o perfil ADMINISTRADOR tem.
 *
 * A trilha é **append-only**: não existe rota de alteração nem de exclusão,
 * e isso é a propriedade que dá valor ao registro.
 */

import { DIAS_INICIAIS_AUDITORIA, diaMais, fimExclusivoDoDia, inicioDoDia } from '@impakto/shared';
import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { prisma } from '../../infra/prisma.js';
import { exigir } from '../../middlewares/autorizado.js';
import { erroSchema } from '../auth/auth.schema.js';

const eventoSchema = z.object({
  id: z.string(),
  em: z.string(),
  usuarioLogin: z.string().nullable(),
  usuarioNome: z.string().nullable(),
  tipo: z.string(),
  acao: z.string(),
  registro: z.string().nullable(),
  detalhe: z.string().nullable(),
  ip: z.string().nullable(),
  maquina: z.string().nullable(),
});

/** Dia no formato `yyyy-MM-dd`, interpretado no fuso da portaria (R12). */
const diaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato aaaa-mm-dd.')
  .optional();

export const rotasDeAuditoria: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: exigir('auditoria.ver'),
      schema: {
        tags: ['auditoria'],
        summary: 'Consulta a trilha de auditoria',
        description: `Sem período informado, devolve os últimos ${DIAS_INICIAIS_AUDITORIA} dias — o mesmo padrão da tela do desktop. O limite superior é exclusivo.`,
        querystring: z.object({
          de: diaSchema,
          ate: diaSchema,
          tipo: z.enum(['ACESSO', 'VEICULO', 'MERCADORIA', 'USUARIO']).optional(),
          acao: z.string().max(40).optional(),
          usuario: z.string().max(40).optional(),
          pagina: z.coerce.number().int().min(1).default(1),
          porPagina: z.coerce.number().int().min(1).max(200).default(50),
        }),
        response: {
          200: z.object({
            eventos: z.array(eventoSchema),
            total: z.number(),
            pagina: z.number(),
            porPagina: z.number(),
            /** Período efetivamente consultado, já resolvido no fuso da portaria. */
            de: z.string(),
            ate: z.string(),
          }),
          400: erroSchema,
          401: erroSchema,
          403: erroSchema,
        },
      },
    },
    async (req, reply) => {
      const { tipo, acao, usuario, pagina, porPagina } = req.query;

      const ate = req.query.ate ?? diaMais(0);
      const de = req.query.de ?? diaMais(-(DIAS_INICIAIS_AUDITORIA - 1), ate);

      if (de > ate) {
        return reply.status(400).send({
          erro: {
            codigo: 'PERIODO_INVALIDO',
            mensagem: 'A data final não pode ser anterior à inicial.',
            campos: [{ campo: 'de', mensagem: 'Deve ser anterior ou igual à data final.' }],
          },
        });
      }

      const onde: Prisma.AuditoriaWhereInput = {
        // Limite superior exclusivo, como no relatório do desktop (R36).
        em: { gte: inicioDoDia(de), lt: fimExclusivoDoDia(ate) },
        ...(tipo ? { tipo } : {}),
        ...(acao ? { acao } : {}),
        ...(usuario ? { usuarioLogin: { equals: usuario, mode: 'insensitive' } } : {}),
      };

      const [total, eventos] = await Promise.all([
        prisma.auditoria.count({ where: onde }),
        prisma.auditoria.findMany({
          where: onde,
          orderBy: { em: 'desc' },
          skip: (pagina - 1) * porPagina,
          take: porPagina,
        }),
      ]);

      return {
        eventos: eventos.map((e) => ({
          id: e.id.toString(),
          em: e.em.toISOString(),
          usuarioLogin: e.usuarioLogin,
          usuarioNome: e.usuarioNome,
          tipo: e.tipo,
          acao: e.acao,
          registro: e.registro,
          detalhe: e.detalhe,
          ip: e.ip,
          maquina: e.maquina,
        })),
        total,
        pagina,
        porPagina,
        de,
        ate,
      };
    },
  );

  /**
   * Alimenta os filtros da tela. Sai da própria trilha, e não de uma lista
   * fixa: ação nova passa a aparecer sem precisar mexer no frontend, e login
   * de usuário já removido continua filtrável (R37).
   */
  app.get(
    '/filtros',
    {
      preHandler: exigir('auditoria.ver'),
      schema: {
        tags: ['auditoria'],
        summary: 'Valores presentes na trilha, para montar os filtros',
        response: {
          200: z.object({ acoes: z.array(z.string()), usuarios: z.array(z.string()) }),
          401: erroSchema,
          403: erroSchema,
        },
      },
    },
    async () => {
      const [acoes, usuarios] = await Promise.all([
        prisma.auditoria.findMany({ distinct: ['acao'], select: { acao: true }, orderBy: { acao: 'asc' } }),
        prisma.auditoria.findMany({
          distinct: ['usuarioLogin'],
          select: { usuarioLogin: true },
          where: { usuarioLogin: { not: null } },
          orderBy: { usuarioLogin: 'asc' },
        }),
      ]);

      return {
        acoes: acoes.map((a) => a.acao),
        usuarios: usuarios.map((u) => u.usuarioLogin!).filter(Boolean),
      };
    },
  );
};
