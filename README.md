# Impakto — Sistema Web

Sistema empresarial modular por setor, substituindo gradualmente o sistema desktop em C# + SQLite.
A primeira entrega funcional é o módulo **Portaria**.

> **Fase atual: 0 (Fundação).** A infraestrutura está de pé e as regras puras portadas do C# estão
> implementadas e testadas. As telas e endpoints do módulo Portaria entram nas fases 2 e 3.

---

## Objetivo

Migrar o controle de acesso de veículos e pessoas da portaria — hoje um WinForms com banco SQLite
em arquivo local — para uma aplicação web em rede, **preservando as regras de negócio existentes**
e preparando a arquitetura para os setores seguintes (Compras, RH, TI, Financeiro, Estoque).

O levantamento completo do sistema atual, as 38 regras rastreadas (regra → origem no C# →
implementação web), o modelo de dados e o plano de migração estão em
**[docs/00-LEVANTAMENTO-E-ARQUITETURA.md](docs/00-LEVANTAMENTO-E-ARQUITETURA.md)**.
Esse documento é a fonte de verdade do projeto — quando este README divergir dele, vale ele.

Há um resumo visual em [docs/00-resumo-executivo.html](docs/00-resumo-executivo.html)
(abrir no navegador).

---

## Tecnologias

| Camada | Escolha |
|---|---|
| Runtime | Node 22 LTS · TypeScript strict |
| API | Fastify 5 · Zod · OpenAPI gerado do schema |
| Dados | Prisma 6 · PostgreSQL 16 |
| Frontend | React 19 · Vite 6 · Tailwind CSS v4 · TanStack Query · lucide-react |
| Testes | Vitest |
| Senha | PBKDF2-SHA256 — **compatível com os hashes do desktop** |

**Por que PostgreSQL e não SQLite em desenvolvimento:** o modelo depende de três recursos que o
SQLite não tem — `TIMESTAMPTZ`, `JSONB` e **índice parcial** (`WHERE saida_em IS NULL`, a consulta
mais quente do sistema). Manter dois providers faria o schema de desenvolvimento divergir do de
produção justamente nos pontos críticos. O `docker-compose.yml` sobe o banco com um comando.

**Por que não Next.js**, embora o guia visual venha de um projeto Next: o requisito é frontend
separado do backend com API REST. Next traria SSR que a portaria não usa (rede interna, sem SEO) e
misturaria as camadas. Os tokens Tailwind do guia funcionam idênticos no Vite.

---

## Estrutura

```
IMPAKTO-PORTARIA/
├── apps/
│   ├── api/                    Backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma   Modelo de dados
│   │   │   ├── migrations/     Versionadas, entram no Git
│   │   │   └── seed.ts         Perfis e permissões
│   │   └── src/
│   │       ├── config/         Env tipado — nenhum segredo no código
│   │       ├── infra/          Prisma, logger, erros
│   │       ├── middlewares/    Autenticação e autorização
│   │       ├── modules/        Um plugin Fastify por setor
│   │       │   ├── saude/
│   │       │   └── portaria/   ← fase 2 e 3
│   │       ├── app.ts          Monta o servidor e registra os módulos
│   │       └── server.ts
│   └── web/                    Frontend
│       └── src/
│           ├── componentes/    Botao, Campo, Mensagem
│           ├── layouts/        AppLayout — menu montado por permissão
│           ├── paginas/
│           ├── servicos/       Cliente HTTP
│           └── estilos/        Tokens da identidade Impakto
├── packages/
│   └── shared/                 Regras puras usadas pelos dois lados
│       └── src/                placa · documento · datas · texto · senha
└── docs/
```

**Cada submódulo da API tem sempre os mesmos quatro arquivos:** `*.routes.ts` (HTTP + schema Zod),
`*.service.ts` (regra de negócio), `*.repository.ts` (Prisma) e `*.schema.ts`.
Regra de negócio **nunca** mora na rota.

**Acrescentar um setor** é criar `modules/<setor>/` e uma linha em `app.ts`. Nada do que já existe
é tocado.

### O papel do `packages/shared`

É o coração da fidelidade ao sistema antigo. As regras de `Mascaras.cs` e `Seguranca.cs` viraram
funções puras aqui, usadas **pelo backend e pelo frontend**, testadas uma vez só:

| Arquivo | Origem no C# | Regras |
|---|---|---|
| `placa.ts` | `Mascaras.cs` → `Placa` | R01, R02, R03 |
| `documento.ts` | `Mascaras.cs` → `Documento` | R04, R05, R09 |
| `datas.ts` | SQL de `Frm_Veiculo.cs` | R12, R13, R14, R36 |
| `senha.ts` | `Seguranca.cs` | R27 |
| `texto.ts` | `AplicarMaiusculas` | R19 |

`senha.ts` fica fora do barril `index.ts` porque depende de `node:crypto` — importe por
`@impakto/shared/senha`.

---

## Instalação

Requisito: **Node 22+**. Para o banco há três caminhos — escolha um.

```bash
npm install
cp .env.example .env      # e ajuste (ver abaixo)
```

**a) PostgreSQL portátil (é o que está montado nesta máquina)** — sem Docker, sem instalação,
sem serviço do Windows. Os binários e os dados ficam em `%USERPROFILE%\.impakto`; para desfazer,
pare o banco e apague a pasta. Escuta em **localhost:5433**, de propósito: um PostgreSQL
instalado depois na 5432 padrão não conflita.

```bash
npm run hml:db            # start | stop | status | log
```

O script explica como recriar a instalação do zero se a pasta não existir.

**b) Docker**, se houver na máquina: `npm run db:up` (usa a 5432 — ajuste a `DATABASE_URL`).

**c) Supabase** (ou qualquer PostgreSQL acessível). No Supabase são **duas** URLs, e a
distinção não é detalhe:

| Variável | De onde copiar | Porta | Para quê |
|---|---|---|---|
| `DATABASE_URL` | *Transaction pooler* + `?pgbouncer=true` | 6543 | Tempo de execução |
| `DIRECT_URL` | *Session pooler* (ou *Direct connection*) | 5432 | Migrations |

O `pgbouncer=true` não é opcional: o modo transação não mantém prepared statements, e sem esse
parâmetro o Prisma quebra com `prepared statement "s0" already exists` na segunda consulta igual.

O pooler em modo transação não aceita os comandos que o Prisma Migrate emite; e o plano
gratuito tem poucas conexões diretas, que o pool do Prisma esgota sozinho se usado em runtime.
Em PostgreSQL local as duas apontam para o mesmo lugar.

> **Segurança no Supabase — não pule.** Ele publica toda tabela do schema `public` pela API
> REST usando a chave `anon`, que é pública por design. Sem RLS, essa chave leria a tabela
> `pessoa` inteira — CPF, RG, nome e celular de ~12.800 pessoas — sem autenticação nenhuma.
> A migration `20260901120000_rls_nega_tudo` fecha isso habilitando RLS **sem nenhuma
> política**: `anon` e `authenticated` não enxergam linha alguma, e o Prisma continua
> funcionando porque conecta como dono das tabelas. **Ao criar tabela nova, acrescente-a a
> essa lista.** A autorização de verdade continua sendo do backend, onde é testada.

**Este projeto não usa nenhuma chave de API do Supabase.** Nem a publicável, nem a secreta. A
aplicação fala PostgreSQL puro pelo Prisma; o cliente JS, o PostgREST, o Auth e o Storage do
Supabase não entram na arquitetura — quem autentica é o módulo `auth`, com os hashes PBKDF2
herdados do desktop. A única credencial necessária é a senha do banco, nas duas URLs acima.
Se alguma chave for gerada, ela não deve ser adicionada ao projeto: seria uma credencial sem
uso e, no caso da secreta, uma que **ignora o RLS**.

Depois, em qualquer um dos casos:

```bash
npm run db:deploy --workspace @impakto/api   # aplica as migrations
npm run db:seed   --workspace @impakto/api   # perfis, permissões e admin
```

## Variáveis de ambiente

Todas validadas na subida por `apps/api/src/config/env.ts` — se faltar alguma, o processo morre
com a lista do que falta, em vez de quebrar no primeiro request.

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `DATABASE_URL` | sim | Conexão de runtime (no Supabase, o pooler na 6543) |
| `DIRECT_URL` | não | Conexão para migrations. Sem ela, cai na `DATABASE_URL` |
| `DATABASE_URL_TESTE` | não | Banco dos testes. **Obrigatória quando `DATABASE_URL` aponta para a nuvem** |
| `JWT_SECRET` | sim | Assinatura do token — mínimo 32 caracteres, **um por ambiente** |
| `JWT_EXPIRACAO` | não | Validade do token (padrão `15m`) |
| `REFRESH_EXPIRACAO_HORAS` | não | Validade do refresh (padrão `12`) |
| `CORS_ORIGENS` | não | Origens permitidas, separadas por vírgula |
| `TZ_PORTARIA` | não | Fuso da portaria (padrão `America/Sao_Paulo`) — **ver R12** |
| `PORT`, `HOST`, `LOG_LEVEL` | não | Servidor e log |
| `ADMIN_SENHA_INICIAL` | não | Só o seed usa. Sem ela, nenhum usuário é criado |

Gerar um segredo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

O `.env` está no `.gitignore` e **nunca** deve ser versionado.

## Execução

**Desenvolvimento** — dois processos, com hot reload:

```bash
npm run dev:api     # http://localhost:3333  · docs em /docs
npm run dev:web     # http://localhost:5173
```

O Vite faz proxy de `/api` para a porta 3333.

**Homologação local** — um processo e **uma URL só**, que é como a portaria vai usar:

```bash
npm run hml:db start   # se o banco não estiver no ar
npm run hml            # compila tudo e sobe
```

| | URL |
|---|---|
| Sistema | `http://localhost:3333` |
| Pela rede local | `http://<ip-da-maquina>:3333` |
| Documentação da API | `http://localhost:3333/docs` |
| Verificação de saúde | `http://localhost:3333/api/saude` |

A API serve o build do frontend (`apps/web/dist`) e devolve o `index.html` em qualquer rota que
não seja `/api` ou `/docs` — dar F5 numa rota interna não cai em 404. Sem o build, a API sobe
normal e responde só as rotas de dados, avisando no log.

> O `hml` da rede local só responde se o Firewall do Windows liberar a porta 3333 para redes
> privadas. Para um HML de verdade em servidor, falta a **DV2** (hospedagem).

## Testes

```bash
npm test            # todos
npm run test:watch
```

> Os testes **truncam tabelas**. `DATABASE_URL_TESTE` precisa apontar para um alvo descartável:
> o schema `teste` do Supabase (`?schema=teste`) ou um banco local terminado em `_test`.
> `apps/api/src/testes/ambiente.ts` recusa rodar em qualquer outro — a trava existe porque, com
> a homologação no mesmo servidor, um `npm test` distraído apagaria a homologação inteira.

**Sobre onde rodar os testes.** A suíte tem 67 testes de integração, e cada um limpa e semeia o
banco. Contra PostgreSQL local ela leva **~4 segundos**; contra o Supabase em Oregon, **~13
minutos**, porque cada ida e volta custa ~180 ms. Funciona nos dois, mas para o ciclo de
desenvolvimento a diferença é o que separa rodar a suíte a cada mudança de rodá-la uma vez por
dia. O `npm run hml:db start` sobe um PostgreSQL portátil só para isso, sem afetar a
homologação, que continua na nuvem.

Os testes de `packages/shared` são a rede que garante que o comportamento do C# foi preservado.
Cada `describe` cita a regra (`R01`, `R12`, …) rastreada no levantamento. **Alterar uma dessas
funções sem alterar o teste correspondente é alterar o comportamento do sistema sem querer.**

## Banco de dados

```bash
npm run hml:db start                           # Postgres portátil (ou db:up, com Docker)
npm run db:deploy   --workspace @impakto/api   # aplica migrations
npm run db:migrate  --workspace @impakto/api   # cria migration nova, em desenvolvimento
npm run db:studio   --workspace @impakto/api   # inspeção visual
npm run db:generate --workspace @impakto/api   # regenera o client
```

A migration inicial cria 13 tabelas e inclui, escritas à mão, as restrições que o Prisma não
declara: os dois `CHECK` de coerência (`saida_em >= entrada_em` e entrega coerente) e os dois
índices parciais. Ao gerar a próxima migration, use `--create-only` e confira que continuam de pé.

**A migração dos dados do desktop entra na Fase 4** e tem roteiro próprio, com conferências que
falham o deploy. O script **só lê** o banco original — nunca apaga nem altera nada.

## Usuários e permissões

Modelo: **Usuário → Perfil → Permissões → Módulo**, com a permissão como chave textual
`modulo.recurso.acao` (ex.: `portaria.acesso.criar`).

O desktop tem apenas dois níveis. O mapeamento inicial **não muda o acesso de ninguém**:

| Perfil | Origem | Usuários hoje |
|---|---|---|
| `ADMINISTRADOR` | `NIVEL = 1` | 2 |
| `PORTARIA` | `NIVEL = 2` | 12 |
| `GESTOR` | novo | 0 |
| `CONSULTA` | novo | 0 |

A proteção é **em duas camadas**: o menu esconde o item e o backend revalida a permissão.
Esconder botão não é autorização (R29).

## API

Documentação interativa em `http://localhost:3333/docs` (só fora de produção), gerada dos
próprios schemas Zod — não há um segundo lugar para manter sincronizado.

Formato único de erro:

```json
{ "erro": { "codigo": "DADOS_INVALIDOS", "mensagem": "…", "campos": [{ "campo": "…", "mensagem": "…" }] } }
```

O `409` merece atenção: significa que a operação é possível mas exige confirmação explícita — é o
caso de registrar saída sobre uma saída já existente (R16).

## Módulos

| Módulo | Fase | Estado |
|---|---|---|
| Saúde | 0 | Pronto |
| Auth, Usuários, Auditoria | 1 | A fazer |
| Portaria — acesso | 2 | A fazer |
| Portaria — mercadorias, relatórios, painel | 3 | A fazer |
| Compras, RH, TI, Financeiro | 11+ | Futuro |

## Deploy

**Frontend — Vercel.** O `vercel.json` da raiz constrói o `@impakto/shared` e depois o
`@impakto/web`, publicando `dist/` **na raiz** — que é onde o Vite escreve (`outDir: '../../dist'`)
e o mesmo diretório que a API serve quando entrega o frontend na própria URL. Um lugar só: um
passo de cópia que só rodasse no deploy seria justamente o que ninguém testa.

Três detalhes do arquivo que têm motivo, e que uma tentativa anterior de deploy provou serem
necessários:

- **`"framework": null`** — com `"vite"`, o preset assume que a saída fica em `dist` na raiz do
  projeto. Num monorepo, isso conflita com `outputDirectory: "apps/web/dist"` e o build morre
  com `Cannot read properties of undefined (reading 'fsPath')`, sem dizer por quê. Sem preset,
  valem o `buildCommand` e o `outputDirectory` declarados.
- **A reescrita `/((?!api/).*)` → `/index.html`** dá o fallback do roteamento do cliente: sem
  ela, dar F5 em `/portaria/movimento` devolve 404, porque o caminho não existe como arquivo.
  O Vercel só aplica reescrita depois de não encontrar arquivo estático, então `/assets/*`
  continua sendo servido. **Quando a API tiver URL, a reescrita dela entra ANTES desta** — a
  ordem importa, e este curinga engoliria as chamadas.
- **`vercel.json` não aceita comentário.** Chave `"//"` dentro de um objeto de `rewrites` viola
  o schema; a explicação mora aqui, não lá. A API **não** vai para o Vercel: ela é um servidor
Fastify de processo longo, e serverless quebraria duas coisas que já existem —

- o limite de tentativas de login (R31) guarda estado **em memória**, e em funções serverless
  cada requisição pode cair numa instância nova: a barreira contra força bruta deixaria de
  valer, em silêncio;
- WebSocket, que é o caminho previsto para a grade em tempo real, não funciona em função.

**API — serviço com processo vivo** (Render, Railway, Fly, ou servidor próprio). Quando ela
tiver URL, acrescente ao `vercel.json` a reescrita que mantém tudo na mesma origem:

```json
"rewrites": [{ "source": "/api/:caminho*", "destination": "https://<url-da-api>/api/:caminho*" }]
```

A reescrita não é detalhe de conveniência: ela mantém frontend e API na **mesma origem**, o que
evita CORS e preserva o cookie de refresh como `SameSite=Strict`. Servindo de origens
diferentes, o cookie precisaria de `SameSite=None` e perderia essa proteção.

### Notas gerais



Rede interna, sem exposição à internet enquanto não houver requisito (DV2).
Kestrel/Node atrás de um reverse proxy, ou IIS. Requisitos que vêm do levantamento:

- **Backup diário com retenção de 30 dias e teste de restauração documentado.** O desktop não tem
  backup nenhum, e o banco de produção vive numa pasta de saída de build.
- **Restart automático.** A portaria opera fora do horário comercial; se o sistema cair, o fluxo
  para. Prever também plano de contingência em papel.
- `prisma migrate deploy` no deploy — **nunca** migração de schema em runtime, como faz o desktop.
- Nenhum dado pessoal em log de aplicação (LGPD) — o `redact` do Pino já cobre os campos atuais;
  ao acrescentar um campo pessoal a um payload, acrescente também lá.

---

## Decisões ainda em aberto

Doze decisões estão registradas na seção 5 do levantamento. As que afetam esta fase:

- **DV1 — PostgreSQL ou SQL Server?** Adotado PostgreSQL. Trocar ainda é barato; depois da Fase 4, não.
- **DV2 — hospedagem e alcance da rede.** Assumida rede interna, CORS por variável de ambiente.
- **DV8 — duração da sessão.** Proposto token de 15 min + refresh de 12 h, já refletido no `.env.example`.
