/**
 * Controle de acesso — o núcleo do sistema.
 *
 * Origem: `Portaria/Frm_Veiculo.cs`, a tela principal do desktop (1.375 linhas).
 * Cada bloco daqui cita a regra rastreada em
 * docs/00-LEVANTAMENTO-E-ARQUITETURA.md; alterar o comportamento sem alterar a
 * regra correspondente é mudar o sistema sem querer.
 */

import {
  AUDITORIA_ACAO,
  AUDITORIA_TIPO,
  apenasDigitos,
  avaliarDocumento,
  classificarDocumento,
  DIAS_PENDENCIA_NA_GRADE,
  diaDaPortaria,
  diaMais,
  ehPendenciaAntiga,
  fimExclusivoDoDia,
  inicioDoDia,
  MAX_ACOMPANHANTES,
  maiusculas,
  normalizarDocumento,
  normalizarNome,
  normalizarPlaca,
  placaParaGravar,
  SituacaoDocumento,
} from '@impakto/shared';
import type { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { AppError, dadosInvalidos, naoEncontrado } from '../../../infra/errors.js';
import { prisma } from '../../../infra/prisma.js';
import { registrarAuditoria, type OrigemDoEvento } from '../../auditoria/auditoria.service.js';
import type { SessaoDoUsuario } from '../../auth/auth.service.js';

// ---------------------------------------------------------------- contratos

export type DadosDeAcompanhante = { documento?: string | null; nome?: string | null };

export type DadosDeEntrada = {
  nome: string;
  documento: string;
  celular?: string | null;
  placa?: string | null;
  tipoVeiculo?: string | null;
  empresa?: string | null;
  prestador?: boolean | null;
  agregado?: boolean | null;
  acompanhantes?: DadosDeAcompanhante[];
  /** R04 — o porteiro confirmou que quer gravar o documento que não fecha. */
  confirmarDocumento?: boolean;
};

export type AcessoNaGrade = {
  id: string;
  entradaEm: string | null;
  saidaEm: string | null;
  nome: string;
  documento: string;
  celular: string | null;
  placa: string | null;
  tipoVeiculo: string | null;
  empresa: string | null;
  prestador: boolean | null;
  agregado: boolean | null;
  usuarioEntrada: string | null;
  acompanhantes: Array<{ nome: string; documento: string | null }>;
  /** R14 — entrou num dia anterior e continua sem saída. Pinta de âmbar. */
  pendenciaAntiga: boolean;
};

const acessoCompleto = { acompanhantes: { orderBy: { ordem: 'asc' } } } as const;
type AcessoCarregado = Prisma.AcessoGetPayload<{ include: typeof acessoCompleto }>;

function paraGrade(a: AcessoCarregado, hoje = diaDaPortaria()): AcessoNaGrade {
  return {
    id: a.id.toString(),
    entradaEm: a.entradaEm?.toISOString() ?? null,
    saidaEm: a.saidaEm?.toISOString() ?? null,
    nome: a.nomeSnapshot,
    documento: a.documentoSnapshot,
    celular: a.celularSnapshot,
    placa: a.placaSnapshot,
    tipoVeiculo: a.tipoVeiculoSnapshot,
    empresa: a.empresaSnapshot,
    prestador: a.prestador,
    agregado: a.agregado,
    usuarioEntrada: a.usuarioEntradaLogin,
    acompanhantes: a.acompanhantes.map((c) => ({
      nome: c.nomeSnapshot,
      documento: c.documentoSnapshot,
    })),
    pendenciaAntiga: !a.saidaEm && ehPendenciaAntiga(a.entradaEm, hoje),
  };
}

// ------------------------------------------------------- conferência (R04)

export type DocumentoParaConferir = { campo: string; documento: string };

/**
 * R04 — A conferência AVISA, nunca impede.
 *
 * Devolve os documentos que têm 11 dígitos e não fecham no cálculo de CPF.
 * Quem chama decide: a rota responde 409 pedindo confirmação, e o porteiro
 * escolhe gravar assim mesmo — exatamente como o diálogo "Gravar assim mesmo?"
 * do desktop, com **Não** como padrão.
 *
 * Há 94 documentos legados nessa situação. Bloquear tornaria essas pessoas
 * impossíveis de registrar.
 */
export function documentosQueNaoFecham(dados: DadosDeEntrada): DocumentoParaConferir[] {
  const suspeitos: DocumentoParaConferir[] = [];

  if (avaliarDocumento(dados.documento) === SituacaoDocumento.CpfInvalido) {
    suspeitos.push({ campo: 'documento', documento: dados.documento });
  }

  (dados.acompanhantes ?? []).forEach((c, i) => {
    if (c.documento && avaliarDocumento(c.documento) === SituacaoDocumento.CpfInvalido) {
      suspeitos.push({ campo: `acompanhantes.${i}.documento`, documento: c.documento });
    }
  });

  return suspeitos;
}

// ------------------------------------------------------------- cadastro base

async function acharOuCriarEmpresa(nome: string | null | undefined): Promise<bigint | null> {
  const limpo = maiusculas(nome);
  if (!limpo) return null;

  const norm = normalizarNome(limpo);
  const empresa = await prisma.empresa.upsert({
    where: { nomeNorm: norm },
    update: {},
    create: { nome: limpo, nomeNorm: norm },
  });
  return empresa.id;
}

/**
 * Resolve o tipo de veículo pela tabela de aliases antes de criar um novo.
 * É o que impede `¾`, `3/4` e `3/4.` virarem três tipos distintos de novo —
 * a consolidação é decisão humana, registrada em `tipo_veiculo_alias`.
 */
async function acharOuCriarTipoVeiculo(nome: string | null | undefined): Promise<bigint | null> {
  const limpo = maiusculas(nome);
  if (!limpo) return null;

  const alias = await prisma.tipoVeiculoAlias.findUnique({ where: { alias: limpo } });
  if (alias) return alias.tipoId;

  const tipo = await prisma.tipoVeiculo.upsert({
    where: { nome: limpo },
    update: {},
    create: { nome: limpo },
  });
  return tipo.id;
}

async function acharOuCriarPessoa(
  documento: string,
  nome: string,
  celular: string | null,
  empresaId: bigint | null,
): Promise<bigint> {
  const norm = normalizarDocumento(documento);
  const dadosNovos = {
    documento: maiusculas(documento),
    nome: maiusculas(nome),
    celular,
    tipoDocumento: classificarDocumento(documento),
    empresaId,
  };

  const pessoa = await prisma.pessoa.upsert({
    where: { documentoNorm: norm },
    // O cadastro acompanha a visita mais recente, como o pré-preenchimento
    // do desktop já fazia na prática.
    update: dadosNovos,
    create: { ...dadosNovos, documentoNorm: norm },
  });
  return pessoa.id;
}

/**
 * R02, R03 — o veículo é identificado pela placa **normalizada**: `GCT 6604` e
 * `GCT6604` são o mesmo veículo. A grafia guardada é a do registro mais
 * recente, e texto livre (`S/ PLACA`) é preservado como o porteiro digitou.
 */
async function acharOuCriarVeiculo(
  placa: string | null | undefined,
  tipoId: bigint | null,
): Promise<{ id: bigint; placaGravada: string } | null> {
  const gravada = placaParaGravar(placa);
  if (!gravada) return null;

  const norm = normalizarPlaca(gravada);
  const existente = await prisma.veiculo.findFirst({ where: { placaNorm: norm } });

  if (existente) {
    const veiculo = await prisma.veiculo.update({
      where: { id: existente.id },
      data: { placa: gravada, ...(tipoId ? { tipoId } : {}) },
    });
    return { id: veiculo.id, placaGravada: veiculo.placa };
  }

  const veiculo = await prisma.veiculo.create({
    data: { placa: gravada, placaNorm: norm, tipoId },
  });
  return { id: veiculo.id, placaGravada: veiculo.placa };
}

/**
 * R07 — compacta a lista **sem buracos**: quem preencheu o 3º acompanhante e
 * deixou o 2º vazio é gravado como 2º. Vem do `AjudantesPreenchidos()` do
 * desktop, e é o que mantinha as colunas do banco sempre em sequência.
 */
function acompanhantesPreenchidos(lista: DadosDeAcompanhante[] = []): DadosDeAcompanhante[] {
  return lista
    .map((c) => ({ documento: maiusculas(c.documento) || null, nome: maiusculas(c.nome) || null }))
    .filter((c) => c.documento || c.nome);
}

// ---------------------------------------------------------------- entrada

/**
 * R06, R08 — registra a entrada.
 *
 * Obrigatórios: `nome` e `documento`. Todo o resto é opcional, **inclusive a
 * placa** — a portaria precisa registrar veículo sem placa.
 *
 * Toda gravação é um INSERT novo: a tela do desktop nunca edita, e a busca só
 * pré-preenche para agilizar a digitação.
 */
export async function registrarEntrada(
  dados: DadosDeEntrada,
  autor: SessaoDoUsuario,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<AcessoNaGrade> {
  const nome = maiusculas(dados.nome);
  const documento = maiusculas(dados.documento);

  if (!nome) throw dadosInvalidos('Informe o nome.', [{ campo: 'nome', mensagem: 'Obrigatório.' }]);
  if (!documento) {
    throw dadosInvalidos('Informe o RG ou CPF.', [{ campo: 'documento', mensagem: 'Obrigatório.' }]);
  }

  const acompanhantes = acompanhantesPreenchidos(dados.acompanhantes);
  if (acompanhantes.length > MAX_ACOMPANHANTES) {
    throw dadosInvalidos(`Cada entrada registra no máximo ${MAX_ACOMPANHANTES} acompanhantes.`, [
      { campo: 'acompanhantes', mensagem: `Máximo de ${MAX_ACOMPANHANTES}.` },
    ]);
  }

  // R04 — avisa e deixa confirmar; nunca bloqueia de vez.
  const suspeitos = documentosQueNaoFecham({ ...dados, acompanhantes });
  if (suspeitos.length > 0 && !dados.confirmarDocumento) {
    throw new AppError(
      409,
      'CONFIRMAR_DOCUMENTO',
      suspeitos.length === 1
        ? 'O documento informado tem 11 dígitos, mas não passa na conferência de CPF. Se for um RG, pode gravar assim mesmo.'
        : 'Há documentos com 11 dígitos que não passam na conferência de CPF. Se forem RG, pode gravar assim mesmo.',
      undefined,
      { documentos: suspeitos },
    );
  }

  const empresaTexto = maiusculas(dados.empresa) || null;
  const tipoTexto = maiusculas(dados.tipoVeiculo) || null;
  const celular = apenasDigitos(dados.celular) || null;

  const empresaId = await acharOuCriarEmpresa(empresaTexto);
  const tipoId = await acharOuCriarTipoVeiculo(tipoTexto);
  const pessoaId = await acharOuCriarPessoa(documento, nome, celular, empresaId);
  const veiculo = await acharOuCriarVeiculo(dados.placa, tipoId);

  const idsDosAcompanhantes = await Promise.all(
    acompanhantes.map(async (c) =>
      c.documento ? acharOuCriarPessoa(c.documento, c.nome ?? c.documento, null, empresaId) : null,
    ),
  );

  const acesso = await prisma.acesso.create({
    data: {
      pessoaId,
      veiculoId: veiculo?.id ?? null,
      empresaId,
      // Snapshot: o registro de acesso é documento histórico. Se a pessoa
      // mudar de empresa, este acesso continua mostrando a de hoje.
      nomeSnapshot: nome,
      documentoSnapshot: documento,
      celularSnapshot: celular,
      placaSnapshot: veiculo?.placaGravada ?? null,
      empresaSnapshot: empresaTexto,
      tipoVeiculoSnapshot: tipoTexto,
      prestador: dados.prestador ?? null,
      agregado: dados.agregado ?? null,
      entradaEm: new Date(),
      usuarioEntradaId: BigInt(autor.id),
      usuarioEntradaLogin: autor.login,
      origem: 'WEB',
      acompanhantes: {
        create: acompanhantes.map((c, i) => ({
          pessoaId: idsDosAcompanhantes[i] ?? null,
          documentoSnapshot: c.documento,
          nomeSnapshot: c.nome ?? c.documento ?? '',
          ordem: i + 1,
        })),
      },
    },
    include: acessoCompleto,
  });

  await registrarAuditoria(
    {
      tipo: AUDITORIA_TIPO.VEICULO,
      acao: AUDITORIA_ACAO.ENTRADA_REGISTRADA,
      registro: acesso.placaSnapshot || '(sem placa)',
      detalhe:
        nome + (acompanhantes.length > 0 ? ` (+${acompanhantes.length} acompanhante(s))` : ''),
    },
    { usuarioId: BigInt(autor.id), usuarioLogin: autor.login, usuarioNome: autor.nome },
    origem,
    log,
  );

  return paraGrade(acesso);
}

// ------------------------------------------------------------------ saída

/**
 * R15, R16, R17 — registra a saída.
 *
 * O desktop permite sobrescrever uma saída já registrada, e apenas anota
 * `SAIDA SOBRESCRITA` na trilha. Aqui a operação continua possível, mas exige
 * confirmação explícita (409 → `forcar=true`), porque numa tela web é fácil
 * clicar na linha errada.
 *
 * Diferente do desktop, a saída anterior à entrada é recusada (R17).
 */
export async function registrarSaida(
  id: string,
  opcoes: { forcar?: boolean },
  autor: SessaoDoUsuario,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<AcessoNaGrade> {
  let chave: bigint;
  try {
    chave = BigInt(id);
  } catch {
    throw naoEncontrado('Acesso');
  }

  const acesso = await prisma.acesso.findUnique({ where: { id: chave }, include: acessoCompleto });
  if (!acesso) throw naoEncontrado('Acesso');

  const agora = new Date();

  if (acesso.entradaEm && agora < acesso.entradaEm) {
    throw dadosInvalidos('A saída não pode ser anterior à entrada.', [
      { campo: 'saidaEm', mensagem: 'Confira o relógio da estação.' },
    ]);
  }

  // Lê a saída anterior ANTES de gravar — senão o valor se perde, e é
  // justamente ele que a trilha precisa registrar.
  const saidaAnterior = acesso.saidaEm;

  if (saidaAnterior && !opcoes.forcar) {
    throw new AppError(
      409,
      'SAIDA_JA_REGISTRADA',
      'Este acesso já tem saída registrada. Confirme para sobrescrever.',
      undefined,
      { saidaAnterior: saidaAnterior.toISOString(), placa: acesso.placaSnapshot, nome: acesso.nomeSnapshot },
    );
  }

  const atualizado = await prisma.acesso.update({
    where: { id: acesso.id },
    data: { saidaEm: agora, usuarioSaidaId: BigInt(autor.id) },
    include: acessoCompleto,
  });

  await registrarAuditoria(
    {
      tipo: AUDITORIA_TIPO.VEICULO,
      acao: saidaAnterior ? AUDITORIA_ACAO.SAIDA_SOBRESCRITA : AUDITORIA_ACAO.SAIDA_REGISTRADA,
      registro: acesso.placaSnapshot || '(sem placa)',
      detalhe: saidaAnterior
        ? `${acesso.nomeSnapshot} · saída anterior substituída: ${saidaAnterior.toISOString()}`
        : acesso.nomeSnapshot,
      dados: saidaAnterior ? { saidaAnterior: saidaAnterior.toISOString() } : null,
    },
    { usuarioId: BigInt(autor.id), usuarioLogin: autor.login, usuarioNome: autor.nome },
    origem,
    log,
  );

  return paraGrade(atualizado);
}

// ----------------------------------------------------------------- movimento

/**
 * R11, R12, R13 — a grade do movimento.
 *
 * Duas origens somadas:
 *   1. tudo que entrou **hoje**;
 *   2. tudo que continua **sem saída** nos últimos 3 dias.
 *
 * A segunda parte é o que faz o veículo que pernoita seguir alcançável pelo
 * botão SAÍDA depois da virada do turno. O limite de 3 dias existe para a
 * grade não virar depósito: pendência parada há meses não é operação do turno,
 * e dar saída nela hoje gravaria uma hora falsa.
 *
 * O dia é sempre o da portaria, nunca UTC (R12) — com UTC a grade esvaziava às
 * 21h, no meio do turno da madrugada.
 *
 * Registros legados sem data ficam de fora (R13): são 11.257 linhas que
 * invadiriam a grade de uma vez.
 */
export async function consultarMovimento(opcoes: {
  dias?: number;
  somenteDentro?: boolean;
}): Promise<{ acessos: AcessoNaGrade[]; hoje: string; dentro: number; pendencias: number }> {
  const hoje = diaDaPortaria();
  const dias = opcoes.dias ?? DIAS_PENDENCIA_NA_GRADE;
  const inicioDaJanela = inicioDoDia(diaMais(-(dias - 1), hoje));

  const acessos = await prisma.acesso.findMany({
    where: {
      entradaEm: { not: null },
      OR: [
        // 1. entrou hoje
        { entradaEm: { gte: inicioDoDia(hoje), lt: fimExclusivoDoDia(hoje) } },
        // 2. continua dentro, dentro da janela de pendência
        { saidaEm: null, entradaEm: { gte: inicioDaJanela } },
      ],
    },
    include: acessoCompleto,
    orderBy: { entradaEm: 'desc' },
  });

  const grade = acessos.map((a) => paraGrade(a, hoje));

  return {
    // R18 — "OCULTAR SAÍDAS" do desktop, agora como filtro de consulta.
    acessos: opcoes.somenteDentro ? grade.filter((a) => !a.saidaEm) : grade,
    hoje,
    dentro: grade.filter((a) => !a.saidaEm).length,
    pendencias: grade.filter((a) => a.pendenciaAntiga).length,
  };
}

// -------------------------------------------------------- busca e histórico

/**
 * R09, R10 — pré-preenchimento pela visita mais recente.
 *
 * A busca por placa compara o valor **normalizado**, que é o que encontra os
 * 10.172 registros gravados com espaço.
 *
 * CORREÇÃO CONSCIENTE ao desktop: a busca por documento também normaliza. O C#
 * compara texto exato em maiúsculas e por isso não acha os documentos gravados
 * com pontuação.
 */
export async function buscarUltimaVisita(
  por: 'placa' | 'documento',
  valor: string,
): Promise<AcessoNaGrade | null> {
  const onde: Prisma.AcessoWhereInput =
    por === 'placa'
      ? { veiculo: { placaNorm: normalizarPlaca(valor) } }
      : { pessoa: { documentoNorm: normalizarDocumento(valor) } };

  const acesso = await prisma.acesso.findFirst({
    where: onde,
    include: acessoCompleto,
    orderBy: [{ entradaEm: 'desc' }, { id: 'desc' }],
  });

  return acesso ? paraGrade(acesso) : null;
}

/** Histórico de visitas de uma placa ou documento, mais recente primeiro. */
export async function consultarHistorico(
  por: 'placa' | 'documento',
  valor: string,
  limite = 50,
): Promise<AcessoNaGrade[]> {
  const onde: Prisma.AcessoWhereInput =
    por === 'placa'
      ? { veiculo: { placaNorm: normalizarPlaca(valor) } }
      : { pessoa: { documentoNorm: normalizarDocumento(valor) } };

  const acessos = await prisma.acesso.findMany({
    where: onde,
    include: acessoCompleto,
    orderBy: [{ entradaEm: 'desc' }, { id: 'desc' }],
    take: limite,
  });

  const hoje = diaDaPortaria();
  return acessos.map((a) => paraGrade(a, hoje));
}
