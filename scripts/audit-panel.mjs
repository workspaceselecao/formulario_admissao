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
import { webcrypto } from "node:crypto";

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
sb.window.crypto = webcrypto; // §42 — hash sha256 do documento
sb.globalThis = sb;
vm.createContext(sb);
// O engine nativo é carregado ANTES do painel: o painel fala com ele por
// `global.NativeDocs` (mesmo contrato do navegador, onde o <script> de
// /native-docs.js vem antes de /admin/panel.js).
vm.runInContext(readFileSync(join(ROOT, "native-docs.js"), "utf8"), sb, { filename: "native-docs.js" });
vm.runInContext(readFileSync(join(ROOT, "admin", "panel.js"), "utf8"), sb, { filename: "panel.js" });
const ND = sb.window.NativeDocs;

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

// ── 1.1 Linha de base do gerador nativo vem DO REPOSITÓRIO ────────────
// Sem isso o painel abriria "sem nenhum documento nativo" mesmo com a definição
// do F-075 versionada — e o mock de fetch falharia em silêncio.
const regF075 = st.overlay.docs_nativos.f075;
check("painel carrega o documento nativo do repositório como linha de base",
  !!regF075 && regF075.meta && regF075.meta.origemRepo === true && regF075.meta.alterado === false &&
    regF075.definicao && (regF075.definicao.elementos || []).length > 100,
  JSON.stringify({ tem: !!regF075, meta: regF075 && regF075.meta, n: regF075 && regF075.definicao && regF075.definicao.elementos.length }));
check("documento do repositório carregado NÃO entra como alteração pendente",
  T.calcularPendentes(T.exportarOverlayPuro(), {}).filter((p) => p.overlayKey === "docs_nativos").length === 0,
  JSON.stringify(T.calcularPendentes(T.exportarOverlayPuro(), {}).filter((p) => p.overlayKey === "docs_nativos").map((p) => p.chave)));

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
const PROPS_COORD = ["x", "y", "largura", "altura"];
for (const [key, arquivo] of [["ficha_cadastral", "ficha_cadastral_campos.json"], ["declaracao_plano_saude", "declaracao_plano_saude_campos.json"]]) {
  const gerado = T.docEfetivoParaRepositorio(key);
  const real = JSON.parse(readFileSync(join(ROOT, arquivo), "utf8"));
  check(`overlay vazio ⇒ ${arquivo} gerado é idêntico ao do repositório`,
    JSON.stringify(gerado) === JSON.stringify(real), "o JSON gerado divergiu do arquivo do repositório");
  // O patch do overlay carrega metadados do painel (ex.: `label`); eles NÃO
  // podem vazar para `coordenadas` do schema do repositório.
  const extras = [];
  (function walk(n, p) {
    if (!n || typeof n !== "object") return;
    if (n.coordenadas && typeof n.coordenadas === "object") {
      for (const k of Object.keys(n.coordenadas)) if (PROPS_COORD.indexOf(k) === -1) extras.push(p + ".coordenadas." + k);
    }
    for (const k of Object.keys(n)) walk(n[k], p ? p + "." + k : k);
  })(gerado.campos, "campos");
  check(`${arquivo} gerado não leva metadados do painel para coordenadas`, extras.length === 0, extras.slice(0, 5).join(" | "));
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

// ── 13. Gerador nativo de PDFs × dados reais ──────────────────────────
// O gerador só vale se a definição criada do schema REAL reproduzir a
// geometria do PDF atual e se o PDF gerado for de fato independente. Aqui a
// auditoria confere isso contra os arquivos do repositório — inclusive lendo as
// constantes de desenho do ficha_cadastral.html, para o perfil do engine não
// sair de sincronia com o código que gera o PDF hoje.
check("engine nativo (/native-docs.js) carrega e expõe a API", !!ND && typeof ND.renderizarPdf === "function" && typeof ND.definicaoDeSchema === "function",
  ND ? Object.keys(ND).length + " chaves" : "ausente");
check("painel expõe o inventário nativo (schema → template)",
  Array.isArray(T.NATIVOS_FONTES) && T.NATIVOS_FONTES.length > 0 &&
  T.NATIVOS_FONTES.every((f) => existsSync(join(ROOT, f.schemaArquivo)) && existsSync(join(ROOT, f.pdfFile))),
  JSON.stringify((T.NATIVOS_FONTES || []).map((f) => f.schemaArquivo)));
check("assets declarados para o gerador existem no repositório",
  (T.ASSETS_REPO || []).every((a) => existsSync(join(ROOT, a))),
  (T.ASSETS_REPO || []).filter((a) => !existsSync(join(ROOT, a))).join(" | "));
check("configurações do gerador declaradas no painel",
  T.CONFIG_DEFS.filter((d) => /^documentos\./.test(d.key)).length === 3,
  T.CONFIG_DEFS.filter((d) => /^documentos\./.test(d.key)).map((d) => d.key).join(" | "));

if (ND && pdfLib) {
  // 13.1 — perfil de fidelidade ainda espelha o código da aplicação
  const htmlFicha = readFileSync(join(ROOT, "ficha_cadastral.html"), "utf8");
  const fonteHtml = parseFloat((htmlFicha.match(/const PDF_FONT_TEXTO = ([\d.]+)/) || [])[1]);
  const offsetHtml = parseFloat((htmlFicha.match(/const OFFSET_Y_TEXTO_UMA_LINHA_PT = ([\d.]+)/) || [])[1]);
  const limiteHtml = parseFloat((htmlFicha.match(/const LIMITE_Y_SEM_OFFSET_TEXTO_PT = ([\d.]+)/) || [])[1]);
  const baselineHtml = (htmlFicha.match(/Math\.min\(h \* ([\d.]+), tamanhoFonte \* ([\d.]+)\)/) || []).slice(1).map(Number);
  check("perfil do engine espelha as constantes reais do ficha_cadastral.html (§8)",
    ND.PERFIL_APP.fontSize === fonteHtml &&
    ND.PERFIL_APP.offsetYLinha === offsetHtml &&
    ND.PERFIL_APP.limiteYsemOffset === limiteHtml &&
    ND.PERFIL_APP.baselineAltura === baselineHtml[0] &&
    ND.PERFIL_APP.baselineFonte === baselineHtml[1],
    JSON.stringify({ engine: ND.PERFIL_APP, html: { fonteHtml, offsetHtml, limiteHtml, baselineHtml } }));

  // 13.2 — bootstrap do schema real preserva a geometria existente
  const schema = JSON.parse(readFileSync(join(ROOT, "ficha_cadastral_campos.json"), "utf8"));
  const template = await pdfLib.PDFDocument.load(readFileSync(join(ROOT, "F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf")));
  const pag = template.getPage(0);
  const size = { width: pag.getWidth(), height: pag.getHeight() };
  const def = ND.definicaoDeSchema(schema, { documentId: "f075", width: size.width, height: size.height, autor: "auditoria" });
  const folhas = ND.folhasComCoordenadas(schema.campos, "");
  check("bootstrap cria 1 elemento nativo por campo com coordenadas do schema real",
    def.elementos.length === folhas.length && folhas.length >= 35,
    "definicao=" + def.elementos.length + " schema=" + folhas.length);
  const vDef = ND.validarDefinicao(def);
  check("definição criada do schema real não tem erro crítico (§31)", vDef.erros.length === 0, vDef.erros.slice(0, 4).join(" | "));
  check("definição criada do schema real não tem coordenada fora da página",
    vDef.avisos.filter((a) => a.indexOf("fora da página") !== -1 || a.indexOf("cortado") !== -1).length === 0,
    vDef.avisos.filter((a) => a.indexOf("fora da página") !== -1 || a.indexOf("cortado") !== -1).slice(0, 4).join(" | "));
  check("definição nasce marcada como REQUER CALIBRAÇÃO (honestidade §52)",
    vDef.avisos.some((a) => a.indexOf("REQUER CALIBRAÇÃO") !== -1), "sem marcação");

  // 13.3 — fidelidade campo a campo (x e baseline) contra a regra da aplicação
  const divergentes = [];
  for (const f of folhas) {
    const c = f.no.coordenadas;
    const el = def.elementos.filter((e) => e.chaveSchema === f.path)[0];
    const esperadoY = c.y + Math.min((c.altura || 0) * ND.PERFIL_APP.baselineAltura, ND.PERFIL_APP.fontSize * ND.PERFIL_APP.baselineFonte) -
      (c.y > ND.PERFIL_APP.limiteYsemOffset ? ND.PERFIL_APP.offsetYLinha : 0);
    const meuY = size.height - ND.baselineTopo(el);
    if (Math.abs(esperadoY - meuY) > 0.001 || Math.abs((c.x + ND.PERFIL_APP.offsetX) - (el.x + el.offsetX)) > 0.001) {
      divergentes.push(f.path + " (y " + esperadoY + " vs " + meuY + ")");
    }
  }
  check("todo campo do schema real sai com a MESMA baseline e o MESMO x do PDF atual",
    divergentes.length === 0, divergentes.slice(0, 5).join(" | "));

  // 13.4 — o PDF gerado é real, independente e determinístico
  const dados = {};
  dados[def.elementos[0].binding] = "FULANO DE TAL";
  const g1 = await ND.renderizarPdf(def, dados, pdfLib, { imagens: {} }, {});
  const g2 = await ND.renderizarPdf(def, dados, pdfLib, { imagens: {} }, {});
  const gVazio = await ND.renderizarPdf(def, {}, pdfLib, { imagens: {} }, {});
  const buf1 = Buffer.from(g1.bytes);
  check("PDF nativo gerado é um PDF de verdade", buf1.slice(0, 5).toString() === "%PDF-", buf1.slice(0, 5).toString());
  const carregado = await pdfLib.PDFDocument.load(g1.bytes);
  check("PDF nativo tem as dimensões EXATAS do template oficial (§6/§31)",
    Math.abs(carregado.getPage(0).getWidth() - size.width) < 0.01 && Math.abs(carregado.getPage(0).getHeight() - size.height) < 0.01,
    carregado.getPage(0).getWidth() + "x" + carregado.getPage(0).getHeight() + " (template " + size.width + "x" + size.height + ")");
  check("PDF nativo independe da contagem de páginas do template externo",
    carregado.getPageCount() === ND.paginasDaDefinicao(def).length, String(carregado.getPageCount()));
  check("PDF nativo é determinístico (mesma entrada ⇒ mesmos bytes)",
    Buffer.compare(Buffer.from(g2.bytes), buf1) === 0, "bytes diferentes");
  check("geração não inventa dado: sem dados, nenhum campo é desenhado",
    gVazio.desenhados === 0 && g1.desenhados === 1, JSON.stringify({ vazio: gVazio.desenhados, um: g1.desenhados }));

  // 13.5 — F-089 (declaração, página 2) também bootstrapa sem erro
  const schemaDecl = JSON.parse(readFileSync(join(ROOT, "declaracao_plano_saude_campos.json"), "utf8"));
  const decl = await pdfLib.PDFDocument.load(readFileSync(join(ROOT, "DECLARACAO PLANO DE SAUDE.pdf")));
  const defDecl = ND.definicaoDeSchema(schemaDecl, { documentId: "f089", width: decl.getPage(0).getWidth(), height: decl.getPage(0).getHeight(), autor: "auditoria" });
  const vDecl = ND.validarDefinicao(defDecl);
  check("declaração (F-089) bootstrapa do schema real sem erro crítico",
    defDecl.elementos.length > 0 && vDecl.erros.length === 0, JSON.stringify({ n: defDecl.elementos.length, erros: vDecl.erros.slice(0, 3) }));
  check("campos da declaração ficam na página 2 (como no schema real)",
    defDecl.elementos.some((e) => e.page === 2) && ND.paginasDaDefinicao(defDecl).length >= 1,
    JSON.stringify(defDecl.elementos.map((e) => e.page).slice(0, 6)));

  // 13.6 — F-075 RECONSTRUÍDO: mobiliário do formulário oficial medido contra a
  // referência congelada. É o aceite da reconstrução (§27.2/§27.3).
  const refPath = join(ROOT, "scripts", "referencia", "f075-pagina1.json");
  const natPath = join(ROOT, "ficha_cadastral_nativo.json");
  if (existsSync(refPath) && existsSync(natPath)) {
    const snap = JSON.parse(readFileSync(refPath, "utf8"));
    const defNat = JSON.parse(readFileSync(natPath, "utf8"));
    const rel = ND.compararComReferencia(defNat, snap, { tolerancia: 1 });
    check("referência do F-075 veio do PDF oficial e declara o arquivo de origem",
      snap.formato === "referencia-pdf/1" && /F-075/.test(String(snap.arquivo || "")) && existsSync(join(ROOT, String(snap.arquivo || ""))),
      JSON.stringify({ formato: snap.formato, arquivo: snap.arquivo }));
    check("referência tem o mobiliário completo (textos, réguas/caixas e imagens)",
      snap.textos.length >= 100 && snap.regras.length >= 10 && snap.imagens.length === 9,
      JSON.stringify({ textos: snap.textos.length, regras: snap.regras.length, imagens: snap.imagens.length }));
    check("documento nativo do F-075 cobre TODOS os itens da referência (nenhum sem par)",
      rel.semPar === 0 && rel.casados === snap.textos.length + snap.regras.length + snap.imagens.length, rel.resumo);
    check("deslocamento do F-075 reconstruído está dentro da tolerância (≤ 1 pt)",
      rel.dentro === true && rel.maxDx <= 1 && rel.maxDy <= 1, rel.resumo);
    check("mobiliário fica SEMPRE atrás dos campos dinâmicos (camadas §20)",
      defNat.elementos.filter((e) => e.origem === "importado").every((e) => (Number(e.zIndex) || 0) < 100) &&
        defNat.elementos.filter((e) => e.origem === "schema").every((e) => (Number(e.zIndex) || 0) >= 100),
      JSON.stringify(defNat.elementos.filter((e) => e.origem === "importado").map((e) => e.zIndex).slice(0, 5)));
    check("imagens do mobiliário existem na raiz (a geração não depende do PDF)",
      (defNat.assets || []).length === 9 && (defNat.assets || []).every((a) => existsSync(join(ROOT, a.arquivo))),
      JSON.stringify((defNat.assets || []).map((a) => a.arquivo)));
    check("documento nativo do repositório não sai como pendente de calibração",
      defNat.metadados && defNat.metadados.pendenteCalibracao === false && defNat.metadados.referencia && defNat.metadados.referencia.itensSemPar === 0,
      JSON.stringify(defNat.metadados && defNat.metadados.referencia));

    // 13.7 — TIPOGRAFIA OFICIAL POR RUN (§15.1): a definição carrega a fonte que o
    // DOCUMENTO EDITÁVEL declara por run, não só o subconjunto que o PDF embutiu.
    // Aqui a conferência é recalculada do artefato — se o gerador parar de anotar
    // alguma família, esta verificação acusa.
    const tipPath = join(ROOT, "scripts", "referencia", "f075-tipografia.json");
    if (existsSync(tipPath)) {
      const tip = JSON.parse(readFileSync(tipPath, "utf8"));
      const chave = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const paragrafos = (tip.paragrafos || []).map((p) => Object.assign({}, p, { k: chave(p.texto) }));
      const oficialDe = (texto) => {
        const c = chave(texto);
        if (c.length < 3) return null;
        return paragrafos.find((x) => x.k === c) || paragrafos.find((x) => x.k.indexOf(c) >= 0) ||
          paragrafos.filter((x) => x.k.length >= 4 && c.indexOf(x.k) >= 0).sort((a, b) => b.k.length - a.k.length)[0] || null;
      };
      const textos = defNat.elementos.filter((e) => e.type === "text");
      const comPar = textos.filter((e) => !!oficialDe(e.content));
      check("tipografia oficial: todo bloco com par no documento editável declara a família",
        comPar.length >= 70 && comPar.every((e) => e.fonteOficial && e.tipografiaOficial && e.tipografiaOficial.familia === e.fonteOficial),
        comPar.length + " de " + textos.length + " bloco(s)");
      const familiasDeclaradas = [...new Set(comPar.map((e) => e.fonteOficial))];
      check("tipografia oficial: toda família declarada é reconhecida pelo engine (nada de chute)",
        familiasDeclaradas.every((f) => !!ND.chaveOficial(f)),
        JSON.stringify(familiasDeclaradas));
      check("tipografia oficial: cada caixa de marcação corresponde a um run simbólico (1:1)",
        (tip.runs || []).filter((r) => r.simbolica).length === defNat.elementos.filter((e) => e.type === "checkbox").length,
        JSON.stringify({ runs: (tip.runs || []).filter((r) => r.simbolica).length, caixas: defNat.elementos.filter((e) => e.type === "checkbox").length }));
      const metaTip = defNat.metadados && defNat.metadados.tipografiaOficial;
      check("tipografia oficial: substituições (Arial Narrow) ficam declaradas com o desvio medido",
        !!metaTip && (metaTip.substituicoes || []).some((s) => /narrow/i.test(s.pedida) && s.desvio > 0.15),
        JSON.stringify(metaTip && metaTip.substituicoes));
      // As divergências registradas precisam ser REAIS: cada uma tem de
      // corresponder a um elemento que existe na definição.
      const ids = (metaTip && metaTip.divergencias || []).map((d) => String(d).split(":")[0]);
      check("tipografia oficial: divergências documento × PDF apontam elementos reais",
        ids.length > 0 && ids.every((id) => defNat.elementos.some((e) => e.id === id)),
        JSON.stringify(ids.slice(0, 3)) + " de " + ids.length);
    } else {
      check("tipografia oficial do F-075 presente no repositório", false, tipPath);
    }
  } else {
    check("reconstrução do F-075 presente no repositório (referência + definição)", false, refPath + " / " + natPath);
  }
}

// ── Relatório ─────────────────────────────────────────────────────────
console.log("\nAUDITORIA DO PAINEL × DADOS REAIS DO REPOSITÓRIO\n" + "═".repeat(58));
for (const l of linhas) console.log(`  ${l.ok ? "✅" : "❌"} ${l.titulo}${!l.ok && l.detalhe ? "\n       → " + l.detalhe : ""}`);
console.log("═".repeat(58));
console.log(falhas === 0
  ? `Resultado: ${linhas.length} verificações, nenhum falso positivo. ✅\n`
  : `Resultado: ${falhas} de ${linhas.length} verificações FALHARAM. ❌\n`);
process.exit(falhas === 0 ? 0 : 1);
