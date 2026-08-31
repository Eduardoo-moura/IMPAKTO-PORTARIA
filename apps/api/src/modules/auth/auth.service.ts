/**
 * Regras de autenticação e sessão.
 *
 * Origem: `Portaria/Seguranca.cs` e `Frm_Veiculo.TrocarUsuario()`.
 * A rota não decide nada — tudo o que é regra está aqui.
 */

import { AUDITORIA_ACAO, AUDITORIA_TIPO, maiusculas } from '@impakto/shared';
import { gerarHash, senhaAtendeAoMinimo, senhaConfere, TAMANHO_MINIMO_SENHA } from '@impakto/shared/senha';
import type { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { AppError, dadosInvalidos, naoAutenticado } from '../../infra/errors.js';
import { prisma } from '../../infra/prisma.js';
import { registrarAuditoria, type OrigemDoEvento } from '../auditoria/auditoria.service.js';

/** Dados da sessão que a API devolve e que o frontend usa para montar o menu. */
export type SessaoDoUsuario = {
  id: string;
  login: string;
  nome: string;
  perfil: string;
  trocarSenha: boolean;
  permissoes: string[];
};

const usuarioComPerfil = {
  perfil: { include: { permissoes: { include: { permissao: true } } } },
} as const;

type UsuarioComPerfil = Prisma.UsuarioGetPayload<{ include: typeof usuarioComPerfil }>;

function paraSessao(usuario: UsuarioComPerfil): SessaoDoUsuario {
  return {
    id: usuario.id.toString(),
    login: usuario.login,
    nome: usuario.nome ?? usuario.login,
    perfil: usuario.perfil.nome,
    trocarSenha: usuario.trocarSenha,
    permissoes: usuario.perfil.permissoes.map((p) => p.permissao.chave),
  };
}

/** Normalização do login, equivalente ao `COLLATE NOCASE` do SQLite. */
export const normalizarLogin = (login: string): string => maiusculas(login).replace(/\s/g, '');

/**
 * R31 — Autentica.
 *
 * Comportamento preservado do desktop, ponto a ponto:
 * - mensagem **única** em caso de falha: não revela se errou o usuário ou a
 *   senha, nem se a conta existe;
 * - só autentica `ativo = true`;
 * - a tentativa recusada vai para a auditoria **antes de existir sessão**, com
 *   o login que a pessoa digitou.
 */
export async function autenticar(
  login: string,
  senha: string,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<SessaoDoUsuario> {
  const loginNorm = normalizarLogin(login);

  const usuario = await prisma.usuario.findUnique({
    where: { loginNorm },
    include: usuarioComPerfil,
  });

  const senhaOk = usuario ? await senhaConfere(senha, usuario.senhaHash) : false;

  if (!usuario || !usuario.ativo || !senhaOk) {
    await registrarAuditoria(
      {
        tipo: AUDITORIA_TIPO.ACESSO,
        acao: AUDITORIA_ACAO.LOGIN_RECUSADO,
        registro: loginNorm,
        detalhe: !usuario
          ? 'Usuário não encontrado'
          : !usuario.ativo
            ? 'Usuário inativo'
            : 'Senha incorreta',
      },
      // Não há sessão ainda: o autor é o login digitado.
      { usuarioId: usuario?.id ?? null, usuarioLogin: loginNorm, usuarioNome: usuario?.nome ?? null },
      origem,
      log,
    );

    // Mensagem única, deliberadamente vaga. O motivo real fica na auditoria.
    throw new AppError(401, 'CREDENCIAIS_INVALIDAS', 'Usuário ou senha inválidos.');
  }

  await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoLoginEm: new Date() } });

  await registrarAuditoria(
    { tipo: AUDITORIA_TIPO.ACESSO, acao: AUDITORIA_ACAO.LOGIN, registro: usuario.login },
    { usuarioId: usuario.id, usuarioLogin: usuario.login, usuarioNome: usuario.nome },
    origem,
    log,
  );

  return paraSessao(usuario);
}

/**
 * Carrega a sessão a partir do id do token.
 *
 * Rechecar o banco a cada requisição é de propósito: um usuário desativado ou
 * com perfil alterado perde o acesso na hora, sem esperar o token expirar.
 * São poucos usuários e a consulta é por chave primária.
 */
export async function carregarSessao(usuarioId: string): Promise<SessaoDoUsuario> {
  let id: bigint;
  try {
    id = BigInt(usuarioId);
  } catch {
    throw naoAutenticado();
  }

  const usuario = await prisma.usuario.findUnique({ where: { id }, include: usuarioComPerfil });
  if (!usuario || !usuario.ativo) throw naoAutenticado();

  return paraSessao(usuario);
}

/**
 * Troca a própria senha.
 *
 * A senha mínima subiu de 4 (desktop) para 8 — e a conferência da senha atual
 * é exigida mesmo quando `trocarSenha` está marcado, para o primeiro acesso do
 * `admin` não virar uma porta aberta.
 */
export async function trocarSenha(
  usuarioId: string,
  senhaAtual: string,
  novaSenha: string,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { id: BigInt(usuarioId) } });
  if (!usuario || !usuario.ativo) throw naoAutenticado();

  if (!(await senhaConfere(senhaAtual, usuario.senhaHash))) {
    throw dadosInvalidos('A senha atual não confere.', [
      { campo: 'senhaAtual', mensagem: 'Senha incorreta.' },
    ]);
  }

  if (!senhaAtendeAoMinimo(novaSenha)) {
    throw dadosInvalidos(`A nova senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`, [
      { campo: 'novaSenha', mensagem: `Mínimo de ${TAMANHO_MINIMO_SENHA} caracteres.` },
    ]);
  }

  if (await senhaConfere(novaSenha, usuario.senhaHash)) {
    throw dadosInvalidos('A nova senha precisa ser diferente da atual.', [
      { campo: 'novaSenha', mensagem: 'Escolha uma senha diferente da atual.' },
    ]);
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash: await gerarHash(novaSenha), trocarSenha: false },
  });

  await registrarAuditoria(
    { tipo: AUDITORIA_TIPO.USUARIO, acao: AUDITORIA_ACAO.SENHA_ALTERADA, registro: usuario.login },
    { usuarioId: usuario.id, usuarioLogin: usuario.login, usuarioNome: usuario.nome },
    origem,
    log,
  );
}

/**
 * R32 — Troca de turno.
 *
 * O porteiro que assume entra sem o sistema ser fechado. Duas propriedades do
 * desktop que precisam sobreviver:
 *
 * - **o sistema nunca fica sem usuário na sessão.** Se a autenticação de quem
 *   assume falhar, quem já estava continua valendo — por isso a sessão antiga
 *   só é encerrada depois de a nova ser aprovada;
 * - a auditoria registra **quem assumiu de quem**.
 *
 * O aviso de dados não salvos é do lado do cliente: só ele sabe o que está
 * digitado no formulário.
 */
export async function trocarTurno(
  sessaoAtual: SessaoDoUsuario,
  login: string,
  senha: string,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<SessaoDoUsuario> {
  // Se isto lançar, nada mudou: a sessão anterior segue de pé.
  const nova = await autenticar(login, senha, origem, log);

  await registrarAuditoria(
    {
      tipo: AUDITORIA_TIPO.ACESSO,
      acao: AUDITORIA_ACAO.TROCA_DE_TURNO,
      registro: nova.login,
      detalhe: `Assumiu o turno de ${sessaoAtual.nome}`,
      dados: { deLogin: sessaoAtual.login, deNome: sessaoAtual.nome, paraLogin: nova.login },
    },
    { usuarioId: BigInt(nova.id), usuarioLogin: nova.login, usuarioNome: nova.nome },
    origem,
    log,
  );

  return nova;
}

/**
 * R38 — Saída do sistema.
 *
 * No desktop isso é gravado ao fechar a tela, para o log mostrar até quando
 * cada porteiro respondia pelo posto. Na web não existe "fechar o programa",
 * então o equivalente é o logout explícito. A expiração de token é registrada
 * com ação própria, para as duas coisas não se confundirem na trilha.
 */
export async function encerrarSessao(
  sessao: SessaoDoUsuario,
  motivo: 'LOGOUT' | 'EXPIRACAO',
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<void> {
  await registrarAuditoria(
    {
      tipo: AUDITORIA_TIPO.ACESSO,
      acao: motivo === 'LOGOUT' ? AUDITORIA_ACAO.SAIDA_DO_SISTEMA : AUDITORIA_ACAO.SESSAO_EXPIRADA,
      registro: sessao.login,
    },
    { usuarioId: BigInt(sessao.id), usuarioLogin: sessao.login, usuarioNome: sessao.nome },
    origem,
    log,
  );
}
