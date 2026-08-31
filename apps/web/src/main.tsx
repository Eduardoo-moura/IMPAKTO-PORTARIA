import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App.js';
import { ProvedorDeSessao } from './servicos/sessao.js';
import { aplicarTema, observarSistema } from './tema.js';
import './estilos/global.css';

// Antes de renderizar, para a tela não piscar no tema errado.
aplicarTema();
observarSistema();

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      // A grade do movimento será atualizada por push (WebSocket), não por
      // polling — o desktop tinha um timer de 5s que sequer estava ligado.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
        <ProvedorDeSessao>
          <App />
        </ProvedorDeSessao>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
