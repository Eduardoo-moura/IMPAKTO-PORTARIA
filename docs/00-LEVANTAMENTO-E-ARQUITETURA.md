# IMPAKTO PORTARIA WEB — Levantamento, Arquitetura e Plano de Migração

**Data:** 31/08/2026 · **Fase:** 1 e 2 (análise + arquitetura) · **Status:** aguardando validação

Fontes de verdade: `PORTARIA - V2/docs/PROJETO-WEB.md`, `identidade-visual (2).md`,
`BANCOS.md`, `TELA-CADASTRO-VEICULO.md`, o código em `PORTARIA - V2/src/Portaria/`
e a **medição direta** do banco `src/Portaria/bin/Debug/ControleAcesso.db` (somente leitura).

Nenhuma linha de código de aplicação foi escrita ainda. Este documento é o entregável da análise.

---

## 1. ETAPA 2 — Levantamento do sistema atual

### 1.1 Funcionalidades reais (quatro fluxos, não mais)

| # | Fluxo | Tela C# | Observação |
|---|---|---|---|
| 1 | Acesso de veículos (entrada, busca, pré-preenchimento, histórico, saída) | `Frm_Veiculo.cs` (1.375 linhas) | Tela principal; fechá-la encerra o app |
| 2 | Mercadorias na portaria (chegada, retirada, desfazer) | `Frm_Mercadoria.cs` | Módulo novo |
| 3 | Auditoria (trilha append-only) | `Auditoria.cs` + `Frm_Auditoria.cs` | Único módulo com índices no banco |
| 4 | Relatórios PDF (por data, personalizado, mercadorias) | `Frm_relatorio_*.cs` | QuestPDF |
| — | Usuários (CRUD, níveis, ativar/inativar) | `Frm_Usuarios.cs` | Nível 1 apenas |
| — | Login e troca de turno | `Frm_Login.cs` + `Frm_Veiculo.TrocarUsuario()` | |

**Agendamento NÃO existe.** O módulo foi removido do código (commit `f87a624`, 27/08/2026).
A estrutura sugerida no briefing lista "Agendamentos" dentro de Portaria — **não há nada para
migrar**. Ver DECISÃO A VALIDAR nº 7.

**Fornecedores / prestadores / visitantes não são cadastros.** "Prestador" e "Agregado" são
apenas dois campos texto (`SIM`/`NAO`) na linha do acesso. Não existe cadastro de pessoas,
veículos, empresas nem fornecedores no sistema atual.

### 1.2 Banco atual — medição de 31/08/2026 (recontagem própria)

| Tabela | Linhas | Situação |
|---|---|---|
| `Veiculo` | **24.791** | Tabela achatada de eventos. **Zero índices** além da PK |
| `CONTROLE` | 37.534 | Planilha legada, 255 colunas `field*`. Nenhum código lê. **Não migrar** |
| `USUARIO` | **14** | 2 usuários nível 1 (`admin`, `GUIMARAES`), 12 nível 2, todos ativos |
| `MERCADORIA` | **0** | Módulo existe no código, **sem nenhum registro gravado** |
| `AUDITORIA` | **15** | Recém-ativada |
| `AGENDAMENTO` | 2 | Tabela órfã. **Não migrar** |

Qualidade dos dados em `Veiculo` (medido, não estimado):

| Métrica | Valor |
|---|---|
| Com `DataHora` preenchida | 13.534 |
| Sem `DataHora` (importação legada) | 11.257 |
| Com `SAIDA` preenchida | 12.104 |
| Entradas com data e sem saída | 1.430 |
| Período com data | 30/03/2026 15:21 → 28/08/2026 14:08 |
| Placas distintas (texto cru) | 10.629 |
| Placas distintas (**normalizadas**) | **9.932** |
| Documentos de motorista distintos | 12.826 |
| Empresas distintas (com `TRIM`) | 3.514 |
| Registros com ajudante 1 | 3.379 |
| Registros com ajudante 2..5 | **0** |
| `USUARIOENTRADA` preenchido | **0** |

`PRESTADOR`: `NULL` 11.257 · `SIM` 7.150 · `NAO` 3.345 · `''` 3.039 — **quatro estados**.
`AGREGADO`: `NULL` 11.257 · `SIM` 7.026 · `NÃO` 4.267 (com til) · `''` 2.241.

### 1.3 Divergências entre a documentação e o banco/código real

Correções factuais — a documentação existente está desatualizada nestes pontos.

| # | O que a doc diz | O que foi medido | Consequência |
|---|---|---|---|
| D1 | `PROJETO-WEB.md` §6.4: "é por isso que existe saída anterior à entrada na base" | **0 registros** com `saida_em < entrada_em`. E **0 saídas** fora do formato `dd/MM/yyyy HH:mm:ss` | O `CHECK ck_saida_apos_entrada` não vai reprovar nada hoje. A rede de segurança continua valendo, mas não haverá pendências por esse motivo |
| D2 | `PROJETO-WEB.md` §4.5: "Um `Timer` de 5 segundos recarrega a grade inteira" | `TELA-CADASTRO-VEICULO.md` §11 e o Designer: `time_veiculo.Enabled` **nunca é ligado** — o auto-refresh não roda | Hoje o porteiro atualiza **na mão**. Push por WebSocket é ganho real, não paridade |
| D3 | `TELA-CADASTRO-VEICULO.md` §3: "a base já tem 48 documentos nessa situação" | **72** documentos de motorista com 11 dígitos e DV inválido, **+22** de ajudantes = **94** | O 72 do `PROJETO-WEB.md` está certo para motoristas; os ajudantes foram esquecidos |
| D4 | `PROJETO-WEB.md` §3.7: "846 documentos distintos gravados com pontuação" | Critério `. - / espaço`: **518** de motorista + **33** de ajudante = 551 | Critério de contagem divergente. **Recontar com o mesmo critério** antes de usar como gate |
| D5 | `PROJETO-WEB.md` §7 passo 9: migrar `MERCADORIA` | `MERCADORIA` tem **0 linhas** | Não há dado de mercadoria para migrar. O módulo web nasce vazio |
| D6 | Briefing: estrutura com "Agendamentos" na Portaria | Módulo removido do C#; tabela órfã com 2 linhas | Não implementar na fase 1 sem requisito novo |

### 1.4 Regras de negócio a preservar

Formato: **regra → origem → implementação web**. Cada uma vira um teste automatizado.

**R01 — Placa: dois formatos, 7 caracteres, sem separador.**
*Origem:* `Mascaras.cs` classe `Placa` (`Tamanho = 7`, `CaractereValido` por posição: 0-2 letra, 3 dígito, 4 letra **ou** dígito, 5-6 dígito).
*Web:* `shared/validators/placa.ts` — `aplicar()`, `completa()`, `normalizar()` portadas 1:1. Usadas no backend e no frontend.

**R02 — Placa não é obrigatória e texto livre é aceito.**
*Origem:* `btn_Salvar` passo 4 — placa completa grava normalizada, senão grava como digitado (`S/ PLACA`).
*Web:* mesma lógica; `placa` opcional; `placa_norm` derivada e indexada.

**R03 — Busca por placa compara valor normalizado.**
*Origem:* SQL com `REPLACE(REPLACE(REPLACE(REPLACE(UPPER(...),' ',''),'-',''),'/',''),'.','')`.
*Web:* coluna persistida `placa_norm` **com índice** — normalizar em runtime impede uso de índice (requisito < 300 ms).

**R04 — Documento aceita RG ou CPF; a conferência AVISA, nunca impede.**
*Origem:* `DocumentoAceito` / `DocumentosDosAjudantesAceitos`; commit `55023a6`.
*Web:* API retorna `avisos[]` em vez de 400. Cliente exibe "Gravar assim mesmo?" (padrão = Não) e reenvia com `confirmarDocumento: true`. **Nunca bloquear** — 94 documentos legados dependem disso.

**R05 — CPF só é conferido se tiver exatamente 11 dígitos; DV módulo 11; rejeita dígitos repetidos.**
*Origem:* `Documento.PareceCpf` / `CpfValido` / `DigitoVerificador`.
*Web:* porte literal. Validar **só na escrita**, nunca na leitura.

**R06 — Entrada: `NOME` e `RG/CPF` obrigatórios; todo o resto opcional.**
*Origem:* `btn_Salvar` passos 1 e 2. *Web:* schema Zod com exatamente esses dois obrigatórios.

**R07 — Até 5 ajudantes, compactados sem buracos.**
*Origem:* `MaxAjudantes = 5`; `AjudantesPreenchidos()` compacta (preencheu a aba 3 e deixou a 2 vazia → vira ajudante 2).
*Web:* `acesso_acompanhante` com `ordem` sequencial. Limite de 5 vira regra configurável, não estrutura. Zero dados legados nas colunas 2..5.

**R08 — A tela nunca edita; toda gravação é um `INSERT` novo.**
*Origem:* `TELA-CADASTRO-VEICULO.md` §5.1. *Web:* `POST /acessos`; não existe `PUT` de acesso na fase 1.

**R09 — Pré-preenchimento pela visita mais recente** (`ORDER BY DataHora DESC LIMIT 1`), por placa **ou** documento.
*Web:* `GET /busca/placa/:placa` e `/busca/documento/:doc`. **Correção consciente:** o C# busca documento por igualdade exata em maiúsculas, sem normalizar — não acha os gravados com pontuação. Na web, normalizar igual à placa.

**R10 — Busca por placa NÃO preenche a placa; busca por documento preenche.**
*Origem:* `TELA-CADASTRO-VEICULO.md` §5.2 e §5.3. *Web:* mesma assimetria.

**R11 — Grade do movimento = entradas de hoje ∪ pendências sem saída dos últimos 3 dias.**
*Origem:* SQL de `btn_visitas`; `DiasPendenciasNaGrade = 3`. O limite existe para pendência antiga não gerar saída com hora falsa — **preservar**.
*Web:* `GET /acessos/movimento?dias=3`.

**R12 — "Hoje" é sempre no fuso da portaria, nunca UTC.**
*Origem:* `DATE('now','localtime')`. Com `DATE('now')` a grade esvaziava às 21h, no turno da madrugada.
*Web:* `TIMESTAMPTZ` + `America/Sao_Paulo` explícito em toda comparação. **Bug já pago uma vez.**

**R13 — Linhas legadas sem data ficam fora da grade.**
*Origem:* `TRIM(IFNULL(DataHora,'')) <> ''`. *Web:* `entrada_em IS NOT NULL`.

**R14 — Pendência de dia anterior é pintada de âmbar.**
*Origem:* coluna oculta `PENDENCIAANTIGA`; fundo `#FFF2CC`, texto `#7C5E00`; selecionada `#BF8F00` + branco.
*Web:* campo `pendenciaAntiga` no payload; linha âmbar na tabela.

**R15 — Saída exige linha selecionada + confirmação; pendência antiga mostra a data de entrada na confirmação.**
*Origem:* `Btn_Saida`. *Web:* modal com a data da entrada quando `pendenciaAntiga`.

**R16 — Saída sobre saída existente é permitida, mas auditada como `SAIDA SOBRESCRITA` com o valor anterior.**
*Origem:* `Btn_Saida` lê a saída anterior **antes** do `UPDATE`.
*Web:* `POST /acessos/:id/saida` → **409** se já houver saída; `?forcar=true` grava e audita.

**R17 — `saida_em >= entrada_em`** *(regra nova; o C# não valida)*.
*Web:* `CHECK` no banco + validação no serviço. Medição confirma 0 violações hoje (D1).

**R18 — "OCULTAR SAÍDAS" volta marcado a cada atualização.**
*Origem:* `OcultarVisitas`, filtro client-side. *Web:* `somenteDentro=true`, **com o mesmo default ligado**.

**R19 — Tudo em maiúsculas.**
*Origem:* `AplicarMaiusculas` recursivo. *Web:* `text-transform: uppercase` **e** normalização no servidor (a verdade é o servidor).

**R20 — Enter dispara a busca do campo em foco.**
*Origem:* `AcceptButton` alternando entre `btn_rg` e `button1`. *Web:* `onKeyDown` por campo. O porteiro não usa mouse.

**R21 — Máscara de placa recusa a tecla inválida com beep.** *Origem:* `Placa_KeyPress`. *Web:* bloquear a tecla; beep via `AudioContext` — **DV9**.

**R22 — Texto vindo do banco não é remascarado.** `GCT 6604` e `S/ PLACA` continuam como estão. *Web:* máscara só no `onChange` do usuário.

**R23 — Mercadoria: único campo obrigatório é `DESTINATARIO`.** *Origem:* `Frm_Mercadoria.cs`.

**R24 — Desfazer entrega é reversível mas rastreado.**
*Origem:* limpa os 4 campos e audita o que foi apagado. *Web:* `DELETE /mercadorias/:id/entrega` grava o estado anterior em `auditoria.dados` (JSONB).

**R25 — Lista de mercadorias mostra os últimos 7 dias; entregues em verde `#C6EFCE`.** (`DiasNaLista = 7`)

**R26 — Painel "MERCADORIAS NA PORTARIA (N)" na tela principal**, mostrando só CHEGADA, DESTINATARIO, EMPRESA.

**R27 — Senha: PBKDF2-SHA256, 50.000 iterações, salt 16 bytes, hash 32 bytes, formato `PBKDF2$iter$salt$hash`.**
*Origem:* `Seguranca.cs` (`Rfc2898DeriveBytes` + `SHA256`). Confirmado nos 14 usuários da base.
*Web:* `crypto.pbkdf2` do Node com os mesmos parâmetros. **Os 14 hashes migram sem troca de senha.** Comparação em tempo constante; falha fechada em hash malformado.

**R28 — Dois níveis: 1 = total, 2 = restrito.**
*Web:* perfis `ADMINISTRADOR` (nível 1) e `PORTARIA` (nível 2). Sem perda de comportamento.

**R29 — Proteção de permissão em duas camadas:** o menu fica oculto **e** a ação revalida ("Acesso negado").
*Web:* frontend esconde a rota **e** o backend valida em middleware. Esconder botão não é autorização.

**R30 — Nunca ficar sem administrador ativo.** *Origem:* `OutrosAdministradoresAtivos()`. Há só 2 usuários nível 1 — a regra é ativa na prática.

**R31 — Login inválido: mensagem única; só autentica `ATIVO = 1`; tentativa recusada vai para a auditoria antes de existir sessão** (`RegistrarComo`).

**R32 — Troca de turno: avisa antes de descartar dados não salvos; cancelar mantém quem estava; o sistema nunca fica sem usuário.**
*Web:* modal que preserva o rascunho do formulário (`sessionStorage`) até confirmar.

**R33 — `USUARIONOME` congela o nome no momento do evento.** *Web:* `usuario_nome` por valor, não por FK.

**R34 — Auditoria nunca derruba a operação de negócio.** *Origem:* `try/catch` engolindo. *Web:* gravação fora da transação de negócio, com log de erro.

**R35 — Os campos do relatório vêm de whitelist fixa no servidor** (13 campos, todos marcados por padrão). **Nunca** montar SQL com nome de coluna vindo do request.

**R36 — Período padrão: 1º dia do mês corrente até hoje; limite superior exclusivo (`fim + 1 dia`); valida fim ≥ início; vira paisagem com mais de 6 colunas.**

**R37 — Filtro por porteiro inclui `(REMOVIDO)` e `(SEM USUARIO REGISTRADO)`.** Hoje `USUARIOENTRADA` está vazio em 100% da base — o filtro só ganha valor com os dados novos.

**R38 — Ao fechar o sistema, audita `SAIDA DO SISTEMA`.** Na web não há "fechar" — ver **DV8**.

### 1.5 Pontos críticos

1. **O banco de produção vive em `bin/Debug/`** — um `Clean` do Visual Studio apaga a cópia de trabalho. Risco imediato, independente da migração. Tratar **antes** de tudo.
2. **Fuso horário** (R12) — bug já custou uma noite de grade vazia.
3. **Parse de `SAIDA`** com cultura errada (`dd/MM` vs `MM/dd`) corromperia 12.104 datas silenciosamente.
4. **Consolidação de 3.514 empresas por similaridade** — não fazer na migração. 1:1 agora.
5. **Consolidação de placas** (10.629 → 9.932) é determinística, mas as fora de padrão precisam de revisão humana.
6. **LGPD** — CPF, RG, nome e celular de ~12.800 pessoas, hoje sem aviso de privacidade.
7. **`admin`/`admin`** não pode chegar à produção web.
8. **Nunca desktop e web escrevendo ao mesmo tempo.**

---

## 2. ETAPA 3 — Análise do visual

`identidade-visual (2).md` descreve a identidade do site `impakto.com.br` (Next.js + Tailwind v4).
Adotada integralmente:

- **Amarelo de marca `#ecd31b`**, não o token `impaktoYellow` (`#fded56`). Vale para CTAs, badges e o foco dos inputs.
- **Azul institucional `#001b5c`**.
- Inter; títulos `font-bold`, labels `font-medium text-sm`.
- Cards `rounded-3xl shadow-2xl border-gray-200`; inputs `rounded-lg`, foco `ring-2` amarelo, ícone lucide à esquerda com `pl-12`.
- Dark mode declarado par a par. Ícones `lucide-react`.

**Adaptações necessárias — o guia é de site institucional, não de sistema de balcão:**

| Ponto | Guia do site | Sistema da portaria |
|---|---|---|
| Header fixo `--header-h: 132px` | Vale para o site público | **Não se aplica.** Layout de app com **menu lateral** (briefing §12) |
| `py-24` de respiro vertical | Página de marketing | Densidade: `py-6`/`py-8`. Rolagem custa tempo com o caminhão no portão |
| Botão "wipe" de 500 ms | CTA de landing page | Mantido fora do fluxo de balcão. Em SALVAR e SAÍDA, botão sólido `bg-[#ecd31b] text-black font-bold` — meio segundo atrapalha operação repetitiva |
| Corpo `text-base` | — | Grades e campos operacionais em `text-lg` — o desktop usa Segoe UI 12 na grade por um motivo (leitura à distância) |

**Cores com significado, preservadas literalmente** (vêm do desktop, não do guia):
âmbar `#FFF2CC`/`#7C5E00` = pendência de dia anterior · verde `#C6EFCE`/`#006100` = mercadoria entregue · rosa `#FFCDCD` = documento que não fecha.

---

## 3. ETAPA 4 — Arquitetura proposta

### 3.1 Stack

Monorepo **npm workspaces** — um repositório, três pacotes, sem a complexidade de Nx/Turborepo para uma equipe pequena.

```
IMPAKTO-PORTARIA/
├── package.json                 workspaces: apps/*, packages/*
├── docs/
├── apps/
│   ├── api/                     Node 22 + TypeScript + Fastify
│   └── web/                     React 19 + TypeScript + Vite + Tailwind v4
└── packages/
    └── shared/                  tipos + regras puras (placa, documento, CPF, senha)
```

O pacote `shared` é o coração da fidelidade: **as regras de `Mascaras.cs` viram funções puras
usadas pelos dois lados**, e os testes rodam uma vez só contra elas.

| Camada | Escolha | Por quê |
|---|---|---|
| Runtime | **Node 22 LTS + TypeScript strict** | Exigência do briefing |
| HTTP | **Fastify 5** | Validação por schema nativa; plugins de escopo = modularidade por setor de graça |
| Validação | **Zod** (`fastify-type-provider-zod`) | Um schema valida, tipa e gera OpenAPI |
| ORM | **Prisma** | Migrations versionadas; SQLite **e** PostgreSQL trocando o provider |
| Banco dev | **SQLite** | Desenvolver sem servidor, como pedido |
| Banco prod | **PostgreSQL 16** | `TIMESTAMPTZ` de verdade, `JSONB` na auditoria, índice parcial para "quem está dentro" |
| Auth | **JWT curto + refresh em cookie httpOnly** | Troca de turno é troca de sessão |
| Hash | `node:crypto` `pbkdf2` | **Compatível com os 14 hashes existentes** (R27) |
| Tempo real | **WebSocket** (`@fastify/websocket`) | Substitui o `ATUALIZAR` manual (D2) |
| PDF | Puppeteer ou pdfmake | **DV4** |
| Logs | **Pino** | Logger do Fastify. Sem dado pessoal no log (LGPD) |
| Testes | **Vitest** + **Supertest** | Mesmo runner para `shared`, API e web |
| Frontend | React 19 + Vite + **TanStack Query** + **React Hook Form** + Tailwind v4 + lucide-react | Query resolve cache/refetch; RHF resolve formulário grande com validação compartilhada |

**Por que não Next.js**, apesar do guia visual ser de um projeto Next: o briefing pede
explicitamente **frontend separado do backend** e API REST. Next traria SSR que a portaria não
usa (rede interna, sem SEO) e misturaria as camadas. Os tokens Tailwind do guia funcionam
idênticos no Vite.

### 3.2 Modularidade por setor

Cada setor é um plugin Fastify isolado, com prefixo próprio:

```
apps/api/src/
├── app.ts                    monta o servidor, registra infra e módulos
├── config/                   env tipado (Zod), nunca segredo no código
├── infra/
│   ├── prisma.ts             cliente único
│   ├── errors.ts             AppError + handler central (setErrorHandler)
│   ├── logger.ts             Pino, com redact de CPF/celular
│   └── ws.ts                 hub de eventos
├── middlewares/
│   ├── autenticado.ts        valida JWT
│   └── autorizado.ts         exige 'portaria.acesso.criar' etc.
├── modules/
│   ├── auth/                 login, logout, trocar-senha, trocar-turno
│   ├── usuarios/             CRUD, perfis, ativar/inativar
│   ├── auditoria/            gravação (serviço) + consulta (rotas nível 1)
│   └── portaria/             ← FASE 1
│       ├── index.ts          registra os submódulos
│       ├── acessos/          entrada, saída, movimento, histórico
│       ├── busca/            por placa e por documento
│       ├── pessoas/  veiculos/  mercadorias/  relatorios/
│   └── (compras/, rh/, ti/, financeiro/ — pastas futuras, mesmo formato)
└── shared/                   utilitários sem regra de negócio
```

Cada submódulo tem sempre os mesmos 4 arquivos: `*.routes.ts` (HTTP + schema Zod),
`*.service.ts` (regra de negócio — **nunca** na rota), `*.repository.ts` (Prisma), `*.schema.ts`.
**Adicionar Compras = criar uma pasta e uma linha em `app.ts`.** Nada do que existe é tocado.

O frontend espelha a divisão (`src/modules/portaria/...`), com `AppLayout` de menu lateral
montado a partir das permissões que a API devolve no login — um setor novo aparece no menu sem
alterar o layout.

### 3.3 Permissões: Usuário → Perfil → Permissões → Módulo

O briefing pede granularidade que o C# não tem (dois níveis). Solução que **não perde nem
inventa comportamento**:

```
usuario ──N:1── perfil ──N:N── permissao   (chave textual 'modulo.recurso.acao')
```

| Perfil | Origem | Permissões |
|---|---|---|
| `ADMINISTRADOR` | `NIVEL = 1` | todas |
| `PORTARIA` | `NIVEL = 2` | todo `portaria.*` — igual ao nível 2 de hoje |
| `GESTOR` | novo, **sem usuários** na fase 1 | leitura + relatórios |
| `CONSULTA` | novo, **sem usuários** na fase 1 | só leitura |

Os 14 usuários migram para `ADMINISTRADOR` (2) e `PORTARIA` (12). Ninguém ganha nem perde
acesso. A granularidade fica disponível sem mudar o comportamento atual.

### 3.4 Modelo de dados

O modelo de `PROJETO-WEB.md` §6.2 é adotado **sem alteração estrutural** — separa cadastro
(pessoa, veículo, empresa, tipo_veiculo) de movimento (acesso, acesso_acompanhante, mercadoria),
com colunas `*_snapshot` ao lado das FKs porque **um registro de controle de acesso é documento
histórico**: se a pessoa muda de empresa, o acesso do ano passado tem de continuar mostrando a
empresa antiga.

Ajustes que este levantamento acrescenta:

- `perfil`, `permissao`, `perfil_permissao` + `usuario.perfil_id` (§3.3).
- `usuario.nivel_legado INT` — preserva o valor original para conferência pós-migração.
- Índices desde o início (o banco atual tem **zero**): `veiculo(placa_norm)`,
  `pessoa(documento_norm)` único, `acesso(entrada_em DESC)`, índice **parcial**
  `acesso(entrada_em DESC) WHERE saida_em IS NULL`, `mercadoria(chegada_em DESC) WHERE entregue_em IS NULL`.
- `prestador`/`agregado` como `BOOLEAN NULL` — três estados reais. Colapsar `''` e `NULL` em
  `false` inventaria informação sobre 11.257 registros.
- `entrada_em NULL` permitido — única forma honesta de representar os 11.257 legados sem data.

### 3.5 API — endpoints da fase 1

```
POST   /api/auth/login                        → { token, usuario, permissoes[], trocarSenha }
POST   /api/auth/logout
POST   /api/auth/trocar-senha
POST   /api/auth/trocar-turno

GET    /api/portaria/acessos/movimento        ?dias=3&somenteDentro=true
POST   /api/portaria/acessos                  entrada (com acompanhantes[])
POST   /api/portaria/acessos/:id/saida        409 se já tem saída; ?forcar=true sobrescreve
GET    /api/portaria/acessos                  ?de&ate&usuario&somenteSemSaida&page

GET    /api/portaria/busca/placa/:placa
GET    /api/portaria/busca/documento/:doc
GET    /api/portaria/historico                ?placa= ou ?documento=

GET    /api/portaria/mercadorias              ?dias=7&somentePendentes
POST   /api/portaria/mercadorias
POST   /api/portaria/mercadorias/:id/entrega
DELETE /api/portaria/mercadorias/:id/entrega  auditado com estado anterior

GET    /api/portaria/pessoas   ?q=            autocomplete
GET    /api/portaria/empresas  ?q=
GET    /api/portaria/tipos-veiculo

POST   /api/portaria/relatorios/acessos       → PDF
POST   /api/portaria/relatorios/mercadorias
GET    /api/portaria/dashboard

GET    /api/usuarios · POST · PUT /:id · POST /:id/senha · POST /:id/ativo   [ADMINISTRADOR]
GET    /api/auditoria                         [ADMINISTRADOR] ?de&ate&tipo&usuario&page

WS     /ws/portaria/movimento                 push da grade
```

Todo endpoint: schema Zod na entrada, autenticação, autorização por permissão, erro padronizado
`{ erro: { codigo, mensagem, campos? } }`, documentação OpenAPI gerada do Zod.

### 3.6 Dashboard — só indicadores com origem nos dados reais

| Indicador | Origem | Confiável? |
|---|---|---|
| Entradas de hoje | `COUNT acesso WHERE entrada_em::date = hoje` | Sim |
| Saídas de hoje | `COUNT acesso WHERE saida_em::date = hoje` | Sim |
| **Dentro agora** | `COUNT acesso WHERE saida_em IS NULL AND entrada_em >= hoje-3d` | Sim — é o que a grade já mostra |
| Pendências de dias anteriores | subconjunto do anterior | Sim |
| Mercadorias na portaria | `COUNT mercadoria WHERE entregue_em IS NULL` | Sim (hoje = 0) |
| Movimentações recentes | últimos N acessos | Sim |
| Prestadores / agregados do dia | `prestador = true` | **Com ressalva** — 3.039 registros têm o campo vazio |

**Fora da fase 1:** tempo médio de permanência (depende do parse correto do legado — liberar só
após validar a migração); agendamentos (não existem); visitantes (não há distinção no modelo
atual). Entram na fase 3, sobre dados nascidos na web.

---

## 4. ETAPA 5 — Plano de migração

### 4.1 Fases

| Fase | Entrega | Estimativa |
|---|---|---|
| **0** — Fundação | Monorepo, Fastify+Prisma+Vite rodando, CI, Docker Compose com Postgres, layout base com a identidade visual | 1 semana |
| **1** — Segurança | Auth (PBKDF2 compatível), perfis/permissões, CRUD de usuários, auditoria, testes R27–R34 | 1 semana |
| **2** — Portaria: acesso | Entrada, busca, histórico, grade em tempo real, saída. **O núcleo.** | 2 semanas |
| **3** — Portaria: apoio | Mercadorias, relatórios PDF, dashboard | 1–2 semanas |
| **4** — Migração de dados | Script idempotente + relatório de pendências + conferências como gate | 1 semana |
| **5** — Homologação | Web e desktop em paralelo, **desktop ainda como fonte de escrita**; relatórios conferidos contra os PDFs do desktop | 1–2 semanas |
| **6** — Corte | Migração delta, desktop somente-leitura, treinamento, desligamento | 1 semana |
| **7+** | Compras → RH → TI → Financeiro | — |

**Critério de saída da fase 5:** um porteiro opera um turno inteiro na web sem recorrer ao desktop.

### 4.2 Roteiro do script de migração

Executar **sempre sobre uma cópia**, com o `Portaria.exe` fechado. Ordem obrigatória:

```
0.  copiar o .db · conferir md5 · nunca ler o arquivo em uso
1.  perfil + permissao (seed)
2.  usuario          14 linhas · senha_hash copiado literal · nivel_legado preservado
                     perfil = ADMINISTRADOR (nivel 1) | PORTARIA (nivel 2)
                     trocar_senha = true para 'admin'
3.  tipo_veiculo + tipo_veiculo_alias   ← REVISÃO HUMANA OBRIGATÓRIA
                     TRIM primeiro ('FIORINO ' = 'FIORINO')
                     consolidar '¾' + '3/4' + '3/4.' num único tipo
4.  empresa          3.514 · nome_norm sem acento · encoding corrigido por MAPA, não por adivinhação
                     migrar 1:1 · NÃO deduplicar por similaridade
5.  pessoa (motorista)   por documento_norm, registro mais recente como fonte
                     tipo_documento: CPF (11 díg + DV ok) | RG (≤10) | OUTRO
                     NÃO rejeitar os 72 com DV inválido → 'OUTRO' + pendências
6.  pessoa (ajudante)    3.379 registros, 381 documentos distintos, 22 com DV inválido
                     reaproveitar a pessoa quando o documento já existir
7.  veiculo          agrupar por placa_norm: 10.629 grafias → 9.932 veículos  ← ponto crítico
                     manter em `placa` a grafia do registro mais recente
8.  acesso           24.791 → 24.791, 1:1, nada agregado
                     entrada_em ← DataHora 'yyyy-MM-dd HH:mm:ss' (NULL se vazio)
                     saida_em   ← SAIDA   'dd/MM/yyyy HH:mm:ss'  ← formato DIFERENTE
                     ambos em America/Sao_Paulo, nunca UTC
                     prestador/agregado: SIM→true · NAO/NÃO→false · ''/NULL→NULL
                     todos os *_snapshot com o valor original, sem limpeza
9.  acesso_acompanhante   3.379 linhas, ordem = 1
10. mercadoria       0 linhas hoje — passo presente por segurança, recontar antes
11. auditoria        15 linhas
12. CONTROLE e AGENDAMENTO: NÃO migrar
```

**Conferências que falham o deploy** (assert no script, não checklist manual):

```
acesso                                    = 24.791
acesso WHERE entrada_em IS NOT NULL       = 13.534
acesso WHERE saida_em IS NOT NULL         = 12.104
acesso sem saída, com entrada             =  1.430
acesso_acompanhante                       =  3.379
DISTINCT veiculo.placa_norm               =  9.932
DISTINCT pessoa.documento_norm           <= 12.826
usuario                                   =     14  (2 admin, 12 porteiro)
nenhum acesso sem pessoa_id
nenhum acesso com saida_em < entrada_em   (medido: 0 hoje)
```

**Recontagem obrigatória.** Estes números são de 31/08/2026 e o desktop segue em produção a
~2.900 entradas/mês. Rode as contagens de novo imediatamente antes da migração final e use os
valores frescos como gate — não estes.

### 4.3 Regras invioláveis

1. **Não apagar nem alterar** nenhum dado do banco original. O script só **lê**.
2. Backup verificado (md5) antes de qualquer execução.
3. O `ControleAcesso.db` sai de `bin/Debug` **antes** de tudo.
4. Migração **idempotente** — `legado_id` permite rodar de novo sem duplicar.
5. **Nunca** desktop e web escrevendo ao mesmo tempo. SQLite em arquivo não tolera dois donos.
6. Toda execução gera **relatório de pendências**: CPFs com DV inválido, placas fora de padrão,
   tipos consolidados, encoding corrigido, datas incoerentes.

### 4.4 Rastreabilidade C# × Web

| Sistema C# | Sistema Web | Fase | Status |
|---|---|---|---|
| `Frm_Login` | `POST /api/auth/login` + `/login` | 1 | Pendente |
| `TrocarUsuario()` | `POST /api/auth/trocar-turno` + modal | 1 | Pendente |
| `Seguranca.SenhaConfere` | `shared/senha.ts` (PBKDF2 compatível) | 1 | Pendente |
| `Nivel.Total/Restrito` | perfis `ADMINISTRADOR`/`PORTARIA` | 1 | Pendente |
| `Frm_Usuarios` | `/api/usuarios` + `/config/usuarios` | 1 | Pendente |
| `Auditoria.cs` | serviço `auditoria` | 1 | Pendente |
| `Frm_Auditoria` | `GET /api/auditoria` + `/config/auditoria` | 1 | Pendente |
| `Mascaras.Placa` | `shared/validators/placa.ts` | 2 | Pendente |
| `Mascaras.Documento` | `shared/validators/documento.ts` | 2 | Pendente |
| `Frm_Veiculo.btn_Salvar` | `POST /api/portaria/acessos` | 2 | Pendente |
| `button1` (busca placa) | `GET /busca/placa/:placa` | 2 | Pendente |
| `btn_rg` (busca documento) | `GET /busca/documento/:doc` | 2 | Pendente |
| `att_historico` | `GET /historico` | 2 | Pendente |
| `btn_visitas` (grade) | `GET /acessos/movimento` + WS | 2 | Pendente |
| `Btn_Saida` | `POST /acessos/:id/saida` | 2 | Pendente |
| `OcultarVisitas` | `?somenteDentro=true` | 2 | Pendente |
| Abas de ajudante (1..5) | `acesso_acompanhante[]` | 2 | Pendente |
| `Frm_Mercadoria` | `/api/portaria/mercadorias` | 3 | Pendente |
| `Frm_RetiradaMercadoria` | `POST /mercadorias/:id/entrega` | 3 | Pendente |
| `AtualizarMercadoriasPendentes` | painel + `?somentePendentes` | 3 | Pendente |
| `Frm_relatorio_personalizado` | `POST /relatorios/acessos` | 3 | Pendente |
| `Frm_relatorio_data` | mesmo endpoint, preset de 10 colunas | 3 | Pendente |
| `Frm_relatorio_mercadoria` | `POST /relatorios/mercadorias` | 3 | Pendente |
| — (não existe) | `GET /dashboard` | 3 | Novo |
| `Banco.cs` (migração em runtime) | Prisma Migrate no deploy | 0 | **Não portar** |
| `DataAccess.cs`, `Frm_Cadastro.cs` | — | — | **Código morto** |
| `Btn_CriarID_Click_Click` | — | — | **Jamais replicar** |
| `AGENDAMENTO` / `CONTROLE` | — | — | Fora de escopo |

---

## 5. ETAPA 6 — DECISÕES A VALIDAR

Lacunas. Nenhuma foi resolvida por suposição.

**DV1 — Banco de produção: PostgreSQL ou SQL Server?**
Proposta: **PostgreSQL 16**. Existe licença de SQL Server disponível? O Prisma suporta os dois;
a troca custa barato agora e caro depois da fase 4.

**DV2 — Hospedagem.** Servidor interno existe ou precisa ser provisionado? Acesso só na rede
interna, ou também pela internet (gestor de casa, portaria remota)? Decide HTTPS, certificado,
VPN e política de CORS.

**DV3 — Cadastro de pessoas na fase 1 ou depois?**
Pergunta de UX: a busca continua sendo "última visita" (hábito atual, risco zero) ou vira
cadastro consultável já na fase 2? *Proposta: manter "última visita" na fase 2 e liberar a tela
de cadastro na fase 3 — o modelo já suporta as duas, sem retrabalho.*

**DV4 — Geração de PDF.** `QuestPDF` não existe em Node.
(a) **Puppeteer** — HTML/CSS para PDF; layout na mesma linguagem do frontend, mas exige Chromium (~300 MB);
(b) **pdfmake** — sem browser, mais leve, mais trabalhoso para tabelas largas em paisagem.
*Proposta: (a)*, pelo esforço de layout e porque os relatórios precisam bater visualmente com os
PDFs do desktop na validação da fase 5.

**DV5 — Retenção de dados (LGPD).** Por quanto tempo guardar registro de acesso com CPF/RG?
Precisa de definição do jurídico.

**DV6 — Tipos de veículo: quem revisa a consolidação?**
`¾` (932) + `3/4.` (336) + `3/4` (281) são o mesmo tipo. ~18 tipos principais mais cauda longa.
**Precisa de uma pessoa da portaria** para aprovar o de-para antes da fase 4.

**DV7 — Agendamento volta?** Módulo removido do desktop, tabela órfã. Se voltar, volta como
**requisito novo** com modelagem própria — não como migração. Confirmar escopo e fase.

**DV8 — Sessão web.** O desktop audita `SAIDA DO SISTEMA` ao fechar; na web não há "fechar".
*Proposta:* logout explícito → `SAIDA DO SISTEMA`; expiração → `SESSAO EXPIRADA`.
Tempo de sessão: turno de 8h sem re-login, ou expiração curta com refresh?
*Proposta: token de 15 min + refresh de 12h em cookie httpOnly.*

**DV9 — Beep na tecla inválida.** O desktop dá beep ao recusar caractere na placa. No navegador
exige `AudioContext` e pode incomodar no balcão. Manter o beep, ou só feedback visual?

**DV10 — Limite de 5 ajudantes.** Zero registros usam ajudante 2..5 — nunca foi exercitado.
*Proposta: manter 5 como validação configurável, já que `acesso_acompanhante` não impõe limite.*

**DV11 — Múltiplas portarias/guaritas.** O modelo assume uma portaria só. Vale já prever
`portaria_id` nas tabelas de movimento (barato agora, caro depois), ou o requisito não existe?

**DV12 — Rede da guarita.** Wi-Fi ou cabo? Tablet no horizonte? SPA + API já tolera rede
instável, mas o WebSocket da grade precisa de fallback por polling.

---

## 6. Próximo passo

Com **DV1, DV2 e DV4** respondidas, começa a **Fase 0**: monorepo, infraestrutura, CI e layout
base com a identidade visual — sem nenhuma regra de negócio ainda.

As demais podem ser respondidas até o início da fase que as consome
(DV3/DV10 → fase 2 · DV6 → fase 4 · DV5 → fase 6).
