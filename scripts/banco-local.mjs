#!/usr/bin/env node
/**
 * Controle do PostgreSQL local de homologação.
 *
 *   node scripts/banco-local.mjs start|stop|status|log
 *
 * O banco roda a partir de binários portáteis em `%USERPROFILE%\.impakto` —
 * sem Docker, sem instalação, sem serviço do Windows. Para desfazer tudo,
 * basta parar e apagar essa pasta.
 *
 * Fica na porta 5433 de propósito: um PostgreSQL instalado depois, na 5432
 * padrão, não conflita com este.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = join(homedir(), '.impakto');
const BIN = join(BASE, 'pgsql', 'bin');
const DADOS = join(BASE, 'dados');
const LOG = join(BASE, 'postgres.log');
const PORTA = 5433;

const pgCtl = (...args) =>
  spawnSync(join(BIN, 'pg_ctl.exe'), ['-D', DADOS, ...args], { encoding: 'utf8', windowsHide: true });

function exigirInstalacao() {
  if (existsSync(join(BIN, 'pg_ctl.exe')) && existsSync(DADOS)) return;

  console.error(
    [
      `PostgreSQL local não encontrado em ${BASE}.`,
      '',
      'Para criar:',
      '  1. baixe https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64-binaries.zip',
      `  2. extraia em ${BASE} (deve ficar ${join(BASE, 'pgsql')})`,
      `  3. ${join(BIN, 'initdb.exe')} -D "${DADOS}" -U impakto --pwprompt -E UTF8`,
      `  4. acrescente ao fim de ${join(DADOS, 'postgresql.conf')}:`,
      `       port = ${PORTA}`,
      "       listen_addresses = 'localhost'",
      "       timezone = 'America/Sao_Paulo'",
      '  5. node scripts/banco-local.mjs start',
      '',
      'Ou use o docker-compose.yml, se houver Docker na máquina.',
    ].join('\n'),
  );
  process.exit(1);
}

const comando = process.argv[2] ?? 'status';

switch (comando) {
  case 'start': {
    exigirInstalacao();
    if (pgCtl('status').status === 0) {
      console.log(`Banco já estava no ar em localhost:${PORTA}.`);
      break;
    }
    // `-w` espera ficar pronto; sem isso a migration seguinte encontra o
    // banco ainda subindo e falha por conexão recusada.
    const r = pgCtl('-l', LOG, '-w', 'start');
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      console.error(`\nÚltimas linhas de ${LOG}:`);
      if (existsSync(LOG)) console.error(readFileSync(LOG, 'utf8').split('\n').slice(-10).join('\n'));
      process.exit(1);
    }
    console.log(`Banco no ar em localhost:${PORTA}.`);
    break;
  }

  case 'stop': {
    exigirInstalacao();
    const r = pgCtl('-m', 'fast', 'stop');
    console.log(r.status === 0 ? 'Banco parado.' : (r.stderr || r.stdout).trim());
    break;
  }

  case 'status': {
    exigirInstalacao();
    const r = pgCtl('status');
    console.log(r.status === 0 ? `No ar em localhost:${PORTA}.` : 'Parado.');
    process.exit(r.status === 0 ? 0 : 1);
  }

  case 'log': {
    if (!existsSync(LOG)) {
      console.log('Sem log ainda — o banco nunca subiu nesta instalação.');
      break;
    }
    console.log(readFileSync(LOG, 'utf8').split('\n').slice(-40).join('\n'));
    break;
  }

  default:
    console.error(`Comando desconhecido: ${comando}. Use start, stop, status ou log.`);
    process.exit(1);
}
