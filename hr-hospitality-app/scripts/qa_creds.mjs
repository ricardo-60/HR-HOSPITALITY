/**
 * Credenciais de QA — NUNCA versionadas.
 * Fonte: variáveis de ambiente (QA_USER / QA_PASS) ou o ficheiro local
 * hr-hospitality-app/.env.qa (gitignored). Não escrever segredos em código.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, '..', '.env.qa');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

export const QA_USER = process.env.QA_USER || '';
export const QA_PASS = process.env.QA_PASS || '';

if (!QA_USER || !QA_PASS) {
  console.error(
    'ERRO: credenciais de QA em falta. Defina QA_USER e QA_PASS ' +
      '(variável de ambiente ou ficheiro hr-hospitality-app/.env.qa).'
  );
  process.exit(1);
}
