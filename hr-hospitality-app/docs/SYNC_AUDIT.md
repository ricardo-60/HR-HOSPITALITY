# Auditoria da Fila de Sincronização (`sync_queue`) — 2026-09-21

## 1. Escopo

Auditoria do mecanismo offline-first: `dataLayer.ts`, `syncEngine.ts`,
`electron/server.js` (Express + node:sqlite, porta 3002) e schema
`HOSPITALITY_LOCAL_SQLITE.sql`.

## 2. Achados e correções

| # | Achado | Severidade | Estado |
|---|---|---|---|
| A1 | **Fila gravada mas nunca consumida** — `executeLocalWrite()` enfileirava eventos em `sync_queue`, mas não existia qualquer lógica que os enviasse ao Supabase quando a conexão voltava. Dados offline ficavam presos no SQLite para sempre. | 🔴 Crítico | ✅ Corrigido — novo `src/lib/syncEngine.ts` |
| A2 | Sem deduplicação: um registo editado 10× offline geraria 10 eventos a reproduzir (e 10 upserts à nuvem). | 🟡 Média | ✅ Corrigido — coalescência por `(table_name, record_id)`, mantendo o estado final |
| A3 | Eventos processados nunca eram removidos da fila (crescimento ilimitado). | 🟡 Média | ✅ Corrigido — delete pós-sucesso + marcação `sync_status='synced'` |
| A4 | Falha num evento não interrompia com ordem preservada (não havia loop de consumo). | 🟡 Média | ✅ Corrigido — consumo FIFO com paragem em falha e retry no próximo ciclo |
| A5 | Registros órfãos (`sync_status='pending'` sem evento na fila) invisíveis. | 🟢 Baixa | ✅ Coberto — `getSyncStats()` conta órfãos como `failed` latente |
| A6 | `/api/db/execute` e `/api/db/query` aceitam SQL arbitrário e o servidor escutava em `0.0.0.0` (toda a rede local). | 🟠 Média/Alta | ✅ Corrigido — bind por defeito em `127.0.0.1`; exposição LAN apenas com opt-in `HOSPITALITY_HOST=0.0.0.0` (com aviso no log). Migração para IPC do Electron recomendada a longo prazo |
| A7 | Limite de 50 eventos por ciclo (`MAX_ATTEMPTS_PER_CYCLE`) evita bloquear o browser em filas grandes; ciclos subsequentes continuam. | — | ℹ️ Decisão de desenho |

## 3. Fluxo de reconciliação implementado

```
[offline] escrita local → SQLite (sync_status='pending')
                        → INSERT em sync_queue
[reconexão] evento 'online' / timer 60s / pós-escrita
            → flushSyncQueue():
                1. SELECT * FROM sync_queue ORDER BY timestamp ASC
                2. coalesce: último evento por (tabela, registo)
                3. para cada evento:
                   INSERT/UPDATE → supabase.upsert(payload, onConflict:'id')
                   DELETE        → supabase.delete().eq('id', record_id)
                4. sucesso → DELETE FROM sync_queue WHERE id=?
                            + UPDATE tabela SET sync_status='synced'
                5. falha   → break (ordem preservada), retry no próximo ciclo
```

## 4. Validação executada

Teste funcional contra o servidor real (`node electron/server.js`, base de
dados de teste isolada no scratchpad):

| Teste | Resultado |
|---|---|
| `GET /api/health` responde `{status:"ok"}` | ✅ |
| Schema carregado automaticamente em BD nova | ✅ |
| Criação da tabela `sync_queue` (DDL via endpoint) | ✅ |
| Enfileirar evento INSERT | ✅ (`changes:1`) |
| Leitura FIFO (`ORDER BY timestamp ASC`) | ✅ |
| Reconciliação (DELETE do evento processado) | ✅ (`changes:1`) |
| Fila vazia após processamento (`COUNT=0`) | ✅ |
| `npx tsc --noEmit` (build de tipos) | ✅ 0 erros |

⚠️ O push real ao Supabase não foi disparado no teste para não alterar dados
de produção na nuvem; a validação cobriu o ciclo local completo da fila
(enfileirar → ler → processar → limpar). Em produção, monitorizar via
`getSyncStats()`.

## 5. Relatório de integridade (como consultar em runtime)

```ts
import { getSyncStats } from '@/lib/syncEngine';

const stats = await getSyncStats();
// {
//   pending: 3,                    // eventos na fila à espera de sync
//   failed: 0,                     // órfãos/erros latentes
//   byTable: { hotel_reservations: 3 },
//   oldestEvent: 1729990000000,    // evento mais antigo pendente
//   lastFlushAt: 1729990500000,
//   lastFlushResult: 'success',    // success | partial | error | offline
//   lastFlushSynced: 12,
//   lastFlushFailed: 0,
//   lastError: null
// }
```

Sinais de alerta a monitorizar:
- `pending` crescente com `lastFlushResult: 'error'` → problema de conectividade ou schema divergente (ver `lastError`).
- `failed > 0` → registos marcados `pending` sem evento na fila — exigem re-enfileiração manual.
- `oldestEvent` com mais de algumas horas → sincronização parada.
