#!/usr/bin/env node

/**
 * ============================================================
 * TIPOGRAFIA OFICIAL DO F-075 (por run, do documento editável)
 * ============================================================
 *
 * Por que existe: o documento nativo do F-075 reconstrói o formulário a partir
 * da geometria do PDF oficial (`scripts/referencia/f075-pagina1.json`), mas o
 * PDF **não diz** qual fonte o formulário usa de verdade — o conversor que gerou
 * o PDF trocou/substituiu fontes e o pdf.js só reporta o nome do subconjunto
 * embutido. O arquivo editável (o .docx que a área de formulários mantém) traz a
 * declaração RUN A RUN: família (Arial, Arial Narrow, Wingdings), tamanho em
 * meio-pontos e negrito.
 *
 * Este script lê esse .docx e grava `scripts/referencia/f075-tipografia.json`,
 * que é o artefato VERSIONADO. O .docx original não entra no repositório (é
 * documento da empresa, com fonte licenciada) — para regerar, aponte o caminho:
 *
 *   node scripts/extrair-tipografia-f075.mjs "E:/Atento/FORMULARIOS/F-075_38 (PR-011) Ficha Cadastral para Admissão....docx"
 *
 * ZIP lido sem dependência (só zlib), para funcionar em qualquer máquina.
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

const ROOT = join(import.meta.dirname, "..");
const SAIDA = join(ROOT, "scripts", "referencia", "f075-tipografia.json");
// Caminho padrão: onde o documento oficial vive na estação da área de formulários.
const PADRAO = "E:/Atento/FORMULARIOS/F-075_38 (PR-011) Ficha Cadastral para Admissão....docx";

/** Lê uma entrada de um ZIP (stored ou deflate) — sem dependência externa. */
function lerDoZip(buf, nome) {
  // Diretório central (EOCD → entradas)
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("ZIP inválido (sem EOCD)");
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(off + 10);
    const tamCompactado = buf.readUInt32LE(off + 20);
    const tamNome = buf.readUInt16LE(off + 28);
    const tamExtra = buf.readUInt16LE(off + 30);
    const tamComentario = buf.readUInt16LE(off + 32);
    const inicioLocal = buf.readUInt32LE(off + 42);
    const caminho = buf.toString("utf8", off + 46, off + 46 + tamNome);
    if (caminho === nome) {
      const nomeLocal = buf.readUInt16LE(inicioLocal + 26);
      const extraLocal = buf.readUInt16LE(inicioLocal + 28);
      const ini = inicioLocal + 30 + nomeLocal + extraLocal;
      const dados = buf.subarray(ini, ini + tamCompactado);
      if (metodo === 0) return dados.toString("utf8");
      if (metodo === 8) return zlib.inflateRawSync(dados).toString("utf8");
      throw new Error("método de compressão não suportado: " + metodo);
    }
    off += 46 + tamNome + tamExtra + tamComentario;
  }
  throw new Error("entrada não encontrada no ZIP: " + nome);
}

const attr = (tag, nome) => {
  const m = (tag || "").match(new RegExp("w:" + nome + '="([^"]+)"'));
  return m ? m[1] : null;
};
const decodificar = (s) => String(s || "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const normalizar = (s) => decodificar(s).replace(/\s+/g, " ").trim();

/** Parágrafos → runs com família, tamanho (pt), negrito, itálico e símbolo. */
function extrairRuns(xml) {
  const runs = [];
  const paragrafos = [];
  // Parágrafos primeiro: o formulário quebra um rótulo em vários runs, e é o
  // TEXTO DA LINHA (não o pedaço) que casa com os blocos medidos no PDF.
  for (const mp of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const inicio = runs.length;
    for (const m of mp[1].matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
      const run = m[1];
      const texto = [...run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join("");
      const bruto = normalizar(texto);
      if (!bruto) continue;
      const rPr = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
      const rFonts = (rPr.match(/<w:rFonts[^>]*>/) || [""])[0];
      const sz = (rPr.match(/<w:sz\b[^>]*>/) || [""])[0];
      const familia = attr(rFonts, "hAnsi") || attr(rFonts, "ascii") || attr(rFonts, "cs") || null;
      runs.push({
        texto: bruto,
        textoCru: decodificar(texto),
        familia: familia,
        tamanho: sz ? Number(attr(sz, "val")) / 2 : null,
        negrito: /<w:b\b(?![^>]*w:val="(?:0|false)")/.test(rPr),
        italico: /<w:i\b(?![^>]*w:val="(?:0|false)")/.test(rPr),
        simbolica: /^wingdings$/i.test(String(familia || "").replace(/\s/g, "")) || /symbol|dingbat/i.test(String(familia || "")),
        cor: attr((rPr.match(/<w:color\b[^>]*>/) || [""])[0], "val") ? "#" + attr((rPr.match(/<w:color\b[^>]*>/) || [""])[0], "val") : null
      });
    }
    const meus = runs.slice(inicio);
    if (!meus.length) continue;
    // Runs do Word são CONTÍGUOS: juntar com espaço inventa separação ("Data d a
    // publicação"). O espaço que existe está dentro do próprio run.
    const textoLinha = meus.map((r) => (r.simbolica ? "❑" : r.textoCru)).join("").replace(/\s+/g, " ").trim();
    const conta = {};
    for (const r of meus) {
      const k = r.familia || "(sem rFonts)";
      conta[k] = (conta[k] || 0) + r.texto.length;
    }
    const dominante = Object.entries(conta).sort((a, b) => b[1] - a[1])[0][0];
    const comUns = meus.filter((r) => (r.familia || "(sem rFonts)") === dominante);
    paragrafos.push({
      texto: textoLinha,
      familia: dominante,
      tamanho: comUns[0].tamanho,
      negrito: comUns.some((r) => r.negrito),
      simbolica: meus.every((r) => r.simbolica),
      nRuns: meus.length,
      familias: Object.keys(conta)
    });
  }
  return { runs: runs, paragrafos: paragrafos };
}

/** Versão antiga (lista de runs) mantida para o resumo — ver extrairRuns acima. */
function extrairRunsAntigo(xml) {
  const runs = [];
  for (const m of xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
    const run = m[1];
    const texto = [...run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]).join("");
    const bruto = normalizar(texto);
    if (!bruto) continue;
    const rPr = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
    const rFonts = (rPr.match(/<w:rFonts[^>]*>/) || [""])[0];
    const sz = (rPr.match(/<w:sz\b[^>]*>/) || [""])[0];
    const familia = attr(rFonts, "hAnsi") || attr(rFonts, "ascii") || attr(rFonts, "cs") || null;
    runs.push({
      texto: bruto,
      familia: familia,
      tamanho: sz ? Number(attr(sz, "val")) / 2 : null,
      negrito: /<w:b\b(?![^>]*w:val="(?:0|false)")/.test(rPr),
      italico: /<w:i\b(?![^>]*w:val="(?:0|false)")/.test(rPr),
      simbolica: /^wingdings$/i.test(String(familia || "").replace(/\s/g, "")) || /symbol|dingbat/i.test(String(familia || "")),
      cor: attr((rPr.match(/<w:color\b[^>]*>/) || [""])[0], "val") ? "#" + attr((rPr.match(/<w:color\b[^>]*>/) || [""])[0], "val") : null
    });
  }
  return runs;
}

function main() {
  const caminho = process.argv[2] || PADRAO;
  const buf = readFileSync(caminho);
  const xml = lerDoZip(buf, "word/document.xml");
  const todos = extrairRuns(xml);
  const runs = todos.runs;
  const paragrafos = todos.paragrafos;

  // Resumo por família: caractere conta como 1 (é o que se mede em largura depois)
  const resumo = {};
  for (const r of runs) {
    const chave = (r.familia || "(sem rFonts)") + " " + (r.tamanho || "?") + "pt" + (r.negrito ? " negrito" : "");
    resumo[chave] = (resumo[chave] || 0) + r.texto.length;
  }
  const porFamilia = {};
  for (const r of runs) {
    const f = r.familia || "(sem rFonts)";
    porFamilia[f] = (porFamilia[f] || 0) + r.texto.length;
  }
  const simbolicos = runs.filter((r) => r.simbolica);

  const saida = {
    formato: "tipografia-oficial/1",
    arquivo: caminho.split(/[\\/]/).pop(),
    bytes: statSync(caminho).size,
    extraidoEm: "2026-09-25T12:00:00.000Z",
    runs: runs,
    paragrafos: paragrafos,
    resumo: { porFamilia: porFamilia, porFonteTamanho: resumo, nRuns: runs.length, nSimbolicos: simbolicos.length, nParagrafos: paragrafos.length },
    nota:
      "Tipografia declarada no documento editável (run a run). O PDF oficial pode ter sofrido " +
      "substituição de fonte na conversão — por isso o comparador mede a largura real e o engine " +
      "reporta qualquer substituição (§15.1) em vez de aceitar a declaração sem conferir."
  };
  writeFileSync(SAIDA, JSON.stringify(saida, null, 2) + "\n");
  console.log("Documento: " + saida.arquivo + " (" + Math.round(saida.bytes / 1024) + " KB)");
  console.log("Runs com texto: " + runs.length + " · parágrafos: " + paragrafos.length + " · runs simbólicos (Wingdings): " + simbolicos.length);
  Object.entries(porFamilia).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log("  " + f + ": " + n + " car."));
  const tamanhos = {};
  for (const r of runs) {
    const k = (r.tamanho || "?") + "pt" + (r.negrito ? " negrito" : "");
    tamanhos[k] = (tamanhos[k] || 0) + 1;
  }
  console.log("Tamanhos: " + Object.entries(tamanhos).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => k + " ×" + n).join(" · "));
  if (simbolicos.length) {
    const codigos = [...new Set(simbolicos.map((r) => r.texto))];
    console.log("Glifos simbólicos: " + codigos.map((c) => '"' + c + '" (U+' + c.codePointAt(0).toString(16).toUpperCase() + ")").join(", "));
  }
  console.log("Gravado: scripts/referencia/f075-tipografia.json (" + Math.round(statSync(SAIDA).size / 1024) + " KB)");
}

main();
