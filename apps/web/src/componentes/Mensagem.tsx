/**
 * Faixa de sucesso ou erro, nas cores do guia visual.
 *
 * A mensagem de erro diz o que aconteceu e como resolver — nunca "erro
 * inesperado" nem pedido de desculpas.
 */

import { AlertCircle, CheckCircle } from 'lucide-react';

export type Tipo = 'ok' | 'erro';

export function Mensagem({ tipo, texto }: { tipo: Tipo; texto: string }) {
  const estilo =
    tipo === 'ok'
      ? 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
      : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';

  const Icone = tipo === 'ok' ? CheckCircle : AlertCircle;

  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={`flex items-center gap-3 rounded-lg border p-4 ${estilo}`}>
      <Icone className="size-5 shrink-0" aria-hidden />
      <p className="font-medium">{texto}</p>
    </div>
  );
}
