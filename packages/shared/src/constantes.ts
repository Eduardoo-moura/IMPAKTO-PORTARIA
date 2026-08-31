/**
 * Constantes de negócio, com a origem no sistema C#.
 * Alterar aqui muda o comportamento nos dois lados — e deve ser justificado.
 */

/** Grade do movimento mostra pendências sem saída dos últimos N dias (R11). */
export const DIAS_PENDENCIA_NA_GRADE = 3;

/** Lista de mercadorias mostra os últimos N dias (R25). */
export const DIAS_NA_LISTA_MERCADORIA = 7;

/** Visualizador de auditoria abre com os últimos N dias. */
export const DIAS_INICIAIS_AUDITORIA = 7;

/**
 * Limite de acompanhantes por acesso (R07). No desktop era estrutural — cinco
 * pares de colunas. Aqui é só validação: `acesso_acompanhante` não impõe limite.
 */
export const MAX_ACOMPANHANTES = 5;

/** Cores com significado operacional, herdadas do desktop. */
export const CORES = {
  pendenciaAntigaFundo: '#FFF2CC',
  pendenciaAntigaTexto: '#7C5E00',
  entregueFundo: '#C6EFCE',
  entregueTexto: '#006100',
  documentoInvalidoFundo: '#FFCDCD',
} as const;

/** Identidade visual da Impakto. */
export const MARCA = {
  azul: '#001b5c',
  amarelo: '#ecd31b',
} as const;

export const NIVEL_LEGADO = { TOTAL: 1, RESTRITO: 2 } as const;

export const PERFIS = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  PORTARIA: 'PORTARIA',
  GESTOR: 'GESTOR',
  CONSULTA: 'CONSULTA',
} as const;
export type Perfil = (typeof PERFIS)[keyof typeof PERFIS];

/** Tipos e ações da trilha de auditoria, iguais aos do desktop. */
export const AUDITORIA_TIPO = {
  ACESSO: 'ACESSO',
  VEICULO: 'VEICULO',
  MERCADORIA: 'MERCADORIA',
  USUARIO: 'USUARIO',
} as const;
export type AuditoriaTipo = (typeof AUDITORIA_TIPO)[keyof typeof AUDITORIA_TIPO];

export const AUDITORIA_ACAO = {
  LOGIN: 'LOGIN',
  LOGIN_RECUSADO: 'LOGIN RECUSADO',
  TROCA_DE_TURNO: 'TROCA DE TURNO',
  SAIDA_DO_SISTEMA: 'SAIDA DO SISTEMA',
  SESSAO_EXPIRADA: 'SESSAO EXPIRADA',
  ENTRADA_REGISTRADA: 'ENTRADA REGISTRADA',
  SAIDA_REGISTRADA: 'SAIDA REGISTRADA',
  SAIDA_SOBRESCRITA: 'SAIDA SOBRESCRITA',
  CHEGADA_REGISTRADA: 'CHEGADA REGISTRADA',
  ENTREGA_CONFIRMADA: 'ENTREGA CONFIRMADA',
  ENTREGA_DESFEITA: 'ENTREGA DESFEITA',
  USUARIO_CRIADO: 'USUARIO CRIADO',
  USUARIO_ALTERADO: 'USUARIO ALTERADO',
  SENHA_ALTERADA: 'SENHA ALTERADA',
  NIVEL_ALTERADO: 'NIVEL ALTERADO',
  USUARIO_ATIVADO: 'USUARIO ATIVADO',
  USUARIO_DESATIVADO: 'USUARIO DESATIVADO',
} as const;
