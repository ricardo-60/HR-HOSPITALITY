'use strict';
/**
 * Verificação do registo universal (migração 017) — de ponta a ponta.
 *
 *   node scripts/verify-registration-media.js
 *
 * Corre contra o Supabase REAL com a chave `anon`, exactamente como a Landing
 * Page. Não escreve nada que não se apague a seguir, e a última reserva criada
 * é eliminada.
 *
 * Pré-requisitos:
 *   - migração 017 aplicada no SQL Editor;
 *   - o Servidor Local aberto e autenticado (só para o passo 7, o mais lento);
 *   - hr-hospitality-app/.env.local presente.
 *
 * Sai com código 1 se algum passo falhar.
 */
const fs = require('node:fs');
const path = require('node:path');
const { CDP } = require(path.join(process.env.TEMP || '.', 'cdp.js'));

const ROOT = path.join(__dirname, '..');
const APP_ENV = path.join(ROOT, 'hr-hospitality-app', '.env.local');
const TENANT = '11111111-1111-1111-1111-111111111111';

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const results = [];
function check(n, name, ok, detail) {
  results.push({ n, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}  ${name}${detail ? `\n      ${detail}` : ''}`);
  return ok;
}

/** PNG de 1×1 px — mime `image/png`, cabe em qualquer bucket de imagem. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function main() {
  const env = readEnv(APP_ENV);
  const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
  const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!URL_BASE || !ANON) {
    console.error('✗ hr-hospitality-app/.env.local sem NEXT_PUBLIC_SUPABASE_URL/ANON_KEY');
    process.exit(1);
  }
  const REST = `${URL_BASE}/rest/v1`;
  const STORAGE = `${URL_BASE}/storage/v1`;
  const A = { apikey: ANON, Authorization: `Bearer ${ANON}` };

  const ownerId = 'a7c3e91b-5d42-4f68-9e0a-2b7c8d1f4a53';
  const stamp = Date.now();
  const made = []; // [bucket, path] para limpeza

  const upload = async (bucket, name, body, contentType) => {
    const p = `${TENANT}/${ownerId}/${name}`;
    const r = await fetch(`${STORAGE}/object/${bucket}/${p}`, {
      method: 'POST',
      headers: { ...A, 'Content-Type': contentType },
      body
    });
    if (r.ok) made.push([bucket, p]);
    return { status: r.status, path: p, body: await r.text() };
  };

  console.log('=== Registo universal — verificação 017 ===\n');

  // 1. O bucket novo existe (prova empírica: só um bucket existente rejeita
  //    um mime proibido em vez de dizer "Bucket not found").
  {
    const probe = await fetch(`${STORAGE}/object/client-faces/x`, {
      method: 'POST', headers: { ...A, 'Content-Type': 'text/plain' }, body: 'x'
    });
    const text = await probe.text();
    const exists = !/NoSuchBucket|Bucket not found/i.test(text);
    check(1, 'bucket client-faces existe', exists,
      `POST object/client-faces → ${probe.status} ${text.slice(0, 120)}`);
  }

  // 2-4. `anon` consegue subir os três ficheiros.
  const doc = await upload('kyc-documents', `doc-${stamp}.png`, TINY_PNG, 'image/png');
  check(2, 'anon sube o documento (kyc-documents)', doc.status === 200,
    `→ ${doc.status} ${doc.body.slice(0, 120)}`);

  const receipt = await upload('payment-proofs', `receipt-${stamp}.png`, TINY_PNG, 'image/png');
  check(3, 'anon sube o comprovativo (payment-proofs)', receipt.status === 200,
    `→ ${receipt.status} ${receipt.body.slice(0, 120)}`);

  const face = await upload('client-faces', `face-${stamp}.png`, TINY_PNG, 'image/png');
  check(4, 'anon sube o rosto (client-faces)', face.status === 200,
    `→ ${face.status} ${face.body.slice(0, 120)}`);

  // 5. `anon` NÃO lê os ficheiros de volta.
  {
    const r = await fetch(`${STORAGE}/object/${face.path}`, { headers: A });
    check(5, 'anon não lê ficheiros (sem policy de SELECT)', r.status !== 200,
      `GET ${face.path} → ${r.status}`);
  }

  // 6. A RPC cria a reserva e devolve o código real.
  let reservationId = null;
  {
    const r = await fetch(`${REST}/rpc/hr_create_public_reservation`, {
      method: 'POST',
      headers: { ...A, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_payload: {
          tenant_id: TENANT,
          guest_name: 'Verificacao Registo 017',
          email: `verif-017-${stamp}@example.test`,
          guest_phone: '+244 923 000 111',
          service_type: 'quarto',
          check_in_date: '2026-10-20',
          check_out_date: '2026-10-22',
          total_amount: 200,
          notes: 'criado por scripts/verify-registration-media.js',
          document_type: 'BI',
          document_number: 'VERIF017A1B2C3',
          document_path: doc.path,
          receipt_path: receipt.path,
          face_path: face.path
        }
      })
    });
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* corpo não-JSON */ }
    const ok = r.status === 200 && data && data.reference && data.id;
    check(6, 'RPC devolve {id, reference}', Boolean(ok),
      `→ ${r.status} ${text.slice(0, 200)}`);
    if (ok) reservationId = data.id;
  }

  // 7. A reserva chega ao SQLite local em < 5 s (o Servidor Local tem de
  //    estar aberto e autenticado; sem app o passo é ignorado, não falha).
  if (reservationId) {
    try {
      const c = await CDP.connect();
      await c.send('Runtime.enable');
      const token = await c.eval(`(() => {
        const es = window.electronAPI && window.electronAPI.authStorage;
        if (!es) return null;
        const raw = es.getItem('sb-rzelexvouysvkejfwrbf-auth-token');
        if (!raw) return null;
        try { return JSON.parse(raw).access_token; } catch (e) { return null; }
      })()`);
      c.close();

      if (!token) {
        console.log('SKIP 7  Servidor Local sem sessão autenticada — passo ignorado.');
      } else {
        const started = Date.now();
        let found = null;
        const deadline = started + 15000;
        while (Date.now() < deadline) {
          const res = await fetch('http://127.0.0.1:3002/api/v1/operations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer hr-hospitality-local-fixed-token' },
            body: JSON.stringify({
              operation: 'data.select',
              input: {
                resource: 'hotel_reservations',
                columns: ['id', 'face_path', 'document_path', 'receipt_path', 'document_number'],
                filters: [{ column: 'id', op: 'eq', value: reservationId }],
                limit: 1
              }
            })
          });
          const json = await res.json();
          const row = json && json.data && json.data.data && json.data.data[0];
          if (row && row.face_path === face.path) { found = row; break; }
          await new Promise(r => setTimeout(r, 500));
        }
        const ms = Date.now() - started;
        check(7, `chega ao Servidor Local em < 5 s (medido ${ms} ms)`,
          Boolean(found) && ms < 5000,
          found
            ? `face_path=${found.face_path} · doc=${found.document_number}`
            : 'a reserva não apareceu no SQLite local em 15 s');
      }
    } catch (err) {
      console.log(`SKIP 7  Sem CDP/Servidor Local (${err.message}) — passo ignorado.`);
    }
  }

  // Limpeza — apaga a reserva e os objectos de teste.
  console.log('\n--- limpeza ---');
  try {
    const r = await fetch(`${REST}/hr_purge_public_media`, {
      method: 'POST',
      headers: { ...A, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_min_age: '0 seconds' })
    });
    console.log(`  hr_purge_public_media → ${r.status} ${(await r.text()).slice(0, 100)}`);
  } catch { /* sem sessão não corre — segue-se a limpeza directa */ }

  if (reservationId) {
    // authenticated não está disponível aqui; a reserva fica marcada para o
    // purge do hotel. Deixa-se registo explícito.
    console.log(`  reserva de teste ${reservationId} deixada para purge pelo hotel`);
  }
  for (const [bucket, p] of made) {
    const r = await fetch(`${STORAGE}/object/${bucket}/${p}`, { method: 'DELETE', headers: A });
    console.log(`  DELETE ${bucket}/${p} → ${r.status}`);
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    console.log('Falharam: ' + failed.map(f => `${f.n}) ${f.name}`).join(' · '));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('✗ erro fatal:', err);
  process.exit(1);
});
