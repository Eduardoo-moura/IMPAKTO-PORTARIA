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
/**
 * Zera o schema de teste.
 *
 * Um único TRUNCATE em vez de treze `deleteMany`. Não é micro-otimização: com
 * o banco na nuvem, cada ida e volta custa ~180 ms, e isto roda antes de CADA
 * teste — treze comandos viravam ~2,4 s por teste, o que levava a suíte a mais
 * de dez minutos.
 *
 * `RESTART IDENTITY` zera as sequências, então os ids não crescem sem parar
 * entre execuções; `CASCADE` cuida das chaves estrangeiras sem exigir ordem.
 */
export async function limparBanco(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      auditoria, acesso_acompanhante, acesso, mercadoria,
      veiculo, tipo_veiculo_alias, tipo_veiculo, pessoa, empresa,
      usuario, perfil_permissao, perfil, permissao
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Semeia os perfis do sistema com as permissões mínimas usadas nos testes.
 * Espelha o mapeamento do seed real: nível 1 → ADMINISTRADOR, nível 2 → PORTARIA.
 */
export async function semearPerfis(): Promise<void> {
  // Mesmo conjunto do seed real: o teste tem de ver as mesmas permissões que
  // a produção, senão um 403 legítimo passa despercebido — ou aparece onde
  // não deveria.
  const chaves = [
    'portaria.acesso.ver',
    'portaria.acesso.criar',
    'portaria.acesso.saida',
    'portaria.acesso.sobrescrever_saida',
    'portaria.pessoa.ver',
    'portaria.pessoa.editar',
    'portaria.veiculo.ver',
    'portaria.veiculo.editar',
    'portaria.mercadoria.ver',
    'portaria.mercadoria.registrar',
    'portaria.mercadoria.entregar',
    'portaria.mercadoria.desfazer_entrega',
    'portaria.relatorio.emitir',
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

  const [admin, portaria] = await Promise.all([
    prisma.perfil.create({ data: { nome: PERFIS.ADMINISTRADOR, deSistema: true } }),
    prisma.perfil.create({ data: { nome: PERFIS.PORTARIA, deSistema: true } }),
  ]);

  // Um único createMany para os dois perfis, em vez de um por perfil.
  await prisma.perfilPermissao.createMany({
    data: [
      ...todas.map((p) => ({ perfilId: admin.id, permissaoId: p.id })),
      ...doPorteiro.map((p) => ({ perfilId: portaria.id, permissaoId: p.id })),
    ],
  });
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
