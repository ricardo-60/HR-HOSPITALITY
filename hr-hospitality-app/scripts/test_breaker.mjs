import { chromium } from 'playwright';
import { QA_USER, QA_PASS } from './qa_creds.mjs';

const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

let count404 = 0;
page.on('response', r => {
  if (r.status() === 404 && r.url().includes('supabase.co/rest')) {
    count404++;
    console.log('  404:', r.url().split('supabase.co')[1]);
  }
});

// login
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.fill('input[type="text"]', QA_USER).catch(() => {});
await page.fill('input[type="password"]', QA_PASS).catch(() => {});
await Promise.all([
  page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
  page.getByRole('button', { name: /autenticar/i }).first().click().catch(() => {}),
]);
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
console.log('URL:', page.url());
console.log('404s visita 1:', count404);
console.log('localStorage:', await page.evaluate(() => localStorage.getItem('hr_cloud_missing_tables')));

// segunda visita à dashboard (mesmo contexto)
count404 = 0;
await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
console.log('404s visita 2:', count404);
console.log('localStorage:', await page.evaluate(() => localStorage.getItem('hr_cloud_missing_tables')));

await browser.close();
