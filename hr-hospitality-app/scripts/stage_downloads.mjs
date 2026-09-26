/**
 * HR-HOSPITALITY — Preparação da área de download da demonstração
 * ================================================================
 * Copia os artefactos de release para `hr-hospitality-app/out/download/`,
 * gera um índice HTML com links e QR codes e imprime os URLs de rede local.
 *
 * É chamado por start-server.bat / start-server.sh DEPOIS do build, para que
 * o portal estático (porta 3000) sirva tudo em:
 *
 *     http://<ip-da-lan>:3000/download/
 *
 * Origens procuradas (nao falta nenhum se existir):
 *     dist/android/*.apk          APKs Android
 *     hr-hospitality-app/dist/*   instaladores Electron (NSIS)
 *     dist/ios/*                  .ipa / notas de build iOS
 *
 * Uso:  node scripts/stage_downloads.mjs [--ip=192.168.1.10] [--port=3000]
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..');
const REPO_ROOT = join(__dirname, '..', '..');

const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
        const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
        return m ? [m[1], m[2] ?? true] : [a, true];
    })
);

const ip = args.ip || process.env.HR_IP || envLocal('HR_IP') || 'localhost';
const port = args.port || process.env.HR_PORT || envLocal('HR_PORT') || '3000';
const origin = `http://${ip}:${port}`;

/**
 * Le um valor de hr-hospitality-app/.env.local.
 * E a fonte usada quando nem o argumento --ip/--port nem a variavel de ambiente
 * HR_IP/HR_PORT estao definidos — e assim que o .env.local "aponta" a maquina
 * ao endereco da LAN.
 */
function envLocal(name) {
    const file = join(APP_ROOT, '.env.local');
    if (!existsSync(file)) return '';
    try {
        const line = readFileSync(file, 'utf8')
            .split(/\r?\n/)
            .find((l) => new RegExp(`^\\s*${name}\\s*=`).test(l));
        if (!line) return '';
        return line
            .replace(/^[^=]*=\s*/, '')
            .replace(/\s+#.*$/, '')
            .trim()
            .replace(/^["']|["']$/g, '');
    } catch {
        return '';
    }
}

const OUT = join(APP_ROOT, 'out');
const DOWNLOAD = join(OUT, 'download');

const GROUPS = [
    {
        id: 'android',
        title: 'Android (APK)',
        hint: 'Instalação direta: abra o link no telemóvel e permita "fontes desconhecidas".',
        sources: [join(REPO_ROOT, 'dist', 'android')],
        filter: (f) => f.toLowerCase().endsWith('.apk'),
    },
    {
        id: 'windows',
        title: 'Windows (instalador Electron)',
        hint: 'Instalar no PC servidor (Modo Servidor) e nos postos cliente (Modo Cliente).',
        sources: [join(APP_ROOT, 'dist')],
        filter: (f) => f.toLowerCase().endsWith('.exe') && f.includes('Setup'),
    },
    {
        id: 'ios',
        title: 'iOS',
        hint: 'Construção de distribuição requer macOS + conta Apple Developer (abrir o ficheiro .md desta secção para as instruções).',
        sources: [join(REPO_ROOT, 'dist', 'ios')],
        filter: (f) => f.toLowerCase().endsWith('.ipa') || f.toLowerCase().endsWith('.md'),
    },
];

if (!existsSync(join(OUT, 'index.html'))) {
    console.error('  [ERRO] hr-hospitality-app/out não existe. Corra primeiro o build do frontend.');
    process.exit(1);
}

rmSync(DOWNLOAD, { recursive: true, force: true });
mkdirSync(DOWNLOAD, { recursive: true });

let QRCode = null;
try {
    QRCode = (await import('qrcode')).default;
} catch {
    console.log('  [AVISO] módulo "qrcode" indisponível — a gerar links sem QR.');
}

async function makeQr(text, target) {
    if (!QRCode) return false;
    try {
        const svg = await QRCode.toString(text, { type: 'svg', margin: 2, width: 320, errorCorrectionLevel: 'M' });
        writeFileSync(target, svg, 'utf8');
        return true;
    } catch {
        return false;
    }
}

const collected = [];

for (const group of GROUPS) {
    const targetDir = join(DOWNLOAD, group.id);
    mkdirSync(targetDir, { recursive: true });
    let count = 0;
    for (const src of group.sources) {
        if (!existsSync(src)) continue;
        for (const name of readdirSync(src)) {
            const full = join(src, name);
            if (!statSync(full).isFile()) continue;
            if (!group.filter(name)) continue;
            cpSync(full, join(targetDir, name));
            count += 1;
        }
    }
    if (count > 0) collected.push({ group, count });
}

const rows = [];
for (const { group, count } of collected) {
    const files = readdirSync(join(DOWNLOAD, group.id))
        .filter((f) => group.filter(f))
        .sort();
    for (const file of files) {
        const url = `${origin}/download/${group.id}/${file}`;
        const qrName = `${file.replace(/[^\w.-]+/g, '_')}.svg`;
        const hasQr = await makeQr(url, join(DOWNLOAD, group.id, qrName));
        const size = statSync(join(DOWNLOAD, group.id, file)).size;
        rows.push({ group: group.title, hint: group.hint, file, url, qr: hasQr ? `/download/${group.id}/${qrName}` : null, size });
    }
    console.log(`  [OK] ${group.title}: ${count} ficheiro(s) → out/download/${group.id}/`);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const html = `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HR-HOSPITALITY · Downloads da demonstração</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         background: radial-gradient(1200px 600px at 20% -10%, #12365e 0%, #0a1526 55%, #060b14 100%); color:#e6edf7; }
  header { padding: 40px 24px 8px; text-align:center; }
  h1 { margin:0; font-size: clamp(24px, 4vw, 40px); letter-spacing:.14em; text-transform:uppercase; font-weight:900; }
  .sub { color:#8aa2c4; font-size:14px; letter-spacing:.24em; text-transform:uppercase; margin-top:8px; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px; display:grid; gap:20px; grid-template-columns: repeat(auto-fit, minmax(320px,1fr)); }
  .card { background: rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.09); border-radius:22px; padding:22px; }
  .card h2 { margin:0 0 6px; font-size:15px; letter-spacing:.2em; text-transform:uppercase; color:#00F2FF; }
  .card p.hint { margin:0 0 16px; font-size:13px; color:#93a7c6; line-height:1.5; }
  .item { display:flex; gap:16px; align-items:center; padding:14px; border-radius:16px; background:rgba(255,255,255,.03);
          border:1px solid rgba(255,255,255,.06); margin-bottom:12px; }
  .item .meta { flex:1; min-width:0; }
  .item .name { font-weight:800; font-size:14px; word-break:break-all; }
  .item .url { font-size:12px; color:#7f96b8; word-break:break-all; margin-top:4px; }
  .badge { display:inline-block; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#0a1526;
           background:#00F2FF; border-radius:999px; padding:3px 10px; font-weight:900; margin-bottom:8px; }
  .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  a.btn { display:inline-block; text-decoration:none; font-size:12px; font-weight:800; letter-spacing:.08em;
          padding:8px 14px; border-radius:999px; background:#00F2FF; color:#04101f; }
  a.btn.ghost { background:transparent; color:#00F2FF; border:1px solid rgba(0,242,255,.4); }
  img.qr { width:132px; height:132px; background:#fff; padding:6px; border-radius:12px; }
  .empty { color:#7f96b8; font-size:13px; }
  footer { text-align:center; color:#5d7394; font-size:12px; padding: 8px 24px 40px; letter-spacing:.08em; }
</style>
</head>
<body>
<header>
  <h1>HR-HOSPITALITY</h1>
  <div class="sub">Downloads da demonstração · ${esc(origin)}</div>
</header>
<main>
${rows.length === 0 ? '<div class="card"><h2>Sem artefactos</h2><p class="hint">Ainda não há binários nesta pasta. Corra <code>build-android.ps1</code> e <code>node hr-hospitality-app/build_setups.js</code>, depois reinicie o servidor.</p></div>' : ''}
${rows.map((r) => `  <div class="card">
    <h2>${esc(r.group)}</h2>
    <p class="hint">${esc(r.hint)}</p>
    <div class="item">
      <div class="meta">
        <span class="badge">${(r.size / (1024 * 1024)).toFixed(1)} MB</span>
        <div class="name">${esc(r.file)}</div>
        <div class="url">${esc(r.url)}</div>
        <div class="actions">
          <a class="btn" href="${esc(r.url)}" download>Descarregar</a>
          <a class="btn ghost" href="${esc(r.url)}">Abrir link</a>
        </div>
      </div>
      ${r.qr ? `<img class="qr" src="${esc(r.qr)}" alt="QR de ${esc(r.file)}" />` : ''}
    </div>
  </div>`).join('\n')}
</main>
<footer>Preencha <code>hr-hospitality-app/.env.local</code> para ligar as apps ao Supabase.</footer>
</body>
</html>
`;

writeFileSync(join(DOWNLOAD, 'index.html'), html, 'utf8');

const portalQr = await makeQr(`${origin}/download/`, join(DOWNLOAD, 'qr-portal.svg'));
if (portalQr) console.log('  [OK] QR do portal: out/download/qr-portal.svg');

console.log('');
console.log('  Área de download:');
console.log(`    ${origin}/download/`);
console.log(`    (ficheiros em ${resolve(DOWNLOAD)})`);
if (rows.length === 0) console.log('    [AVISO] nenhum binário encontrado — ainda nada para transferir.');
