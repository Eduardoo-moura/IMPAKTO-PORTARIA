/**
 * R32 — Diálogo de troca de turno.
 *
 * O porteiro que assume entra sem o sistema ser fechado. Duas propriedades
 * vindas do desktop:
 *
 * - **cancelar mantém quem já estava.** Se a credencial de quem assume não
 *   confere, a API devolve 401 e a sessão anterior segue valendo — o sistema
 *   nunca fica aberto sem usuário;
 * - se houver formulário preenchido, avisa antes de descartar. O que estivesse
 *   na tela seria gravado no nome do porteiro que entra.
 */

import { AlertTriangle, Lock, User } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { ErroDaApi } from '../servicos/api.js';
import { Botao } from './Botao.js';
import { Campo } from './Campo.js';
import { Mensagem } from './Mensagem.js';

type Props = {
  aberto: boolean;
  deQuem: string;
  /** Há algo digitado e não salvo que será descartado na troca. */
  haDadosNaTela?: boolean;
  aoFechar: () => void;
  aoConfirmar: (login: string, senha: string) => Promise<void>;
};

export function TrocaDeTurno({ aberto, deQuem, haDadosNaTela = false, aoFechar, aoConfirmar }: Props) {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const primeiroCampo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aberto) {
      setLogin('');
      setSenha('');
      setErro(null);
      primeiroCampo.current?.focus();
    }
  }, [aberto]);

  if (!aberto) return null;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await aoConfirmar(login.trim(), senha);
    } catch (e) {
      // A sessão anterior continua valendo: nada é encerrado antes de a nova
      // ser aprovada pela API.
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível trocar o turno.');
      setSenha('');
      setEnviando(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-troca-turno"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !enviando) aoFechar();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="bg-linear-to-r from-[#001b5c] to-blue-700 p-6 text-center dark:from-gray-700 dark:to-gray-600">
          <h2 id="titulo-troca-turno" className="text-2xl font-bold text-white">
            Troca de turno
          </h2>
          <p className="mt-1 text-blue-100 dark:text-gray-300">Assumindo o turno de {deQuem}.</p>
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-5 p-6" noValidate>
          {haDadosNaTela && (
            <div className="flex items-start gap-3 rounded-lg border border-[#7c5e00]/30 bg-[#fff2cc] p-4 text-[#7c5e00] dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <p className="text-sm font-medium">
                Há dados preenchidos que ainda não foram salvos. Ao trocar o turno, eles serão
                descartados.
              </p>
            </div>
          )}

          <Campo
            rotulo="Usuário que assume"
            name="login"
            icone={User}
            autoComplete="off"
            required
            ref={primeiroCampo}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
          <Campo
            rotulo="Senha"
            name="senha"
            type="password"
            icone={Lock}
            autoComplete="off"
            required
            className="normal-case"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />

          {erro && <Mensagem tipo="erro" texto={erro} />}

          <div className="flex gap-3">
            <Botao type="button" variante="neutro" onClick={aoFechar} disabled={enviando} className="flex-1">
              Cancelar
            </Botao>
            <Botao type="submit" variante="solido" carregando={enviando} className="flex-1">
              Assumir turno
            </Botao>
          </div>
        </form>
      </div>
    </div>
  );
}
