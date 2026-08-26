#!/usr/bin/env node

/**
 * Servidor de teste local — simula rewrites do Vercel.
 * 
 * Rotas reescritas:
 *   /f075          → ficha_cadastral.html
 *   /f089          → assistencia_medica.html
 *   /bradesco      → carta_bradesco.html
 *   /termos        → termos_aceite.html
 *   /              → index.html
 *   /*.html        → arquivo.html (cleanUrls)
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const PORT = parseInt(process.env.PORT || "3456", 10);
const ROOT = join(import.meta.dirname, "..");

const REWRITES = {
  "/f075": "/ficha_cadastral.html",
  "/f089": "/assistencia_medica.html",
  "/bradesco": "/carta_bradesco.html",
  "/termos": "/termos_aceite.html",
  "/": "/index.html"
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf"
};

const server = createServer((req, res) => {
  let pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;

  // Apply rewrites
  if (REWRITES[pathname]) {
    pathname = REWRITES[pathname];
  }

  // Clean URLs: /foo → /foo.html (if no extension)
  if (!extname(pathname)) {
    const withHtml = pathname + ".html";
    if (existsSync(join(ROOT, withHtml))) pathname = withHtml;
  }

  let filePath = join(ROOT, pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Try to serve the file
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>404 Not Found</h1>");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache"
    });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`\n🧪 Servidor de teste local rodando em http://localhost:${PORT}\n`);
  console.log("Rotas disponíveis:");
  console.log(`   http://localhost:${PORT}/          → index.html (sem proteção)`);
  console.log(`   http://localhost:${PORT}/f075       → ficha_cadastral.html (protegido)`);
  console.log(`   http://localhost:${PORT}/f089       → assistencia_medica.html (protegido)`);
  console.log(`   http://localhost:${PORT}/bradesco   → carta_bradesco.html (protegido)`);
  console.log(`   http://localhost:${PORT}/termos     → termos_aceite.html (protegido)`);
  console.log("\nChaves de teste:");
  console.log("   ATN-7KQ9-X4MP-82VF");
  console.log("   ATN-R6ZT-91WL-K3QX");
  console.log("   ATN-P8YD-4M7C-V2HK");
  console.log("   ATN-X5FN-Q9RA-63TJ");
  console.log("   ATN-3VKM-8QPX-L7DZ");
  console.log("\nCtrl+C para encerrar.\n");
});
