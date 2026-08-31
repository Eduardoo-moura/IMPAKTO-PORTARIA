/**
 * Tela de acesso, no padrão de card com faixa azul e badge amarelo do guia.
 *
 * Regras do desktop que valem aqui (R31):
 * - mensagem única em caso de falha, sem revelar qual campo errou;
 * - só autentica usuário ativo — a API decide, a tela nem sabe;
 * - a tentativa recusada vai para a auditoria antes de existir sessão.
 *
 * A chamada real à API entra na Fase 1; por ora a tela valida o formulário e
 * repassa as credenciais para quem a renderiza.
 */

import { Lock, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Botao } from '../componentes/Botao.js';
import { Campo } from '../componentes/Campo.js';
import { Mensagem } from '../componentes/Mensagem.js';
import { ErroDaApi } from '../servicos/api.js';

type Props = {
  aoEntrar: (credenciais: { login: string; senha: string }) => Promise<void>;
  /** Título alternativo: o desktop reusa esta tela como "TROCA DE TURNO". */
  titulo?: string;
  subtitulo?: string;
};

export function Login({
  aoEntrar,
  titulo = 'Portaria',
  subtitulo = 'Entre com seu usuário para iniciar o turno.',
}: Props) {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await aoEntrar({ login: login.trim(), senha });
    } catch (e) {
      // A mensagem única vem do servidor (R31) e não revela qual campo errou.
      // Só o 429 do limite de tentativas fala outra coisa.
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível entrar. Tente novamente.');
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="flex min-h-full items-center bg-linear-to-br from-gray-50 to-gray-100 py-12 dark:from-gray-900 dark:to-gray-800">
      <div className="mx-auto w-full max-w-md px-4">
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <div className="bg-linear-to-r from-[#001b5c] to-blue-700 p-8 text-center dark:from-gray-700 dark:to-gray-600">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#ecd31b]">
              <Lock className="size-8 text-black" aria-hidden />
            </div>
            <h1 className="mb-2 text-3xl font-bold text-white">{titulo}</h1>
            <p className="text-blue-100 dark:text-gray-300">{subtitulo}</p>
          </div>

          <div className="p-8">
            <form onSubmit={enviar} className="flex flex-col gap-6" noValidate>
              <Campo
                rotulo="Usuário"
                name="login"
                icone={User}
                autoComplete="username"
                autoFocus
                required
                value={login}
                onChange={(e) => setLogin(e.target.value)}
              />
              <Campo
                rotulo="Senha"
                name="senha"
                type="password"
                icone={Lock}
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                // A senha é o único campo que não sobe para maiúsculas.
                className="normal-case"
              />

              {erro && <Mensagem tipo="erro" texto={erro} />}

              <Botao type="submit" variante="destaque" carregando={enviando}>
                Entrar
              </Botao>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
