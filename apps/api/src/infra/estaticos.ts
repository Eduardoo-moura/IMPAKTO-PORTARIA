/**
 * Serve o frontend compilado a partir da própria API.
 *
 * Em desenvolvimento, o Vite roda em 5173 e faz proxy de `/api`. Em
 * homologação e produção não há dois servidores: o build do frontend é
 * entregue pelo mesmo processo, então existe **uma URL só** — que é o que a
 * portaria vai digitar no navegador do balcão.
 *
 * Só é registrado se `dist/` existir; sem o build, a API sobe normal
 * e responde apenas as rotas de dados.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

const aqui = dirname(fileURLToPath(import.meta.url));

/**
 * `dist/` na raiz do repositório — é onde o Vite escreve, e o mesmo diretório
 * que o Vercel publica. Vale tanto rodando de `apps/api/dist/infra` (build)
 * quanto de `apps/api/src/infra` (tsx).
 */
export const PASTA_DO_FRONTEND = resolve(aqui, '..', '..', '..', '..', 'dist');

export async function registrarFrontend(app: FastifyInstance): Promise<boolean> {
  if (!existsSync(join(PASTA_DO_FRONTEND, 'index.html'))) {
    app.log.warn(
      `Frontend não encontrado em ${PASTA_DO_FRONTEND}. Rode "npm run build" para servi-lo por esta URL.`,
    );
    return false;
  }

  await app.register(fastifyStatic, { root: PASTA_DO_FRONTEND, index: ['index.html'] });

  // O roteamento é do lado do cliente: qualquer caminho que não seja da API
  // devolve o index.html, para dar F5 numa rota interna não cair em 404.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/docs')) {
      return reply.status(404).send({
        erro: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: `Rota ${req.method} ${req.url} não existe.` },
      });
    }
    return reply.sendFile('index.html');
  });

  return true;
}
