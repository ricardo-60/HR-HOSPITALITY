/* eslint-disable */
'use strict';

/**
 * Servidor HTTP estático local (loopback) para o export do Next (`out/`).
 *
 * Porquê: o export usa caminhos absolutos `/_next/*`. Em `file://` esses
 * caminhos resolvem para a raiz da unidade (`file:///C:/_next/...`) e todos os
 * scripts/estilos falham com ERR_FILE_NOT_FOUND, deixando a janela preta (a
 * UI nunca hidrata). Servindo por `http://127.0.0.1:<porta efémera>` os
 * caminhos absolutos, o router do Next e os payloads RSC funcionam exactamente
 * como no site.
 *
 * As regras de resolução espelham `scripts/serve_static.mjs`, que serve o site
 * em produção, para o comportamento da app Electron ser idêntico ao do portal.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.apk': 'application/vnd.android.package-archive'
};

/**
 * Payloads RSC do App Router.
 *
 * O `next build` com `output: 'export'` grava a payload de uma rota em
 *   <rota>/__next.<seg0>/<seg1>/.../__PAGE__.txt   (directorios + ficheiro)
 * mas o router pede o nome plano
 *   <rota>/__next.<seg0>.<seg1>....__PAGE__.txt
 * Sem esta correspondência cada prefetch do App Router dava 404 na consola.
 */
function candidatosRSC(alvo) {
  const m = alvo.match(/^(.*)[/\\]__next\.(.+)\.__PAGE__\.txt$/i);
  if (!m) return [];
  const segs = m[2].split('.').filter(Boolean);
  if (segs.length === 0) return [];
  const raizDir = m[1].replace(/[/\\]+$/, '');
  const dir = `${raizDir}${path.sep}__next.${segs[0]}`;
  const resto = segs.slice(1);
  return [resto.length
    ? `${dir}${path.sep}${resto.join(path.sep)}${path.sep}__PAGE__.txt`
    : `${dir}${path.sep}__PAGE__.txt`];
}

/** Lista de ficheiros candidatos para um URL (sem sair da raiz). */
function resolver(raiz, url) {
  let limpo;
  try {
    limpo = decodeURIComponent(String(url || '/').split('?')[0].split('#')[0]);
  } catch {
    limpo = String(url || '/').split('?')[0].split('#')[0];
  }
  const rel = path.normalize(limpo).replace(/^(\.\.(?:[/\\]|$))+/, '').replace(/^[/\\]+/, '');
  const alvo = path.resolve(raiz, rel);
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return [];

  const candidatos = [alvo];
  if (path.extname(alvo) === '') {
    // /kyc -> kyc.html ; /download/ -> download/index.html
    candidatos.push(`${alvo}.html`);
    candidatos.push(path.join(alvo, 'index.html'));
  }
  candidatos.push(...candidatosRSC(alvo));
  return candidatos;
}

function existeFicheiro(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function enviar(res, file, tipo) {
  const st = fs.statSync(file);
  res.writeHead(200, {
    'Content-Type': tipo,
    'Content-Length': st.size,
    'Cache-Control': 'no-cache'
  });
  const stream = fs.createReadStream(file);
  stream.on('error', () => { try { res.end(); } catch { /* ignore */ } });
  stream.pipe(res);
}

function atender(raiz) {
  return (req, res) => {
    try {
      const url = new URL(String(req.url || '/'), 'http://local');
      const ext = path.extname(url.pathname).toLowerCase();

      let ficheiro = null;
      for (const candidato of resolver(raiz, url.pathname)) {
        if (existeFicheiro(candidato)) { ficheiro = candidato; break; }
      }
      if (!ficheiro && (ext === '' || ext === '.html')) {
        const shell = path.join(raiz, 'index.html');
        if (existeFicheiro(shell)) ficheiro = shell;
      }
      if (!ficheiro) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 — ficheiro nao encontrado');
        return;
      }

      // O router do Next só aceita payloads RSC com `text/x-component`
      // (fetch-server-response.js e segment-cache/cache.js testam o prefixo);
      // com outro content-type a transição deixa de ser RSC. Identifica-se
      // pelo `_rsc` que o router acrescenta ou pelo prefixo `__next.`, para
      // não alterar o content-type de um robots.txt ou de um txt normal.
      const isRsc = path.extname(ficheiro).toLowerCase() === '.txt'
        && (url.searchParams.has('_rsc') || path.basename(ficheiro).startsWith('__next.'));

      enviar(res, ficheiro, isRsc
        ? 'text/x-component; charset=utf-8'
        : (MIME[path.extname(ficheiro).toLowerCase()] || 'application/octet-stream'));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`500 — ${error.message}`);
    }
  };
}

/**
 * Sobe o servidor em `127.0.0.1` numa porta efémera (0) para não colidir com o
 * painel web (3000) nem com a API local do Servidor (3002).
 */
function startStaticServer({ root, host = '127.0.0.1', port = 0 } = {}) {
  const raiz = path.resolve(root);
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.join(raiz, 'index.html'))) {
      reject(new Error(`export Next nao encontrado em ${raiz}`));
      return;
    }
    const server = http.createServer(atender(raiz));
    server.once('error', reject);
    server.listen(port, host, () => {
      const atribuido = server.address();
      resolve({
        origin: `http://${host}:${atribuido.port}`,
        url: `http://${host}:${atribuido.port}/`,
        port: atribuido.port,
        root: raiz,
        close: () => new Promise((res) => server.close(() => res()))
      });
    });
  });
}

module.exports = { startStaticServer, resolver };
