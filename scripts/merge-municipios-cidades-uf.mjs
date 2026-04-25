/**
 * Complementa municipios_cidades_ficha_por_uf.json a partir de cidades_brasil.json
 * quando a API falhou. Usa REGIONAL (MG, SP, …) e tabelas SUL, NE, N, CO.
 * Uso: node scripts/merge-municipios-cidades-uf.mjs
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

const pathJson = path.join(root, "municipios_cidades_ficha_por_uf.json");
const pathCid = path.join(root, "cidades_brasil.json");
const cidades = JSON.parse(fs.readFileSync(pathCid, "utf8"));
const out = JSON.parse(fs.readFileSync(pathJson, "utf8"));
const UFs = [
  "RO", "AC", "AM", "RR", "PA", "AP", "TO", "MA", "PI", "CE", "RN", "PB", "PE", "AL", "SE",
  "BA", "MG", "ES", "RJ", "SP", "PR", "SC", "RS", "MS", "MT", "GO", "DF",
];

const nomeParaOpt = (caps) => {
  const t = String(caps).trim();
  if (!t) return t;
  return t
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((p) => (p.length ? p[0].toLocaleUpperCase("pt-BR") + p.slice(1) : p))
    .join(" ");
};

const SUL = {
  ALEGRETE: "RS",
  BAGE: "RS",
  BALNEARIO_CAMBORIU: "SC",
  BENTO_GONCALVES: "RS",
  BLUMENAU: "SC",
  CACHOEIRO_DO_SUL: "RS",
  CAMAQUA: "RS",
  CANOAS: "RS",
  CAPAO_DA_CANOA: "RS",
  CAPINZAL: "SC",
  CARAZINHO: "RS",
  CASCAVEL: "PR",
  CAXIAS_DO_SUL: "RS",
  CHARQUEADAS: "RS",
  CONCORDIA: "SC",
  CURITIBA: "PR",
  ERECHIM: "RS",
  FLORIANOPOLIS: "SC",
  FOZ_DO_IGUACU: "PR",
  GAROPABA: "SC",
  GUARAPUAVA: "PR",
  IJUI: "RS",
  IMBITUBA: "SC",
  JOINVILLE: "SC",
  LAGOA_VERMELHA: "RS",
  LONDRINA: "PR",
  MARINGA: "PR",
  NAVEGANTES: "SC",
  NOVO_HAMBURGO: "RS",
  OSORIO: "RS",
  PALMEIRA_DAS_MISSOES: "RS",
  PASSO_FUNDO: "RS",
  PONTA_GROSSA: "PR",
  PORTO_ALEGRE: "RS",
  SANTA_ROSA: "RS",
  SANTANA_DO_LIVRAMENTO: "RS",
  SANTO_ANGELO: "RS",
  SANTA_CRUZ_DO_SUL: "RS",
  SAO_BENTO_DO_SUL: "SC",
  SAO_JOSE: "SC",
  SAO_MARCOS: "RS",
  TAQUARA: "RS",
  TRAMANDAI: "RS",
  TRES_DE_MAIO: "RS",
  TUBARAO: "SC",
  URUGUAIANA: "RS",
  VACARIA: "RS",
};

const NE = {
  ARACAJU: "SE",
  ARAPIRACA: "AL",
  BARREIRAS: "BA",
  CAMPINA_GRANDE: "PB",
  CRATO: "CE",
  EUNAPOLIS: "BA",
  FEIRA_DE_SANTANA: "BA",
  FORTALEZA: "CE",
  GUANAMBI: "BA",
  ILHEUS: "BA",
  ITABUNA: "BA",
  JOAO_PESSOA: "PB",
  JUAZEIRO_DO_NORTE: "CE",
  LUIS_EDUARDO_MAGALHAES: "BA",
  MACEIO: "AL",
  MOSSORO: "RN",
  NATAL: "RN",
  PARNAIBA: "PI",
  PARNAMIRIM: "RN",
  PATOS: "PB",
  PICOS: "PI",
  PORTO_SEGURO: "BA",
  RECIFE: "PE",
  SALVADOR: "BA",
  SOBRAL: "CE",
  SANTA_LUZIA: "BA",
  SANTO_ANTONIO_DE_JESUS: "BA",
  TEIXEIRA_DE_FREITAS: "BA",
  TERESINA: "PI",
  VITORIA_DA_CONQUISTA: "BA",
};

const NORTE = {
  ACAILANDIA: "MA",
  ALTAMIRA: "PA",
  BALSAS: "MA",
  BELEM: "PA",
  CANAA_DOS_CARAJAS: "PA",
  CAPANEMA: "PA",
  IMPERATRIZ: "MA",
  MACAPA: "AP",
  MANAUS: "AM",
  PACO_DO_LUMIAR: "MA",
  PARAUAPEBAS: "PA",
  REDENCAO: "PA",
  SAO_JOSE_DE_RIBAMAR: "MA",
  SAO_LUIS: "MA",
  TUCURUI: "PA",
  SANTAREM: "PA",
  SANTA_INES: "MA",
};

const CO = {
  ANAPOLIS: "GO",
  APARECIDA_DE_GOIANIA: "GO",
  BRASILIA: "DF",
  CAMPO_GRANDE: "MS",
  CATALAO: "GO",
  CUIABA: "MT",
  DOURADOS: "MS",
  FORMOSA: "GO",
  GOIANIA: "GO",
  INHUMAS: "GO",
  ITUMBIARA: "GO",
  JATAI: "GO",
  MINEIROS: "GO",
  PALMAS: "TO",
  RIO_VERDE: "GO",
  RONDONOPOLIS: "MT",
  SINOP: "MT",
  TANGARA_DA_SERRA: "MT",
  TRES_LAGOAS: "MS",
  TRINDADE: "GO",
};

function atribuirUf(row) {
  const r = row.REGIONAL;
  const k = normalizarChaveCidade(row.CIDADE).replace(/ /g, "_");
  if (r === "MG" || r === "SP" || r === "RJ" || r === "ES" || r === "DF") return r;
  if (r === "SUL" && SUL[k]) return SUL[k];
  if (r === "NE" && NE[k]) return NE[k];
  if (r === "N" && NORTE[k]) return NORTE[k];
  if (r === "CO" && CO[k]) return CO[k];
  return null;
}

for (const u of UFs) {
  if (!out[u]) out[u] = [];
}

const porUf = {};
for (const u of UFs) {
  porUf[u] = new Set();
  for (const nome of out[u] || []) {
    if (nome) porUf[u].add(normalizarChaveCidade(nome));
  }
}

for (const row of cidades) {
  const uf = atribuirUf(row);
  if (!uf) continue;
  const n = normalizarChaveCidade(row.CIDADE);
  if (porUf[uf].has(n)) continue;
  porUf[uf].add(n);
  out[uf].push(nomeParaOpt(row.CIDADE));
}

for (const u of UFs) {
  out[u] = [...new Set(out[u])].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
}
fs.writeFileSync(pathJson, JSON.stringify(out) + "\n", "utf8");
console.log("OK", pathJson, UFs.map((u) => `${u}=${out[u].length}`).join(" "));
