/**
 * Sessão do usuário no frontend.
 *
 * O token de acesso fica **em memória**, não em `localStorage`: o refresh vive
 * num cookie httpOnly que o JavaScript da página não alcança, e guardar o
 * token junto anularia a proteção. Ao recarregar a página, `/refresh`
 * reconstrói a sessão a partir do cookie.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { chamar, ErroDaApi } from './api.js';

export type Usuario = {
  id: string;
  login: string;
  nome: string;
  perfil: string;
  trocarSenha: boolean;
  permissoes: string[];
};

type RespostaDeLogin = { token: string; usuario: Usuario };

type ContextoDeSessao = {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (login: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  trocarTurno: (login: string, senha: string) => Promise<void>;
  trocarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>;
  pode: (permissao: string) => boolean;
};

const Contexto = createContext<ContextoDeSessao | null>(null);

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const token = useRef<string | null>(null);

  const guardar = useCallback((resposta: RespostaDeLogin) => {
    token.current = resposta.token;
    setUsuario(resposta.usuario);
  }, []);

  // Ao abrir a página, tenta reconstruir a sessão a partir do cookie.
  useEffect(() => {
    chamar<RespostaDeLogin>('/auth/refresh', { metodo: 'POST' })
      .then(guardar)
      .catch(() => setUsuario(null))
      .finally(() => setCarregando(false));
  }, [guardar]);

  const entrar = useCallback(
    async (login: string, senha: string) => {
      guardar(await chamar<RespostaDeLogin>('/auth/login', { metodo: 'POST', corpo: { login, senha } }));
    },
    [guardar],
  );

  const sair = useCallback(async () => {
    try {
      await chamar('/auth/logout', { metodo: 'POST', token: token.current });
    } catch (erro) {
      // Se a sessão já tinha expirado, o logout local vale do mesmo jeito.
      if (!(erro instanceof ErroDaApi) || erro.status !== 401) throw erro;
    }
    token.current = null;
    setUsuario(null);
  }, []);

  /**
   * R32 — Troca de turno.
   * Se as credenciais de quem assume falharem, a API devolve 401 e **nada
   * muda**: quem já estava continua na sessão. O aviso de dados não salvos é
   * responsabilidade da tela que tem o formulário.
   */
  const trocarTurno = useCallback(
    async (login: string, senha: string) => {
      guardar(
        await chamar<RespostaDeLogin>('/auth/trocar-turno', {
          metodo: 'POST',
          corpo: { login, senha },
          token: token.current,
        }),
      );
    },
    [guardar],
  );

  const trocarSenha = useCallback(async (senhaAtual: string, novaSenha: string) => {
    await chamar('/auth/trocar-senha', {
      metodo: 'POST',
      corpo: { senhaAtual, novaSenha },
      token: token.current,
    });
    setUsuario((atual) => (atual ? { ...atual, trocarSenha: false } : atual));
  }, []);

  /**
   * R29 — primeira camada. Esconder o que o usuário não pode usar é
   * conveniência; a autorização de verdade é do backend, que revalida.
   */
  const pode = useCallback(
    (permissao: string) => !!usuario?.permissoes.includes(permissao),
    [usuario],
  );

  const valor = useMemo(
    () => ({ usuario, carregando, entrar, sair, trocarTurno, trocarSenha, pode }),
    [usuario, carregando, entrar, sair, trocarTurno, trocarSenha, pode],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): ContextoDeSessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessao precisa estar dentro de <ProvedorDeSessao>.');
  return contexto;
}
