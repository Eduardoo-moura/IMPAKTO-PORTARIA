/**
 * R29 — Segunda camada de proteção.
 *
 * O frontend esconde o item de menu que o usuário não pode usar, e o backend
 * revalida a permissão aqui. O desktop faz o mesmo: o menu USUARIOS fica
 * oculto para o nível 2 **e** o clique confere de novo antes de abrir a tela.
 *
 * Esconder botão não é autorização.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

import { acessoNegado } from '../infra/errors.js';
import { autenticado, sessaoDe } from './autenticado.js';

/**
 * Uso: `{ preHandler: exigir('portaria.acesso.criar') }`.
 * Já inclui a autenticação — não é preciso encadear os dois.
 */
export function exigir(...permissoes: string[]) {
  return async function verificar(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    await autenticado(req, reply);

    const sessao = sessaoDe(req);
    const temTodas = permissoes.every((p) => sessao.permissoes.includes(p));

    if (!temTodas) {
      req.log.info(
        { login: sessao.login, perfil: sessao.perfil, exigido: permissoes },
        'Acesso negado por permissão',
      );
      throw acessoNegado();
    }
  };
}
