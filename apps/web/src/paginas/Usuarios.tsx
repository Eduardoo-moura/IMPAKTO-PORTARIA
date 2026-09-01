/**
 * Cadastro de usuários.
 *
 * Equivale a `Frm_Usuarios.cs`. O que a tela precisa deixar claro, porque o
 * desktop também deixava:
 *
 * - senha definida aqui é **inicial** — o dono troca no primeiro acesso;
 * - desativar não apaga: o histórico de acessos daquele porteiro continua
 *   íntegro, e o login segue aparecendo na auditoria;
 * - a API recusa (409) deixar o sistema sem administrador ativo (R30), e a
 *   tela mostra essa recusa em vez de escondê-la.
 */

import { KeyRound, Plus, ShieldCheck, UserCog, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Botao } from '../componentes/Botao.js';
import { Campo } from '../componentes/Campo.js';
import { Mensagem } from '../componentes/Mensagem.js';
import { chamar, ErroDaApi } from '../servicos/api.js';
import { useSessao } from '../servicos/sessao.js';

type Usuario = {
  id: string;
  login: string;
  nome: string;
  perfil: string;
  ativo: boolean;
  trocarSenha: boolean;
  ultimoLoginEm: string | null;
};

type Perfil = { id: string; nome: string; descricao: string; usuarios: number };

type Dialogo =
  | { tipo: 'novo' }
  | { tipo: 'editar'; usuario: Usuario }
  | { tipo: 'senha'; usuario: Usuario }
  | null;

export function Usuarios() {
  const { token, pode } = useSessao();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  const podeEditar = pode('usuario.editar');

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, listaPerfis] = await Promise.all([
        chamar<Usuario[]>('/usuarios', { token }),
        chamar<Perfil[]>('/usuarios/perfis', { token }),
      ]);
      setUsuarios(lista);
      setPerfis(listaPerfis);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar os usuários.');
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function alternarAtivo(usuario: Usuario) {
    setErro(null);
    setAviso(null);
    try {
      await chamar(`/usuarios/${usuario.id}/ativo`, {
        metodo: 'POST',
        corpo: { ativo: !usuario.ativo },
        token,
      });
      setAviso(`${usuario.login} ${usuario.ativo ? 'desativado' : 'ativado'}.`);
      await recarregar();
    } catch (e) {
      // A recusa da R30 chega como 409 e é exatamente o que o operador
      // precisa ler — não vira "erro inesperado".
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível alterar o usuário.');
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#001b5c] dark:text-white">Usuários</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Quem pode entrar no sistema e o que cada um alcança.
          </p>
        </div>
        {podeEditar && (
          <Botao variante="solido" onClick={() => setDialogo({ tipo: 'novo' })}>
            <span className="flex items-center gap-2">
              <UserPlus className="size-5" aria-hidden />
              Novo usuário
            </span>
          </Botao>
        )}
      </div>

      {erro && (
        <div className="mt-4">
          <Mensagem tipo="erro" texto={erro} />
        </div>
      )}
      {aviso && (
        <div className="mt-4">
          <Mensagem tipo="ok" texto={aviso} />
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full text-left">
          <thead className="border-b border-gray-200 text-sm dark:border-gray-700">
            <tr className="text-gray-600 dark:text-gray-400">
              <th className="px-4 py-3 font-medium">Usuário</th>
              <th className="px-4 py-3 font-medium">Perfil</th>
              <th className="px-4 py-3 font-medium">Último acesso</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              {podeEditar && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Carregando…
                </td>
              </tr>
            )}

            {!carregando && usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}

            {usuarios.map((u) => (
              <tr
                key={u.id}
                className={`border-b border-gray-100 last:border-0 dark:border-gray-700/60 ${
                  u.ativo ? '' : 'bg-gray-50 dark:bg-gray-900/40'
                }`}
              >
                <td className="px-4 py-3">
                  <p className="text-lg font-semibold">{u.login}</p>
                  {u.nome !== u.login && <p className="text-sm text-gray-500">{u.nome}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-sm font-medium dark:bg-gray-700">
                    {u.perfil === 'ADMINISTRADOR' ? (
                      <ShieldCheck className="size-4" aria-hidden />
                    ) : (
                      <Users className="size-4" aria-hidden />
                    )}
                    {u.perfil}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm tabular-nums text-gray-600 dark:text-gray-400">
                  {u.ultimoLoginEm
                    ? new Date(u.ultimoLoginEm).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : 'nunca entrou'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        u.ativo
                          ? 'bg-[#c6efce] text-[#006100] dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {u.ativo ? 'ativo' : 'inativo'}
                    </span>
                    {u.trocarSenha && (
                      <span className="rounded-full bg-[#fff2cc] px-2.5 py-1 text-xs font-semibold text-[#7c5e00] dark:bg-yellow-900/30 dark:text-yellow-300">
                        troca de senha pendente
                      </span>
                    )}
                  </div>
                </td>
                {podeEditar && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <BotaoIcone
                        titulo="Alterar nome e perfil"
                        onClick={() => setDialogo({ tipo: 'editar', usuario: u })}
                      >
                        <UserCog className="size-5" aria-hidden />
                      </BotaoIcone>
                      <BotaoIcone
                        titulo="Redefinir senha"
                        onClick={() => setDialogo({ tipo: 'senha', usuario: u })}
                      >
                        <KeyRound className="size-5" aria-hidden />
                      </BotaoIcone>
                      <button
                        type="button"
                        onClick={() => void alternarAtivo(u)}
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-gray-100 dark:text-blue-400 dark:hover:bg-gray-700"
                      >
                        {u.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        Desativar não apaga o usuário: o histórico de acessos e a trilha de auditoria continuam
        intactos. O sistema recusa deixar nenhum administrador ativo.
      </p>

      {dialogo && (
        <DialogoDeUsuario
          dialogo={dialogo}
          perfis={perfis}
          token={token}
          aoFechar={() => setDialogo(null)}
          aoConcluir={async (mensagem) => {
            setDialogo(null);
            setAviso(mensagem);
            setErro(null);
            await recarregar();
          }}
        />
      )}
    </div>
  );
}

function BotaoIcone({
  titulo,
  onClick,
  children,
}: {
  titulo: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
    >
      {children}
    </button>
  );
}

function DialogoDeUsuario({
  dialogo,
  perfis,
  token,
  aoFechar,
  aoConcluir,
}: {
  dialogo: NonNullable<Dialogo>;
  perfis: Perfil[];
  token: string | null;
  aoFechar: () => void;
  aoConcluir: (mensagem: string) => Promise<void>;
}) {
  const usuario = dialogo.tipo === 'novo' ? null : dialogo.usuario;

  const [login, setLogin] = useState(usuario?.login ?? '');
  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState(usuario?.perfil ?? 'PORTARIA');
  const [erro, setErro] = useState<string | null>(null);
  const [erroDoCampo, setErroDoCampo] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const titulo =
    dialogo.tipo === 'novo'
      ? 'Novo usuário'
      : dialogo.tipo === 'editar'
        ? `Alterar ${usuario!.login}`
        : `Redefinir a senha de ${usuario!.login}`;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setErroDoCampo({});
    setEnviando(true);

    try {
      if (dialogo.tipo === 'novo') {
        await chamar('/usuarios', { metodo: 'POST', token, corpo: { login, nome, senha, perfil } });
        await aoConcluir(`${login.toUpperCase()} cadastrado. Ele troca a senha no primeiro acesso.`);
      } else if (dialogo.tipo === 'editar') {
        await chamar(`/usuarios/${usuario!.id}`, { metodo: 'PUT', token, corpo: { nome, perfil } });
        await aoConcluir(`${usuario!.login} alterado.`);
      } else {
        await chamar(`/usuarios/${usuario!.id}/senha`, {
          metodo: 'POST',
          token,
          corpo: { novaSenha: senha },
        });
        await aoConcluir(`Senha de ${usuario!.login} redefinida. Ele troca no próximo acesso.`);
      }
    } catch (e) {
      if (e instanceof ErroDaApi) {
        setErro(e.message);
        setErroDoCampo(Object.fromEntries((e.campos ?? []).map((c) => [c.campo, c.mensagem])));
      } else {
        setErro('Não foi possível concluir. Tente novamente.');
      }
      setEnviando(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !enviando) aoFechar();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="bg-linear-to-r from-[#001b5c] to-blue-700 p-6 text-center dark:from-gray-700 dark:to-gray-600">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-[#ecd31b]">
            {dialogo.tipo === 'senha' ? (
              <KeyRound className="size-6 text-black" aria-hidden />
            ) : (
              <Plus className="size-6 text-black" aria-hidden />
            )}
          </div>
          <h2 className="text-2xl font-bold text-white">{titulo}</h2>
        </div>

        <form onSubmit={enviar} className="flex flex-col gap-5 p-6" noValidate>
          {dialogo.tipo === 'novo' && (
            <Campo
              rotulo="Usuário"
              name="login"
              icone={UserPlus}
              autoFocus
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              erro={erroDoCampo.login}
            />
          )}

          {dialogo.tipo !== 'senha' && (
            <>
              <Campo
                rotulo="Nome de exibição"
                name="nome"
                icone={UserCog}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                erro={erroDoCampo.nome}
              />
              <div>
                <label
                  htmlFor="perfil"
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Perfil
                </label>
                <select
                  id="perfil"
                  value={perfil}
                  onChange={(e) => setPerfil(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg focus:ring-2 focus:ring-[#ecd31b] focus:outline-hidden dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  {perfis.map((p) => (
                    <option key={p.id} value={p.nome}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                  {perfis.find((p) => p.nome === perfil)?.descricao}
                </p>
              </div>
            </>
          )}

          {dialogo.tipo !== 'editar' && (
            <Campo
              rotulo={dialogo.tipo === 'novo' ? 'Senha inicial' : 'Nova senha'}
              name="senha"
              type="password"
              icone={KeyRound}
              autoComplete="new-password"
              required
              className="normal-case"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              erro={erroDoCampo.senha ?? erroDoCampo.novaSenha}
              aviso="Mínimo de 8 caracteres. O usuário troca no primeiro acesso."
            />
          )}

          {erro && <Mensagem tipo="erro" texto={erro} />}

          <div className="flex gap-3">
            <Botao type="button" variante="neutro" onClick={aoFechar} disabled={enviando} className="flex-1">
              Cancelar
            </Botao>
            <Botao type="submit" variante="solido" carregando={enviando} className="flex-1">
              Salvar
            </Botao>
          </div>
        </form>
      </div>
    </div>
  );
}
