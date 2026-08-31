/**
 * Seed de perfis e permissões.
 *
 * Regra que guia este arquivo (briefing §10 vs. o que o C# faz): o desktop tem
 * dois níveis — 1 = total, 2 = restrito. O modelo web é
 * Usuário → Perfil → Permissões → Módulo, mais granular. O mapeamento inicial
 * NÃO muda o acesso de ninguém:
 *
 *   NIVEL 1 (2 usuários) → ADMINISTRADOR, com todas as permissões
 *   NIVEL 2 (12 usuários) → PORTARIA, com todo o `portaria.*`
 *
 * GESTOR e CONSULTA nascem na estrutura e **sem nenhum usuário** — a
 * granularidade fica disponível sem alterar o comportamento atual.
 *
 * Idempotente: pode rodar quantas vezes for preciso.
 */

import { PrismaClient } from '@prisma/client';
import { PERFIS } from '@impakto/shared';
import { gerarHash } from '@impakto/shared/senha';

const prisma = new PrismaClient();

type DefPermissao = { chave: string; descricao: string };

const PERMISSOES: DefPermissao[] = [
  // ---------------------------------------------------------------- portaria
  { chave: 'portaria.acesso.ver', descricao: 'Ver a grade do movimento e o histórico' },
  { chave: 'portaria.acesso.criar', descricao: 'Registrar entrada' },
  { chave: 'portaria.acesso.saida', descricao: 'Registrar saída' },
  { chave: 'portaria.acesso.sobrescrever_saida', descricao: 'Sobrescrever uma saída já registrada' },
  { chave: 'portaria.pessoa.ver', descricao: 'Consultar pessoas' },
  { chave: 'portaria.pessoa.editar', descricao: 'Cadastrar e alterar pessoas' },
  { chave: 'portaria.veiculo.ver', descricao: 'Consultar veículos' },
  { chave: 'portaria.veiculo.editar', descricao: 'Cadastrar e alterar veículos' },
  { chave: 'portaria.mercadoria.ver', descricao: 'Ver mercadorias na portaria' },
  { chave: 'portaria.mercadoria.registrar', descricao: 'Registrar chegada de mercadoria' },
  { chave: 'portaria.mercadoria.entregar', descricao: 'Confirmar retirada de mercadoria' },
  { chave: 'portaria.mercadoria.desfazer_entrega', descricao: 'Desfazer uma entrega (auditado)' },
  { chave: 'portaria.relatorio.emitir', descricao: 'Emitir relatórios da portaria' },
  { chave: 'portaria.dashboard.ver', descricao: 'Ver o painel da portaria' },
  // ---------------------------------------------------------------- sistema
  { chave: 'usuario.ver', descricao: 'Consultar usuários' },
  { chave: 'usuario.editar', descricao: 'Criar, alterar, ativar e inativar usuários' },
  { chave: 'auditoria.ver', descricao: 'Consultar a trilha de auditoria' },
];

/** Todo `portaria.*` — é o que o NIVEL 2 já podia fazer no desktop. */
const DO_PORTEIRO = PERMISSOES.filter((p) => p.chave.startsWith('portaria.')).map((p) => p.chave);

/** Só leitura, para os perfis novos que ainda não têm usuários. */
const SO_LEITURA = PERMISSOES.filter((p) => p.chave.endsWith('.ver')).map((p) => p.chave);

const DEFINICAO_PERFIS: Array<{
  nome: string;
  descricao: string;
  permissoes: string[] | 'TODAS';
}> = [
  {
    nome: PERFIS.ADMINISTRADOR,
    descricao: 'Acesso total. Equivale ao NIVEL 1 do sistema desktop.',
    permissoes: 'TODAS',
  },
  {
    nome: PERFIS.PORTARIA,
    descricao: 'Operação da portaria. Equivale ao NIVEL 2 do sistema desktop.',
    permissoes: DO_PORTEIRO,
  },
  {
    nome: PERFIS.GESTOR,
    descricao: 'Leitura e relatórios. Perfil novo, sem usuários na fase 1.',
    permissoes: [...SO_LEITURA.filter((c) => c !== 'auditoria.ver'), 'portaria.relatorio.emitir'],
  },
  {
    nome: PERFIS.CONSULTA,
    descricao: 'Somente leitura. Perfil novo, sem usuários na fase 1.',
    permissoes: SO_LEITURA.filter((c) => c !== 'auditoria.ver' && c !== 'usuario.ver'),
  },
];

async function semear(): Promise<void> {
  for (const p of PERMISSOES) {
    await prisma.permissao.upsert({
      where: { chave: p.chave },
      update: { descricao: p.descricao, modulo: p.chave.split('.')[0]! },
      create: { chave: p.chave, descricao: p.descricao, modulo: p.chave.split('.')[0]! },
    });
  }
  console.log(`✓ ${PERMISSOES.length} permissões`);

  for (const def of DEFINICAO_PERFIS) {
    const perfil = await prisma.perfil.upsert({
      where: { nome: def.nome },
      update: { descricao: def.descricao, deSistema: true },
      create: { nome: def.nome, descricao: def.descricao, deSistema: true },
    });

    const chaves = def.permissoes === 'TODAS' ? PERMISSOES.map((p) => p.chave) : def.permissoes;
    const permissoes = await prisma.permissao.findMany({ where: { chave: { in: chaves } } });

    await prisma.perfilPermissao.deleteMany({ where: { perfilId: perfil.id } });
    await prisma.perfilPermissao.createMany({
      data: permissoes.map((perm) => ({ perfilId: perfil.id, permissaoId: perm.id })),
    });

    console.log(`✓ perfil ${def.nome} — ${permissoes.length} permissões`);
  }

  // Administrador inicial. O desktop cria `admin`/`admin` e essa credencial não
  // pode chegar à produção web: aqui a senha vem do ambiente e a troca no
  // primeiro login é obrigatória.
  const senhaInicial = process.env.ADMIN_SENHA_INICIAL;
  if (!senhaInicial) {
    console.log('· ADMIN_SENHA_INICIAL não definida — nenhum usuário criado.');
    return;
  }

  const perfilAdmin = await prisma.perfil.findUniqueOrThrow({ where: { nome: PERFIS.ADMINISTRADOR } });
  const existente = await prisma.usuario.findUnique({ where: { loginNorm: 'ADMIN' } });

  if (existente) {
    console.log('· usuário admin já existe — senha preservada.');
    return;
  }

  await prisma.usuario.create({
    data: {
      login: 'admin',
      loginNorm: 'ADMIN',
      nome: 'ADMINISTRADOR',
      senhaHash: await gerarHash(senhaInicial),
      perfilId: perfilAdmin.id,
      nivelLegado: 1,
      trocarSenha: true,
    },
  });
  console.log('✓ usuário admin criado, com troca de senha obrigatória no primeiro login');
}

semear()
  .then(() => prisma.$disconnect())
  .catch(async (erro: unknown) => {
    console.error(erro);
    await prisma.$disconnect();
    process.exit(1);
  });
