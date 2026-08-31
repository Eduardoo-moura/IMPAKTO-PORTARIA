import { describe, expect, it } from 'vitest';
import {
  avaliarDocumento,
  classificarDocumento,
  cpfValido,
  ehCpf,
  normalizarDocumento,
  pareceCpf,
  semPontuacao,
  SituacaoDocumento,
} from './documento.js';

describe('R05 — conferência de CPF (módulo 11)', () => {
  it('aceita CPF com dígitos verificadores corretos', () => {
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('11144477735')).toBe(true);
  });

  it('recusa CPF com dígito verificador errado', () => {
    expect(cpfValido('52998224724')).toBe(false);
  });

  it('recusa sequências repetidas, que fecham na conta mas não existem', () => {
    expect(cpfValido('00000000000')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
  });

  it('só considera CPF o que tem 11 dígitos e mais nada', () => {
    expect(ehCpf('5299822472')).toBe(false);
    expect(ehCpf('5299822472X')).toBe(false);
    expect(ehCpf('52998224725')).toBe(true);
  });
});

describe('semPontuacao — fidelidade ao C#', () => {
  it('remove ponto, hífen e espaço', () => {
    expect(semPontuacao('529.982.247-25')).toBe('52998224725');
    expect(semPontuacao('529 982 247 25')).toBe('52998224725');
  });

  it('NÃO remove barra — RG com barra não vira candidato a CPF', () => {
    expect(semPontuacao('12/345678/9')).toBe('12/345678/9');
    expect(pareceCpf('12/345678/9')).toBe(false);
  });

  it('faz o CPF pontuado entrar na conferência', () => {
    expect(pareceCpf('529.982.247-25')).toBe(true);
  });
});

describe('R04 — a conferência avisa, nunca impede', () => {
  it('classifica os quatro estados sem lançar erro', () => {
    expect(avaliarDocumento('')).toBe(SituacaoDocumento.Vazio);
    expect(avaliarDocumento('   ')).toBe(SituacaoDocumento.Vazio);
    expect(avaliarDocumento('123456789')).toBe(SituacaoDocumento.SemConferencia);
    expect(avaliarDocumento('52998224725')).toBe(SituacaoDocumento.CpfValido);
    expect(avaliarDocumento('52998224724')).toBe(SituacaoDocumento.CpfInvalido);
  });

  it('RG de 11 dígitos com DV inválido é avisado, não rejeitado', () => {
    // 94 documentos da base real caem exatamente neste caso.
    const situacao = avaliarDocumento('12345678901');
    expect(situacao).toBe(SituacaoDocumento.CpfInvalido);
    expect(situacao).not.toBe(SituacaoDocumento.Vazio);
  });

  it('documento com letras passa sem conferência', () => {
    expect(avaliarDocumento('MG1234567')).toBe(SituacaoDocumento.SemConferencia);
  });
});

describe('R09 — normalização do documento (correção ao desktop)', () => {
  it('colapsa a pontuação na mesma chave de busca', () => {
    expect(normalizarDocumento('529.982.247-25')).toBe('52998224725');
    expect(normalizarDocumento('12/345678/9')).toBe('123456789');
  });

  it('preserva letras de RG, em maiúsculas', () => {
    expect(normalizarDocumento('mg-12.345')).toBe('MG12345');
  });
});

describe('classificação para o cadastro de pessoa', () => {
  it('CPF válido é CPF', () => {
    expect(classificarDocumento('529.982.247-25')).toBe('CPF');
  });

  it('até 10 dígitos é RG', () => {
    expect(classificarDocumento('1234567')).toBe('RG');
  });

  it('11 dígitos com DV inválido é OUTRO — migra e vai para pendências', () => {
    expect(classificarDocumento('12345678901')).toBe('OUTRO');
  });

  it('RG com prefixo de estado continua sendo RG', () => {
    // A regra e sobre a quantidade de digitos, nao sobre a presenca de letras:
    // 'MG1234567' tem 7 digitos, entao e RG. So o que tem 11 digitos entra na
    // conferencia de CPF.
    expect(classificarDocumento('MG1234567')).toBe('RG');
  });

  it('sem digito nenhum e OUTRO', () => {
    expect(classificarDocumento('PASSAPORTE')).toBe('OUTRO');
  });
});
