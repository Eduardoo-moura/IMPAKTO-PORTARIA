/**
 * Erros de aplicação e tratamento centralizado.
 *
 * Formato único de resposta: `{ erro: { codigo, mensagem, campos? } }`.
 * Regra de segurança (briefing §11): nunca vazar stack, SQL ou detalhe interno
 * para o cliente. O detalhe vai para o log; o cliente recebe o que ajuda a
 * corrigir a ação.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';

export type CampoInvalido = { campo: string; mensagem: string };

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly campos?: CampoInvalido[],
    /** Contexto para o log — nunca vai para a resposta. */
    readonly contexto?: Record<string, unknown>,
  ) {
    super(mensagem);
    this.name = 'AppError';
  }
}

export const naoAutenticado = (mensagem = 'Sessão expirada. Entre novamente.') =>
  new AppError(401, 'NAO_AUTENTICADO', mensagem);

export const acessoNegado = (mensagem = 'Acesso negado.') =>
  new AppError(403, 'ACESSO_NEGADO', mensagem);

export const naoEncontrado = (recurso: string) =>
  new AppError(404, 'NAO_ENCONTRADO', `${recurso} não encontrado.`);

export const dadosInvalidos = (mensagem: string, campos?: CampoInvalido[]) =>
  new AppError(422, 'DADOS_INVALIDOS', mensagem, campos);

/**
 * 409 com instrução de como prosseguir. É o caso da saída sobre saída já
 * existente (R16): a operação é permitida, mas exige confirmação explícita.
 */
export const exigeConfirmacao = (codigo: string, mensagem: string, contexto?: Record<string, unknown>) =>
  new AppError(409, codigo, mensagem, undefined, contexto);

export function registrarTratamentoDeErros(app: FastifyInstance): void {
  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({
      erro: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: `Rota ${req.method} ${req.url} não existe.` },
    });
  });

  app.setErrorHandler((erro, req, reply) => {
    if (erro instanceof AppError) {
      if (erro.status >= 500) req.log.error({ erro, contexto: erro.contexto }, erro.message);
      else req.log.info({ codigo: erro.codigo, contexto: erro.contexto }, erro.message);

      return reply.status(erro.status).send({
        erro: {
          codigo: erro.codigo,
          mensagem: erro.message,
          ...(erro.campos ? { campos: erro.campos } : {}),
          ...(erro.contexto ? { contexto: erro.contexto } : {}),
        },
      });
    }

    if (hasZodFastifySchemaValidationErrors(erro)) {
      return reply.status(400).send({
        erro: {
          codigo: 'DADOS_INVALIDOS',
          mensagem: 'Confira os campos destacados.',
          campos: erro.validation.map((v) => ({
            campo: v.instancePath.replace(/^\//, '') || v.params.issue?.path?.join('.') || '(corpo)',
            mensagem: v.message ?? 'Valor inválido.',
          })),
        },
      });
    }

    if (erro instanceof ZodError) {
      return reply.status(400).send({
        erro: {
          codigo: 'DADOS_INVALIDOS',
          mensagem: 'Confira os campos destacados.',
          campos: erro.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
        },
      });
    }

    // Erro de serialização é defeito nosso, não do cliente.
    if (isResponseSerializationError(erro)) {
      req.log.error({ erro }, 'Resposta não bate com o schema declarado');
      return reply.status(500).send({
        erro: { codigo: 'ERRO_INTERNO', mensagem: 'Não foi possível completar a operação.' },
      });
    }

    // Erros do próprio Fastify (payload grande, rate limit, JSON malformado)
    // já trazem status e código; repassamos sem inventar mensagem.
    const doFastify = erro as { statusCode?: number; code?: string; message?: string };
    if (typeof doFastify.statusCode === 'number' && doFastify.statusCode < 500) {
      return reply.status(doFastify.statusCode).send({
        erro: {
          codigo: doFastify.code ?? 'REQUISICAO_INVALIDA',
          mensagem: doFastify.message ?? 'Requisição inválida.',
        },
      });
    }

    req.log.error({ erro }, 'Erro não tratado');
    return reply.status(500).send({
      erro: { codigo: 'ERRO_INTERNO', mensagem: 'Não foi possível completar a operação. Tente novamente.' },
    });
  });
}
