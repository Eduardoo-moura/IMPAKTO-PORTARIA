/**
 * Campo de formulário com ícone à esquerda, no padrão do guia visual.
 *
 * Duas coisas que vêm do desktop e não podem se perder:
 * - o texto é exibido em maiúsculas (R19);
 * - `aviso` pinta o fundo de rosa sem bloquear a digitação (R04) — é o
 *   documento que não fecha na conferência de CPF.
 */

import type { InputHTMLAttributes, Ref } from 'react';
import type { LucideIcon } from 'lucide-react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  rotulo: string;
  icone: LucideIcon;
  /** Mensagem de conferência. Avisa, nunca impede. */
  aviso?: string;
  /** Mensagem de validação que de fato bloqueou a gravação. */
  erro?: string;
  ref?: Ref<HTMLInputElement>;
};

export function Campo({ rotulo, icone: Icone, aviso, erro, id, className = '', ...resto }: Props) {
  const idCampo = id ?? resto.name;
  const idAuxiliar = idCampo ? `${idCampo}-aux` : undefined;

  return (
    <div>
      <label htmlFor={idCampo} className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {rotulo}
      </label>
      <div className="relative">
        <Icone className="absolute top-3.5 left-3 size-5 text-gray-400" aria-hidden />
        <input
          {...resto}
          id={idCampo}
          data-conferencia={aviso ? 'invalido' : undefined}
          aria-invalid={erro ? true : undefined}
          aria-describedby={aviso || erro ? idAuxiliar : undefined}
          className={`campo-portaria ${erro ? 'border-red-500' : ''} ${className}`}
        />
      </div>
      {(aviso || erro) && (
        <p
          id={idAuxiliar}
          className={`mt-1.5 text-sm ${erro ? 'text-red-600 dark:text-red-400' : 'text-[#7c5e00] dark:text-yellow-300'}`}
        >
          {erro ?? aviso}
        </p>
      )}
    </div>
  );
}
