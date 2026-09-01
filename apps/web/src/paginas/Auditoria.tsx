/**
 * Consulta da trilha de auditoria.
 *
 * Equivale a `Frm_Auditoria.cs`, que abre com os últimos 7 dias. A trilha é
 * append-only: esta tela lê e filtra, e não existe nada para editar ou apagar.
 *
 * O nome do usuário mostrado é o congelado no evento (R33) — se a pessoa foi
 * renomeada depois, a trilha continua dizendo como ela se chamava na hora.
 */

import { ScrollText, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Botao } from '../componentes/Botao.js';
import { Mensagem } from '../componentes/Mensagem.js';
import { chamar, ErroDaApi } from '../servicos/api.js';
import { useSessao } from '../servicos/sessao.js';

type Evento = {
  id: string;
  em: string;
  usuarioLogin: string | null;
  usuarioNome: string | null;
  tipo: string;
  acao: string;
  registro: string | null;
  detalhe: string | null;
  ip: string | null;
  maquina: string | null;
};

type Resposta = {
  eventos: Evento[];
  total: number;
  pagina: number;
  porPagina: number;
  de: string;
  ate: string;
};

type Filtros = { de: string; ate: string; tipo: string; acao: string; usuario: string };

const TIPOS = ['ACESSO', 'VEICULO', 'MERCADORIA', 'USUARIO'] as const;

/** Mesmas cores do desktop: cada tipo tem um peso operacional diferente. */
const CORES_DO_TIPO: Record<string, string> = {
  ACESSO: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  VEICULO: 'bg-[#fff2cc] text-[#7c5e00] dark:bg-yellow-900/30 dark:text-yellow-300',
  MERCADORIA: 'bg-[#c6efce] text-[#006100] dark:bg-green-900/30 dark:text-green-300',
  USUARIO: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
};

const PORPAGINA = 50;

export function Auditoria() {
  const { token } = useSessao();
  const [filtros, setFiltros] = useState<Filtros>({ de: '', ate: '', tipo: '', acao: '', usuario: '' });
  const [pagina, setPagina] = useState(1);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [opcoes, setOpcoes] = useState<{ acoes: string[]; usuarios: string[] }>({ acoes: [], usuarios: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(
    async (paginaAlvo: number) => {
      setCarregando(true);
      setErro(null);

      const parametros = new URLSearchParams({ pagina: String(paginaAlvo), porPagina: String(PORPAGINA) });
      for (const [chave, valor] of Object.entries(filtros)) {
        if (valor) parametros.set(chave, valor);
      }

      try {
        const dados = await chamar<Resposta>(`/auditoria?${parametros}`, { token });
        setResposta(dados);
        setPagina(paginaAlvo);
        // O período efetivo vem resolvido do servidor; a tela passa a mostrá-lo.
        setFiltros((f) => (f.de || f.ate ? f : { ...f, de: dados.de, ate: dados.ate }));
      } catch (e) {
        setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível consultar a trilha.');
      } finally {
        setCarregando(false);
      }
    },
    [filtros, token],
  );

  useEffect(() => {
    void chamar<{ acoes: string[]; usuarios: string[] }>('/auditoria/filtros', { token })
      .then(setOpcoes)
      .catch(() => setOpcoes({ acoes: [], usuarios: [] }));
    // Primeira carga: sem período, a API devolve os últimos 7 dias.
    void buscar(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const totalDePaginas = resposta ? Math.max(1, Math.ceil(resposta.total / resposta.porPagina)) : 1;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-3xl font-bold text-[#001b5c] dark:text-white">Auditoria</h1>
      <p className="mt-1 text-gray-600 dark:text-gray-400">
        Tudo o que foi feito no sistema, e por quem. Registro permanente: não é editável nem
        apagável.
      </p>

      <form
        className="mt-6 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6 dark:border-gray-700 dark:bg-gray-800"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar(1);
        }}
      >
        <CampoDeFiltro rotulo="De" tipo="date" valor={filtros.de} aoMudar={(v) => setFiltros({ ...filtros, de: v })} />
        <CampoDeFiltro rotulo="Até" tipo="date" valor={filtros.ate} aoMudar={(v) => setFiltros({ ...filtros, ate: v })} />
        <Selecao
          rotulo="Tipo"
          valor={filtros.tipo}
          opcoes={TIPOS as unknown as string[]}
          aoMudar={(v) => setFiltros({ ...filtros, tipo: v })}
        />
        <Selecao
          rotulo="Ação"
          valor={filtros.acao}
          opcoes={opcoes.acoes}
          aoMudar={(v) => setFiltros({ ...filtros, acao: v })}
        />
        <Selecao
          rotulo="Usuário"
          valor={filtros.usuario}
          opcoes={opcoes.usuarios}
          aoMudar={(v) => setFiltros({ ...filtros, usuario: v })}
        />
        <div className="flex items-end">
          <Botao type="submit" variante="solido" carregando={carregando} className="w-full">
            <span className="flex items-center justify-center gap-2">
              <Search className="size-5" aria-hidden />
              Buscar
            </span>
          </Botao>
        </div>
      </form>

      {erro && (
        <div className="mt-4">
          <Mensagem tipo="erro" texto={erro} />
        </div>
      )}

      {resposta && !erro && (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          <strong className="tabular-nums">{resposta.total}</strong>{' '}
          {resposta.total === 1 ? 'evento' : 'eventos'} entre {formatarDia(resposta.de)} e{' '}
          {formatarDia(resposta.ate)}.
        </p>
      )}

      <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 dark:border-gray-700">
            <tr className="text-gray-600 dark:text-gray-400">
              <th className="px-4 py-3 font-medium whitespace-nowrap">Quando</th>
              <th className="px-4 py-3 font-medium">Quem</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Ação</th>
              <th className="px-4 py-3 font-medium">Registro</th>
              <th className="px-4 py-3 font-medium">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Carregando…
                </td>
              </tr>
            )}

            {!carregando && resposta?.eventos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  <ScrollText className="mx-auto mb-2 size-8 opacity-40" aria-hidden />
                  Nenhum evento no período e nos filtros escolhidos.
                </td>
              </tr>
            )}

            {!carregando &&
              resposta?.eventos.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 last:border-0 dark:border-gray-700/60">
                  <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                    {new Date(e.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{e.usuarioNome ?? e.usuarioLogin ?? '—'}</span>
                    {e.usuarioLogin && e.usuarioNome !== e.usuarioLogin && (
                      <span className="ml-1 text-gray-500">({e.usuarioLogin})</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        CORES_DO_TIPO[e.tipo] ?? CORES_DO_TIPO.USUARIO
                      }`}
                    >
                      {e.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium">{e.acao}</td>
                  <td className="px-4 py-2.5">{e.registro ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{e.detalhe ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {resposta && totalDePaginas > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Botao
            variante="neutro"
            disabled={pagina <= 1 || carregando}
            onClick={() => void buscar(pagina - 1)}
          >
            Anterior
          </Botao>
          <span className="text-sm text-gray-600 tabular-nums dark:text-gray-400">
            Página {pagina} de {totalDePaginas}
          </span>
          <Botao
            variante="neutro"
            disabled={pagina >= totalDePaginas || carregando}
            onClick={() => void buscar(pagina + 1)}
          >
            Próxima
          </Botao>
        </div>
      )}
    </div>
  );
}

function formatarDia(dia: string): string {
  const [ano, mes, d] = dia.split('-');
  return `${d}/${mes}/${ano}`;
}

function CampoDeFiltro({
  rotulo,
  tipo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  tipo: string;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{rotulo}</label>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#ecd31b] focus:outline-hidden dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      />
    </div>
  );
}

function Selecao({
  rotulo,
  valor,
  opcoes,
  aoMudar,
}: {
  rotulo: string;
  valor: string;
  opcoes: string[];
  aoMudar: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{rotulo}</label>
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-[#ecd31b] focus:outline-hidden dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
