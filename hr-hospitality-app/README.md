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
- **Roteamento automático**: tenta o Supabase primeiro; se falhar (rede, DNS,
  erro HTTP), faz *fallback* transparente para o SQLite local.
- **Escritas offline**: gravadas no SQLite com `sync_status = 'pending'` e um
  evento correspondente na tabela `sync_queue`.
- **Replicação online → local**: escritas bem-sucedidas na nuvem são
  replicadas silenciosamente para o SQLite, mantendo as duas bases coerentes.
- Selects locais suportam filtros (`eq/neq/gt/lt/gte/lte/like/ilike/in`),
  `order`, `limit`, `single()` e relações embrionárias (`tabela(colunas)`).

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
- Endpoints: `POST /api/db/query` (SELECT), `POST /api/db/execute`
  (INSERT/UPDATE/DELETE/DDL), `GET /api/health`.
- Na primeira execução com base nova, carrega `electron/schema.sql`.
- Base de dados gravada no diretório de dados do utilizador do Electron
  (`USER_DATA_PATH`); em dev, no diretório do projeto.
- Escuta em `0.0.0.0` para permitir terminal secundário na rede local —
  **recomendação**: manter a rede confinada/VPN, pois os endpoints aceitam
  SQL arbitrário.

### Autenticação (`src/context/AuthContext.tsx`)

- Papéis: `ADMINISTRATOR` (acesso total), `PERMISSAO` (restrições por caminho),
  `ACESSO` (apenas `allowedModules`).
- **Palavras-passe com hash PBKDF2-SHA256** (Web Crypto, 150 000 iterações,
  salt aleatório de 16 bytes, comparação em tempo constante). Nenhuma senha
  é armazenada em texto simples; a sessão ativa não contém material de hash.
- Migração automática de contas legadas no arranque.
- Contas de demonstração (1.ª execução): `admin` / `user123` / `staff` /
  `snack` — **alterar no primeiro login**.

---

## 2. Módulos

| Módulo | Rota | Descrição |
|---|---|---|
| Dashboard | `/` | KPIs, log operacional, leads pendentes |
| Alojamento / Check-in | `/alojamento`, `/alojamento/checkin` | Mapa de quartos, check-in 360° (Supabase Realtime) |
| POS | `/pos` | Mapa de mesas, venda rápida, facturação |
| Snack-bar | `/snack-bar` | PDV do bar |
| RH | `/rh/empregados`, `/rh/escalas`, `/rh/ferias`, `/rh/picagem`, `/rh/saidas`, `/rh/salarios`, `/rh/usuarios` | Gestão completa de pessoal |
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
```

### Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha com as credenciais do
projeto Supabase. `.env.local` **nunca** é versionado (coberto pelo
`.gitignore`).

### Migrações de base de dados

- Nuvem (Supabase/PostgreSQL): `../MIGRATION_FULL.sql`, `../MIGRATION_NEW_PROJECT.sql`
- Local (SQLite): `../HOSPITALITY_LOCAL_SQLITE.sql` — aplicar via
  `POST http://localhost:3002/api/db/execute`
- Cloud: `scripts/run_cloud_migration.mjs`

---

## 4. Segurança — estado e recomendações

| Medida | Estado |
|---|---|
| Hash de palavras-passe (PBKDF2-SHA256 + salt) | ✅ Implementado |
| Sessão sem material de credenciais | ✅ Implementado |
| `.env.local` fora do git | ✅ `.gitignore` + `.env.example` |
| Base de dados local fora do git | ✅ `*.db`, `*.db-shm`, `*.db-wal` |
| Autenticação centralizada no servidor (Supabase Auth) | ⚠️ Recomendado — o hash client-side protege dados em repouso, mas o modelo local-first mantém a verificação no cliente |
| Bind do servidor local restrito a `127.0.0.1` | ✅ Implementado — exposição LAN apenas com opt-in (`HOSPITALITY_HOST=0.0.0.0`) em rede confinada/VPN |
| RLS (Row Level Security) no Supabase | ⚠️ Verificar políticas por `tenant_id` |
