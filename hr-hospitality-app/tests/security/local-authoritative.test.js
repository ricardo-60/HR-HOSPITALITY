/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Regressão do split-brain (Supabase Cloud vs SQLite local).
 *
 * O registo operacional fechado (`RESOURCE_SPECS` em electron/operations.js) é
 * a fonte de verdade do hotel. A camada híbrida tem de tratar EXACTAMENTE as
 * mesmas tabelas como locais (src/lib/localAuthoritativeTables.ts): se as duas
 * listas divergirem, volta a ler da nuvem — onde não existem as colunas de
 * associação ao cliente nem as tabelas do CRM/KYC — e o Dashboard volta a
 * mostrar reservas fantasma que o módulo de Alojamento não consegue cancelar.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');

/** Chaves do registo fechado de recursos (a fonte de verdade das tabelas). */
function registryTables() {
  const src = fs.readFileSync(path.join(ROOT, 'electron/operations.js'), 'utf8');
  const specStart = src.indexOf('RESOURCE_SPECS');
  const specEnd = src.indexOf('\n};', specStart);
  assert.ok(specStart >= 0 && specEnd > specStart, 'RESOURCE_SPECS encontrado em operations.js');
  const spec = src.slice(specStart, specEnd);
  return [...spec.matchAll(/^\s{2}([a-z_0-9]+):\s*Object\.freeze\(\{/gm)].map(m => m[1]).sort();
}

/** Tabelas marcadas como locais na camada de dados (ficheiro TS, lido como texto). */
function localAuthoritativeTables() {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/localAuthoritativeTables.ts'), 'utf8');
  const body = src.slice(src.indexOf('new Set(['), src.indexOf(']);', src.indexOf('new Set([')));
  return [...body.matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]).sort();
}

test('o registo fechado tem tabelas e a lista local espelha-o exactamente', () => {
  const registry = registryTables();
  const local = localAuthoritativeTables();

  assert.ok(registry.length >= 9, `esperadas >= 9 tabelas no registo, obtidas ${registry.length}`);
  assert.deepEqual(
    local,
    registry,
    'LOCAL_AUTHORITATIVE_TABLES tem de conter exactamente as tabelas de RESOURCE_SPECS'
  );
  assert.ok(local.includes('hotel_reservations') && local.includes('hotel_rooms'));
});

test('a camada de dados bloqueia a nuvem para as tabelas do registo', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/dataLayer.ts'), 'utf8');
  assert.match(
    src,
    /if \(isLocalAuthoritativeTable\(this\.tableName\)\) return false;/,
    'canTryCloud() tem de recusar a nuvem para o registo operacional'
  );
});

test('o motor de sync deixa de empurrar o registo operacional para a nuvem', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/syncEngine.ts'), 'utf8');
  assert.doesNotMatch(
    src,
    /const SYNC_TABLES = new Set\(\['hotel_rooms'/,
    'SYNC_TABLES não pode ser fixa: tem de derivar de localAuthoritativeTables'
  );
  assert.match(
    src,
    /isLocalAuthoritativeTable/,
    'SYNC_TABLES tem de ser filtrada pela lista local'
  );
});
