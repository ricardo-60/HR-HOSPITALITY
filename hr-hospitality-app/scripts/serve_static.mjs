import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../out', import.meta.url)));

// Aceita as flags habituais de arranque, para que
//     npm run start -- -H 0.0.0.0 -p 3000
// ligue o portal a TODA a LAN na porta 3000 (e nao apenas ao localhost).
function argValue(names) {
  for (let i = 2; i < process.argv.length; i += 1) {
    const a = process.argv[i];
    for (const n of names) {
      if (a === n) return process.argv[i + 1];
      if (a.startsWith(`${n}=`)) return a.slice(n.length + 1);
    }
  }
  return undefined;
}

const HOST = argValue(['-H', '--host']) || process.env.HOST || '127.0.0.1';
const PORT = Number(argValue(['-p', '--port']) || process.env.PORT || 3000);
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function existingFile(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
  const target = resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(`${ROOT}/`) && !target.startsWith(`${ROOT}\\`)) return null;
  const candidates = [target, `${target}.html`, join(target, 'index.html')];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch { /* try next */ }
  }
  return null;
}

createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  let pathname;
  try {
    pathname = new URL(request.url || '/', 'http://localhost').pathname;
    const file = existingFile(pathname);
    if (!file) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    // HTML e a área de download nunca ficam em cache: um APK/instalador
    // regenerado tem o mesmo URL e tem de ser servido de novo, senão o
    // telemóvel ficaria com a versão antiga durante um ano.
    const noStore = file.endsWith('.html') || pathname.startsWith('/download/');
    // Content-Length explicito: sem ele a resposta sai em "chunked" e o gestor
    // de downloads do Android nao consegue mostrar o tamanho nem o progresso
    // de um APK de 68 MB.
    response.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': noStore ? 'no-store' : 'public, max-age=31536000, immutable',
      'Content-Length': String(statSync(file).size)
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
  }
}).listen(PORT, HOST, () => {
  console.log(`HR-HOSPITALITY static build: http://${HOST}:${PORT}`);
});
