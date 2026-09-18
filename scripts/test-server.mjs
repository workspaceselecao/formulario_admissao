#!/usr/bin/env node

/**
 * Servidor de teste local — simula rewrites do Vercel.
 *
 * Rotas reescritas:
 *   /f075          → ficha_cadastral.html
 *   /f089          → assistencia_medica.html
 *   /bradesco      → carta_bradesco.html
 *   /termos        → termos_aceite.html
 *   /admin         → admin/admin.html
 *   /              → index.html
 *   /*.html        → arquivo.html (cleanUrls)
 *
 * API administrativa (Painel Administrativo — modo API):
 *   GET  /api/admin/config     → overlay atual (404 se inexistente)
 *   PUT  /api/admin/config     → grava overlay + backup automático
 *   GET  /api/admin/backup     → lista de backups
 *   GET  /api/admin/backup?id= → baixa um backup
 *   POST /api/admin/upload     → grava PDF enviado (validado)
 *   GET  /api/admin/historico  → eventos de auditoria
 *   POST /api/admin/historico  → registra evento
 *
 * Persistência: pasta data/ (gitignored) — admin-config.json,
 * backups/, uploads/, historico.json. Em produção (Vercel estático)
 * a API não existe e o painel opera em modo exportação.
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from "node:fs";
import { join, extname, resolve, basename } from "node:path";

const PORT = parseInt(process.env.PORT || "3456", 10);
const ROOT = join(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const BACKUPS_DIR = join(DATA_DIR, "backups");
const UPLOADS_DIR = join(DATA_DIR, "uploads");
const CONFIG_PATH = join(DATA_DIR, "admin-config.json");
const HISTORICO_PATH = join(DATA_DIR, "historico.json");
const MAX_PDF_BYTES = 20 * 1024 * 1024;

function ensureDataDirs() {
  for (const dir of [DATA_DIR, BACKUPS_DIR, UPLOADS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

const REWRITES = {
  "/f075": "/ficha_cadastral.html",
  "/f089": "/assistencia_medica.html",
  "/bradesco": "/carta_bradesco.html",
  "/termos": "/termos_aceite.html",
  "/admin": "/admin/admin.html",
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

function sendJSON(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj, null, 2));
}

function readBody(req, limit) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("payload muito grande")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function timestampName(prefix, ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${ext}`;
}

function sanitizarNomeArquivo(nome) {
  return String(nome || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._\- ]/g, "")
    .replace(/\s+/g, " ").trim()
    .replace(/\.\./g, "")
    .replace(/^[.\s]+/, "")
    .slice(0, 120);
}

// ── API administrativa ──────────────────────────────────
async function handleAdminApi(req, res, pathname, searchParams) {
  ensureDataDirs();

  if (pathname === "/api/admin/config") {
    if (req.method === "GET") {
      if (!existsSync(CONFIG_PATH)) { res.writeHead(404); res.end(); return; }
      sendJSON(res, 200, JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
      return;
    }
    if (req.method === "PUT" || req.method === "POST") {
      const body = (await readBody(req, 5 * 1024 * 1024)).toString("utf8");
      let json;
      try { json = JSON.parse(body); } catch { sendJSON(res, 400, { erro: "JSON inválido" }); return; }
      // Backup do estado anterior
      if (existsSync(CONFIG_PATH)) {
        const backupName = timestampName("admin-config", ".json");
        writeFileSync(join(BACKUPS_DIR, backupName), readFileSync(CONFIG_PATH));
      }
      writeFileSync(CONFIG_PATH, JSON.stringify(json, null, 2));
      sendJSON(res, 200, { ok: true, arquivo: "data/admin-config.json", backup: existsSync(join(BACKUPS_DIR, backupNameOfLatest())) ? "criado" : "primeira gravação (sem anterior)" });
      return;
    }
    sendJSON(res, 405, { erro: "Método não suportado" });
    return;
  }

  if (pathname === "/api/admin/backup") {
    const id = searchParams.get("id");
    if (id) {
      const nome = basename(sanitizarNomeArquivo(id));
      const p = join(BACKUPS_DIR, nome);
      if (!existsSync(p) || !nome.endsWith(".json")) { sendJSON(res, 404, { erro: "backup não encontrado" }); return; }
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}"`
      });
      res.end(readFileSync(p));
      return;
    }
    const lista = existsSync(BACKUPS_DIR)
      ? readdirSync(BACKUPS_DIR).filter((f) => f.endsWith(".json")).sort().reverse()
        .map((f) => ({ id: f, nome: f, data: f.replace(/[^\d]/g, "") }))
      : [];
    sendJSON(res, 200, lista);
    return;
  }

  if (pathname === "/api/admin/upload") {
    if (req.method !== "POST") { sendJSON(res, 405, { erro: "Método não suportado" }); return; }
    const body = (await readBody(req, MAX_PDF_BYTES + 1024 * 1024)).toString("utf8");
    let json;
    try { json = JSON.parse(body); } catch { sendJSON(res, 400, { erro: "JSON inválido" }); return; }
    const nome = sanitizarNomeArquivo(String(json.nome || ""));
    if (!nome.toLowerCase().endsWith(".pdf")) { sendJSON(res, 400, { erro: "Nome deve terminar em .pdf" }); return; }
    if (typeof json.data !== "string" || json.data.length < 8) { sendJSON(res, 400, { erro: "Conteúdo ausente" }); return; }
    const buf = Buffer.from(json.data, "base64");
    if (!buf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) { sendJSON(res, 400, { erro: "Arquivo não é um PDF válido (assinatura ausente)" }); return; }
    if (buf.length > MAX_PDF_BYTES) { sendJSON(res, 413, { erro: "PDF excede 20 MB" }); return; }
    writeFileSync(join(UPLOADS_DIR, nome), buf);
    sendJSON(res, 200, { ok: true, nome, bytes: buf.length, destino: `data/uploads/${nome}` });
    return;
  }

  if (pathname === "/api/admin/historico") {
    let hist = { eventos: [] };
    if (existsSync(HISTORICO_PATH)) {
      try { hist = JSON.parse(readFileSync(HISTORICO_PATH, "utf8")); } catch { hist = { eventos: [] }; }
    }
    if (!Array.isArray(hist.eventos)) hist.eventos = [];
    if (req.method === "GET") { sendJSON(res, 200, hist); return; }
    if (req.method === "POST") {
      const body = (await readBody(req, 1024 * 1024)).toString("utf8");
      try {
        const ev = JSON.parse(body);
        hist.eventos.unshift(ev);
        hist.eventos = hist.eventos.slice(0, 500);
        writeFileSync(HISTORICO_PATH, JSON.stringify(hist, null, 2));
        sendJSON(res, 200, { ok: true });
      } catch { sendJSON(res, 400, { erro: "JSON inválido" }); }
      return;
    }
    sendJSON(res, 405, { erro: "Método não suportado" });
    return;
  }

  sendJSON(res, 404, { erro: "endpoint desconhecido" });
}

function backupNameOfLatest() {
  try {
    const lista = readdirSync(BACKUPS_DIR).filter((f) => f.endsWith(".json")).sort();
    return lista[lista.length - 1] || "";
  } catch { return ""; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = url.pathname;

  // API administrativa
  if (pathname.startsWith("/api/admin/")) {
    try {
      await handleAdminApi(req, res, pathname, url.searchParams);
    } catch (e) {
      sendJSON(res, 500, { erro: e.message || "erro interno" });
    }
    return;
  }

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
  if (!resolve(filePath).startsWith(ROOT)) {
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
  console.log(`   http://localhost:${PORT}/admin      → admin/admin.html (painel — e-mail @atento.com)`);
  console.log("\nAPI administrativa:");
  console.log("   GET/PUT  /api/admin/config     (overlay + backup automático)");
  console.log("   GET      /api/admin/backup     (lista; ?id= para baixar)");
  console.log("   POST     /api/admin/upload     (PDF validado)");
  console.log("   GET/POST /api/admin/historico  (auditoria)");
  console.log("\nChaves de teste:");
  console.log("   ATN-7KQ9-X4MP-82VF");
  console.log("   ATN-R6ZT-91WL-K3QX");
  console.log("   ATN-P8YD-4M7C-V2HK");
  console.log("   ATN-X5FN-Q9RA-63TJ");
  console.log("   ATN-3VKM-8QPX-L7DZ");
  console.log("\nPainel administrativo (/admin):");
  console.log("   Acesso: e-mails @atento.com autorizados no array G de admin-guard.js");
  console.log("   (qualquer outro domínio é recusado)");
  console.log("\nCtrl+C para encerrar.\n");
});
