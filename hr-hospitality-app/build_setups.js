/**
 * HR HOSPITALITY — Script de Build de Instaladores
 * =================================================
 * Gera dois instaladores NSIS distintos para Windows:
 *   - HR-Hospitality-Servidor-Setup-{version}.exe
 *   - HR-Hospitality-Cliente-Setup-{version}.exe
 *
 * Uso:
 *   node build_setups.js              → build Servidor + Cliente
 *   node build_setups.js --only=server → só Servidor
 *   node build_setups.js --only=client → só Cliente
 *   node build_setups.js --skip-build  → skip do next build (usa /out existente)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Configuração ─────────────────────────────────────────────────────────────
const ROOT = __dirname;
const args = process.argv.slice(2);
const onlyFlag = args.find(a => a.startsWith('--only='));
const only = onlyFlag ? onlyFlag.split('=')[1] : null; // 'server' | 'client' | null
const skipBuild = args.includes('--skip-build');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;

// ─── Utilidades ───────────────────────────────────────────────────────────────
function log(msg, type = 'info') {
  const icons = { info: '→', success: '✔', error: '✖', section: '══' };
  const icon = icons[type] || '→';
  console.log(`\n  ${icon}  ${msg}`);
}

function run(command, label) {
  log(label || command, 'info');
  try {
    execSync(command, { stdio: 'inherit', cwd: ROOT });
  } catch (err) {
    log(`Falha: ${label || command}`, 'error');
    throw err;
  }
}

function checkFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Ficheiro em falta: ${label || filePath}`);
  }
  log(`OK — ${label || path.basename(filePath)}`);
}

// ─── Verificação de Pré-requisitos ────────────────────────────────────────────
function verifyAssets() {
  console.log('\n  ══ Verificando assets necessários...');
  checkFile(path.join(ROOT, 'electron/build_config.server.json'), 'build_config.server.json');
  checkFile(path.join(ROOT, 'electron/build_config.client.json'), 'build_config.client.json');
  checkFile(path.join(ROOT, 'electron-builder.server.yml'),      'electron-builder.server.yml');
  checkFile(path.join(ROOT, 'electron-builder.client.yml'),      'electron-builder.client.yml');
  checkFile(path.join(ROOT, 'public/icon-server.png'),           'icon-server.png');
  checkFile(path.join(ROOT, 'public/icon-client.png'),           'icon-client.png');
  checkFile(path.join(ROOT, 'public/license.txt'),               'license.txt');
}

// ─── Build Frontend Next.js ───────────────────────────────────────────────────
function buildNextJs() {
  if (skipBuild) {
    log('--skip-build ativo: a reutilizar pasta /out existente.', 'info');
    if (!fs.existsSync(path.join(ROOT, 'out', 'index.html'))) {
      throw new Error('Pasta /out não encontrada. Corra sem --skip-build primeiro.');
    }
    return;
  }
  console.log('\n  ══ Compilando Frontend Next.js (export estático)...');
  run('npm.cmd run build', 'next build → /out');
}

// ─── Build Electron para um modo específico ───────────────────────────────────
function buildElectron(mode) {
  const configFile = `electron-builder.${mode}.yml`;
  const label = mode === 'server' ? 'SERVIDOR' : 'CLIENTE';
  console.log(`\n  ══ Empacotando Electron — Modo ${label}...`);
  run(
    `npx electron-builder --config ${configFile} --win`,
    `electron-builder --config ${configFile}`
  );
}

// ─── Listar instaladores gerados ──────────────────────────────────────────────
function listGeneratedInstallers() {
  const distPath = path.join(ROOT, 'dist');
  console.log('\n  ══ Instaladores gerados:');
  if (!fs.existsSync(distPath)) {
    log('Pasta dist/ não encontrada.', 'error');
    return;
  }
  const exeFiles = fs.readdirSync(distPath)
    .filter(f => f.endsWith('.exe') && f.includes('Setup'));

  if (exeFiles.length === 0) {
    log('Nenhum instalador .exe encontrado em dist/', 'error');
    return;
  }

  for (const exe of exeFiles) {
    const filePath = path.join(distPath, exe);
    const sizeKb = Math.round(fs.statSync(filePath).size / 1024);
    const sizeMb = (sizeKb / 1024).toFixed(1);
    log(`${exe} — ${sizeMb} MB`, 'success');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  ╔═══════════════════════════════════════════════╗');
  console.log(`  ║   HR HOSPITALITY — Build de Instaladores v${version}  ║`);
  console.log('  ╚═══════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  try {
    verifyAssets();
    buildNextJs();

    if (!only || only === 'server') {
      buildElectron('server');
    }

    if (!only || only === 'client') {
      buildElectron('client');
    }

    listGeneratedInstallers();

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n  ✨ Concluído em ${elapsed} minutos!\n`);

  } catch (err) {
    console.error('\n  ✖  Build falhou:', err.message || err);
    process.exit(1);
  }
}

main();
