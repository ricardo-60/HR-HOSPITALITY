# HR-HOSPITALITY — Plataforma de Gestão Hoteleira

Plataforma completa de gestão para unidades hoteleiras, com **operação
offline-first** (SQLite local) e sincronização automática com a nuvem
(Supabase/PostgreSQL). Cliente inicial: **Hotel Lukweku** (Benfica, Angola).

---

## 1. Visão Geral da Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│                     CLIENTES                                     │
│   Navegador (Vercel)  ·  Desktop Windows (Electron + NSIS)       │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│  APP Next.js 16 / React 19 / TypeScript / Tailwind 4             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  dataLayer.ts — API compatível com o cliente Supabase      │  │
│  │  (emula PostgrestQueryBuilder: from/select/eq/insert/...)   │  │
│  └───────────┬───────────────────────────────┬────────────────┘  │
│              │ ONLINE                        │ OFFLINE           │
│  ┌───────────▼───────────┐     ┌─────────────▼─────────────────┐ │
│  │  Supabase Cloud       │     │  Servidor local Express:3002  │ │
│  │  (PostgreSQL, Realtime│     │  node:sqlite (WAL)            │ │
│  │  Storage, Auth)       │     │  hospitality_local.db         │ │
│  └───────────▲───────────┘     └─────────────┬─────────────────┘ │
│              │      ┌────────────────────────▼─────────────────┐ │
│              └──────┤ syncEngine.ts — reconciliação            │ │
│                     │ sync_queue → upsert/delete no Supabase   │ │
│                     └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Camada de Dados Híbrida (`src/lib/dataLayer.ts`)

- Emula **toda** a API do `supabase-js` (`from()`, `rpc()`, `channel()`,
  `auth.*`), permitindo trocar `supabase.from(...)` por `dataLayer.from(...)`
  sem alterar os ecrãs.
- **Roteamento automático**: tenta o Supabase primeiro quando existe uma sessão
  JWT válida; falhas de rede podem usar o SQLite apenas no Electron Servidor.
- **Escritas offline**: gravadas no SQLite com `sync_status = 'pending'` e um
  evento correspondente na tabela `sync_queue`.
- **Replicação online → local**: escritas bem-sucedidas na nuvem são
  replicadas silenciosamente para o SQLite, mantendo as duas bases coerentes.
- Selects locais suportam filtros (`eq/neq/gt/lt/gte/lte/like/ilike/in`),
  `order`, `limit` e `single()` através do registry validado.

### Motor de Sincronização (`src/lib/syncEngine.ts`)

Consome a fila `sync_queue` e reconcilia com o Supabase:

1. Lê eventos pendentes por ordem de `timestamp`.
2. **Coalescência**: colapsa eventos repetidos do mesmo registo no estado
   final (ex.: `INSERT → UPDATE → UPDATE` vira um único upsert).
3. Reproduz cada operação na nuvem (`upsert` com `onConflict: id` / `delete`).
4. Sucesso → apaga o evento da fila e marca a linha como `synced`.
5. Falha → interrompe preservando a ordem; tenta novamente no próximo ciclo.
6. Dispara automaticamente: evento `online`, intervalo de 60 s e após cada
   escrita local. Telemetria via `getSyncStats()` (pendentes, falhados,
   por tabela, evento mais antigo, resultado do último flush).

### Servidor Local (`electron/server.js`, porta 3002)

- Express + `node:sqlite` (DatabaseSync, modo WAL, foreign keys ON).
- O renderer **nunca envia SQL**. As operações passam por IPC ou por
  `POST /api/v1/operations`, com registry fechado em `electron/operations.js`.
- Os antigos `/api/db/query` e `/api/db/execute` respondem `410 RAW_SQL_REMOVED`.
- A API HTTP exige Bearer token, allowlist exata de hosts/origens e limite de
  payload; o token interno não é entregue ao renderer.
- A base é gravada no diretório de dados do utilizador do Electron
  (`USER_DATA_PATH`).
- A exposição à rede exige `HOSPITALITY_API_TOKEN` e
  `HOSPITALITY_ALLOWED_HOSTS`; o default é loopback.

### Autenticação (`src/context/AuthContext.tsx`)

- A identidade é autenticada pelo **Supabase Auth** usando JWT e sessão.
- O perfil protegido em `app_users` fornece `tenant`, `role`, permissões e
  estado da conta. As permissões do browser são apenas UX; a autorização real
  é aplicada pelas policies RLS.
- Papéis: `ADMINISTRATOR` (acesso total), `PERMISSAO` (restrições por caminho),
  `ACESSO` (apenas `allowedModules`).
- Não são guardados hashes, salts ou palavras-passe em `localStorage`. As chaves
  legadas `hr_users` e `hr_active_user` são removidas no arranque.
- Contas são criadas por convite através da Edge Function `admin-users`; o
  cadastro público está desativado.
- `mustChangePassword=true` bloqueia a navegação até à alteração da password.
- O primeiro administrador é criado uma única vez pelo endpoint de bootstrap
  documentado em `docs/PHASE1_SECURITY_CUTOVER.md`.

---

## 2. Módulos

| Módulo | Rota | Descrição |
|---|---|---|
| Dashboard | `/` | KPIs, log operacional, leads pendentes |
| Alojamento / Check-in | `/alojamento`, `/alojamento/checkin` | Mapa de quartos, check-in 360° (Supabase Realtime) |
| POS | `/pos` | Mapa de mesas, venda rápida, facturação |
| Snack-bar | `/snack-bar` | PDV do bar |
| RH | `/rh/empregados`, `/rh/escalas`, `/rh/ferias`, `/rh/picagem`, `/rh/saidas`, `/rh/salarios`, `/rh/usuarios` | Gestão de pessoal |
| Lavandaria | `/lavandaria` | Ciclos e rastreio |
| SPA, Parque, Transfer, Eventos, Facilities | `/spa`, `/parque`, `/transfer`, `/eventos`, `/facilities` | Serviços auxiliares |
| Logística | `/logistica` | Economato/stock |
| Configurações / Ajuda | `/configuracoes`, `/ajuda` | Setup e suporte |

---

## 3. Desenvolvimento

```bash
npm install

# Web (desenvolvimento)
npm run dev                # http://localhost:3000

# Desktop (Electron + servidor local SQLite)
npm run electron:dev       # next dev + wait-on + electron

# Produção web
npm run build && npm start

# Empacotamento desktop (Windows NSIS)
npm run electron:build     # ou: npm run build:client / build:server / build:all

# Testes E2E
npm run test:e2e

# Testes de segurança do registry/API local
npm run test:security
```

### Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha com as credenciais do
projeto Supabase. `.env.local` **nunca** é versionado (coberto pelo
`.gitignore`).

### Migrações de base de dados

- Nuvem (Supabase/PostgreSQL): `../migrations/supabase/001..005`
- Local (SQLite): `../migrations/sqlite/001..005`
- Runner: `node scripts/run_migrations.mjs --target=sqlite` ou
  `--target=supabase` com secrets no ambiente.
- **Não executar** os SQL standalone legados na raiz; estão bloqueados por
  guards e podem conter policies antigas abertas.

---

## 4. Segurança — estado e recomendações

| Medida | Estado |
|---|---|
| Supabase Auth/JWT | ✅ Implementado no código; requer contas/perfiles provisionados |
| Hashes/salts no browser | ✅ Removidos e descartados no arranque |
| Registo público | ✅ Desativado; convites via Edge Function |
| RLS por `auth.uid()`, tenant e role | ✅ Migração 005; aplicar em staging/produção |
| API SQLite com SQL arbitrário | ✅ Removida; registry fechado + IPC |
| CORS/Host do servidor local | ✅ Allowlist + token; LAN exige configuração explícita |
| Credenciais locais fora do Git | ✅ `.gitignore`; revogação/rotação continua manual |
| Testes de segurança locais | ✅ `npm run test:security` |
| Dependências (`npm audit`) | ✅ 0 vulnerabilidades; Next.js atualizado para `16.3.6` |

> **Importante:** aplicar as migrações 005/006 e configurar os secrets antes de
> qualquer uso real. O modo Electron Cliente usa atualmente apenas Supabase;
> o acesso a um servidor SQLite remoto por pairing/TLS fica para a Fase 4.
> Até lá, o código deve ser considerado em cutover, não production-ready.
