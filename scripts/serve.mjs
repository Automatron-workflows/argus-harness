import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const root = resolve(".");
const port = Number(process.env.PORT || 4179);
const types = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/demo/";
    let file = resolve(root, `.${path}`);
    const rel = relative(root, file);
    if (rel.startsWith("..") || rel === "" || rel.includes("\0")) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    const info = await stat(file).catch(() => null);
    if (info?.isDirectory()) file = resolve(file, "index.html");
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": types[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Argus Harness preview: http://127.0.0.1:${port}/demo/`);
});
