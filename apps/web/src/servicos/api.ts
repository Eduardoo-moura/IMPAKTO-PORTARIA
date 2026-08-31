/**
 * Cliente HTTP da API.
 *
 * Único ponto de saída do frontend. Nada de SQL nem regra de negócio aqui —
 * a validação do cliente é conveniência; a decisão é sempre do servidor.
 */

export type CampoInvalido = { campo: string; mensagem: string };

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly campos?: CampoInvalido[],
    readonly contexto?: Record<string, unknown>,
  ) {
    super(mensagem);
    this.name = 'ErroDaApi';
  }

  /** 409 do servidor: a operação é possível, mas exige confirmação (R16). */
  get exigeConfirmacao(): boolean {
    return this.status === 409;
  }
}

type Opcoes = {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  corpo?: unknown;
  sinal?: AbortSignal;
  /** Token de acesso, mantido em memória pelo provedor de sessão. */
  token?: string | null;
};

export async function chamar<T>(
  caminho: string,
  { metodo = 'GET', corpo, sinal, token }: Opcoes = {},
): Promise<T> {
  const cabecalhos: Record<string, string> = {};
  if (corpo) cabecalhos['Content-Type'] = 'application/json';
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  const resposta = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo ? JSON.stringify(corpo) : undefined,
    credentials: 'include',
    signal: sinal,
  });

  if (resposta.status === 204) return undefined as T;

  const conteudo = resposta.headers.get('content-type') ?? '';
  const corpoResposta: unknown = conteudo.includes('application/json') ? await resposta.json() : null;

  if (!resposta.ok) {
    const erro = (corpoResposta as { erro?: { codigo?: string; mensagem?: string; campos?: CampoInvalido[]; contexto?: Record<string, unknown> } })?.erro;
    throw new ErroDaApi(
      resposta.status,
      erro?.codigo ?? 'ERRO_DESCONHECIDO',
      erro?.mensagem ?? 'Não foi possível completar a operação. Tente novamente.',
      erro?.campos,
      erro?.contexto,
    );
  }

  return corpoResposta as T;
}
