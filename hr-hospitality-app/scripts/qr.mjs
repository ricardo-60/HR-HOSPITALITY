/**
 * HR-HOSPITALITY — Gerador de QR codes para a demonstração
 * =======================================================
 *
 *   node scripts/qr.mjs "http://192.168.1.10:3000"
 *       → imprime o QR no terminal
 *
 *   node scripts/qr.mjs "http://192.168.1.10:3000" --out=../../dist/download/qr.svg
 *       → além do terminal, grava um SVG (ou PNG com --out=...png)
 *
 * Usado por start-server.bat / start-server.sh para publicar o link de
 * download na rede local. Se o módulo `qrcode` não estiver instalado, o
 * script termina com código 0 e apenas omite o QR (o URL continua impresso).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const args = process.argv.slice(2);
const text = args.find((a) => !a.startsWith('--'));
const outArg = args.find((a) => a.startsWith('--out='));

if (!text) {
  console.error('Uso: node scripts/qr.mjs <url> [--out=ficheiro.svg|.png]');
  process.exit(1);
}

let QRCode;
try {
  QRCode = (await import('qrcode')).default;
} catch {
  console.log(`  (QR omitido — corra "npm i -D qrcode" em hr-hospitality-app)`);
  console.log(`  Link: ${text}`);
  process.exit(0);
}

if (outArg) {
  const target = resolve(outArg.slice('--out='.length));
  mkdirSync(dirname(target), { recursive: true });
  const type = extname(target).toLowerCase() === '.png' ? 'image/png' : 'image/svg+xml';
  const qr = await QRCode.toString(text, { type: type === 'image/png' ? 'png' : 'svg', margin: 2, width: 512, errorCorrectionLevel: 'M' });
  if (typeof qr === 'string') writeFileSync(target, qr, 'utf8');
  else writeFileSync(target, qr);
  console.log(`  QR gravado: ${target}`);
}

const terminal = await QRCode.toString(text, { type: 'terminal', small: true, errorCorrectionLevel: 'M' });
console.log('');
console.log(terminal);
console.log(`  ${text}`);
