/**
 * Exige sessão válida.
 *
 * A sessão é recarregada do banco a cada requisição em vez de ser lida do
 * token: usuário desativado ou com perfil trocado perde o acesso na hora.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

import { naoAutenticado } from '../infra/errors.js';
import { carregarSessao, type SessaoDoUsuario } from '../modules/auth/auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessao?: SessaoDoUsuario;
  }
}

export async function autenticado(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  let sub: string;
  try {
    const conteudo = await req.jwtVerify<{ sub?: string; tipo?: string }>();
    if (conteudo.tipo !== 'acesso' || !conteudo.sub) throw new Error('token de tipo errado');
    sub = conteudo.sub;
  } catch {
    throw naoAutenticado();
  }

  req.sessao = await carregarSessao(sub);
}

/** Sessão já validada. Só use dentro de rota que passou por `autenticado`. */
export function sessaoDe(req: FastifyRequest): SessaoDoUsuario {
  if (!req.sessao) throw naoAutenticado();
  return req.sessao;
}
