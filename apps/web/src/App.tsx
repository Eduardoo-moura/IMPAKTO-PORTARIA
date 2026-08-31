/**
 * Roteamento e estado de sessão.
 *
 * Estrutura da Fase 0: sem sessão real ainda — o login e as permissões vêm da
 * API na Fase 1. O que já está de pé é a forma: sem usuário, só a tela de
 * acesso; com usuário, o layout com o menu montado a partir das permissões.
 *
 * As telas do módulo Portaria entram na Fase 2, nas rotas já reservadas.
 */

import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from './layouts/AppLayout.js';
import { Dashboard } from './paginas/Dashboard.js';
import { Login } from './paginas/Login.js';

type Sessao = { usuario: { nome: string; perfil: string }; permissoes: string[] };

/** Placeholder das telas da Fase 2 e 3, para a navegação já ser percorrível. */
function EmConstrucao({ titulo, fase }: { titulo: string; fase: string }) {
  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-3xl font-bold text-[#001b5c] dark:text-white">{titulo}</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        Entra na {fase}. As regras e os campos estão levantados em{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm dark:bg-gray-700">
          docs/00-LEVANTAMENTO-E-ARQUITETURA.md
        </code>
        .
      </p>
    </div>
  );
}

export function App() {
  const [sessao, setSessao] = useState<Sessao | null>(null);

  async function entrar({ login }: { login: string; senha: string }): Promise<void> {
    // Fase 1: POST /api/auth/login, que devolve usuário e permissões.
    setSessao({
      usuario: { nome: login.toUpperCase(), perfil: 'PORTARIA' },
      permissoes: [
        'portaria.dashboard.ver',
        'portaria.acesso.ver',
        'portaria.mercadoria.ver',
        'portaria.relatorio.emitir',
      ],
    });
  }

  if (!sessao) return <Login aoEntrar={entrar} />;

  return (
    <AppLayout
      usuario={sessao.usuario}
      permissoes={sessao.permissoes}
      // R32 — cancelar a troca mantém quem já estava: o sistema nunca fica
      // aberto sem usuário na sessão. O aviso de dados não salvos entra junto
      // com o formulário de entrada, na Fase 2.
      aoTrocarTurno={() => setSessao(null)}
    >
      <Routes>
        <Route path="/" element={<Dashboard indicadores={null} />} />
        <Route path="/portaria/movimento" element={<EmConstrucao titulo="Movimento" fase="Fase 2" />} />
        <Route path="/portaria/mercadorias" element={<EmConstrucao titulo="Mercadorias" fase="Fase 3" />} />
        <Route path="/portaria/relatorios" element={<EmConstrucao titulo="Relatórios" fase="Fase 3" />} />
        <Route path="/config/usuarios" element={<EmConstrucao titulo="Usuários" fase="Fase 1" />} />
        <Route path="/config/auditoria" element={<EmConstrucao titulo="Auditoria" fase="Fase 1" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}
