/**
 * Entrada do processo.
 *
 * O desktop migra o schema em runtime, na abertura do app (`Banco.cs`). Aqui
 * isso é papel do Prisma Migrate, executado no deploy — o servidor sobe
 * assumindo que o banco já está na versão certa.
 */

import { env } from './config/env.js';
import { montarApp } from './app.js';
import { prisma } from './infra/prisma.js';

const app = await montarApp();

const encerrar = async (sinal: string): Promise<void> => {
  app.log.info(`${sinal} recebido, encerrando.`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void encerrar('SIGINT'));
process.on('SIGTERM', () => void encerrar('SIGTERM'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`Documentação em http://localhost:${env.PORT}/docs`);
} catch (erro) {
  app.log.error(erro, 'Falha ao subir o servidor');
  process.exit(1);
}
