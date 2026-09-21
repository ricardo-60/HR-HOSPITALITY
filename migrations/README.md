# HR-HOSPITALITY — Migrações de Base de Dados

Sistema de versionamento de esquema para os **dois ambientes**:

| Ambiente | Pasta | Aplicação |
|---|---|---|
| SQLite local (hospitality_local.db) | `migrations/sqlite/` | Via API HTTP do servidor local (:3002) |
| Supabase Cloud (PostgreSQL) | `migrations/supabase/` | Via `pg` + pooler (requer `PGPASSWORD`) |

## Convenções

- Ficheiros: `NNN_nome_descritivo.sql` (NNN = versão, aplicada por ordem)
- Toda migração deve ser **idempotente** (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, blocos `EXCEPTION`)
- Cada versão aplicada é registada na tabela **`_schema_migrations`** (criada
  automaticamente pelo runner em ambos os ambientes): `version`, `name`, `applied_at`
- `003_sync_queue_setup` (supabase) é **no-op intencional** — a `sync_queue` é exclusiva do SQLite local

## Comandos

```bash
cd hr-hospitality-app

# Estado atual (versão aplicada + pendentes)
node scripts/run_migrations.mjs --status --target=sqlite
node scripts/run_migrations.mjs --status --target=supabase

# Aplicar migrações pendentes (com snapshot prévio recomendado)
node scripts/run_migrations.mjs --target=sqlite --snapshot
PGPASSWORD=... node scripts/run_migrations.mjs --target=supabase --snapshot
```

Snapshots gravados em `hr-hospitality-app/backups/{sqlite,supabase}/` (fora do git).

## 🔙 Recuar / Restaurar

### SQLite local

**Opção A — restauro de ficheiro (mais seguro, requer servidor parado):**
1. Parar a app/servidor local
2. Substituir `hospitality_local.db` (e `-wal`/`-shm`) pelo backup ficheiro anterior
3. Reiniciar — a tabela `_schema_migrations` restaurada reflete a versão correta

**Opção B — desfazer objeto a objeto (sem backup ficheiro):**
1. `DROP TABLE` dos objetos introduzidos pela migração a recuar (ver snapshot em `backups/sqlite/` para inventário)
2. `DELETE FROM _schema_migrations WHERE version = 'NNN';`
3. Re-executar o runner (migrações idempotentes são seguras)

### Supabase Cloud

1. Snapshots de inventário: `backups/supabase/snapshot-*.sql` (colunas, tipos, contagens)
2. Restauro completo: **Supabase Dashboard → Database → Backups** (PITR/backup diário) ou `pg_dump`/`pg_restore`
3. Para desfazer uma versão: `DROP` dos objetos + `DELETE FROM public._schema_migrations WHERE version = 'NNN';`

> ⚠️ As migrações são de avanço (forward-only por design). O recuo manual
> deve ser precedido de snapshot e, idealmente, validado num ambiente de teste.

## Histórico

| Versão | Nome | Conteúdo |
|---|---|---|
| 001 | initial_schema | tenants, hotel_rooms, hotel_reservations, hotel_consumptions (+ seeds, realtime no Supabase) |
| 002 | auth_pbkdf2_security | app_users com `password_hash`/`password_salt`/`must_change_password` (sem texto simples) |
| 003 | sync_queue_setup | sync_queue + índices (SQLite) / no-op (Supabase) |
| 004 | hr_employees | tabela de empregados para módulos /rh/* |
