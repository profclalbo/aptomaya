// Servidor de teste no computador: node dev-server.mjs  ->  http://localhost:3000
// (na Vercel ele não é usado)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = path.dirname(new URL(import.meta.url).pathname);
const PORTA = Number(process.env.PORT || 3000);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const nome = u.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
    const arq = path.join(RAIZ, 'api', nome + '.js');
    if (!fs.existsSync(arq)) { res.statusCode = 404; return res.end('{}'); }
    const mod = await import(pathToFileURL(arq).href);
    return mod.default(req, res);
  }
  let p = decodeURIComponent(u.pathname);
  if (p === '/') p = '/index.html';
  if (!path.extname(p) && fs.existsSync(path.join(RAIZ, p + '.html'))) p += '.html';
  const f = path.join(RAIZ, path.normalize(p));
  if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('Não encontrado'); }
  res.setHeader('Content-Type', TIPOS[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(PORTA, () => console.log(`Abra http://localhost:${PORTA}`));
