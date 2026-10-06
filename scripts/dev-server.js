// Fitin — 로컬 미리보기 서버 (설치 필요 없음, Node만 있으면 됨)
// 사용법:  node scripts/dev-server.js [port]   →  http://localhost:5173
// 파일을 저장하면 브라우저에서 새로고침만 하면 바로 반영됩니다.
// 주의: /api/* (Vercel 서버 함수)는 여기서 실행되지 않습니다. 배포본에서 확인하세요.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2]) || 5173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = path.join(ROOT, urlPath);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404: " + urlPath);
        return;
      }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    const url = `http://localhost:${PORT}/`;
    console.log(`Fitin 미리보기 실행 중 → ${url}  (중지: Ctrl+C)`);
    const opener = process.platform === "win32" ? "start \"\"" : process.platform === "darwin" ? "open" : "xdg-open";
    exec(`${opener} ${url}`);
  });
