/**
 * ============================================================
 * GERAR-FONTES-COMPRIMIDAS — subsets TTF compactos para a engine
 * ============================================================
 *
 * A engine embarcada (embedded-docs.js / ficha_cadastral.html) embute as
 * fontes TTF completas no PDF gerado, o que produzia arquivos de ~2,6 MB
 * (arial 1 MB + arialbd 1 MB + seguisym 2,5 MB). Este script regenera as
 * versões SUBSETADAS (`*-sub.ttf`) mantendo apenas os glifos realmente
 * usados — reduzindo a base de fontes de ~5,1 MB para ~78 KB e o PDF
 * final para centenas de KB.
 *
 * Uso: node scripts/gerar-fontes-comprimidas.js
 *
 * Os conjuntos de glifos são:
 *  - Segoe UI Symbol (fonteCheckbox): SOMENTE U+2751 (❑, quadrado com
 *    sombra das checkboxes). Qualquer outro glifo cai no fallback vetorial.
 *  - Arial/Arial Bold/Arial Narrow/Arial Narrow Bold: ASCII imprimível +
 *    acentos PT-BR + números/percentuais/pontuação típica dos valores.
 *
 * Requer: fonteditor-core (devDependency). Nuance: o `subset` FAZ PARTE
 * do Font.create (não do write) — é ele que filtra os glifos na leitura.
 * Os arquivos `*sub` são a fonte de verdade em runtime; os originais de
 * 1–2,5 MB continuam no repo apenas para regeneração.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { Font } = require("fonteditor-core");

const ASSETS = path.join(__dirname, "..", "ficha-cadastral-embutido", "assets");

// Glifos usados pela ficha: ASCII imprimível + acentuação PT-BR + símbolos
// de valores monetários (–, •, ª, º, °, aspas curvas, reticências).
const GLIFOS_ARIAL = (() => {
  const cps = [];
  for (let cp = 32; cp <= 126; cp++) cps.push(cp);
  for (const c of "ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúçªº°–—•0123456789’.“”„…") cps.push(c.codePointAt(0));
  cps.push(0x2751); // glifo das checkboxes (caso alguma fonte herde a caixinha)
  cps.push(0x2022); // bullet
  return [...new Set(cps)];
})();

// Segoe UI Symbol embute apenas o glifo das checkboxes (U+2751).
const GLIFOS_SEGOE = [0x2751];

const MAPA = [
  { origem: "arial.ttf", destino: "arial-sub.ttf", glifos: GLIFOS_ARIAL },
  { origem: "arialbd.ttf", destino: "arialbd-sub.ttf", glifos: GLIFOS_ARIAL },
  { origem: "ARIALN.ttf", destino: "arialn-sub.ttf", glifos: GLIFOS_ARIAL },
  { origem: "ARIALNB.ttf", destino: "arialnb-sub.ttf", glifos: GLIFOS_ARIAL },
  { origem: "seguisym.ttf", destino: "seguisym-sub.ttf", glifos: GLIFOS_SEGOE },
];

for (const { origem, destino, glifos } of MAPA) {
  const caminhoOrigem = path.join(ASSETS, origem);
  if (!fs.existsSync(caminhoOrigem)) {
    console.error("Fonte original ausente:", origem, "— regeneração interrompida.");
    process.exit(1);
  }
  const bytes = fs.readFileSync(caminhoOrigem);
  // `subset` no Font.create: filtra os glifos na LEITURA (não no write).
  const font = Font.create(bytes, { type: "ttf", subset: glifos, hinting: false });
  const out = font.write({ type: "ttf", hinting: false });
  const antes = bytes.length;
  const depois = out.length;
  fs.writeFileSync(path.join(ASSETS, destino), Buffer.from(out));
  console.log(`${origem} → ${destino}: ${(antes / 1024).toFixed(0)} KB → ${(depois / 1024).toFixed(1)} KB`);
}

console.log("Subsets gerados em ficha-cadastral-embutido/assets/*-sub.ttf.");
