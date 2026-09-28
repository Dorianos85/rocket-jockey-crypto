import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
export function createStaticServer(root = projectRoot) {
  const base = resolve(root);
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const target = resolve(base, relative);
      // Only public entry points and browser source are served; never repository metadata.
      const publicPath = relative === 'index.html' || relative === 'favicon.svg' || /^src\/[a-zA-Z0-9/_-]+\.(js|css)$/.test(relative);
      if (!publicPath || !target.startsWith(base + sep)) {
        res.writeHead(404).end('Not found');
        return;
      }
      const data = await readFile(target);
      res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 404).end('Not found');
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { prepareVendor } = await import('./vendor.js');
  await prepareVendor();
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  const server = createStaticServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  const displayHost = host === '127.0.0.1' ? 'localhost' : host;
  server.listen(port, host, () => console.log(`Rocket Jockey ready at http://${displayHost}:${port}`));
}
