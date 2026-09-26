# HR-HOSPITALITY — Migrações de Base de Dados

As migrações canónicas estão divididas por ambiente:

| Ambiente | Pasta | Aplicação |
|---|---|---|
| SQLite local | `migrations/sqlite/` | Runner privileged, acesso direto ao ficheiro SQLite |
| Supabase/PostgreSQL | `migrations/supabase/` | `pg` + pooler; `PGPASSWORD` fornecido pelo secret manager |

## Regras de segurança

- Aplicar sempre em ordem FIFO e apenas depois de snapshot/backup.
- As migrações `001`–`004` são histórico. As policies abertas aí existentes são
  removidas e substituídas pela migração `005`.
- **Não executar os SQL standalone legados na raiz** (`MIGRATION_FULL.sql`,
  `MIGRATION_NEW_PROJECT.sql`, `ROOMS_DB.sql`, `RESERVATIONS_DB.sql` e
  `HOSPITALITY_LOCAL_SQLITE.sql`). Eles são stubs inócuos e não devem ser usados.
- Nunca colocar `PGPASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, tokens Vercel ou
  credenciais de QA em comandos, scripts ou ficheiros versionados.
- A aplicação nunca deve executar as migrações através da API HTTP local.

## Comandos

```bash
cd hr-hospitality-app

# Estado — operação somente leitura
node scripts/run_migrations.mjs --status --target=sqlite
node scripts/run_migrations.mjs --status --target=supabase

# Aplicar migrações pendentes
node scripts/run_migrations.mjs --target=sqlite --snapshot
# Com PGPASSWORD, SUPABASE_DB_HOST, SUPABASE_DB_USER e SUPABASE_DB_NAME
# já fornecidos pelo secret manager:
node scripts/run_migrations.mjs --target=supabase --snapshot

# Usar outra base local:
node scripts/run_migrations.mjs --target=sqlite --db=/caminho/hospitality_local.db
```

Snapshots de esquema são gravados em `hr-hospitality-app/backups/{sqlite,supabase}/`
e não são versionados. O snapshot SQLite inclui agora `_schema_migrations`.

## Histórico

| Versão | Conteúdo |
|---|---|
| 001 | tenants, quartos, reservas e consumos |
| 002 | tabela legacy `app_users` com PBKDF2 |
| 003 | `sync_queue` local; no-op no Supabase |
| 004 | `hr_employees` |
| 005 SQLite | ligação de identidade, remoção de hashes locais e `updated_at` de consumos |
| 006 SQLite | conversão de IDs de demonstração legados para UUIDs canónicos |
| 005 Supabase | Supabase Auth profile, remoção de hashes, RBAC/tenant e RLS fechado |

> **Cutover obrigatório:** uma instalação não é considerada segura enquanto a
> migração `005` não estiver aplicada e validada em staging e produção.

## Reversão

As migrações são forward-only. Em caso de problema:

1. parar a aplicação;
2. restaurar o ficheiro SQLite ou usar PITR/`pg_dump` do Supabase;
3. voltar à versão anterior do artefacto;
4. nunca reabrir policies `USING (true)` como rollback.
