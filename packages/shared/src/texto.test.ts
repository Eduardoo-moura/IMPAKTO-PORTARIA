import { describe, expect, it } from 'vitest';
import { apenasDigitos, chaveTipoVeiculo, maiusculas, normalizarNome, semAcento, semControles } from './texto.js';

describe('R19 — tudo em maiúsculas, normalizado no servidor', () => {
  it('sobe para maiúsculas e colapsa espaços', () => {
    expect(maiusculas('  joão   da silva ')).toBe('JOÃO DA SILVA');
  });

  it('trata nulo como vazio', () => {
    expect(maiusculas(null)).toBe('');
  });
});

describe('normalização de nome de empresa', () => {
  it('remove acento e mantém o resto', () => {
    expect(semAcento('TRANSPORTES SÃO JOÃO')).toBe('TRANSPORTES SAO JOAO');
    expect(normalizarNome(' transportes são joão ')).toBe('TRANSPORTES SAO JOAO');
  });

  it('colapsa apenas grafia, nunca empresas diferentes', () => {
    expect(normalizarNome('LOGÍSTICA ABC')).toBe(normalizarNome('logistica abc'));
    expect(normalizarNome('LOGISTICA ABC')).not.toBe(normalizarNome('LOGISTICA ABCD'));
  });
});

describe('tipo de veículo', () => {
  it('o TRIM resolve FIORINO com espaço à direita', () => {
    expect(chaveTipoVeiculo('FIORINO ')).toBe(chaveTipoVeiculo('FIORINO'));
  });

  it('NÃO consolida ¾ e 3/4 sozinho — isso é tabela de alias com revisão humana', () => {
    expect(chaveTipoVeiculo('¾')).not.toBe(chaveTipoVeiculo('3/4'));
  });
});

describe('celular', () => {
  it('reduz a dígitos', () => {
    expect(apenasDigitos('(11) 98888-7777')).toBe('11988887777');
  });
});

describe('caracteres de controle', () => {
  it('remove o byte NUL, que o PostgreSQL recusa em texto', () => {
    expect(maiusculas('a\u0000b')).toBe('AB');
    expect(semControles('joão\u0000')).toBe('joão');
  });

  it('remove outros controles sem comer o texto ao redor', () => {
    expect(maiusculas('AB\u0007CD')).toBe('ABCD');
    expect(maiusculas('linha\u000bum')).toBe('LINHAUM');
  });

  it('não mexe em acento nem em espaço normal', () => {
    expect(maiusculas(' josé  da  silva ')).toBe('JOSÉ DA SILVA');
  });
});
