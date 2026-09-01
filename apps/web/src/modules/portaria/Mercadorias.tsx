/**
 * Mercadorias na portaria — equivalente a `Frm_Mercadoria.cs`.
 *
 * Encomendas que chegam para funcionários e ficam no balcão até alguém
 * retirar. Duas coisas do desktop que a tela mantém:
 *
 * - **entregues em verde** (`#C6EFCE`) — cor com significado, não enfeite;
 * - **desfazer entrega** existe e é auditado. Errar o nome de quem retirou é
 *   comum no balcão, e sem o desfazer a correção viraria registro falso.
 */

import { Box, Building2, Check, PackagePlus, RotateCcw, Truck, User } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { Botao } from '../../componentes/Botao.js';
import { Campo } from '../../componentes/Campo.js';
import { Mensagem } from '../../componentes/Mensagem.js';
import { chamar, ErroDaApi } from '../../servicos/api.js';
import { useSessao } from '../../servicos/sessao.js';

export type Mercadoria = {
  id: string;
  chegadaEm: string;
  destinatario: string;
  empresa: string | null;
  entregador: string | null;
  usuarioRegistro: string | null;
  entregueEm: string | null;
  retiradoPor: string | null;
  usuarioEntrega: string | null;
};

type Resposta = { mercadorias: Mercadoria[]; pendentes: number; dias: number };

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export function Mercadorias() {
  const { token, pode } = useSessao();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [destinatario, setDestinatario] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [entregador, setEntregador] = useState('');
  const [salvando, setSalvando] = useState(false);

  const podeRegistrar = pode('portaria.mercadoria.registrar');
  const podeEntregar = pode('portaria.mercadoria.entregar');
  const podeDesfazer = pode('portaria.mercadoria.desfazer_entrega');

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await chamar<Resposta>('/portaria/mercadorias', { token }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar as mercadorias.');
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function registrar(evento: FormEvent) {
    evento.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await chamar('/portaria/mercadorias', {
        metodo: 'POST',
        token,
        corpo: { destinatario, empresa: empresa || null, entregador: entregador || null },
      });
      setDestinatario('');
      setEmpresa('');
      setEntregador('');
      setAviso('Chegada registrada.');
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível registrar a chegada.');
    } finally {
      setSalvando(false);
    }
  }

  async function retirar(m: Mercadoria) {
    // O desktop abre um diálogo pedindo o nome antes de dar baixa. Sem ele, a
    // baixa não responde à pergunta que a portaria vai fazer depois.
    const nome = window.prompt(`Quem está retirando a mercadoria de ${m.destinatario}?`);
    if (nome === null) return;
    if (!nome.trim()) {
      setErro('Informe quem está retirando.');
      return;
    }

    setErro(null);
    try {
      await chamar(`/portaria/mercadorias/${m.id}/entrega`, {
        metodo: 'POST',
        token,
        corpo: { retiradoPor: nome },
      });
      setAviso(`Entrega de ${m.destinatario} confirmada.`);
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível confirmar a entrega.');
    }
  }

  async function desfazer(m: Mercadoria) {
    if (
      !window.confirm(
        `Desfazer a retirada de ${m.destinatario}, feita por ${m.retiradoPor}? A operação fica registrada na auditoria.`,
      )
    ) {
      return;
    }

    setErro(null);
    try {
      await chamar(`/portaria/mercadorias/${m.id}/entrega`, { metodo: 'DELETE', token });
      setAviso(`Entrega de ${m.destinatario} desfeita. A mercadoria voltou para a portaria.`);
      await recarregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível desfazer a entrega.');
    }
  }

  const visiveis = dados
    ? somentePendentes
      ? dados.mercadorias.filter((m) => !m.entregueEm)
      : dados.mercadorias
    : [];

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section>
        <h1 className="text-3xl font-bold text-[#001b5c] dark:text-white">Mercadorias</h1>
        <p className="mt-1 mb-4 text-gray-600 dark:text-gray-400">
          Encomendas que chegam para funcionários e ficam na portaria.
        </p>

        {aviso && (
          <div className="mb-4">
            <Mensagem tipo="ok" texto={aviso} />
          </div>
        )}

        {podeRegistrar ? (
          <form
            onSubmit={registrar}
            className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            noValidate
          >
            <Campo
              rotulo="Para quem é"
              name="destinatario"
              icone={User}
              autoFocus
              required
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              dica="Único campo obrigatório."
            />
            <Campo
              rotulo="Empresa que trouxe"
              name="empresa"
              icone={Building2}
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
            />
            <Campo
              rotulo="Quem entregou"
              name="entregador"
              icone={Truck}
              value={entregador}
              onChange={(e) => setEntregador(e.target.value)}
            />

            {erro && <Mensagem tipo="erro" texto={erro} />}

            <Botao type="submit" variante="solido" carregando={salvando} className="py-4 text-xl">
              <span className="flex items-center justify-center gap-2">
                <PackagePlus className="size-6" aria-hidden />
                Registrar chegada
              </span>
            </Botao>
          </form>
        ) : (
          <Mensagem tipo="erro" texto="Seu perfil não permite registrar mercadorias." />
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">Na portaria</h2>
            {dados && (
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  dados.pendentes > 0
                    ? 'bg-[#fff2cc] text-[#7c5e00] dark:bg-yellow-900/30 dark:text-yellow-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {dados.pendentes} aguardando retirada
              </span>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={somentePendentes}
              onChange={(e) => setSomentePendentes(e.target.checked)}
              className="size-4 accent-[#ecd31b]"
            />
            Ocultar retiradas
          </label>
        </div>

        {erro && !podeRegistrar && (
          <div className="mb-4">
            <Mensagem tipo="erro" texto={erro} />
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200 text-sm dark:border-gray-700">
              <tr className="text-gray-600 dark:text-gray-400">
                <th className="px-3 py-3 font-medium">Chegada</th>
                <th className="px-3 py-3 font-medium">Para quem</th>
                <th className="px-3 py-3 font-medium">Empresa</th>
                <th className="px-3 py-3 font-medium">Situação</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-gray-500">
                    Carregando…
                  </td>
                </tr>
              )}

              {!carregando && visiveis.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-gray-500">
                    <Box className="mx-auto mb-2 size-8 opacity-40" aria-hidden />
                    {somentePendentes ? 'Nada aguardando retirada.' : 'Nenhuma mercadoria no período.'}
                  </td>
                </tr>
              )}

              {!carregando &&
                visiveis.map((m) => (
                  <tr
                    key={m.id}
                    // Verde = entregue. Vem do desktop e carrega significado.
                    className={`border-b border-gray-100 last:border-0 dark:border-gray-700/60 ${
                      m.entregueEm
                        ? 'bg-[#c6efce] text-[#006100] dark:bg-green-900/20 dark:text-green-200'
                        : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{quando(m.chegadaEm)}</td>
                    <td className="px-3 py-2.5 font-semibold">{m.destinatario}</td>
                    <td className="px-3 py-2.5">{m.empresa ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      {m.entregueEm ? (
                        <span className="text-sm">
                          Retirada por <strong>{m.retiradoPor}</strong>
                          <br />
                          <span className="opacity-75">{quando(m.entregueEm)}</span>
                        </span>
                      ) : (
                        <span className="text-sm font-medium text-[#7c5e00] dark:text-yellow-300">
                          aguardando retirada
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {!m.entregueEm && podeEntregar && (
                        <button
                          type="button"
                          onClick={() => void retirar(m)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#ecd31b] px-3 py-2 font-bold text-black transition hover:brightness-105"
                        >
                          <Check className="size-4" aria-hidden />
                          Retirar
                        </button>
                      )}
                      {m.entregueEm && podeDesfazer && (
                        <button
                          type="button"
                          onClick={() => void desfazer(m)}
                          title="Desfazer a retirada. Fica registrado na auditoria."
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold underline-offset-2 hover:underline"
                        >
                          <RotateCcw className="size-4" aria-hidden />
                          Desfazer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
