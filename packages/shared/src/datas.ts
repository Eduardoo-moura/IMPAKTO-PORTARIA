/**
 * Datas no fuso da portaria.
 *
 * R12 — ARMADILHA JÁ PAGA. O desktop compara com `DATE('now','localtime')`,
 * não `DATE('now')`. Com UTC puro, no horário de Brasília a data virava às 21h
 * e a grade do dia ficava vazia pelo resto da noite — justamente durante o
 * turno da madrugada. A portaria opera 24h em três turnos, com virada de dia
 * no meio da operação: **toda** comparação de "hoje" passa por aqui.
 */

export const FUSO_PORTARIA = 'America/Sao_Paulo';

/** Formato de entrada gravado pelo desktop: `yyyy-MM-dd HH:mm:ss`. */
export const FORMATO_ENTRADA_LEGADO = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;

/** Formato de saída gravado pelo desktop: `dd/MM/yyyy HH:mm:ss` — divergente. */
export const FORMATO_SAIDA_LEGADO = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;

const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_PORTARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Data civil no fuso da portaria, como `yyyy-MM-dd`. */
export function diaDaPortaria(momento: Date = new Date()): string {
  const p = Object.fromEntries(PARTES.formatToParts(momento).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Início do dia civil da portaria, em UTC — limite inferior de consulta. */
export function inicioDoDia(dia: string = diaDaPortaria()): Date {
  return instanteLocal(`${dia} 00:00:00`);
}

/** Início do dia seguinte — limite superior **exclusivo** (R36). */
export function fimExclusivoDoDia(dia: string = diaDaPortaria()): Date {
  const base = inicioDoDia(dia);
  const seguinte = new Date(base.getTime() + 26 * 60 * 60 * 1000);
  return inicioDoDia(diaDaPortaria(seguinte));
}

/** `dia` deslocado em N dias, ainda no calendário da portaria. */
export function diaMais(dias: number, dia: string = diaDaPortaria()): string {
  const base = inicioDoDia(dia);
  return diaDaPortaria(new Date(base.getTime() + dias * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000));
}

/**
 * Converte `yyyy-MM-dd HH:mm:ss` **interpretado no fuso da portaria** para o
 * instante absoluto. Resolve o offset consultando o próprio fuso, então não
 * quebra em mudança de horário de verão.
 */
export function instanteLocal(textoLocal: string): Date {
  const m = FORMATO_ENTRADA_LEGADO.exec(textoLocal.trim());
  if (!m) throw new Error(`Data local em formato inesperado: "${textoLocal}"`);

  const [, ano, mes, dia, hora, min, seg] = m as unknown as string[];
  const comoUtc = Date.UTC(+ano!, +mes! - 1, +dia!, +hora!, +min!, +seg!);

  // Duas passadas: a primeira estima o offset, a segunda confirma na borda do DST.
  let instante = new Date(comoUtc);
  for (let i = 0; i < 2; i++) {
    const deslocamento = comoUtc - lidoComoUtc(instante);
    instante = new Date(instante.getTime() + deslocamento);
  }
  return instante;
}

function lidoComoUtc(momento: Date): number {
  const p = Object.fromEntries(PARTES.formatToParts(momento).map((x) => [x.type, x.value]));
  const hora = p.hour === '24' ? '00' : p.hour!;
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +hora, +p.minute!, +p.second!);
}

/**
 * Parse do `DataHora` legado (`yyyy-MM-dd HH:mm:ss`).
 * Vazio → `null`: são 11.257 linhas da importação antiga, e `null` é a única
 * forma honesta de representá-las (R13).
 */
export function parseEntradaLegada(texto: string | null | undefined): Date | null {
  const bruto = (texto ?? '').trim();
  if (!bruto) return null;
  if (!FORMATO_ENTRADA_LEGADO.test(bruto)) return null;
  return instanteLocal(bruto);
}

/**
 * Parse do `SAIDA` legado (`dd/MM/yyyy HH:mm:ss`) — **formato diferente do da
 * entrada**. Ler isto como `MM/dd` corromperia 12.104 datas silenciosamente.
 */
export function parseSaidaLegada(texto: string | null | undefined): Date | null {
  const bruto = (texto ?? '').trim();
  if (!bruto) return null;

  const m = FORMATO_SAIDA_LEGADO.exec(bruto);
  if (!m) return null;

  const [, dia, mes, ano, hora, min, seg] = m as unknown as string[];
  return instanteLocal(`${ano}-${mes}-${dia} ${hora}:${min}:${seg}`);
}

/** Exibição `dd/MM/yyyy HH:mm`, como nas grades do desktop. */
export function exibirDataHora(momento: Date | null | undefined): string {
  if (!momento) return '';
  const p = Object.fromEntries(PARTES.formatToParts(momento).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/**
 * Se a entrada é de um dia anterior ao de hoje — a coluna `PENDENCIAANTIGA`
 * do desktop, que pinta a linha de âmbar (R14).
 */
export function ehPendenciaAntiga(entrada: Date | null | undefined, hoje = diaDaPortaria()): boolean {
  if (!entrada) return false;
  return diaDaPortaria(entrada) < hoje;
}
