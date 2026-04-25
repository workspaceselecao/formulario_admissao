/**
 * Gera municipios_cidades_ficha_por_uf.json: por UF, nomes oficiais (Brasil API)
 * das cidades que constam em cidades_brasil.json.
 * Uso: node scripts/gerar-municipios-cidades-ficha-por-uf.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function normalizarChaveCidade(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

const UFs = [
  "RO", "AC", "AM", "RR", "PA", "AP", "TO", "MA", "PI", "CE", "RN", "PB", "PE", "AL", "SE",
  "BA", "MG", "ES", "RJ", "SP", "PR", "SC", "RS", "MS", "MT", "GO", "DF",
];

const cidades = JSON.parse(fs.readFileSync(path.join(root, "cidades_brasil.json"), "utf8"));
const permit = new Set();
for (const row of cidades) {
  const k = normalizarChaveCidade(row.CIDADE);
  if (k) permit.add(k);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = {};
for (const uf of UFs) {
  const u = `https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`;
  let arr = null;
  for (let t = 0; t < 4; t++) {
    const r = await fetch(u);
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j)) {
        arr = j;
        break;
      }
    } else {
      await sleep(400 * (t + 1));
    }
  }
  if (!arr) {
    console.error(uf, "falha após tentativas");
    out[uf] = [];
    continue;
  }
  out[uf] = arr
    .filter((x) => permit.has(normalizarChaveCidade(x.nome)))
    .map((x) => x.nome)
    .sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
  console.log(uf, out[uf].length);
  await sleep(200);
}
fs.writeFileSync(
  path.join(root, "municipios_cidades_ficha_por_uf.json"),
  JSON.stringify(out, null, 0) + "\n",
  "utf8"
);
console.log("OK", path.join(root, "municipios_cidades_ficha_por_uf.json"));
