-- ---------------------------------------------------------------------------
-- Row Level Security: nega tudo, sem nenhuma política.
--
-- POR QUE ISTO EXISTE
--
-- O Supabase publica automaticamente toda tabela do schema `public` através da
-- API REST (PostgREST), usando a chave `anon` — que é pública por design e vai
-- embutida em qualquer frontend. Sem RLS, essa chave leria a tabela `pessoa`
-- inteira: CPF, RG, nome e celular de ~12.800 pessoas, sem autenticação
-- nenhuma.
--
-- Habilitar RLS sem criar política alguma é o que fecha essa porta: os papéis
-- `anon` e `authenticated` passam a não enxergar linha nenhuma.
--
-- E NÃO QUEBRA A APLICAÇÃO: o dono da tabela contorna RLS por padrão, e é como
-- o Prisma se conecta (`postgres` no Supabase, `impakto` no banco local). Toda
-- autorização continua sendo do backend, onde ela é testada — o RLS aqui é
-- barreira de defesa em profundidade contra uma porta que o Supabase abre
-- sozinho, não a camada de controle de acesso.
--
-- Ao acrescentar tabela nova, acrescente-a aqui também.
-- ---------------------------------------------------------------------------

ALTER TABLE perfil              ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissao           ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfil_permissao    ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario             ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria           ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresa             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoa              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipo_veiculo        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipo_veiculo_alias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE veiculo             ENABLE ROW LEVEL SECURITY;
ALTER TABLE acesso              ENABLE ROW LEVEL SECURITY;
ALTER TABLE acesso_acompanhante ENABLE ROW LEVEL SECURITY;
ALTER TABLE mercadoria          ENABLE ROW LEVEL SECURITY;
