/**
 * Hash de senha **compatível com o desktop C#** (R27).
 *
 * Formato armazenado: `PBKDF2$<iterações>$<salt b64>$<hash b64>`
 * Parâmetros: PBKDF2-SHA256, 50.000 iterações, salt de 16 bytes, hash de 32.
 * Origem: `Portaria/Seguranca.cs` (`Rfc2898DeriveBytes` com `HashAlgorithmName.SHA256`).
 *
 * Consequência prática: os 14 usuários da base atual migram **sem trocar de
 * senha**. Não alterar os parâmetros sem uma estratégia de re-hash no login.
 *
 * Só para o servidor — importa `node:crypto`. Não incluir no barril `index.ts`,
 * que também é consumido pelo frontend.
 */

import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivar = promisify(pbkdf2);

const ALGORITMO = 'PBKDF2';
const DIGEST = 'sha256';
const ITERACOES = 50_000;
const TAMANHO_SALT = 16;
const TAMANHO_HASH = 32;

/** Mínimo de 8 caracteres na web — o desktop aceitava 4. */
export const TAMANHO_MINIMO_SENHA = 8;

export async function gerarHash(senha: string): Promise<string> {
  const salt = randomBytes(TAMANHO_SALT);
  const hash = await derivar(senha ?? '', salt, ITERACOES, TAMANHO_HASH, DIGEST);
  return `${ALGORITMO}$${ITERACOES}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Comparação em tempo constante, com **falha fechada** em hash malformado —
 * mesmo comportamento de `Usuarios.SenhaConfere()`.
 */
export async function senhaConfere(senha: string, armazenado: string | null | undefined): Promise<boolean> {
  if (!armazenado) return false;

  const partes = armazenado.split('$');
  if (partes.length !== 4 || partes[0] !== ALGORITMO) return false;

  const iteracoes = Number.parseInt(partes[1]!, 10);
  if (!Number.isInteger(iteracoes) || iteracoes <= 0) return false;

  let salt: Buffer;
  let esperado: Buffer;
  try {
    salt = Buffer.from(partes[2]!, 'base64');
    esperado = Buffer.from(partes[3]!, 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || esperado.length === 0) return false;

  const calculado = await derivar(senha ?? '', salt, iteracoes, esperado.length, DIGEST);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

export function senhaAtendeAoMinimo(senha: string | null | undefined): boolean {
  return (senha ?? '').length >= TAMANHO_MINIMO_SENHA;
}
