/**
 * Gravação da trilha de auditoria.
 *
 * R34 — A FALHA AO GRAVAR AQUI NUNCA DERRUBA A OPERAÇÃO DE NEGÓCIO.
 * O desktop engole a exceção num `try/catch` de propósito, e a propriedade é
 * mantida: auditoria que quebra o cadastro de entrada vira, na prática,
 * incentivo para desligar a auditoria. O erro vai para o log da aplicação.
 *
 * R33 — `usuarioNome` é congelado no momento do evento. Guardar só a FK faria
 * a trilha inteira mudar quando alguém fosse renomeado.
 *
 * A gravação roda **fora** da transação de negócio, pelo mesmo motivo.
 */

import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import type { AuditoriaTipo } from '@impakto/shared';

import { prisma } from '../../infra/prisma.js';

export type EventoDeAuditoria = {
  tipo: AuditoriaTipo;
  acao: string;
  /** Identificador do alvo: placa, id, login. */
  registro?: string | null;
  detalhe?: string | null;
  /** Antes/depois, quando fizer sentido — ex.: entrega desfeita (R24). */
  dados?: Record<string, unknown> | null;
};

export type AutorDoEvento = {
  usuarioId?: bigint | null;
  usuarioLogin?: string | null;
  usuarioNome?: string | null;
};

export type OrigemDoEvento = {
  ip?: string | null;
  /** Nome da estação. No desktop vem de `Environment.MachineName`. */
  maquina?: string | null;
};

/**
 * Registra o evento. Nunca lança.
 *
 * O autor é passado explicitamente em vez de lido de uma sessão global porque
 * `LOGIN RECUSADO` acontece quando ainda não há sessão nenhuma — é o
 * equivalente ao `RegistrarComo(login, nome, ...)` do desktop.
 */
export async function registrarAuditoria(
  evento: EventoDeAuditoria,
  autor: AutorDoEvento = {},
  origem: OrigemDoEvento = {},
  log?: FastifyBaseLogger,
): Promise<void> {
  try {
    await prisma.auditoria.create({
      data: {
        tipo: evento.tipo,
        acao: evento.acao,
        registro: evento.registro ?? null,
        detalhe: evento.detalhe ?? null,
        dados: (evento.dados ?? undefined) as never,
        usuarioId: autor.usuarioId ?? null,
        usuarioLogin: autor.usuarioLogin ?? null,
        usuarioNome: autor.usuarioNome ?? null,
        ip: origem.ip ?? null,
        maquina: origem.maquina ?? null,
      },
    });
  } catch (erro) {
    // Deliberado: a operação de negócio segue mesmo sem a trilha.
    log?.error({ erro, evento }, 'Falha ao gravar auditoria — operação mantida');
  }
}

/** Extrai IP e estação da requisição, sem carregar dado pessoal junto. */
export function origemDaRequisicao(req: FastifyRequest): OrigemDoEvento {
  const maquina = req.headers['x-estacao'];
  return {
    ip: req.ip ?? null,
    maquina: typeof maquina === 'string' && maquina.trim() ? maquina.trim().slice(0, 100) : null,
  };
}
