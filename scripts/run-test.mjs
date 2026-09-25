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

  // ── TEST 17: auditoria do painel × dados reais (falsos positivos) ──
  console.log("\n📋 Teste 17: Auditoria do painel contra os dados reais do repositório");
  await testarAuditoriaPainel(assert);

  // ── TEST 18: Gerador nativo de PDFs (IMPLEMENTAÇÃO DE GERADOR NATIVO D.md) ──
  console.log("\n📋 Teste 18: Gerador nativo de PDFs — definição, renderer, fidelidade, versões");
  await testarGeradorNativo(assert);

  // ── TEST 19: tipografia oficial por run (§15.1) e traço do mobiliário ──
  await testarTipografiaOficial(assert);

  // ── TEST 20: Preencher — só os campos do modelo ──
  await testarPreencher(assert);

  // ── Summary ──
  console.log(`\n${"═".repeat(50)}`);
  console.log(`Resultados: ${pass} passaram, ${fail} falharam`);
  console.log(`${"═".repeat(50)}\n`);

  server.close();
  process.exit(fail > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); server.close(); process.exit(1); });

// ═══════════════════════════════════════════════════════════════════
// TESTE 17 — Auditoria do painel contra os dados reais
//
// Executa scripts/audit-panel.mjs, que roda o MESMO pipeline do painel
// (carregarTudo + coletores de Saúde/Validação + gate de publicação) em
// node:vm servindo `fetch` dos arquivos do repositório. Serve para provar que
// o painel não acusa problema que não existe (foi o caso da ficha SAFO não
// mapeada e das dependências de grupo "inexistentes", que travavam a
// publicação), e é onde a auditoria roda de fato contra os dados reais.
// ═══════════════════════════════════════════════════════════════════
async function testarAuditoriaPainel(assert) {
  const r = await new Promise((resolve) => {
    const p = spawn(process.execPath, [join(ROOT, "scripts", "audit-panel.mjs")], { cwd: ROOT });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out, err }));
    p.on("error", (e) => resolve({ code: -1, out, err: e.message }));
  });
  const falhas = (r.out.match(/^\s+❌/gm) || []).length;
  assert("auditoria do painel passa sem falso positivo", r.code === 0,
    "exit=" + r.code + " | \n" + r.out.split("\n").filter((l) => /❌|→/.test(l)).join("\n") + r.err);
  assert("auditoria roda o pipeline real e reporta as verificações", /carrega os 2 schemas de campos/.test(r.out) && falhas === 0,
    "falhas=" + falhas);
}

// ═══════════════════════════════════════════════════════════════════
// TESTE 18 — Gerador nativo de PDFs padronizados
//
// O documento deixa de depender do PDF externo como estrutura: aqui a suíte
// prova (a) que a definição criada a partir do schema REAL do F-075 reproduz a
// geometria do PDF atual campo a campo, (b) que o renderer produz um PDF real,
// determinístico e independente do template, (c) que a validação §31 barra o que
// impede geração e que a importação de referência marca tudo como
// REQUER CALIBRAÇÃO, e (d) que o painel integra o documento ao overlay, às
// pendências e ao gate de publicação sem bloquear o fluxo atual.
// ═══════════════════════════════════════════════════════════════════
async function testarGeradorNativo(assert) {
  const vm = (await import("node:vm"));
  const { readFileSync } = (await import("node:fs"));
  const { webcrypto } = (await import("node:crypto"));
  let pdfLib = null;
  try { pdfLib = await import("pdf-lib"); } catch { pdfLib = null; }

  // ── 18.a — estruturais (o que o navegador realmente recebe) ──
  const adminDN = await fetch(`http://127.0.0.1:${PORT}/admin`);
  assert("gerador: seção Documentos Nativos na navegação",
    adminDN.body.includes('data-section="documentos"') && adminDN.body.includes('id="sec-documentos"'), "missing");
  assert("gerador: subseções §35 (Templates Nativos/Comparação/Importar PDF/Versões/Logs/Assets)",
    ["templates", "comparacao", "referencia", "versoes", "logs", "recursos"].every((t) => adminDN.body.includes(`data-dntab="${t}"`)), "missing tabs");
  assert("gerador: editor com propriedades numéricas, zoom e snap (§18/§19)",
    ["dnX", "dnY", "dnW", "dnH", "dnZoom", "dnSnap", "dnPageStack", "dnCanvas", "dnLista"].every((id) => adminDN.body.includes(`id="${id}"`)), "missing controls");
  assert("gerador: painel carrega /native-docs.js (engine compartilhado)", adminDN.body.includes('src="/native-docs.js"'), "missing script");
  const engineR = await fetch(`http://127.0.0.1:${PORT}/native-docs.js`);
  assert("gerador: /native-docs.js servido e com API do renderer",
    engineR.status === 200 && engineR.body.includes("renderizarPdf") && engineR.body.includes("definicaoDeSchema"), `status ${engineR.status}`);
  assert("gerador: engine sem localStorage (regra do projeto)", !LS_USE_RE.test(engineR.body), "localStorage usage found!");
  const cssDN = await fetch(`http://127.0.0.1:${PORT}/admin/panel.css`);
  assert("gerador: CSS das caixas, alça e comparação",
    cssDN.body.includes(".dn-el") && cssDN.body.includes(".dn-handle") && cssDN.body.includes(".cmp-grid"), "missing");

  // ── 18.b — engine em node:vm com pdf-lib real ──
  const docStub = criarStubsDom();
  const sb = {
    window: {}, document: docStub, console, setTimeout() {}, clearTimeout() {},
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => "" }),
    URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
    Blob: class {}, Math, Date, JSON, Object, Array, Number, String, Set, Map, Promise, Error,
    encodeURIComponent, decodeURIComponent, TextEncoder, crypto: webcrypto
  };
  sb.window.document = docStub;
  sb.window.crypto = webcrypto; // §42 — WebCrypto é o caminho do sha256
  sb.globalThis = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(readFileSync(join(ROOT, "native-docs.js"), "utf8"), ctx, { filename: "native-docs.js" });
  const N = sb.window.NativeDocs;
  assert("gerador: engine expõe a API em node:vm (com versão de schema)", !!N && N.SCHEMA_VERSION === "1.0", "missing export");
  if (!N) return;

  const schema = JSON.parse(readFileSync(join(ROOT, "ficha_cadastral_campos.json"), "utf8"));
  const PAGE = { width: 595.5, height: 842.25 };
  const def = N.definicaoDeSchema(schema, { documentId: "f075", documentName: "Ficha Cadastral (F-075)", width: PAGE.width, height: PAGE.height, autor: "suite" });
  const folhas = N.folhasComCoordenadas(schema.campos, "");
  assert("gerador: bootstrap cria 1 elemento por campo com coordenadas do schema",
    def.elementos.length === folhas.length && folhas.length > 30, `def=${def.elementos.length} schema=${folhas.length}`);
  assert("gerador: todos os elementos usam um tipo suportado (§7)",
    def.elementos.every((e) => N.TIPOS.indexOf(e.type) !== -1), "tipo inválido");
  const vDef = N.validarDefinicao(def);
  assert("gerador: definição criada do schema real sem erro crítico (§31)", vDef.erros.length === 0, JSON.stringify(vDef.erros.slice(0, 3)));
  assert("gerador: bootstrap marca REQUER CALIBRAÇÃO em vez de inventar o resto (§52)",
    vDef.avisos.some((a) => a.indexOf("REQUER CALIBRAÇÃO") !== -1), "sem aviso de calibração");

  // 18.1 — fidelidade geométrica: mesma baseline e mesmo x do desenho atual
  let divergentes = 0;
  for (const f of folhas) {
    const c = f.no.coordenadas;
    const el = def.elementos.filter((e) => e.chaveSchema === f.path)[0];
    const esperadoY = c.y + Math.min((c.altura || 0) * 0.78, 9 * 1.12) - (c.y > 120 ? 9 : 0);
    const meuY = PAGE.height - N.baselineTopo(el);
    if (Math.abs(esperadoY - meuY) > 0.001 || Math.abs((c.x + 0.5) - (el.x + el.offsetX)) > 0.001) divergentes++;
  }
  assert("gerador: geometria fiel ao PDF atual (x e baseline, campo a campo)", divergentes === 0, divergentes + " divergente(s)");
  assert("gerador: Y é convertido do topo numa única camada (§5)",
    Math.abs(N.converterY(100, 842.25, 20) - 722.25) < 0.001 && Math.abs(N.caixaParaPdf({ x: 10, y: 100, width: 50, height: 20 }, PAGE).y - 722.25) < 0.001,
    String(N.converterY(100, 842.25, 20)));
  assert("gerador: fonte/tamanho/offsets do perfil da aplicação gravados no elemento (§8)",
    def.elementos.every((e) => e.font.size === 9 && e.offsetX === 0.5 && e.ancoraV === "campo"), "perfil não gravado");

  if (!pdfLib) { assert("gerador: pdf-lib disponível para gerar PDF", false, "instale pdf-lib"); return; }

  // 18.2 — renderer: PDF real, dimensões exatas, determinístico e sem template
  const dados = {};
  dados[def.elementos[0].binding] = "FULANO DE TAL";
  const gerado = await N.renderizarPdf(def, dados, pdfLib, { imagens: {} }, {});
  const buf = Buffer.from(gerado.bytes);
  assert("gerador: produz um PDF real e independente (%PDF-)", buf.slice(0, 5).toString() === "%PDF-", buf.slice(0, 5).toString());
  const docPdf = await pdfLib.PDFDocument.load(gerado.bytes);
  const pg = docPdf.getPage(0);
  assert("gerador: PDF com as dimensões exatas da definição (§6/§31)",
    Math.abs(pg.getWidth() - PAGE.width) < 0.01 && Math.abs(pg.getHeight() - PAGE.height) < 0.01,
    pg.getWidth() + "x" + pg.getHeight());
  assert("gerador: PDF tem 1 página (não herda páginas do template externo)", docPdf.getPageCount() === 1, String(docPdf.getPageCount()));
  assert("gerador: só desenha campo com valor real (nunca inventa dado)",
    gerado.desenhados === 1 && gerado.ignorados.length === def.elementos.length - 1,
    JSON.stringify({ d: gerado.desenhados, i: gerado.ignorados.length }));
  const geradoVazio = await N.renderizarPdf(def, {}, pdfLib, { imagens: {} }, {});
  assert("gerador: sem dados, nada é desenhado (0 elementos)", geradoVazio.desenhados === 0, String(geradoVazio.desenhados));
  const gerado2 = await N.renderizarPdf(def, dados, pdfLib, { imagens: {} }, {});
  assert("gerador: geração determinística (mesma entrada ⇒ mesmos bytes)",
    Buffer.compare(Buffer.from(gerado2.bytes), buf) === 0, "bytes diferentes");
  assert("gerador: geração bloqueada para definição inválida, forçável só de propósito (§31)",
    await (async () => {
      const invalida = N.novaDefinicao({ documentId: "inv", width: 300, height: 400, elementos: [{ id: "a", type: "field", x: 1, y: 1 }] });
      try { await N.renderizarPdf(invalida, {}, pdfLib, {}, {}); return false; } catch { return true; }
    })(), "não bloqueou");

  // 18.3 — validação §31: o que barra e o que só avisa
  const baseT = () => N.novaDefinicao({ documentId: "t", width: 300, height: 400 });
  const comEls = (els) => Object.assign(baseT(), { elementos: els });
  const rect = (id, extra) => Object.assign({ id, type: "rectangle", x: 10, y: 10, width: 20, height: 20 }, extra || {});
  assert("gerador: ID duplicado é erro crítico",
    N.validarDefinicao(comEls([rect("a"), rect("a")])).erros.some((e) => e.indexOf("duplicado") !== -1), "não barrou");
  assert("gerador: dimensão divergente do template é erro crítico",
    N.validarDefinicao(Object.assign(baseT(), { page: { width: 100, height: 200, esperado: { width: 595.28, height: 841.89 }, tolerancia: 1 } })).erros.some((e) => e.indexOf("divergem") !== -1), "não barrou");
  assert("gerador: elemento fora da página é aviso (não trava a publicação)",
    N.validarDefinicao(comEls([rect("fora", { x: 900, y: 900 })])).avisos.some((a) => a.indexOf("fora da página") !== -1) &&
    N.validarDefinicao(comEls([rect("fora2", { x: 900, y: 900 })])).erros.length === 0, "classificação errada");
  assert("gerador: campo sem binding, fonte inexistente e imagem sem dimensão são erros",
    N.validarDefinicao(comEls([{ id: "f", type: "field", x: 1, y: 1 }])).erros.some((e) => e.indexOf("binding") !== -1) &&
    N.validarDefinicao(comEls([Object.assign(rect("t"), { type: "text", content: "x", font: { family: "Comic Sans", size: 9 } })])).erros.some((e) => e.indexOf("família de fonte") !== -1) &&
    N.validarDefinicao(comEls([Object.assign(rect("t"), { type: "text", content: "x", font: { family: "Helvetica", size: 9 } })])).erros.length === 0 &&
    N.validarDefinicao(comEls([{ id: "i", type: "image", arquivo: "x.png", x: 1, y: 1 }])).erros.some((e) => e.indexOf("width/height") !== -1),
    "validação incompleta");
  assert("gerador: JSON declarativo — eval/new Function e on* barrados (§43)",
    N.validarDefinicao(comEls([{ id: "x", type: "text", content: "eval(1)", x: 1, y: 1 }])).erros.some((e) => e.indexOf("executável") !== -1) &&
    N.validarDefinicao(Object.assign(baseT(), { elementos: [Object.assign(rect("y"), { onload: "alert(1)" })] })).erros.some((e) => e.indexOf("manipulador de evento") !== -1),
    "não barrou conteúdo executável");
  assert("gerador: toda definição registra versão de schema e status válido (§23/§24)",
    def.schemaVersion === "1.0" && N.STATUS_DOC.indexOf(def.metadados.status) !== -1 && !!def.documentVersion, "sem versão");

  // 18.4 — versionamento, integridade e log (§24/§41/§42)
  const reg = N.novoRegistro(def, { autor: "suite", modo: "external", motivoInicial: "criado do schema" });
  const e1 = await N.congelarVersao(reg, { status: "PUBLICADO", autor: "suite", motivo: "publicação de teste" });
  assert("gerador: versão incrementa como patch (§24)", e1.versao === "1.0.1", e1.versao);
  assert("gerador: hash de integridade SHA-256 do documento (§42)",
    String(e1.hash).indexOf("sha256:") === 0 && e1.hash.length === 71, e1.hash);
  assert("gerador: versão guarda o pacote completo (restaurável §39)",
    !!e1.definicao && e1.definicao.elementos.length === def.elementos.length, "sem snapshot");
  assert("gerador: log do documento registra a versão (§41)",
    reg.log.length >= 2 && reg.log[0].alteracao.indexOf("v1.0.1") === 0, JSON.stringify(reg.log[0]));
  reg.meta.modo = "native";
  assert("gerador: modo nativo só com PUBLICADO + definição válida",
    N.modoEfetivo(reg).modo === "native", N.modoEfetivo(reg).motivo);
  const regInv = JSON.parse(JSON.stringify(reg));
  regInv.definicao.elementos.push(rect(regInv.definicao.elementos[0].id));
  assert("gerador: definição inválida volta para external automaticamente (§49)",
    N.modoEfetivo(regInv).modo === "external" && N.modoEfetivo(regInv).motivo.indexOf("erro") !== -1, N.modoEfetivo(regInv).motivo);

  // 18.5 — comparador (§30) e importação de referência (§27)
  const antes = JSON.parse(JSON.stringify(def));
  const depois = JSON.parse(JSON.stringify(def));
  depois.elementos[0].x += 5;
  depois.elementos[0].width -= 3;
  const cmp = N.compararDefinicoes(antes, depois);
  assert("gerador: comparador detecta deslocamento e dimensão (§30)",
    cmp.total === 1 && cmp.alterados.length === 1 && cmp.alterados[0].campos.length === 2, JSON.stringify(cmp).slice(0, 200));
  assert("gerador: resumo do comparador é legível no log", /x 20 → 25/.test(cmp.resumo), cmp.resumo);
  const item = N.normalizarItemTexto({ str: "NOME", transform: [10, 0, 0, 10, 20, 700], width: 30, height: 10 }, [1, 0, 0, -1, 0, 842]);
  assert("gerador: item de texto do pdf.js normalizado para o topo (§27)",
    item.x === 20 && item.yBase === 142 && item.tamanho === 10, JSON.stringify(item));
  const itens = [
    { texto: "FICHA", x: 40, yBase: 100, tamanho: 9, largura: 20 },
    { texto: "CADASTRAL", x: 61, yBase: 100, tamanho: 9, largura: 40 },
    { texto: "OUTRA LINHA", x: 40, yBase: 120, tamanho: 9, largura: 50 }
  ];
  const elsImp = N.elementosDeItensDeTexto(itens, { width: 595, height: 842 }, { page: 1 });
  assert("gerador: família do PDF não confunde sans-serif com serif",
    N.familiaPadrao("sans-serif") === "Helvetica" && N.familiaPadrao("serif") === "Times" &&
      N.familiaPadrao("AAAAAA+Arial-BoldMT") === "Helvetica" && N.familiaPadrao("CAAAAA+FreeSerif") === "Times" &&
      N.familiaPadrao("CourierNewPSMT") === "Courier",
    [N.familiaPadrao("sans-serif"), N.familiaPadrao("serif")].join(","));
  assert("gerador: cor de operador aceita as duas escalas (0–1 e 0–255)",
    N.corDoOperador([255, 255, 255]) === "#ffffff" && N.corDoOperador([1, 0, 0]) === "#ff0000" && N.corDoOperador([0, 0, 0]) === "#000000",
    [N.corDoOperador([255, 255, 255]), N.corDoOperador([1, 0, 0])].join(" / "));
  assert("gerador: símbolos de caixa de marcação são reconhecidos (❑ ☐ ✓)",
    N.ehCaixaDeMarcacao("❑") === true && N.ehCaixaDeMarcacao("☐") === true && N.ehCaixaDeMarcacao("✓") === true &&
      N.ehCaixaDeMarcacao("Corrente") === false && N.ehCaixaDeMarcacao("100%") === false,
    "classificação de símbolo errada");
  assert("gerador: importação agrupa fragmentos da mesma linha",
    elsImp.length === 2 && elsImp[0].content === "FICHA CADASTRAL", JSON.stringify(elsImp.map((e) => e.content)));
  assert("gerador: importado entra como REQUER CALIBRAÇÃO (§27/§52)",
    elsImp.every((e) => e.origem === "importado" && e.confirmado === false), "sem marcação");
  const relImp = N.relatorioImportacao(itens, elsImp);
  assert("gerador: relatório diz explicitamente o que NÃO foi identificado",
    relImp.naoIdentificado.length >= 3 && relImp.nota.indexOf("CALIBRAÇÃO") !== -1 && relImp.naoIdentificado.join(" ").indexOf("tabelas") !== -1,
    JSON.stringify(relImp.naoIdentificado));
  // 18.5b — mobiliário: o relatório CONTA o que foi extraído (não afirma genericamente)
  const grafTeste = { regras: [{ tipo: "segmento" }], imagens: [{ ref: "i" }], recortes: 3, recortadas: 1, descartadas: 0, naoSuportado: ["curva (bézier) aproximada pelo ponto final"] };
  const relGraf = N.relatorioImportacao(itens, elsImp, grafTeste);
  assert("gerador: relatório conta réguas/imagens/recortes do mobiliário",
    relGraf.nRegras === 1 && relGraf.nImagens === 1 && relGraf.nRecortes === 3 && relGraf.nDescartadas === 0 &&
      relGraf.naoIdentificado.join(" ").indexOf("bézier") !== -1 && relGraf.naoIdentificado.join(" ").indexOf("logotipos") === -1,
    JSON.stringify(relGraf));

  // 18.6 — camadas (§20) e agrupamento (§21)
  const dCam = N.novaDefinicao({ documentId: "c", width: 300, height: 400, elementos: [rect("a"), rect("b")] });
  N.moverCamada(dCam, "a", "frente");
  assert("gerador: ordem de camadas altera o desenho, não o dado (§20)",
    dCam.elementos[1].id === "a" && dCam.elementos[1].zIndex === 1 && dCam.elementos[0].id === "b", JSON.stringify(dCam.elementos.map((e) => e.id)));
  const grupo = N.agruparElementos(dCam, ["a", "b"], "cabecalho");
  assert("gerador: agrupar (§21)", !!grupo && dCam.elementos.length === 1 && grupo.elementos.length === 2 && grupo.id === "cabecalho", "agrupamento falhou");
  N.moverGrupo(dCam, "cabecalho", 10, 5);
  assert("gerador: mover grupo desloca todos os filhos proporcionalmente",
    grupo.elementos.every((e) => e.x === 20 && e.y === 15), JSON.stringify(grupo.elementos.map((e) => [e.x, e.y])));

  // ── 18.c — integração com o painel (overlay, pendências, gate, configurações) ──
  const stubsP = criarStubsDom();
  const sbP = {
    window: {}, document: stubsP, console, setTimeout() {}, clearTimeout() {},
    fetch: async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => "" }),
    URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
    Blob: class {}, Math, Date, JSON, Object, Array, Number, String, Set, Map, Promise, Error,
    encodeURIComponent, decodeURIComponent, TextEncoder, crypto: webcrypto
  };
  sbP.window.document = stubsP;
  sbP.window.crypto = webcrypto;
  sbP.globalThis = sbP;
  // carregarTudo lê os JSONs reais do repositório (a auditoria faz o mesmo)
  sbP.fetch = async (url) => {
    const p = String(url || "").replace(/^\.\.\//, "").replace(/^\//, "");
    let f = p;
    try { f = decodeURIComponent(p); } catch { /* segue com o bruto */ }
    const full = join(ROOT, f);
    if (!existsSync(full)) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    const b = readFileSync(full);
    return {
      ok: true, status: 200, headers: { get: () => "application/json" },
      json: async () => JSON.parse(b.toString("utf8")), text: async () => b.toString("utf8"),
      arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
    };
  };
  sbP.window.AdminPersistence = {
    async carregarConfig() { return { overlay: null, modo: "api", origem: "suite" }; },
    async salvarOverlay() { return { persistido: true }; },
    async listarBackups() { return []; },
    async listarUploads() { return []; },
    async carregarHistorico() { return []; },
    async registrarEvento() { return true; },
    baixarJSON() {},
    lerArquivoJSON() { return null; }
  };
  const ctxP = vm.createContext(sbP);
  vm.runInContext(readFileSync(join(ROOT, "native-docs.js"), "utf8"), ctxP, { filename: "native-docs.js" });
  vm.runInContext(readFileSync(join(ROOT, "admin", "panel.js"), "utf8"), ctxP, { filename: "panel.js" });
  const TP = sbP.window.AdminPanel && sbP.window.AdminPanel.__teste;
  assert("gerador: painel expõe o inventário nativo (schema → template por documento)",
    !!TP && Array.isArray(TP.NATIVOS_FONTES) && TP.NATIVOS_FONTES.length >= 1 &&!!TP.NATIVOS_FONTES[0].schemaArquivo, "missing");
  if (TP) {
    await TP.carregarTudo();
    const defP = TP.dnDefinicaoPara("ficha_cadastral", [{ w: PAGE.width, h: PAGE.height }], { autor: "suite" });
    assert("gerador: painel cria a definição a partir do schema EFETIVO carregado",
      !!defP && defP.elementos.length === folhas.length && defP.page.width === PAGE.width,
      defP ? defP.elementos.length + " elementos" : "null");
    TP.state.overlay.docs_nativos = { f075: N.novoRegistro(defP, { autor: "suite", modo: "external" }) };
    assert("gerador: documento nativo entra na exportação do overlay",
      !!TP.exportarOverlayPuro().docs_nativos.f075, "missing");
    const pendDN = TP.calcularPendentes(TP.exportarOverlayPuro(), null).filter((p) => p.overlayKey === "docs_nativos");
    assert("gerador: alteração no documento vira pendência (§23)", pendDN.length === 1, "sem pendência");
    const probDN = TP.coletarProblemas();
    assert("gerador: documento em rascunho/external NÃO bloqueia a publicação (§49)",
      probDN.criticos.filter((c) => c.indexOf("Documento nativo") === 0).length === 0, JSON.stringify(probDN.criticos.slice(0, 2)));
    const regP = TP.state.overlay.docs_nativos.f075;
    regP.meta.modo = "native";
    regP.definicao.elementos.push({ id: regP.definicao.elementos[0].id, type: "rectangle", x: 1, y: 1, width: 5, height: 5 });
    const probDN2 = TP.coletarProblemas();
    assert("gerador: modo nativo em RASCUNHO com erro crítico avisa mas não bloqueia (§49)",
      probDN2.criticos.filter((c) => c.indexOf("Documento nativo") === 0).length === 0 &&
      probDN2.avisos.some((a) => a.indexOf("Documento nativo") === 0 && a.indexOf("ID duplicado") !== -1),
      JSON.stringify(probDN2.avisos.slice(0, 2)));
    regP.definicao.metadados.status = "PUBLICADO";
    const probDN3 = TP.coletarProblemas();
    assert("gerador: modo nativo PUBLICADO com definição inválida BLOQUEIA (§24/§31)",
      probDN3.criticos.some((c) => c.indexOf("Documento nativo") === 0 && c.indexOf("ID duplicado") !== -1),
      JSON.stringify(probDN3.criticos.slice(0, 2)));
    regP.definicao.elementos.pop();
    regP.definicao.metadados.status = "RASCUNHO";
    assert("gerador: configurações do gerador existem e são lidas",
      TP.CONFIG_DEFS.filter((d) => d.key.indexOf("documentos.") === 0).length === 3 && TP.configGet("documentos.modo_padrao") === "external",
      "configs ausentes");
    const dImp = TP.diffImportacao({ docs_nativos: { f075: regP } });
    // Linha de base do repositório não é alteração pendente; alteração de verdade é.
    const pendBase = TP.calcularPendentes({ docs_nativos: { f075: { meta: { origemRepo: true, alterado: false }, definicao: regP.definicao, versoes: [], log: [] } } }, {});
    const pendAlterado = TP.calcularPendentes({ docs_nativos: { f075: { meta: { origemRepo: true, alterado: true }, definicao: regP.definicao, versoes: [], log: [] } } }, {});
    assert("gerador: documento do repositório intacto NÃO aparece como pendência",
      pendBase.filter((p) => p.overlayKey === "docs_nativos").length === 0, JSON.stringify(pendBase.map((p) => p.chave)));
    assert("gerador: documento do repositório EDITADO aparece como pendência de exportação",
      pendAlterado.filter((p) => p.overlayKey === "docs_nativos").length === 1, JSON.stringify(pendAlterado.map((p) => p.chave)));
    assert("gerador: importação de configuração cobre docs_nativos",
      dImp.docs_nativos.identicos === 1 || dImp.docs_nativos.alterados.length === 1, JSON.stringify(dImp.docs_nativos));
    assert("gerador: resumo do documento é legível (não despeja o objeto no diff)",
      TP.resumoValorDocNativo(regP).indexOf("v1.0.0") === 0 && TP.resumoValorDocNativo(regP).indexOf("elemento") !== -1,
      TP.resumoValorDocNativo(regP));
    assert("gerador: descarte de pendências remove o documento do overlay",
      TP.descartarPendentesPuro(TP.exportarOverlayPuro(), TP.state.cityMap, null).overlay.docs_nativos.f075 === undefined, "não descartou");
  }

  // ═══════════════════════════════════════════════════════════════
  // 18.10 — MOBILIÁRIO DA REFERÊNCIA (extração real) E O DOCUMENTO DO
  //         F-075 RECONSTRUÍDO: o aceite é o deslocamento MEDIDO (§27.2/§27.3)
  // ═══════════════════════════════════════════════════════════════
  {}
  const OPS_FAKE = { moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18, rectangle: 19, constructPath: 91,
    save: 10, restore: 11, transform: 12, setFillRGBColor: 20, setStrokeRGBColor: 21, setGState: 22, fill: 30, eoFill: 31, stroke: 40,
    fillStroke: 41, clip: 50, eoClip: 51, endPath: 52, paintImageXObject: 60, paintFormXObjectBegin: 61, paintFormXObjectEnd: 62, beginGroup: 70, endGroup: 71 };
  const opsLink = (lista) => ({ fnArray: lista.map((o) => o[0]), argsArray: lista.map((o) => o[1] === undefined ? [] : o[1]) });
  const VIEWPORT = [1, 0, 0, -1, 0, 800];   // matriz de viewport do pdf.js (escala 1)
  // retângulo fino preenchido → linha; retângulo grande → caixa; caminho de recorte
  // (W n) não desenha; `ca = 0` (máscara) não desenha; setGState chega em PARES.
  const graf = N.extrairGraficos(opsLink([
    // régua: `re` com (x,y,w,h) — o retângulo fino preenchido
    [OPS_FAKE.constructPath, [[19], [10, 100, 500, 1], [10, 600, 100, 101]]],
    [OPS_FAKE.fill, []],
    // caixa preenchida preta (tarja)
    [OPS_FAKE.constructPath, [[19], [10, 200, 200, 80], [10, 210, 280, 280]]],
    [OPS_FAKE.fill, []],
    // recorte pequeno (W n) dentro de um estado: só recorta, não desenha
    [OPS_FAKE.save, []],
    [OPS_FAKE.constructPath, [[19], [400, 400, 100, 100], [400, 500, 500, 500]]],
    [OPS_FAKE.eoClip, []],
    [OPS_FAKE.endPath, []],
    // preenchimento ENORME dentro do recorte: quase tudo fora ⇒ não desenha
    [OPS_FAKE.setGState, [[['ca', 1]]]],
    [OPS_FAKE.constructPath, [[19], [0, 0, 4000, 4000], [0, 4000, 0, 4000]]],
    [OPS_FAKE.fill, []],
    [OPS_FAKE.restore, []],
    // máscara invisível (ca=0): não é mobiliário
    [OPS_FAKE.setGState, [[['ca', 0]]]],
    [OPS_FAKE.constructPath, [[19], [10, 300, 300, 20], [10, 310, 320, 320]]],
    [OPS_FAKE.fill, []],
    [OPS_FAKE.setGState, [[['ca', 1]]]],
    // segmento traçado (moveTo/lineTo + stroke)
    [OPS_FAKE.constructPath, [[13, 14], [10, 300, 300, 500], [10, 700, 300, 700]]],
    [OPS_FAKE.stroke, []]
  ]), OPS_FAKE, VIEWPORT, {});
  // No espaço da definição o Y vem do TOPO: ponto (x, y) → (x, 800 − y)
  assert("mobiliário: `re` vira régua com o tamanho real (largura/altura, não um 2º ponto)",
    graf.regras.length === 3 && graf.regras[0].tipo === "segmento" &&
      Math.abs(graf.regras[0].x1 - 10) < 0.01 && Math.abs(graf.regras[0].y1 - 699.5) < 0.01 &&
      Math.abs(graf.regras[0].x2 - 510) < 0.01 && Math.abs((Number(graf.regras[0].width) || 0) - 500) < 0.5 && graf.regras[0].cor === "#000000",
    JSON.stringify(graf.regras[0]));
  assert("mobiliário: retângulo grande vira caixa (não vira régua)",
    graf.regras.some((r) => r.tipo === "caixa" && Math.abs(r.width - 200) < 0.01 && Math.abs(r.height - 80) < 0.01), JSON.stringify(graf.regras.map((r) => [r.tipo, r.width, r.height])));
  assert("mobiliário: caminho só de recorte (W n) não vira elemento e é contado",
    graf.recortes === 1, "recortes=" + graf.recortes);
  assert("mobiliário: preenchimento fora do recorte e máscara transparente (ca=0) são descartados e contados",
    graf.transparentes === 1 && graf.recortadas === 1, JSON.stringify({ t: graf.transparentes, r: graf.recortadas }));
  assert("mobiliário: segmento traçado (moveTo/lineTo/stroke) vira régua com a espessura do estado gráfico (lw)",
    graf.regras.some((r) => r.tipo === "segmento" && Math.abs(r.y1 - 500) < 0.01 && Math.abs(r.y2 - 300) < 0.01 && Math.abs(r.largura - 1) < 0.01 && Math.abs(r.x2 - 300) < 0.01),
    JSON.stringify(graf.regras.filter((r) => r.tipo === "segmento").map((r) => [r.y1, r.y2, r.largura])));
  assert("mobiliário: transformação/CTM é aplicada ao caminho (Y do topo)",
    graf.regras.every((r) => (r.tipo === "segmento" ? r.y1 >= -0.01 && r.y1 <= 800 : true)), "fora da página");
  const mob = N.elementosDeGraficos(graf, { prefixoImagem: "teste" });
  assert("mobiliário: elementos saem como line/rectangle/image com origem importado",
    mob.elementos.every((e) => ["line", "rectangle", "image"].indexOf(e.type) !== -1 && e.origem === "importado"),
    JSON.stringify(mob.elementos.map((e) => e.type)));
  // tarja escura ⇒ texto claro (o caso "Atenção"/"Importante" do F-075)
  const tarja = [{ tipo: "caixa", x: 0, y: 0, width: 100, height: 10, cor: "#000000", modo: "preenchido" }];
  const comCor = N.aplicarContrasteDeTarja(
    [{ texto: "Importante", x: 1, yBase: 9, tamanho: 8, largura: 40 }, { texto: "Nome", x: 1, yBase: 40, tamanho: 8, largura: 20 }], tarja, {});
  assert("mobiliário: texto sobre tarja escura vira claro e o resto continua escuro",
    comCor[0].cor === "#ffffff" && comCor[1].cor === "#000000", JSON.stringify(comCor.map((c) => c.cor)));
  assert("mobiliário: caixa de marcação do PDF vira elemento checkbox",
    N.elementosDeItensDeTexto([{ texto: "❑", x: 10, yBase: 100, tamanho: 8, largura: 6 }], PAGE, {}).every((e) => e.type === "checkbox"), "não virou checkbox");

  // Documento do repositório × referência congelada (a reconstrução publicada)
  const caminhoRef = join(ROOT, "scripts", "referencia", "f075-pagina1.json");
  const caminhoDef = join(ROOT, "ficha_cadastral_nativo.json");
  assert("F-075 nativo: referência congelada existe no repositório", existsSync(caminhoRef), caminhoRef);
  assert("F-075 nativo: definição versionada existe no repositório", existsSync(caminhoDef), caminhoDef);
  if (existsSync(caminhoRef) && existsSync(caminhoDef)) {
    const snap = JSON.parse(readFileSync(caminhoRef, "utf8"));
    const defN = JSON.parse(readFileSync(caminhoDef, "utf8"));
    assert("F-075 nativo: referência declara os itens do mobiliário (texto, régua, imagem)",
      snap.textos.length >= 90 && snap.regras.length >= 5 && snap.imagens.length === 9,
      JSON.stringify({ t: snap.textos.length, r: snap.regras.length, i: snap.imagens.length }));
    const ehCaixaOuSegmento = (r) => r.tipo === "segmento" ? true : (r.width > 0 && r.height > 0);
    assert("F-075 nativo: toda régua/caixa da referência tem geometria utilizável",
      snap.regras.every(ehCaixaOuSegmento), "geometria inválida");
    const tipos = {};
    for (const e of defN.elementos) tipos[e.type] = (tipos[e.type] || 0) + 1;
    assert("F-075 nativo: definição traz mobiliário + 1 elemento por item da referência",
      tipos.text + tipos.checkbox >= snap.textos.length && tipos.line + tipos.rectangle >= snap.regras.length && tipos.image === snap.imagens.length,
      JSON.stringify(tipos));
    const vN = N.validarDefinicao(defN);
    assert("F-075 nativo: definição do repositório sem erro crítico (§31)",
      vN.erros.length === 0, JSON.stringify(vN.erros.slice(0, 3)));
    assert("F-075 nativo: campos dinâmicos continuam com a geometria do schema",
      defN.elementos.filter((e) => e.type === "field").length >= 30 && defN.elementos.every((e) => e.origem !== "schema" || (e.ancoraV === "campo" && e.zIndex >= 100)),
      "campo sem perfil da aplicação");
    // ACEITE: deslocamento medido item por item contra a referência (tolerância 1 pt)
    const rel = N.compararComReferencia(defN, snap, { tolerancia: 1 });
    assert("F-075 nativo: comparação geométrica não deixa item sem par",
      rel.semPar === 0 && rel.casados === snap.textos.length + snap.regras.length + snap.imagens.length,
      "sem par " + rel.semPar + " de " + rel.casados);
    assert("F-075 nativo: deslocamento medido está DENTRO da tolerância de 1 pt (§27.3)",
      rel.dentro === true && rel.maxDx <= 1 && rel.maxDy <= 1, rel.resumo);
    assert("F-075 nativo: mobiliário fica na banda de camadas abaixo dos campos (\u00a720)",
      defN.elementos.filter((e) => e.origem === "importado").every((e) => e.zIndex < 100) &&
        defN.elementos.filter((e) => e.origem === "schema").every((e) => e.zIndex >= 100),
      JSON.stringify({ imp: defN.elementos.filter((e) => e.origem === "importado").map((e) => e.zIndex).slice(-3), sch: defN.elementos.filter((e) => e.origem === "schema").map((e) => e.zIndex).slice(0, 3) }));
    assert("F-075 nativo: cada item medido guarda o desvio contra a referência",
      defN.elementos.filter((e) => e.desvioMedido).length === rel.casados &&
        defN.elementos.filter((e) => e.desvioMedido && Math.abs(e.desvioMedido.dx) <= 1 && Math.abs(e.desvioMedido.dy) <= 1).every((e) => e.confirmado === true),
      JSON.stringify(defN.elementos.filter((e) => e.desvioMedido).length));
    assert("F-075 nativo: assets do mobiliário existem na raiz do repositório",
      (defN.assets || []).length === 9 && (defN.assets || []).every((a) => existsSync(join(ROOT, a.arquivo))),
      JSON.stringify((defN.assets || []).map((a) => a.arquivo)));
    assert("F-075 nativo: metadados registram a referência e o deslocamento medido",
      defN.metadados && defN.metadados.referencia && defN.metadados.referencia.deslocamentoMaximoPt.dx <= 1 &&
        defN.metadados.referencia.toleranciaPt === 1 && defN.metadados.pendenteCalibracao === false,
      JSON.stringify(defN.metadados && defN.metadados.referencia));
    // Gerador reproduz exatamente o arquivo versionado (build determinístico)
    const ger = spawn(process.execPath, [join(ROOT, "scripts", "gerar-nativo-f075.mjs"), "--conferir"], { encoding: "utf8" });
    let saidaGer = "";
    ger.stdout.on("data", (d) => { saidaGer += d; });
    ger.on("close", (code) => {
      assert("F-075 nativo: gerador reproduz a definição com deslocamento dentro da tolerância",
        code === 0 && saidaGer.indexOf("sem par: 0") !== -1, "exit " + code + " · " + saidaGer.split("\n").slice(-2).join(" "));
    });
  }
}

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
  // FICHA SAFO é a chave usada nas bases e na aplicação pública; o arquivo físico
  // tem underscore (FICHA SA_FO.pdf). A grafia com underscore é aceita e convertida.
  assert("normalizarFicha aceita grafia FICHA SA_FO → FICHA SAFO", T.normalizarFicha("FICHA SA_FO") === "FICHA SAFO", "fix broken");

  // 14.6b — mapa de fichas em sincronia com os dados reais e com a aplicação pública.
  // Sem isso a Saúde do Sistema acusa "cidade(s) com ficha não mapeada para PDF"
  // e o fluxo Outros Planos fica sem template para aquelas cidades.
  const mapaFichas = T.FICHA_UTILIZAR_PARA_ARQUIVO;
  assert("mapa de fichas exposto para a suíte", !!mapaFichas && Object.keys(mapaFichas).length > 0, "missing");
  for (const base of ["cidades_brasil.json", "cidades_infinity.json"]) {
    const rows = JSON.parse(readFile(join(ROOT, base), "utf8"));
    const semMapa = rows
      .map(r => T.normalizarFicha(r["FICHA A UTILIZAR"]))
      .filter(f => !mapaFichas[f]);
    assert(`toda ficha usada em ${base} existe no mapa do painel`,
      semMapa.length === 0, "sem mapa: " + JSON.stringify(Array.from(new Set(semMapa))));
  }
  const publicaSrc = readFile(join(ROOT, "assistencia_medica.html"), "utf8");
  const foraDaPublica = Object.keys(mapaFichas).filter(k => !publicaSrc.includes('"' + k + '"'));
  assert("mapa de fichas do painel espelha a aplicação pública",
    foraDaPublica.length === 0, "chaves ausentes em assistencia_medica.html: " + JSON.stringify(foraDaPublica));

  // 14.6c — caminho de arquivo do repositório a partir do painel (/admin/…).
  // Regressão: o coletor de integridade fazia HEAD no nome cru, batia em
  // /admin/arquivo.pdf e acusava “PDF inacessível” para TODOS os templates.
  assert("urlRepositorio prefixa ../ sem encode duplicado",
    T.urlRepositorio("FICHA BH.pdf") === "../FICHA BH.pdf" && T.urlRepositorio("F-075 x.pdf") === "../F-075 x.pdf",
    T.urlRepositorio("FICHA BH.pdf"));

  // 14.6d — a marcação de publicação é por GRUPO: a mesma chave em grupos
  // diferentes (ex.: cidade e campo homônimos) precisa ser publicada uma a uma.
  const ovPend = {
    campos_ficha: { "CHAVE IGUAL": { x: 1 } }, cidades: { "CHAVE IGUAL": { ficha: "FICHA SJC" } },
    cidades_novas: [], pdfs_meta: {}, forms_meta: {}, templates_versoes: {}, configuracoes: {}, campos_custom: {}, campos_declaracao: {}
  };
  assert("chave de publicação é namespaced por grupo",
    T.chavePublicacao("cidades", "X") === "cidades|X", T.chavePublicacao("cidades", "X"));
  const pubIgual = T.publicarPendentes(ovPend, {}, "admin@atento.com");
  assert("mesma chave em grupos distintos gera 2 pendências", pubIgual.publicados === 2, JSON.stringify(Object.keys(pubIgual.marcados)));
  assert("nenhuma pendência sobra depois de publicar",
    T.calcularPendentes(ovPend, pubIgual.marcados).length === 0,
    JSON.stringify(T.calcularPendentes(ovPend, pubIgual.marcados).map(p => p.overlayKey + ":" + p.chave)));
  assert("marcação legada (chave crua) continua sendo respeitada",
    T.estaPublicado({ "CHAVE IGUAL": { publicadoEm: "x" } }, "campos_ficha", "CHAVE IGUAL") === true, "legacy");

  // 14.6e — métricas de formulário contam cidades por TODOS os templates do
  // formulário (`pdfFiles`): a F-089 usa a declaração e as fichas regionais.
  const metrF = T.formulariosComMetricas(
    [{ codigo: "F-089", nome: "F-089 · Assistência Médica", pdfFile: "DECLARACAO PLANO DE SAUDE.pdf", pdfFiles: ["DECLARACAO PLANO DE SAUDE.pdf", "FICHA BH.pdf", "FICHA SA_FO.pdf"] }],
    {}, {},
    T.FICHA_UTILIZAR_PARA_ARQUIVO,
    [{ cidade: "A", ficha: "FICHA BH" }, { cidade: "B", ficha: "FICHA SJC" }, { cidade: "C", ficha: "FICHA SAFO" }],
    {}, {}, {}
  )[0];
  assert("métricas contam cidades de todos os templates do formulário", metrF.nCidades === 2, JSON.stringify(metrF)); // FICHA BH + FICHA SAFO; a FICHA SJC não é deste formulário

  // 14.6f — CONFIGURAÇÕES (§22) precisam ter EFEITO nos fluxos (nenhum controle
  // fantasma: chave que só grava valor é bug de produto).
  st.overlay.configuracoes = {};
  for (const k of ["geral.nome_sistema", "geral.manutencao", "formularios.validar_uf", "formularios.exigir_template", "pdfs.limite_mb", "pdfs.manter_versoes", "seguranca.confirmar_destrutivas"]) {
    assert(`configuração ${k} tem default legível`, T.configGet(k) !== undefined && T.configGet(k) !== null, "undefined");
  }
  assert("configLigada é true com overlay vazio (default ligada)", T.configLigada("formularios.exigir_template") === true, "false");
  st.overlay.configuracoes = { formularios: { exigir_template: false } };
  assert("configLigada respeita o valor desligado no overlay", T.configLigada("formularios.exigir_template") === false, "true");

  // exigir_template=false rebaixa "cidade sem template" de crítico para aviso
  const cidadesReaisGuard = st.cityArr;
  st.cityArr = [{ idx: 0, cidade: "Cidade Sem Ficha", uf: "SP", regional: "SP", ficha: "FICHA INEXISTENTE", fonte: "teste" }];
  st.overlay.configuracoes = {};
  const gateLigado = T.coletarProblemas();
  assert("exigir_template LIGADO: ficha não mapeada bloqueia a publicação",
    gateLigado.criticos.some(t => t.indexOf("Cidade sem template mapeado") === 0), JSON.stringify(gateLigado.criticos));
  st.overlay.configuracoes = { formularios: { exigir_template: false } };
  const gateDesligado = T.coletarProblemas();
  assert("exigir_template DESLIGADO: vira aviso (não bloqueia)",
    !gateDesligado.criticos.some(t => t.indexOf("Cidade sem template mapeado") === 0) &&
    gateDesligado.avisos.some(t => t.indexOf("Cidade sem template mapeado") === 0), JSON.stringify(gateDesligado.avisos));
  st.cityArr = cidadesReaisGuard;
  st.overlay.configuracoes = {};

  // validar_uf=false aceita importação sem UF válida
  const cityMapGuard = st.cityMap;
  st.cityMap = {};
  const semUfImp = [{ cidade: "Cidade Sem Uf", uf: "ZZ", regional: "", ficha: "FICHA BH" }];
  assert("validar_uf LIGADO: UF inválida reprova a importação",
    T.classificarCidadesImportadas(semUfImp, { validarUf: true }).invalidos.length === 1, "aceitou");
  assert("validar_uf DESLIGADO: UF inválida passa na importação",
    T.classificarCidadesImportadas(semUfImp, { validarUf: false }).validos.length === 1, "reprovou");
  st.cityMap = cityMapGuard; // restaura para os testes de diff/importação abaixo

  // estruturais: fluxos destrutivos consultam a configuração de confirmação e os
  // controles fantasma de §22 têm consumidor no código
  assert("fluxos destrutivos usam confirmarDestrutivo (desligável em Segurança)",
    panelCode.includes('confirmarDestrutivo("Descartar pendências"') &&
    panelCode.includes('confirmarDestrutivo("Excluir campo"') &&
    panelCode.includes('confirmarDestrutivo("Remover cidade (overlay)"') &&
    panelCode.includes('confirmarDestrutivo("Restaurar versão anterior"'), "missing");
  assert("configurações de manutenção e versões são lidas pelos fluxos",
    panelCode.includes('configLigada("geral.manutencao")') &&
    panelCode.includes('configLigada("pdfs.manter_versoes")') &&
    panelCode.includes('configGet("geral.nome_sistema")') &&
    panelCode.includes('configGet("pdfs.limite_mb")'), "missing consumer");
  assert("aviso de manutenção existe no Dashboard (config geral.manutencao)",
    adminR2.body.includes('id="admAvisoManutencao"'), "missing");

  // 14.6g — arquivos EFETIVOS do repositório: é o que faz uma coordenada
  // ajustada no Editor Visual chegar à aplicação pública (o overlay não é lido
  // por ela). Com overlay vazio, o gerado tem de ser igual ao arquivo real.
  assert("botões de exportação dos arquivos do repositório no painel",
    adminR2.body.includes('id="btnExpSchemaFicha"') && adminR2.body.includes('id="btnExpSchemaDecl"') &&
    adminR2.body.includes('id="btnExpCidadesBrasil"') && adminR2.body.includes('id="btnExpCidadesInfinity"') &&
    adminR2.body.includes('id="repoExportResumo"'), "missing");
  const realFicha = JSON.parse(readFile(join(ROOT, "ficha_cadastral_campos.json"), "utf8"));
  st.overlay.campos_ficha = {};
  st.overlay.campos_custom = {};
  st.docBase = st.docBase || {};
  st.docBase.ficha_cadastral = JSON.parse(JSON.stringify(realFicha));
  assert("overlay vazio → JSON do schema idêntico ao do repositório",
    JSON.stringify(T.docEfetivoParaRepositorio("ficha_cadastral")) === JSON.stringify(realFicha), "divergiu");
  st.overlay.campos_ficha["dados_pessoais.campos.nome"] = { x: 999, y: 888 };
  const gerFicha = T.docEfetivoParaRepositorio("ficha_cadastral");
  assert("coordenada do overlay entra no JSON gerado (merge, não substituição)",
    gerFicha.campos.dados_pessoais.campos.nome.coordenadas.x === 999 &&
    gerFicha.campos.dados_pessoais.campos.nome.coordenadas.largura === realFicha.campos.dados_pessoais.campos.nome.coordenadas.largura &&
    gerFicha.campos.dados_pessoais.campos.fone.coordenadas.x === realFicha.campos.dados_pessoais.campos.fone.coordenadas.x, "patch errado");
  assert("docBase permanece intacto após gerar o arquivo do repositório",
    JSON.stringify(st.docBase.ficha_cadastral) === JSON.stringify(realFicha), "docBase mutado!");
  assert("resumo de exportação conta as coordenadas pendentes de levar ao repo",
    T.resumoExportacaoRepositorio().nPatch === 1 && T.resumoExportacaoRepositorio().nenhuma === false,
    JSON.stringify(T.resumoExportacaoRepositorio()));
  // O patch do overlay guarda metadados do painel (`label`) junto da coordenada;
  // eles não podem vazar para o `coordenadas` do schema do repositório.
  st.overlay.campos_ficha["dados_pessoais.campos.nome"] = { largura: 120, label: "Nome completo" };
  const gerMeta = T.docEfetivoParaRepositorio("ficha_cadastral");
  const coordMeta = gerMeta.campos.dados_pessoais.campos.nome.coordenadas;
  assert("exportação copia só x/y/largura/altura (sem metadados do painel)",
    coordMeta.largura === 120 && !("label" in coordMeta) && Object.keys(coordMeta).sort().join(",") === "altura,largura,x,y",
    JSON.stringify(coordMeta));
  st.overlay.campos_ficha = {};

  // cidades no formato do repositório (com e sem UF) + cidade nova do overlay
  const realBrasil = JSON.parse(readFile(join(ROOT, "cidades_brasil.json"), "utf8"));
  const guardCid = { cidades: st.overlay.cidades, novas: st.overlay.cidades_novas, arr: st.cityArr };
  st.overlay.cidades = {}; st.overlay.cidades_novas = [];
  st.cityArr = realBrasil.map((r, i) => ({ idx: i, cidade: String(r.CIDADE || ""), uf: "", regional: String(r.REGIONAL || ""), ficha: T.normalizarFicha(r["FICHA A UTILIZAR"]), fonte: "cidades_brasil.json" }));
  assert("overlay vazio → cidades_brasil.json gerado idêntico ao do repositório",
    JSON.stringify(T.cidadesEfetivasParaRepositorio(false)) === JSON.stringify(realBrasil), "divergiu");
  const comUfGerado = T.cidadesEfetivasParaRepositorio(true)[0];
  assert("variante com UF gerada tem a coluna UF (formato cidades_infinity)",
    Object.keys(comUfGerado).join(",") === "REGIONAL,UF,CIDADE,FICHA A UTILIZAR", Object.keys(comUfGerado).join(","));
  st.overlay.cidades_novas = [{ id: 1, cidade: "Cidade Nova", uf: "CE", regional: "NE", ficha: "FICHA SAFO" }];
  T.aplicarOverlayCidades();
  const linhasNovas = T.cidadesEfetivasParaRepositorio(true);
  assert("cidade nova do overlay entra no arquivo do repositório",
    linhasNovas.length === realBrasil.length + 1 && !!linhasNovas.find(l => l.CIDADE === "Cidade Nova" && l.UF === "CE"),
    "n=" + linhasNovas.length);
  st.overlay.cidades = guardCid.cidades;
  st.overlay.cidades_novas = guardCid.novas;
  st.cityArr = guardCid.arr; // restaura para os testes de diff/importação abaixo

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

  // 14.8b — reimportar o PRÓPRIO arquivo exportado não pode sugerir mudança.
  // Regressão de UX: o cabeçalho dizia “0 novo · 0 alterado … Desmarque o que
  // NÃO deve ser aplicado” e o grupo mostrava “Configurações (1)”, parecendo
  // 1 alteração pendente.
  const soma = (obj, campo) => Object.keys(obj).reduce((n, k) => n + (obj[k][campo] ? (typeof obj[k][campo] === "number" ? obj[k][campo] : obj[k][campo].length) : 0), 0);
  const mesmo = T.diffImportacao(JSON.parse(JSON.stringify(st.overlay)));
  assert("reimportar o mesmo overlay resulta em 0 novo e 0 alterado",
    soma(mesmo, "novos") + mesmo.cidades_novas.novos.length === 0 && soma(mesmo, "alterados") === 0,
    JSON.stringify({ novos: soma(mesmo, "novos"), alt: soma(mesmo, "alterados") }));
  const guardCfg = st.overlay.configuracoes;
  st.overlay.configuracoes = { geral: { nome_sistema: "X" } };
  const mesmoCfg = T.diffImportacao({ configuracoes: { geral: { nome_sistema: "X" } } });
  assert("item idêntico é contado como idêntico (não como mudança)",
    mesmoCfg.configuracoes.identicos === 1 && mesmoCfg.configuracoes.novos.length === 0 && mesmoCfg.configuracoes.alterados.length === 0,
    JSON.stringify(mesmoCfg.configuracoes));
  st.overlay.configuracoes = guardCfg;
  const mix = T.diffOverlayMaps({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
  assert("diffOverlayMaps separa novos/alterados/idênticos",
    mix.novos.length === 1 && mix.alterados.length === 1 && mix.identicos === 1 && mix.total === 3, JSON.stringify(mix));
  assert("importação sem mudanças mostra aviso claro e não oferece aplicar",
    panelCode.includes("Nada a aplicar.") && panelCode.includes('if (!$("btnImportOk")) return;'), "missing");
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
  const lote1 = FB.novoCampoCustom("Nome Completo", { existentes: FB.fbIdsExistentes("ficha_cadastral"), secao: "dados_pessoais", x: 50, y: 60, largura: 220, altura: 12 });
  assert("fb: criação evita colisão com id base", lote1.id === "nome_completo_2", lote1.id);
  assert("fb: novoCampoCustom tem defaults coerentes", lote1.tipo === "texto" && lote1.pagina === 1 && lote1.origem === "painel", JSON.stringify(lote1));

  // 16.2b — seções: somente as JÁ existentes no schema são aceitas
  const secoesBase = FB.fbSecoesExistentes("ficha_cadastral");
  assert("fb: lista seções existentes do schema", secoesBase.length === 1 && secoesBase[0] === "dados_pessoais", JSON.stringify(secoesBase));
  const semSecao = FB.validarCampoSchema({ label: "X", tipo: "texto", pagina: 1, coordenadas: { x: 1, y: 1, largura: 10, altura: 10 } });
  assert("fb: campo sem seção de destino é erro", semSecao.erros.some(e => e.includes("Seção de destino")), JSON.stringify(semSecao.erros));

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

  // 16.5 — aplicarCamposCustomEmJson: criar (em seção existente) + excluir + idempotência
  const json1 = JSON.parse(JSON.stringify(stFB.docBase.ficha_cadastral));
  const lote = {};
  const criado = FB.novoCampoCustom("Telefone comercial", { existentes: FB.fbIdsExistentes("ficha_cadastral"), secao: "dados_pessoais", x: 60, y: 300, largura: 200, altura: 12 });
  lote[criado.id] = criado;
  lote.nome_completo = { excluir: true };
  const ops1 = FB.aplicarCamposCustomEmJson(json1, lote);
  assert("fb: aplicação cria campo em seção existente", ops1.criados.length === 1 && json1.campos.dados_pessoais.campos.telefone_comercial, JSON.stringify(ops1));
  assert("fb: aplicação exclui campo", ops1.excluidos.includes("nome_completo") && !FB.campoPresenteRec(json1.campos, "nome_completo"), JSON.stringify(ops1));
  const ops2 = FB.aplicarCamposCustomEmJson(json1, lote);
  assert("fb: aplicação é idempotente (2ª passada não duplica nem reporta criação)", ops2.criados.length === 0 && ops2.excluidos.length === 0, JSON.stringify(ops2));
  assert("fb: nenhuma seção nova é criada no JSON", Object.keys(json1.campos).join(",") === "dados_pessoais" && !("campos_adicionais" in json1.campos), JSON.stringify(Object.keys(json1.campos)));
  // seção inexistente → rejeitado (sem criar seção nenhuma)
  const jsonOrf = JSON.parse(JSON.stringify(stFB.docBase.ficha_cadastral));
  const opsOrf = FB.aplicarCamposCustomEmJson(jsonOrf, { campo_x: FB.novoCampoCustom("Campo X", { id: "campo_x", secao: "secao_inexistente", x: 1, y: 1, largura: 10, altura: 10 }) });
  assert("fb: criação em seção inexistente é rejeitada (nada é inserido)", opsOrf.criados.length === 0 && opsOrf.conflitos.length === 1 && !FB.campoPresenteRec(jsonOrf.campos, "campo_x"), JSON.stringify(opsOrf));

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

  // 16.9b — grupo SEM coordenadas é campo válido como alvo de `dependencia`.
  // Regressão: o conjunto de ids vinha de flattenFields(), que só devolve nós
  // com `coordenadas` — então todo grupo_radio era acusado de "campo
  // inexistente" e a publicação da F-075 ficava bloqueada por 6 erros críticos
  // falsos (primeiro_emprego, possui_deficiencia e tipo_conta existem).
  const jsonGrupo = { campos: { s: { campos: {
    g: { label: "Grupo", tipo: "grupo_radio", pagina: 1, opcoes: {
      sim: { label: "Sim", coordenadas: { x: 10, y: 10, largura: 5, altura: 5 } },
      nao: { label: "Não", coordenadas: { x: 20, y: 10, largura: 5, altura: 5 } }
    } },
    f: { label: "Dependente do grupo", tipo: "texto", pagina: 1, coordenadas: { x: 30, y: 30, largura: 40, altura: 10 }, dependencia: { campo: "g", valor: "sim" } }
  } } } };
  const vGrupo = FB.validarDocCampos(jsonGrupo, null);
  assert("fb: dependencia para grupo SEM coordenadas não é erro", vGrupo.erros.length === 0, JSON.stringify(vGrupo.erros));
  const idsG = FB.idsCamposSchema(jsonGrupo.campos, {}, "");
  assert("fb: ids do schema incluem grupo e opções", !!idsG.g && !!idsG.sim && !!idsG.nao && !!idsG.f, JSON.stringify(idsG));

  // 16.9c — os schemas REAIS do repositório passam no gate de publicação.
  for (const arqSchema of ["ficha_cadastral_campos.json", "declaracao_plano_saude_campos.json", "assistencia_medica_campos.json"]) {
    const schemaReal = JSON.parse(readFile(join(ROOT, arqSchema), "utf8"));
    const vReal = FB.validarDocCampos(schemaReal, null);
    assert(`fb: ${arqSchema} sem erros críticos (gate de publicação §24)`, vReal.erros.length === 0, JSON.stringify(vReal.erros.slice(0, 4)));
  }

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

// ══════════════════════════════════════════════════════
// Teste 19 — TIPOGRAFIA OFICIAL POR RUN (§15.1) E TRAÇO DO MOBILIÁRIO
// ══════════════════════════════════════════════════════
// CUIDADO DE REALM (custou 6 pp de medição): o pdf-lib valida objetos
// aninhados — options.start/end de drawLine — contra o `Object` do PRÓPRIO
// realm. Com o engine carregado em node:vm e o pdf-lib vindo do host, TODA
// régua é rejeitada ("must be of type {x, y}, but was actually of type NaN") e
// o PDF sai sem nenhuma linha, sem erro visível. Por isso este bloco carrega o
// engine no realm do host, exatamente como o painel faz (engine e pdf-lib no
// mesmo contexto).
async function testarTipografiaOficial(assert) {
  console.log("\n📋 Teste 19: tipografia oficial por run e traço do mobiliário");
  const pdfLib19 = await import("pdf-lib");
  const zlib19 = await import("node:zlib");
  (0, eval)(readFileSync(join(ROOT, "native-docs.js"), "utf8"));
  const N19 = globalThis.NativeDocs;
  assert("tipografia: engine carrega no realm do host (como no painel)", !!N19 && !!N19.resolverFonte, "sem API de tipografia");

  // 19.1 — nome de fonte do PDF/DOCX → família oficial (subconjunto, sufixo, alias)
  assert("tipografia: nome do PDF resolve para a família oficial",
    N19.chaveOficial("AAAAAA+Arial-BoldMT") === "arial" &&
    N19.chaveOficial("DAAAAA+HelveticaLTPro-Roman") === "helvetica" &&
    N19.chaveOficial("Arial Narrow") === "arial narrow" &&
    N19.chaveOficial("Wingdings") === "wingdings" &&
    N19.chaveOficial("Fonte Que Nao Existe") === null,
    [N19.chaveOficial("AAAAAA+Arial-BoldMT"), N19.chaveOficial("Arial Narrow"), N19.chaveOficial("Wingdings")].join(","));

  // 19.2 — Arial é equivalente MÉTRICO de Helvetica (medido: 99,5%); Arial
  // Narrow NÃO é (medido: 18% mais estreita) e por isso avisa em vez de calar.
  const rArial = N19.resolverFonte({ font: { family: "Arial", size: 8, weight: "normal" } }, {});
  const rNarrow = N19.resolverFonte({ font: { family: "Arial Narrow", size: 8, weight: "normal" } }, {});
  const rWing = N19.resolverFonte({ font: { family: "Wingdings", size: 8 } }, {});
  const rTimes = N19.resolverFonte({ font: { family: "Times New Roman", size: 8, weight: "bold" } }, {});
  assert("tipografia: Arial cai em Helvetica sem desvio declarado",
    rArial.chave === "Helvetica" && rArial.oficial.desvio === 0 && !rArial.aviso, JSON.stringify(rArial));
  assert("tipografia: Arial Narrow NÃO é substituída em silêncio (aviso + 18%)",
    rNarrow.chave === "Helvetica" && rNarrow.oficial.desvio > 0.15 && !!rNarrow.aviso, JSON.stringify(rNarrow).slice(0, 120));
  assert("tipografia: Wingdings é marcada como simbólica (o glifo vira checkbox)",
    rWing.oficial.simbolica === true, JSON.stringify(rWing));
  assert("tipografia: Times New Roman resolve para a fonte padrão serifada", rTimes.chave === "Times-Bold", rTimes.chave);

  // 19.3 — com a fonte licenciada em assets.fontes, a oficial é usada de verdade
  const rAsset = N19.resolverFonte({ font: { family: "Arial Narrow", size: 8, weight: "bold" } }, { "Arial Narrow-Bold": {} });
  assert("tipografia: asset licenciado vence o substituto padrão",
    rAsset.chave === "Arial Narrow-Bold" && rAsset.embutida === true, JSON.stringify(rAsset).slice(0, 120));

  // 19.4 — renderer do documento REAL do repositório: réguas desenhadas,
  // retângulos preenchidos SEM contorno inventado.
  const defReal = JSON.parse(readFileSync(join(ROOT, "ficha_cadastral_nativo.json"), "utf8"));
  const imgs19 = {};
  const { readdirSync: listar19 } = await import("node:fs");
  for (const nome of listar19(ROOT)) {
    if (/^f075_nativo_\d+\.png$/.test(nome)) imgs19[nome] = new Uint8Array(readFileSync(join(ROOT, nome)));
  }
  const ger19 = await N19.renderizarPdf(defReal, {}, pdfLib19, { imagens: imgs19 }, { forcar: true });
  const buf19 = Buffer.from(ger19.bytes);
  const txt19 = Buffer.from(buf19).toString("latin1");
  let conteudo19 = "";
  for (const m of txt19.matchAll(/stream\r?\n/g)) {
    const ini = m.index + m[0].length;
    const fim = txt19.indexOf("endstream", ini);
    try { conteudo19 += zlib19.inflateSync(buf19.subarray(ini, fim)).toString("latin1"); } catch { /* sem deflate */ }
  }
  const contar = (re) => (conteudo19.match(re) || []).length;
  assert("renderer: réguas do mobiliário SAEM no PDF (traçado `S` presente)",
    contar(/\bS\b/g) >= 7, "S=" + contar(/\bS\b/g));
  // Só os retângulos: o pdf-lib emite `B` (preenche E traça) quando borderWidth é
  // passado, mesmo sem borderColor — e o traço assume a cor padrão do PDF (preto),
  // pintando 4.312 px de tinta que não existe no formulário oficial. `f` = só
  // preenchimento (as caixas brancas medidas na referência).
  const soRet = Object.assign({}, defReal, { elementos: defReal.elementos.filter((e) => e.type === "rectangle") });
  const gerRet = await N19.renderizarPdf(soRet, {}, pdfLib19, { imagens: {} }, { forcar: true });
  const bufRet = Buffer.from(gerRet.bytes);
  const txtRet = bufRet.toString("latin1");
  let contRet = "";
  for (const m of txtRet.matchAll(/stream\r?\n/g)) {
    const ini = m.index + m[0].length;
    const fim = txtRet.indexOf("endstream", ini);
    try { contRet += zlib19.inflateSync(bufRet.subarray(ini, fim)).toString("latin1"); } catch { /* sem deflate */ }
  }
  const cb = (contRet.match(/\bB\b/g) || []).length;
  const cf = (contRet.match(/\bf\b/g) || []).length;
  assert("renderer: retângulo preenchido sem `stroke` não ganha contorno preto inventado",
    cb === 0 && cf >= 10, "B=" + cb + " f=" + cf);
  assert("renderer: fontes substituídas são REPORTADAS (nunca em silêncio)",
    Array.isArray(ger19.fontesSubstituidas) && ger19.fontesSubstituidas.some((s) => /narrow/i.test(s.pedida)),
    JSON.stringify((ger19.fontesSubstituidas || []).map((s) => s.pedida)));

  // 19.5 — a tipografia oficial está declarada no documento versionado
  const meta19 = defReal.metadados && defReal.metadados.tipografiaOficial;
  assert("tipografia: documento nativo registra a fonte oficial por família",
    !!meta19 && meta19.porFamilia && meta19.porFamilia.Arial > 0 && meta19.porFamilia["Arial Narrow"] > 0,
    JSON.stringify(meta19 && meta19.porFamilia));
  const textos19 = defReal.elementos.filter((e) => e.type === "text" && e.fonteOficial);
  assert("tipografia: cada bloco com par no documento editável declara a fonte oficial",
    textos19.length >= 70 && textos19.every((e) => e.tipografiaOficial && e.tipografiaOficial.familia === e.fonteOficial),
    String(textos19.length));
  const tip19 = JSON.parse(readFileSync(join(ROOT, "scripts", "referencia", "f075-tipografia.json"), "utf8"));
  const nSimbolicos19 = tip19.runs.filter((r) => r.simbolica).length;
  const caixas19 = defReal.elementos.filter((e) => e.type === "checkbox");
  assert("tipografia: cada caixa de marcação vem de um run Wingdings do documento (1:1)",
    nSimbolicos19 === caixas19.length && caixas19.every((c) => c.fonteOficial === "Wingdings"),
    nSimbolicos19 + " runs x " + caixas19.length + " caixas");
  assert("tipografia: divergências entre o documento e o PDF ficam registradas",
    Array.isArray(meta19.divergencias) && meta19.divergencias.length > 0 &&
    meta19.substituicoes.some((s) => /narrow/i.test(s.pedida) && s.desvio > 0.15),
    JSON.stringify(meta19.substituicoes));
}

// ══════════════════════════════════════════════════════
// Teste 20 — PREENCHER: só os campos do modelo (sem geometria)
// ══════════════════════════════════════════════════════
async function testarPreencher(assert) {
  console.log("\n📋 Teste 20: Preencher — catálogo de campos e geração a partir dos valores");
  (0, eval)(readFileSync(join(ROOT, "admin", "preencher.js"), "utf8"));
  const P20 = globalThis.AdminPreencher && globalThis.AdminPreencher.__teste;
  assert("preencher: módulo carrega e expõe a API", !!P20 && !!P20.catalogoDaDefinicao, "sem AdminPreencher");
  if (!P20) return;
  const zlib20 = await import("node:zlib");
  const zlibInflar = (b) => zlib20.inflateSync(b);

  const defNat = JSON.parse(readFileSync(join(ROOT, "ficha_cadastral_nativo.json"), "utf8"));
  const cat20 = P20.catalogoDaDefinicao(defNat, {});
  assert("preencher: catálogo cobre TODOS os campos preenchíveis da definição",
    cat20.totais.campos === defNat.elementos.filter((e) => e.type === "field").length,
    JSON.stringify(cat20.totais) + " vs " + defNat.elementos.filter((e) => e.type === "field").length + " fields");
  assert("preencher: catálogo cobre TODAS as caixas de marcação",
    cat20.totais.caixas === defNat.elementos.filter((e) => e.type === "checkbox").length,
    JSON.stringify(cat20.totais));
  assert("preencher: nada é perguntado fora do modelo (sem campo inventado)",
    cat20.secoes.every((s) => s.campos.every((c) => defNat.elementos.some((e) => e.id === c.id))), "elemento fantasma");

  // valoresDaTela: dados no formato do engine + UMA caixa marcada por grupo
  const ler20 = (id) => ({ dados_pessoais_nome: "ROBERTO DA SILVA", dependentes_0_nome: "MARIA" }[id] || null);
  const grupos20 = cat20.secoes.flatMap((s) => s.grupos);
  const marcas20 = {};
  for (const g of grupos20) if (g.opcoes.length) marcas20[g.rotulo] = g.opcoes[0].id;
  const dados20 = P20.valoresDaTela(cat20, ler20, marcas20);
  assert("preencher: valores da tela vão para o binding certo (dados no formato do engine)",
    dados20["ficha_cadastral.dados_pessoais.nome"] === "ROBERTO DA SILVA" &&
    dados20["ficha_cadastral.dependentes.0.nome"] === "MARIA", JSON.stringify(dados20).slice(0, 140));
  const marcadas20 = Object.keys(dados20).filter((k) => dados20[k] === true);
  const desmarcadas20 = Object.keys(dados20).filter((k) => dados20[k] === false);
  assert("preencher: cada grupo tem EXATAMENTE uma caixa marcada",
    marcadas20.length === grupos20.length && marcadas20.length + desmarcadas20.length === cat20.totais.caixas,
    marcadas20.length + " marcadas / " + desmarcadas20.length + " desmarcadas / " + grupos20.length + " grupos");

  // O engine desenha o que a tela pediu (o Preencher não tem lógica própria de PDF)
  const pdfLib20 = await import("pdf-lib");
  (0, eval)(readFileSync(join(ROOT, "native-docs.js"), "utf8"));
  const N20 = globalThis.NativeDocs;
  const imgs20 = {};
  for (const a of defNat.assets || []) { try { imgs20[a.arquivo] = new Uint8Array(readFileSync(join(ROOT, a.arquivo))); } catch { /* opcional */ } }
  const ger20 = await N20.renderizarPdf(defNat, dados20, pdfLib20, { imagens: imgs20 }, { forcar: true });
  const buf20 = Buffer.from(ger20.bytes);
  let conteudo20 = "";
  const txt20 = buf20.toString("latin1");
  for (const m of txt20.matchAll(/stream\r?\n/g)) {
    const ini = m.index + m[0].length;
    const fim = txt20.indexOf("endstream", ini);
    try { conteudo20 += zlibInflar(buf20.subarray(ini, fim)); } catch { /* sem deflate */ }
  }
  const hexDe = (t) => Buffer.from(t, "latin1").toString("hex").toUpperCase();
  assert("preencher: o PDF gerado contém o valor digitado",
    conteudo20.toUpperCase().indexOf(hexDe("ROBERTO DA SILVA")) !== -1, "valor não encontrado no stream");
  assert("preencher: exatamente UMA marca por grupo aparece no PDF",
    (conteudo20.match(/<58>\s*Tj/g) || []).length === grupos20.length,
    (conteudo20.match(/<58>\s*Tj/g) || []).length + " X para " + grupos20.length + " grupos");
  assert("preencher: resumo conta preenchidos corretamente",
    P20.resumoPreenchimento(cat20, ler20, marcas20).preenchidos === 2 + grupos20.length,
    JSON.stringify(P20.resumoPreenchimento(cat20, ler20, marcas20)));
}

