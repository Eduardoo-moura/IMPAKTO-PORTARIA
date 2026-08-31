/**
 * Tema claro/escuro por classe `.dark` no <html>, como o guia da identidade
 * especifica — e não por `prefers-color-scheme`.
 *
 * A diferença importa no balcão: a preferência do sistema operacional da
 * estação raramente é a que o porteiro quer, e a portaria opera nos três
 * turnos. A escolha fica guardada por máquina.
 */

const CHAVE = 'impakto:tema';

export type Tema = 'claro' | 'escuro' | 'sistema';

function preferenciaDoSistema(): 'claro' | 'escuro' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function temaSalvo(): Tema {
  try {
    const valor = localStorage.getItem(CHAVE);
    return valor === 'claro' || valor === 'escuro' ? valor : 'sistema';
  } catch {
    // Navegador com armazenamento bloqueado: cai no padrão, sem quebrar a tela.
    return 'sistema';
  }
}

export function aplicarTema(tema: Tema = temaSalvo()): void {
  const efetivo = tema === 'sistema' ? preferenciaDoSistema() : tema;
  document.documentElement.classList.toggle('dark', efetivo === 'escuro');
  document.documentElement.style.colorScheme = efetivo === 'escuro' ? 'dark' : 'light';

  try {
    if (tema === 'sistema') localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, tema);
  } catch {
    /* sem armazenamento: o tema vale só para esta sessão */
  }
}

/** Acompanha a troca no sistema operacional enquanto a escolha for "sistema". */
export function observarSistema(): void {
  window
    .matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (temaSalvo() === 'sistema') aplicarTema('sistema');
    });
}
