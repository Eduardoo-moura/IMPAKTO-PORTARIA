/**
 * Placa de veículo nos dois formatos em uso no Brasil:
 * antiga (LLL9999) e Mercosul (LLL9L99).
 *
 * Porte literal de `Portaria/Mascaras.cs` → `public static class Placa`.
 * O sistema trabalha com os 7 caracteres sem separador, que é como está a
 * maior parte dos registros do banco (regras R01, R02, R03).
 *
 * Não alterar o comportamento sem alterar também o teste correspondente:
 * este arquivo é a definição de "placa" para o backend e para o frontend.
 */

export const TAMANHO_PLACA = 7;

const ehLetra = (c: string): boolean => c >= 'A' && c <= 'Z';
const ehDigito = (c: string): boolean => c >= '0' && c <= '9';

/** Se o caractere serve na posição informada (0 a 6). */
export function caractereValido(posicao: number, c: string): boolean {
  switch (posicao) {
    case 0:
    case 1:
    case 2:
      return ehLetra(c);
    case 3:
      return ehDigito(c);
    case 4:
      // Letra = Mercosul (ABC1D23); número = placa antiga (ABC1234).
      return ehLetra(c) || ehDigito(c);
    case 5:
    case 6:
      return ehDigito(c);
    default:
      return false;
  }
}

/** Se o texto é uma placa completa ou o início de uma placa possível. */
export function prefixoValido(texto: string | null | undefined): boolean {
  if (!texto) return true;
  if (texto.length > TAMANHO_PLACA) return false;

  for (let i = 0; i < texto.length; i++) {
    if (!caractereValido(i, texto[i]!.toUpperCase())) return false;
  }
  return true;
}

/** Placa com os 7 caracteres, todos válidos na sua posição. */
export function placaCompleta(texto: string | null | undefined): boolean {
  return !!texto && texto.length === TAMANHO_PLACA && prefixoValido(texto);
}

/**
 * Aplica a máscara descartando o que não encaixa.
 * Usado no texto colado no campo e na gravação (R02).
 */
export function aplicarPlaca(texto: string | null | undefined): string {
  if (!texto) return '';

  let placa = '';
  for (const bruto of texto) {
    if (placa.length === TAMANHO_PLACA) break;
    const c = bruto.toUpperCase();
    if (caractereValido(placa.length, c)) placa += c;
  }
  return placa;
}

/**
 * Placa reduzida a letras e números, em maiúsculas. É o que permite achar os
 * 10.172 registros gravados com espaço (`GCT 6604`) a partir de `GCT6604`.
 *
 * Persistir o resultado em `veiculo.placa_norm` **com índice** — normalizar em
 * runtime impede o uso do índice e faz varredura completa a cada busca (R03).
 */
export function normalizarPlaca(texto: string | null | undefined): string {
  if (!texto) return '';

  let limpa = '';
  for (const bruto of texto) {
    const c = bruto.toUpperCase();
    if (ehLetra(c) || ehDigito(c)) limpa += c;
  }
  return limpa;
}

/**
 * Como a placa deve ser gravada: se o texto formar uma placa completa, grava
 * normalizada; senão grava como o porteiro digitou.
 *
 * A portaria precisa registrar veículo sem placa — `S/ PLACA` é dado válido
 * e não pode ser descartado pela máscara (R02).
 */
export function placaParaGravar(texto: string | null | undefined): string {
  const bruto = (texto ?? '').trim();
  if (!bruto) return '';

  const mascarada = aplicarPlaca(bruto);
  return placaCompleta(mascarada) ? mascarada : bruto.toUpperCase();
}
