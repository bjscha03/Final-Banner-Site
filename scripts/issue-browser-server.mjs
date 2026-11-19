import { preview } from 'vite';
import { createHash } from 'node:crypto';

// A real HTTP fixture avoids WebKit inspector omissions for multipart files
// and persistent inspector blocks after route.abort(). Never deployed.
const failures = new Map();
const uploads = new Map();
const json = (res, value, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
};
await preview({
  preview: { host: '127.0.0.1', port: 4177, strictPort: true },
  plugins: [{
    name: 'issue-browser-http-fixtures',
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url, 'http://127.0.0.1:4177');
          if (url.pathname.startsWith('/__issue_qa/failure/')) {
            const id = url.pathname.split('/').pop();
            failures.set(id, url.searchParams.get('mode'));
            return json(res, { ok: true });
          }
          if (url.pathname.startsWith('/__issue_qa/upload/')) {
            return json(res, uploads.get(decodeURIComponent(url.pathname.split('/').pop())) || null);
          }
          if (/\/assets\/GoogleAdsBanner-[^/]+\.js$/.test(url.pathname)) {
            const id = req.headers.cookie?.match(/(?:^|;\s*)bof_issue_qa_case=([^;]+)/)?.[1];
            const mode = failures.get(id);
            if (mode === 'transient' || mode === 'persistent') {
              if (mode === 'transient') failures.delete(id);
              res.writeHead(503, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
              return res.end('Temporary asset failure for recovery regression');
            }
          }
          if (url.pathname === '/.netlify/functions/upload-file' && req.method === 'POST') {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const data = await new Request(url, { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) }).formData();
            const file = data.get('file');
            const bytes = Buffer.from(await file.arrayBuffer());
            const record = { name: file.name, mimeType: file.type, bytes: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'), count: (uploads.get(file.name)?.count || 0) + 1 };
            uploads.set(file.name, record);
            return json(res, { secure_url: 'https://res.cloudinary.com/issue-regression/image/upload/v1/uploads/webp-check.webp',
              public_id: 'uploads/webp-check', format: 'webp', width: 1200, height: 600, bytes: bytes.length });
          }
          next();
        } catch (error) { json(res, { error: error.message }, 500); }
      });
    },
  }],
});
