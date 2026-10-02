import http from 'node:http';
import { readFile, stat, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { ROOT, normalizeBase } from './lib.mjs';
import { buildSite } from './build.mjs';

const base = normalizeBase(process.env.SITE_BASE_PATH || '/photography/');
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是有效端口。');
const dist = path.join(ROOT, 'dist');
let pending = Promise.resolve();
function rebuild() {
  pending = pending.catch(() => {}).then(async () => {
    await rm(dist, { recursive: true, force: true });
    const result = await buildSite({ base });
    console.log(`构建完成：${result.pages} 页 / ${(result.bytes / 1e6).toFixed(2)} MB`);
  });
  return pending;
}
await rebuild();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    await pending.catch(() => {});
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (base !== '/' && (pathname === '/' || pathname === base.slice(0, -1))) { response.writeHead(302, { Location: base }).end(); return; }
    if (!pathname.startsWith(base)) { response.writeHead(404).end('Not found'); return; }
    const relative = pathname.slice(base.length);
    const target = path.resolve(dist, relative);
    if (target !== dist && !target.startsWith(`${dist}${path.sep}`) || relative.split('/').some(part => part.startsWith('.'))) { response.writeHead(403).end('Forbidden'); return; }
    let filename = target;
    const info = await stat(filename).catch(() => null);
    if (info?.isDirectory()) {
      if (!pathname.endsWith('/')) { response.writeHead(302, { Location: `${pathname}/` }).end(); return; }
      filename = path.join(filename, 'index.html');
    }
    let status = 200;
    let body;
    try { body = await readFile(filename); }
    catch { status = 404; filename = path.join(dist, '404.html'); body = await readFile(filename); }
    response.writeHead(status, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(400).end('Bad request'); }
});
server.listen(port, '127.0.0.1', () => console.log(`本地预览：http://localhost:${port}${base}`));
if (process.argv.includes('--watch')) {
  let timer;
  for (const directory of ['src', 'assets', 'content']) {
    watch(path.join(ROOT, directory), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => { rebuild().catch(error => console.error(`构建失败：${error.message}`)); }, 180);
    });
  }
}
