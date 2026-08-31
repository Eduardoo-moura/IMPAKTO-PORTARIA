/**
 * Configuração por ambiente, validada na subida.
 *
 * Nenhum segredo no código (briefing §11). Se faltar variável obrigatória o
 * processo morre aqui, com a lista do que falta — nunca sobe pela metade e
 * quebra no primeiro request.
 */

import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default('0.0.0.0'),

  /** postgresql://usuario:senha@host:5432/impakto */
  DATABASE_URL: z.string().url(),

  /** Segredo de assinatura do JWT. Em produção, no mínimo 32 caracteres. */
  JWT_SECRET: z.string().min(32),
  /** DV8 — proposta: token curto + refresh longo, para o porteiro não ser
   *  interrompido no turno e a estação abandonada não ficar aberta. */
  JWT_EXPIRACAO: z.string().default('15m'),
  REFRESH_EXPIRACAO_HORAS: z.coerce.number().int().positive().default(12),

  /** DV2 — origens permitidas, separadas por vírgula. Rede interna por padrão. */
  CORS_ORIGENS: z.string().default('http://localhost:5173'),

  /** Fuso da portaria. R12: toda comparação de "hoje" passa por ele. */
  TZ_PORTARIA: z.string().default('America/Sao_Paulo'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  const problemas = resultado.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`Configuração inválida. Corrija o .env:\n${problemas}`);
  process.exit(1);
}

export const env = resultado.data;

export const ehProducao = env.NODE_ENV === 'production';

export const origensPermitidas = env.CORS_ORIGENS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
