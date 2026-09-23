import { chromium } from 'playwright';
import { QA_USER, QA_PASS } from './qa_creds.mjs';

const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="text"]', QA_USER);
await page.fill('input[type="password"]', QA_PASS);
await Promise.all([
  page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
  page.getByRole('button', { name: /autenticar/i }).first().click().catch(() => {}),
]);

// 1. "Ver ficha" via aria-label correto
await page.goto(`${BASE}/rh/empregados`, { waitUntil: 'networkidle' });
try {
  await page.locator('button[aria-label="Ver ficha de Ricardo Ferreira"]').click({ timeout: 8000 });
  await page.waitForTimeout(800);
  const modal = await page.locator('text=Ficha do Colaborador, text=Ocorrências').first().isVisible().catch(() => false);
  console.log('Ver ficha (aria-label): OK, modal visível =', modal);
} catch (e) {
  console.log('Ver ficha (aria-label): FAIL —', e.message.split('\n')[0].slice(0, 120));
}

// 2. Registar ocorrência com texto preenchido
await page.fill('textarea[placeholder*="falta justificada"]', 'Teste QA automatizado');
const btn = page.locator('button:has-text("Registar")').first();
console.log('Registar disabled com texto =', await btn.getAttribute('disabled'));
await btn.click({ timeout: 5000 }).catch(e => console.log('click Registar FAIL:', e.message.split('\n')[0]));
await page.waitForTimeout(500);
const tem = await page.locator('text=Teste QA automatizado').count();
console.log('Ocorrência gravada na lista =', tem > 0);
// limpar: recarregar (ocorrências persistidas? se persistidas, remover via localStorage)
await page.evaluate(() => {
  try {
    const k = 'rh_ocorrencias';
    const raw = localStorage.getItem(k);
    if (raw) {
      const arr = JSON.parse(raw).filter(x => !String(x).includes('Teste QA automatizado'));
      localStorage.setItem(k, JSON.stringify(arr));
    }
  } catch {}
});

// 3. Registar disabled com textarea vazia (comportamento esperado)
await page.fill('textarea[placeholder*="falta justificada"]', '');
console.log('Registar disabled com vazio =', await btn.getAttribute('disabled'));

await browser.close();
