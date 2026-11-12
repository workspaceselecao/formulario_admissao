#!/usr/bin/env node
/**
 * Gera `municipios_por_uf.json` — índice local de municípios por UF.
 *
 * Esse arquivo é a fonte primária do select de cidade da assistência médica
 * (`assistencia_medica.html` → `carregarMunicipiosLocaisPorUf`). Ele é versionado
 * no repositório justamente para que a lista não dependa de API de terceiros em
 * tempo de execução: o navegador o busca do próprio domínio.
 *
 * Uso: node scripts/gerar-municipios-por-uf.mjs
 * Fonte: IBGE — https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado
 */
import fs from "node:fs";
import path from "node:path";

const URL_IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado";
const DESTINO = path.join(process.cwd(), "municipios_por_uf.json");

const res = await fetch(URL_IBGE);
if (!res.ok) throw new Error(`IBGE respondeu HTTP ${res.status}`);
const municipios = await res.json();
if (!Array.isArray(municipios) || !municipios.length) throw new Error("IBGE: formato inesperado");

const porUf = {};
for (const m of municipios) {
  const uf = m["UF-sigla"];
  const nome = String(m["municipio-nome"] || "").trim();
  if (!uf || !nome) continue;
  (porUf[uf] ||= []).push(nome);
}

const saida = {
  _meta: {
    fonte: "IBGE - servicodados.ibge.gov.br/api/v1/localidades/municipios",
    gerado_em: new Date().toISOString().slice(0, 10),
    total_municipios: municipios.length
  }
};
for (const uf of Object.keys(porUf).sort()) {
  saida[uf] = porUf[uf].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

fs.writeFileSync(DESTINO, JSON.stringify(saida, null, 2) + "\n", "utf8");
console.log(
  `OK  ${path.basename(DESTINO)}: ${Object.keys(porUf).length} UFs, ${municipios.length} municípios`
);
