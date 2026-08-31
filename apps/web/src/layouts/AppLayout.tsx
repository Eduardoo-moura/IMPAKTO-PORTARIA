/**
 * Layout do sistema: menu lateral + área de conteúdo.
 *
 * O menu é montado a partir das PERMISSÕES que a API devolve no login — um
 * setor novo aparece aqui sem alterar este arquivo. E esconder o item não é
 * autorização: o backend revalida toda ação (R29).
 *
 * O guia visual descreve um site com header fixo de 132px; isto é um sistema
 * de balcão e usa densidade maior. Ver §2 do levantamento.
 */

import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Moon,
  Repeat,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  Truck,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

import { TrocaDeTurno } from '../componentes/TrocaDeTurno.js';
import { aplicarTema, temaSalvo, type Tema } from '../tema.js';

export type ItemDeMenu = {
  rotulo: string;
  para: string;
  icone: LucideIcon;
  /** Chave de permissão exigida. Sem ela, o item não é renderizado. */
  permissao?: string;
};

export type GrupoDeMenu = { setor: string; itens: ItemDeMenu[] };

/**
 * Menu da fase 1. Compras, RH, TI e Financeiro entram como novos grupos,
 * sem tocar no que já existe.
 */
export const MENU: GrupoDeMenu[] = [
  {
    setor: 'Geral',
    itens: [{ rotulo: 'Painel', para: '/', icone: LayoutDashboard, permissao: 'portaria.dashboard.ver' }],
  },
  {
    setor: 'Portaria',
    itens: [
      { rotulo: 'Movimento', para: '/portaria/movimento', icone: Truck, permissao: 'portaria.acesso.ver' },
      { rotulo: 'Mercadorias', para: '/portaria/mercadorias', icone: Boxes, permissao: 'portaria.mercadoria.ver' },
      { rotulo: 'Relatórios', para: '/portaria/relatorios', icone: ClipboardList, permissao: 'portaria.relatorio.emitir' },
    ],
  },
  {
    setor: 'Configurações',
    itens: [
      { rotulo: 'Usuários', para: '/config/usuarios', icone: UserCog, permissao: 'usuario.ver' },
      { rotulo: 'Auditoria', para: '/config/auditoria', icone: ScrollText, permissao: 'auditoria.ver' },
    ],
  },
];

type Props = {
  children: ReactNode;
  usuario: { nome: string; perfil: string };
  permissoes: string[];
  aoSair: () => Promise<void>;
  aoTrocarTurno: (login: string, senha: string) => Promise<void>;
};

export function AppLayout({ children, usuario, permissoes, aoSair, aoTrocarTurno }: Props) {
  const [trocandoTurno, setTrocandoTurno] = useState(false);
  const podeVer = (item: ItemDeMenu): boolean => !item.permissao || permissoes.includes(item.permissao);

  const [tema, setTema] = useState<Tema>(temaSalvo);
  const escuro = document.documentElement.classList.contains('dark');

  function alternarTema() {
    const proximo: Tema = escuro ? 'claro' : 'escuro';
    aplicarTema(proximo);
    setTema(proximo);
  }

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col bg-[#001b5c] text-white md:flex dark:bg-gray-900">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#ecd31b]">
            <ShieldCheck className="size-5 text-black" aria-hidden />
          </span>
          <span className="text-sm font-bold tracking-widest uppercase">Impakto</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {MENU.map((grupo) => {
            const visiveis = grupo.itens.filter(podeVer);
            if (visiveis.length === 0) return null;

            return (
              <div key={grupo.setor} className="mb-5">
                <p className="mb-2 px-2 text-[11px] font-semibold tracking-[0.14em] text-blue-200 uppercase dark:text-gray-400">
                  {grupo.setor}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {visiveis.map((item) => (
                    <li key={item.para}>
                      <NavLink
                        to={item.para}
                        end={item.para === '/'}
                        className={({ isActive }) =>
                          [
                            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-[#ecd31b] text-black'
                              : 'text-blue-50 hover:bg-white/10 dark:text-gray-300 dark:hover:bg-white/5',
                          ].join(' ')
                        }
                      >
                        <item.icone className="size-5 shrink-0" aria-hidden />
                        {item.rotulo}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        {/*
          Troca de turno fica sempre visível, para todos os perfis. No desktop
          ela é um item próprio da barra pelo mesmo motivo: quem mais troca de
          turno é o nível 2, que sequer enxerga o menu de usuários (R32).
        */}
        <div className="border-t border-white/15 px-3 py-3">
          <div className="px-2 pb-2">
            <p className="truncate text-sm font-semibold">{usuario.nome}</p>
            <p className="text-xs text-blue-200 dark:text-gray-400">{usuario.perfil}</p>
          </div>
          <button
            type="button"
            onClick={() => setTrocandoTurno(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-50 transition-colors hover:bg-white/10 dark:text-gray-300"
          >
            <Repeat className="size-5 shrink-0" aria-hidden />
            Trocar turno
          </button>
          <button
            type="button"
            onClick={() => void aoSair()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-50 transition-colors hover:bg-white/10 dark:text-gray-300"
          >
            <LogOut className="size-5 shrink-0" aria-hidden />
            Sair
          </button>
          <button
            type="button"
            onClick={alternarTema}
            aria-pressed={escuro}
            title={tema === 'sistema' ? 'Seguindo o tema do sistema' : undefined}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-50 transition-colors hover:bg-white/10 dark:text-gray-300"
          >
            {escuro ? <Sun className="size-5 shrink-0" aria-hidden /> : <Moon className="size-5 shrink-0" aria-hidden />}
            {escuro ? 'Tema claro' : 'Tema escuro'}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 md:hidden dark:border-gray-700 dark:bg-gray-800">
          <Settings className="size-5 text-gray-500" aria-hidden />
          <span className="text-sm font-semibold">{usuario.nome}</span>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      <TrocaDeTurno
        aberto={trocandoTurno}
        deQuem={usuario.nome}
        aoFechar={() => setTrocandoTurno(false)}
        aoConfirmar={async (login, senha) => {
          await aoTrocarTurno(login, senha);
          setTrocandoTurno(false);
        }}
      />
    </div>
  );
}
