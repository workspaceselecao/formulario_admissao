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
import { execFileSync } from "node:child_process";

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
// O engine embarcado é carregado ANTES do painel (mesmo contrato do navegador,
// onde o <script> de /embedded-docs.js vem antes de /admin/panel.js). No REALM
// DO HOST via eval indireto: o pdf-lib valida objetos aninhados contra o
// `Object`/`Array` do próprio realm — no sandbox, todo addPage falha com NaN
// (mesmo cuidado documentado em MANUTENCAO.md para o Teste 19).
(0, eval)(readFileSync(join(ROOT, "embedded-docs.js"), "utf8"));
const ED = globalThis.EmbeddedDocs;
vm.runInContext(readFileSync(join(ROOT, "admin", "panel.js"), "utf8"), sb, { filename: "panel.js" });
sb.window.EmbeddedDocs = ED;

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
const gate = await T.coletarProblemas();
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

// ── 13. Gerador EMBARCADO × dados reais ───────────────────────────────
// O PDF embarcado só vale se o template declarativo reproduzir o formulário
// oficial (camadas completas) e se a escrita dos dados usar o MESMO perfil
// de texto do ficha_cadastral.html. Aqui a auditoria confere isso contra os
// arquivos do repositório — inclusive lendo as constantes de desenho do app
// público, para o perfil do engine não sair de sincronia com o código.
check("engine embarcado (/embedded-docs.js) carrega e expõe a API",
  !!ED && typeof ED.gerarPdf === "function" && typeof ED.validarTemplate === "function",
  ED ? Object.keys(ED).length + " chaves" : "ausente");
check("painel expõe o inventário embarcado (templateDir → schema)",
  Array.isArray(T.DN_FONTES) && T.DN_FONTES.length > 0 &&
  T.DN_FONTES.every((f) => existsSync(join(ROOT, f.schemaArquivo)) &&
    existsSync(join(ROOT, f.templateDir, "template.json")) &&
    existsSync(join(ROOT, f.pdfFile))),
  JSON.stringify((T.DN_FONTES || []).map((f) => f.templateDir)));
check("configurações de documentos declaradas no painel",
  T.CONFIG_DEFS.filter((d) => /^documentos\./.test(d.key)).length === 1,
  T.CONFIG_DEFS.filter((d) => /^documentos\./.test(d.key)).map((d) => d.key).join(" | "));

if (ED && pdfLib) {
  // 13.1 — o perfil de texto do engine espelha o código da aplicação
  const htmlFicha = readFileSync(join(ROOT, "ficha_cadastral.html"), "utf8");
  const fonteHtml = parseFloat((htmlFicha.match(/const PDF_FONT_TEXTO = ([\d.]+)/) || [])[1]);
  const offsetHtml = parseFloat((htmlFicha.match(/const OFFSET_Y_TEXTO_UMA_LINHA_PT = ([\d.]+)/) || [])[1]);
  const limiteHtml = parseFloat((htmlFicha.match(/const LIMITE_Y_SEM_OFFSET_TEXTO_PT = ([\d.]+)/) || [])[1]);
  const baselineHtml = (htmlFicha.match(/Math\.min\(h \* ([\d.]+), tamanhoFonte \* ([\d.]+)\)/) || []).slice(1).map(Number);
  check("perfil do engine espelha as constantes reais do ficha_cadastral.html",
    ED.PERFIL_APP.tamanho === fonteHtml &&
    ED.PERFIL_APP.offsetYUmaLinha === offsetHtml &&
    ED.PERFIL_APP.limiteYSemOffset === limiteHtml &&
    ED.PERFIL_APP.alturaFracao === baselineHtml[0] &&
    ED.PERFIL_APP.alturaTeto === baselineHtml[1],
    JSON.stringify({ engine: ED.PERFIL_APP, html: { fonteHtml, offsetHtml, limiteHtml, baselineHtml } }));

  // 13.2 — template do F-075: estrutura completa e válida (camadas do formulário)
  const schema = JSON.parse(readFileSync(join(ROOT, "ficha_cadastral_campos.json"), "utf8"));
  const template = JSON.parse(readFileSync(join(ROOT, "ficha-cadastral-embutido", "template.json"), "utf8"));
  const v = ED.validarTemplate(template, schema.campos);
  check("template embarcado do F-075 não tem erro crítico", v.ok === true, v.erros.slice(0, 4).join(" | "));
  check("template embarcado declara o mobiliário do formulário oficial (textos, imagens, marcações)",
    v.resumo && v.resumo.camadas.texts >= 200 && v.resumo.camadas.images === 9 && v.resumo.camadas.checkboxes === 17,
    JSON.stringify(v.resumo && v.resumo.camadas));
  check("template embarcado usa a página exata do documento oficial",
    Math.abs(v.resumo.pagina.width - 595.5) < 0.01 && Math.abs(v.resumo.pagina.height - 842.25) < 0.01,
    JSON.stringify(v.resumo.pagina));

  // 13.3 — fidelidade: baseline calculada pelo engine = fórmula do app público
  const folhas = ED.folhasComCoordenadas(schema.campos);
  check("schema real achatado com folhas suficientes", folhas.length >= 35, String(folhas.length));
  const divergentes = [];
  for (const f of folhas) {
    const c = f.coordenadas;
    const esperadoY = c.y + Math.min((c.altura || 0) * ED.PERFIL_APP.alturaFracao, ED.PERFIL_APP.tamanho * ED.PERFIL_APP.alturaTeto) -
      (c.y > ED.PERFIL_APP.limiteYSemOffset ? ED.PERFIL_APP.offsetYUmaLinha : 0);
    if (Math.abs(esperadoY - ED.baselinePdf(c, ED.PERFIL_APP.tamanho)) > 0.001) divergentes.push(f.path);
  }
  check("baseline do engine é idêntica à fórmula do PDF atual (campo a campo)",
    divergentes.length === 0, divergentes.slice(0, 5).join(" | "));

  // 13.4 — o PDF gerado é real, independente e determinístico
  const imagens = {};
  for (const img of template.images) {
    try { imagens[img.file] = new Uint8Array(readFileSync(join(ROOT, "ficha-cadastral-embutido", img.file))); } catch (e) { /* reportado no relatório */ }
  }
  const dados = {};
  dados[folhas[0].path] = "FULANO DE TAL";
  const g1 = await ED.gerarPdf(template, schema.campos, dados, pdfLib, { imagens }, {});
  const g2 = await ED.gerarPdf(template, schema.campos, dados, pdfLib, { imagens }, {});
  const gVazio = await ED.gerarPdf(template, schema.campos, {}, pdfLib, { imagens }, {});
  const buf1 = Buffer.from(g1.bytes);
  check("PDF embarcado gerado é um PDF de verdade", buf1.slice(0, 5).toString() === "%PDF-", buf1.slice(0, 5).toString());
  const carregado = await pdfLib.PDFDocument.load(g1.bytes);
  check("PDF embarcado tem as dimensões EXATAS do documento oficial",
    Math.abs(carregado.getPage(0).getWidth() - 595.5) < 0.01 && Math.abs(carregado.getPage(0).getHeight() - 842.25) < 0.01,
    carregado.getPage(0).getWidth() + "x" + carregado.getPage(0).getHeight());
  check("PDF embarcado é determinístico (mesma entrada ⇒ mesmos bytes)",
    Buffer.compare(Buffer.from(g2.bytes), buf1) === 0, "bytes diferentes");
  check("geração não inventa dado: sem dados, nenhum campo é desenhado",
    gVazio.desenhados === 0 && g1.desenhados === 1, JSON.stringify({ vazio: gVazio.desenhados, um: g1.desenhados }));
  check("todas as imagens do template foram embutidas (nenhuma faltando)",
    g1.relatorio.imagensFaltando.length === 0, JSON.stringify(g1.relatorio.imagensFaltando));

  // 13.5 — validação barra template quebrado (nada é inventado)
  const quebrado = Object.assign({}, template, { page: { width: null, height: null } });
  const vQuebrado = ED.validarTemplate(quebrado, schema.campos);
  check("template sem dimensão de página é barrado pela validação", vQuebrado.ok === false && vQuebrado.erros.length > 0,
    JSON.stringify(vQuebrado.erros.slice(0, 2)));

  // 13.6 — versionamento: template + assets são FONTE versionada (o painel consome via HTTP no deploy estático)
  const existeTemplateRepo = existsSync(join(ROOT, "ficha-cadastral-embutido", "template.json"));
  check("POC versionada: template.json existe no repositório", existeTemplateRepo,
    existeTemplateRepo ? "" : "rode extract_template.py ou restaure do git");
  const pngsFaltando = template.images.filter(img => !existsSync(join(ROOT, "ficha-cadastral-embutido", img.file))).map(img => img.file);
  check("POC versionada: todos os assets PNG do template existem no repositório", pngsFaltando.length === 0,
    pngsFaltando.length ? "faltando: " + pngsFaltando.join(", ") : template.images.length + " imagens OK");
  const gitignorePoc = readFileSync(join(ROOT, ".gitignore"), "utf8");
  check("template.json e assets/ não estão no .gitignore (fonte versionada, não artefato)",
    !/^ficha-cadastral-embutido\/template\.json$/m.test(gitignorePoc) && !/^ficha-cadastral-embutido\/assets\/\*\.png$/m.test(gitignorePoc) && !/^ficha-cadastral-embutido\/$/m.test(gitignorePoc),
    "regra indevida encontrada no .gitignore");
  let outputRastreado = "";
  try { outputRastreado = execFileSync("git", ["ls-files", "ficha-cadastral-embutido/output.pdf"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch (e) { /* git indisponível */ }
  check("output.pdf é artefato: ignorado pelo .gitignore e não rastreado pelo git",
    /^ficha-cadastral-embutido\/output\.pdf$/m.test(gitignorePoc) && outputRastreado === "",
    "regra ausente no .gitignore ou arquivo rastreado: " + outputRastreado);

  // 13.7 — nenhum identificador fantasma na seção DN do painel (bug real: dnAutor chamado sem definição)
  const panelCodigo = readFileSync(join(ROOT, "admin", "panel.js"), "utf8");
  const dnChamadas = new Set((panelCodigo.match(/\bdn[A-Z]\w*(?=\s*\()/g) || []));
  const dnDefinicoes = new Set((panelCodigo.match(/\b(?:function|const|let)\s+dn[A-Z]\w*/g) || []).map(m => m.replace(/^\s*(?:function|const|let)\s+/, "")));
  const dnFantasmas = [...dnChamadas].filter(n => !dnDefinicoes.has(n));
  check("seção Documentos Embarcados: toda função dn*() chamada no painel está definida",
    dnFantasmas.length === 0, dnFantasmas.length ? "sem definição: " + dnFantasmas.join(", ") : dnChamadas.size + " funções OK");

  // 13.8 — nenhum campo de texto do schema desenha por cima do rótulo do template
  // (bug real: "SOLTEIRO" impresso sobre "Estado Civil" — o x do valor coincidia com o início do rótulo)
  const metricasRotulo = {};
  for (const nome of ["Helvetica", "HelveticaBold"]) {
    const docT = await pdfLib.PDFDocument.create();
    metricasRotulo[nome] = await docT.embedFont(pdfLib.StandardFonts[nome]);
  }
  const larguraRotulo = (t) => {
    try { return metricasRotulo[(t.font || "Helvetica").replace("-", "")].widthOfTextAtSize(t.text, t.size); }
    catch (e) { return t.text.length * t.size * 0.55; }
  };
  const rotulosTemplate = template.texts
    .map((t) => ({ texto: t.text, x0: t.x, x1: t.x + larguraRotulo(t), y0: t.y, y1: t.y + t.size * 0.72 }))
    .filter((r) => /[^_\s/]/.test(r.texto)); // réguas (____/____) são linhas de escrita, não rótulos
  const camposTextoSchema = [];
  (function coletarTexto(no, prefix) {
    for (const [k, v] of Object.entries(no || {})) {
      if (!v || typeof v !== "object") continue;
      if (v.tipo === "texto" && v.coordenadas) camposTextoSchema.push({ path: prefix + k, c: v.coordenadas });
      if (v.campos) coletarTexto(v.campos, prefix + k + ".");
    }
  })(schema.campos, "");
  const colisoesRotulo = [];
  for (const f of camposTextoSchema) {
    const x = Number(f.c.x) || 0, y = Number(f.c.y) || 0;
    const h = Number(f.c.altura ?? f.c.height) || 12, w = Number(f.c.largura ?? f.c.width) || 200;
    const baseline = y + Math.min(h * 0.78, 9 * 1.12) - (y > 120 ? 9 : 0);
    const vX0 = x + 0.5, vX1 = x + 0.5 + w, vY0 = baseline - 2.2, vY1 = baseline + 6.6;
    for (const r of rotulosTemplate) {
      if (vX0 < r.x1 - 1 && vX1 > r.x0 + 1 && vY0 < r.y1 && vY1 > r.y0) colisoesRotulo.push(f.path + " × " + JSON.stringify(r.texto));
    }
  }
  check("schema: nenhum campo de texto desenha sobre o rótulo do template",
    colisoesRotulo.length === 0, colisoesRotulo.length ? colisoesRotulo.slice(0, 4).join(" | ") : camposTextoSchema.length + " campos OK");
}

// ── Relatório ─────────────────────────────────────────────────────────
console.log("\nAUDITORIA DO PAINEL × DADOS REAIS DO REPOSITÓRIO\n" + "═".repeat(58));
for (const l of linhas) console.log(`  ${l.ok ? "✅" : "❌"} ${l.titulo}${!l.ok && l.detalhe ? "\n       → " + l.detalhe : ""}`);
console.log("═".repeat(58));
console.log(falhas === 0
  ? `Resultado: ${linhas.length} verificações, nenhum falso positivo. ✅\n`
  : `Resultado: ${falhas} de ${linhas.length} verificações FALHARAM. ❌\n`);
process.exit(falhas === 0 ? 0 : 1);
