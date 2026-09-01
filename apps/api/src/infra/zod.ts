/**
 * Tipos de query string que o Zod não traz prontos.
 */

import { z } from 'zod';

/**
 * Booleano vindo de query string.
 *
 * `z.coerce.boolean()` NÃO serve aqui: ele aplica `Boolean(valor)`, e
 * `Boolean('false')` é `true` — ou seja, `?incluirInativos=false` ligava o
 * filtro em vez de desligá-lo. Qualquer flag de query precisa passar por aqui.
 */
export const booleanoDeQuery = (padrao: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(padrao ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');
