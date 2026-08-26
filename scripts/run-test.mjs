#!/usr/bin/env node

/**
 * Teste automatizado do sistema de proteção.
 * Inicia um servidor local, testa as rotas, e verifica o comportamento do guard.
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import http from "node:http";

const ROOT = join(import.meta.dirname, "..");
const PORT = 18234;

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
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf"
};

// Start server
const server = createServer((req, res) => {
  let pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;
  if (REWRITES[pathname]) pathname = REWRITES[pathname];
  if (!extname(pathname) && existsSync(join(ROOT, pathname + ".html"))) pathname += ".html";
  const fp = join(ROOT, pathname);
  if (!fp.startsWith(ROOT) || !existsSync(fp) || !statSync(fp).isFile()) {
    res.writeHead(404); res.end("nf"); return;
  }
  const ext = extname(fp).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
  res.end(readFileSync(fp));
});

function fetch(url) {
  return new Promise((resolve) => {
    http.get(url, { timeout: 5000 }, (res) => {
      let data = "";
      res.on("data", (d) => data += d);
      res.on("end", () => resolve({ status: res.statusCode, body: data, length: data.length }));
    }).on("error", (e) => resolve({ error: e.message }));
  });
}

async function runTests() {
  await new Promise(r => server.listen(PORT, r));
  console.log(`\n🧪 Servidor de teste rodando em http://localhost:${PORT}\n`);

  let pass = 0, fail = 0;

  function assert(label, condition, detail) {
    if (condition) { console.log(`  ✅ ${label}`); pass++; }
    else { console.log(`  ❌ ${label} — ${detail || ""}`); fail++; }
  }

  // ── TEST 1: Route Rewriting ──
  console.log("📋 Teste 1: Reescrita de rotas");
  for (const [route, file] of Object.entries(REWRITES)) {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`);
    assert(`${route} → HTTP 200`, r.status === 200, `got ${r.status}`);
    if (r.body) {
      assert(`${route} contém <title>`, r.body.includes("<title>"), "missing title");
    }
  }

  // ── TEST 2: Guard.js served ──
  console.log("\n📋 Teste 2: Guard.js servido");
  const guardR = await fetch(`http://127.0.0.1:${PORT}/guard.js`);
  assert("GET /guard.js → HTTP 200", guardR.status === 200, `got ${guardR.status}`);
  assert("guard.js contém verifyCode", guardR.body.includes("verifyCode"), "missing verifyCode");
  assert("guard.js contém G array", guardR.body.includes("const G ="), "missing G array");
  assert("guard.js contém refreshSession", guardR.body.includes("refreshSession"), "missing refreshSession");

  // ── TEST 3: Protected pages include guard ──
  console.log("\n📋 Teste 3: Páginas protegidas incluem guard");
  for (const route of ["/f075", "/f089", "/bradesco", "/termos"]) {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`);
    assert(`${route} inclui <script src="guard.js">`, r.body.includes('src="guard.js"'), "missing guard.js script");
    assert(`${route} inclui data-guard-hidden CSS`, r.body.includes("data-guard-hidden"), "missing guard CSS");
    assert(`${route} inclui botão Encerrar acesso`, r.body.includes("atentoEndSession"), "missing end session button");
  }

  // ── TEST 4: Home page does NOT include guard ──
  console.log("\n📋 Teste 4: Home page NÃO inclui guard");
  const homeR = await fetch(`http://127.0.0.1:${PORT}/`);
  assert("/ não inclui guard.js script", !homeR.body.includes('src="guard.js"'), "guard.js should not be on home");

  // ── TEST 5: No real keys in source ──
  console.log("\n📋 Teste 5: Chaves reais ausentes do código");
  const guardedPages = ["/f075", "/f089", "/bradesco", "/termos"];
  const keys = ["ATN-7KQ9-X4MP-82VF", "ATN-R6ZT-91WL-K3QX", "ATN-P8YD-4M7C-V2HK", "ATN-X5FN-Q9RA-63TJ", "ATN-3VKM-8QPX-L7DZ"];
  const normalized = keys.map(k => k.replace(/[\s\-]/g, ""));
  
  for (const route of guardedPages) {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`);
    for (const key of keys) {
      assert(`${route} não contém ${key}`, !r.body.includes(key), "key found in HTML!");
    }
    for (const n of normalized) {
      assert(`${route} não contém ${n}`, !r.body.includes(n), "normalized key found!");
    }
  }

  // guard.js itself
  for (const key of keys) {
    assert(`guard.js não contém ${key}`, !guardR.body.includes(key), "key found in guard.js!");
  }
  for (const n of normalized) {
    assert(`guard.js não contém ${n}`, !guardR.body.includes(n), "normalized key in guard.js!");
  }

  // ── TEST 6: Guard verifiers are derived (hex, not keys) ──
  console.log("\n📋 Teste 6: Verificadores derivados");
  assert("guard.js contém array G com 5 entries", (guardR.body.match(/\{s:"/g) || []).length === 5, "wrong count");
  assert("Verifiers são hex (64 chars)", /[a-f0-9]{64}/.test(guardR.body), "not hex");

  // ── TEST 7: Session refresh mechanism ──
  console.log("\n📋 Teste 7: Mecanismo de refresh de sessão");
  assert("guard.js contém refreshSession", guardR.body.includes("function refreshSession"), "missing");
  assert("guard.js contém scheduleRefresh", guardR.body.includes("function scheduleRefresh"), "missing");
  assert("guard.js escuta click para refresh", guardR.body.includes('addEventListener("click"') || guardR.body.includes("addEventListener(\"click\""), "missing click listener");
  assert("guard.js escuta keypress para refresh", guardR.body.includes('addEventListener("keypress"') || guardR.body.includes("addEventListener(\"keypress\""), "missing keypress listener");

  // ── TEST 8: Clean URLs config in vercel.json ──
  console.log("\n📋 Teste 8: Configuração vercel.json");
  const vercelR = await fetch(`http://127.0.0.1:${PORT}/vercel.json`);
  if (vercelR.status === 200) {
    const v = JSON.parse(vercelR.body);
    const rewrites = v.rewrites || [];
    assert("vercel.json tem rewrite /f075", rewrites.some(r => r.source === "/f075"), "missing");
    assert("vercel.json tem rewrite /f089", rewrites.some(r => r.source === "/f089"), "missing");
    assert("vercel.json tem rewrite /bradesco", rewrites.some(r => r.source === "/bradesco"), "missing");
    assert("vercel.json tem rewrite /termos", rewrites.some(r => r.source === "/termos"), "missing");
  }

  // ── Summary ──
  console.log(`\n${"═".repeat(50)}`);
  console.log(`Resultados: ${pass} passaram, ${fail} falharam`);
  console.log(`${"═".repeat(50)}\n`);

  server.close();
  process.exit(fail > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); server.close(); process.exit(1); });
