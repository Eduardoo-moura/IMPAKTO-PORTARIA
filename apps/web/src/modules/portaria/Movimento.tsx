/**
 * Tela de movimento — a principal do sistema, equivalente a `Frm_Veiculo.cs`.
 *
 * Formulário de entrada à esquerda, grade do movimento à direita. A grade soma
 * o que entrou hoje com o que continua sem saída nos últimos 3 dias, e pinta
 * de âmbar as pendências de dias anteriores (R11, R14).
 *
 * A fonte é grande de propósito: a grade é lida à distância, no balcão. O
 * desktop usa Segoe UI 12 pelo mesmo motivo.
 */

import { AlertTriangle, History, LogOut, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Botao } from '../../componentes/Botao.js';
import { Mensagem } from '../../componentes/Mensagem.js';
import { chamar, ErroDaApi } from '../../servicos/api.js';
import { useSessao } from '../../servicos/sessao.js';
import {
  FORMULARIO_VAZIO,
  FormularioDeEntrada,
  type DadosDoFormulario,
} from './FormularioDeEntrada.js';
import type { Mercadoria } from './Mercadorias.js';
import { PainelDeMercadorias } from './PainelDeMercadorias.js';

export type Acesso = {
  id: string;
  entradaEm: string | null;
  saidaEm: string | null;
  nome: string;
  documento: string;
  celular: string | null;
  placa: string | null;
  tipoVeiculo: string | null;
  empresa: string | null;
  prestador: boolean | null;
  agregado: boolean | null;
  usuarioEntrada: string | null;
  acompanhantes: Array<{ nome: string; documento: string | null }>;
  pendenciaAntiga: boolean;
};

type Movimento = { acessos: Acesso[]; hoje: string; dentro: number; pendencias: number };

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const simNao = (v: string): boolean | null => (v === 'sim' ? true : v === 'nao' ? false : null);

export function Movimento() {
  const { token, pode } = useSessao();
  const [form, setForm] = useState<DadosDoFormulario>(FORMULARIO_VAZIO);
  const [movimento, setMovimento] = useState<Movimento | null>(null);
  // R18 — "OCULTAR SAÍDAS" do desktop volta MARCADO a cada atualização.
  const [somenteDentro, setSomenteDentro] = useState(true);
  const [historico, setHistorico] = useState<{ titulo: string; itens: Acesso[] } | null>(null);
  const [mercadorias, setMercadorias] = useState<Mercadoria[]>([]);

  const [carregando, setCarregando] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDaGrade, setErroDaGrade] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const podeRegistrar = pode('portaria.acesso.criar');
  const podeDarSaida = pode('portaria.acesso.saida');

  const atualizarGrade = useCallback(async () => {
    setCarregando(true);
    try {
      setMovimento(await chamar<Movimento>('/portaria/acessos/movimento', { token }));
      setErroDaGrade(null);
    } catch (e) {
      setErroDaGrade(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar o movimento.');
    } finally {
      setCarregando(false);
    }

    // O painel acompanha a grade, como no desktop: o que foi registrado ou
    // entregue na outra tela muda a lista daqui. Falha dele não derruba a
    // grade, que é o que o porteiro precisa para trabalhar.
    try {
      const r = await chamar<{ mercadorias: Mercadoria[] }>(
        '/portaria/mercadorias?somentePendentes=true',
        { token },
      );
      setMercadorias(r.mercadorias);
    } catch {
      setMercadorias([]);
    }
  }, [token]);

  useEffect(() => {
    void atualizarGrade();
  }, [atualizarGrade]);

  /** R09, R10 — pré-preenche pela visita mais recente e abre o histórico. */
  async function buscar(por: 'placa' | 'documento', valor: string) {
    if (!valor.trim()) {
      setErro(por === 'placa' ? 'Digite a placa para buscar.' : 'Digite o documento para buscar.');
      return;
    }

    setBuscando(true);
    setErro(null);
    setAviso(null);
    try {
      const achado = await chamar<Acesso | null>(
        `/portaria/busca/${por}/${encodeURIComponent(valor.trim())}`,
        { token },
      );

      if (!achado) {
        setAviso(por === 'placa' ? 'Placa não encontrada.' : 'Documento não encontrado.');
        setHistorico(null);
        return;
      }

      setForm((atual) => ({
        ...atual,
        nome: achado.nome,
        documento: achado.documento,
        celular: achado.celular ?? '',
        // A busca por placa NÃO preenche a placa: ela já está digitada (R10).
        placa: por === 'documento' ? (achado.placa ?? '') : atual.placa,
        tipoVeiculo: achado.tipoVeiculo ?? '',
        empresa: achado.empresa ?? '',
        prestador: achado.prestador === true ? 'sim' : achado.prestador === false ? 'nao' : '',
        agregado: achado.agregado === true ? 'sim' : achado.agregado === false ? 'nao' : '',
        acompanhantes:
          achado.acompanhantes.length > 0
            ? achado.acompanhantes.map((c) => ({ nome: c.nome, documento: c.documento ?? '' }))
            : [{ nome: '', documento: '' }],
      }));
      setAviso('Registro encontrado.');

      const itens = await chamar<Acesso[]>(
        `/portaria/historico/${por}/${encodeURIComponent(valor.trim())}`,
        { token },
      );
      setHistorico({ titulo: `${por === 'placa' ? 'Placa' : 'Documento'} ${valor.trim().toUpperCase()}`, itens });
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível buscar.');
    } finally {
      setBuscando(false);
    }
  }

  async function salvar(confirmarDocumento: boolean) {
    setSalvando(true);
    setErro(null);
    try {
      await chamar('/portaria/acessos', {
        metodo: 'POST',
        token,
        corpo: {
          nome: form.nome,
          documento: form.documento,
          celular: form.celular || null,
          placa: form.placa || null,
          tipoVeiculo: form.tipoVeiculo || null,
          empresa: form.empresa || null,
          prestador: simNao(form.prestador),
          agregado: simNao(form.agregado),
          acompanhantes: form.acompanhantes.filter((a) => a.nome.trim() || a.documento.trim()),
          confirmarDocumento,
        },
      });

      setForm(FORMULARIO_VAZIO);
      setHistorico(null);
      setAviso('Entrada registrada.');
      await atualizarGrade();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível registrar a entrada.');
    } finally {
      setSalvando(false);
    }
  }

  /** R15, R16 — confirma antes, e diz de quando é o veículo se for pendência. */
  async function darSaida(acesso: Acesso, forcar = false) {
    if (!forcar) {
      const pergunta = acesso.pendenciaAntiga
        ? `${acesso.nome} entrou em ${hora(acesso.entradaEm)} e continua sem saída. Registrar a saída agora?`
        : `Confirmar saída de ${acesso.nome}?`;
      if (!window.confirm(pergunta)) return;
    }

    setErroDaGrade(null);
    try {
      await chamar(`/portaria/acessos/${acesso.id}/saida${forcar ? '?forcar=true' : ''}`, {
        metodo: 'POST',
        token,
      });
      setAviso(`Saída de ${acesso.nome} registrada.`);
      await atualizarGrade();
    } catch (e) {
      if (e instanceof ErroDaApi && e.codigo === 'SAIDA_JA_REGISTRADA') {
        const anterior = e.contexto?.saidaAnterior as string | undefined;
        if (
          window.confirm(
            `Este acesso já tem saída registrada em ${hora(anterior ?? null)}. Substituir pela hora de agora?`,
          )
        ) {
          await darSaida(acesso, true);
        }
        return;
      }
      setErroDaGrade(e instanceof ErroDaApi ? e.message : 'Não foi possível registrar a saída.');
    }
  }

  const visiveis = movimento
    ? somenteDentro
      ? movimento.acessos.filter((a) => !a.saidaEm)
      : movimento.acessos
    : [];

  return (
    <div className="mx-auto grid max-w-[1600px] gap-6 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
      <section>
        <h1 className="text-3xl font-bold text-[#001b5c] dark:text-white">Movimento</h1>
        <p className="mt-1 mb-4 text-gray-600 dark:text-gray-400">
          Enter no documento ou na placa busca a última visita.
        </p>

        {aviso && (
          <div className="mb-4">
            <Mensagem tipo="ok" texto={aviso} />
          </div>
        )}

        {podeRegistrar ? (
          <FormularioDeEntrada
            dados={form}
            aoMudar={setForm}
            aoBuscar={buscar}
            aoSalvar={salvar}
            buscando={buscando}
            salvando={salvando}
            erro={erro}
          />
        ) : (
          <Mensagem tipo="erro" texto="Seu perfil não permite registrar entradas." />
        )}

        {pode('portaria.mercadoria.ver') && (
          <div className="mt-6">
            <PainelDeMercadorias pendentes={mercadorias} />
          </div>
        )}

        {historico && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <History className="size-5" aria-hidden />
              Últimas visitas · {historico.titulo}
            </h2>
            {historico.itens.length === 0 ? (
              <p className="text-gray-500">Sem visitas anteriores.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {historico.itens.slice(0, 10).map((v) => (
                  <li key={v.id} className="flex justify-between gap-4 py-2 text-sm">
                    <span className="font-medium">{v.nome}</span>
                    <span className="tabular-nums text-gray-600 dark:text-gray-400">
                      {hora(v.entradaEm)} → {v.saidaEm ? hora(v.saidaEm) : 'dentro'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold">Últimas visitas</h2>
            {movimento && (
              <>
                <span className="rounded-full bg-[#c6efce] px-3 py-1 text-sm font-semibold text-[#006100] dark:bg-green-900/30 dark:text-green-300">
                  {movimento.dentro} dentro
                </span>
                {movimento.pendencias > 0 && (
                  <span className="flex items-center gap-1.5 rounded-full bg-[#fff2cc] px-3 py-1 text-sm font-semibold text-[#7c5e00] dark:bg-yellow-900/30 dark:text-yellow-300">
                    <AlertTriangle className="size-4" aria-hidden />
                    {movimento.pendencias} de dias anteriores
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={somenteDentro}
                onChange={(e) => setSomenteDentro(e.target.checked)}
                className="size-4 accent-[#ecd31b]"
              />
              Ocultar saídas
            </label>
            <Botao variante="neutro" onClick={() => void atualizarGrade()} carregando={carregando}>
              <span className="flex items-center gap-2">
                <RefreshCw className="size-5" aria-hidden />
                Atualizar
              </span>
            </Botao>
          </div>
        </div>

        {erroDaGrade && (
          <div className="mb-4">
            <Mensagem tipo="erro" texto={erroDaGrade} />
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-left text-base">
            <thead className="border-b border-gray-200 text-sm dark:border-gray-700">
              <tr className="text-gray-600 dark:text-gray-400">
                <th className="px-3 py-3 font-medium">Entrada</th>
                <th className="px-3 py-3 font-medium">Saída</th>
                <th className="px-3 py-3 font-medium">Nome</th>
                <th className="px-3 py-3 font-medium">Documento</th>
                <th className="px-3 py-3 font-medium">Placa</th>
                <th className="px-3 py-3 font-medium">Empresa</th>
                {podeDarSaida && <th className="px-3 py-3" />}
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-gray-500">
                    Carregando…
                  </td>
                </tr>
              )}

              {!carregando && visiveis.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-gray-500">
                    {somenteDentro ? 'Ninguém dentro no momento.' : 'Sem movimento no período.'}
                  </td>
                </tr>
              )}

              {!carregando &&
                visiveis.map((a) => (
                  <tr
                    key={a.id}
                    // R14 — âmbar: entrou num dia anterior e continua sem saída.
                    // Não é enfeite: é o que impede dar a saída de hoje na linha errada.
                    className={`border-b border-gray-100 last:border-0 dark:border-gray-700/60 ${
                      a.pendenciaAntiga
                        ? 'bg-[#fff2cc] text-[#7c5e00] dark:bg-yellow-900/20 dark:text-yellow-200'
                        : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{hora(a.entradaEm)}</td>
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{hora(a.saidaEm)}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">{a.nome}</span>
                      {a.acompanhantes.length > 0 && (
                        <span className="ml-1.5 text-sm opacity-70">
                          +{a.acompanhantes.length} acomp.
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{a.documento}</td>
                    <td className="px-3 py-2.5 font-medium">{a.placa ?? '—'}</td>
                    <td className="px-3 py-2.5">{a.empresa ?? '—'}</td>
                    {podeDarSaida && (
                      <td className="px-3 py-2.5 text-right">
                        {!a.saidaEm && (
                          <button
                            type="button"
                            onClick={() => void darSaida(a)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#ecd31b] px-3 py-2 font-bold text-black transition hover:brightness-105"
                          >
                            <LogOut className="size-4" aria-hidden />
                            Saída
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
