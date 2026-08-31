/**
 * Contratos HTTP do módulo de autenticação.
 *
 * Um schema Zod serve para validar a entrada, tipar o handler e gerar a
 * documentação OpenAPI — não há um segundo lugar para manter sincronizado.
 *
 * A senha NUNCA aparece numa resposta, e o hash não sai do serviço.
 */

import { z } from 'zod';

export const credenciaisSchema = z.object({
  login: z.string().min(1, 'Informe o usuário.').max(40),
  senha: z.string().min(1, 'Informe a senha.').max(200),
});

export const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual.').max(200),
  novaSenha: z.string().min(1, 'Informe a nova senha.').max(200),
});

export const sessaoSchema = z.object({
  id: z.string(),
  login: z.string(),
  nome: z.string(),
  perfil: z.string(),
  /** Quando true, o cliente deve levar para a troca de senha antes de seguir. */
  trocarSenha: z.boolean(),
  permissoes: z.array(z.string()),
});

export const respostaDeLoginSchema = z.object({
  token: z.string(),
  usuario: sessaoSchema,
});

export const erroSchema = z.object({
  erro: z.object({
    codigo: z.string(),
    mensagem: z.string(),
    campos: z.array(z.object({ campo: z.string(), mensagem: z.string() })).optional(),
  }),
});

export type Credenciais = z.infer<typeof credenciaisSchema>;
