/**
 * QA AUDIT — varredura automatizada de 100% das rotas da aplicação.
 *
 * Para cada rota:
 *   1. Carrega a página e captura erros de console, exceções de runtime,
 *      falhas de rede e respostas HTTP >= 400.
 *   2. Tira screenshot inicial (inspeção visual).
 *   3. Clica botões "seguros" (filtros/abas/abertura de modais) e deteta
 *      botões MORTOS (clique não altera URL, DOM, nem abre diálogo).
 *   4. Fecha modais abertos (Escape) e volta a screenshotar.
 *   5. Submete formulários VAZIOS para validar mensagens de erro.
 *
 * Uso: node scripts/qa_audit.mjs [--base=http://localhost:3000]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { QA_USER, QA_PASS } from './qa_creds.mjs';

const BASE = (process.argv.find(a => a.startsWith('--base=')) || '--base=http://localhost:3000').split('=')[1];
const OUT = path.resolve('qa-audit');
fs.mkdirSync(OUT, { recursive: true });

/** Rotas completas do sistema (100% dos módulos). */
const ROUTES = [
  ['dashboard', '/'],
  ['login', '/login'],
  ['alojamento', '/alojamento'],
  ['checkin360', '/alojamento/checkin'],
  ['pos', '/pos'],
  ['snack-bar', '/snack-bar'],
  ['rh-painel', '/rh'],
  ['rh-empregados', '/rh/empregados'],
  ['rh-escalas', '/rh/escalas'],
  ['rh-ferias', '/rh/ferias'],
  ['rh-picagem', '/rh/picagem'],
  ['rh-saidas', '/rh/saidas'],
  ['rh-salarios', '/rh/salarios'],
  ['rh-usuarios', '/rh/usuarios'],
  ['lavandaria', '/lavandaria'],
  ['spa', '/spa'],
  ['parque', '/parque'],
  ['transfer', '/transfer'],
  ['eventos', '/eventos'],
  ['logistica', '/logistica'],
  ['facilities', '/facilities'],
  ['configuracoes', '/configuracoes'],
  ['ajuda', '/ajuda'],
  ['cadastro', '/cadastro'],
  ['alterar-palavra-passe', '/alterar-palavra-passe'],
];

/** Botões NUNCA clicados (ações destrutivas/irreversíveis/sessão). */
const DANGEROUS = /(exclu|apagar|elimin|remover|delete|sair|logout|confirm|guardar|salvar|submeter|pagar|finalizar|checkout|fechar conta|lançar|lancar)/i;
/** Botões candidatos a clique (filtros, abas, abertura de detalhe/modal). */
const SAFE = /^(todos|livre|ocupado|em curso|agendado|conclu|recolhido|em lavagem|pronto|entregue|pendente|ativo|bloqueado|filtrar|ver|detalhe|editar|novo|nova|adicionar|abrir|ajuda|manual|suporte|primeira|segunda|terceira|configura|rede local|snack bar|admin|ricardo|ana sousa|joão|joao)/i;
/** Textos de botões considerados inócuos por natureza (fechar/cancelar/escape). */
const NEUTRAL = /^(fechar|cancelar|x|\+|‹|›|<<|>>|anterior|próximo|proximo)$/i;

const report = [];
let globalSeq = 0;

function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'sem-texto';
}

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // ---- coletores de erro (sempre ativos) ----
  const issues = [];
  const attach = (route) => {
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        const t = msg.text();
        // Ruído conhecido/irrelevante filtrado explicitamente
        if (/Download the React DevTools/i.test(t)) return;
        issues.push({ route, kind: `console.${msg.type()}`, text: t.slice(0, 500) });
      }
    });
    page.on('pageerror', err => issues.push({ route, kind: 'pageerror', text: String(err).slice(0, 500) }));
    page.on('requestfailed', req => {
      const f = req.failure();
      // cancelamentos de navegação interna são normais
      if (f && /ERR_ABORTED/.test(f.errorText)) return;
      issues.push({ route, kind: 'requestfailed', text: `${req.method()} ${req.url()} :: ${f ? f.errorText : '?'}` });
    });
    page.on('response', res => {
      if (res.status() >= 400) issues.push({ route, kind: `http.${res.status()}`, text: `${res.request().method()} ${res.url()}` });
    });
  };
  attach('global');

  const shot = async (name) => {
    const file = path.join(OUT, `${String(++globalSeq).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: false }).catch(() => {});
    return path.basename(file);
  };

  // ---- 1. LOGIN com a conta Master ----
  console.log('== LOGIN ==');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await shot('login');
  await page.fill('input#id, input[placeholder*="EMP"], input[name="id"], input[type="text"]', QA_USER).catch(() => {});
  const pwdSel = 'input[type="password"]';
  await page.fill(pwdSel, QA_PASS).catch(() => {});
  await shot('login-preenchido');
  await Promise.all([
    page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 }).catch(() => {}),
    page.getByRole('button', { name: /autenticar|entrar|login|aceder/i }).first().click().catch(() => {
      return page.keyboard.press('Enter').catch(() => {});
    }),
  ]);
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  const loggedIn = !page.url().includes('/login');
  console.log(loggedIn ? `  OK -> ${page.url()}` : '  FALHOU o login!');
  await shot(loggedIn ? 'pós-login' : 'LOGIN-FALHOU');

  // ---- 2. VARREDURA ROTA A ROTA ----
  for (const [key, route] of ROUTES) {
    console.log(`== ${key} (${route}) ==`);
    const mark = issues.length;
    const entry = { route, key, status: 'OK', shots: [], deadButtons: [], forms: [], notes: [] };

    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
    } catch (e) {
      entry.status = 'ERRO-NAVEGACAO';
      entry.notes.push(String(e).slice(0, 300));
    }
    await page.waitForTimeout(1200);
    entry.shots.push(await shot(`${key}-inicial`));

    // Rede/estado global da página
    const info = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.innerText?.trim().slice(0, 80) || '';
      const dialog = [...document.querySelectorAll('[role="dialog"], dialog, .modal')].some(d => d.offsetParent !== null);
      return { h1, dialog, bodyLen: document.body?.innerText?.length || 0, title: document.title };
    });
    entry.h1 = info.h1;
    if (info.bodyLen < 100) { entry.status = 'ERRO-RENDER'; entry.notes.push(`body quase vazio (${info.bodyLen} chars)`); }

    // Botões visíveis
    const buttons = await page.evaluate(() => {
      return [...document.querySelectorAll('button, [role="button"]')]
        .filter(b => b.offsetParent !== null)
        .map((b, i) => ({
          i,
          text: (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 60),
          cls: (b.className || '').toString().slice(0, 80),
        }));
    });

    const toClick = buttons.filter(b => b.text && (
      SAFE.test(b.text) || NEUTRAL.test(b.text) ||
      // abas internas em maiúsculas curtas (ex.: "Main Gastro Hall" não, mas "TAB" sim)
      (/^[A-ZÀ-Ú0-9 &/·.-]{3,28}$/.test(b.text) && !DANGEROUS.test(b.text) && b.text.split(' ').length <= 5)
    )).filter(b => !DANGEROUS.test(b.text)).slice(0, 14);

    for (const b of toClick) {
      const before = await page.evaluate(() => ({
        url: location.href,
        hash: document.body.innerText.length,
        dialog: [...document.querySelectorAll('[role="dialog"], dialog, .modal')].some(d => d.offsetParent !== null),
        text: document.body.innerText.slice(0, 4000),
      }));
      const handle = page.locator('button, [role="button"]').filter({ hasText: new RegExp(escapeRx(b.text), 'i') }).first();
      try {
        await handle.click({ timeout: 4000, force: false });
      } catch {
        entry.notes.push(`nao foi possivel clicar: "${b.text}"`);
        continue;
      }
      await page.waitForTimeout(650);
      const after = await page.evaluate(() => ({
        url: location.href,
        hash: document.body.innerText.length,
        dialog: [...document.querySelectorAll('[role="dialog"], dialog, .modal')].some(d => d.offsetParent !== null),
        text: document.body.innerText.slice(0, 4000),
      }));
      const changed = before.url !== after.url || before.dialog !== after.dialog || before.text !== after.text;
      if (!changed && !NEUTRAL.test(b.text)) {
        entry.deadButtons.push(b.text);
      }
      // se abriu diálogo, registra screenshot e fecha
      if (after.dialog && !before.dialog) {
        entry.shots.push(await shot(`${key}-modal-${slug(b.text)}`));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
      // se navegou, volta à rota para continuar a varredura
      if (before.url !== after.url) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(600);
      }
    }

    // Formulários: submeter VAZIO (validação de dados inválidos)
    const forms = await page.evaluate(() => document.querySelectorAll('form').length);
    if (forms > 0) {
      const errBefore = issues.length;
      const submit = page.locator('button[type="submit"], form button').filter({ hasText: /guardar|salvar|cadastrar|criar|registrar|entrar|adicionar|enviar|confirmar/i }).first();
      if (await submit.count()) {
        await submit.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(700);
        const validation = await page.evaluate(() => {
          const invalid = document.querySelectorAll(':invalid, [aria-invalid="true"], .border-red-500, .error').length;
          const alert = document.querySelectorAll('[role="alert"], .text-red-500, .text-destructive').length;
          return { invalid, alert };
        });
        entry.forms.push({ submetidoVazio: true, ...validation, novosErros: issues.length - errBefore });
        entry.shots.push(await shot(`${key}-form-vazio`));
      }
    }

    // Screenshot final da rota
    entry.shots.push(await shot(`${key}-final`));
    entry.newIssues = issues.slice(mark);
    if (entry.newIssues.length && entry.status === 'OK') entry.status = 'OK-COM-ERROS';
    report.push(entry);
  }

  // ---- 3. CONSOLIDADO ----
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ base: BASE, loggedIn, report, issues }, null, 2));

  console.log('\n================ RESUMO ================');
  for (const r of report) {
    console.log(`${r.status.padEnd(14)} ${r.route.padEnd(26)} h1="${r.h1}" | dead=${r.deadButtons.length} issues=${r.newIssues.length}`);
    if (r.deadButtons.length) console.log(`               mortos: ${r.deadButtons.join(' | ')}`);
  }
  console.log(`\nTOTAL de problemas capturados: ${issues.length}`);
  const grouped = {};
  for (const i of issues) { const k = `${i.kind}`; grouped[k] = (grouped[k] || 0) + 1; }
  console.log(JSON.stringify(grouped, null, 2));
  console.log(`Relatório: ${path.join(OUT, 'report.json')}`);

  await browser.close();
};

const escapeRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

run().catch(e => { console.error('FALHA CRITICA DA AUDITORIA:', e); process.exit(1); });
