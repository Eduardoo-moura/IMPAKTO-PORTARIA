/**
 * Montagem do servidor.
 *
 * Cada setor da empresa é um plugin isolado, registrado com prefixo próprio.
 * Acrescentar Compras é criar `modules/compras/` e uma linha aqui — nada do
 * que já existe é tocado (briefing §4 e §15).
 */

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { ehProducao, env, origensPermitidas } from './config/env.js';
import { registrarTratamentoDeErros } from './infra/errors.js';
import { opcoesDeLog } from './infra/logger.js';
import { rotasDeSaude } from './modules/saude/saude.routes.js';

export async function montarApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opcoesDeLog,
    trustProxy: true,
    // O porteiro digita em maiúsculas e cola texto; nada aqui é grande.
    bodyLimit: 1_048_576,
  }).withTypeProvider<ZodTypeProvider>();

  // Um schema Zod serve para validar, tipar e documentar.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, { contentSecurityPolicy: ehProducao });

  await app.register(cors, {
    origin: origensPermitidas,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  await app.register(cookie);

  // Barreira contra força bruta no login. Ajustar por rota quando necessário.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Impakto — API',
        description:
          'API modular por setor. Fase 1: Portaria. As regras de negócio têm origem no sistema desktop C# e estão rastreadas em docs/00-LEVANTAMENTO-E-ARQUITETURA.md.',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${env.PORT}` }],
      tags: [
        { name: 'saude', description: 'Verificação de disponibilidade' },
        { name: 'auth', description: 'Login, sessão e troca de turno' },
        { name: 'portaria', description: 'Controle de acesso, mercadorias e relatórios' },
        { name: 'usuarios', description: 'Cadastro de usuários e perfis' },
        { name: 'auditoria', description: 'Trilha de auditoria' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  if (!ehProducao) {
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  registrarTratamentoDeErros(app);

  // ------------------------------------------------------------- módulos
  await app.register(rotasDeSaude);

  // Fase 1 — segurança:
  // await app.register(modAuth, { prefix: '/api/auth' });
  // await app.register(modUsuarios, { prefix: '/api/usuarios' });
  // await app.register(modAuditoria, { prefix: '/api/auditoria' });

  // Fase 2 e 3 — o setor:
  // await app.register(modPortaria, { prefix: '/api/portaria' });

  // Setores futuros entram exatamente da mesma forma:
  // await app.register(modCompras, { prefix: '/api/compras' });

  return app;
}
