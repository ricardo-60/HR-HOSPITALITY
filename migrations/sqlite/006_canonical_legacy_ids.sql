-- ============================================================
-- HR-HOSPITALITY — MIGRAÇÃO 006 · IDs CANÓNICOS
-- Converte apenas IDs de demonstração legados para UUIDs estáveis.
-- Execute após 005, com a aplicação parada.
-- ============================================================

PRAGMA defer_foreign_keys = ON;

UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000101'
WHERE room_id = 'room-101' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000101'
);
UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000102'
WHERE room_id = 'room-102' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000102'
);
UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000103'
WHERE room_id = 'room-103' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000103'
);
UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000104'
WHERE room_id = 'room-104' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000104'
);
UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000201'
WHERE room_id = 'room-201' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000201'
);
UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000202'
WHERE room_id = 'room-202' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000202'
);
UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000203'
WHERE room_id = 'room-203' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000203'
);
UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000204'
WHERE room_id = 'room-204' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000204'
);
UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000301'
WHERE room_id = 'room-301' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000301'
);
UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000302'
WHERE room_id = 'room-302' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000302'
);
UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000303'
WHERE room_id = 'room-303' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000303'
);
UPDATE hotel_reservations
SET room_id = 'a1111111-1111-4111-8111-000000000304'
WHERE room_id = 'room-304' AND NOT EXISTS (
  SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000304'
);

UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000101' WHERE id = 'room-101' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000101');
UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000102' WHERE id = 'room-102' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000102');
UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000103' WHERE id = 'room-103' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000103');
UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000104' WHERE id = 'room-104' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000104');
UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000201' WHERE id = 'room-201' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000201');
UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000202' WHERE id = 'room-202' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000202');
UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000203' WHERE id = 'room-203' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000203');
UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000204' WHERE id = 'room-204' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000204');
UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000301' WHERE id = 'room-301' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000301');
UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000302' WHERE id = 'room-302' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000302');
UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000303' WHERE id = 'room-303' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000303');
UPDATE hotel_rooms SET id = 'a1111111-1111-4111-8111-000000000304' WHERE id = 'room-304' AND NOT EXISTS (SELECT 1 FROM hotel_rooms WHERE id = 'a1111111-1111-4111-8111-000000000304');

UPDATE hotel_consumptions SET reservation_id = 'b2222222-2222-4222-8222-000000000001' WHERE reservation_id = 'res-demo-1';
UPDATE hotel_consumptions SET reservation_id = 'b2222222-2222-4222-8222-000000000002' WHERE reservation_id = 'res-demo-2';
UPDATE hotel_consumptions SET reservation_id = 'b2222222-2222-4222-8222-000000000003' WHERE reservation_id = 'res-demo-3';
UPDATE hotel_consumptions SET reservation_id = 'b2222222-2222-4222-8222-000000000004' WHERE reservation_id = 'res-demo-4';

UPDATE hotel_reservations SET id = 'b2222222-2222-4222-8222-000000000001' WHERE id = 'res-demo-1' AND NOT EXISTS (SELECT 1 FROM hotel_reservations WHERE id = 'b2222222-2222-4222-8222-000000000001');
UPDATE hotel_reservations SET id = 'b2222222-2222-4222-8222-000000000002' WHERE id = 'res-demo-2' AND NOT EXISTS (SELECT 1 FROM hotel_reservations WHERE id = 'b2222222-2222-4222-8222-000000000002');
UPDATE hotel_reservations SET id = 'b2222222-2222-4222-8222-000000000003' WHERE id = 'res-demo-3' AND NOT EXISTS (SELECT 1 FROM hotel_reservations WHERE id = 'b2222222-2222-4222-8222-000000000003');
UPDATE hotel_reservations SET id = 'b2222222-2222-4222-8222-000000000004' WHERE id = 'res-demo-4' AND NOT EXISTS (SELECT 1 FROM hotel_reservations WHERE id = 'b2222222-2222-4222-8222-000000000004');

UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000101' WHERE table_name = 'hotel_rooms' AND record_id = 'room-101';
UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000102' WHERE table_name = 'hotel_rooms' AND record_id = 'room-102';
UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000103' WHERE table_name = 'hotel_rooms' AND record_id = 'room-103';
UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000104' WHERE table_name = 'hotel_rooms' AND record_id = 'room-104';
UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000201' WHERE table_name = 'hotel_rooms' AND record_id = 'room-201';
UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000202' WHERE table_name = 'hotel_rooms' AND record_id = 'room-202';
UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000203' WHERE table_name = 'hotel_rooms' AND record_id = 'room-203';
UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000204' WHERE table_name = 'hotel_rooms' AND record_id = 'room-204';
UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000301' WHERE table_name = 'hotel_rooms' AND record_id = 'room-301';
UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000302' WHERE table_name = 'hotel_rooms' AND record_id = 'room-302';
UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000303' WHERE table_name = 'hotel_rooms' AND record_id = 'room-303';
UPDATE sync_queue SET record_id = 'a1111111-1111-4111-8111-000000000304' WHERE table_name = 'hotel_rooms' AND record_id = 'room-304';
UPDATE sync_queue SET record_id = 'b2222222-2222-4222-8222-000000000001' WHERE table_name = 'hotel_reservations' AND record_id = 'res-demo-1';
UPDATE sync_queue SET record_id = 'b2222222-2222-4222-8222-000000000002' WHERE table_name = 'hotel_reservations' AND record_id = 'res-demo-2';
UPDATE sync_queue SET record_id = 'b2222222-2222-4222-8222-000000000003' WHERE table_name = 'hotel_reservations' AND record_id = 'res-demo-3';
UPDATE sync_queue SET record_id = 'b2222222-2222-4222-8222-000000000004' WHERE table_name = 'hotel_reservations' AND record_id = 'res-demo-4';
UPDATE sync_queue SET data = replace(replace(replace(replace(data, 'room-101', 'a1111111-1111-4111-8111-000000000101'), 'room-102', 'a1111111-1111-4111-8111-000000000102'), 'room-103', 'a1111111-1111-4111-8111-000000000103'), 'room-104', 'a1111111-1111-4111-8111-000000000104') WHERE data LIKE '%room-10%';
UPDATE sync_queue SET data = replace(replace(data, 'res-demo-1', 'b2222222-2222-4222-8222-000000000001'), 'res-demo-2', 'b2222222-2222-4222-8222-000000000002') WHERE data LIKE '%res-demo-%';
