/**
 * E2E — Ciclo de estados do quarto (v0.2.1): RESERVADO vs OCUPADO.
 *
 * Corre contra o Servidor Local instalado (API 127.0.0.1:3002) e prova a
 * regra de negócio hotelaria ponta-a-ponta:
 *
 *   1. O enum local aceita RESERVADO (migração de arranque do 0.2.1);
 *   2. Criar uma reserva CONFIRMADA bloqueia o quarto como RESERVADO
 *      (nunca OCUPADO);
 *   3. Só o check-in presencial leva o quarto a OCUPADO;
 *   4. Cancelamento liberta o quarto para DISPONIVEL de imediato.
 *
 * Uso: node scripts/verify-room-lifecycle.js
 */

const BASE = 'http://127.0.0.1:3002/api/v1/operations';
const AUTH = 'Bearer hr-hospitality-local-fixed-token';

let pass = 0;
let fail = 0;

function check(n, label, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (ok) pass += 1; else fail += 1;
  console.log(`${mark} ${n}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function op(operation, input) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ operation, input }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* corpo não-JSON */ }
  return { status: res.status, json, text };
}

/** Envelope da API: {data: {data: rows}} para data.select. */
function rows(result) {
  return result.json?.data?.data ?? [];
}

async function roomStatus(roomId) {
  const r = await op('data.select', {
    resource: 'hotel_rooms',
    columns: ['id', 'room_number', 'status'],
    filters: [{ column: 'id', op: 'eq', value: roomId }],
    limit: 1,
  });
  return rows(r)[0] ?? null;
}

async function main() {
  console.log('--- ciclo de estados RESERVADO/OCUPADO (0.2.1) ---\n');

  // 1. Servidor no ar + quarto livre de teste.
  const health = await op('data.select', {
    resource: 'hotel_rooms',
    columns: ['id', 'room_number', 'status'],
    filters: [{ column: 'status', op: 'eq', value: 'DISPONIVEL' }],
    orderBy: [{ column: 'room_number', ascending: true }],
    limit: 1,
  });
  const room = rows(health)[0];
  check(1, 'Servidor Local no ar com catálogo de quartos', Boolean(room),
    health.status !== 200 ? `HTTP ${health.status} ${health.text.slice(0, 120)}` : `quarto ${room?.room_number}`);
  if (!room) { summary(); return; }

  // 2. Migração: o CHECK local aceita RESERVADO (bind direto do enum).
  const setReservado = await op('hotel_rooms.update', { id: room.id, status: 'RESERVADO' });
  const afterReservado = await roomStatus(room.id);
  check(2, 'Enum local aceita RESERVADO (migração de arranque)',
    setReservado.status === 200 && afterReservado?.status === 'RESERVADO',
    `op=${setReservado.status} quarto=${afterReservado?.status ?? '?'} ${setReservado.status !== 200 ? setReservado.text.slice(0, 120) : ''}`);

  const backToFree = await op('hotel_rooms.update', { id: room.id, status: 'DISPONIVEL' });
  check(3, 'Regresso a DISPONIVEL após teste de enum', backToFree.status === 200);

  // 3. Criar reserva CONFIRMADA → quarto RESERVADO (nunca OCUPADO).
  //    A estadia de quarto exige um cliente KYC (client_id/client_number).
  const clientsResult = await op('data.select', {
    resource: 'clients',
    columns: ['id', 'client_number', 'full_name'],
    limit: 1,
  });
  let client = rows(clientsResult)[0] ?? null;
  if (!client) {
    const newClient = await op('clients.create', {
      full_name: 'TESTE CICLO ESTADOS 021',
      document_type: 'BI',
      document_number: 'TESTE-CICLO-021',
    });
    client = newClient.json?.data?.data ?? null;
  }
  check(4, 'Cliente KYC disponível para a estadia de teste', Boolean(client?.client_number),
    `cliente=${client?.client_number ?? 'nenhum'}`);
  if (!client) { summary(); return; }

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  // Tenta até 5 quartos livres (a regra anti-double-booking pode recusar
  // datas já cobertas por outra reserva activa).
  const freeRooms = rows(await op('data.select', {
    resource: 'hotel_rooms',
    columns: ['id', 'room_number', 'status'],
    filters: [{ column: 'status', op: 'eq', value: 'DISPONIVEL' }],
    orderBy: [{ column: 'room_number', ascending: true }],
    limit: 5,
  }));
  let reservation = null;
  let targetRoom = null;
  let createDetail = '';
  for (const candidate of freeRooms) {
    const created = await op('hotel_reservations.create', {
      guest_name: 'TESTE CICLO ESTADOS 021',
      email: 'teste.ciclo021@teste.local',
      service_type: 'quarto',
      room_id: candidate.id,
      room_number: candidate.room_number,
      check_in_date: today,
      check_out_date: tomorrow,
      status: 'CONFIRMADA',
      total_amount: 25000,
      client_id: client.id,
      client_number: client.client_number,
    });
    const row = created.json?.data?.data ?? null;
    if (row) { reservation = row; targetRoom = candidate; break; }
    createDetail = `${created.status} ${created.text.slice(0, 140)}`;
  }
  const statusAfterCreate = reservation ? (await roomStatus(targetRoom.id))?.status : null;
  check(5, 'Reserva CONFIRMADA bloqueia o quarto como RESERVADO',
    Boolean(reservation) && statusAfterCreate === 'RESERVADO',
    `quarto=${targetRoom?.room_number ?? '?'} estado=${statusAfterCreate ?? '?'} ${reservation ? '' : createDetail}`);

  if (reservation) {
    // 4. Check-in presencial → OCUPADO.
    const checkIn = await op('hotel_reservations.checkIn', { id: reservation.id });
    const statusAfterCheckIn = (await roomStatus(targetRoom.id))?.status;
    check(6, 'Check-in presencial transita o quarto para OCUPADO',
      checkIn.status === 200 && statusAfterCheckIn === 'OCUPADO',
      `op=${checkIn.status} quarto=${statusAfterCheckIn} ${checkIn.status !== 200 ? checkIn.text.slice(0, 120) : ''}`);

    // 5. Cancelamento (ou check-out) liberta o quarto de imediato.
    const cancel = await op('hotel_reservations.cancel', { id: reservation.id });
    let finalStatus = (await roomStatus(targetRoom.id))?.status;
    if (cancel.status !== 200) {
      // Estado não cancelável (ex.: já CHECKED_OUT) — fecha por check-out.
      const checkOut = await op('hotel_reservations.checkOut', { id: reservation.id });
      finalStatus = (await roomStatus(targetRoom.id))?.status;
      check(7, 'Fecho liberta o quarto (cancel ou check-out)',
        checkOut.status === 200 && (finalStatus === 'DISPONIVEL' || finalStatus === 'LIMPEZA'),
        `op(checkOut)=${checkOut.status} quarto=${finalStatus}`);
    } else {
      check(7, 'Cancelamento liberta o quarto para DISPONIVEL de imediato',
        finalStatus === 'DISPONIVEL', `quarto=${finalStatus}`);
    }
  }

  summary();
}

function summary() {
  console.log(`\n${fail === 0 ? 'TUDO OK' : 'FALHAS'}: ${pass}/${pass + fail} PASS`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch(err => {
  console.error('ERRO FATAL:', err);
  process.exitCode = 1;
});
