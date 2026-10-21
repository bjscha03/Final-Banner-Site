import http from "node:http";
import { handler } from "./api.mjs";
process.env.DANIEL_LOCAL_DEV = "true";
const port = Number(process.env.PORT || 4175);
process.env.DANIEL_ALLOWED_HOST = "localhost:" + port;
http
  .createServer(async (req, res) => {
    try {
      const parts = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 100000) {
          res.writeHead(413);
          res.end();
          return;
        }
        parts.push(chunk);
      }
      const request = new Request("http://localhost:" + port + req.url, {
        method: req.method,
        headers: req.headers,
        ...(!["GET", "HEAD"].includes(req.method)
          ? { body: Buffer.concat(parts) }
          : {}),
      });
      const result = await handler(request, { ip: "127.0.0.1" });
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch (e) {
      console.error(e.message);
      res.writeHead(500);
      res.end("Server error");
    }
  })
  .listen(port, () =>
    console.log("Daniel local preview on http://localhost:" + port + "/daniel"),
  );
