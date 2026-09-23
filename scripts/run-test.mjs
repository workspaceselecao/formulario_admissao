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

// Regex de uso proibido de localStorage (módulo — reutilizada pelo Teste 14)
const LS_USE_RE = /localStorage\s*(?:\.(?:setItem|getItem|removeItem|key|clear)\s*\(|\[)|window\.localStorage/;

const REWRITES = {
  "/f075": "/ficha_cadastral.html",
  "/f089": "/assistencia_medica.html",
  "/bradesco": "/carta_bradesco.html",
  "/termos": "/termos_aceite.html",
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

// Códigos EXCLUSIVOS do painel (não são as chaves dos formulários)
const PANEL_CODES = [
  "ATN-DCUD-LUDJ-Z8AX",
  "ATN-CA34-5DRV-9LX4",
  "ATN-GPFM-EVFD-3722",
  "ATN-3D5B-PS6N-KDQF",
  "ATN-V9Q7-GE9T-7FX7"
];

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
    assert("destinos de rewrite sem extensão .html (forma cleanUrls)", rewrites.every(r => !String(r.destination || "").endsWith(".html")), "destination with .html found");
    assert("rewrite /admin aponta para /admin/ (índice físico)", (rewrites.find(r => r.source === "/admin") || {}).destination === "/admin/", "wrong destination");
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
  assert("admin-guard.js sem e-mails autorizados em texto plano", !/(admin|usuario|gestor\.rh)@atento\.com/.test(adminGuardR.body), "plaintext authorized email!");
  assert("admin-guard.js usa sessionStorage", adminGuardR.body.includes("sessionStorage"), "missing");
  const LS_USE = /localStorage\s*(?:\.(?:setItem|getItem|removeItem|key|clear)\s*\(|\[)|window\.localStorage/;
  assert("admin-guard.js NÃO usa localStorage", !LS_USE.test(adminGuardR.body), "localStorage usage found!");
  assert("admin-guard.js rejeita subdomínio (.endsWith com tamanho)", adminGuardR.body.includes("length <= DOMAIN.length"), "missing");
  assert("admin-guard.js tem corpus próprio CG (apartado do guard.js)", /const CG = \[/.test(adminGuardR.body), "missing CG");
  assert("admin-guard.js NÃO contém array G do guard.js", !/const G = \[/.test(adminGuardR.body), "form guard corpus found!");
  assert("admin-guard.js exige código (verifyPanelCode)", adminGuardR.body.includes("function verifyPanelCode"), "missing");
  assert("admin-guard.js valida e-mail + código (verifyAcesso)", adminGuardR.body.includes("function verifyAcesso") && adminGuardR.body.includes("verifyPanelCode"), "missing");
  assert("tela de login tem campo de e-mail", adminGuardR.body.includes("afEmail"), "missing");
  assert("tela de login tem campo de código", adminGuardR.body.includes("afCode"), "missing");
  const admCss = await fetch(`http://127.0.0.1:${PORT}/admin/panel.css`);
  assert("admin/panel.css → HTTP 200", admCss.status === 200, `status ${admCss.status}`);
  const admPersist = await fetch(`http://127.0.0.1:${PORT}/admin/persistence.js`);
  assert("admin/persistence.js → HTTP 200", admPersist.status === 200, `status ${admPersist.status}`);
  const admPanel = await fetch(`http://127.0.0.1:${PORT}/admin/panel.js`);
  assert("admin/panel.js → HTTP 200", admPanel.status === 200, `status ${admPanel.status}`);
  assert("panel.js NÃO usa localStorage", !LS_USE.test(admPanel.body), "localStorage usage found!");
  const admPersistBody = admPersist.body;
  assert("persistence.js NÃO usa localStorage", !LS_USE.test(admPersistBody), "localStorage usage found!");

  // Regressão: regra do guard por prefixo /admin (cobre cleanUrls da Vercel)
  assert("guard usa regra por prefixo /admin", adminGuardR.body.includes('p.startsWith("/admin/")'), "missing");
  {
    const protegido = (p) => {
      const x = String(p).replace(/\/+$/, "");
      return x === "/admin" || x === "/admin.html" || x.startsWith("/admin/");
    };
    assert("guard cobre /admin", protegido("/admin"), "should protect");
    assert("guard cobre /admin/", protegido("/admin/"), "should protect");
    assert("guard cobre /admin.html", protegido("/admin.html"), "should protect");
    assert("guard cobre /admin/index.html", protegido("/admin/index.html"), "should protect");
    assert("guard cobre /admin/index (cleanUrls)", protegido("/admin/index"), "should protect");
    assert("guard cobre /admin/admin (legado cleanUrls)", protegido("/admin/admin"), "should protect");
    assert("guard NÃO protege páginas públicas", !protegido("/ficha_cadastral.html") && !protegido("/index.html") && !protegido("/") && !protegido("/administrator"), "false positive");
  }
  assert("guard injetado no <head> (esconde antes da 1ª pintura)", adminR.body.indexOf("admin-guard.js") < adminR.body.indexOf("<body>"), "after body!");
  assert("painel não carrega admin-guard.js duas vezes", (adminR.body.match(/<script src="[^"]*admin-guard\.js"><\/script>/g) || []).length === 1, "duplicated!");

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

  // ── TEST 11: Códigos EXCLUSIVOS do painel (corpus CG derivado) ──
  console.log("\n📋 Teste 11: Códigos exclusivos do painel");
  {
    const cgMatches = adminGuardR.body.match(/\{ s: "([a-f0-9]+)", v: "([a-f0-9]{64})" \}/g) || [];
    assert("admin-guard.js contém 5 pares {s,v} no corpus CG", cgMatches.length === 5, "wrong count: " + cgMatches.length);
    const pairs = cgMatches.map(m => { const mm = m.match(/s: "([a-f0-9]+)", v: "([a-f0-9]{64})"/); return { s: mm[1], v: mm[2] }; });
    for (const code of PANEL_CODES) {
      const norm = code.replace(/-/g, "");
      assert(`código do painel ${code} deriva um verificador do CG`,
        pairs.some(p => deriveVerifierNode(norm, p.s) === p.v), "no match");
    }
    assert("chave de formulário NÃO autoriza o painel (apartamento efetivo)",
      !pairs.some(p => deriveVerifierNode("ATN7KQ9X4MP82VF", p.s) === p.v), "form key matches panel corpus!");
    assert("código inventado não deriva verificador",
      !pairs.some(p => deriveVerifierNode("ATNXXXXXXXXXXXXX", p.s) === p.v), "unexpected match");
  }

  // ── TEST 12: Sidebar ⚙ Configurações nas 4 páginas + card na Home ──
  console.log("\n📋 Teste 12: Sidebar — Configurações");
  for (const page of ["ficha_cadastral.html", "assistencia_medica.html", "carta_bradesco.html", "termos_aceite.html"]) {
    const r = await fetch(`http://127.0.0.1:${PORT}/${page}`);
    assert(`${page} contém link Configurações`, r.status === 200 && r.body.includes('href="/admin"') && r.body.includes("Configurações"), "missing");
  }
  const homeCardR = await fetch(`http://127.0.0.1:${PORT}/index.html`);
  assert("Home tem card Configurações apontando para o painel", homeCardR.status === 200 && homeCardR.body.includes('href="/admin"') && homeCardR.body.includes(">Configurações<"), "missing");
  assert("Home não usa mais o caminho admin/admin.html", !homeCardR.body.includes("admin/admin.html"), "legacy link");
  assert("Home não linka mais termos_aceite.html", !homeCardR.body.includes('href="termos_aceite.html"'), "still linked");
  assert("Home marca o card como Acesso restrito", homeCardR.body.includes("Acesso restrito"), "missing");

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
      const admDirect1 = await fetch(`http://127.0.0.1:${srvPort}/admin/admin.html`);
      assert("acesso direto /admin/admin.html → 404 (sem buraco)", admDirect1.status === 404, `status ${admDirect1.status}`);
      const admDirect2 = await fetch(`http://127.0.0.1:${srvPort}/admin.html`);
      assert("acesso direto /admin.html → 404 (sem buraco)", admDirect2.status === 404, `status ${admDirect2.status}`);
      const admDirect3 = await fetch(`http://127.0.0.1:${srvPort}/admin/index.html`);
      assert("acesso direto /admin/index.html → 404 (sem buraco)", admDirect3.status === 404, `status ${admDirect3.status}`);
      const admDirect4 = await fetch(`http://127.0.0.1:${srvPort}/admin/index`);
      assert("acesso direto /admin/index (cleanUrls) → 404 (sem buraco)", admDirect4.status === 404, `status ${admDirect4.status}`);
      const admDirect5 = await fetch(`http://127.0.0.1:${srvPort}/admin/admin`);
      assert("acesso direto /admin/admin (legado cleanUrls) → 404", admDirect5.status === 404, `status ${admDirect5.status}`);
      const admTip = await fetch(`http://127.0.0.1:${srvPort}/admin-guard.js`);
      assert("login sem tip de e-mail (nome.sobrenome removido)", !admTip.body.includes("nome.sobrenome@atento.com"), "tip still present");
    }
  } finally {
    srv.kill();
  }
  // limpa artifacts da API gerados pela suíte
  try { rmSync(join(ROOT, "data"), { recursive: true, force: true }); } catch { /* ignore */ }

  // ── TEST 14: Painel administrativo v2 (Tarefas 0–7 do prompt mestre) ──
  console.log("\n📋 Teste 14: Painel v2 — formModal, saúde, cidades, pdfs_meta, diff, histórico");
  await testarPainelV2(assert);

  // ── TEST 15: Reestruturação v3 (entidades, templates versionados, validação) ──
  console.log("\n📋 Teste 15: Painel v3 — entidades, abas, versões, validação, palette");
  await testarPainelV3(assert, vmMod);

  // ── TEST 16: Field Builder (§10) — CRUD de campos com IDs estáveis ──
  console.log("\n📋 Teste 16: Field Builder — criar/renomear/excluir campos (IDs estáveis)");
  await testarPainelV3FieldBuilder(assert);

  // ── Summary ──
  console.log(`\n${"═".repeat(50)}`);
  console.log(`Resultados: ${pass} passaram, ${fail} falharam`);
  console.log(`${"═".repeat(50)}\n`);

  server.close();
  process.exit(fail > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); server.close(); process.exit(1); });

// ═══════════════════════════════════════════════════════════════════
// TESTE 14 — Painel administrativo v2 (Tarefas 0–7)
//
// A suíte é HTTP/Node (sem browser), então os testes são de dois tipos:
//   a) estruturais — o painel servido contém os elementos/funções novos;
//   b) comportamentais — panel.js é executado em node:vm com stubs de
//      DOM e a lógica pura é exercitada via AdminPanel.__teste.
// Sem dependência nova e sem build step (regra §0).
// ═══════════════════════════════════════════════════════════════════
// Módulo vm e leitor compartilhados entre as suítes v2/v3
let vmMod = null;
let vmReadFile = null;

function criarStubsDom() {
  function el() {
    return {
      style: {}, dataset: {}, classList: {
        _s: new Set(),
        add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
        contains(c) { return this._s.has(c); }
      },
      attributes: {}, innerHTML: "", textContent: "", hidden: false, disabled: false,
      value: "", checked: false, options: [], files: null,
      addEventListener() {}, removeEventListener() {},
      setAttribute(k, v) { this.attributes[k] = v; },
      getAttribute(k) { return this.attributes[k]; },
      removeAttribute() {}, focus() {}, appendChild() {}, remove() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      closest() { return null; }, click() {},
      parentElement: null, parentNode: null
    };
  }
  const cache = {};
  return {
    getElementById(id) { if (!cache[id]) cache[id] = el(); return cache[id]; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement: el,
    body: Object.assign(el(), { appendChild() {}, removeChild() {} }),
    scrollTo() {},
    location: { replace() {} }
  };
}

async function testarPainelV2(assert) {
  const vm = await import("node:vm");
  const readFile = (await import("node:fs")).readFileSync;
  vmMod = vm;
  vmReadFile = readFile;

  // ── 14.a — estruturais ──
  const adminR2 = await fetch(`http://127.0.0.1:${PORT}/admin`);
  assert("formOverlay presente (Tarefa 1)", adminR2.body.includes('id="formOverlay"'), "missing");
  assert("saúde do sistema no dashboard (Tarefa 0)", adminR2.body.includes('id="dashSaude"'), "missing");
  assert("paginação de cidades (Tarefa 2.3)", adminR2.body.includes('id="cidPaginacao"'), "missing");
  assert("barra de troca em massa (Tarefa 2.4)", adminR2.body.includes('id="cidBulkBar"'), "missing");
  assert("importação CSV/JSON de cidades (Tarefa 2.5)", adminR2.body.includes('id="cidImportFile"'), "missing");
  assert("lista de campos do editor (Tarefa 4)", adminR2.body.includes('id="edListaCampos"') && adminR2.body.includes('id="edBuscaCampo"'), "missing");
  assert("botão restaurar campo individual (Tarefa 4)", adminR2.body.includes('id="edRestore"'), "missing");
  assert("filtros de histórico (Tarefa 6)", adminR2.body.includes('id="histBusca"') && adminR2.body.includes('id="histAcao"') && adminR2.body.includes('id="histUsuario"'), "missing");
  const cssR = await fetch(`http://127.0.0.1:${PORT}/admin/panel.css`);
  assert("selos editable/readonly no CSS (Tarefa 7)", cssR.body.includes(".badge.editable") && cssR.body.includes(".badge.readonly"), "missing");
  assert("legendas de selos nas seções (Tarefa 7)", adminR2.body.includes("legend-selos"), "missing");
  const panelCode = readFile(join(ROOT, "admin", "panel.js"), "utf8");
  assert("panel.js sem localStorage", !LS_USE_RE.test(panelCode), "localStorage usage found!");
  assert("formModal documentada com JSDoc (Tarefa 1)", panelCode.includes("@returns {Promise<Object|null>}"), "missing");

  // ── 14.b — comportamentais (node:vm com stubs) ──
  const stubs = criarStubsDom();
  const sandbox = {
    window: {}, document: stubs, console, setTimeout() {}, clearTimeout() {},
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => "" }),
    URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
    Blob: class {}, Math, Date, JSON, Object, Array, Number, String, Set, Promise, Error,
    encodeURIComponent, decodeURIComponent
  };
  sandbox.window.document = stubs;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(panelCode, context, { filename: "panel.js" });
  const T = sandbox.window.AdminPanel && sandbox.window.AdminPanel.__teste;
  assert("panel.js executa em node:vm e expõe AdminPanel.__teste", !!T, "missing export");
  if (!T) return;

  const st = T.state;

  // 14.1 — ID estável + overlay com patch antigo {ficha} (compatibilidade §2.8)
  st.cityArr = [
    { idx: 0, cidade: "Vitória da Conquista", uf: "BA", regional: "BA", ficha: "FICHA BH", fonte: "cidades_brasil.json" },
    { idx: 1, cidade: "Feira de Santana", uf: "BA", regional: "BA", ficha: "FICHA FSA", fonte: "cidades_brasil.json" }
  ];
  st.overlay.cidades = { "VITORIA DA CONQUISTA": { ficha: "FICHA GNDI" } }; // formato antigo
  T.aplicarOverlayCidades();
  const vc = st.cityArr[0];
  assert("patch antigo {ficha} é aplicado", vc.ficha === "FICHA GNDI", `got ${vc.ficha}`);
  assert("origemChave capturada uma única vez (ID estável, T2.1)", vc.origemChave === "VITORIA DA CONQUISTA", `got ${vc.origemChave}`);

  // 14.2 — renomear NÃO quebra a referência (patch continua pela origemChave)
  vc.cidade = "Conquista"; T.aplicarOverlayCidades();
  assert("renomear mantém patch via origemChave", vc.cidade === "Conquista" && vc.ficha === "FICHA GNDI" && vc.editada === true, `city=${vc.cidade} ficha=${vc.ficha}`);

  // 14.3 — patch novo {cidade,uf,regional,ficha} sobrepõe todos os campos
  st.cityArr[1].origemChave = null;
  st.overlay.cidades["FEIRA DE SANTANA"] = { cidade: "Feira de Santana", uf: "BA", regional: "BA", ficha: "FICHA REEMBOLSO" };
  T.aplicarOverlayCidades();
  const fs = st.cityArr[1];
  assert("patch novo aplica cidade/uf/regional/ficha", fs.cidade === "Feira de Santana" && fs.ficha === "FICHA REEMBOLSO" && fs.editada === true, JSON.stringify(fs));

  // 14.4 — duplicidade é bloqueada na classificação (usa mesma normalização)
  st.cityMap = {}; for (const r of st.cityArr) st.cityMap[T.normalizarChaveCidade(r.cidade)] = r.ficha;
  const cls = T.classificarCidadesImportadas([
    { cidade: "Barreiras", uf: "BA", regional: "", ficha: "FICHA BH" },
    { cidade: "Barreiras", uf: "BA", regional: "", ficha: "FICHA BH" },
    { cidade: "", uf: "BA", regional: "", ficha: "FICHA BH" },
    { cidade: "Luís Eduardo Magalhães", uf: "", regional: "", ficha: "FICHA BH" }
  ]);
  assert("import: 1 válido", cls.validos.length === 1 && cls.validos[0].cidade === "Barreiras", JSON.stringify(cls.validos));
  assert("import: 1 duplicado", cls.duplicados.length === 1, JSON.stringify(cls.duplicados));
  assert("import: 2 inválidos com motivo", cls.invalidos.length === 2 && cls.invalidos.every(r => !!r.motivo), JSON.stringify(cls.invalidos));

  // 14.5 — parser CSV (separador ; e ,) e JSON array
  const csvPv = T.parseCidadesTexto("cidade;uf;regional;ficha\nAlagoinhas;BA;;FICHA SJC\nPau Brasil;BA;;FICHA BH");
  assert("parser CSV ';' lê 2 registros", !csvPv.erro && csvPv.registros.length === 2 && csvPv.registros[0].cidade === "Alagoinhas", JSON.stringify(csvPv).slice(0, 200));
  const csvVirg = T.parseCidadesTexto("cidade,uf,regional,ficha\nIlhéus,BA,,FICHA FSA");
  assert("parser CSV ',' lê 1 registro", !csvVirg.erro && csvVirg.registros.length === 1, JSON.stringify(csvVirg).slice(0, 120));
  const csvCab = T.parseCidadesTexto("nome;municipio\nX;Y");
  assert("CSV sem cabeçalho esperado → erro acionável", !!csvCab.erro && csvCab.erro.includes("abeçalho"), JSON.stringify(csvCab));
  const jsonArr = T.parseCidadesTexto(JSON.stringify([{ CIDADE: "Teixeira de Freitas", UF: "BA", REGIONAL: "BA", "FICHA A UTILIZAR": "FICHA GNDI" }]));
  assert("parser JSON array (formato cidades_brasil)", !jsonArr.erro && jsonArr.registros.length === 1 && jsonArr.registros[0].cidade === "Teixeira de Freitas", JSON.stringify(jsonArr).slice(0, 200));

  // 14.6 — normalização de ficha preserva correção histórica REEBOLSO→REEMBOLSO
  assert("normalizarFicha corrige REEBOLSO", T.normalizarFicha("FICHA REEBOLSO") === "FICHA REEMBOLSO", "fix broken");

  // 14.7 — pdfs_meta aplicado sobre o array-base (Tarefa 3)
  st.overlay.pdfs_meta = { "FICHA BH.pdf": { tipo: "Regional (custom)" } };
  const p = T.pdfsEfetivos().find(x => x.arquivo === "FICHA BH.pdf");
  const outro = T.pdfsEfetivos().find(x => x.arquivo === "FICHA SJC.pdf");
  assert("pdfs_meta sobrepõe tipo e preserva demais", p.tipo === "Regional (custom)" && p.formulario === "F-089 (Outros Planos)" && outro.tipo === "Regional", "wrong");

  // 14.8 — diff de importação: novos/alterados/idênticos + exclusão por desmarque (Tarefa 5)
  const overlayImportado = {
    campos_ficha: { campo_a: { x: 5 } },                    // novo
    campos_declaracao: {},
    cidades: { "VITORIA DA CONQUISTA": { ficha: "FICHA SJC" } }, // alterado (GNDI → SJC)
    cidades_novas: [
      { id: 99, cidade: "Cidade Nova", uf: "BA", regional: "BA", ficha: "FICHA BH" }, // nova
      { id: 98, cidade: "Feira de Santana", uf: "BA", regional: "BA", ficha: "FICHA FSA" } // duplicada
    ]
  };
  const diff = T.diffImportacao(overlayImportado);
  assert("diff: 1 novo em campos_ficha", diff.campos_ficha.novos.length === 1 && diff.campos_ficha.novos[0].k === "campo_a", JSON.stringify(diff.campos_ficha));
  assert("diff: 1 alterado em cidades (de→para)", diff.cidades.alterados.length === 1 && diff.cidades.alterados[0].de.ficha === "FICHA GNDI" && diff.cidades.alterados[0].para.ficha === "FICHA SJC", JSON.stringify(diff.cidades));
  assert("diff: cidades_novas separa nova de duplicada", diff.cidades_novas.novos.length === 1 && diff.cidades_novas.duplicados.length === 1, JSON.stringify(diff.cidades_novas));
  // simula aplicação SOMENTE dos itens marcados (o desmarcado fica de fora)
  const marcados = new Set(["campos_ficha|campo_a"]); // cidade alterada DESMARCADA
  const destinos = { campos_ficha: {}, cidades: {}, pdfs_meta: {} };
  for (const g of ["campos_ficha", "cidades", "pdfs_meta"]) {
    for (const n of diff[g].novos) if (marcados.has(g + "|" + n.k)) destinos[g][n.k] = n.v;
    for (const a of diff[g].alterados) if (marcados.has(g + "|" + a.k)) destinos[g][a.k] = a.para;
  }
  assert("diff: item desmarcado NÃO é aplicado", Object.keys(destinos.cidades).length === 0 && destinos.campos_ficha.campo_a, "wrong");

  // 14.9 — paginação alcança todos os registros além do limite (T2.3)
  assert("CIDADES_POR_PAGINA = 50 configurável", T.CIDADES_POR_PAGINA === 50, `got ${T.CIDADES_POR_PAGINA}`);
  const totalFake = 137;
  const paginas = Math.ceil(totalFake / T.CIDADES_POR_PAGINA);
  let alcanceTotal = 0;
  for (let pg = 1; pg <= paginas; pg++) alcanceTotal += Math.min(T.CIDADES_POR_PAGINA, totalFake - (pg - 1) * T.CIDADES_POR_PAGINA);
  assert(`paginação de ${totalFake} cidades cobre todas (${paginas} páginas)`, alcanceTotal === totalFake && paginas === 3, `alcance=${alcanceTotal}`);

  // 14.10 — pendência e restauração individual (Tarefa 4)
  const campo = { coords: { x: 10, y: 20, largura: 100, altura: 12 }, origCoords: { x: 10, y: 20, largura: 100, altura: 12 } };
  assert("campo sem pendência detectado", T.campoTemPendencia("x", campo) === false, "should be false");
  campo.coords.x = 55.5;
  assert("pendência detectada após edição", T.campoTemPendencia("x", campo) === true, "should be true");
  // restauração: overlay prevalece sobre o original, propriedade sem patch volta ao original
  const overlayKeyMap = { x: 5, y: 30 }; // valor salvo no overlay
  for (const p of ["x", "y", "largura", "altura"]) campo.coords[p] = (p in overlayKeyMap) ? overlayKeyMap[p] : campo.origCoords[p];
  assert("restaurar campo: overlay prevalece e demais props voltam ao original", campo.coords.x === 5 && campo.coords.y === 30 && campo.coords.largura === 100 && campo.coords.altura === 12, JSON.stringify(campo.coords));

  // 14.11 — wiring do editor presente (handlers instalados no init; init não
  // roda no sandbox por falta de DOM, então verificamos o wiring estrutural)
  assert("wiring do editor (syncBox + handlers de input)", /function syncBox\(/.test(panelCode) && panelCode.includes('$("edX").addEventListener') && panelCode.includes('$("edSave").addEventListener'), "missing wiring");

  // 14.12 — histórico: filtros aplicados antes do corte de 200 (Tarefa 6, lógica)
  const eventos = [];
  for (let i = 0; i < 250; i++) {
    eventos.push({ data: new Date(Date.now() - i * 1000).toISOString(), acao: i % 2 ? "alteracao_coordenada" : "criacao_cidade", usuario: i % 3 ? "a@atento.com" : "b@atento.com", entidade: "E" + i, alteracao: "x" + i });
  }
  const filtrar = (lista, q, fAcao, fUser) => lista.filter(e =>
    (!fAcao || e.acao === fAcao) && (!fUser || e.usuario === fUser) &&
    (!q || ((e.entidade || "") + " " + (e.alteracao || "")).toLowerCase().includes(q.toLowerCase())));
  const f1 = filtrar(eventos, "", "alteracao_coordenada", "");
  const f2 = filtrar(eventos, "", "", "b@atento.com");
  const f3 = filtrar(eventos, "e249", "", "");
  assert("filtro por ação", f1.length === 125 && f1.every(e => e.acao === "alteracao_coordenada"), `got ${f1.length}`);
  assert("filtro por usuário", f2.length === 84 && f2.every(e => e.usuario === "b@atento.com"), `got ${f2.length}`);
  assert("filtro por texto", f3.length === 1 && f3[0].entidade === "E249", `got ${f3.length}`);
  assert("corte de 200 aplicado APÓS filtro", Math.min(200, f1.length) === 125, "wrong");

  // ── 14.13 — detectMode() do persistence: host estático NÃO deve ser
  // confundido com API (regressão do salvamento com HTTP 404). A sonda é
  // GET /api/admin/historico; API real responde 200 JSON. Host estático:
  // 404 text/html (ou erro de rede) → modo exportação.
  {
    const vmCtxFor = (fetchImpl) => {
      const docStub = criarStubsDom();
      const sb = {
        window: {}, document: docStub,
        console: { log() {}, warn() {}, error() {} },
        setTimeout() {}, clearTimeout() {},
        fetch: fetchImpl,
        URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
        Blob: class {}, FileReader: class { readAsText() {} },
        Math, Date, JSON, Object, Array, Number, String, Set, Promise, Error,
        encodeURIComponent, decodeURIComponent
      };
      sb.window.document = docStub;
      sb.globalThis = sb;
      const ctx = vm.createContext(sb);
      vm.runInContext(readFile(join(ROOT, "admin", "persistence.js"), "utf8"), ctx, { filename: "persistence.js" });
      return sb.window.AdminPersistence;
    };
    const respostaJSON = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: (h) => (h.toLowerCase() === "content-type" ? "application/json" : null) }, json: async () => body });
    const respostaHTML404 = { ok: false, status: 404, headers: { get: (h) => (h.toLowerCase() === "content-type" ? "text/html" : null) }, json: async () => { throw new Error("not json"); } };
    // Cenário 1: Vercel estática — /api/admin/historico vira 404 text/html
    const p1 = vmCtxFor(async () => respostaHTML404);
    assert("detectMode: host estático (404 HTML) → export", await p1.detectMode() === "export", "wrong (trataria 404 como API e PUT falharia)");
    // Cenário 2: test-server com config inexistente — histórico responde 200 JSON
    const p2 = vmCtxFor(async () => respostaJSON(200, { eventos: [] }));
    assert("detectMode: API real (200 JSON) → api", await p2.detectMode() === "api", "wrong");
    // Cenário 3: API offline (rede falha) → export, sem exceção
    const p3 = vmCtxFor(async () => { throw new TypeError("Failed to fetch"); });
    assert("detectMode: rede indisponível → export", await p3.detectMode() === "export", "wrong");
    // Cenário 4: salvamento em host estático vai para rascunho (NÃO faz PUT)
    let putFeito = false;
    const p4 = vmCtxFor(async (url, opts) => {
      if ((opts && opts.method) === "PUT") { putFeito = true; return respostaHTML404; }
      return respostaHTML404;
    });
    const r4 = await p4.salvarOverlay({ campos_ficha: {} });
    assert("salvarOverlay em host estático NÃO faz PUT e grava rascunho", putFeito === false && r4.persistido === false, `put=${putFeito} r=${JSON.stringify(r4)}`);
    // Cenário 5: registrarEvento em host estático não dispara POST cego
    let postFeito = false;
    const p5 = vmCtxFor(async (url, opts) => {
      if ((opts && opts.method) === "POST") { postFeito = true; return respostaHTML404; }
      return respostaHTML404;
    });
    const r5 = await p5.registrarEvento({ acao: "teste" });
    assert("registrarEvento em host estático não faz POST cego", postFeito === false && r5 === false, `post=${postFeito}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TESTE 15 — Reestruturação v3 ("Reestruturação do painel.md")
// Estrutural (HTML/CSS servidos) + comportamental (panel.js em node:vm).
// ═══════════════════════════════════════════════════════════════════
async function testarPainelV3(assert) {
  const vm = vmMod || (await import("node:vm"));
  const readFile = vmReadFile || (await import("node:fs")).readFileSync;

  // ── 15.a — estruturais ──
  const adminR3 = await fetch(`http://127.0.0.1:${PORT}/admin`);
  assert("v3: navegação por entidades (Visão Geral/Formulários/Templates/Cidades)",
    adminR3.body.includes('data-section="dashboard"') && adminR3.body.includes('data-section="formularios"') &&
    adminR3.body.includes('data-section="pdfs"') && adminR3.body.includes('data-section="cidades"') &&
    adminR3.body.includes('data-section="configuracoes"') && adminR3.body.includes('data-section="validacao"'),
    "missing sections");
  assert("v3: sub-menu Mais ferramentas", adminR3.body.includes("data-submenu-toggle") && adminR3.body.includes("adminSubmenu"), "missing");
  assert("v3: detalhe do formulário com abas (§9)", adminR3.body.includes('id="formDetail"') && adminR3.body.includes('data-tab="geral"') && adminR3.body.includes('data-tab="campos"') && adminR3.body.includes('data-tab="template"') && adminR3.body.includes('data-tab="historico"'), "missing");
  assert("v3: Alterações Pendentes no dashboard (§23)", adminR3.body.includes('id="dashPendentes"') && adminR3.body.includes('id="pendentesPanel"'), "missing");
  assert("v3: Command Palette Ctrl+K (§28)", adminR3.body.includes('id="cmdkOverlay"') && adminR3.body.includes('id="cmdkInput"'), "missing");
  assert("v3: seção Validação (§24)", adminR3.body.includes('id="sec-validacao"') && adminR3.body.includes('id="validacaoLista"'), "missing");
  assert("v3: seção Configurações (§22)", adminR3.body.includes('id="sec-configuracoes"') && adminR3.body.includes('id="configLista"'), "missing");
  assert("v3: snap-to-grid no editor (§11)", adminR3.body.includes('id="edSnap"') && adminR3.body.includes('id="edSnapGrid"'), "missing");
  assert("v3: barra de seleção múltipla do editor (§11)", adminR3.body.includes('id="edMultiBar"') && adminR3.body.includes('id="edMultiAlinhar"'), "missing");
  assert("v3: menu de exportação de cidades (§17)", adminR3.body.includes('id="cidExportMenu"') && adminR3.body.includes('id="btnExportCidades"'), "missing");
  assert("v3: container de versões de templates (§18)", adminR3.body.includes('id="versoesContainer"'), "missing");
  const cssR3 = await fetch(`http://127.0.0.1:${PORT}/admin/panel.css`);
  assert("v3: CSS de abas/palette/detalhe", cssR3.body.includes(".tabs") && cssR3.body.includes(".cmdk-overlay") && cssR3.body.includes(".detail-header") && cssR3.body.includes(".resize-handle"), "missing");
  const panelCode3 = readFile(join(ROOT, "admin", "panel.js"), "utf8");
  assert("v3: panel.js sem localStorage", !LS_USE_RE.test(panelCode3), "localStorage usage found!");

  // ── 15.b — comportamentais (node:vm) ──
  const stubs3 = criarStubsDom();
  const sandbox3 = {
    window: {}, document: stubs3, console, setTimeout() {}, clearTimeout() {},
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => "" }),
    URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
    Blob: class {}, Math, Date, JSON, Object, Array, Number, String, Set, Promise, Error,
    encodeURIComponent, decodeURIComponent
  };
  sandbox3.window.document = stubs3;
  sandbox3.globalThis = sandbox3;
  const ctx3 = vm.createContext(sandbox3);
  vm.runInContext(panelCode3, ctx3, { filename: "panel.js" });
  const T3 = sandbox3.window.AdminPanel && sandbox3.window.AdminPanel.__teste;
  assert("v3: panel.js executa em node:vm", !!T3, "missing export");
  if (!T3) return;
  const st3 = T3.state;

  // 15.1 — migração: overlay v1/v2 sem chaves novas → defaults (§32/33)
  assert("v3: overlay v3 tem chaves novas inicializadas",
    st3.overlay.forms_meta && st3.overlay.templates_versoes && st3.overlay.configuracoes, "missing keys");

  // 15.2 — calcularPendentes cobre todos os grupos (§23)
  st3.overlay = {
    campos_ficha: { c1: { x: 1 } }, campos_declaracao: { c2: { x: 2 } },
    cidades: { CIDADE_A: { ficha: "FICHA BH" } }, cidades_novas: [{ id: 7, cidade: "Nova", uf: "BA", regional: "BA", ficha: "FICHA BH" }],
    pdfs_meta: { "X.pdf": { tipo: "t" } }, forms_meta: { F1: { nome: "n" } }, templates_versoes: { "T.pdf": { atual: { versao: 2 } } }, configuracoes: { geral: { manutencao: true } }
  };
  const pend = T3.calcularPendentes(st3.overlay, null);
  assert("v3: pendentes cobrem 8 grupos", pend.length === 8, `got ${pend.length}: ${JSON.stringify(pend.map(p => p.overlayKey))}`);
  assert("v3: pendente de cidades_novas usa chave n+id", pend.some(p => p.overlayKey === "cidades_novas" && p.chave === "n7"), "wrong key");

  // 15.3 — publicar marca os itens (append-only) e zera a lista (§23)
  const pub = T3.publicarPendentes(st3.overlay, null, "t@atento.com");
  assert("v3: publicar marca todos os pendentes", pub.publicados === 8 && Object.keys(pub.marcados).length === 8, `got ${pub.publicados}`);
  const pend2 = T3.calcularPendentes(st3.overlay, pub.marcados);
  assert("v3: após publicar não há pendentes", pend2.length === 0, `got ${pend2.length}`);
  // publicar de novo não muda nada (idempotente)
  const pub2 = T3.publicarPendentes(st3.overlay, pub.marcados, "t@atento.com");
  assert("v3: publicar é idempotente", pub2.publicados === 0, `got ${pub2.publicados}`);

  // 15.4 — descartar: remove patches pendentes (marcados=null → tudo pendente);
  // cidades_novas sem substituto na base permanece (§23)
  const cityMapFake = {}; // "Nova" NÃO existe na base → deve ser preservada
  const resDisc = T3.descartarPendentesPuro(st3.overlay, cityMapFake, null);
  assert("v3: descartar limpa TODOS os grupos pendentes", Object.keys(resDisc.overlay.campos_ficha).length === 0 && Object.keys(resDisc.overlay.cidades).length === 0 && Object.keys(resDisc.overlay.configuracoes).length === 0 && Object.keys(resDisc.overlay.pdfs_meta).length === 0, "wrong");
  assert("v3: descartar preserva cidade_nova sem substituto na base", resDisc.overlay.cidades_novas.length === 1, `got ${resDisc.overlay.cidades_novas.length}`);
  assert("v3: descartar remove versões pendentes de templates", Object.keys(resDisc.overlay.templates_versoes).length === 0, "wrong");

  // 15.5 — comparação estrutural de PDF (§19) — função pura
  const cmp1 = T3.compararPdfComAnterior({ paginas: 2, bytes: 100000, dimensoes: [{ w: 595, h: 842 }] }, { paginas: 4, bytes: 100000, dimensoes: [{ w: 595, h: 842 }] });
  assert("v3: comparação detecta 2 páginas a menos", cmp1.length === 1 && cmp1[0].includes("2 página(s) a menos"), cmp1.join(" | "));
  const cmp2 = T3.compararPdfComAnterior({ paginas: 2, bytes: 100000, dimensoes: [{ w: 595, h: 842 }] }, { paginas: 2, bytes: 100000, dimensoes: [{ w: 612, h: 792 }] });
  assert("v3: comparação detecta mudança de dimensões", cmp2.some(s => s.includes("Dimensões")), cmp2.join(" | "));
  const cmp3 = T3.compararPdfComAnterior({ paginas: 2, bytes: 200000, dimensoes: [{ w: 595, h: 842 }] }, { paginas: 2, bytes: 100000, dimensoes: [{ w: 595, h: 842 }] });
  assert("v3: comparação detecta mudança de tamanho > 40%", cmp3.some(s => s.includes("40%")), cmp3.join(" | "));
  const cmp4 = T3.compararPdfComAnterior(null, null);
  assert("v3: comparação sem dados anteriores → sem avisos", Array.isArray(cmp4) && cmp4.length === 0, "wrong");

  // 15.6 — coordenada fora da página (§24)
  assert("v3: coordenada fora da página detectada", T3.coordenadaForaDaPagina({ x: -5, y: 10 }, { w: 595, h: 842 }) === true, "should be true");
  assert("v3: coordenada dentro da página OK", T3.coordenadaForaDaPagina({ x: 100, y: 100, largura: 100, altura: 12 }, { w: 595, h: 842 }) === false, "should be false");
  assert("v3: dimensão não-positiva é inválida", T3.coordenadaForaDaPagina({ x: 10, y: 10, largura: 0, altura: 12 }, { w: 595, h: 842 }) === true, "should be true");

  // 15.7 — UF válida (27 estados)
  assert("v3: UF válida (SP, BA, DF)", T3.ufValida("SP") && T3.ufValida("ba") && T3.ufValida("DF"), "wrong");
  assert("v3: UF inválida (XX, ZP, vazia)", !T3.ufValida("XX") && !T3.ufValida("ZP") && !T3.ufValida(""), "wrong");

  // 15.8 — formulariosComMetricas (§8): contagem de cidades por template
  const forms = T3.formulariosComMetricas(
    [
      { codigo: "F-075", nome: "Ficha", rota: "/f075", arquivo: "f.html", status: "Ativo", docKey: "ficha_cadastral", pdfFile: "FICHA X.pdf" },
      { codigo: "F-089", nome: "Assist", rota: "/f089", arquivo: "a.html", status: "Ativo", docKey: null, pdfFile: null }
    ],
    {}, { ficha_cadastral: 42 }, { "FICHA X": "FICHA X.pdf" },
    [{ ficha: "FICHA X" }, { ficha: "FICHA X" }, { ficha: "FICHA Y" }], {}, {}
  );
  assert("v3: métricas de formulário (campos e cidades)", forms[0].nCampos === 42 && forms[0].nCidades === 2 && forms[1].nCampos === null && forms[1].nCidades === null, JSON.stringify(forms.map(f => [f.nCampos, f.nCidades])));

  // 15.9 — versionamento de templates: próxima versão (§18)
  st3.overlay.templates_versoes = { "T.pdf": { atual: { versao: 3 }, anterior: { versao: 2 }, historico: [{ versao: 2 }, { versao: 1 }] } };
  const prox = T3.proximaVersaoTemplate(st3.overlay.templates_versoes["T.pdf"]);
  assert("v3: próxima versão = atual + 1", prox === 4, `got ${prox}`);
  assert("v3: template sem versões → v1", T3.proximaVersaoTemplate(null) === 1, "wrong");

  // 15.10 — configurações: get/set com default (§22)
  st3.overlay.configuracoes = {};
  assert("v3: config default quando ausente", T3.configGet("pdfs.limite_mb") === 20, `got ${T3.configGet("pdfs.limite_mb")}`);
  st3.overlay.configuracoes = T3.configSetPath(st3.overlay.configuracoes, "pdfs.limite_mb", 10);
  assert("v3: configSetPath grava por path", T3.configGet("pdfs.limite_mb") === 10, `got ${T3.configGet("pdfs.limite_mb")}`);
  st3.overlay.configuracoes = T3.configSetPath(st3.overlay.configuracoes, "geral.manutencao", true);
  assert("v3: bool de config lido corretamente", T3.configGet("geral.manutencao") === true, "wrong");
  st3.overlay.configuracoes = T3.configSetPath(st3.overlay.configuracoes, "pdfs.limite_mb", 999); // fora do range → clamp
  assert("v3: config int limitada ao max", T3.configGet("pdfs.limite_mb") === 50, `got ${T3.configGet("pdfs.limite_mb")}`);

  // 15.11 — index/da busca global (§28)
  st3.cityArr = [{ cidade: "Salvador", uf: "BA", regional: "BA", ficha: "FICHA BH", fonte: "t" }];
  st3.cityMap = { SALVADOR: "FICHA BH" };
  const indice = T3.construirIndiceBusca();
  assert("v3: índice de busca contém cidade e formulário", indice.some(i => i.tipo === "Cidade" && i.titulo === "Salvador") && indice.some(i => i.tipo === "Formulário"), "wrong");
  const achados = T3.buscarIndice(indice, "salvador");
  assert("v3: busca encontra cidade sem acento/case", achados.length === 1 && achados[0].titulo === "Salvador", JSON.stringify(achados.map(a => a.titulo)));
  const achados2 = T3.buscarIndice(indice, "çã");
  assert("v3: busca com acento normaliza", achados2.length >= 1, "wrong");

  // 15.12 — importação de cidades valida ficha inexistente (§16)
  const cls3 = T3.classificarCidadesImportadas([
    { cidade: "Barreiras", uf: "BA", regional: "", ficha: "FICHA BH" },
    { cidade: "Jaguarari", uf: "BA", regional: "", ficha: "FICHA INEXISTENTE" }
  ]);
  assert("v3: importação rejeita ficha inexistente", cls3.invalidos.length === 1 && cls3.invalidos[0].motivo.includes("ficha"), JSON.stringify(cls3.invalidos));

  // 15.13 — exportação de cidades: linha CSV com escape (§17)
  const linhaCsv = T3.cidadeLinhaCSV({ cidade: 'Vila "X", Y', uf: "BA", regional: "BA", ficha: "FICHA BH" });
  assert("v3: CSV escapa aspas e vírgulas", linhaCsv === '"Vila ""X"", Y","BA","BA","FICHA BH"', linhaCsv);

  // 15.14 — lista de uploads do adapter (sem API → [])
  {
    const docStub = criarStubsDom();
    const sb = {
      window: {}, document: docStub,
      console: { log() {}, warn() {}, error() {} },
      setTimeout() {}, clearTimeout() {},
      fetch: async () => { throw new TypeError("Failed to fetch"); },
      URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
      Blob: class {}, FileReader: class { readAsText() {} },
      Math, Date, JSON, Object, Array, Number, String, Set, Promise, Error,
      encodeURIComponent, decodeURIComponent
    };
    sb.window.document = docStub;
    sb.globalThis = sb;
    const ctx = vm.createContext(sb);
    vm.runInContext(readFile(join(ROOT, "admin", "persistence.js"), "utf8"), ctx, { filename: "persistence.js" });
    const uploads = await sb.window.AdminPersistence.listarUploads();
    assert("v3: listarUploads sem API → []", Array.isArray(uploads) && uploads.length === 0, `got ${JSON.stringify(uploads)}`);
  }
}

/**
 * TEST 16 — Field Builder (§10): CRUD de campos com IDs estáveis.
 * Criação, renomeação (ID novo, antigo preservado), exclusão com trava de
 * dependência, aplicação idempotente no JSON e integração com o overlay
 * (pendências, descarte, exportação, importação).
 */
async function testarPainelV3FieldBuilder(assert) {
  const vm = vmMod || (await import("node:vm"));
  const readFile = vmReadFile || (await import("node:fs")).readFileSync;

  // estrutural: drawer + botões do builder no HTML
  const adminFB = await fetch(`http://127.0.0.1:${PORT}/admin`);
  assert("fb: botão ＋ Campo na aba Campos (§10)", adminFB.body.includes('id="fdNovoCampo"') && adminFB.body.includes('id="fdCamposBuilder"'), "missing");
  assert("fb: botão novo campo no editor visual", adminFB.body.includes('id="edNovoCampo"'), "missing");
  const cssFB = await fetch(`http://127.0.0.1:${PORT}/admin/panel.css`);
  assert("fb: CSS do drawer", cssFB.body.includes(".fb-drawer"), "missing");

  const stubsFB = criarStubsDom();
  const sbFB = {
    window: {}, document: stubsFB, console, setTimeout() {}, clearTimeout() {},
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => "" }),
    URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
    Blob: class {}, Math, Date, JSON, Object, Array, Number, String, Set, Promise, Error,
    encodeURIComponent, decodeURIComponent
  };
  sbFB.window.document = stubsFB;
  sbFB.globalThis = sbFB;
  const ctxFB = vm.createContext(sbFB);
  vm.runInContext(readFile(join(ROOT, "admin", "panel.js"), "utf8"), ctxFB, { filename: "panel.js" });
  const FB = sbFB.window.AdminPanel && sbFB.window.AdminPanel.__teste;
  if (!FB) { assert("fb: panel.js executa em node:vm", false, "missing export"); return; }
  const stFB = FB.state;

  // fixture: schema base do repositório (docBase = JSON original)
  stFB.docBase.ficha_cadastral = {
    titulo: "Ficha",
    campos: {
      dados_pessoais: {
        descricao: "Dados",
        campos: {
          nome_completo: { label: "Nome completo", tipo: "texto", pagina: 1, coordenadas: { x: 100, y: 200, largura: 300, altura: 14 } },
          tem_dependente: { label: "Possui dependente?", tipo: "grupo_radio", opcoes: { SIM: "Sim", NAO: "Não" }, pagina: 1, coordenadas: { x: 100, y: 220, largura: 200, altura: 12 } },
          nome_dependente: { label: "Nome do dependente", tipo: "texto", dependencia: { campo: "tem_dependente", valor: "SIM" }, pagina: 1, coordenadas: { x: 100, y: 240, largura: 300, altura: 14 } }
        }
      }
    }
  };
  stFB.docData.ficha_cadastral = { json: JSON.parse(JSON.stringify(stFB.docBase.ficha_cadastral)), flat: [], page: 1, sel: null, dirty: false };

  // 16.1 — slugCampoId: normalização e colisão → sufixo estável
  const ids = { nome_completo: true };
  assert("fb: slug normaliza acentos/maiúsculas", FB.slugCampoId("Telefone Comercial") === "telefone_comercial");
  assert("fb: slug resolve colisão com sufixo _2", FB.slugCampoId("Nome Completo", ids) === "nome_completo_2");
  assert("fb: slug vazio → campo", FB.slugCampoId("!!!", {}) === "campo");

  // 16.2 — criar campo: id gerado contra o estado EFETIVO (colisão com base)
  const lote1 = FB.novoCampoCustom("Nome Completo", { existentes: FB.fbIdsExistentes("ficha_cadastral"), x: 50, y: 60, largura: 220, altura: 12 });
  assert("fb: criação evita colisão com id base", lote1.id === "nome_completo_2", lote1.id);
  assert("fb: novoCampoCustom tem defaults coerentes", lote1.tipo === "texto" && lote1.pagina === 1 && lote1.origem === "painel", JSON.stringify(lote1));

  // 16.3 — validarCampoSchema: erros e avisos
  const vOk = FB.validarCampoSchema(lote1);
  assert("fb: campo válido → sem erros", vOk.erros.length === 0, JSON.stringify(vOk.erros));
  const vRuim = FB.validarCampoSchema({ label: "", tipo: "woozle", pagina: 0, coordenadas: { x: -1, y: 0, largura: 0, altura: 0 } });
  assert("fb: validação captura rótulo/tipo/página/coords", vRuim.erros.length >= 5, JSON.stringify(vRuim.erros));
  const vRadio = FB.validarCampoSchema({ label: "Escolha", tipo: "grupo_radio", pagina: 1, coordenadas: { x: 1, y: 1, largura: 10, altura: 10 } });
  assert("fb: radio sem opções é erro", vRadio.erros.some(e => e.includes("opções")), JSON.stringify(vRadio.erros));

  // 16.4 — exclusão: trava por dependência (§10)
  const deps = FB.coletarDependenciasSchema(stFB.docBase.ficha_cadastral.campos, [], "");
  assert("fb: coletarDependencias encontra dependencia", deps.length === 1 && deps[0].campoKey === "tem_dependente", JSON.stringify(deps));
  const exBloq = FB.validarExclusaoCampo("tem_dependente", deps);
  assert("fb: exclusão de campo com dependencia é bloqueada", !exBloq.ok && exBloq.bloqueios.length === 1, JSON.stringify(exBloq));
  const exOk = FB.validarExclusaoCampo("nome_completo", deps);
  assert("fb: exclusão de campo livre é permitida", exOk.ok, JSON.stringify(exOk.bloqueios));

  // 16.5 — aplicarCamposCustomEmJson: criar + excluir + idempotência
  const json1 = JSON.parse(JSON.stringify(stFB.docBase.ficha_cadastral));
  const lote = {};
  const criado = FB.novoCampoCustom("Telefone comercial", { existentes: FB.fbIdsExistentes("ficha_cadastral"), x: 60, y: 300, largura: 200, altura: 12 });
  lote[criado.id] = criado;
  lote.nome_completo = { excluir: true };
  const ops1 = FB.aplicarCamposCustomEmJson(json1, lote);
  assert("fb: aplicação cria campo na seção dedicada", ops1.criados.length === 1 && FB.campoPresenteRec(json1.campos, "telefone_comercial"), JSON.stringify(ops1));
  assert("fb: aplicação exclui campo", ops1.excluidos.includes("nome_completo") && !FB.campoPresenteRec(json1.campos, "nome_completo"), JSON.stringify(ops1));
  const ops2 = FB.aplicarCamposCustomEmJson(json1, lote);
  assert("fb: aplicação é idempotente (2ª passada não duplica nem reporta criação)", ops2.criados.length === 0 && ops2.excluidos.length === 0, JSON.stringify(ops2));
  const secaoCustom = json1.campos.campos_adicionais;
  assert("fb: seção de destino é criada com descrição", secaoCustom && secaoCustom.campos && secaoCustom.campos.telefone_comercial, JSON.stringify(Object.keys(json1.campos)));

  // 16.6 — renomeação: recria com novo id, preserva conteúdo, mantém id antigo no registro
  // (convenção: o lote é chaveado pelo ID NOVO; renomeadoDe aponta para o antigo)
  const json2 = JSON.parse(JSON.stringify(stFB.docBase.ficha_cadastral));
  const loteRen = { nome_do_dependente: { renomeadoDe: "nome_dependente", id: "nome_do_dependente", label: "Nome do dependente (completo)", tipo: "texto", pagina: 1, obrigatorio: true, coordenadas: { x: 100, y: 240, largura: 300, altura: 14 }, secao: "dados_pessoais" } };
  const opsRen = FB.aplicarCamposCustomEmJson(json2, loteRen);
  assert("fb: renomeação move o campo para o novo id", opsRen.renomeados.length === 1 && FB.campoPresenteRec(json2.campos, "nome_do_dependente") && !FB.campoPresenteRec(json2.campos, "nome_dependente"), JSON.stringify(opsRen));
  let encontrado = null;
  (function achar(n) { if (!n || typeof n !== "object") return; if (n.dependencia) encontrado = n; for (const k of Object.keys(n)) achar(n[k]); })(json2.campos);
  assert("fb: dependencia sobrevive à renomeação (mesmo objeto)", !!encontrado && encontrado.dependencia.campo === "tem_dependente", JSON.stringify(encontrado));

  // 16.7 — renomeação migra o patch de coordenadas (overlay campos_ficha)
  stFB.overlay = { campos_ficha: {}, campos_declaracao: {}, campos_custom: {}, cidades: {}, cidades_novas: [], pdfs_meta: {}, forms_meta: {}, templates_versoes: {}, configuracoes: {} };
  stFB.overlay.campos_ficha = { "dados_pessoais.campos.nome_dependente": { x: 123 } };
  const mig = JSON.parse(JSON.stringify(stFB.overlay.campos_ficha));
  if (mig["dados_pessoais.campos.nome_dependente"]) { mig["dados_pessoais.campos.nome_do_dependente"] = mig["dados_pessoais.campos.nome_dependente"]; delete mig["dados_pessoais.campos.nome_dependente"]; }
  assert("fb: migração de patch segue o caminho do novo id", mig["dados_pessoais.campos.nome_do_dependente"] && mig["dados_pessoais.campos.nome_do_dependente"].x === 123 && !mig["dados_pessoais.campos.nome_dependente"], JSON.stringify(mig));

  // 16.8 — overlay campos_custom entra em pendências, descarte e exportação
  stFB.overlay.campos_custom = { ficha_cadastral: lote };
  const pendFB = FB.calcularPendentes(stFB.overlay, null);
  assert("fb: campos_custom gera pendência", pendFB.some(p => p.overlayKey === "campos_custom" && p.chave === "ficha_cadastral"), JSON.stringify(pendFB.map(p => p.overlayKey)));
  const expFB = FB.exportarOverlayPuro();
  assert("fb: exportação inclui campos_custom", expFB.campos_custom && expFB.campos_custom.ficha_cadastral === lote, "missing");
  const resDiscFB = FB.descartarPendentesPuro(stFB.overlay, {}, null);
  assert("fb: descarte remove lote pendente de campos_custom", Object.keys(resDiscFB.overlay.campos_custom).length === 0, JSON.stringify(Object.keys(resDiscFB.overlay.campos_custom)));

  // 16.9 — validarDocCampos: valida schema efetivo (gate de publicação §24)
  const jsonRuim = { campos: { s: { campos: { a: { label: "A", coordenadas: { x: -5, y: 10, largura: 10, altura: 10 }, pagina: 1 }, b: { label: "B", tipo: "grupo_radio", opcoes: {}, coordenadas: { x: 5, y: 10, largura: 10, altura: 10 }, pagina: 1 }, c: { label: "C", dependencia: { campo: "zzz_inexistente" }, coordenadas: { x: 5, y: 10, largura: 10, altura: 10 }, pagina: 1 } } } } };
  const vDoc = FB.validarDocCampos(jsonRuim, null);
  assert("fb: validarDocCampos captura coord negativa, grupo vazio e dependencia órfã", vDoc.erros.length >= 3, JSON.stringify(vDoc.erros));
  const jsonOk2 = { campos: { s: { campos: { a: { label: "A", tipo: "texto", coordenadas: { x: 10, y: 10, largura: 10, altura: 10 }, pagina: 1 } } } } };
  const vDocOk = FB.validarDocCampos(jsonOk2, null);
  assert("fb: schema válido → sem erros", vDocOk.erros.length === 0, JSON.stringify(vDocOk.erros));

  // 16.10 — fbDocEfetivo: base + overlay sem mutar o docBase
  stFB.overlay.campos_custom = { ficha_cadastral: { telefone_comercial: criado } };
  const efetivo = FB.fbDocEfetivo("ficha_cadastral");
  assert("fb: doc efetivo aplica overlay", FB.campoPresenteRec(efetivo.campos, "telefone_comercial"), "missing");
  assert("fb: docBase permanece intacto", !FB.campoPresenteRec(stFB.docBase.ficha_cadastral.campos, "telefone_comercial"), "docBase mutated!");
  stFB.overlay.campos_custom = {};

  // 16.11 — diff de importação cobre campos_custom
  stFB.overlay = { campos_ficha: {}, campos_declaracao: {}, campos_custom: {}, cidades: {}, cidades_novas: [], pdfs_meta: {}, forms_meta: {}, templates_versoes: {}, configuracoes: {} };
  const dImp = FB.diffImportacao({ campos_custom: { ficha_cadastral: lote } });
  assert("fb: diffImportacao detecta lote de campos_custom novo", dImp.campos_custom.novos.length === 1 && dImp.campos_custom.novos[0].k === "ficha_cadastral", JSON.stringify(dImp.campos_custom));
}

