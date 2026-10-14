// Local production-build verification only; Netlify owns production routing.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let target = decodeURIComponent(url.pathname);
  if (target.replace(/\/$/, '') === '/design') {
    const product = url.searchParams.get('tab') || url.searchParams.get('product');
    const variant = ['yard-sign','yard_sign','yard-signs'].includes(product) ? 'yard-signs' : ['car-magnet','car_magnet','car-magnets','car_magnets'].includes(product) ? 'car-magnets' : 'banner';
    target = `/seo-documents/design-${variant}.html`;
  }
  try {
    let file = path.resolve(root, `.${target}`);
    if (!file.startsWith(root + '/') && file !== root) throw new Error('Invalid path');
    try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); }
    catch { file = path.join(root, 'app-shell.html'); }
    const mime = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.avif':'image/avif','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'}[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type':mime});res.end(await readFile(file));
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(4192,'127.0.0.1');
