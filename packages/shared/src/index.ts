/**
 * Regras compartilhadas entre a API e o frontend.
 *
 * Tudo aqui é **isomórfico** — sem `node:` e sem DOM — para o mesmo código
 * validar no servidor e mascarar no navegador. O hash de senha vive em
 * `@impakto/shared/senha`, fora deste barril, porque depende de `node:crypto`.
 */

export * from './placa.js';
export * from './documento.js';
export * from './texto.js';
export * from './datas.js';
export * from './constantes.js';
