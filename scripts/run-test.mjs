#!/usr/bin/env node

/**
 * Teste automatizado do sistema de proteção.
 * Inicia um servidor local, testa as rotas, e verifica o comportamento do guard.
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import crypto from "node:crypto";

const ROOT = join(import.meta.dirname, "..");
const PORT = 18234;

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
  ".pdf": "application/pdf"
};

function httpPost(url, body, contentType) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: "POST", timeout: 5000,
        headers: { "Content-Type": contentType || "application/json", "Content-Length": Buffer.byteLength(body || "") } },
      (res) => { let data = ""; res.on("data", (d) => (data += d)); res.on("end", () => resolve({ status: res.statusCode, body: data })); }
    );
    req.on("error", (e) => resolve({ error: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

function httpPut(url, body) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method: "PUT", timeout: 5000,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body || "") } },
      (res) => { let data = ""; res.on("data", (d) => (data += d)); res.on("end", () => resolve({ status: res.statusCode, body: data })); }
    );
    req.on("error", (e) => resolve({ error: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

// Réplica do pipeline do guard.js/admin-guard.js para validar verificadores
function deriveVerifierNode(normalized, salt) {
  const combined = Buffer.concat([Buffer.from(salt, "utf8"), Buffer.from(normalized, "utf8")]);
  const hash = crypto.createHash("sha256").update(combined).digest();
  const reversed = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) { let b = hash[i], r = 0; for (let j = 0; j < 8; j++) { r = (r << 1) | (b & 1); b >>= 1; } reversed[i] = r; }
  const mask = crypto.createHash("sha256").update(Buffer.from("guard-salt-mask-v1:" + salt, "utf8")).digest();
  const xored = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) xored[i] = reversed[i] ^ mask[i];
  const shuffled = Buffer.alloc(32);
  for (let i = 0; i < 32; i += 2) { shuffled[i] = xored[i + 1]; shuffled[i + 1] = xored[i]; }
  return shuffled.toString("hex");
}

// Réplica da regra de domínio do admin-guard.js (seções 6/69 do prompt do painel)
const ADMIN_DOMAIN = "@atento.com";
const ADMIN_EMAIL_RE = /^[a-z0-9._%+\-]+@atento\.com$/;
function adminDomainOk(email) {
  const e = String(email || "").trim().toLowerCase().replace(/\s+/g, "");
  return e.length > ADMIN_DOMAIN.length && e.endsWith(ADMIN_DOMAIN) && ADMIN_EMAIL_RE.test(e);
}

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
    assert("vercel.json tem rewrite /admin", rewrites.some(r => r.source === "/admin"), "missing");
  }

  // ── TEST 9: Painel administrativo servido ──
  console.log("\n📋 Teste 9: Painel administrativo");
  const adminR = await fetch(`http://127.0.0.1:${PORT}/admin`);
  assert("/admin → HTTP 200", adminR.status === 200, `status ${adminR.status}`);
  assert("/admin contém Painel Administrativo", adminR.body.includes("Painel Administrativo"), "missing");
  assert("/admin inclui admin-guard.js", adminR.body.includes("admin-guard.js"), "missing");
  assert("/admin inclui botão Sair", adminR.body.includes("atentoAdminEndSession"), "missing");
  const adminGuardR = await fetch(`http://127.0.0.1:${PORT}/admin-guard.js`);
  assert("admin-guard.js → HTTP 200", adminGuardR.status === 200, `status ${adminGuardR.status}`);
  assert("admin-guard.js não contém e-mails reais", !adminGuardR.body.includes("admin@atento.com") && !adminGuardR.body.includes("gestor.rh@atento.com"), "plaintext email in admin-guard.js!");
  assert("admin-guard.js usa sessionStorage", adminGuardR.body.includes("sessionStorage"), "missing");
  const LS_USE = /localStorage\s*(?:\.(?:setItem|getItem|removeItem|key|clear)\s*\(|\[)|window\.localStorage/;
  assert("admin-guard.js NÃO usa localStorage", !LS_USE.test(adminGuardR.body), "localStorage usage found!");
  assert("admin-guard.js rejeita subdomínio (.endsWith com tamanho)", adminGuardR.body.includes("length <= DOMAIN.length"), "missing");
  const admCss = await fetch(`http://127.0.0.1:${PORT}/admin/panel.css`);
  assert("admin/panel.css → HTTP 200", admCss.status === 200, `status ${admCss.status}`);
  const admPersist = await fetch(`http://127.0.0.1:${PORT}/admin/persistence.js`);
  assert("admin/persistence.js → HTTP 200", admPersist.status === 200, `status ${admPersist.status}`);
  const admPanel = await fetch(`http://127.0.0.1:${PORT}/admin/panel.js`);
  assert("admin/panel.js → HTTP 200", admPanel.status === 200, `status ${admPanel.status}`);
  assert("panel.js NÃO usa localStorage", !LS_USE.test(admPanel.body), "localStorage usage found!");
  const admPersistBody = admPersist.body;
  assert("persistence.js NÃO usa localStorage", !LS_USE.test(admPersistBody), "localStorage usage found!");

  // ── TEST 10: Regra de domínio @atento.com (seção 69) ──
  console.log("\n📋 Teste 10: Regra de domínio @atento.com");
  assert("usuario@atento.com → permitido", adminDomainOk("usuario@atento.com"), "should pass");
  assert("USUARIO@ATENTO.COM → permitido", adminDomainOk("USUARIO@ATENTO.COM"), "should pass");
  assert("usuario@Atento.com → permitido", adminDomainOk("usuario@Atento.com"), "should pass");
  assert("nome.sobrenome@atento.com → permitido", adminDomainOk("nome.sobrenome@atento.com"), "should pass");
  assert("usuario@gmail.com → negado", !adminDomainOk("usuario@gmail.com"), "should fail");
  assert("usuario@hotmail.com → negado", !adminDomainOk("usuario@hotmail.com"), "should fail");
  assert("usuario@outlook.com → negado", !adminDomainOk("usuario@outlook.com"), "should fail");
  assert("usuario@atento.com.br → negado", !adminDomainOk("usuario@atento.com.br"), "should fail");
  assert("atento.com → negado", !adminDomainOk("atento.com"), "should fail");
  assert("usuario@sub.atento.com → negado", !adminDomainOk("usuario@sub.atento.com"), "should fail");
  assert("usuario@atentocom → negado", !adminDomainOk("usuario@atentocom"), "should fail");
  assert("usuário@atento.com (acentuado) → negado", !adminDomainOk("usuário@atento.com"), "should fail");

  // ── TEST 11: Corpus de verificadores do painel (pipeline derivado) ──
  console.log("\n📋 Teste 11: Verificadores do painel");
  const gMatches = adminGuardR.body.match(/\{ s: "([a-f0-9]+)", v: "([a-f0-9]{64})" \}/g) || [];
  assert("admin-guard.js contém pares {s,v}", gMatches.length >= 2, "wrong count");
  {
    const pairs = gMatches.map(m => { const mm = m.match(/s: "([a-f0-9]+)", v: "([a-f0-9]{64})"/); return { s: mm[1], v: mm[2] }; });
    assert("admin@atento.com deriva um verificador do corpus",
      pairs.some(p => deriveVerifierNode("admin@atento.com", p.s) === p.v), "no match");
    assert("usuario@atento.com deriva um verificador do corpus",
      pairs.some(p => deriveVerifierNode("usuario@atento.com", p.s) === p.v), "no match");
    assert("nome.sobrenome@atento.com deriva um verificador do corpus",
      pairs.some(p => deriveVerifierNode("nome.sobrenome@atento.com", p.s) === p.v), "no match");
    assert("e-mail de teste removido (gestor.rh) não deriva mais verificador",
      !pairs.some(p => deriveVerifierNode("gestor.rh@atento.com", p.s) === p.v), "unexpected match");
    assert("e-mail fora do domínio não deriva verificador válido",
      !pairs.some(p => deriveVerifierNode("atacante@gmail.com", p.s) === p.v), "unexpected match");
  }

  // ── TEST 12: Sidebar ⚙ Configurações nas 4 páginas ──
  console.log("\n📋 Teste 12: Sidebar — Configurações");
  for (const page of ["ficha_cadastral.html", "assistencia_medica.html", "carta_bradesco.html", "termos_aceite.html"]) {
    const r = await fetch(`http://127.0.0.1:${PORT}/${page}`);
    assert(`${page} contém link Configurações`, r.status === 200 && r.body.includes("admin/admin.html") && r.body.includes("Configurações"), "missing");
  }

  // ── TEST 13: API administrativa (integração com test-server.mjs) ──
  console.log("\n📋 Teste 13: API administrativa");
  const srvPort = 18235;
  const srv = spawn(process.execPath, [join(ROOT, "scripts", "test-server.mjs")],
    { env: { ...process.env, PORT: String(srvPort) }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    let srvUp = false;
    for (let i = 0; i < 40; i++) {
      const r = await fetch(`http://127.0.0.1:${srvPort}/vercel.json`);
      if (r.status === 200) { srvUp = true; break; }
      await new Promise(r2 => setTimeout(r2, 250));
    }
    assert("test-server.mjs sobe na porta 18235", srvUp, "server not up");
    if (srvUp) {
      const admin404 = await fetch(`http://127.0.0.1:${srvPort}/api/admin/config`);
      assert("GET config sem arquivo → 404", admin404.status === 404, `status ${admin404.status}`);
      const put = await httpPut(`http://127.0.0.1:${srvPort}/api/admin/config`, JSON.stringify({ campos_ficha: { teste: { x: 1 } } }));
      assert("PUT config → 200", put.status === 200, `status ${put.status}`);
      const get = await fetch(`http://127.0.0.1:${srvPort}/api/admin/config`);
      assert("GET config após PUT → 200", get.status === 200, `status ${get.status}`);
      assert("config persistida corresponde", get.body.includes("campos_ficha"), "missing");
      const put2 = await httpPut(`http://127.0.0.1:${srvPort}/api/admin/config`, JSON.stringify({ campos_ficha: {} }));
      assert("segundo PUT → backup criado", put2.status === 200 && put2.body.includes("criado"), "no backup");
      const backups = await fetch(`http://127.0.0.1:${srvPort}/api/admin/backup`);
      assert("GET backups → lista não vazia", backups.status === 200 && backups.body.includes("admin-config"), "empty");
      const uploadBad = await httpPost(`http://127.0.0.1:${srvPort}/api/admin/upload`, JSON.stringify({ nome: "mal.pdf", data: Buffer.from("nao-e-pdf").toString("base64") }));
      assert("upload rejeita não-PDF (assinatura)", uploadBad.status === 400, `status ${uploadBad.status}`);
      const uploadOk = await httpPost(`http://127.0.0.1:${srvPort}/api/admin/upload`, JSON.stringify({ nome: "teste.pdf", data: Buffer.from("%PDF-1.4 teste").toString("base64") }));
      assert("upload aceita PDF com assinatura", uploadOk.status === 200, `status ${uploadOk.status}`);
      const ev = await httpPost(`http://127.0.0.1:${srvPort}/api/admin/historico`, JSON.stringify({ acao: "teste", usuario: "suite" }));
      assert("POST historico → 200", ev.status === 200, `status ${ev.status}`);
      const hist = await fetch(`http://127.0.0.1:${srvPort}/api/admin/historico`);
      assert("GET historico contém evento", hist.status === 200 && hist.body.includes("suite"), "missing");
      const admPage = await fetch(`http://127.0.0.1:${srvPort}/admin`);
      assert("test-server serve /admin", admPage.status === 200 && admPage.body.includes("Painel Administrativo"), "missing");
    }
  } finally {
    srv.kill();
  }
  // limpa artifacts da API gerados pela suíte
  try { rmSync(join(ROOT, "data"), { recursive: true, force: true }); } catch { /* ignore */ }

  // ── Summary ──
  console.log(`\n${"═".repeat(50)}`);
  console.log(`Resultados: ${pass} passaram, ${fail} falharam`);
  console.log(`${"═".repeat(50)}\n`);

  server.close();
  process.exit(fail > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); server.close(); process.exit(1); });
