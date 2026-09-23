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
import crypto from "node:crypto";

const PORT = parseInt(process.env.PORT || "3456", 10);
const ROOT = join(import.meta.dirname, "..");
const DATA_DIR = join(ROOT, "data");
const BACKUPS_DIR = join(DATA_DIR, "backups");
const UPLOADS_DIR = join(DATA_DIR, "uploads");
const CONFIG_PATH = join(DATA_DIR, "admin-config.json");
const HISTORICO_PATH = join(DATA_DIR, "historico.json");
const UPLOADS_JSON_PATH = join(DATA_DIR, "uploads.json");
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
  // O painel é o índice físico do diretório (admin/index.html): em produção
  // a Vercel o serve por filesystem em /admin — a rewrite é redundante, mas
  // mantida por semântica/compatibilidade.
  "/admin": "/admin/index.html",
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

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function loadUploadsIndex() {
  try { return JSON.parse(readFileSync(UPLOADS_JSON_PATH, "utf8")); }
  catch { return { versoes: [] }; }
}

function saveUploadsIndex(idx) {
  writeFileSync(UPLOADS_JSON_PATH, JSON.stringify(idx, null, 2));
}

/**
 * Registra uma versão física do upload (§18): o arquivo gravado é
 * renomeado para incluir o timestamp — versões anteriores nunca são
 * sobrescritas (o caminho é parte do registro; rollback = copiar de volta).
 */
function registrarVersaoUpload(nome, bytes) {
  const idx = loadUploadsIndex();
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const dot = nome.lastIndexOf(".");
  const base = dot > 0 ? nome.slice(0, dot) : nome;
  const ext = dot > 0 ? nome.slice(dot) : "";
  const arquivoVersao = `${base}__${stamp}${ext}`;
  writeFileSync(join(UPLOADS_DIR, arquivoVersao), bytes);
  idx.versoes.unshift({
    nome, arquivo: arquivoVersao,
    data: new Date().toISOString(), bytes: bytes.length,
    sha256: sha256Hex(bytes)
  });
  idx.versoes = idx.versoes.slice(0, 200);
  saveUploadsIndex(idx);
  return idx.versoes[0];
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
    if (req.method === "GET" || req.method === "HEAD") {
      // HEAD é usado pelo painel para detectar o modo API
      if (!existsSync(CONFIG_PATH)) { res.writeHead(404); res.end(); return; }
      if (req.method === "HEAD") { res.writeHead(200); res.end(); return; }
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
    const versao = registrarVersaoUpload(nome, buf);
    sendJSON(res, 200, { ok: true, nome, bytes: buf.length, destino: `data/uploads/${nome}`, versao });
    return;
  }

  if (pathname === "/api/admin/uploads") {
    if (req.method !== "GET") { sendJSON(res, 405, { erro: "Método não suportado" }); return; }
    const idx = loadUploadsIndex();
    sendJSON(res, 200, idx.versoes || []);
    return;
  }

  // §26 — rollback físico: recopia a versão anterior por cima do arquivo atual
  if (pathname === "/api/admin/uploads/restaurar") {
    if (req.method !== "POST") { sendJSON(res, 405, { erro: "Método não suportado" }); return; }
    const body = (await readBody(req, 64 * 1024)).toString("utf8");
    let json;
    try { json = JSON.parse(body); } catch { sendJSON(res, 400, { erro: "JSON inválido" }); return; }
    const nome = basename(sanitizarNomeArquivo(String(json.nome || "")));
    const versao = basename(sanitizarNomeArquivo(String(json.arquivoVersao || "")));
    const pVersao = join(UPLOADS_DIR, versao);
    if (!versao || !existsSync(pVersao)) { sendJSON(res, 404, { erro: "versão física não encontrada no servidor (data/uploads/)" }); return; }
    writeFileSync(join(UPLOADS_DIR, nome), readFileSync(pVersao));
    registrarVersaoUpload(nome, readFileSync(pVersao)); // registra a restauração como nova versão
    sendJSON(res, 200, { ok: true, restaurado: nome, de: versao });
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

  // Normaliza barra final (paridade com a Vercel: /foo/ ≡ /foo)
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);

  // API administrativa
  if (pathname.startsWith("/api/admin/")) {
    try {
      await handleAdminApi(req, res, pathname, url.searchParams);
    } catch (e) {
      sendJSON(res, 500, { erro: e.message || "erro interno" });
    }
    return;
  }

  // Buraco de acesso: caminhos diretos aos arquivos do painel (ou às suas
  // formas cleanUrls) recebem 404 — acesso oficial é somente via /admin.
  // OBS.: "/index.html" (Home) não é afetado — apenas caminhos sob /admin/.
  if (
    pathname === "/admin.html" ||
    pathname === "/admin/admin" ||
    pathname === "/admin/admin.html" ||
    pathname === "/admin/index" ||
    pathname === "/admin/index.html"
  ) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>404 Not Found</h1>");
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

  // Decodifica percent-encoding (ex.: "Admiss%C3%A3o" → "Admissão") —
  // a Vercel faz isso; sem isso, templates com acento dariam 404 no local.
  try { pathname = decodeURIComponent(pathname); } catch { /* mantém original */ }

  let filePath = join(ROOT, pathname);

  // Security: prevent directory traversal
  if (!resolve(filePath).startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Try to serve the file
  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>404 Not Found</h1>");
    return;
  }
  // Índice de diretório (paridade com a Vercel: /Docs/ → Docs/index.html)
  if (statSync(filePath).isDirectory()) {
    const idx = join(filePath, "index.html");
    if (existsSync(idx) && statSync(idx).isFile()) filePath = idx;
    else {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>404 Not Found</h1>");
      return;
    }
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
  console.log(`   http://localhost:${PORT}/admin      → admin/index.html (painel — e-mail @atento.com)`);
  console.log("\nAPI administrativa:");
  console.log("   GET/PUT  /api/admin/config     (overlay + backup automático)");
  console.log("   GET      /api/admin/backup     (lista; ?id= para baixar)");
  console.log("   POST     /api/admin/upload     (PDF validado)");
  console.log("   GET/POST /api/admin/historico  (auditoria)");
  console.log("\nChaves de teste (formulários):");
  console.log("   ATN-7KQ9-X4MP-82VF");
  console.log("   ATN-R6ZT-91WL-K3QX");
  console.log("   ATN-P8YD-4M7C-V2HK");
  console.log("   ATN-X5FN-Q9RA-63TJ");
  console.log("   ATN-3VKM-8QPX-L7DZ");
  console.log("\nPainel administrativo (/admin) — autenticação apartada:");
  console.log("   E-mail qualquer@atento.com + um dos códigos exclusivos do painel:");
  console.log("   ATN-DCUD-LUDJ-Z8AX");
  console.log("   ATN-CA34-5DRV-9LX4");
  console.log("   ATN-GPFM-EVFD-3722");
  console.log("   ATN-3D5B-PS6N-KDQF");
  console.log("   ATN-V9Q7-GE9T-7FX7");
  console.log("   (as chaves dos formulários NÃO autorizam o painel)");
  console.log("\nCtrl+C para encerrar.\n");
});
