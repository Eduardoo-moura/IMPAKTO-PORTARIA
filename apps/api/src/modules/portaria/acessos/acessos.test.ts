/**
 * Testes de integração do controle de acesso — o núcleo do sistema.
 *
 * Cada bloco cita a regra rastreada em docs/00-LEVANTAMENTO-E-ARQUITETURA.md.
 * O objetivo é comparar comportamento com `Frm_Veiculo.cs`, não cobrir linhas.
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

async function entrada(corpo: Record<string, unknown>, h = porteiro) {
  const r = await app.inject({ method: 'POST', url: '/api/portaria/acessos', ...como(h), payload: corpo });
  return { status: r.statusCode, corpo: r.json() };
}

async function movimento(query = '') {
  const r = await app.inject({ method: 'GET', url: `/api/portaria/acessos/movimento${query}`, ...como() });
  return { status: r.statusCode, corpo: r.json() };
}

/** Coloca um acesso já gravado numa data passada, para exercitar a janela. */
async function moverParaODia(id: string, dia: string, hora = '10:00:00') {
  await prisma.acesso.update({
    where: { id: BigInt(id) },
    data: { entradaEm: instanteLocal(`${dia} ${hora}`) },
  });
}

describe('R06 — obrigatórios são só nome e documento', () => {
  it('grava com o mínimo, sem placa', async () => {
    const r = await entrada({ nome: 'jose da silva', documento: '52998224725' });

    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ nome: 'JOSE DA SILVA', documento: '52998224725', placa: null });
    expect(r.corpo.saidaEm).toBeNull();
    expect(r.corpo.entradaEm).not.toBeNull();
  });

  it('recusa sem nome e sem documento', async () => {
    expect((await entrada({ documento: '52998224725' })).status).toBe(400);
    expect((await entrada({ nome: 'JOSE' })).status).toBe(400);
    expect((await entrada({ nome: '   ', documento: '52998224725' })).status).toBe(422);
  });

  it('R19 — grava tudo em maiúsculas, mesmo digitado em minúsculas', async () => {
    const r = await entrada({
      nome: 'maria souza',
      documento: '52998224725',
      empresa: '  transportes são joão  ',
      tipoVeiculo: 'fiorino',
    });

    expect(r.corpo.nome).toBe('MARIA SOUZA');
    expect(r.corpo.empresa).toBe('TRANSPORTES SÃO JOÃO');
    expect(r.corpo.tipoVeiculo).toBe('FIORINO');
  });
});

describe('R02 — a placa não é obrigatória e texto livre é preservado', () => {
  it('normaliza quando forma placa completa', async () => {
    const r = await entrada({ nome: 'JOSE', documento: '1234567', placa: 'abc 1d23' });
    expect(r.corpo.placa).toBe('ABC1D23');
  });

  it('preserva S/ PLACA como o porteiro digitou', async () => {
    const r = await entrada({ nome: 'JOSE', documento: '1234567', placa: 'S/ PLACA' });
    expect(r.corpo.placa).toBe('S/ PLACA');
  });
});

describe('R04 — a conferência do documento AVISA, nunca impede', () => {
  it('recusa com 409 e diz qual campo, em vez de barrar de vez', async () => {
    const r = await entrada({ nome: 'JOSE', documento: '12345678901' });

    expect(r.status).toBe(409);
    expect(r.corpo.erro.codigo).toBe('CONFIRMAR_DOCUMENTO');
    expect(r.corpo.erro.contexto.documentos[0].campo).toBe('documento');
    expect(r.corpo.erro.mensagem).toContain('RG');
  });

  it('grava quando o porteiro confirma — os 94 documentos legados dependem disso', async () => {
    const r = await entrada({ nome: 'JOSE', documento: '12345678901', confirmarDocumento: true });

    expect(r.status).toBe(201);
    expect(r.corpo.documento).toBe('12345678901');
  });

  it('não incomoda quem digita RG: menos de 11 dígitos não entra na conferência', async () => {
    expect((await entrada({ nome: 'JOSE', documento: '1234567' })).status).toBe(201);
    expect((await entrada({ nome: 'ANA', documento: 'MG-12.345' })).status).toBe(201);
  });

  it('CPF válido passa direto', async () => {
    expect((await entrada({ nome: 'JOSE', documento: '529.982.247-25' })).status).toBe(201);
  });

  it('confere também os acompanhantes, apontando o índice', async () => {
    const r = await entrada({
      nome: 'JOSE',
      documento: '52998224725',
      acompanhantes: [{ nome: 'AJUDANTE', documento: '11144477735' }, { nome: 'OUTRO', documento: '12345678901' }],
    });

    expect(r.status).toBe(409);
    expect(r.corpo.erro.contexto.documentos[0].campo).toBe('acompanhantes.1.documento');
  });
});

describe('R07 — acompanhantes', () => {
  it('compacta a lista sem buracos: quem preencheu o 3º vira o 2º', async () => {
    const r = await entrada({
      nome: 'JOSE',
      documento: '1234567',
      acompanhantes: [
        { nome: 'PRIMEIRO', documento: '111' },
        { nome: '', documento: '' },
        { nome: 'TERCEIRO', documento: '333' },
      ],
    });

    expect(r.corpo.acompanhantes).toHaveLength(2);
    expect(r.corpo.acompanhantes.map((c: { nome: string }) => c.nome)).toEqual(['PRIMEIRO', 'TERCEIRO']);

    const gravados = await prisma.acessoAcompanhante.findMany({ orderBy: { ordem: 'asc' } });
    expect(gravados.map((c) => c.ordem)).toEqual([1, 2]);
  });

  it('aceita cinco e recusa o sexto', async () => {
    const cinco = Array.from({ length: 5 }, (_, i) => ({ nome: `AJUDANTE ${i}` }));
    expect((await entrada({ nome: 'JOSE', documento: '1234567', acompanhantes: cinco })).status).toBe(201);

    const seis = Array.from({ length: 6 }, (_, i) => ({ nome: `AJUDANTE ${i}` }));
    expect((await entrada({ nome: 'JOSE', documento: '1234567', acompanhantes: seis })).status).toBe(400);
  });

  it('acompanhante sem documento é aceito — só o nome basta', async () => {
    const r = await entrada({ nome: 'JOSE', documento: '1234567', acompanhantes: [{ nome: 'SEM DOCUMENTO' }] });
    expect(r.status).toBe(201);
    expect(r.corpo.acompanhantes[0]).toMatchObject({ nome: 'SEM DOCUMENTO', documento: null });
  });
});

describe('R08 — a entrada nunca edita; cada gravação é um registro novo', () => {
  it('duas visitas da mesma pessoa geram dois acessos e uma pessoa só', async () => {
    await entrada({ nome: 'JOSE', documento: '52998224725', placa: 'ABC1234' });
    await entrada({ nome: 'JOSE', documento: '52998224725', placa: 'ABC1234' });

    expect(await prisma.acesso.count()).toBe(2);
    expect(await prisma.pessoa.count()).toBe(1);
    expect(await prisma.veiculo.count()).toBe(1);
  });

  it('R03 — grafias diferentes da mesma placa são o MESMO veículo', async () => {
    await entrada({ nome: 'JOSE', documento: '111', placa: 'GCT6604' });
    await entrada({ nome: 'JOSE', documento: '111', placa: 'gct 6604' });

    expect(await prisma.veiculo.count()).toBe(1);
    const veiculo = await prisma.veiculo.findFirstOrThrow();
    expect(veiculo.placaNorm).toBe('GCT6604');
  });

  it('empresa em texto livre vira cadastro único, sem duplicar por acento ou caixa', async () => {
    await entrada({ nome: 'A', documento: '1', empresa: 'Logística ABC' });
    await entrada({ nome: 'B', documento: '2', empresa: 'LOGISTICA ABC' });

    expect(await prisma.empresa.count()).toBe(1);
    // A grafia guardada é a que foi digitada; a chave é a normalizada.
    expect((await prisma.empresa.findFirstOrThrow()).nomeNorm).toBe('LOGISTICA ABC');
  });
});

describe('R09, R10 — busca e pré-preenchimento', () => {
  beforeEach(async () => {
    await entrada({
      nome: 'ANTIGA VISITA',
      documento: '529.982.247-25',
      celular: '(11) 98888-7777',
      placa: 'GCT 6604',
      empresa: 'TRANSPORTES X',
      tipoVeiculo: 'FIORINO',
    });
  });

  async function buscar(por: string, valor: string) {
    const r = await app.inject({ method: 'GET', url: `/api/portaria/busca/${por}/${valor}`, ...como() });
    return { status: r.statusCode, corpo: r.json() };
  }

  it('acha a placa gravada com espaço a partir da digitada sem', async () => {
    const r = await buscar('placa', 'GCT6604');
    expect(r.corpo).toMatchObject({ nome: 'ANTIGA VISITA', empresa: 'TRANSPORTES X', tipoVeiculo: 'FIORINO' });
  });

  it('CORREÇÃO ao desktop: acha o documento gravado com pontuação', async () => {
    // O C# compara texto exato e não encontraria este registro.
    const r = await buscar('documento', '52998224725');
    expect(r.corpo?.nome).toBe('ANTIGA VISITA');
    expect(r.corpo?.placa).toBe('GCT6604');
  });

  it('devolve null quando não há visita anterior', async () => {
    expect((await buscar('placa', 'XXX9999')).corpo).toBeNull();
  });

  it('traz sempre a visita MAIS RECENTE', async () => {
    await entrada({ nome: 'VISITA NOVA', documento: '52998224725', placa: 'GCT6604' });
    expect((await buscar('placa', 'GCT6604')).corpo.nome).toBe('VISITA NOVA');
  });

  it('o histórico lista as visitas, da mais recente para a mais antiga', async () => {
    await entrada({ nome: 'SEGUNDA VISITA', documento: '52998224725', placa: 'GCT6604' });

    const r = await app.inject({ method: 'GET', url: '/api/portaria/historico/placa/GCT6604', ...como() });
    const nomes = r.json().map((a: { nome: string }) => a.nome);
    expect(nomes).toEqual(['SEGUNDA VISITA', 'ANTIGA VISITA']);
  });
});

describe('R11, R12, R13 — a grade do movimento', () => {
  it('mostra o que entrou hoje', async () => {
    await entrada({ nome: 'DE HOJE', documento: '1' });

    const r = await movimento();
    expect(r.corpo.acessos.map((a: { nome: string }) => a.nome)).toContain('DE HOJE');
    expect(r.corpo.hoje).toBe(diaDaPortaria());
  });

  it('mantém a pendência de ontem alcançável — é o veículo que pernoita', async () => {
    const acesso = await entrada({ nome: 'PERNOITOU', documento: '2' });
    await moverParaODia(acesso.corpo.id, diaMais(-1), '22:00:00');

    const r = await movimento();
    const linha = r.corpo.acessos.find((a: { nome: string }) => a.nome === 'PERNOITOU');
    expect(linha).toBeDefined();
    // R14 — pintada de âmbar, para a saída de hoje não ser dada na linha errada.
    expect(linha.pendenciaAntiga).toBe(true);
  });

  it('esquece a pendência velha: 3 dias, para a grade não virar depósito', async () => {
    const dentro = await entrada({ nome: 'AINDA NA JANELA', documento: '3' });
    const fora = await entrada({ nome: 'VELHA DEMAIS', documento: '4' });
    await moverParaODia(dentro.corpo.id, diaMais(-2));
    await moverParaODia(fora.corpo.id, diaMais(-30));

    const nomes = (await movimento()).corpo.acessos.map((a: { nome: string }) => a.nome);
    expect(nomes).toContain('AINDA NA JANELA');
    expect(nomes).not.toContain('VELHA DEMAIS');
  });

  it('quem já saiu ontem não volta para a grade', async () => {
    const acesso = await entrada({ nome: 'SAIU ONTEM', documento: '5' });
    await moverParaODia(acesso.corpo.id, diaMais(-1));
    await prisma.acesso.update({
      where: { id: BigInt(acesso.corpo.id) },
      data: { saidaEm: instanteLocal(`${diaMais(-1)} 18:00:00`) },
    });

    const nomes = (await movimento()).corpo.acessos.map((a: { nome: string }) => a.nome);
    expect(nomes).not.toContain('SAIU ONTEM');
  });

  it('R13 — registro legado sem data não invade a grade', async () => {
    const pessoa = await prisma.pessoa.create({
      data: { documento: '999', documentoNorm: '999', tipoDocumento: 'RG', nome: 'LEGADO' },
    });
    await prisma.acesso.create({
      data: {
        pessoaId: pessoa.id,
        nomeSnapshot: 'LEGADO SEM DATA',
        documentoSnapshot: '999',
        entradaEm: null,
        origem: 'MIGRACAO_DESKTOP',
      },
    });

    const nomes = (await movimento()).corpo.acessos.map((a: { nome: string }) => a.nome);
    expect(nomes).not.toContain('LEGADO SEM DATA');
  });

  it('R12 — o corte do dia é no fuso da portaria, não em UTC', async () => {
    // 22h em São Paulo já é o dia seguinte em UTC. Com UTC, a grade esvaziava
    // às 21h e ficava vazia o resto do turno da madrugada.
    const acesso = await entrada({ nome: 'TURNO DA NOITE', documento: '6' });
    await moverParaODia(acesso.corpo.id, diaDaPortaria(), '22:30:00');

    const linha = (await movimento()).corpo.acessos.find(
      (a: { nome: string }) => a.nome === 'TURNO DA NOITE',
    );
    expect(linha).toBeDefined();
    expect(linha.pendenciaAntiga).toBe(false);
  });

  it('R18 — o filtro "somente dentro" tira quem já saiu', async () => {
    const saiu = await entrada({ nome: 'JA SAIU', documento: '7' });
    await entrada({ nome: 'AINDA DENTRO', documento: '8' });
    await app.inject({ method: 'POST', url: `/api/portaria/acessos/${saiu.corpo.id}/saida`, ...como() });

    const todos = (await movimento()).corpo;
    const dentro = (await movimento('?somenteDentro=true')).corpo;

    expect(todos.acessos.map((a: { nome: string }) => a.nome)).toContain('JA SAIU');
    expect(dentro.acessos.map((a: { nome: string }) => a.nome)).not.toContain('JA SAIU');
    expect(dentro.acessos.map((a: { nome: string }) => a.nome)).toContain('AINDA DENTRO');
    // A contagem não muda com o filtro: ela descreve a planta, não a tela.
    expect(todos.dentro).toBe(1);
    expect(dentro.dentro).toBe(1);
  });
});

describe('R15, R16, R17 — saída', () => {
  async function saida(id: string, query = '', h = porteiro) {
    const r = await app.inject({
      method: 'POST',
      url: `/api/portaria/acessos/${id}/saida${query}`,
      ...como(h),
    });
    return { status: r.statusCode, corpo: r.json() };
  }

  it('registra a saída e audita', async () => {
    const acesso = await entrada({ nome: 'JOSE', documento: '1', placa: 'ABC1234' });
    const r = await saida(acesso.corpo.id);

    expect(r.status).toBe(200);
    expect(r.corpo.saidaEm).not.toBeNull();
    expect((await auditoriaRecente(1))[0]).toMatchObject({
      acao: AUDITORIA_ACAO.SAIDA_REGISTRADA,
      registro: 'ABC1234',
    });
  });

  it('sem placa, a trilha registra "(sem placa)" em vez de vazio', async () => {
    const acesso = await entrada({ nome: 'JOSE', documento: '1' });
    await saida(acesso.corpo.id);
    expect((await auditoriaRecente(1))[0]!.registro).toBe('(sem placa)');
  });

  it('R16 — a segunda saída exige confirmação, em vez de sobrescrever calado', async () => {
    const acesso = await entrada({ nome: 'JOSE', documento: '1' });
    const primeira = await saida(acesso.corpo.id);

    const segunda = await saida(acesso.corpo.id);
    expect(segunda.status).toBe(409);
    expect(segunda.corpo.erro.codigo).toBe('SAIDA_JA_REGISTRADA');
    // O contexto diz de quando era a saída anterior, para a decisão ser informada.
    expect(segunda.corpo.erro.contexto.saidaAnterior).toBe(primeira.corpo.saidaEm);
  });

  it('R16 — confirmada, sobrescreve e a trilha guarda o valor substituído', async () => {
    const acesso = await entrada({ nome: 'JOSE', documento: '1' });
    const primeira = await saida(acesso.corpo.id);

    const forcada = await saida(acesso.corpo.id, '?forcar=true');
    expect(forcada.status).toBe(200);

    const [evento] = await auditoriaRecente(1);
    expect(evento!.acao).toBe(AUDITORIA_ACAO.SAIDA_SOBRESCRITA);
    expect(evento!.detalhe).toContain(primeira.corpo.saidaEm);
  });

  it('R17 — recusa saída anterior à entrada, que o desktop aceitava', async () => {
    const acesso = await entrada({ nome: 'JOSE', documento: '1' });
    // Entrada no futuro: qualquer saída registrada agora seria incoerente.
    await prisma.acesso.update({
      where: { id: BigInt(acesso.corpo.id) },
      data: { entradaEm: new Date(Date.now() + 60 * 60 * 1000) },
    });

    expect((await saida(acesso.corpo.id)).status).toBe(422);
  });

  it('404 em acesso inexistente', async () => {
    expect((await saida('999999')).status).toBe(404);
  });

  it('aceita corpo vazio com Content-Type json — não há o que enviar numa saída', async () => {
    const acesso = await entrada({ nome: 'JOSE', documento: '1' });

    const r = await app.inject({
      method: 'POST',
      url: `/api/portaria/acessos/${acesso.corpo.id}/saida`,
      ...como(),
      headers: { ...porteiro, 'content-type': 'application/json' },
      payload: '',
    });

    expect(r.statusCode).toBe(200);
  });
});

describe('R29 — autorização', () => {
  it('sem sessão, 401 em tudo', async () => {
    for (const url of [
      '/api/portaria/acessos/movimento',
      '/api/portaria/busca/placa/ABC1234',
      '/api/portaria/historico/placa/ABC1234',
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
    // Com corpo válido: sem ele a validação do schema responde 400 antes de
    // a autenticação ser consultada.
    const semSessao = await app.inject({
      method: 'POST',
      url: '/api/portaria/acessos',
      payload: { nome: 'X', documento: '1' },
    });
    expect(semSessao.statusCode).toBe(401);
  });

  it('perfil sem a permissão recebe 403', async () => {
    const consulta = await prisma.perfil.create({ data: { nome: 'SO_LEITURA' } });
    const ver = await prisma.permissao.findUniqueOrThrow({ where: { chave: 'portaria.acesso.ver' } });
    await prisma.perfilPermissao.create({ data: { perfilId: consulta.id, permissaoId: ver.id } });

    await criarUsuario({ login: 'OLHEIRO', perfil: 'SO_LEITURA' });
    const dele = (await entrar(app, 'OLHEIRO')).autorizacao;

    // Vê a grade, mas não registra entrada.
    expect((await app.inject({ method: 'GET', url: '/api/portaria/acessos/movimento', ...como(dele) })).statusCode).toBe(200);
    expect((await entrada({ nome: 'X', documento: '1' }, dele)).status).toBe(403);
  });
});

describe('auditoria da entrada', () => {
  it('grava ENTRADA REGISTRADA com a placa, o nome e a contagem de acompanhantes', async () => {
    await entrada({
      nome: 'MOTORISTA',
      documento: '1',
      placa: 'ABC1234',
      acompanhantes: [{ nome: 'A' }, { nome: 'B' }],
    });

    expect((await auditoriaRecente(1))[0]).toMatchObject({
      tipo: 'VEICULO',
      acao: AUDITORIA_ACAO.ENTRADA_REGISTRADA,
      registro: 'ABC1234',
      detalhe: 'MOTORISTA (+2 acompanhante(s))',
      usuarioLogin: 'BRAS',
    });
  });

  it('o acesso guarda quem registrou — o campo que o desktop nunca preencheu', async () => {
    const r = await entrada({ nome: 'JOSE', documento: '1' });
    expect(r.corpo.usuarioEntrada).toBe('BRAS');
  });
});
