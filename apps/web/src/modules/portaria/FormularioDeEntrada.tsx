/**
 * Formulário de entrada — o que o porteiro usa com o caminhão parado no portão.
 *
 * Decisões que vêm do desktop e não são estéticas:
 *
 * - **Enter dispara a busca do campo em foco** (R20). Digitando no documento,
 *   Enter busca por documento; na placa, busca por placa. O porteiro não usa
 *   mouse.
 * - **Máscara de placa recusa a tecla inválida** (R21), sem beep — ver DV9.
 * - **Documento que não fecha pinta de rosa e avisa uma vez** (R04); nunca
 *   bloqueia a digitação.
 * - Busca por placa NÃO preenche a placa; por documento, preenche (R10).
 */

import {
  Building2,
  FileText,
  IdCard,
  Phone,
  Plus,
  Search,
  Truck,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  aplicarPlaca,
  avaliarDocumento,
  descricaoSituacao,
  MAX_ACOMPANHANTES,
  SituacaoDocumento,
} from '@impakto/shared';

import { Botao } from '../../componentes/Botao.js';
import { Campo } from '../../componentes/Campo.js';
import { Mensagem } from '../../componentes/Mensagem.js';
import { ErroDaApi } from '../../servicos/api.js';

export type Acompanhante = { nome: string; documento: string };

export type DadosDoFormulario = {
  nome: string;
  documento: string;
  celular: string;
  placa: string;
  tipoVeiculo: string;
  empresa: string;
  prestador: string;
  agregado: string;
  acompanhantes: Acompanhante[];
};

export const FORMULARIO_VAZIO: DadosDoFormulario = {
  nome: '',
  documento: '',
  celular: '',
  placa: '',
  tipoVeiculo: '',
  empresa: '',
  prestador: '',
  agregado: '',
  acompanhantes: [{ nome: '', documento: '' }],
};

/** Há algo digitado que seria perdido numa troca de turno (R32). */
export function temDadosNaTela(dados: DadosDoFormulario): boolean {
  const { acompanhantes, ...campos } = dados;
  return (
    Object.values(campos).some((v) => v.trim() !== '') ||
    acompanhantes.some((a) => a.nome.trim() !== '' || a.documento.trim() !== '')
  );
}

type Props = {
  dados: DadosDoFormulario;
  aoMudar: (dados: DadosDoFormulario) => void;
  aoBuscar: (por: 'placa' | 'documento', valor: string) => Promise<void>;
  aoSalvar: (confirmarDocumento: boolean) => Promise<void>;
  buscando: boolean;
  salvando: boolean;
  erro: string | null;
};

export function FormularioDeEntrada({
  dados,
  aoMudar,
  aoBuscar,
  aoSalvar,
  buscando,
  salvando,
  erro,
}: Props) {
  const [confirmacao, setConfirmacao] = useState<{ mensagem: string; campos: string[] } | null>(null);
  const campoDocumento = useRef<HTMLInputElement>(null);

  const set = <C extends keyof DadosDoFormulario>(campo: C, valor: DadosDoFormulario[C]) =>
    aoMudar({ ...dados, [campo]: valor });

  const situacaoDoDocumento = avaliarDocumento(dados.documento);
  const documentoNaoFecha = situacaoDoDocumento === SituacaoDocumento.CpfInvalido;

  /** R20 — Enter busca pelo campo em foco, em vez de submeter o formulário. */
  const enterBusca = (por: 'placa' | 'documento') => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const valor = por === 'placa' ? dados.placa : dados.documento;
    if (valor.trim()) void aoBuscar(por, valor);
  };

  async function enviar(evento: FormEvent, confirmarDocumento = false) {
    evento.preventDefault();

    // R04 — segunda barreira, igual ao diálogo do desktop: pergunta, com
    // "Não" como padrão, e grava se o porteiro insistir.
    if (!confirmarDocumento) {
      const suspeitos: string[] = [];
      if (documentoNaoFecha) suspeitos.push('do motorista');
      dados.acompanhantes.forEach((a, i) => {
        if (avaliarDocumento(a.documento) === SituacaoDocumento.CpfInvalido) {
          suspeitos.push(`do ${i + 1}º acompanhante`);
        }
      });

      if (suspeitos.length > 0) {
        setConfirmacao({
          mensagem:
            suspeitos.length === 1
              ? `O documento ${suspeitos[0]} tem 11 dígitos, mas não passa na conferência de CPF. Se for um RG, pode gravar assim mesmo.`
              : `Os documentos ${suspeitos.join(', ')} têm 11 dígitos e não passam na conferência de CPF. Se forem RG, pode gravar assim mesmo.`,
          campos: suspeitos,
        });
        return;
      }
    }

    setConfirmacao(null);
    await aoSalvar(confirmarDocumento);
  }

  function acrescentarAcompanhante() {
    if (dados.acompanhantes.length >= MAX_ACOMPANHANTES) return;
    set('acompanhantes', [...dados.acompanhantes, { nome: '', documento: '' }]);
  }

  function removerUltimoAcompanhante() {
    if (dados.acompanhantes.length <= 1) return;
    set('acompanhantes', dados.acompanhantes.slice(0, -1));
  }

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
      noValidate
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold tracking-widest text-gray-500 uppercase">Motorista</legend>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Campo
              rotulo="RG / CPF"
              name="documento"
              icone={IdCard}
              ref={campoDocumento}
              autoFocus
              required
              value={dados.documento}
              onChange={(e) => set('documento', e.target.value)}
              onKeyDown={enterBusca('documento')}
              aviso={documentoNaoFecha ? descricaoSituacao(situacaoDoDocumento) : undefined}
            />
          </div>
          <BotaoDeBusca
            titulo="Buscar por documento"
            carregando={buscando}
            onClick={() => void aoBuscar('documento', dados.documento)}
          />
        </div>

        <Campo
          rotulo="Nome"
          name="nome"
          icone={User}
          required
          value={dados.nome}
          onChange={(e) => set('nome', e.target.value)}
        />

        <Campo
          rotulo="Celular"
          name="celular"
          icone={Phone}
          inputMode="tel"
          value={dados.celular}
          onChange={(e) => set('celular', e.target.value)}
        />

        <Campo
          rotulo="Empresa"
          name="empresa"
          icone={Building2}
          value={dados.empresa}
          onChange={(e) => set('empresa', e.target.value)}
        />
      </fieldset>

      <fieldset className="mt-6 grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-bold tracking-widest text-gray-500 uppercase">Veículo</legend>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Campo
              rotulo="Placa"
              name="placa"
              icone={Truck}
              maxLength={20}
              value={dados.placa}
              // R21/R22 — a máscara só age no que o porteiro digita. Texto que
              // veio do banco (`GCT 6604`, `S/ PLACA`) não é remascarado.
              onChange={(e) => {
                const bruto = e.target.value.toUpperCase();
                const mascarada = aplicarPlaca(bruto);
                // Deixa passar texto livre quando claramente não é placa.
                set('placa', mascarada.length === bruto.replace(/[^A-Z0-9]/g, '').length ? mascarada : bruto);
              }}
              onKeyDown={enterBusca('placa')}
              dica="7 caracteres, ou texto livre como S/ PLACA."
            />
          </div>
          <BotaoDeBusca
            titulo="Buscar por placa"
            carregando={buscando}
            onClick={() => void aoBuscar('placa', dados.placa)}
          />
        </div>

        <Campo
          rotulo="Tipo de veículo"
          name="tipoVeiculo"
          icone={FileText}
          value={dados.tipoVeiculo}
          onChange={(e) => set('tipoVeiculo', e.target.value)}
        />

        <SimNao rotulo="Prestador" valor={dados.prestador} aoMudar={(v) => set('prestador', v)} />
        <SimNao rotulo="Agregado" valor={dados.agregado} aoMudar={(v) => set('agregado', v)} />
      </fieldset>

      <fieldset className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <legend className="text-sm font-bold tracking-widest text-gray-500 uppercase">
            Acompanhantes
          </legend>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={acrescentarAcompanhante}
              disabled={dados.acompanhantes.length >= MAX_ACOMPANHANTES}
              title={`Acrescentar acompanhante (máximo ${MAX_ACOMPANHANTES})`}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Plus className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={removerUltimoAcompanhante}
              disabled={dados.acompanhantes.length <= 1}
              title="Remover o último"
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="grid gap-4">
          {dados.acompanhantes.map((a, i) => {
            const suspeito = avaliarDocumento(a.documento) === SituacaoDocumento.CpfInvalido;
            return (
              <div key={i} className="grid gap-4 sm:grid-cols-2">
                <Campo
                  rotulo={`RG / CPF do ${i + 1}º`}
                  name={`acompanhante-${i}-documento`}
                  icone={IdCard}
                  value={a.documento}
                  onChange={(e) => {
                    const lista = [...dados.acompanhantes];
                    lista[i] = { ...lista[i]!, documento: e.target.value };
                    set('acompanhantes', lista);
                  }}
                  aviso={suspeito ? 'Tem 11 dígitos e não fecha como CPF. Se for RG, pode gravar.' : undefined}
                />
                <Campo
                  rotulo={`Nome do ${i + 1}º`}
                  name={`acompanhante-${i}-nome`}
                  icone={UserPlus}
                  value={a.nome}
                  onChange={(e) => {
                    const lista = [...dados.acompanhantes];
                    lista[i] = { ...lista[i]!, nome: e.target.value };
                    set('acompanhantes', lista);
                  }}
                />
              </div>
            );
          })}
        </div>
      </fieldset>

      {erro && (
        <div className="mt-5">
          <Mensagem tipo="erro" texto={erro} />
        </div>
      )}

      {confirmacao && (
        <div className="mt-5 rounded-lg border border-[#7c5e00]/30 bg-[#fff2cc] p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <p className="font-medium text-[#7c5e00] dark:text-yellow-300">{confirmacao.mensagem}</p>
          <p className="mt-1 text-sm text-[#7c5e00] dark:text-yellow-300">Gravar assim mesmo?</p>
          <div className="mt-3 flex gap-3">
            {/* "Não" primeiro e em destaque: é o padrão do diálogo do desktop. */}
            <Botao type="button" variante="neutro" onClick={() => setConfirmacao(null)}>
              Não, vou conferir
            </Botao>
            <Botao type="button" variante="solido" carregando={salvando} onClick={(e) => void enviar(e, true)}>
              Sim, gravar
            </Botao>
          </div>
        </div>
      )}

      <div className="mt-6">
        <Botao type="submit" variante="solido" carregando={salvando} className="w-full py-4 text-xl">
          Registrar entrada
        </Botao>
      </div>
    </form>
  );
}

function BotaoDeBusca({
  titulo,
  carregando,
  onClick,
}: {
  titulo: string;
  carregando: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={carregando}
      title={titulo}
      aria-label={titulo}
      className="mb-0.5 rounded-lg bg-[#001b5c] p-3 text-white transition-colors hover:brightness-125 disabled:opacity-50 dark:bg-gray-700"
    >
      <Search className="size-5" aria-hidden />
    </button>
  );
}

/**
 * R: `PRESTADOR` e `AGREGADO` têm TRÊS estados reais — sim, não e "não
 * informado". Na base, 3.039 registros têm o campo vazio; um checkbox
 * inventaria a informação para eles.
 */
function SimNao({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">{rotulo}</label>
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg focus:ring-2 focus:ring-[#ecd31b] focus:outline-hidden dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option value="">Não informado</option>
        <option value="sim">SIM</option>
        <option value="nao">NÃO</option>
      </select>
    </div>
  );
}
