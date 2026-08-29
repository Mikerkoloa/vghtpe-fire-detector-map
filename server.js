const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const { handleNodeRequest } = require("./lib/admin-api");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const targetPath = path.resolve(ROOT, relativePath);

  if (!targetPath.startsWith(ROOT)) {
    return null;
  }

  return targetPath;
}

function sendFile(req, res, filePath) {
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes.get(ext) || "application/octet-stream";
    const range = req.headers.range;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Number(match[2]) : stat.size - 1;
        if (start <= end && end < stat.size) {
          res.writeHead(206, {
            "accept-ranges": "bytes",
            "content-type": contentType,
            "content-length": end - start + 1,
            "content-range": `bytes ${start}-${end}/${stat.size}`,
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }
      }
    }

    res.writeHead(200, {
      "accept-ranges": "bytes",
      "content-type": contentType,
      "content-length": stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const apiMatch = /^\/api\/admin\/([a-z-]+)$/.exec(url.pathname);

  if (apiMatch) {
    handleNodeRequest(req, res, apiMatch[1]);
    return;
  }

  const filePath = resolveRequestPath(req.url);
  if (!filePath) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  sendFile(req, res, filePath);
});

server.listen(PORT, () => {
  console.log(`Fire detector map is running at http://localhost:${PORT}`);
});
