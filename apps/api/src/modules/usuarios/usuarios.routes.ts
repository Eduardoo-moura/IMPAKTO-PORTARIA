/**
 * Rotas do cadastro de usuários.
 *
 * R29 — todas exigem `usuario.editar` (ou `usuario.ver`, para leitura). O menu
 * do frontend já esconde a seção para quem não tem a permissão, mas é aqui que
 * a decisão vale: esconder botão não é autorização.
 */

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { booleanoDeQuery } from '../../infra/zod.js';
import { exigir } from '../../middlewares/autorizado.js';
import { sessaoDe } from '../../middlewares/autenticado.js';
import { origemDaRequisicao } from '../auditoria/auditoria.service.js';
import { erroSchema } from '../auth/auth.schema.js';
import {
  alterarUsuario,
  criarUsuario,
  definirAtivo,
  listarPerfis,
  listarUsuarios,
  redefinirSenha,
} from './usuarios.service.js';

const usuarioSchema = z.object({
  id: z.string(),
  login: z.string(),
  nome: z.string(),
  perfil: z.string(),
  ativo: z.boolean(),
  trocarSenha: z.boolean(),
  ultimoLoginEm: z.string().nullable(),
  criadoEm: z.string(),
});

const idSchema = z.object({ id: z.string() });

export const rotasDeUsuarios: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: exigir('usuario.ver'),
      schema: {
        tags: ['usuarios'],
        summary: 'Lista os usuários cadastrados',
        querystring: z.object({ incluirInativos: booleanoDeQuery(true) }),
        response: { 200: z.array(usuarioSchema), 401: erroSchema, 403: erroSchema },
      },
    },
    async (req) => listarUsuarios(req.query.incluirInativos),
  );

  app.get(
    '/perfis',
    {
      preHandler: exigir('usuario.ver'),
      schema: {
        tags: ['usuarios'],
        summary: 'Perfis disponíveis, com a contagem de usuários em cada um',
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              nome: z.string(),
              descricao: z.string(),
              usuarios: z.number(),
            }),
          ),
          401: erroSchema,
          403: erroSchema,
        },
      },
    },
    async () => listarPerfis(),
  );

  app.post(
    '/',
    {
      preHandler: exigir('usuario.editar'),
      schema: {
        tags: ['usuarios'],
        summary: 'Cadastra um usuário',
        description:
          'A senha informada é inicial: quem recebe é obrigado a trocá-la no primeiro acesso.',
        body: z.object({
          login: z.string().min(1, 'Informe o usuário.').max(40),
          nome: z.string().max(120).optional(),
          senha: z.string().min(1, 'Informe a senha inicial.').max(200),
          perfil: z.string().min(1, 'Escolha o perfil.'),
        }),
        response: { 201: usuarioSchema, 401: erroSchema, 403: erroSchema, 422: erroSchema },
      },
    },
    async (req, reply) => {
      const criado = await criarUsuario(req.body, sessaoDe(req), origemDaRequisicao(req), req.log);
      return reply.status(201).send(criado);
    },
  );

  app.put(
    '/:id',
    {
      preHandler: exigir('usuario.editar'),
      schema: {
        tags: ['usuarios'],
        summary: 'Altera nome e perfil',
        params: idSchema,
        body: z.object({ nome: z.string().max(120).optional(), perfil: z.string().optional() }),
        response: {
          200: usuarioSchema,
          401: erroSchema,
          403: erroSchema,
          404: erroSchema,
          409: erroSchema,
          422: erroSchema,
        },
      },
    },
    async (req) => alterarUsuario(req.params.id, req.body, sessaoDe(req), origemDaRequisicao(req), req.log),
  );

  app.post(
    '/:id/senha',
    {
      preHandler: exigir('usuario.editar'),
      schema: {
        tags: ['usuarios'],
        summary: 'Redefine a senha de um usuário',
        params: idSchema,
        body: z.object({ novaSenha: z.string().min(1, 'Informe a nova senha.').max(200) }),
        response: { 204: z.null(), 401: erroSchema, 403: erroSchema, 404: erroSchema, 422: erroSchema },
      },
    },
    async (req, reply) => {
      await redefinirSenha(req.params.id, req.body.novaSenha, sessaoDe(req), origemDaRequisicao(req), req.log);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/:id/ativo',
    {
      preHandler: exigir('usuario.editar'),
      schema: {
        tags: ['usuarios'],
        summary: 'Ativa ou desativa um usuário',
        description:
          'Recusa com 409 se a operação deixaria o sistema sem nenhum administrador ativo (R30), ou se for o próprio usuário se desativando.',
        params: idSchema,
        body: z.object({ ativo: z.boolean() }),
        response: {
          200: usuarioSchema,
          401: erroSchema,
          403: erroSchema,
          404: erroSchema,
          409: erroSchema,
        },
      },
    },
    async (req) =>
      definirAtivo(req.params.id, req.body.ativo, sessaoDe(req), origemDaRequisicao(req), req.log),
  );
};
