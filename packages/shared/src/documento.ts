/**
 * Documento do motorista/ajudante. O campo aceita **RG ou CPF**; só o CPF tem
 * dígito verificador para conferir.
 *
 * Porte literal de `Portaria/Mascaras.cs` → `public static class Documento`.
 *
 * REGRA CENTRAL (R04): a conferência **avisa, nunca impede**. Há 94 documentos
 * legados com 11 dígitos e DV inválido (72 de motorista, 22 de ajudante). Se a
 * validação bloquear, essas pessoas ficam impossíveis de registrar e os
 * registros existentes ficam ineditáveis. Validar só na **escrita** de dados
 * novos, e mesmo aí avisando (R05).
 */

export const TAMANHO_CPF = 11;

/** O que o campo contém, do ponto de vista da conferência. */
export enum SituacaoDocumento {
  /** Nada digitado. */
  Vazio = 'VAZIO',
  /** Não tem cara de CPF: RG, documento estrangeiro, etc. */
  SemConferencia = 'SEM_CONFERENCIA',
  /** CPF com os dois dígitos verificadores corretos. */
  CpfValido = 'CPF_VALIDO',
  /** Tem cara de CPF, mas o dígito verificador não fecha. */
  CpfInvalido = 'CPF_INVALIDO',
}

export function soDigitos(texto: string | null | undefined): boolean {
  if (!texto) return false;
  for (const c of texto) {
    if (c < '0' || c > '9') return false;
  }
  return true;
}

/**
 * Descarta a pontuação usual de CPF. Serve para conferir `123.456.789-09`
 * como CPF; sem isto ele escaparia da conferência inteira.
 *
 * Atenção à fidelidade: o C# remove apenas `.`, `-` e espaço — **não** remove
 * `/`, porque um RG com barra não deve virar candidato a CPF.
 */
export function semPontuacao(texto: string | null | undefined): string {
  if (!texto) return '';
  let limpo = '';
  for (const c of texto) {
    if (c === '.' || c === '-' || c === ' ') continue;
    limpo += c;
  }
  return limpo;
}

/** Trata como CPF o documento com 11 dígitos e mais nada. */
export function ehCpf(texto: string | null | undefined): boolean {
  return !!texto && texto.length === TAMANHO_CPF && soDigitos(texto);
}

/** Se o texto tem cara de CPF depois de tirada a pontuação. */
export function pareceCpf(texto: string | null | undefined): boolean {
  return ehCpf(semPontuacao(texto));
}

/** Confere os dois dígitos verificadores do CPF (módulo 11). */
export function cpfValido(cpf: string | null | undefined): boolean {
  if (!ehCpf(cpf)) return false;
  const valor = cpf as string;

  // 00000000000, 11111111111... fecham na conta, mas não existem.
  let todosIguais = true;
  for (let i = 1; i < TAMANHO_CPF; i++) {
    if (valor[i] !== valor[0]) {
      todosIguais = false;
      break;
    }
  }
  if (todosIguais) return false;

  const digitos = Array.from(valor, (c) => c.charCodeAt(0) - 48);
  return (
    digitos[9] === digitoVerificador(digitos, 9) &&
    digitos[10] === digitoVerificador(digitos, 10)
  );
}

/**
 * Dígito calculado sobre as primeiras `quantidade` posições, com pesos
 * decrescentes a partir de `quantidade + 1`.
 */
function digitoVerificador(digitos: number[], quantidade: number): number {
  let soma = 0;
  for (let i = 0; i < quantidade; i++) soma += digitos[i]! * (quantidade + 1 - i);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Avalia o documento **sem impedir nada**: quem chama decide o que fazer com o
 * resultado. Um RG de 11 dígitos e um CPF antigo com dígito errado precisam
 * poder ser gravados, só não podem passar despercebidos.
 */
export function avaliarDocumento(texto: string | null | undefined): SituacaoDocumento {
  const limpo = semPontuacao((texto ?? '').trim());
  if (limpo.length === 0) return SituacaoDocumento.Vazio;
  if (!ehCpf(limpo)) return SituacaoDocumento.SemConferencia;
  return cpfValido(limpo) ? SituacaoDocumento.CpfValido : SituacaoDocumento.CpfInvalido;
}

/** Texto do aviso na tela. Mesmo teor da mensagem do desktop. */
export function descricaoSituacao(situacao: SituacaoDocumento): string {
  switch (situacao) {
    case SituacaoDocumento.CpfInvalido:
      return 'Tem 11 dígitos, mas o dígito verificador não confere. Confira o número — se for RG, pode gravar assim mesmo.';
    case SituacaoDocumento.CpfValido:
      return 'CPF conferido.';
    default:
      return '';
  }
}

/**
 * Documento reduzido a letras e dígitos maiúsculos, para busca e para a chave
 * única de `pessoa.documento_norm`.
 *
 * CORREÇÃO CONSCIENTE ao desktop (R09): o C# busca por igualdade exata em
 * maiúsculas e por isso não encontra os documentos gravados com pontuação. Na
 * web a busca por documento normaliza, como a de placa já faz.
 */
export function normalizarDocumento(texto: string | null | undefined): string {
  if (!texto) return '';
  let limpo = '';
  for (const bruto of texto) {
    const c = bruto.toUpperCase();
    if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) limpo += c;
  }
  return limpo;
}

export type TipoDocumento = 'CPF' | 'RG' | 'OUTRO';

/**
 * Classificação usada no cadastro de pessoa e na migração:
 * CPF se 11 dígitos com DV válido; RG se até 10 dígitos; OUTRO no resto.
 *
 * Os 94 documentos legados com DV inválido caem em OUTRO — são migrados e
 * listados no relatório de pendências, nunca rejeitados.
 */
export function classificarDocumento(texto: string | null | undefined): TipoDocumento {
  const limpo = semPontuacao((texto ?? '').trim());
  if (ehCpf(limpo)) return cpfValido(limpo) ? 'CPF' : 'OUTRO';

  const apenasDigitos = normalizarDocumento(texto).replace(/[^0-9]/g, '');
  if (apenasDigitos.length > 0 && apenasDigitos.length <= 10) return 'RG';
  return 'OUTRO';
}
