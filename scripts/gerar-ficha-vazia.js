/**
 * Gera o PDF VAZIO da Ficha Cadastral (F-075) pela engine embarcada —
 * só o template, sem nenhum dado. É a referência de fidelidade: o diff contra
 * o PDF oficial mede quanto o template sozinho reproduz o documento.
 *
 * Uso: node scripts/gerar-ficha-vazia.js [saida.pdf]
 * Saída padrão: ficha-cadastral-embutido/output.pdf
 */
"use strict";

const fs = require("fs");
const path = require("path");
const PDFLib = require("pdf-lib");
const fontkit = require("../ficha-cadastral-embutido/node_modules/@pdf-lib/fontkit");
const EmbeddedDocs = require("../embedded-docs.js");

const dir = path.join(__dirname, "..", "ficha-cadastral-embutido");
const saida = process.argv[2] || path.join(dir, "output.pdf");

const template = JSON.parse(fs.readFileSync(path.join(dir, "template.json"), "utf-8"));

const imagens = {};
for (const img of template.images || []) {
  const p = path.join(dir, img.file);
  if (fs.existsSync(p)) imagens[img.file] = new Uint8Array(fs.readFileSync(p));
}
const fontes = {};
const listaFontes = Object.keys(template.fontes || {}).map((n) => template.fontes[n].arquivo)
  .concat(template.fonteCheckbox && template.fonteCheckbox.arquivo ? [template.fonteCheckbox.arquivo] : []);
for (const arq of listaFontes) {
  const p = path.join(dir, arq);
  if (fs.existsSync(p)) fontes[arq] = new Uint8Array(fs.readFileSync(p));
}

(async function () {
  const r = await EmbeddedDocs.gerarPdf(template, null, {}, PDFLib, { imagens, fontes }, { autor: "template" });
  fs.writeFileSync(saida, Buffer.from(r.bytes));
  console.log("Gerado: " + saida + " (" + r.bytes.length + " bytes)");
  console.log("Textos: " + ((r.relatorio && r.relatorio.textosDesenhados) || (template.texts || []).length) +
    " · imagens: " + (template.images || []).length + " · checkboxes: " + (template.checkboxes || []).length);
})();
