/**
 * R26 — Painel "MERCADORIAS NA PORTARIA (N)" da tela principal.
 *
 * Existe pelo mesmo motivo que no desktop: é lembrete à vista do porteiro,
 * não consulta. Mostra só chegada, destinatário e empresa — o detalhe e as
 * ações ficam na tela de mercadorias.
 */

import { Boxes } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { Mercadoria } from './Mercadorias.js';

export function PainelDeMercadorias({ pendentes }: { pendentes: Mercadoria[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold">
          <Boxes className="size-5" aria-hidden />
          Mercadorias na portaria ({pendentes.length})
        </h2>
        <Link
          to="/portaria/mercadorias"
          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          abrir
        </Link>
      </div>

      {pendentes.length === 0 ? (
        <p className="text-sm text-gray-500">Nada aguardando retirada.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {pendentes.slice(0, 8).map((m) => (
            <li key={m.id} className="flex justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-semibold">{m.destinatario}</span>
                {m.empresa && <span className="ml-1.5 text-gray-500">· {m.empresa}</span>}
              </span>
              <span className="tabular-nums whitespace-nowrap text-gray-600 dark:text-gray-400">
                {new Date(m.chegadaEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
            </li>
          ))}
          {pendentes.length > 8 && (
            <li className="pt-2 text-sm text-gray-500">e mais {pendentes.length - 8}…</li>
          )}
        </ul>
      )}
    </div>
  );
}
