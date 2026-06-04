import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_H = 842;
/** Campos na zona inferior (assinatura) já estão em coordenadas pdf-lib. */
const THRESHOLD_Y = 100;

function convY(y, h) {
  return y <= THRESHOLD_Y ? y : PAGE_H - y - (h || 0);
}

function patchCoord(c) {
  if (!c || typeof c.y !== "number") return;
  const h = c.altura ?? c.height ?? 12;
  c.y = convY(c.y, h);
}

function walk(o) {
  if (!o || typeof o !== "object") return;
  patchCoord(o.coordenadas);
  if (o.segmentos) {
    for (const s of Object.values(o.segmentos)) patchCoord(s?.coordenadas);
  }
  if (o.opcoes) {
    for (const op of Object.values(o.opcoes)) patchCoord(op?.coordenadas);
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") walk(v);
  }
}

const jsonPath = path.join(root, "ficha_cadastral_campos.json");
const j = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
walk(j.campos);
j.metadados = {
  ...j.metadados,
  sistema_coordenadas: "PDF points (pt)",
  origem: "canto_inferior_esquerdo",
  nota: "Coordenadas y no JSON já em origem pdf-lib (canto inferior esquerdo). Medições novas no .txt vêm do topo; converter com este script antes de gravar no JSON.",
  largura_pagina_pt: 596,
  altura_pagina_pt: PAGE_H,
  versao_json: j.metadados?.versao_json ?? "1.0"
};
fs.writeFileSync(jsonPath, `${JSON.stringify(j, null, 2)}\n`);

const txtPath = path.join(root, "coordenadasficha.txt");
const out = fs.readFileSync(txtPath, "utf8").split(/\r?\n/).map((line) => {
  if (!line.trim() || line.startsWith("Page size")) return "Page size: 596 x 842 pt";
  const i = line.indexOf('{"page"');
  if (i < 0) return line;
  const label = line.slice(0, i);
  const box = JSON.parse(line.slice(i));
  const ny = convY(box.y, box.height);
  return `${label}${JSON.stringify({ ...box, y: ny })}`;
});
fs.writeFileSync(txtPath, `${out.join("\n")}\n`);

console.log("nome y (pdf-lib):", j.campos.dados_pessoais.campos.nome.coordenadas.y);
console.log("assinatura rubrica y:", j.campos.assinatura.campos.rubrica.coordenadas.y);
