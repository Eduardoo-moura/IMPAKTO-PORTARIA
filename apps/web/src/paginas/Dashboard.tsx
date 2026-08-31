/**
 * Painel da Portaria.
 *
 * REGRA (briefing §13): só indicadores com origem nos dados que existem.
 * Os cinco abaixo saem direto do modelo:
 *
 *   entradas de hoje      COUNT acesso WHERE entrada_em no dia da portaria
 *   saídas de hoje        COUNT acesso WHERE saida_em no dia da portaria
 *   dentro agora          COUNT acesso WHERE saida_em IS NULL  (índice parcial)
 *   pendências antigas    subconjunto do anterior, de dias anteriores
 *   mercadorias paradas   COUNT mercadoria WHERE entregue_em IS NULL
 *
 * Ficam de fora, por ora: tempo médio de permanência (depende de validar o
 * parse das datas legadas na migração), agendamentos (o módulo não existe) e
 * visitantes (o modelo atual não distingue visitante de motorista).
 *
 * Os dados chegam da API na Fase 3. Aqui está a estrutura do painel.
 */

import { AlertTriangle, Boxes, LogIn, LogOut, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type IndicadoresDaPortaria = {
  entradasHoje: number;
  saidasHoje: number;
  dentroAgora: number;
  pendenciasAntigas: number;
  mercadoriasNaPortaria: number;
};

type Realce = 'neutro' | 'atencao';

const CARTOES: Array<{
  chave: keyof IndicadoresDaPortaria;
  rotulo: string;
  icone: LucideIcon;
  realce?: Realce;
  nota?: string;
}> = [
  { chave: 'dentroAgora', rotulo: 'Dentro agora', icone: Users },
  { chave: 'entradasHoje', rotulo: 'Entradas de hoje', icone: LogIn },
  { chave: 'saidasHoje', rotulo: 'Saídas de hoje', icone: LogOut },
  {
    chave: 'pendenciasAntigas',
    rotulo: 'Sem saída de dias anteriores',
    icone: AlertTriangle,
    realce: 'atencao',
    nota: 'Últimos 3 dias',
  },
  { chave: 'mercadoriasNaPortaria', rotulo: 'Mercadorias na portaria', icone: Boxes },
];

export function Dashboard({ indicadores }: { indicadores: IndicadoresDaPortaria | null }) {
  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-3xl font-bold text-[#001b5c] dark:text-white">Portaria</h1>
      <p className="mt-1 text-gray-600 dark:text-gray-400">Movimento do turno.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARTOES.map((cartao) => {
          const valor = indicadores?.[cartao.chave];
          const atencao = cartao.realce === 'atencao' && (valor ?? 0) > 0;

          return (
            <article
              key={cartao.chave}
              className={[
                'rounded-xl border p-5 shadow-sm',
                atencao
                  ? 'border-[#7c5e00]/30 bg-[#fff2cc] dark:border-yellow-800 dark:bg-yellow-900/20'
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={[
                      'text-sm font-medium',
                      atencao ? 'text-[#7c5e00] dark:text-yellow-300' : 'text-gray-600 dark:text-gray-400',
                    ].join(' ')}
                  >
                    {cartao.rotulo}
                  </p>
                  <p className="mt-1 text-4xl font-bold tabular-nums text-[#001b5c] dark:text-white">
                    {valor ?? <span className="text-2xl text-gray-400">—</span>}
                  </p>
                  {cartao.nota && <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">{cartao.nota}</p>}
                </div>
                <cartao.icone
                  className={atencao ? 'size-6 shrink-0 text-[#7c5e00]' : 'size-6 shrink-0 text-gray-400'}
                  aria-hidden
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
