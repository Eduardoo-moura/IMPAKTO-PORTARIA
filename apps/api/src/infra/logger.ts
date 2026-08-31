/**
 * Configuração do Pino.
 *
 * LGPD: a base tem CPF, RG, nome e celular de ~12.800 pessoas. Nenhum dado
 * pessoal pode ir para o log de aplicação — daí o `redact` abaixo. Ao
 * acrescentar um campo pessoal a um payload, acrescente também aqui.
 */

import type { FastifyServerOptions } from 'fastify';
import { env, ehProducao } from '../config/env.js';

const CAMINHOS_SENSIVEIS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.senha',
  'req.body.novaSenha',
  'req.body.senhaAtual',
  'req.body.documento',
  'req.body.celular',
  'req.body.nome',
  'req.body.acompanhantes',
  'res.headers["set-cookie"]',
];

export const opcoesDeLog: FastifyServerOptions['logger'] = {
  level: env.LOG_LEVEL,
  redact: { paths: CAMINHOS_SENSIVEIS, censor: '[oculto]' },
  ...(ehProducao
    ? {}
    : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }),
};
