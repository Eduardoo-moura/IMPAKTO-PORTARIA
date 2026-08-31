import { describe, expect, it } from 'vitest';
import {
  diaDaPortaria,
  diaMais,
  ehPendenciaAntiga,
  exibirDataHora,
  fimExclusivoDoDia,
  inicioDoDia,
  instanteLocal,
  parseEntradaLegada,
  parseSaidaLegada,
} from './datas.js';

describe('R12 — "hoje" é o dia da portaria, nunca UTC', () => {
  it('às 22h de Brasília ainda é o mesmo dia, embora em UTC já seja o seguinte', () => {
    // 2026-08-28 22:30 em São Paulo (UTC-3) = 2026-08-29 01:30 UTC.
    const momento = new Date('2026-08-29T01:30:00Z');
    expect(momento.toISOString().slice(0, 10)).toBe('2026-08-29');
    expect(diaDaPortaria(momento)).toBe('2026-08-28');
  });

  it('à meia-noite e um minuto já é o dia novo', () => {
    const momento = new Date('2026-08-29T03:01:00Z');
    expect(diaDaPortaria(momento)).toBe('2026-08-29');
  });
});

describe('conversão de horário local para instante absoluto', () => {
  it('interpreta o texto no fuso da portaria', () => {
    expect(instanteLocal('2026-08-28 14:08:05').toISOString()).toBe('2026-08-28T17:08:05.000Z');
  });

  it('o início do dia é 03:00 UTC no horário padrão de Brasília', () => {
    expect(inicioDoDia('2026-08-28').toISOString()).toBe('2026-08-28T03:00:00.000Z');
  });

  it('o limite superior é exclusivo — o início do dia seguinte (R36)', () => {
    expect(fimExclusivoDoDia('2026-08-28').toISOString()).toBe('2026-08-29T03:00:00.000Z');
  });

  it('anda no calendário sem escorregar de dia', () => {
    expect(diaMais(-2, '2026-08-28')).toBe('2026-08-26');
    expect(diaMais(1, '2026-08-31')).toBe('2026-09-01');
    expect(diaMais(-1, '2026-03-01')).toBe('2026-02-28');
  });
});

describe('parse dos formatos legados — divergentes entre si', () => {
  it('entrada vem em yyyy-MM-dd HH:mm:ss', () => {
    expect(parseEntradaLegada('2026-08-28 14:08:05')?.toISOString()).toBe(
      '2026-08-28T17:08:05.000Z',
    );
  });

  it('saída vem em dd/MM/yyyy HH:mm:ss — ler como MM/dd corromperia 12.104 datas', () => {
    const saida = parseSaidaLegada('28/08/2026 16:30:00');
    expect(saida?.toISOString()).toBe('2026-08-28T19:30:00.000Z');
    expect(diaDaPortaria(saida!)).toBe('2026-08-28');
  });

  it('distingue dia de mês onde o formato americano acertaria por acidente', () => {
    // 03/04 é 3 de abril, não 4 de março.
    expect(diaDaPortaria(parseSaidaLegada('03/04/2026 10:00:00')!)).toBe('2026-04-03');
  });

  it('R13 — vazio vira null: são as 11.257 linhas da importação legada', () => {
    expect(parseEntradaLegada('')).toBeNull();
    expect(parseEntradaLegada('   ')).toBeNull();
    expect(parseEntradaLegada(null)).toBeNull();
    expect(parseSaidaLegada('')).toBeNull();
  });

  it('devolve null em formato inesperado, em vez de inventar uma data', () => {
    expect(parseEntradaLegada('28/08/2026 14:08:05')).toBeNull();
    expect(parseSaidaLegada('2026-08-28 14:08:05')).toBeNull();
  });
});

describe('R14 — pendência de dia anterior', () => {
  it('marca a entrada de ontem', () => {
    const ontem = instanteLocal('2026-08-27 23:00:00');
    expect(ehPendenciaAntiga(ontem, '2026-08-28')).toBe(true);
  });

  it('não marca a entrada de hoje, mesmo de madrugada', () => {
    const hojeCedo = instanteLocal('2026-08-28 00:10:00');
    expect(ehPendenciaAntiga(hojeCedo, '2026-08-28')).toBe(false);
  });

  it('registro sem data não é pendência antiga', () => {
    expect(ehPendenciaAntiga(null, '2026-08-28')).toBe(false);
  });
});

describe('exibição', () => {
  it('formata como as grades do desktop', () => {
    expect(exibirDataHora(instanteLocal('2026-08-28 14:08:05'))).toBe('28/08/2026 14:08');
    expect(exibirDataHora(null)).toBe('');
  });
});
