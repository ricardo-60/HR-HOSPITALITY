# Fase 1 — Cutover de Segurança

## Estado implementado no repositório

- A autenticação do browser foi substituída: `AuthContext` usa Supabase Auth e perfis protegidos de `app_users`.
- As chaves `hr_users`, `hr_active_user` e hashes PBKDF2 são removidas no primeiro arranque.
- A palavra-passe do Supabase Auth é alterada pelo utilizador autenticado; o perfil só permite atualizar a respetiva flag `must_change_password`.
- O registo público foi substituído por uma página informativa; convites passam por `admin-users` Edge Function.
- A migração forward-only `migrations/supabase/005_secure_auth_and_rls.sql` remove todas as policies abertas nas tabelas protegidas.
- `/api/db/query` e `/api/db/execute` devolvem `410`; SQL só é executado pelo registry fechado `electron/operations.js`.
- O renderer usa IPC com `contextIsolation`; endpoints HTTP exigem Bearer token, allowlist de hosts/origens e operação validada.
- Credenciais locais `.env.local`, `.env.qa`, token Vercel e script com `service_role` foram removidos do disco; artefactos de build antigos também foram limpos. Backups históricos foram preservados para não apagar a única cópia de recuperação.

## Ações manais obrigatórias

Estas ações exigem acesso ao painel do fornecedor e **não foram executadas pelo agente**.

### 1. Revogar e regenerar chaves

1. Supabase → Project Settings → API Keys.
2. Revogar a `service_role` antiga e criar uma nova.
3. Não colocar a nova chave no repositório, `.env.local`, Vercel ou Electron.
4. Vercel → Tokens → revogar o token usado por wipes/CLI; gerar um novo apenas se necessário.

### 2. Fazer backup

- Supabase: PITR/backup do projeto antes de aplicar a migração 005.
- SQLite: parar a app e copiar `hospitality_local.db`, `-wal` e `-shm`.
- Guardar os artefactos fora do repositório.

### 3. Configurar o frontend

Copiar `hr-hospitality-app/.env.example` para `.env.local` e inserir apenas:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave-anon-nova>
```

Não adicionar `SUPABASE_SERVICE_ROLE_KEY`, `PGPASSWORD` ou token Vercel.

### 4. Aplicar a migração de staging

```bash
cd hr-hospitality-app
node scripts/run_migrations.mjs --status --target=supabase
node scripts/run_migrations.mjs --target=supabase --snapshot
```

A migração 005 remove as colunas `password_hash`/`password_salt` de `app_users` e fecha RLS. Fazer primeiro uma cópia de staging.

### 5. Configurar e publicar a Edge Function

Configurar `APP_ALLOWED_ORIGINS` com a origem HTTPS exata da aplicação. Só
adicionar `null` se o Electron empacotado precisar de chamar a função a partir
de `file://`; a função continua a validar o token e o perfil em cada operação.

```bash
supabase secrets set APP_ALLOWED_ORIGINS="https://<app-real>.dominio"
supabase secrets set SUPABASE_AUTH_REDIRECT_URL="https://<app-real>.dominio/alterar-palavra-passe"
# Definir BOOTSTRAP_TOKEN através do secret manager, sem o escrever no histórico.
supabase functions deploy admin-users
```

O valor de `BOOTSTRAP_TOKEN` deve ser gerado por um gerador seguro e nunca
copiado para um ficheiro ou comando versionado. A função `admin-users` faz
validação administrativa no servidor; a chave `service_role` permanece apenas
nos secrets do Supabase.

### 6. Criar o primeiro administrador

Executar uma única vez, com o token guardado no secret manager:

```json
{
  "action": "bootstrap",
  "email": "admin@dominio-real",
  "employeeCode": "ADMIN-001",
  "name": "Administrador inicial",
  "role": "ADMINISTRATOR",
  "status": "ATIVO",
  "commissionRate": 0,
  "restrictions": [],
  "allowedModules": ["*"]
}
```

Endpoint: `POST <SUPABASE_URL>/functions/v1/admin-users`.
Header adicional: `X-Bootstrap-Token: <token>`. Após confirmar o login, remover
`BOOTSTRAP_TOKEN` do ambiente da função.

### 7. Validar antes de produção

- `anon` não consegue ler/escrever tabelas operacionais.
- Um utilizador bloqueado não entra.
- Um `ACESSO` com `['pos']` não acede a `rh`/`alojamento` na UI nem no RLS.
- Um administrador só gere utilizadores do próprio tenant.
- Um payload com `sql`, `table`, `column` ou operação desconhecida é rejeitado.
- O servidor Electron arranca sem enviar o token interno para o renderer.
- O voice só funciona no modo Servidor através de IPC autenticado.

## Validação local executada

- `npm audit`: **0 vulnerabilidades** (runtime e desenvolvimento).
- `npm run lint`: **0 erros e 0 avisos** em todo o projeto, incluindo módulos RH e componentes legados.
- `npx tsc --noEmit`: passou.
- `npm run build` com Next.js `16.3.6` e variáveis públicas de configuração: passou (28 páginas estáticas). O build de produção falha de forma segura se faltar `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `npm run test:security`: 4/4 testes passaram.
- `npm run test:e2e`: 2/2 testes passaram.
- Migrações SQLite `001..006`: aplicadas com sucesso numa base temporária.
- `git diff --check`: sem erros de whitespace.
- O lint global passou depois de eliminar os erros RH/UX legados: a hidratação a
 partir do `localStorage` passou a ser diferida (evita o `setState` síncrono em
 efeito), os tipos `any` do POS foram substituídos por `Table`/`SnackTable` e
 foram removidos imports e parâmetros não utilizados.

## Pipeline de empacotamento validado, mas ainda não operacional

O `node build_setups.js` foi executado de ponta a ponta e gerou os dois
instaladores NSIS (`Servidor` e `Cliente`, 171,6 MB e 171,7 MB, Electron
42.11.8 / electron-builder 26.15.3). Como a `anon` key real ainda não foi
fornecida, essa execução usou valores **placeholder** e por isso os instaladores
resultantes **não Allowem autenticação**; foram eliminados de `dist/`, tal como
`out/`, `.next/` e `electron/public-config.json`.

Quando a credencial existir, o artefacto operacional é obtido com:

```bash
cd hr-hospitality-app
npm run build          # falha de forma segura sem NEXT_PUBLIC_SUPABASE_*
node build_setups.js   # gera dist/HR-Hospitality-{Servidor,Cliente}-Setup-0.1.0.exe
```

## Nota sobre histórico Git

A verificação actual não encontrou ficheiros `.env`, `.qa`, chaves `service_role` ou tokens Vercel rastreados pelo `HEAD`. Os ficheiros removidos estavam ignorados. Por isso **não foi feita reescrita destrutiva do histórico Git**; qualquer rotação de chaves continua obrigatória.
