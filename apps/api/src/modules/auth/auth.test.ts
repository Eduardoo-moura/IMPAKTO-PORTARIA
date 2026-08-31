/**
 * Testes de integração da autenticação — aplicação real, banco real.
 *
 * Cada bloco cita a regra rastreada em docs/00-LEVANTAMENTO-E-ARQUITETURA.md.
 * A intenção é comparar comportamento com o desktop, não cobrir linhas.
 */

import { AUDITORIA_ACAO } from '@impakto/shared';
import { pbkdf2Sync } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../infra/prisma.js';
import {
  auditoriaRecente,
  criarUsuario,
  entrar,
  ipDeTeste,
  limparBanco,
  semearPerfis,
  SENHA_PADRAO,
  subirApp,
} from '../../testes/apoio.js';

let app: FastifyInstance;

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
});

describe('R31 — login', () => {
  it('autentica e devolve a sessão com as permissões que montam o menu', async () => {
    await criarUsuario({ login: 'BRAS', nome: 'BRAS' });

    const r = await entrar(app, 'BRAS');

    expect(r.status).toBe(200);
    expect(r.token).toBeTruthy();
    expect(r.corpo.usuario).toMatchObject({ login: 'BRAS', nome: 'BRAS', perfil: 'PORTARIA' });
    expect(r.corpo.usuario.permissoes).toContain('portaria.acesso.criar');
    expect(r.corpo.usuario.permissoes).not.toContain('usuario.editar');
  });

  it('o login não diferencia maiúsculas — equivale ao COLLATE NOCASE do SQLite', async () => {
    await criarUsuario({ login: 'JOSE.R' });

    await expect(entrar(app, 'jose.r').then((r) => r.status)).resolves.toBe(200);
    await expect(entrar(app, ' Jose.R ').then((r) => r.status)).resolves.toBe(200);
  });

  it('dá a MESMA mensagem para usuário inexistente, senha errada e conta inativa', async () => {
    await criarUsuario({ login: 'TIAGO' });
    await criarUsuario({ login: 'INATIVO', ativo: false });

    const inexistente = await entrar(app, 'NINGUEM');
    const senhaErrada = await entrar(app, 'TIAGO', 'errada123');
    const inativo = await entrar(app, 'INATIVO');

    for (const r of [inexistente, senhaErrada, inativo]) {
      expect(r.status).toBe(401);
      expect(r.corpo.erro.mensagem).toBe('Usuário ou senha inválidos.');
    }
    // Nada na resposta permite distinguir os três casos.
    expect(new Set([inexistente, senhaErrada, inativo].map((r) => JSON.stringify(r.corpo))).size).toBe(1);
  });

  it('não autentica usuário inativo, mesmo com a senha certa', async () => {
    await criarUsuario({ login: 'DESLIGADO', ativo: false });
    expect((await entrar(app, 'DESLIGADO')).status).toBe(401);
  });

  it('nunca devolve o hash da senha', async () => {
    await criarUsuario({ login: 'MACIEL' });
    const r = await entrar(app, 'MACIEL');

    const texto = JSON.stringify(r.corpo);
    expect(texto).not.toContain('PBKDF2');
    expect(texto).not.toContain(SENHA_PADRAO);
    expect(r.corpo.usuario).not.toHaveProperty('senhaHash');
  });

  it('marca trocarSenha, para o cliente levar à troca antes de seguir', async () => {
    await criarUsuario({ login: 'NOVATO', trocarSenha: true });
    expect((await entrar(app, 'NOVATO')).corpo.usuario.trocarSenha).toBe(true);
  });
});

describe('R27 — compatibilidade com os hashes do desktop', () => {
  it('autentica um usuário cuja senha foi gravada pelo sistema C#', async () => {
    // Hash gerado com os mesmos parâmetros do Rfc2898DeriveBytes de Seguranca.cs.
    const salt = Buffer.alloc(16, 3);
    const hash = pbkdf2Sync('senhaDoDesktop', salt, 50_000, 32, 'sha256');
    const doDesktop = `PBKDF2$50000$${salt.toString('base64')}$${hash.toString('base64')}`;

    const perfil = await prisma.perfil.findUniqueOrThrow({ where: { nome: 'PORTARIA' } });
    await prisma.usuario.create({
      data: {
        login: 'GUIMARAES',
        loginNorm: 'GUIMARAES',
        nome: 'GUIMARAES',
        senhaHash: doDesktop,
        perfilId: perfil.id,
        nivelLegado: 2,
      },
    });

    // Migra sem forçar troca de senha: é a razão de o formato ter sido mantido.
    expect((await entrar(app, 'GUIMARAES', 'senhaDoDesktop')).status).toBe(200);
  });
});

describe('R31 — a tentativa recusada é auditada antes de existir sessão', () => {
  it('grava LOGIN RECUSADO com o login digitado e o motivo real', async () => {
    await entrar(app, 'FULANO', 'qualquer');

    const [evento] = await auditoriaRecente(1);
    expect(evento).toMatchObject({
      tipo: 'ACESSO',
      acao: AUDITORIA_ACAO.LOGIN_RECUSADO,
      registro: 'FULANO',
      detalhe: 'Usuário não encontrado',
    });
    // Sem sessão: não há usuário a vincular, mas o login digitado fica.
    expect(evento!.usuarioId).toBeNull();
    expect(evento!.usuarioLogin).toBe('FULANO');
  });

  it('distingue senha incorreta de usuário inativo NA TRILHA, não na resposta', async () => {
    await criarUsuario({ login: 'HENRIQUE' });
    await criarUsuario({ login: 'PARADO', ativo: false });

    await entrar(app, 'HENRIQUE', 'errada123');
    expect((await auditoriaRecente(1))[0]!.detalhe).toBe('Senha incorreta');

    await entrar(app, 'PARADO');
    expect((await auditoriaRecente(1))[0]!.detalhe).toBe('Usuário inativo');
  });

  it('grava LOGIN e congela o nome do usuário no evento (R33)', async () => {
    const usuario = await criarUsuario({ login: 'ISLEIDE', nome: 'ISLEIDE SANTOS' });
    await entrar(app, 'ISLEIDE');

    const [evento] = await auditoriaRecente(1);
    expect(evento).toMatchObject({ acao: AUDITORIA_ACAO.LOGIN, usuarioNome: 'ISLEIDE SANTOS' });

    // Renomear o usuário não reescreve o passado.
    await prisma.usuario.update({ where: { id: usuario.id }, data: { nome: 'OUTRO NOME' } });
    expect((await auditoriaRecente(1))[0]!.usuarioNome).toBe('ISLEIDE SANTOS');
  });
});

describe('sessão', () => {
  it('GET /eu devolve a sessão de quem está autenticado', async () => {
    await criarUsuario({ login: 'MARCIO' });
    const { autorizacao } = await entrar(app, 'MARCIO');

    const r = await app.inject({ method: 'GET', url: '/api/auth/eu', headers: autorizacao });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ login: 'MARCIO', perfil: 'PORTARIA' });
  });

  it('recusa requisição sem token, com token inválido ou com esquema errado', async () => {
    for (const headers of [{}, { authorization: 'Bearer nada' }, { authorization: 'Basic abc' }]) {
      const r = await app.inject({ method: 'GET', url: '/api/auth/eu', headers });
      expect(r.statusCode).toBe(401);
    }
  });

  it('o refresh vai em cookie httpOnly, fora do alcance do JavaScript da página', async () => {
    await criarUsuario({ login: 'JESULINO' });
    const { cookieRefresh } = await entrar(app, 'JESULINO');

    expect(cookieRefresh).toBeDefined();
    expect(cookieRefresh!.httpOnly).toBe(true);
    expect(cookieRefresh!.sameSite?.toLowerCase()).toBe('strict');
  });

  it('o cookie de refresh não é aceito como token de acesso', async () => {
    await criarUsuario({ login: 'OTAVIO' });
    const { cookieRefresh } = await entrar(app, 'OTAVIO');

    const r = await app.inject({
      method: 'GET',
      url: '/api/auth/eu',
      headers: { authorization: `Bearer ${cookieRefresh!.value}` },
    });
    // Um refresh de 12h usado como acesso anularia a expiração curta.
    expect(r.statusCode).toBe(401);
  });

  it('renova o token de acesso a partir do cookie', async () => {
    await criarUsuario({ login: 'FERNANDO' });
    const { cookieRefresh } = await entrar(app, 'FERNANDO');

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { impakto_refresh: cookieRefresh!.value },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json().usuario.login).toBe('FERNANDO');
  });

  it('usuário desativado perde o acesso na hora, sem esperar o token expirar', async () => {
    const usuario = await criarUsuario({ login: 'SAINDO' });
    const { autorizacao, cookieRefresh } = await entrar(app, 'SAINDO');

    await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: false } });

    const comToken = await app.inject({ method: 'GET', url: '/api/auth/eu', headers: autorizacao });
    expect(comToken.statusCode).toBe(401);

    const renovando = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { impakto_refresh: cookieRefresh!.value },
    });
    expect(renovando.statusCode).toBe(401);
  });

  it('a permissão acompanha a troca de perfil sem novo login', async () => {
    const usuario = await criarUsuario({ login: 'PROMOVIDO' });
    const { autorizacao } = await entrar(app, 'PROMOVIDO');

    const admin = await prisma.perfil.findUniqueOrThrow({ where: { nome: 'ADMINISTRADOR' } });
    await prisma.usuario.update({ where: { id: usuario.id }, data: { perfilId: admin.id } });

    const r = await app.inject({ method: 'GET', url: '/api/auth/eu', headers: autorizacao });
    expect(r.json().permissoes).toContain('usuario.editar');
  });
});

describe('R38 — saída do sistema', () => {
  it('logout registra SAIDA DO SISTEMA e apaga o cookie', async () => {
    await criarUsuario({ login: 'JOSE' });
    const { autorizacao } = await entrar(app, 'JOSE');

    const r = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: autorizacao });
    expect(r.statusCode).toBe(204);

    const [evento] = await auditoriaRecente(1);
    expect(evento).toMatchObject({ acao: AUDITORIA_ACAO.SAIDA_DO_SISTEMA, usuarioLogin: 'JOSE' });

    const apagado = r.cookies.find((c) => c.name === 'impakto_refresh');
    expect(apagado?.value).toBe('');
  });
});

describe('troca da própria senha', () => {
  it('troca, limpa o marcador e passa a valer no login seguinte', async () => {
    await criarUsuario({ login: 'TROCA', trocarSenha: true });
    const { autorizacao } = await entrar(app, 'TROCA');

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/trocar-senha',
      headers: autorizacao,
      payload: { senhaAtual: SENHA_PADRAO, novaSenha: 'novaSenha2026' },
    });
    expect(r.statusCode).toBe(204);

    expect((await entrar(app, 'TROCA', SENHA_PADRAO)).status).toBe(401);
    const novo = await entrar(app, 'TROCA', 'novaSenha2026');
    expect(novo.status).toBe(200);
    expect(novo.corpo.usuario.trocarSenha).toBe(false);
  });

  it('exige a senha atual — o primeiro acesso do admin não é porta aberta', async () => {
    await criarUsuario({ login: 'ADM', perfil: 'ADMINISTRADOR', trocarSenha: true });
    const { autorizacao } = await entrar(app, 'ADM');

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/trocar-senha',
      headers: autorizacao,
      payload: { senhaAtual: 'chutando', novaSenha: 'novaSenha2026' },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().erro.campos[0].campo).toBe('senhaAtual');
  });

  it('exige 8 caracteres — o desktop aceitava 4', async () => {
    await criarUsuario({ login: 'CURTA' });
    const { autorizacao } = await entrar(app, 'CURTA');

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/trocar-senha',
      headers: autorizacao,
      payload: { senhaAtual: SENHA_PADRAO, novaSenha: '1234' },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().erro.campos[0].campo).toBe('novaSenha');
  });

  it('recusa repetir a senha atual', async () => {
    await criarUsuario({ login: 'IGUAL' });
    const { autorizacao } = await entrar(app, 'IGUAL');

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/trocar-senha',
      headers: autorizacao,
      payload: { senhaAtual: SENHA_PADRAO, novaSenha: SENHA_PADRAO },
    });
    expect(r.statusCode).toBe(422);
  });

  it('audita SENHA ALTERADA', async () => {
    await criarUsuario({ login: 'AUDITA' });
    const { autorizacao } = await entrar(app, 'AUDITA');

    await app.inject({
      method: 'POST',
      url: '/api/auth/trocar-senha',
      headers: autorizacao,
      payload: { senhaAtual: SENHA_PADRAO, novaSenha: 'outraSenha2026' },
    });

    expect((await auditoriaRecente(1))[0]).toMatchObject({
      tipo: 'USUARIO',
      acao: AUDITORIA_ACAO.SENHA_ALTERADA,
      registro: 'AUDITA',
    });
  });
});

describe('R32 — troca de turno', () => {
  it('passa a sessão para quem assume e audita de quem para quem', async () => {
    await criarUsuario({ login: 'SAI', nome: 'JOSE ROGERIO' });
    await criarUsuario({ login: 'ENTRA', nome: 'MARCIO' });

    const { autorizacao } = await entrar(app, 'SAI');

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/trocar-turno',
      headers: autorizacao,
      payload: { login: 'ENTRA', senha: SENHA_PADRAO },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json().usuario.login).toBe('ENTRA');

    const eventos = await auditoriaRecente(3);
    const troca = eventos.find((e) => e.acao === AUDITORIA_ACAO.TROCA_DE_TURNO);
    expect(troca).toMatchObject({ registro: 'ENTRA', detalhe: 'Assumiu o turno de JOSE ROGERIO' });
    expect(troca!.dados).toMatchObject({ deLogin: 'SAI', paraLogin: 'ENTRA' });
  });

  it('SE QUEM ASSUME ERRA A SENHA, quem já estava continua valendo', async () => {
    await criarUsuario({ login: 'FICA' });
    await criarUsuario({ login: 'TENTA' });

    const { autorizacao } = await entrar(app, 'FICA');

    const falhou = await app.inject({
      method: 'POST',
      url: '/api/auth/trocar-turno',
      headers: autorizacao,
      payload: { login: 'TENTA', senha: 'errada123' },
    });
    expect(falhou.statusCode).toBe(401);

    // O sistema NUNCA fica aberto sem usuário na sessão.
    const ainda = await app.inject({ method: 'GET', url: '/api/auth/eu', headers: autorizacao });
    expect(ainda.statusCode).toBe(200);
    expect(ainda.json().login).toBe('FICA');
  });

  it('exige sessão: não é uma segunda porta de entrada', async () => {
    await criarUsuario({ login: 'ALGUEM' });

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/trocar-turno',
      payload: { login: 'ALGUEM', senha: SENHA_PADRAO },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('R31 — barreira contra força bruta', () => {
  it('bloqueia a rajada vinda do MESMO IP, sem punir os outros', async () => {
    await criarUsuario({ login: 'ALVO' });
    const doAtacante = '203.0.113.9';

    const respostas = [];
    for (let i = 0; i < 14; i++) {
      respostas.push((await entrar(app, 'ALVO', 'chute' + i, doAtacante)).status);
    }

    expect(respostas.filter((s) => s === 401).length).toBeLessThanOrEqual(10);
    expect(respostas).toContain(429);

    // Outro porteiro, em outra estação, continua conseguindo entrar.
    expect((await entrar(app, 'ALVO')).status).toBe(200);
  });
});

describe('validação de entrada', () => {
  it('recusa corpo sem os campos, com a mensagem por campo', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: '' },
      remoteAddress: ipDeTeste(),
    });

    expect(r.statusCode).toBe(400);
    expect(r.json().erro.codigo).toBe('DADOS_INVALIDOS');
  });

  it('não quebra com aspas, byte nulo ou SQL no login — devolve 401 como qualquer credencial inválida', async () => {
    for (const login of ["' OR 1=1 --", "admin'; DROP TABLE usuario; --", 'a\u0000b']) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { login, senha: 'x' },
        remoteAddress: ipDeTeste(),
      });
      expect(r.statusCode).toBe(401);
    }

    // A tabela continua de pé, e nenhuma das tentativas virou erro de servidor:
    // o byte nulo chegava ao PostgreSQL e produzia 500 com stack no log.
    await expect(prisma.usuario.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});
