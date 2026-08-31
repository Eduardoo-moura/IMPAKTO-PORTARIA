/**
 * Rotas de autenticação e sessão.
 *
 * Desenho da sessão: token de acesso curto no corpo da resposta (o cliente
 * guarda em memória) e refresh longo em cookie `httpOnly`, que o JavaScript da
 * página não alcança. O porteiro não é interrompido no meio do turno, e a
 * estação abandonada não fica aberta indefinidamente.
 *
 * Limitação assumida: o refresh é um JWT, não uma sessão em banco, então não
 * há revogação imediata — um usuário desativado perde o acesso no máximo em
 * `JWT_EXPIRACAO` (padrão 15 min), porque `autenticado` recarrega a sessão do
 * banco a cada requisição. Com 14 usuários numa rede interna isso basta; se um
 * dia for preciso derrubar sessão na hora, entra uma tabela `sessao`.
 */

import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { ehProducao, env } from '../../config/env.js';
import { naoAutenticado } from '../../infra/errors.js';
import { autenticado, sessaoDe } from '../../middlewares/autenticado.js';
import { origemDaRequisicao } from '../auditoria/auditoria.service.js';
import {
  autenticar,
  carregarSessao,
  encerrarSessao,
  trocarSenha,
  trocarTurno,
  type SessaoDoUsuario,
} from './auth.service.js';
import {
  credenciaisSchema,
  erroSchema,
  respostaDeLoginSchema,
  sessaoSchema,
  trocarSenhaSchema,
} from './auth.schema.js';

const COOKIE_REFRESH = 'impakto_refresh';

export const rotasDeAuth: FastifyPluginAsyncZod = async (app) => {
  const opcoesDoCookie = {
    httpOnly: true,
    sameSite: 'strict' as const,
    // Rede interna hoje é HTTP; com HTTPS o cookie passa a exigir canal seguro.
    secure: ehProducao,
    path: '/api/auth',
    maxAge: env.REFRESH_EXPIRACAO_HORAS * 60 * 60,
  };

  /**
   * Emite o par de tokens: o de acesso volta no corpo, o de refresh vai no
   * cookie httpOnly. Os dois carregam `tipo` para um não ser aceito no lugar
   * do outro — um refresh de 12h usado como token de acesso anularia a
   * expiração curta.
   */
  function responderComSessao(reply: FastifyReply, sessao: SessaoDoUsuario) {
    const acesso = app.jwt.sign({ sub: sessao.id, tipo: 'acesso' }, { expiresIn: env.JWT_EXPIRACAO });
    const refresh = app.jwt.sign(
      { sub: sessao.id, tipo: 'refresh' },
      { expiresIn: `${env.REFRESH_EXPIRACAO_HORAS}h` },
    );

    reply.setCookie(COOKIE_REFRESH, refresh, opcoesDoCookie);
    return { token: acesso, usuario: sessao };
  }

  // ------------------------------------------------------------------ login
  app.post(
    '/login',
    {
      // Barreira contra força bruta. A mensagem de erro continua sendo a mesma
      // para credencial errada, independentemente do motivo (R31).
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Autentica e abre a sessão',
        body: credenciaisSchema,
        response: { 200: respostaDeLoginSchema, 401: erroSchema, 429: erroSchema },
      },
    },
    async (req, reply) => {
      const sessao = await autenticar(req.body.login, req.body.senha, origemDaRequisicao(req), req.log);
      return responderComSessao(reply, sessao);
    },
  );

  // ---------------------------------------------------------------- refresh
  app.post(
    '/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Renova o token de acesso a partir do cookie de refresh',
        response: { 200: respostaDeLoginSchema, 401: erroSchema },
      },
    },
    async (req, reply) => {
      const cookie = req.cookies[COOKIE_REFRESH];
      if (!cookie) throw naoAutenticado();

      let sub: string;
      try {
        const conteudo = app.jwt.verify<{ sub?: string; tipo?: string }>(cookie);
        if (conteudo.tipo !== 'refresh' || !conteudo.sub) throw new Error('cookie de tipo errado');
        sub = conteudo.sub;
      } catch {
        reply.clearCookie(COOKIE_REFRESH, opcoesDoCookie);
        throw naoAutenticado();
      }

      // Recarrega do banco: usuário desativado não renova.
      const sessao = await carregarSessao(sub);
      return responderComSessao(reply, sessao);
    },
  );

  // -------------------------------------------------------------------- eu
  app.get(
    '/eu',
    {
      preHandler: autenticado,
      schema: {
        tags: ['auth'],
        summary: 'Sessão atual, com as permissões que montam o menu',
        response: { 200: sessaoSchema, 401: erroSchema },
      },
    },
    async (req) => sessaoDe(req),
  );

  // --------------------------------------------------------------- logout
  app.post(
    '/logout',
    {
      preHandler: autenticado,
      schema: {
        tags: ['auth'],
        summary: 'Encerra a sessão e registra SAIDA DO SISTEMA',
        response: { 204: z.null(), 401: erroSchema },
      },
    },
    async (req, reply) => {
      await encerrarSessao(sessaoDe(req), 'LOGOUT', origemDaRequisicao(req), req.log);
      reply.clearCookie(COOKIE_REFRESH, opcoesDoCookie);
      return reply.status(204).send(null);
    },
  );

  // --------------------------------------------------------- trocar senha
  app.post(
    '/trocar-senha',
    {
      preHandler: autenticado,
      schema: {
        tags: ['auth'],
        summary: 'Troca a própria senha',
        body: trocarSenhaSchema,
        response: { 204: z.null(), 401: erroSchema, 422: erroSchema },
      },
    },
    async (req, reply) => {
      const sessao = sessaoDe(req);
      await trocarSenha(
        sessao.id,
        req.body.senhaAtual,
        req.body.novaSenha,
        origemDaRequisicao(req),
        req.log,
      );
      return reply.status(204).send(null);
    },
  );

  // --------------------------------------------------------- trocar turno
  app.post(
    '/trocar-turno',
    {
      preHandler: autenticado,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Passa o turno para outro porteiro sem fechar o sistema',
        description:
          'Se as credenciais de quem assume não conferirem, a sessão anterior continua valendo — o sistema nunca fica sem usuário (R32). O aviso de dados não salvos é responsabilidade do cliente.',
        body: credenciaisSchema,
        response: { 200: respostaDeLoginSchema, 401: erroSchema },
      },
    },
    async (req, reply) => {
      const nova = await trocarTurno(
        sessaoDe(req),
        req.body.login,
        req.body.senha,
        origemDaRequisicao(req),
        req.log,
      );
      return responderComSessao(reply, nova);
    },
  );
};
