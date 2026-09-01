/**
 * Rotas do módulo Portaria.
 *
 * Um plugin por setor: registrar Compras é criar a pasta e uma linha em
 * `app.ts`, sem tocar em nada daqui.
 */

import {
  DIAS_NA_LISTA_MERCADORIA,
  DIAS_PENDENCIA_NA_GRADE,
  MAX_ACOMPANHANTES,
} from '@impakto/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { booleanoDeQuery } from '../../infra/zod.js';
import { sessaoDe } from '../../middlewares/autenticado.js';
import { exigir } from '../../middlewares/autorizado.js';
import { origemDaRequisicao } from '../auditoria/auditoria.service.js';
import { erroSchema } from '../auth/auth.schema.js';
import {
  buscarUltimaVisita,
  consultarHistorico,
  consultarMovimento,
  registrarEntrada,
  registrarSaida,
} from './acessos/acessos.service.js';
import {
  confirmarEntrega,
  desfazerEntrega,
  listarMercadorias,
  registrarChegada,
} from './mercadorias/mercadorias.service.js';

const acompanhanteSchema = z.object({
  nome: z.string().max(120).nullish(),
  documento: z.string().max(40).nullish(),
});

const acessoSchema = z.object({
  id: z.string(),
  entradaEm: z.string().nullable(),
  saidaEm: z.string().nullable(),
  nome: z.string(),
  documento: z.string(),
  celular: z.string().nullable(),
  placa: z.string().nullable(),
  tipoVeiculo: z.string().nullable(),
  empresa: z.string().nullable(),
  prestador: z.boolean().nullable(),
  agregado: z.boolean().nullable(),
  usuarioEntrada: z.string().nullable(),
  acompanhantes: z.array(z.object({ nome: z.string(), documento: z.string().nullable() })),
  pendenciaAntiga: z.boolean(),
});

export const rotasDaPortaria: FastifyPluginAsyncZod = async (app) => {
  // ------------------------------------------------------------- movimento
  app.get(
    '/acessos/movimento',
    {
      preHandler: exigir('portaria.acesso.ver'),
      schema: {
        tags: ['portaria'],
        summary: 'Grade do movimento: entradas de hoje e pendências sem saída',
        description: `Soma o que entrou hoje com o que continua sem saída nos últimos ${DIAS_PENDENCIA_NA_GRADE} dias. O dia é o da portaria, nunca UTC.`,
        querystring: z.object({
          dias: z.coerce.number().int().min(1).max(30).default(DIAS_PENDENCIA_NA_GRADE),
          somenteDentro: booleanoDeQuery(false),
        }),
        response: {
          200: z.object({
            acessos: z.array(acessoSchema),
            hoje: z.string(),
            dentro: z.number(),
            pendencias: z.number(),
          }),
          401: erroSchema,
          403: erroSchema,
        },
      },
    },
    async (req) => consultarMovimento(req.query),
  );

  // --------------------------------------------------------------- entrada
  app.post(
    '/acessos',
    {
      preHandler: exigir('portaria.acesso.criar'),
      schema: {
        tags: ['portaria'],
        summary: 'Registra a entrada',
        description:
          'Só nome e documento são obrigatórios — a placa não é. Documento com 11 dígitos que não fecha na conferência de CPF responde 409 CONFIRMAR_DOCUMENTO; reenviar com confirmarDocumento=true grava assim mesmo.',
        body: z.object({
          nome: z.string().min(1, 'Informe o nome.').max(120),
          documento: z.string().min(1, 'Informe o RG ou CPF.').max(40),
          celular: z.string().max(20).nullish(),
          placa: z.string().max(20).nullish(),
          tipoVeiculo: z.string().max(60).nullish(),
          empresa: z.string().max(120).nullish(),
          prestador: z.boolean().nullish(),
          agregado: z.boolean().nullish(),
          acompanhantes: z.array(acompanhanteSchema).max(MAX_ACOMPANHANTES).optional(),
          confirmarDocumento: z.boolean().optional(),
        }),
        response: { 201: acessoSchema, 401: erroSchema, 403: erroSchema, 409: erroSchema, 422: erroSchema },
      },
    },
    async (req, reply) => {
      const acesso = await registrarEntrada(req.body, sessaoDe(req), origemDaRequisicao(req), req.log);
      return reply.status(201).send(acesso);
    },
  );

  // ----------------------------------------------------------------- saída
  app.post(
    '/acessos/:id/saida',
    {
      preHandler: exigir('portaria.acesso.saida'),
      schema: {
        tags: ['portaria'],
        summary: 'Registra a saída',
        description:
          'Responde 409 SAIDA_JA_REGISTRADA se o acesso já tem saída; reenviar com forcar=true sobrescreve e a trilha grava SAIDA SOBRESCRITA com o valor substituído.',
        params: z.object({ id: z.string() }),
        querystring: z.object({ forcar: booleanoDeQuery(false) }),
        response: { 200: acessoSchema, 401: erroSchema, 403: erroSchema, 404: erroSchema, 409: erroSchema, 422: erroSchema },
      },
    },
    async (req) =>
      registrarSaida(
        req.params.id,
        { forcar: req.query.forcar },
        sessaoDe(req),
        origemDaRequisicao(req),
        req.log,
      ),
  );

  // ------------------------------------------------------ busca e histórico
  app.get(
    '/busca/:por/:valor',
    {
      preHandler: exigir('portaria.acesso.ver'),
      schema: {
        tags: ['portaria'],
        summary: 'Última visita, para pré-preencher o formulário',
        description:
          'Compara sempre o valor normalizado — é o que encontra as placas gravadas com espaço e os documentos gravados com pontuação.',
        params: z.object({ por: z.enum(['placa', 'documento']), valor: z.string().min(1).max(40) }),
        response: { 200: acessoSchema.nullable(), 401: erroSchema, 403: erroSchema },
      },
    },
    async (req) => buscarUltimaVisita(req.params.por, req.params.valor),
  );

  // ----------------------------------------------------------- mercadorias
  const mercadoriaSchema = z.object({
    id: z.string(),
    chegadaEm: z.string(),
    destinatario: z.string(),
    empresa: z.string().nullable(),
    entregador: z.string().nullable(),
    usuarioRegistro: z.string().nullable(),
    entregueEm: z.string().nullable(),
    retiradoPor: z.string().nullable(),
    usuarioEntrega: z.string().nullable(),
  });

  app.get(
    '/mercadorias',
    {
      preHandler: exigir('portaria.mercadoria.ver'),
      schema: {
        tags: ['portaria'],
        summary: 'Mercadorias na portaria',
        description: `Traz os últimos ${DIAS_NA_LISTA_MERCADORIA} dias somados a tudo que ainda não foi retirado. As pendentes ignoram a janela: encomenda parada há um mês continua parada.`,
        querystring: z.object({
          dias: z.coerce.number().int().min(1).max(365).default(DIAS_NA_LISTA_MERCADORIA),
          somentePendentes: booleanoDeQuery(false),
        }),
        response: {
          200: z.object({
            mercadorias: z.array(mercadoriaSchema),
            pendentes: z.number(),
            dias: z.number(),
          }),
          401: erroSchema,
          403: erroSchema,
        },
      },
    },
    async (req) => listarMercadorias(req.query),
  );

  app.post(
    '/mercadorias',
    {
      preHandler: exigir('portaria.mercadoria.registrar'),
      schema: {
        tags: ['portaria'],
        summary: 'Registra a chegada de uma mercadoria',
        description: 'Só o destinatário é obrigatório.',
        body: z.object({
          destinatario: z.string().min(1, 'Informe para quem é.').max(120),
          empresa: z.string().max(120).nullish(),
          entregador: z.string().max(120).nullish(),
        }),
        response: { 201: mercadoriaSchema, 401: erroSchema, 403: erroSchema, 422: erroSchema },
      },
    },
    async (req, reply) => {
      const criada = await registrarChegada(req.body, sessaoDe(req), origemDaRequisicao(req), req.log);
      return reply.status(201).send(criada);
    },
  );

  app.post(
    '/mercadorias/:id/entrega',
    {
      preHandler: exigir('portaria.mercadoria.entregar'),
      schema: {
        tags: ['portaria'],
        summary: 'Confirma a retirada',
        description: 'Exige o nome de quem está retirando — sem ele a baixa não responde à pergunta que a portaria vai fazer depois.',
        params: z.object({ id: z.string() }),
        body: z.object({ retiradoPor: z.string().min(1, 'Informe quem está retirando.').max(120) }),
        response: { 200: mercadoriaSchema, 401: erroSchema, 403: erroSchema, 404: erroSchema, 409: erroSchema, 422: erroSchema },
      },
    },
    async (req) =>
      confirmarEntrega(req.params.id, req.body.retiradoPor, sessaoDe(req), origemDaRequisicao(req), req.log),
  );

  app.delete(
    '/mercadorias/:id/entrega',
    {
      preHandler: exigir('portaria.mercadoria.desfazer_entrega'),
      schema: {
        tags: ['portaria'],
        summary: 'Desfaz a retirada',
        description: 'Reversível, mas rastreada: a trilha guarda quem havia retirado, quando e quem liberou.',
        params: z.object({ id: z.string() }),
        response: { 200: mercadoriaSchema, 401: erroSchema, 403: erroSchema, 404: erroSchema, 422: erroSchema },
      },
    },
    async (req) => desfazerEntrega(req.params.id, sessaoDe(req), origemDaRequisicao(req), req.log),
  );

  app.get(
    '/historico/:por/:valor',
    {
      preHandler: exigir('portaria.acesso.ver'),
      schema: {
        tags: ['portaria'],
        summary: 'Histórico de visitas de uma placa ou documento',
        params: z.object({ por: z.enum(['placa', 'documento']), valor: z.string().min(1).max(40) }),
        querystring: z.object({ limite: z.coerce.number().int().min(1).max(200).default(50) }),
        response: { 200: z.array(acessoSchema), 401: erroSchema, 403: erroSchema },
      },
    },
    async (req) => consultarHistorico(req.params.por, req.params.valor, req.query.limite),
  );
};
