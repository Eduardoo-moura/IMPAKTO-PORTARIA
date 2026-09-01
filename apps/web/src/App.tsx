/**
 * Roteamento e portões de acesso.
 *
 * Três estados, nesta ordem: sem sessão → login; sessão com troca de senha
 * pendente → troca obrigatória; sessão normal → o sistema.
 *
 * As telas do módulo Portaria entram na Fase 6, nas rotas já reservadas.
 */

import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from './layouts/AppLayout.js';
import { Auditoria } from './paginas/Auditoria.js';
import { Dashboard } from './paginas/Dashboard.js';
import { Login } from './paginas/Login.js';
import { TrocarSenha } from './paginas/TrocarSenha.js';
import { Usuarios } from './paginas/Usuarios.js';
import { useSessao } from './servicos/sessao.js';

/** Placeholder das fases seguintes, para a navegação já ser percorrível. */
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
  const { usuario, carregando, entrar, sair, trocarTurno } = useSessao();

  // Enquanto o /refresh não responde, não dá para saber se há sessão — mostrar
  // o login aqui faria a tela piscar a cada F5 de quem já está autenticado.
  if (carregando) {
    return (
      <div className="grid min-h-full place-items-center bg-gray-50 dark:bg-black">
        <p className="text-gray-500 dark:text-gray-400">Carregando…</p>
      </div>
    );
  }

  if (!usuario) return <Login aoEntrar={({ login, senha }) => entrar(login, senha)} />;

  if (usuario.trocarSenha) return <TrocarSenha />;

  return (
    <AppLayout
      usuario={usuario}
      permissoes={usuario.permissoes}
      aoSair={sair}
      aoTrocarTurno={trocarTurno}
    >
      <Routes>
        <Route path="/" element={<Dashboard indicadores={null} />} />
        <Route path="/portaria/movimento" element={<EmConstrucao titulo="Movimento" fase="Fase 6" />} />
        <Route path="/portaria/mercadorias" element={<EmConstrucao titulo="Mercadorias" fase="Fase 6" />} />
        <Route path="/portaria/relatorios" element={<EmConstrucao titulo="Relatórios" fase="Fase 6" />} />
        <Route path="/config/usuarios" element={<Usuarios />} />
        <Route path="/config/auditoria" element={<Auditoria />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}
