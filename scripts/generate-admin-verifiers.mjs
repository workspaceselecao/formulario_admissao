#!/usr/bin/env node

/**
 * ============================================================
 * GENERATE ADMIN VERIFIERS — liberar e-mails do Painel Admin
 * ============================================================
 *
 * Gera os pares {s, v} (salt + verifier) para o array G do
 * admin-guard.js, usando EXATAMENTE o mesmo pipeline do guard.js:
 *
 *   v = hex( troca-pares( XOR-mascara-sal( inverte-bits( SHA-256( salt || utf8(email) ) ) ) ) )
 *
 * Uso:
 *   node scripts/generate-admin-verifiers.mjs email1@atento.com email2@atento.com
 *   (ou cole os e-mails, um por linha, na entrada padrão)
 *
 * Conferir um par existente:
 *   node scripts/generate-admin-verifiers.mjs --check email@atento.com <salt> <verifier>
 *
 * O script NÃO contém segredos: cada salt é gerado aleatoriamente por
 * execução. Os pares resultantes devem ser adicionados ao array G em
 * admin-guard.js (e commitados, como os demais verificadores).
 */

import crypto from "node:crypto";
import readline from "node:readline";

const DOMAIN = "@atento.com";
const EMAIL_RE = /^[a-z0-9._%+\-]+@atento\.com$/;

function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
}

function domainOk(email) {
  return email.length > DOMAIN.length && email.endsWith(DOMAIN) && EMAIL_RE.test(email);
}

function deriveVerifier(normalized, salt) {
  const combined = Buffer.concat([Buffer.from(salt, "utf8"), Buffer.from(normalized, "utf8")]);
  const hash = crypto.createHash("sha256").update(combined).digest();

  // Etapa 1: inversão de bits dentro de cada byte
  const reversed = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    let b = hash[i], r = 0;
    for (let j = 0; j < 8; j++) { r = (r << 1) | (b & 1); b >>= 1; }
    reversed[i] = r;
  }

  // Etapa 2: XOR com máscara derivada do salt (constante compartilhada com guard.js)
  const maskStr = "guard-salt-mask-v1:" + salt;
  const mask = crypto.createHash("sha256").update(Buffer.from(maskStr, "utf8")).digest();
  const xored = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) xored[i] = reversed[i] ^ mask[i];

  // Etapa 3: troca de bytes em pares
  const shuffled = Buffer.alloc(32);
  for (let i = 0; i < 32; i += 2) {
    shuffled[i] = xored[i + 1];
    shuffled[i + 1] = xored[i];
  }

  // Etapa 4: hex (minúsculas)
  return shuffled.toString("hex");
}

function newSalt() {
  return crypto.randomBytes(16).toString("hex");
}

const args = process.argv.slice(2);

// Modo conferência: --check email salt verifier
if (args[0] === "--check") {
  const [, email, salt, verifier] = args;
  if (!email || !salt || !verifier) {
    console.error("Uso: --check email@atento.com <salt> <verifier>");
    process.exit(1);
  }
  const norm = normalizeEmail(email);
  if (!domainOk(norm)) { console.error("✕ E-mail fora do domínio exigido."); process.exit(1); }
  const ok = deriveVerifier(norm, salt) === verifier.toLowerCase();
  console.log(ok ? "✓ Par confere para " + norm : "✕ Par NÃO confere.");
  process.exit(ok ? 0 : 1);
}

// Modo geração: e-mails por argumento ou stdin
let emails = args.map(normalizeEmail).filter(Boolean);

if (!emails.length) {
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    const e = normalizeEmail(line);
    if (e) emails.push(e);
  }
}

if (!emails.length) {
  console.error("Informe ao menos um e-mail (argumento ou stdin).");
  console.error("Uso: node scripts/generate-admin-verifiers.mjs nome.sobrenome@atento.com [outro@atento.com …]");
  process.exit(1);
}

let hadError = false;
const pairs = [];
for (const email of emails) {
  if (!domainOk(email)) {
    console.error(`✕ IGNORADO (domínio inválido): ${email}`);
    hadError = true;
    continue;
  }
  const salt = newSalt();
  const verifier = deriveVerifier(email, salt);
  pairs.push({ email, entry: `    { s: "${salt}", v: "${verifier}" }` });
}

if (pairs.length) {
  console.log("\n// Adicione ao array G em admin-guard.js:\n");
  for (const p of pairs) console.log(p.entry + ",");
  console.log("\n// E-mails correspondentes (guarde fora do repositório):");
  for (const p of pairs) console.log("//   " + p.email);
}

process.exit(hadError ? 1 : 0);
