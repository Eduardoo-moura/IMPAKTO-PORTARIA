import { describe, expect, it } from 'vitest';
import {
  aplicarPlaca,
  caractereValido,
  normalizarPlaca,
  placaCompleta,
  placaParaGravar,
  prefixoValido,
} from './placa.js';

describe('R01 — formatos de placa', () => {
  it('aceita o formato antigo LLL9999', () => {
    expect(placaCompleta('ABC1234')).toBe(true);
  });

  it('aceita o formato Mercosul LLL9L99', () => {
    expect(placaCompleta('ABC1D23')).toBe(true);
  });

  it('valida por posição: a 5ª aceita letra ou dígito, as demais não', () => {
    expect(caractereValido(0, 'A')).toBe(true);
    expect(caractereValido(0, '1')).toBe(false);
    expect(caractereValido(3, '1')).toBe(true);
    expect(caractereValido(3, 'A')).toBe(false);
    expect(caractereValido(4, 'D')).toBe(true);
    expect(caractereValido(4, '2')).toBe(true);
    expect(caractereValido(6, 'A')).toBe(false);
  });

  it('recusa placa com separador ou tamanho errado', () => {
    expect(placaCompleta('ABC-123')).toBe(false);
    expect(placaCompleta('ABC123')).toBe(false);
    expect(placaCompleta('ABC12345')).toBe(false);
  });

  it('trata prefixo incompleto como ainda válido, para a digitação não travar', () => {
    expect(prefixoValido('AB')).toBe(true);
    expect(prefixoValido('ABC1')).toBe(true);
    expect(prefixoValido('1AB')).toBe(false);
    expect(prefixoValido('')).toBe(true);
  });
});

describe('aplicarPlaca — descarta o que não encaixa', () => {
  it('limpa o texto colado', () => {
    expect(aplicarPlaca('abc-1234')).toBe('ABC1234');
    expect(aplicarPlaca('ABC 1D23')).toBe('ABC1D23');
  });

  it('para nos 7 caracteres', () => {
    expect(aplicarPlaca('ABC123456789')).toBe('ABC1234');
  });

  it('mutila o texto livre — e por isso a gravacao nao usa a mascara', () => {
    // A mascara descarta o que nao encaixa posicao a posicao: de 'S/ PLACA'
    // sobram S, P e L. E a razao de `placaParaGravar` so aplicar a mascara
    // quando o resultado forma uma placa completa (R02).
    expect(aplicarPlaca('S/ PLACA')).toBe('SPL');
    expect(aplicarPlaca('')).toBe('');
  });
});

describe('R03 — normalização é o que encontra os registros antigos', () => {
  it('colapsa as grafias com separador na mesma chave', () => {
    expect(normalizarPlaca('GCT 6604')).toBe('GCT6604');
    expect(normalizarPlaca('gct-6604')).toBe('GCT6604');
    expect(normalizarPlaca('GCT.6604')).toBe('GCT6604');
    expect(normalizarPlaca('GCT/6604')).toBe('GCT6604');
  });

  it('é idempotente', () => {
    expect(normalizarPlaca(normalizarPlaca('GCT 6604'))).toBe('GCT6604');
  });
});

describe('R02 — placa não é obrigatória e texto livre é preservado', () => {
  it('grava normalizada quando a placa está completa', () => {
    expect(placaParaGravar('abc 1d23')).toBe('ABC1D23');
  });

  it('preserva o texto livre do porteiro quando não forma placa', () => {
    expect(placaParaGravar('S/ PLACA')).toBe('S/ PLACA');
    expect(placaParaGravar('sem placa')).toBe('SEM PLACA');
  });

  it('aceita ausência de placa', () => {
    expect(placaParaGravar('')).toBe('');
    expect(placaParaGravar(null)).toBe('');
  });
});
