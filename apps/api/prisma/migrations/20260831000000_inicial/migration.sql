-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "perfil" (
    "id" BIGSERIAL NOT NULL,
    "nome" VARCHAR(40) NOT NULL,
    "descricao" TEXT,
    "de_sistema" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissao" (
    "id" BIGSERIAL NOT NULL,
    "chave" VARCHAR(80) NOT NULL,
    "modulo" VARCHAR(40) NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "permissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_permissao" (
    "perfil_id" BIGINT NOT NULL,
    "permissao_id" BIGINT NOT NULL,

    CONSTRAINT "perfil_permissao_pkey" PRIMARY KEY ("perfil_id","permissao_id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" BIGSERIAL NOT NULL,
    "login" VARCHAR(40) NOT NULL,
    "login_norm" VARCHAR(40) NOT NULL,
    "nome" TEXT,
    "senha_hash" TEXT NOT NULL,
    "perfil_id" BIGINT NOT NULL,
    "nivel_legado" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "trocar_senha" BOOLEAN NOT NULL DEFAULT false,
    "ultimo_login_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" BIGSERIAL NOT NULL,
    "em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" BIGINT,
    "usuario_login" VARCHAR(40),
    "usuario_nome" TEXT,
    "tipo" VARCHAR(20) NOT NULL,
    "acao" VARCHAR(40) NOT NULL,
    "registro" TEXT,
    "detalhe" TEXT,
    "dados" JSONB,
    "ip" VARCHAR(45),
    "maquina" TEXT,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresa" (
    "id" BIGSERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "nome_norm" TEXT NOT NULL,
    "cnpj" VARCHAR(14),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoa" (
    "id" BIGSERIAL NOT NULL,
    "documento" TEXT NOT NULL,
    "documento_norm" TEXT NOT NULL,
    "tipo_documento" VARCHAR(10) NOT NULL,
    "nome" TEXT NOT NULL,
    "celular" VARCHAR(20),
    "empresa_id" BIGINT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_veiculo" (
    "id" BIGSERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_veiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_veiculo_alias" (
    "alias" TEXT NOT NULL,
    "tipo_id" BIGINT NOT NULL,

    CONSTRAINT "tipo_veiculo_alias_pkey" PRIMARY KEY ("alias")
);

-- CreateTable
CREATE TABLE "veiculo" (
    "id" BIGSERIAL NOT NULL,
    "placa" TEXT NOT NULL,
    "placa_norm" TEXT NOT NULL,
    "tipo_id" BIGINT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "veiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acesso" (
    "id" BIGSERIAL NOT NULL,
    "pessoa_id" BIGINT NOT NULL,
    "veiculo_id" BIGINT,
    "empresa_id" BIGINT,
    "nome_snapshot" TEXT NOT NULL,
    "documento_snapshot" TEXT NOT NULL,
    "placa_snapshot" TEXT,
    "empresa_snapshot" TEXT,
    "tipo_veiculo_snapshot" TEXT,
    "celular_snapshot" TEXT,
    "entrada_em" TIMESTAMPTZ(3),
    "saida_em" TIMESTAMPTZ(3),
    "prestador" BOOLEAN,
    "agregado" BOOLEAN,
    "usuario_entrada_id" BIGINT,
    "usuario_entrada_login" VARCHAR(40),
    "usuario_saida_id" BIGINT,
    "origem" VARCHAR(20) NOT NULL DEFAULT 'WEB',
    "legado_id" BIGINT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acesso_acompanhante" (
    "id" BIGSERIAL NOT NULL,
    "acesso_id" BIGINT NOT NULL,
    "pessoa_id" BIGINT,
    "documento_snapshot" TEXT,
    "nome_snapshot" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "acesso_acompanhante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mercadoria" (
    "id" BIGSERIAL NOT NULL,
    "chegada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "destinatario" TEXT NOT NULL,
    "empresa_id" BIGINT,
    "empresa_snapshot" TEXT,
    "entregador" TEXT,
    "usuario_registro_id" BIGINT,
    "entregue_em" TIMESTAMPTZ(3),
    "retirado_por" TEXT,
    "usuario_entrega_id" BIGINT,

    CONSTRAINT "mercadoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfil_nome_key" ON "perfil"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "permissao_chave_key" ON "permissao"("chave");

-- CreateIndex
CREATE INDEX "permissao_modulo_idx" ON "permissao"("modulo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_login_norm_key" ON "usuario"("login_norm");

-- CreateIndex
CREATE INDEX "auditoria_em_idx" ON "auditoria"("em" DESC);

-- CreateIndex
CREATE INDEX "auditoria_usuario_login_em_idx" ON "auditoria"("usuario_login", "em" DESC);

-- CreateIndex
CREATE INDEX "auditoria_tipo_em_idx" ON "auditoria"("tipo", "em" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "empresa_nome_norm_key" ON "empresa"("nome_norm");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_documento_norm_key" ON "pessoa"("documento_norm");

-- CreateIndex
CREATE INDEX "pessoa_nome_idx" ON "pessoa"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_veiculo_nome_key" ON "tipo_veiculo"("nome");

-- CreateIndex
CREATE INDEX "veiculo_placa_norm_idx" ON "veiculo"("placa_norm");

-- CreateIndex
CREATE UNIQUE INDEX "acesso_legado_id_key" ON "acesso"("legado_id");

-- CreateIndex
CREATE INDEX "acesso_entrada_em_idx" ON "acesso"("entrada_em" DESC);

-- CreateIndex
CREATE INDEX "acesso_pessoa_id_entrada_em_idx" ON "acesso"("pessoa_id", "entrada_em" DESC);

-- CreateIndex
CREATE INDEX "acesso_veiculo_id_entrada_em_idx" ON "acesso"("veiculo_id", "entrada_em" DESC);

-- CreateIndex
CREATE INDEX "acesso_acompanhante_acesso_id_idx" ON "acesso_acompanhante"("acesso_id");

-- CreateIndex
CREATE UNIQUE INDEX "acesso_acompanhante_acesso_id_ordem_key" ON "acesso_acompanhante"("acesso_id", "ordem");

-- CreateIndex
CREATE INDEX "mercadoria_chegada_em_idx" ON "mercadoria"("chegada_em" DESC);

-- AddForeignKey
ALTER TABLE "perfil_permissao" ADD CONSTRAINT "perfil_permissao_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_permissao" ADD CONSTRAINT "perfil_permissao_permissao_id_fkey" FOREIGN KEY ("permissao_id") REFERENCES "permissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa" ADD CONSTRAINT "pessoa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipo_veiculo_alias" ADD CONSTRAINT "tipo_veiculo_alias_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipo_veiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "veiculo" ADD CONSTRAINT "veiculo_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipo_veiculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso" ADD CONSTRAINT "acesso_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso" ADD CONSTRAINT "acesso_veiculo_id_fkey" FOREIGN KEY ("veiculo_id") REFERENCES "veiculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso" ADD CONSTRAINT "acesso_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso" ADD CONSTRAINT "acesso_usuario_entrada_id_fkey" FOREIGN KEY ("usuario_entrada_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso" ADD CONSTRAINT "acesso_usuario_saida_id_fkey" FOREIGN KEY ("usuario_saida_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso_acompanhante" ADD CONSTRAINT "acesso_acompanhante_acesso_id_fkey" FOREIGN KEY ("acesso_id") REFERENCES "acesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acesso_acompanhante" ADD CONSTRAINT "acesso_acompanhante_pessoa_id_fkey" FOREIGN KEY ("pessoa_id") REFERENCES "pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mercadoria" ADD CONSTRAINT "mercadoria_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mercadoria" ADD CONSTRAINT "mercadoria_usuario_registro_id_fkey" FOREIGN KEY ("usuario_registro_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mercadoria" ADD CONSTRAINT "mercadoria_usuario_entrega_id_fkey" FOREIGN KEY ("usuario_entrega_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Restrições que o Prisma não declara no schema, acrescentadas à mão.
-- Sem elas o banco aceita exatamente os defeitos que o desktop deixou passar.
-- Ao alterar o schema, gere a próxima migration com `--create-only` e confira
-- que estas continuam de pé.
-- ---------------------------------------------------------------------------

-- R17 — saída nunca anterior à entrada.
-- O desktop não valida nada disso. Medição de 31/08/2026: 0 violações na base
-- atual, então a migração não deve reprovar nenhuma linha por este motivo.
ALTER TABLE acesso
  ADD CONSTRAINT ck_saida_apos_entrada
  CHECK (saida_em IS NULL OR entrada_em IS NULL OR saida_em >= entrada_em);

-- Entrega coerente: ou está entregue com quem retirou, ou não está entregue.
ALTER TABLE mercadoria
  ADD CONSTRAINT ck_entrega_coerente
  CHECK ((entregue_em IS NULL AND retirado_por IS NULL)
      OR (entregue_em IS NOT NULL AND retirado_por IS NOT NULL));

-- Índice parcial: "quem está dentro agora".
-- É a consulta mais quente do sistema (grade do movimento, dashboard) e a
-- razão de o provider ser PostgreSQL — SQLite não tem índice parcial.
CREATE INDEX ix_acesso_dentro
  ON acesso (entrada_em DESC)
  WHERE saida_em IS NULL;

-- Índice parcial: mercadorias ainda na portaria.
CREATE INDEX ix_mercadoria_pendente
  ON mercadoria (chegada_em DESC)
  WHERE entregue_em IS NULL;
