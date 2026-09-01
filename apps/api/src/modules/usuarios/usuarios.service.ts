/**
 * Cadastro de usuários.
 *
 * Origem: `Portaria/Frm_Usuarios.cs` e `Seguranca.cs` (`class Usuarios`).
 * Toda operação daqui é auditada — o desktop registra seis ações distintas
 * para este módulo, e todas foram preservadas.
 */

import { AUDITORIA_ACAO, AUDITORIA_TIPO, maiusculas, PERFIS } from '@impakto/shared';
import { gerarHash, senhaAtendeAoMinimo, TAMANHO_MINIMO_SENHA } from '@impakto/shared/senha';
import type { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { AppError, dadosInvalidos, naoEncontrado } from '../../infra/errors.js';
import { prisma } from '../../infra/prisma.js';
import { registrarAuditoria, type OrigemDoEvento } from '../auditoria/auditoria.service.js';
import { normalizarLogin, type SessaoDoUsuario } from '../auth/auth.service.js';

export type UsuarioListado = {
  id: string;
  login: string;
  nome: string;
  perfil: string;
  ativo: boolean;
  trocarSenha: boolean;
  ultimoLoginEm: string | null;
  criadoEm: string;
};

const comPerfil = { perfil: true } as const;
type UsuarioComPerfil = Prisma.UsuarioGetPayload<{ include: typeof comPerfil }>;

/** O hash NUNCA entra na projeção: não há como vazá-lo por descuido de rota. */
function paraLista(u: UsuarioComPerfil): UsuarioListado {
  return {
    id: u.id.toString(),
    login: u.login,
    nome: u.nome ?? u.login,
    perfil: u.perfil.nome,
    ativo: u.ativo,
    trocarSenha: u.trocarSenha,
    ultimoLoginEm: u.ultimoLoginEm?.toISOString() ?? null,
    criadoEm: u.criadoEm.toISOString(),
  };
}

export async function listarUsuarios(incluirInativos = true): Promise<UsuarioListado[]> {
  const usuarios = await prisma.usuario.findMany({
    where: incluirInativos ? {} : { ativo: true },
    include: comPerfil,
    orderBy: [{ ativo: 'desc' }, { login: 'asc' }],
  });
  return usuarios.map(paraLista);
}

export async function listarPerfis() {
  const perfis = await prisma.perfil.findMany({
    include: { _count: { select: { usuarios: true } } },
    orderBy: { nome: 'asc' },
  });
  return perfis.map((p) => ({
    id: p.id.toString(),
    nome: p.nome,
    descricao: p.descricao ?? '',
    usuarios: p._count.usuarios,
  }));
}

async function acharPerfil(nome: string) {
  const perfil = await prisma.perfil.findUnique({ where: { nome } });
  if (!perfil) {
    throw dadosInvalidos('Perfil não existe.', [{ campo: 'perfil', mensagem: 'Escolha um perfil válido.' }]);
  }
  return perfil;
}

async function acharUsuario(id: string): Promise<UsuarioComPerfil> {
  let chave: bigint;
  try {
    chave = BigInt(id);
  } catch {
    throw naoEncontrado('Usuário');
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: chave }, include: comPerfil });
  if (!usuario) throw naoEncontrado('Usuário');
  return usuario;
}

/**
 * R30 — o sistema nunca pode ficar sem administrador ativo.
 *
 * Origem: `Usuarios.OutrosAdministradoresAtivos()`. Hoje há apenas **dois**
 * usuários de nível 1 na base real, então a regra é ativa na prática: sem ela,
 * desativar um e trocar o perfil do outro deixa o cadastro de usuários e a
 * auditoria inalcançáveis para todo mundo.
 */
async function exigirOutroAdministradorAtivo(usuarioId: bigint, acao: string): Promise<void> {
  const outros = await prisma.usuario.count({
    where: {
      id: { not: usuarioId },
      ativo: true,
      perfil: { nome: PERFIS.ADMINISTRADOR },
    },
  });

  if (outros === 0) {
    throw new AppError(
      409,
      'ULTIMO_ADMINISTRADOR',
      `Este é o único administrador ativo. ${acao} deixaria o sistema sem ninguém que possa cadastrar usuários ou consultar a auditoria.`,
    );
  }
}

export async function criarUsuario(
  dados: { login: string; nome?: string | null; senha: string; perfil: string },
  autor: SessaoDoUsuario,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<UsuarioListado> {
  const loginNorm = normalizarLogin(dados.login);
  if (!loginNorm) {
    throw dadosInvalidos('Informe o usuário.', [{ campo: 'login', mensagem: 'Obrigatório.' }]);
  }

  if (!senhaAtendeAoMinimo(dados.senha)) {
    throw dadosInvalidos(`A senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`, [
      { campo: 'senha', mensagem: `Mínimo de ${TAMANHO_MINIMO_SENHA} caracteres.` },
    ]);
  }

  if (await prisma.usuario.findUnique({ where: { loginNorm } })) {
    throw dadosInvalidos('Já existe um usuário com este login.', [
      { campo: 'login', mensagem: 'Escolha outro login.' },
    ]);
  }

  const perfil = await acharPerfil(dados.perfil);

  const criado = await prisma.usuario.create({
    data: {
      login: loginNorm,
      loginNorm,
      nome: maiusculas(dados.nome ?? dados.login),
      senhaHash: await gerarHash(dados.senha),
      perfilId: perfil.id,
      // Quem cria escolhe a senha inicial; o dono troca no primeiro acesso.
      trocarSenha: true,
    },
    include: comPerfil,
  });

  await auditar(AUDITORIA_ACAO.USUARIO_CRIADO, criado.login, `Perfil ${perfil.nome}`, null, autor, origem, log);
  return paraLista(criado);
}

/**
 * Altera nome e perfil. A senha tem rota própria — misturar as duas coisas
 * faz a auditoria perder a distinção entre `USUARIO ALTERADO` e
 * `SENHA ALTERADA`, que o desktop registra separadamente.
 */
export async function alterarUsuario(
  id: string,
  dados: { nome?: string | null; perfil?: string },
  autor: SessaoDoUsuario,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<UsuarioListado> {
  const usuario = await acharUsuario(id);

  const mudancas: Prisma.UsuarioUpdateInput = {};
  const descricao: string[] = [];

  const nomeNovo = dados.nome === undefined ? undefined : maiusculas(dados.nome);
  if (nomeNovo !== undefined && nomeNovo !== (usuario.nome ?? '')) {
    mudancas.nome = nomeNovo;
    descricao.push(`Nome: ${usuario.nome ?? '(vazio)'} → ${nomeNovo || '(vazio)'}`);
  }

  let trocouDePerfil = false;
  if (dados.perfil && dados.perfil !== usuario.perfil.nome) {
    // Rebaixar o último administrador é o mesmo risco que desativá-lo.
    if (usuario.perfil.nome === PERFIS.ADMINISTRADOR && usuario.ativo) {
      await exigirOutroAdministradorAtivo(usuario.id, 'Trocar o perfil dele');
    }
    const perfil = await acharPerfil(dados.perfil);
    mudancas.perfil = { connect: { id: perfil.id } };
    descricao.push(`Perfil: ${usuario.perfil.nome} → ${perfil.nome}`);
    trocouDePerfil = true;
  }

  if (descricao.length === 0) return paraLista(usuario);

  const atualizado = await prisma.usuario.update({
    where: { id: usuario.id },
    data: mudancas,
    include: comPerfil,
  });

  // O desktop distingue troca de perfil das demais alterações; a trilha da web
  // faz o mesmo, para o filtro por ação continuar tendo o mesmo significado.
  await auditar(
    trocouDePerfil ? AUDITORIA_ACAO.NIVEL_ALTERADO : AUDITORIA_ACAO.USUARIO_ALTERADO,
    usuario.login,
    descricao.join(' · '),
    { antes: paraLista(usuario), depois: paraLista(atualizado) },
    autor,
    origem,
    log,
  );

  return paraLista(atualizado);
}

/**
 * Redefine a senha de outro usuário.
 *
 * Diferença deliberada em relação ao desktop: lá, deixar a senha em branco
 * mantinha a atual — o que só existe porque senha e cadastro dividiam o mesmo
 * formulário. Aqui a rota é própria, então a senha é obrigatória, e quem
 * recebe é obrigado a trocá-la no primeiro acesso: nenhum administrador fica
 * conhecendo a senha definitiva de um porteiro.
 */
export async function redefinirSenha(
  id: string,
  novaSenha: string,
  autor: SessaoDoUsuario,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<void> {
  const usuario = await acharUsuario(id);

  if (!senhaAtendeAoMinimo(novaSenha)) {
    throw dadosInvalidos(`A senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`, [
      { campo: 'novaSenha', mensagem: `Mínimo de ${TAMANHO_MINIMO_SENHA} caracteres.` },
    ]);
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash: await gerarHash(novaSenha), trocarSenha: true },
  });

  await auditar(
    AUDITORIA_ACAO.SENHA_ALTERADA,
    usuario.login,
    'Senha redefinida por administrador; troca exigida no próximo acesso',
    null,
    autor,
    origem,
    log,
  );
}

export async function definirAtivo(
  id: string,
  ativo: boolean,
  autor: SessaoDoUsuario,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
): Promise<UsuarioListado> {
  const usuario = await acharUsuario(id);
  if (usuario.ativo === ativo) return paraLista(usuario);

  if (!ativo) {
    if (usuario.id.toString() === autor.id) {
      throw new AppError(
        409,
        'AUTO_DESATIVACAO',
        'Você não pode desativar o próprio usuário. Peça a outro administrador.',
      );
    }
    if (usuario.perfil.nome === PERFIS.ADMINISTRADOR) {
      await exigirOutroAdministradorAtivo(usuario.id, 'Desativá-lo');
    }
  }

  const atualizado = await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ativo },
    include: comPerfil,
  });

  await auditar(
    ativo ? AUDITORIA_ACAO.USUARIO_ATIVADO : AUDITORIA_ACAO.USUARIO_DESATIVADO,
    usuario.login,
    null,
    null,
    autor,
    origem,
    log,
  );

  return paraLista(atualizado);
}

function auditar(
  acao: string,
  registro: string,
  detalhe: string | null,
  dados: Record<string, unknown> | null,
  autor: SessaoDoUsuario,
  origem: OrigemDoEvento,
  log?: FastifyBaseLogger,
) {
  return registrarAuditoria(
    { tipo: AUDITORIA_TIPO.USUARIO, acao, registro, detalhe, dados },
    { usuarioId: BigInt(autor.id), usuarioLogin: autor.login, usuarioNome: autor.nome },
    origem,
    log,
  );
}
