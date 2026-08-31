/**
 * Troca de senha obrigatória no primeiro acesso.
 *
 * É a barreira que impede a credencial inicial de virar permanente — o
 * desktop cria `admin`/`admin` e nunca cobra a troca. Enquanto
 * `usuario.trocarSenha` for true, o sistema não abre.
 */

import { KeyRound, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Botao } from '../componentes/Botao.js';
import { Campo } from '../componentes/Campo.js';
import { Mensagem } from '../componentes/Mensagem.js';
import { ErroDaApi } from '../servicos/api.js';
import { useSessao } from '../servicos/sessao.js';

export function TrocarSenha() {
  const { trocarSenha, sair, usuario } = useSessao();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [erroDoCampo, setErroDoCampo] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setErroDoCampo({});

    if (novaSenha !== confirmacao) {
      setErroDoCampo({ confirmacao: 'As duas senhas não coincidem.' });
      return;
    }

    setEnviando(true);
    try {
      await trocarSenha(senhaAtual, novaSenha);
    } catch (e) {
      if (e instanceof ErroDaApi) {
        setErro(e.message);
        // A API diz qual campo recusou; a tela mostra no lugar certo.
        setErroDoCampo(Object.fromEntries((e.campos ?? []).map((c) => [c.campo, c.mensagem])));
      } else {
        setErro('Não foi possível trocar a senha. Tente novamente.');
      }
      setEnviando(false);
    }
  }

  return (
    <section className="flex min-h-full items-center bg-linear-to-br from-gray-50 to-gray-100 py-12 dark:from-gray-900 dark:to-gray-800">
      <div className="mx-auto w-full max-w-md px-4">
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <div className="bg-linear-to-r from-[#001b5c] to-blue-700 p-8 text-center dark:from-gray-700 dark:to-gray-600">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#ecd31b]">
              <KeyRound className="size-8 text-black" aria-hidden />
            </div>
            <h1 className="mb-2 text-3xl font-bold text-white">Crie uma senha</h1>
            <p className="text-blue-100 dark:text-gray-300">
              {usuario?.nome}, defina sua senha antes de usar o sistema. Mínimo de 8 caracteres.
            </p>
          </div>

          <div className="p-8">
            <form onSubmit={enviar} className="flex flex-col gap-6" noValidate>
              <Campo
                rotulo="Senha atual"
                name="senhaAtual"
                type="password"
                icone={Lock}
                autoComplete="current-password"
                autoFocus
                required
                className="normal-case"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                erro={erroDoCampo.senhaAtual}
              />
              <Campo
                rotulo="Nova senha"
                name="novaSenha"
                type="password"
                icone={KeyRound}
                autoComplete="new-password"
                required
                className="normal-case"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                erro={erroDoCampo.novaSenha}
              />
              <Campo
                rotulo="Repita a nova senha"
                name="confirmacao"
                type="password"
                icone={KeyRound}
                autoComplete="new-password"
                required
                className="normal-case"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                erro={erroDoCampo.confirmacao}
              />

              {erro && <Mensagem tipo="erro" texto={erro} />}

              <Botao type="submit" variante="destaque" carregando={enviando}>
                Salvar senha
              </Botao>

              <button
                type="button"
                onClick={() => void sair()}
                className="text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                Sair e entrar com outro usuário
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
