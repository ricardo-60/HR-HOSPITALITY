import { chromium } from 'playwright';
import { QA_USER, QA_PASS } from './qa_creds.mjs';

const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text().slice(0, 300)); });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 500)));

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2000);

const inputs = await page.locator('input').all();
console.log('inputs:', inputs.length);
for (const i of inputs) console.log(' -', await i.getAttribute('id'), '|type=', await i.getAttribute('type'), '|ph=', await i.getAttribute('placeholder'));

await page.fill('input#id, input[placeholder*="EMP"], input[name="id"], input[type="text"]', QA_USER).catch(e => console.log('fill id failed:', e.message));
await page.fill('input[type="password"]', QA_PASS).catch(e => console.log('fill pw failed:', e.message));

const btns = await page.locator('button').all();
for (const b of btns) console.log('btn:', (await b.innerText()).replace(/\n/g, ' ').slice(0, 60), '| visible=', await b.isVisible());

await Promise.all([
  page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 15000 }).catch(() => {}),
  page.getByRole('button', { name: /autenticar|entrar|login|aceder/i }).first().click().catch(async e => {
    console.log('click failed:', e.message.slice(0, 120), '-> fallback Enter');
    await page.keyboard.press('Enter').catch(() => {});
  }),
]);
await page.waitForTimeout(1000);
if (page.url().includes('/login')) {
  console.log('Ainda no login, tento submeter via Enter...');
  await Promise.all([
    page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 10000 }).catch(() => {}),
    page.keyboard.press('Enter').catch(() => {}),
  ]);
}
await page.waitForTimeout(2500);
console.log('URL final:', page.url());
const err = await page.locator('text=/credenciais|bloqueada|erro/i').allInnerTexts().catch(() => []);
console.log('mensagens ecrã:', JSON.stringify(err));
await page.screenshot({ path: 'C:/Users/HP/AppData/Local/Temp/opencode/debug-login.png', fullPage: false });
await browser.close();
