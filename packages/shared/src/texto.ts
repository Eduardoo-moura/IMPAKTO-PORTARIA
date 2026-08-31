/**
 * Normalização de texto.
 *
 * R19 — tudo em maiúsculas. No desktop, `AplicarMaiusculas` percorre todos os
 * `TextBox` recursivamente. Na web o input usa `text-transform: uppercase`,
 * mas **a fonte da verdade é o servidor**: o dado é normalizado aqui antes de
 * ser gravado, porque CSS não altera o valor enviado.
 */

/** Colapsa espaços internos, tira as pontas e sobe para maiúsculas. */
export function maiusculas(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/** Remove diacríticos preservando o resto do texto. */
export function semAcento(texto: string | null | undefined): string {
  return (texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Chave de comparação de nome de empresa (`empresa.nome_norm`): maiúsculas,
 * sem acento, sem espaço duplicado.
 *
 * ATENÇÃO: isto **não** é deduplicação por similaridade. As 3.514 empresas em
 * texto livre são migradas 1:1 — fundir por semelhança é risco de misturar
 * empresas diferentes, e é tarefa posterior com UI e decisão humana.
 */
export function normalizarNome(texto: string | null | undefined): string {
  return semAcento(maiusculas(texto));
}

/**
 * Chave de tipo de veículo. O `TRIM` resolve `'FIORINO '` (221 registros) vs
 * `'FIORINO'` (6.082); a consolidação de `¾` / `3/4` / `3/4.` é feita por
 * tabela de aliases com revisão humana, não por heurística.
 */
export function chaveTipoVeiculo(texto: string | null | undefined): string {
  return normalizarNome(texto);
}

/** Só dígitos — usado em celular. */
export function apenasDigitos(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\D/g, '');
}
