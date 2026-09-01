/**
 * Testes de integração da consulta de auditoria.
 *
 * A trilha é append-only e é a única defesa contra "quem foi que fez isso?"
 * num sistema operado por três turnos. Os testes cobrem o que a tela do
 * desktop entrega: período padrão de 7 dias, filtros e ordem cronológica
 * inversa.
 */

import { AUDITORIA_TIPO, diaDaPortaria, diaMais, instanteLocal } from '@impakto/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../infra/prisma.js';
import { criarUsuario, entrar, limparBanco, semearPerfis, subirApp } from '../../testes/apoio.js';

let app: FastifyInstance;
let admin: { authorization: string };

beforeAll(async () => {
  app = await subirApp();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparBanco();
  await semearPerfis();
  await criarUsuario({ login: 'CHEFE', nome: 'CHEFE', perfil: 'ADMINISTRADOR' });
  admin = (await entrar(app, 'CHEFE')).autorizacao;
});

const como = (headers: { authorization: string }) => ({ headers });

/** Grava um evento numa data específica, para exercitar o filtro de período. */
async function eventoEm(dia: string, hora: string, dados: Partial<{ tipo: string; acao: string; usuarioLogin: string }>) {
  return prisma.auditoria.create({
    data: {
      em: instanteLocal(`${dia} ${hora}`),
      tipo: dados.tipo ?? AUDITORIA_TIPO.VEICULO,
      acao: dados.acao ?? 'ENTRADA REGISTRADA',
      usuarioLogin: dados.usuarioLogin ?? 'BRAS',
      usuarioNome: dados.usuarioLogin ?? 'BRAS',
    },
  });
}

async function consultar(query = '', headers = admin) {
  const r = await app.inject({ method: 'GET', url: `/api/auditoria${query}`, ...como(headers) });
  return { status: r.statusCode, corpo: r.json() };
}

describe('R29 — só quem tem auditoria.ver', () => {
  it('porteiro recebe 403; sem sessão, 401', async () => {
    await criarUsuario({ login: 'PORTEIRO' });
    const { autorizacao } = await entrar(app, 'PORTEIRO');

    expect((await consultar('', autorizacao)).status).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/auditoria' })).statusCode).toBe(401);
  });
});

describe('período', () => {
  it('sem filtro, traz os últimos 7 dias — o mesmo padrão da tela do desktop', async () => {
    const hoje = diaDaPortaria();
    await eventoEm(hoje, '10:00:00', { acao: 'DE HOJE' });
    await eventoEm(diaMais(-6, hoje), '10:00:00', { acao: 'DENTRO DA JANELA' });
    await eventoEm(diaMais(-7, hoje), '10:00:00', { acao: 'FORA DA JANELA' });

    const { corpo } = await consultar();
    const acoes = corpo.eventos.map((e: { acao: string }) => e.acao);

    expect(acoes).toContain('DE HOJE');
    expect(acoes).toContain('DENTRO DA JANELA');
    expect(acoes).not.toContain('FORA DA JANELA');
    expect(corpo.de).toBe(diaMais(-6, hoje));
    expect(corpo.ate).toBe(hoje);
  });

  it('R36 — o limite superior é EXCLUSIVO, mas o dia final entra inteiro', async () => {
    const dia = '2026-08-20';
    await eventoEm(dia, '23:59:59', { acao: 'ULTIMO INSTANTE DO DIA' });
    await eventoEm(diaMais(1, dia), '00:00:01', { acao: 'DIA SEGUINTE' });

    const { corpo } = await consultar(`?de=${dia}&ate=${dia}`);
    const acoes = corpo.eventos.map((e: { acao: string }) => e.acao);

    expect(acoes).toContain('ULTIMO INSTANTE DO DIA');
    expect(acoes).not.toContain('DIA SEGUINTE');
  });

  it('R12 — o corte do dia é no fuso da portaria, não em UTC', async () => {
    // 22h em São Paulo já é o dia seguinte em UTC. Se a consulta usasse UTC,
    // este evento sumiria da consulta do próprio dia em que foi gravado.
    const dia = '2026-08-20';
    await eventoEm(dia, '22:30:00', { acao: 'TURNO DA NOITE' });

    const { corpo } = await consultar(`?de=${dia}&ate=${dia}`);
    expect(corpo.eventos.map((e: { acao: string }) => e.acao)).toContain('TURNO DA NOITE');
  });

  it('recusa data final anterior à inicial', async () => {
    const r = await consultar('?de=2026-08-20&ate=2026-08-10');
    expect(r.status).toBe(400);
    expect(r.corpo.erro.codigo).toBe('PERIODO_INVALIDO');
  });

  it('recusa data em formato inesperado em vez de inventar um período', async () => {
    expect((await consultar('?de=20/08/2026')).status).toBe(400);
  });
});

describe('filtros', () => {
  it('filtra por tipo, por ação e por usuário', async () => {
    const hoje = diaDaPortaria();
    await eventoEm(hoje, '08:00:00', { tipo: 'VEICULO', acao: 'ENTRADA REGISTRADA', usuarioLogin: 'BRAS' });
    await eventoEm(hoje, '09:00:00', { tipo: 'VEICULO', acao: 'SAIDA REGISTRADA', usuarioLogin: 'BRAS' });
    await eventoEm(hoje, '10:00:00', { tipo: 'MERCADORIA', acao: 'CHEGADA REGISTRADA', usuarioLogin: 'OTAVIO' });

    expect((await consultar('?tipo=MERCADORIA')).corpo.total).toBe(1);
    expect((await consultar('?acao=SAIDA REGISTRADA')).corpo.total).toBe(1);
    expect((await consultar('?usuario=BRAS')).corpo.total).toBe(2);
    // O login foi gravado em maiúsculas; o filtro não deve depender da caixa.
    expect((await consultar('?usuario=bras')).corpo.total).toBe(2);
  });

  it('recusa tipo fora dos quatro do desktop', async () => {
    expect((await consultar('?tipo=INVENTADO')).status).toBe(400);
  });

  it('os filtros saem da própria trilha, inclusive de usuário já removido', async () => {
    const hoje = diaDaPortaria();
    await eventoEm(hoje, '08:00:00', { acao: 'ACAO NOVA', usuarioLogin: 'JA.REMOVIDO' });

    const r = await app.inject({ method: 'GET', url: '/api/auditoria/filtros', ...como(admin) });
    expect(r.json().acoes).toContain('ACAO NOVA');
    // R37 — o login continua filtrável mesmo sem usuário correspondente.
    expect(r.json().usuarios).toContain('JA.REMOVIDO');
  });
});

describe('ordem e paginação', () => {
  it('vem do mais recente para o mais antigo', async () => {
    const hoje = diaDaPortaria();
    await eventoEm(hoje, '08:00:00', { acao: 'PRIMEIRA' });
    await eventoEm(hoje, '12:00:00', { acao: 'SEGUNDA' });
    await eventoEm(hoje, '18:00:00', { acao: 'TERCEIRA' });

    // Filtra pelo autor fabricado: o LOGIN do próprio CHEFE, gravado no
    // beforeEach com a hora corrente, cairia no meio da sequência.
    const acoes = (await consultar('?usuario=BRAS')).corpo.eventos.map((e: { acao: string }) => e.acao);
    expect(acoes).toEqual(['TERCEIRA', 'SEGUNDA', 'PRIMEIRA']);
  });

  it('pagina sem perder o total', async () => {
    const hoje = diaDaPortaria();
    for (let i = 0; i < 5; i++) await eventoEm(hoje, `0${i + 1}:00:00`, { acao: `EVENTO ${i}` });

    const pagina1 = await consultar('?porPagina=2&pagina=1');
    const pagina2 = await consultar('?porPagina=2&pagina=2');

    expect(pagina1.corpo.eventos).toHaveLength(2);
    expect(pagina2.corpo.eventos).toHaveLength(2);
    // O login do CHEFE também gera evento, então o total é maior que 5.
    expect(pagina1.corpo.total).toBeGreaterThanOrEqual(5);
    expect(pagina1.corpo.eventos[0].id).not.toBe(pagina2.corpo.eventos[0].id);
  });

  it('limita quantos eventos podem ser pedidos de uma vez', async () => {
    expect((await consultar('?porPagina=5000')).status).toBe(400);
  });
});

describe('a trilha é append-only', () => {
  it('não existe rota para alterar nem apagar evento', async () => {
    const hoje = diaDaPortaria();
    const evento = await eventoEm(hoje, '08:00:00', { acao: 'IMUTAVEL' });

    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      const r = await app.inject({ method, url: `/api/auditoria/${evento.id}`, ...como(admin) });
      expect(r.statusCode).toBe(404);
    }

    expect((await consultar()).corpo.eventos.map((e: { acao: string }) => e.acao)).toContain('IMUTAVEL');
  });
});
