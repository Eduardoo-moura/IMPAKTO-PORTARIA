/**
 * Mercadorias na portaria.
 *
 * Origem: `Portaria/Frm_Mercadoria.cs` e o painel de pendentes de
 * `Frm_Veiculo.cs`. Encomendas que chegam para funcionários e ficam na
 * portaria até alguém retirar.
 *
 * A tabela `MERCADORIA` do desktop está **vazia** — o módulo é novo e nunca
 * foi usado. Então não há dado legado a preservar aqui: o que se preserva é o
 * comportamento.
 */

import {
  AUDITORIA_ACAO,
  AUDITORIA_TIPO,
  DIAS_NA_LISTA_MERCADORIA,
  diaDaPortaria,
  diaMais,
  inicioDoDia,
  maiusculas,
  normalizarNome,
} from '@impakto/shared';
import type { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { AppError, dadosInvalidos, naoEncontrado } from '../../../infra/errors.js';
import { prisma } from '../../../infra/prisma.js';
import { registrarAuditoria, type OrigemDoEvento } from '../../auditoria/auditoria.service.js';
import type { SessaoDoUsuario } from '../../auth/auth.service.js';

export type MercadoriaNaLista = {
  id: string;
  chegadaEm: string;
  destinatario: string;
  empresa: string | null;
  entregador: string | null;
  usuarioRegistro: string | null;
  entregueEm: string | null;
  retiradoPor: string | null;
  usuarioEntrega: string | null;
};

const comUsuarios = { usuarioRegistro: true, usuarioEntrega: true } as const;
type MercadoriaCarregada = Prisma.MercadoriaGetPayload<{ include: typeof comUsuarios }>;

function paraLista(m: MercadoriaCarregada): MercadoriaNaLista {
  return {
    id: m.id.toString(),
    chegadaEm: m.chegadaEm.toISOString(),
    destinatario: m.destinatario,
    empresa: m.empresaSnapshot,
    entregador: m.entregador,
    usuarioRegistro: m.usuarioRegistro?.login ?? null,
    entregueEm: m.entregueEm?.toISOString() ?? null,
    retiradoPor: m.retiradoPor,
    usuarioEntrega: m.usuarioEntrega?.login ?? null,
  };
}

async function acharMercadoria(id: string): Promise<MercadoriaCarregada> {
  let chave: bigint;
  try {
    chave = BigInt(id);
  } catch {
    throw naoEncontrado('Mercadoria');
  }

  const mercadoria = await prisma.mercadoria.findUnique({ where: { id: chave }, include: comUsuarios });
  if (!mercadoria) throw naoEncontrado('Mercadoria');
  return mercadoria;
}

/**
 * R23 — Registra a chegada.
 *
 * O **único** campo obrigatório é o destinatário. Quem trouxe, de que empresa
 * e qualquer outra informação são opcionais: a encomenda chega no balcão e o
 * porteiro anota o que sabe, sem o formulário travar.
 */
export async function registrarChegada(
  dados: { destinatario: string; empresa?: string | null; entregador?: string | null },
  autor: SessaoDoUsuario,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<MercadoriaNaLista> {
  const destinatario = maiusculas(dados.destinatario);
  if (!destinatario) {
    throw dadosInvalidos('Informe para quem é a mercadoria.', [
      { campo: 'destinatario', mensagem: 'Obrigatório.' },
    ]);
  }

  const empresaTexto = maiusculas(dados.empresa) || null;
  let empresaId: bigint | null = null;
  if (empresaTexto) {
    const empresa = await prisma.empresa.upsert({
      where: { nomeNorm: normalizarNome(empresaTexto) },
      update: {},
      create: { nome: empresaTexto, nomeNorm: normalizarNome(empresaTexto) },
    });
    empresaId = empresa.id;
  }

  const mercadoria = await prisma.mercadoria.create({
    data: {
      destinatario,
      empresaId,
      empresaSnapshot: empresaTexto,
      entregador: maiusculas(dados.entregador) || null,
      usuarioRegistroId: BigInt(autor.id),
      chegadaEm: new Date(),
    },
    include: comUsuarios,
  });

  await registrarAuditoria(
    {
      tipo: AUDITORIA_TIPO.MERCADORIA,
      acao: AUDITORIA_ACAO.CHEGADA_REGISTRADA,
      registro: destinatario,
      detalhe: empresaTexto ? `De ${empresaTexto}` : null,
    },
    { usuarioId: BigInt(autor.id), usuarioLogin: autor.login, usuarioNome: autor.nome },
    origem,
    log,
  );

  return paraLista(mercadoria);
}

/**
 * Confirma a retirada.
 *
 * `retiradoPor` é obrigatório — é o que o diálogo `Frm_RetiradaMercadoria` do
 * desktop pede antes de dar baixa. Sem o nome de quem levou, a baixa não tem
 * valor nenhum: a pergunta que a portaria precisa responder depois é
 * exatamente "quem pegou?".
 *
 * O `CHECK ck_entrega_coerente` do banco garante o mesmo em última instância:
 * ou está entregue COM quem retirou, ou não está entregue.
 */
export async function confirmarEntrega(
  id: string,
  retiradoPor: string,
  autor: SessaoDoUsuario,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<MercadoriaNaLista> {
  const mercadoria = await acharMercadoria(id);

  const nome = maiusculas(retiradoPor);
  if (!nome) {
    throw dadosInvalidos('Informe quem está retirando.', [
      { campo: 'retiradoPor', mensagem: 'Obrigatório.' },
    ]);
  }

  if (mercadoria.entregueEm) {
    throw new AppError(
      409,
      'MERCADORIA_JA_ENTREGUE',
      'Esta mercadoria já foi retirada.',
      undefined,
      {
        retiradoPor: mercadoria.retiradoPor,
        entregueEm: mercadoria.entregueEm.toISOString(),
      },
    );
  }

  const atualizada = await prisma.mercadoria.update({
    where: { id: mercadoria.id },
    data: { entregueEm: new Date(), retiradoPor: nome, usuarioEntregaId: BigInt(autor.id) },
    include: comUsuarios,
  });

  await registrarAuditoria(
    {
      tipo: AUDITORIA_TIPO.MERCADORIA,
      acao: AUDITORIA_ACAO.ENTREGA_CONFIRMADA,
      registro: mercadoria.destinatario,
      detalhe: `Retirada por ${nome}`,
    },
    { usuarioId: BigInt(autor.id), usuarioLogin: autor.login, usuarioNome: autor.nome },
    origem,
    log,
  );

  return paraLista(atualizada);
}

/**
 * R24 — Desfaz a entrega.
 *
 * Reversível, mas **rastreada**: a trilha guarda quem havia retirado, quando e
 * quem liberou. É o que o desktop faz ao limpar os quatro campos, e é o que
 * transforma "apaguei sem querer" em algo auditável em vez de invisível.
 */
export async function desfazerEntrega(
  id: string,
  autor: SessaoDoUsuario,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<MercadoriaNaLista> {
  const mercadoria = await acharMercadoria(id);

  if (!mercadoria.entregueEm) {
    throw dadosInvalidos('Esta mercadoria ainda está na portaria — não há entrega a desfazer.');
  }

  const anterior = {
    retiradoPor: mercadoria.retiradoPor,
    entregueEm: mercadoria.entregueEm.toISOString(),
    liberadaPor: mercadoria.usuarioEntrega?.login ?? null,
  };

  const atualizada = await prisma.mercadoria.update({
    where: { id: mercadoria.id },
    data: { entregueEm: null, retiradoPor: null, usuarioEntregaId: null },
    include: comUsuarios,
  });

  await registrarAuditoria(
    {
      tipo: AUDITORIA_TIPO.MERCADORIA,
      acao: AUDITORIA_ACAO.ENTREGA_DESFEITA,
      registro: mercadoria.destinatario,
      detalhe: `Desfeita a retirada de ${anterior.retiradoPor}, liberada por ${anterior.liberadaPor ?? '(desconhecido)'}`,
      // O estado apagado fica na trilha: é a única cópia que resta dele.
      dados: { anterior },
    },
    { usuarioId: BigInt(autor.id), usuarioLogin: autor.login, usuarioNome: autor.nome },
    origem,
    log,
  );

  return paraLista(atualizada);
}

/**
 * R25 — Lista dos últimos N dias.
 *
 * O desktop mostra 7 dias e pinta as entregues de verde. O filtro
 * `somentePendentes` alimenta o painel da tela principal (R26), que responde a
 * pergunta do porteiro: o que ainda está aqui?
 *
 * As pendentes **ignoram a janela de dias**: uma encomenda parada há um mês
 * continua parada, e sumir da lista não a faz ser entregue.
 */
export async function listarMercadorias(opcoes: {
  dias?: number;
  somentePendentes?: boolean;
}): Promise<{ mercadorias: MercadoriaNaLista[]; pendentes: number; dias: number }> {
  const dias = opcoes.dias ?? DIAS_NA_LISTA_MERCADORIA;
  const desde = inicioDoDia(diaMais(-(dias - 1), diaDaPortaria()));

  const onde: Prisma.MercadoriaWhereInput = opcoes.somentePendentes
    ? { entregueEm: null }
    : { OR: [{ chegadaEm: { gte: desde } }, { entregueEm: null }] };

  const [mercadorias, pendentes] = await Promise.all([
    prisma.mercadoria.findMany({ where: onde, include: comUsuarios, orderBy: { chegadaEm: 'desc' } }),
    prisma.mercadoria.count({ where: { entregueEm: null } }),
  ]);

  return { mercadorias: mercadorias.map(paraLista), pendentes, dias };
}
