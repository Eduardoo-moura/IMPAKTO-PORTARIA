/**
 * Apoio aos testes de integração: sobe a aplicação de verdade contra o banco
 * de teste, sem mocks. O que passa aqui é o que o porteiro vai encontrar.
 */

import { PERFIS } from '@impakto/shared';
import { gerarHash } from '@impakto/shared/senha';
import type { FastifyInstance } from 'fastify';

import { montarApp } from '../app.js';
import { prisma } from '../infra/prisma.js';

export const SENHA_PADRAO = 'portaria2026';

export async function subirApp(): Promise<FastifyInstance> {
  const app = await montarApp();
  await app.ready();
  return app;
}

/** Zera o que os testes criam. Perfis e permissões são resemeados. */
export async function limparBanco(): Promise<void> {
  await prisma.auditoria.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.perfilPermissao.deleteMany();
  await prisma.perfil.deleteMany();
  await prisma.permissao.deleteMany();
}

/**
 * Semeia os perfis do sistema com as permissões mínimas usadas nos testes.
 * Espelha o mapeamento do seed real: nível 1 → ADMINISTRADOR, nível 2 → PORTARIA.
 */
export async function semearPerfis(): Promise<void> {
  const chaves = [
    'portaria.acesso.ver',
    'portaria.acesso.criar',
    'portaria.dashboard.ver',
    'usuario.ver',
    'usuario.editar',
    'auditoria.ver',
  ];

  await prisma.permissao.createMany({
    data: chaves.map((chave) => ({ chave, modulo: chave.split('.')[0]!, descricao: chave })),
    skipDuplicates: true,
  });

  const todas = await prisma.permissao.findMany();
  const doPorteiro = todas.filter((p) => p.modulo === 'portaria');

  for (const [nome, permissoes] of [
    [PERFIS.ADMINISTRADOR, todas],
    [PERFIS.PORTARIA, doPorteiro],
  ] as const) {
    const perfil = await prisma.perfil.create({ data: { nome, deSistema: true } });
    await prisma.perfilPermissao.createMany({
      data: permissoes.map((p) => ({ perfilId: perfil.id, permissaoId: p.id })),
    });
  }
}

export async function criarUsuario(opcoes: {
  login: string;
  nome?: string;
  senha?: string;
  perfil?: string;
  ativo?: boolean;
  trocarSenha?: boolean;
}) {
  const perfil = await prisma.perfil.findUniqueOrThrow({
    where: { nome: opcoes.perfil ?? PERFIS.PORTARIA },
  });

  return prisma.usuario.create({
    data: {
      login: opcoes.login,
      loginNorm: opcoes.login.toUpperCase(),
      nome: opcoes.nome ?? opcoes.login.toUpperCase(),
      senhaHash: await gerarHash(opcoes.senha ?? SENHA_PADRAO),
      perfilId: perfil.id,
      ativo: opcoes.ativo ?? true,
      trocarSenha: opcoes.trocarSenha ?? false,
      nivelLegado: (opcoes.perfil ?? PERFIS.PORTARIA) === PERFIS.ADMINISTRADOR ? 1 : 2,
    },
  });
}

/**
 * IP diferente a cada chamada.
 *
 * O limite de tentativas do /login é por IP. Sem isto, a suíte inteira sairia
 * do mesmo endereço e se estrangularia sozinha a partir da décima chamada —
 * mascarando os testes de comportamento. O limite continua ligado e tem teste
 * próprio, que usa um IP fixo de propósito.
 */
let contadorDeIp = 0;
export const ipDeTeste = (): string => {
  contadorDeIp += 1;
  return `10.${(contadorDeIp >> 16) & 255}.${(contadorDeIp >> 8) & 255}.${contadorDeIp & 255}`;
};

type ResultadoDeLogin = {
  status: number;
  corpo: any;
  token: string | undefined;
  /** Derivado da própria resposta: o tipo Cookie do light-my-request não é
   *  exportável a partir daqui. */
  cookieRefresh: Awaited<ReturnType<FastifyInstance['inject']>>['cookies'][number] | undefined;
  autorizacao: { authorization: string };
};

/** Faz login e devolve o token e o cookie de refresh, como o navegador teria. */
export async function entrar(
  app: FastifyInstance,
  login: string,
  senha = SENHA_PADRAO,
  ip = ipDeTeste(),
): Promise<ResultadoDeLogin> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login, senha },
    remoteAddress: ip,
  });

  const corpo = resposta.json();
  return {
    status: resposta.statusCode,
    corpo,
    token: corpo?.token as string | undefined,
    cookieRefresh: resposta.cookies.find((c) => c.name === 'impakto_refresh'),
    autorizacao: { authorization: `Bearer ${corpo?.token}` },
  };
}

/** Últimos eventos de auditoria, do mais recente para o mais antigo. */
export async function auditoriaRecente(quantos = 5) {
  return prisma.auditoria.findMany({ orderBy: { id: 'desc' }, take: quantos });
}
