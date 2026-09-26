-- ============================================================
--   HR-HOSPITALITY — MIGRAÇÃO 003 · FILA DE SINCRONIZAÇÃO (SQLite)
--   Fila de eventos offline -> Supabase, consumida pelo
--   src/lib/syncEngine.ts (coalescência, FIFO, retry).
-- ============================================================

CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL CHECK (table_name IN ('hotel_rooms','hotel_reservations','hotel_consumptions')),
    action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    record_id TEXT NOT NULL,
    data TEXT,
    timestamp INTEGER NOT NULL
);

-- Índices para o consumo FIFO e coalescência do syncEngine
CREATE INDEX IF NOT EXISTS idx_sync_queue_timestamp ON sync_queue(timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_record ON sync_queue(table_name, record_id);
