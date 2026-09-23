#!/usr/bin/env node

/**
 * ============================================================
 * AUDITORIA DO PAINEL ADMINISTRATIVO × DADOS REAIS DO REPOSITÓRIO
 * ============================================================
 *
 * Por que existe: o painel deriva muito estado dos JSONs do repositório
 * (schemas de campos, bases de cidades, mapa ficha → PDF). Quando a derivação
 * não espelha a forma real dos dados, o painel acusa problemas que não existem
 * — foi o caso de "cidade(s) com ficha não mapeada para PDF" (chave
 * `FICHA SAFO` × `FICHA SA_FO`) e de "dependencia aponta para campo
 * inexistente" (grupos sem `coordenadas` fora do índice de ids), que travavam
 * a publicação com erros falsos.
 *
 * Este script executa o MESMO pipeline do painel (`carregarTudo` + os
 * coletores de Saúde/Validação + o gate de publicação) em node:vm, servindo
 * `fetch` a partir dos arquivos do repositório, e falha (exit 1) quando alguma
 * verificação não bate com os dados reais.
 *
 * Uso:  node scripts/audit-panel.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import vm from "node:vm";

const ROOT = join(import.meta.dirname, "..");

// ── Resultado ──────────────────────────────────────────────────────────
const linhas = [];
let falhas = 0;
function check(titulo, ok, detalhe) {
  if (!ok) falhas++;
  linhas.push({ ok: !!ok, titulo: titulo, detalhe: detalhe || "" });
}

// ── Stubs mínimos de DOM (o pipeline auditado não toca a UI) ───────────
function elStub() {
  return {
    style: {}, dataset: {}, hidden: false, value: "", innerHTML: "", textContent: "",
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, removeChild() {},
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    options: [], files: []
  };
}
const docStub = {
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  createElement: elStub,
  body: elStub()
};

// ── fetch servido pelos arquivos do repositório ───────────────────────
function caminhoLocal(path) {
  // O painel entrega URLs já com encodeURI (como um navegador entregaria ao
  // servidor) — decodifica antes de resolver no disco.
  let p = String(path || "").replace(/^\.\.\//, "").replace(/^\//, "");
  try { p = decodeURIComponent(p); } catch (e) { /* segue com o valor bruto */ }
  return join(ROOT, p);
}
async function fetchStub(url, opts) {
  const caminho = caminhoLocal(url);
  const metodo = String((opts && opts.method) || "GET").toUpperCase();
  const existe = existsSync(caminho);
  if (metodo === "HEAD") return { ok: existe, status: existe ? 200 : 404 };
  if (!existe) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
  const bruto = readFileSync(caminho);
  return {
    ok: true, status: 200,
    headers: { get: () => (extname(caminho) === ".json" ? "application/json" : "application/octet-stream") },
    json: async () => JSON.parse(bruto.toString("utf8")),
    text: async () => bruto.toString("utf8")
  };
}

// ── Sandbox ───────────────────────────────────────────────────────────
const sb = {
  window: {}, document: docStub, console,
  setTimeout() {}, clearTimeout() {},
  fetch: fetchStub,
  URL: { createObjectURL() { return ""; }, revokeObjectURL() {} },
  Blob: class {},
  Math, Date, JSON, Object, Array, Number, String, Set, Map, Promise, Error,
  encodeURIComponent, decodeURIComponent
};
// O painel fala com a persistência por `global.AdminPersistence`, onde `global`
// é a própria window — por isso o stub vive na window (e não no sandbox).
// Em modo API só para exercitar o caminho de gravação sem tocar o disco.
sb.window.AdminPersistence = {
  async carregarConfig() { return { overlay: null, modo: "api", origem: "auditoria" }; },
  async salvarOverlay() { return { persistido: true, destino: "auditoria (memória)" }; },
  async listarBackups() { return []; },
  async listarUploads() { return []; },
  async carregarHistorico() { return []; },
  async registrarEvento() { return true; },
  baixarJSON() {}
};
sb.window.document = docStub;
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(readFileSync(join(ROOT, "admin", "panel.js"), "utf8"), sb, { filename: "panel.js" });

const T = sb.window.AdminPanel && sb.window.AdminPanel.__teste;
if (!T) {
  console.error("✕ panel.js não expôs AdminPanel.__teste");
  process.exit(1);
}

// ── 1. Pipeline de carregamento ───────────────────────────────────────
await T.carregarTudo();
const st = T.state;

check("carrega os 2 schemas de campos (docBase/docData)",
  Object.keys(st.docData).length === 2 && Object.values(st.docData).every((d) => Array.isArray(d.flat) && d.flat.length > 0),
  "docData=" + Object.keys(st.docData).join(","));

const cidadesBase = JSON.parse(readFileSync(join(ROOT, "cidades_brasil.json"), "utf8"));
const cidadesInfinity = JSON.parse(readFileSync(join(ROOT, "cidades_infinity.json"), "utf8"));
check("carrega as cidades das bases do repositório",
  st.cityArr.length >= cidadesBase.length,
  `carregadas=${st.cityArr.length} brasil=${cidadesBase.length} infinity=${cidadesInfinity.length}`);

// ── 2. Gate de publicação (§24) — nenhum erro crítico falso ───────────
const gate = T.coletarProblemas();
check("gate de publicação: 0 erro(s) crítico(s) com overlay vazio",
  gate.criticos.length === 0,
  gate.criticos.slice(0, 6).join(" | "));
check("gate de publicação: 0 aviso(s) com overlay vazio e sem dimensões de página",
  gate.avisos.length === 0,
  gate.avisos.slice(0, 6).join(" | "));

// ── 3. Saúde do Sistema (Dashboard / Segurança) ───────────────────────
const saudeRapida = await T.coletarIntegridade(true);
check("Saúde (rápida): 0 erro crítico", saudeRapida.errN === 0,
  saudeRapida.itens.filter((i) => i.nivel === "err").slice(0, 5).map((i) => i.texto).join(" | "));
check("Saúde (rápida): 0 aviso", saudeRapida.warnN === 0,
  saudeRapida.itens.filter((i) => i.nivel === "warn").slice(0, 5).map((i) => i.texto).join(" | "));

const saudeCompleta = await T.coletarIntegridade(false);
check("Saúde (completa, com HEAD real nos arquivos): 0 erro crítico",
  saudeCompleta.errN === 0,
  saudeCompleta.itens.filter((i) => i.nivel === "err").slice(0, 5).map((i) => i.texto).join(" | "));
check("Saúde (completa): 0 aviso", saudeCompleta.warnN === 0,
  saudeCompleta.itens.filter((i) => i.nivel === "warn").slice(0, 5).map((i) => i.texto).join(" | "));

// ── 4. Cidades: ficha mapeada, UF preenchida e válida, sem duplicata ──
const semFicha = st.cityArr.filter((r) => !T.FICHA_UTILIZAR_PARA_ARQUIVO[r.ficha]);
check("toda cidade tem ficha mapeada para um PDF", semFicha.length === 0,
  semFicha.slice(0, 5).map((r) => r.cidade + "→" + r.ficha).join(" | "));

const ufNoArquivo = cidadesInfinity.filter((r) => String(r.UF || "").trim()).length;
const semUf = st.cityArr.filter((r) => !String(r.uf || "").trim());
check(`UF preservada nas cidades (a base tem UF em ${ufNoArquivo} linhas)`,
  ufNoArquivo === 0 || semUf.length === 0,
  `sem UF no painel: ${semUf.length}` + (semUf.length ? " (ex.: " + semUf.slice(0, 3).map((r) => r.cidade).join(", ") + ")" : ""));

const ufInvalida = st.cityArr.filter((r) => String(r.uf || "").trim() && !T.ufValida(r.uf));
check("toda UF carregada é válida (27 estados)", ufInvalida.length === 0,
  ufInvalida.slice(0, 5).map((r) => r.cidade + "/" + r.uf).join(" | "));

const chaves = new Set(), dup = [];
for (const r of st.cityArr) {
  const k = T.normalizarChaveCidade(r.cidade);
  if (chaves.has(k)) dup.push(r.cidade);
  chaves.add(k);
}
check("nenhuma cidade duplicada na visão do painel", dup.length === 0, dup.slice(0, 5).join(" | "));

// ── 5. Alterações Pendentes: overlay vazio ⇒ nada pendente ────────────
const pendVazio = T.calcularPendentes(T.exportarOverlayPuro(), null);
check("overlay vazio ⇒ 0 alteração(ões) pendente(s)", pendVazio.length === 0,
  pendVazio.map((p) => p.overlayKey + ":" + p.chave).slice(0, 5).join(" | "));

// ── 6. Configurações: defaults válidos por tipo/range ─────────────────
const cfgRuins = [];
for (const d of T.CONFIG_DEFS) {
  const v = T.configGet(d.key);
  if (d.tipo === "bool" && typeof v !== "boolean") cfgRuins.push(d.key + "=" + v);
  else if (d.tipo === "int" && (typeof v !== "number" || v < d.min || v > d.max)) cfgRuins.push(d.key + "=" + v);
  else if (d.tipo === "texto" && (typeof v !== "string" || !v.trim())) cfgRuins.push(d.key + "=" + v);
}
check("toda configuração retorna default do tipo/range correto", cfgRuins.length === 0, cfgRuins.join(" | "));

// ── 7. Métricas por formulário ────────────────────────────────────────
const metr = T.metricasFormularios();
check("métricas cobrem os 4 formulários do inventário", Array.isArray(metr) && metr.length === 4, "n=" + (metr || []).length);
check("F-075/F-089 com contagem de campos > 0",
  metr.filter((m) => /F-075|F-089/.test(m.codigo || m.nome || "")).every((m) => (m.nCampos || 0) > 0),
  JSON.stringify(metr.map((m) => (m.codigo || m.nome) + ":" + m.nCampos)));

// ── 8. Inventário de PDFs aponta para arquivos existentes ─────────────
const pdfsPanel = T.pdfsEfetivos();
const pdfAusente = pdfsPanel.filter((p) => !existsSync(join(ROOT, p.arquivo)));
check("todo arquivo do inventário de PDFs existe no repositório", pdfAusente.length === 0,
  pdfAusente.map((p) => p.arquivo).join(" | "));

// ── 9. Schemas reais no gate, com dimensões reais quando disponível ───
let pdfLib = null;
try { pdfLib = await import("pdf-lib"); } catch (e) { pdfLib = null; }
for (const key of Object.keys(st.docData)) {
  const dd = st.docData[key];
  let sizes = null;
  if (pdfLib && dd.pdfFile) {
    const caminho = join(ROOT, dd.pdfFile);
    try {
      const doc = await pdfLib.PDFDocument.load(readFileSync(caminho));
      sizes = doc.getPages().map((p) => ({ w: p.getWidth(), h: p.getHeight() }));
    } catch (e) { sizes = null; }
  }
  const v = T.validarDocCampos(dd.json, sizes);
  check(`schema ${key} sem erro no gate${sizes ? " (com dimensões reais)" : ""}`,
    v.erros.length === 0, v.erros.slice(0, 4).join(" | "));
  check(`schema ${key} sem aviso de coordenada${sizes ? " (com dimensões reais)" : ""}`,
    v.avisos.length === 0, v.avisos.slice(0, 4).join(" | "));
}

// ── 10. Command Palette: índice encontra dados reais ──────────────────
if (typeof T.construirIndiceBusca === "function" && typeof T.buscarIndice === "function") {
  const indice = T.construirIndiceBusca();
  check("Command Palette constrói índice com itens", Array.isArray(indice) && indice.length > 0, "itens=" + (indice || []).length);
  if (Array.isArray(indice)) {
    check("Command Palette encontra uma cidade real (Salvador)", T.buscarIndice(indice, "salvador").length > 0, "0 resultados");
    check("Command Palette encontra um formulário (Ficha Cadastral)", T.buscarIndice(indice, "ficha cadastral").length > 0, "0 resultados");
  }
}

// ── 11. Arquivos do repositório gerados pelo painel ──────────────────
// Invariante central do ciclo painel → aplicação pública: com overlay vazio, o
// arquivo gerado precisa ser IDÊNTICO ao do repositório (mesmo conteúdo e mesma
// ordem de chaves). É o que prova que o botão “Exportar arquivos do repositório”
// produz algo que pode substituir o arquivo real.
for (const [key, arquivo] of [["ficha_cadastral", "ficha_cadastral_campos.json"], ["declaracao_plano_saude", "declaracao_plano_saude_campos.json"]]) {
  const gerado = T.docEfetivoParaRepositorio(key);
  const real = JSON.parse(readFileSync(join(ROOT, arquivo), "utf8"));
  check(`overlay vazio ⇒ ${arquivo} gerado é idêntico ao do repositório`,
    JSON.stringify(gerado) === JSON.stringify(real), "o JSON gerado divergiu do arquivo do repositório");
}
for (const [comUf, arquivo] of [[false, "cidades_brasil.json"], [true, "cidades_infinity.json"]]) {
  const gerado = T.cidadesEfetivasParaRepositorio(comUf);
  const real = JSON.parse(readFileSync(join(ROOT, arquivo), "utf8"));
  check(`overlay vazio ⇒ ${arquivo} gerado é idêntico ao do repositório`,
    JSON.stringify(gerado) === JSON.stringify(real), `linhas geradas ${gerado.length} × repositório ${real.length}`);
}
check("resumo de exportação vazio quando o overlay está limpo",
  T.resumoExportacaoRepositorio().nenhuma === true, JSON.stringify(T.resumoExportacaoRepositorio()));

// ── 12. Configurações sem consumidor (controle fantasma) ─────────────
// Toda chave de CONFIG_DEFS precisa ser LIDA em algum fluxo: a busca conta as
// ocorrências do literal no painel (1 = apenas a própria definição).
const panelSrc = readFileSync(join(ROOT, "admin", "panel.js"), "utf8");
const fantasmas = T.CONFIG_DEFS.filter((d) => (panelSrc.split('"' + d.key + '"').length - 1) < 2);
check("toda configuração é lida por algum fluxo (nenhum controle fantasma)",
  fantasmas.length === 0, fantasmas.map((d) => d.key).join(" | "));

// ── Relatório ─────────────────────────────────────────────────────────
console.log("\nAUDITORIA DO PAINEL × DADOS REAIS DO REPOSITÓRIO\n" + "═".repeat(58));
for (const l of linhas) console.log(`  ${l.ok ? "✅" : "❌"} ${l.titulo}${!l.ok && l.detalhe ? "\n       → " + l.detalhe : ""}`);
console.log("═".repeat(58));
console.log(falhas === 0
  ? `Resultado: ${linhas.length} verificações, nenhum falso positivo. ✅\n`
  : `Resultado: ${falhas} de ${linhas.length} verificações FALHARAM. ❌\n`);
process.exit(falhas === 0 ? 0 : 1);
