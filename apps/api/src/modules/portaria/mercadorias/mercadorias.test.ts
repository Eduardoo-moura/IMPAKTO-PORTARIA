/**
 * Testes de integração das mercadorias.
 *
 * Origem: `Frm_Mercadoria.cs`. A tabela do desktop está vazia — o módulo nunca
 * chegou a ser usado —, então o que se compara aqui é comportamento, não dado.
 */

import { AUDITORIA_ACAO, instanteLocal, diaDaPortaria, diaMais } from '@impakto/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../../infra/prisma.js';
import {
  auditoriaRecente,
  criarUsuario,
  entrar,
  limparBanco,
  semearPerfis,
  subirApp,
} from '../../../testes/apoio.js';

let app: FastifyInstance;
let porteiro: { authorization: string };

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
  await criarUsuario({ login: 'BRAS', nome: 'BRAS SILVA' });
  porteiro = (await entrar(app, 'BRAS')).autorizacao;
});

const como = (h = porteiro) => ({ headers: h });

async function chegada(corpo: Record<string, unknown>, h = porteiro) {
  const r = await app.inject({ method: 'POST', url: '/api/portaria/mercadorias', ...como(h), payload: corpo });
  return { status: r.statusCode, corpo: r.json() };
}

async function listar(query = '') {
  const r = await app.inject({ method: 'GET', url: `/api/portaria/mercadorias${query}`, ...como() });
  return { status: r.statusCode, corpo: r.json() };
}

async function entregar(id: string, retiradoPor: string) {
  const r = await app.inject({
    method: 'POST',
    url: `/api/portaria/mercadorias/${id}/entrega`,
    ...como(),
    payload: { retiradoPor },
  });
  return { status: r.statusCode, corpo: r.json() };
}

async function desfazer(id: string) {
  const r = await app.inject({
    method: 'DELETE',
    url: `/api/portaria/mercadorias/${id}/entrega`,
    ...como(),
  });
  return { status: r.statusCode, corpo: r.json() };
}

describe('R23 — só o destinatário é obrigatório', () => {
  it('grava com o mínimo', async () => {
    const r = await chegada({ destinatario: 'maria da silva' });

    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({
      destinatario: 'MARIA DA SILVA',
      empresa: null,
      entregador: null,
      entregueEm: null,
      retiradoPor: null,
      usuarioRegistro: 'BRAS',
    });
  });

  it('recusa sem destinatário', async () => {
    expect((await chegada({})).status).toBe(400);
    expect((await chegada({ destinatario: '   ' })).status).toBe(422);
  });

  it('guarda empresa e entregador quando informados, em maiúsculas', async () => {
    const r = await chegada({
      destinatario: 'joão',
      empresa: 'correios',
      entregador: 'carteiro josé',
    });

    expect(r.corpo).toMatchObject({
      destinatario: 'JOÃO',
      empresa: 'CORREIOS',
      entregador: 'CARTEIRO JOSÉ',
    });
  });

  it('a empresa vira cadastro, sem duplicar por caixa ou acento', async () => {
    await chegada({ destinatario: 'A', empresa: 'Logística ABC' });
    await chegada({ destinatario: 'B', empresa: 'LOGISTICA ABC' });

    expect(await prisma.empresa.count()).toBe(1);
  });

  it('audita CHEGADA REGISTRADA com o destinatário', async () => {
    await chegada({ destinatario: 'DESTINO', empresa: 'REMETENTE' });

    expect((await auditoriaRecente(1))[0]).toMatchObject({
      tipo: 'MERCADORIA',
      acao: AUDITORIA_ACAO.CHEGADA_REGISTRADA,
      registro: 'DESTINO',
      detalhe: 'De REMETENTE',
      usuarioLogin: 'BRAS',
    });
  });
});

describe('retirada', () => {
  it('exige o nome de quem está retirando', async () => {
    const m = await chegada({ destinatario: 'ALGUEM' });

    const semNome = await app.inject({
      method: 'POST',
      url: `/api/portaria/mercadorias/${m.corpo.id}/entrega`,
      ...como(),
      payload: {},
    });
    expect(semNome.statusCode).toBe(400);

    // Espaço em branco também não vale: a baixa precisa responder "quem pegou?".
    expect((await entregar(m.corpo.id, '   ')).status).toBe(422);
  });

  it('confirma a retirada e registra quem liberou', async () => {
    const m = await chegada({ destinatario: 'ENCOMENDA' });
    const r = await entregar(m.corpo.id, 'pedro porteiro');

    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ retiradoPor: 'PEDRO PORTEIRO', usuarioEntrega: 'BRAS' });
    expect(r.corpo.entregueEm).not.toBeNull();
  });

  it('recusa retirar duas vezes, dizendo quem já levou', async () => {
    const m = await chegada({ destinatario: 'UNICA' });
    await entregar(m.corpo.id, 'PRIMEIRO');

    const segunda = await entregar(m.corpo.id, 'SEGUNDO');
    expect(segunda.status).toBe(409);
    expect(segunda.corpo.erro.codigo).toBe('MERCADORIA_JA_ENTREGUE');
    expect(segunda.corpo.erro.contexto.retiradoPor).toBe('PRIMEIRO');
  });

  it('audita ENTREGA CONFIRMADA', async () => {
    const m = await chegada({ destinatario: 'AUDITADA' });
    await entregar(m.corpo.id, 'QUEM LEVOU');

    expect((await auditoriaRecente(1))[0]).toMatchObject({
      acao: AUDITORIA_ACAO.ENTREGA_CONFIRMADA,
      registro: 'AUDITADA',
      detalhe: 'Retirada por QUEM LEVOU',
    });
  });

  it('404 em mercadoria que não existe', async () => {
    expect((await entregar('999999', 'ALGUEM')).status).toBe(404);
  });
});

describe('R24 — desfazer a entrega é reversível, mas rastreado', () => {
  it('volta a mercadoria para a portaria', async () => {
    const m = await chegada({ destinatario: 'VOLTOU' });
    await entregar(m.corpo.id, 'ENGANO');

    const r = await desfazer(m.corpo.id);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ entregueEm: null, retiradoPor: null, usuarioEntrega: null });
  });

  it('a trilha guarda o que foi apagado — é a única cópia que resta', async () => {
    const m = await chegada({ destinatario: 'RASTREADA' });
    const entregue = await entregar(m.corpo.id, 'QUEM PEGOU');

    await desfazer(m.corpo.id);

    const [evento] = await auditoriaRecente(1);
    expect(evento).toMatchObject({ acao: AUDITORIA_ACAO.ENTREGA_DESFEITA, registro: 'RASTREADA' });
    expect(evento!.detalhe).toContain('QUEM PEGOU');
    expect(evento!.dados).toMatchObject({
      anterior: { retiradoPor: 'QUEM PEGOU', entregueEm: entregue.corpo.entregueEm, liberadaPor: 'BRAS' },
    });
  });

  it('recusa desfazer o que nunca foi entregue', async () => {
    const m = await chegada({ destinatario: 'AINDA AQUI' });
    expect((await desfazer(m.corpo.id)).status).toBe(422);
  });

  it('depois de desfeita, pode ser retirada de novo', async () => {
    const m = await chegada({ destinatario: 'SEGUNDA CHANCE' });
    await entregar(m.corpo.id, 'ERRADO');
    await desfazer(m.corpo.id);

    const r = await entregar(m.corpo.id, 'CERTO');
    expect(r.status).toBe(200);
    expect(r.corpo.retiradoPor).toBe('CERTO');
  });
});

describe('R25, R26 — a lista e o painel de pendentes', () => {
  /** Coloca a chegada numa data passada, para exercitar a janela de dias. */
  async function moverParaODia(id: string, dia: string) {
    await prisma.mercadoria.update({
      where: { id: BigInt(id) },
      data: { chegadaEm: instanteLocal(`${dia} 10:00:00`) },
    });
  }

  it('mostra os últimos 7 dias por padrão', async () => {
    const dentro = await chegada({ destinatario: 'DENTRO DA JANELA' });
    const fora = await chegada({ destinatario: 'FORA DA JANELA' });
    await moverParaODia(dentro.corpo.id, diaMais(-6));
    await moverParaODia(fora.corpo.id, diaMais(-30));
    // Ambas entregues: só as pendentes escapam da janela.
    await entregar(dentro.corpo.id, 'X');
    await entregar(fora.corpo.id, 'X');

    const nomes = (await listar()).corpo.mercadorias.map((m: { destinatario: string }) => m.destinatario);
    expect(nomes).toContain('DENTRO DA JANELA');
    expect(nomes).not.toContain('FORA DA JANELA');
  });

  it('PENDENTE ANTIGA continua aparecendo — sumir da lista não a faz ser entregue', async () => {
    const antiga = await chegada({ destinatario: 'PARADA HA UM MES' });
    await moverParaODia(antiga.corpo.id, diaMais(-30));

    const r = await listar();
    const nomes = r.corpo.mercadorias.map((m: { destinatario: string }) => m.destinatario);
    expect(nomes).toContain('PARADA HA UM MES');
    expect(r.corpo.pendentes).toBe(1);
  });

  it('o filtro de pendentes alimenta o painel da tela principal', async () => {
    const entregue = await chegada({ destinatario: 'JA RETIRADA' });
    await chegada({ destinatario: 'AINDA AQUI' });
    await entregar(entregue.corpo.id, 'ALGUEM');

    const todas = await listar();
    const pendentes = await listar('?somentePendentes=true');

    expect(todas.corpo.mercadorias).toHaveLength(2);
    expect(pendentes.corpo.mercadorias).toHaveLength(1);
    expect(pendentes.corpo.mercadorias[0].destinatario).toBe('AINDA AQUI');
    // A contagem descreve a portaria, não a tela: não muda com o filtro.
    expect(todas.corpo.pendentes).toBe(1);
    expect(pendentes.corpo.pendentes).toBe(1);
  });

  it('vem da mais recente para a mais antiga', async () => {
    const a = await chegada({ destinatario: 'PRIMEIRA' });
    const b = await chegada({ destinatario: 'SEGUNDA' });
    await moverParaODia(a.corpo.id, diaMais(-3));
    await moverParaODia(b.corpo.id, diaMais(-1));

    const nomes = (await listar()).corpo.mercadorias.map((m: { destinatario: string }) => m.destinatario);
    expect(nomes).toEqual(['SEGUNDA', 'PRIMEIRA']);
  });

  it('R12 — a janela conta pelo dia da portaria', async () => {
    const noite = await chegada({ destinatario: 'CHEGOU A NOITE' });
    // 22h30 de hoje já é o dia seguinte em UTC.
    await prisma.mercadoria.update({
      where: { id: BigInt(noite.corpo.id) },
      data: { chegadaEm: instanteLocal(`${diaDaPortaria()} 22:30:00`), entregueEm: new Date(), retiradoPor: 'X' },
    });

    const nomes = (await listar()).corpo.mercadorias.map((m: { destinatario: string }) => m.destinatario);
    expect(nomes).toContain('CHEGOU A NOITE');
  });
});

describe('R29 — autorização', () => {
  it('sem sessão, 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/portaria/mercadorias' })).statusCode).toBe(401);
  });

  it('perfil que só vê não registra nem entrega', async () => {
    const perfil = await prisma.perfil.create({ data: { nome: 'SO_VE_MERCADORIA' } });
    const ver = await prisma.permissao.findUniqueOrThrow({ where: { chave: 'portaria.mercadoria.ver' } });
    await prisma.perfilPermissao.create({ data: { perfilId: perfil.id, permissaoId: ver.id } });

    await criarUsuario({ login: 'OLHEIRO', perfil: 'SO_VE_MERCADORIA' });
    const dele = (await entrar(app, 'OLHEIRO')).autorizacao;

    const listou = await app.inject({ method: 'GET', url: '/api/portaria/mercadorias', ...como(dele) });
    expect(listou.statusCode).toBe(200);
    expect((await chegada({ destinatario: 'X' }, dele)).status).toBe(403);
  });
});

describe('coerência no banco', () => {
  it('o CHECK impede entrega sem quem retirou, mesmo por escrita direta', async () => {
    const m = await chegada({ destinatario: 'COERENTE' });

    // O serviço já exige o nome; isto confirma a rede de segurança do banco.
    await expect(
      prisma.mercadoria.update({
        where: { id: BigInt(m.corpo.id) },
        data: { entregueEm: new Date(), retiradoPor: null },
      }),
    ).rejects.toThrow();
  });
});
