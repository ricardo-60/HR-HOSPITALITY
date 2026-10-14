#!/usr/bin/env node
/**
 * Observador Realtime (anon) — valida o pipeline Supabase → clientes.
 *
 * Uso: node realtime-observer.mjs   (correr de hr-hospitality-mobile)
 *
 * Fica em escuta de `hotel_rooms`, `hotel_reservations` e `room_rates` e
 * imprime cada evento com timestamp. É o "gémeo" do watcher do app
 * (src/lib/realtime.ts): a mesma createClient + canal anon, provando que a
 * canal SUBSCRIBE e entrega eventos a partir desta rede. Se alterar um preço
 * ou estado na BD (dashboard Supabase ou SQL), o evento aparece aqui em
 * segundos — e na landing/app assim que os handlers correm.
 */
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

// Variáveis EXPO_PUBLIC_* do .env do projecto.
const env = Object.fromEntries(
  readFileSync(new URL('./.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(line => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 5 } },
});

const ts = () => new Date().toISOString();
const TABLES = ['hotel_rooms', 'hotel_reservations', 'room_rates'];

const channel = supabase.channel(`observer#${Date.now().toString(36)}`);
for (const table of TABLES) {
  channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
    const detail =
      payload.eventType === 'DELETE'
        ? '(apenas old/PK)'
        : JSON.stringify({
            status: payload.new?.status,
            price_per_night: payload.new?.price_per_night,
            room_number: payload.new?.room_number,
          });
    console.log(
      `[${ts()}] EVENTO ${table} ${payload.eventType} id=${payload.new?.id ?? payload.old?.id ?? '?'} ${detail}`,
    );
  });
}

channel.subscribe((status) => {
  console.log(`[${ts()}] canal -> ${status}`);
  if (status === 'SUBSCRIBED') {
    console.log(`[${ts()}] OBSERVADOR ARMADO (${TABLES.join(', ')}) — altere um preço/estado na BD para ver o evento.`);
  } else if (status !== 'SUBSCRIBED') {
    console.log(`[${ts()}] atenção: estado ${status} — sem entrega de eventos de momento.`);
  }
});

process.on('SIGINT', () => {
  void supabase.removeChannel(channel).then(() => process.exit(0));
});

// Mantém o processo vivo.
setInterval(() => {}, 1 << 30);
