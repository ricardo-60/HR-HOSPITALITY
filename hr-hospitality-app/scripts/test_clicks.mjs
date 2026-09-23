import { chromium } from 'playwright';
import { QA_USER, QA_PASS } from './qa_creds.mjs';

const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const tryClick = async (route, selectorOrText, label) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  const btn = page.locator(selectorOrText).first();
  try {
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    const disabled = await btn.getAttribute('disabled');
    const cls = (await btn.getAttribute('class')) || '';
    await btn.click({ timeout: 5000, force: false });
    console.log(`OK   ${route} :: ${label}`);
  } catch (e) {
    let info = '';
    try {
      const disabled = await btn.getAttribute('disabled');
      const style = await btn.evaluate(el => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return `disabled=${el.disabled} pe=${cs.pointerEvents} vis=${cs.visibility} disp=${cs.display} op=${cs.opacity} rect=${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`;
      });
      // o que cobre o centro?
      const cover = await btn.evaluate(el => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return top ? `${top.tagName}.${String(top.className).slice(0, 60)}` : 'null';
      });
      info = `${style} | topEl=${cover}`;
    } catch (e2) { info = 'nao avaliavel: ' + e2.message.slice(0, 80); }
    console.log(`FAIL ${route} :: ${label} :: ${e.message.split('\n')[0].slice(0, 90)} :: ${info}`);
  }
};

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="text"]', QA_USER);
await page.fill('input[type="password"]', QA_PASS);
await Promise.all([
  page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
  page.getByRole('button', { name: /autenticar/i }).first().click().catch(() => {}),
]);

await tryClick('/transfer', 'button:has-text("INICIAR")', 'INICIAR');
await tryClick('/transfer', 'button:has-text("AGENDADO")', 'filtro AGENDADO');
await tryClick('/lavandaria', 'button:has-text("INICIAR LAVAGEM")', 'INICIAR LAVAGEM');
await tryClick('/lavandaria', 'button:has-text("EM LAVAGEM")', 'filtro EM LAVAGEM');
await tryClick('/logistica', 'button:has-text("RELATÓRIO STOCK")', 'RELATÓRIO STOCK');
await tryClick('/logistica', 'button:has-text("VER MANIFESTO DE CARGA")', 'VER MANIFESTO');
await tryClick('/rh/empregados', 'button:has-text("REGISTAR")', 'REGISTAR');
await tryClick('/rh/empregados', 'text=Ver ficha de Ricardo Ferreira', 'Ver ficha');
await tryClick('/rh/ferias', 'button:has-text("VER HISTÓRICO")', 'VER HISTÓRICO');
await tryClick('/', 'button:has-text("Efetivar")', 'Efetivar (dashboard)');

await browser.close();
