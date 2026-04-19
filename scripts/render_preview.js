// Gera o PDF de teste (scripts/gerar-ficha-preenchida.js) e rasteriza em PNG
// para o preview HTML do painel — sem duplicar a lógica de geração.
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const raiz = path.join(__dirname, "..");
const pdf = path.join(raiz, ".tmp_render", "output_preenchido.pdf");
const png = process.argv[2] || path.join(raiz, ".tmp_render", "preenchido.png");

execSync(`node "${path.join(__dirname, "gerar-ficha-preenchida.js")}" "${pdf}"`, { stdio: "inherit" });

const py = [
  "import pymupdf",
  `d = pymupdf.open(r'${pdf}')`,
  "pix = d[0].get_pixmap(dpi=144)",
  `pix.save(r'${png}')`,
  `print('PNG:', r'${png}', pix.width, 'x', pix.height)`,
].join("; ");
execSync(`python -c "${py}"`, { stdio: "inherit" });

const b64 = fs.readFileSync(png).toString("base64");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#555}img{width:100%;display:block}</style></head><body><img src="data:image/png;base64,${b64}"></body></html>`;
const hash = Math.random().toString(16).slice(2, 10);
const saidaHtml = path.join(raiz, ".tmp_render", `prev_${hash}.html`);
fs.writeFileSync(saidaHtml, html);
console.log("Preview:", saidaHtml);
