import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outMd = path.join(root, "Docs", "historico-versionamento.md");
const outJson = path.join(root, "Docs", "historico-versionamento.json");

function git(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: root }).trim();
}

const agora = new Date();
const isoGerado = agora.toISOString();
let branch = "main";
try {
  branch = git("git rev-parse --abbrev-ref HEAD");
} catch {
  /* ignore */
}

const commitsRaw = git('git log --pretty=format:"%h|%cI|%an|%ae|%s"');
const commits = commitsRaw
  .split("\n")
  .filter(Boolean)
  .map((linha) => {
    const [hash, dataIso, autor, email, ...resto] = linha.split("|");
    return {
      hash,
      dataIso,
      autor,
      email,
      mensagem: resto.join("|")
    };
  });

const assets = [
  {
    tipo: "Template PDF — Ficha cadastral",
    referencia: "F-075 / PR-011",
    arquivo: "F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf",
    config: "ficha_cadastral_campos.json (documento.versao: 37)"
  },
  {
    tipo: "Template PDF — Assistência médica (Outros Planos)",
    referencia: "Fichas regionais",
    arquivo: "FICHA *.pdf, cidades_brasil.json",
    config: "assistencia_medica_campos.json"
  },
  {
    tipo: "Template PDF — Plano de Benefícios",
    referencia: "Declaração plano de saúde",
    arquivo: "DECLARACAO PLANO DE SAUDE.pdf",
    config: "declaracao_plano_saude_campos.json"
  },
  {
    tipo: "Documentação LGPD",
    referencia: "/Docs",
    arquivo: "privacy-policy.html, terms-of-use.html, legal-basis.html, ripd.html, …",
    config: "docs-revision.json (última validação jurídica)"
  }
];

const ultimaValidacao = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "Docs", "docs-revision.json"), "utf8"));
  } catch {
    return null;
  }
})();

const linhasMd = [];
linhasMd.push("# Histórico de versionamento — Formulários de Admissão (ATENTO)");
linhasMd.push("");
linhasMd.push(`**Gerado em:** ${isoGerado}`);
linhasMd.push(`**Branch Git:** ${branch}`);
linhasMd.push(`**Total de commits listados:** ${commits.length}`);
if (ultimaValidacao?.ultimaValidacaoIso) {
  linhasMd.push(
    `**Última validação jurídica registrada (docs-revision.json):** ${ultimaValidacao.ultimaValidacaoIso} — commit ${ultimaValidacao.gitCommit || "—"}`
  );
}
linhasMd.push("");
linhasMd.push("Este ficheiro consolida o histórico de alterações do repositório Git e referências aos templates PDF, JSON de coordenadas e documentação em `/Docs`.");
linhasMd.push("");
linhasMd.push("---");
linhasMd.push("");
linhasMd.push("## 1. Ativos versionados (referência)");
linhasMd.push("");
linhasMd.push("| Tipo | Referência | Ficheiro(s) | Configuração / metadados |");
linhasMd.push("|------|------------|-------------|-------------------------|");
for (const a of assets) {
  linhasMd.push(`| ${a.tipo} | ${a.referencia} | ${a.arquivo} | ${a.config} |`);
}
linhasMd.push("");
linhasMd.push("## 2. Commits Git (do mais recente ao mais antigo)");
linhasMd.push("");
linhasMd.push("| Commit | Data (ISO) | Responsável | E-mail | Descrição |");
linhasMd.push("|--------|------------|-------------|--------|-----------|");
for (const c of commits) {
  const msg = (c.mensagem || "").replace(/\|/g, "\\|");
  linhasMd.push(`| ${c.hash} | ${c.dataIso} | ${c.autor} | ${c.email} | ${msg} |`);
}
linhasMd.push("");
linhasMd.push("## 3. Notas");
linhasMd.push("");
linhasMd.push("- Alterações em coordenadas de PDF devem ser validadas visualmente após cada atualização de template.");
linhasMd.push("- Documentos em `/Docs` incluem bloco de revisão jurídica com data do último commit (ver `doc-revision.js`).");
linhasMd.push("- Para regenerar este ficheiro: `node scripts/gerar-historico-versionamento.mjs`");
linhasMd.push("");

const payload = {
  geradoEm: isoGerado,
  branch,
  totalCommits: commits.length,
  ultimaValidacaoJuridica: ultimaValidacao,
  ativos: assets,
  commits
};

fs.writeFileSync(outMd, `${linhasMd.join("\n")}\n`);
fs.writeFileSync(outJson, `${JSON.stringify(payload, null, 2)}\n`);
console.log("Gerado:", outMd, `(${commits.length} commits)`);
