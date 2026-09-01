/**
 * Testes de integração do cadastro de usuários — aplicação real, banco real.
 *
 * O foco é a R30: o desktop tem `OutrosAdministradoresAtivos()` justamente
 * porque a base real tem apenas dois usuários de nível 1.
 */

import { AUDITORIA_ACAO } from '@impakto/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../infra/prisma.js';
import {
  auditoriaRecente,
  criarUsuario,
  entrar,
  limparBanco,
  semearPerfis,
  SENHA_PADRAO,
  subirApp,
} from '../../testes/apoio.js';

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

describe('R29 — a autorização é do servidor, não do menu', () => {
  it('porteiro não lista nem cadastra usuários', async () => {
    await criarUsuario({ login: 'PORTEIRO' });
    const { autorizacao } = await entrar(app, 'PORTEIRO');

    const listar = await app.inject({ method: 'GET', url: '/api/usuarios', ...como(autorizacao) });
    expect(listar.statusCode).toBe(403);

    const criar = await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      ...como(autorizacao),
      payload: { login: 'NOVO', senha: 'senha12345', perfil: 'PORTARIA' },
    });
    expect(criar.statusCode).toBe(403);
  });

  it('sem sessão, 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/usuarios' })).statusCode).toBe(401);
  });
});

describe('cadastro', () => {
  it('cria o usuário já exigindo troca de senha no primeiro acesso', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      ...como(admin),
      payload: { login: 'bras', nome: 'bras silva', senha: 'senhaInicial1', perfil: 'PORTARIA' },
    });

    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      login: 'BRAS',
      nome: 'BRAS SILVA',
      perfil: 'PORTARIA',
      ativo: true,
      trocarSenha: true,
    });

    // A senha inicial vale para entrar, e a troca é cobrada logo em seguida.
    const entrou = await entrar(app, 'BRAS', 'senhaInicial1');
    expect(entrou.status).toBe(200);
    expect(entrou.corpo.usuario.trocarSenha).toBe(true);
  });

  it('nunca devolve o hash', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      ...como(admin),
      payload: { login: 'SEGREDO', senha: 'senhaInicial1', perfil: 'PORTARIA' },
    });
    expect(r.body).not.toContain('PBKDF2');
    expect(r.json()).not.toHaveProperty('senhaHash');
  });

  it('recusa login repetido, mesmo com outra caixa', async () => {
    await criarUsuario({ login: 'JOSE' });

    const r = await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      ...como(admin),
      payload: { login: 'jose', senha: 'senhaInicial1', perfil: 'PORTARIA' },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().erro.campos[0].campo).toBe('login');
  });

  it('exige 8 caracteres na senha inicial', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      ...como(admin),
      payload: { login: 'CURTA', senha: '1234', perfil: 'PORTARIA' },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().erro.campos[0].campo).toBe('senha');
  });

  it('recusa perfil inexistente', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      ...como(admin),
      payload: { login: 'X', senha: 'senhaInicial1', perfil: 'INVENTADO' },
    });
    expect(r.statusCode).toBe(422);
  });

  it('audita USUARIO CRIADO com quem criou', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/usuarios',
      ...como(admin),
      payload: { login: 'AUDITADO', senha: 'senhaInicial1', perfil: 'PORTARIA' },
    });

    expect((await auditoriaRecente(1))[0]).toMatchObject({
      tipo: 'USUARIO',
      acao: AUDITORIA_ACAO.USUARIO_CRIADO,
      registro: 'AUDITADO',
      usuarioLogin: 'CHEFE',
    });
  });
});

describe('alteração', () => {
  it('troca o nome e audita como USUARIO ALTERADO', async () => {
    const alvo = await criarUsuario({ login: 'ANTIGO', nome: 'NOME ANTIGO' });

    const r = await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${alvo.id}`,
      ...como(admin),
      payload: { nome: 'nome novo' },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json().nome).toBe('NOME NOVO');
    expect((await auditoriaRecente(1))[0]).toMatchObject({
      acao: AUDITORIA_ACAO.USUARIO_ALTERADO,
      detalhe: 'Nome: NOME ANTIGO → NOME NOVO',
    });
  });

  it('troca de perfil é auditada como NIVEL ALTERADO, separada das demais', async () => {
    const alvo = await criarUsuario({ login: 'SOBE' });

    await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${alvo.id}`,
      ...como(admin),
      payload: { perfil: 'ADMINISTRADOR' },
    });

    expect((await auditoriaRecente(1))[0]).toMatchObject({
      acao: AUDITORIA_ACAO.NIVEL_ALTERADO,
      detalhe: 'Perfil: PORTARIA → ADMINISTRADOR',
    });
  });

  it('não audita quando nada mudou', async () => {
    const alvo = await criarUsuario({ login: 'IGUAL', nome: 'IGUAL' });
    const antes = (await auditoriaRecente(1))[0]?.id;

    const r = await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${alvo.id}`,
      ...como(admin),
      payload: { nome: 'IGUAL', perfil: 'PORTARIA' },
    });

    expect(r.statusCode).toBe(200);
    expect((await auditoriaRecente(1))[0]?.id).toBe(antes);
  });

  it('404 em usuário que não existe', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/usuarios/999999',
      ...como(admin),
      payload: { nome: 'X' },
    });
    expect(r.statusCode).toBe(404);
  });
});

describe('R30 — o sistema nunca fica sem administrador ativo', () => {
  it('recusa desativar o ÚNICO administrador', async () => {
    // CHEFE é o único ADMINISTRADOR; quem tenta é outro admin recém-criado.
    const outro = await criarUsuario({ login: 'ADM2', perfil: 'ADMINISTRADOR' });
    const dele = (await entrar(app, 'ADM2')).autorizacao;

    // Com dois admins, desativar um é permitido.
    const primeiro = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${outro.id}/ativo`,
      ...como(admin),
      payload: { ativo: false },
    });
    expect(primeiro.statusCode).toBe(200);

    // Agora CHEFE é o único: ADM2 já não tem sessão válida, então quem tenta
    // desativá-lo é ele mesmo — e a barreira do último admin também vale.
    const chefe = await prisma.usuario.findUniqueOrThrow({ where: { loginNorm: 'CHEFE' } });
    const segundo = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${chefe.id}/ativo`,
      ...como(admin),
      payload: { ativo: false },
    });
    expect(segundo.statusCode).toBe(409);
    expect(segundo.json().erro.codigo).toBe('AUTO_DESATIVACAO');

    // E a sessão do desativado morre na hora.
    expect((await app.inject({ method: 'GET', url: '/api/auth/eu', ...como(dele) })).statusCode).toBe(401);
  });

  it('recusa desativar o último administrador vindo de quem NÃO é administrador', async () => {
    // Cenário real que a barreira cobre: um perfil que tem `usuario.editar`
    // sem ser ADMINISTRADOR. Só por aqui o alvo pode ser o último admin sem
    // que a operação seja uma auto-desativação.
    const permissao = await prisma.permissao.findUniqueOrThrow({ where: { chave: 'usuario.editar' } });
    const ver = await prisma.permissao.findUniqueOrThrow({ where: { chave: 'usuario.ver' } });
    const suporte = await prisma.perfil.create({ data: { nome: 'SUPORTE' } });
    await prisma.perfilPermissao.createMany({
      data: [permissao, ver].map((p) => ({ perfilId: suporte.id, permissaoId: p.id })),
    });

    await criarUsuario({ login: 'SUPORTE1', perfil: 'SUPORTE' });
    const dele = (await entrar(app, 'SUPORTE1')).autorizacao;

    const chefe = await prisma.usuario.findUniqueOrThrow({ where: { loginNorm: 'CHEFE' } });
    const r = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${chefe.id}/ativo`,
      ...como(dele),
      payload: { ativo: false },
    });

    expect(r.statusCode).toBe(409);
    expect(r.json().erro.codigo).toBe('ULTIMO_ADMINISTRADOR');

    // O administrador continua ativo: nada foi aplicado pela metade.
    const depois = await app.inject({ method: 'GET', url: '/api/auth/eu', ...como(admin) });
    expect(depois.statusCode).toBe(200);
  });

  it('recusa REBAIXAR o último administrador — rebaixar é o mesmo risco que desativar', async () => {
    const chefe = await prisma.usuario.findUniqueOrThrow({ where: { loginNorm: 'CHEFE' } });

    const r = await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${chefe.id}`,
      ...como(admin),
      payload: { perfil: 'PORTARIA' },
    });

    expect(r.statusCode).toBe(409);
    expect(r.json().erro.codigo).toBe('ULTIMO_ADMINISTRADOR');

    // Continua administrador: a operação não foi aplicada pela metade.
    const depois = await app.inject({ method: 'GET', url: '/api/auth/eu', ...como(admin) });
    expect(depois.json().perfil).toBe('ADMINISTRADOR');
  });

  it('permite rebaixar quando existe outro administrador ativo', async () => {
    await criarUsuario({ login: 'RESERVA', perfil: 'ADMINISTRADOR' });
    const chefe = await prisma.usuario.findUniqueOrThrow({ where: { loginNorm: 'CHEFE' } });

    const r = await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${chefe.id}`,
      ...como(admin),
      payload: { perfil: 'PORTARIA' },
    });
    expect(r.statusCode).toBe(200);
  });

  it('administrador INATIVO não conta como reserva', async () => {
    await criarUsuario({ login: 'DORMINDO', perfil: 'ADMINISTRADOR', ativo: false });
    const chefe = await prisma.usuario.findUniqueOrThrow({ where: { loginNorm: 'CHEFE' } });

    const r = await app.inject({
      method: 'PUT',
      url: `/api/usuarios/${chefe.id}`,
      ...como(admin),
      payload: { perfil: 'PORTARIA' },
    });
    expect(r.statusCode).toBe(409);
  });

  it('reativar sempre pode', async () => {
    const alvo = await criarUsuario({ login: 'VOLTOU', ativo: false });

    const r = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${alvo.id}/ativo`,
      ...como(admin),
      payload: { ativo: true },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json().ativo).toBe(true);
    expect((await auditoriaRecente(1))[0]!.acao).toBe(AUDITORIA_ACAO.USUARIO_ATIVADO);
  });

  it('desativar porteiro é livre e derruba o acesso dele', async () => {
    const alvo = await criarUsuario({ login: 'SAIU' });
    const dele = (await entrar(app, 'SAIU')).autorizacao;

    const r = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${alvo.id}/ativo`,
      ...como(admin),
      payload: { ativo: false },
    });

    expect(r.statusCode).toBe(200);
    expect((await auditoriaRecente(1))[0]!.acao).toBe(AUDITORIA_ACAO.USUARIO_DESATIVADO);
    expect((await app.inject({ method: 'GET', url: '/api/auth/eu', ...como(dele) })).statusCode).toBe(401);
    expect((await entrar(app, 'SAIU')).status).toBe(401);
  });
});

describe('redefinição de senha por administrador', () => {
  it('troca a senha e obriga o dono a trocá-la de novo no próximo acesso', async () => {
    const alvo = await criarUsuario({ login: 'ESQUECIDO' });

    const r = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${alvo.id}/senha`,
      ...como(admin),
      payload: { novaSenha: 'provisoria123' },
    });
    expect(r.statusCode).toBe(204);

    expect((await entrar(app, 'ESQUECIDO', SENHA_PADRAO)).status).toBe(401);

    const entrou = await entrar(app, 'ESQUECIDO', 'provisoria123');
    expect(entrou.status).toBe(200);
    // Nenhum administrador fica conhecendo a senha definitiva de um porteiro.
    expect(entrou.corpo.usuario.trocarSenha).toBe(true);
  });

  it('exige o mínimo de 8 caracteres', async () => {
    const alvo = await criarUsuario({ login: 'FRACA' });

    const r = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${alvo.id}/senha`,
      ...como(admin),
      payload: { novaSenha: 'abc' },
    });
    expect(r.statusCode).toBe(422);
  });

  it('audita SENHA ALTERADA dizendo que foi o administrador', async () => {
    const alvo = await criarUsuario({ login: 'RESET' });

    await app.inject({
      method: 'POST',
      url: `/api/usuarios/${alvo.id}/senha`,
      ...como(admin),
      payload: { novaSenha: 'provisoria123' },
    });

    const [evento] = await auditoriaRecente(1);
    expect(evento).toMatchObject({ acao: AUDITORIA_ACAO.SENHA_ALTERADA, registro: 'RESET', usuarioLogin: 'CHEFE' });
    expect(evento!.detalhe).toContain('administrador');
  });
});

describe('listagem', () => {
  it('traz ativos e inativos, com o perfil de cada um', async () => {
    await criarUsuario({ login: 'ATIVO1' });
    await criarUsuario({ login: 'INATIVO1', ativo: false });

    const r = await app.inject({ method: 'GET', url: '/api/usuarios', ...como(admin) });
    const logins = r.json().map((u: { login: string }) => u.login);

    expect(logins).toEqual(expect.arrayContaining(['CHEFE', 'ATIVO1', 'INATIVO1']));
    expect(r.body).not.toContain('PBKDF2');
  });

  it('filtra os inativos quando pedido', async () => {
    await criarUsuario({ login: 'INATIVO2', ativo: false });

    const r = await app.inject({
      method: 'GET',
      url: '/api/usuarios?incluirInativos=false',
      ...como(admin),
    });
    expect(r.json().map((u: { login: string }) => u.login)).not.toContain('INATIVO2');
  });

  it('lista os perfis com a contagem de usuários', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/usuarios/perfis', ...como(admin) });
    const porNome = Object.fromEntries(r.json().map((p: { nome: string; usuarios: number }) => [p.nome, p.usuarios]));

    expect(porNome.ADMINISTRADOR).toBe(1);
  });
});
