/**
 * Botões do sistema.
 *
 * Duas variantes, e a escolha entre elas é operacional, não estética:
 *
 * - `destaque` traz o efeito "wipe" amarelo do site (500 ms). Serve para
 *   ações fora do fluxo de balcão — entrar no sistema, emitir relatório.
 * - `solido` é o amarelo cheio, sem transição longa. É o que SALVAR e SAÍDA
 *   usam: meio segundo de animação atrapalha operação repetitiva com o
 *   caminhão parado no portão.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'destaque' | 'solido' | 'neutro' | 'perigo';
  carregando?: boolean;
  children: ReactNode;
};

export function Botao({
  variante = 'solido',
  carregando = false,
  disabled,
  children,
  className = '',
  ...resto
}: Props) {
  const bloqueado = disabled || carregando;

  if (variante === 'destaque') {
    return (
      <button
        {...resto}
        disabled={bloqueado}
        className={[
          'group relative inline-block w-full overflow-hidden rounded-md border border-gray-400 px-6 py-4',
          'text-lg font-bold sm:text-xl dark:border-gray-600',
          'before:absolute before:inset-0 before:origin-left before:scale-x-0 before:bg-[#ecd31b]',
          'before:transition-transform before:duration-500 hover:before:scale-x-100',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        ].join(' ')}
      >
        <span className="relative z-10 text-gray-800 transition-colors duration-500 group-hover:text-black dark:text-white">
          {carregando ? 'Aguarde…' : children}
        </span>
      </button>
    );
  }

  const estilos: Record<string, string> = {
    solido: 'bg-[#ecd31b] text-black hover:brightness-105',
    neutro:
      'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
    perigo: 'bg-red-600 text-white hover:bg-red-700',
  };

  return (
    <button
      {...resto}
      disabled={bloqueado}
      className={[
        'rounded-lg px-5 py-3 text-lg font-bold transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        estilos[variante],
        className,
      ].join(' ')}
    >
      {carregando ? 'Aguarde…' : children}
    </button>
  );
}
