import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outMd = path.join(root, "Docs", "historico-versionamento.md");

function git(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: root }).trim();
}

const commitsRaw = git('git log --pretty=format:"%cI|%s"');
const commits = commitsRaw
  .split("\n")
  .filter(Boolean)
  .map((linha) => {
    const pipe = linha.indexOf("|");
    return {
      dataIso: linha.slice(0, pipe),
      mensagem: linha.slice(pipe + 1)
    };
  });

/** Commits internos ou demasiado técnicos — não entram no guia público. */
function deveOmitir(mensagem) {
  const m = mensagem.toLowerCase();
  const omitir = [
    /docs-revision/,
    /carimbo de última validação/,
    /script de geracao/,
    /historico de versionamento/,
    /coordenad/,
    /pdf-lib/,
    /offset/,
    /evidência técnica/,
    /conversão incorreta/,
    /converter y/,
    /revert/,
    /vercel/,
    /csp\b/,
    /headers no/,
    /redirect/,
    /feat\(seo\)/,
    /fix\(deploy\)/,
    /refactor\(docs\): mover/,
    /sincronizar assets/,
    /\.json/,
    /\.mjs/,
    /manutenção\.md/i,
    /reset --hard/,
    /força.*push/i,
    /appstorage/,
    /localstorage namespaced/,
    /aria-hidden/,
    /tokens css/,
    /migração rascunho v\d/,
    /schema\)/,
    /urls curtas/,
    /links absolutos/,
    /remoção dos \.md/,
    /pacote lgpd.*markdown/,
    /alinhar.*modelos corporativos da raiz/,
    /url codificada/,
    /diagonal integração/i,
    /adicionar pdfs de carta/i
  ];
  return omitir.some((re) => re.test(m));
}

function formatarDataPt(dataIso) {
  const d = new Date(dataIso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function mesAnoPt(dataIso) {
  const d = new Date(dataIso);
  if (Number.isNaN(d.getTime())) return "Outras atualizações";
  const label = d.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo"
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Texto orientado ao utilizador, sem jargão técnico nem caminhos. */
function paraTextoUtilizador(mensagem) {
  let t = mensagem
    .replace(/^(feat|fix|docs|style|refactor)(\([^)]+\))?:\s*/i, "")
    .replace(/\bF-075_\d+(__PR-\d+)?\b/gi, "ficha cadastral")
    .replace(/\bPR-\d+\b/gi, "")
    .replace(/\.pdf\b/gi, "")
    .replace(/\.html?\b/gi, "")
    .replace(/\.json\b/gi, "")
    .replace(/\bDocs\/?\b/gi, "documentação de privacidade")
    .replace(/\bForms\/?\b/gi, "formulários")
    .replace(/\/Docs/g, "documentação de privacidade")
    .trim();

  const mapa = [
    [/plano de benefícios.*pág\.?\s*2/i, "Declaração do Plano de Benefícios: melhoria na data e na assinatura do documento"],
    [/copiar assinatura manuscrita da ficha cadastral para assistência/i, "A assinatura feita na ficha cadastral passa a ser reutilizada na assistência médica, quando aplicável"],
    [/opção ['']não assinar manualmente['']/i, "Nova opção para quem não precisa assinar manualmente no ecrã"],
    [/vale-transporte.*marca d'água/i, "Vale-transporte: indicação visual no PDF quando o candidato não é optante"],
    [/manter formulário e rascunho após gerar pdf/i, "O formulário mantém os dados após gerar o PDF; limpeza apenas ao descartar o rascunho"],
    [/aviso antes do pdf com encaminhamento ao portal do candidato/i, "Aviso antes de gerar o PDF, com orientação sobre o Portal do Candidato"],
    [/modal de instruções/i, "Instruções iniciais para o candidato ao abrir o formulário"],
    [/confirmação em modal/i, "Confirmação antes de descartar rascunho, limpar assinatura ou remover dependente"],
    [/páginas html para documentação legal/i, "Documentação de privacidade e termos disponível no site"],
    [/links de política, termos/i, "Acesso facilitado à política de privacidade e aos termos de uso"],
    [/linguagem amigável na página índice de privacidade/i, "Textos de privacidade com linguagem mais clara"],
    [/sidebar|menu (hambúrguer|lateral)/i, "Navegação entre fichas e opções do menu lateral"],
    [/poppins/i, "Tipografia atualizada para melhor leitura"],
    [/teclado numérico|inputmode/i, "Campos numéricos com teclado adequado em dispositivos móveis"],
    [/dados bancários.*bradesco.*santander/i, "Dados bancários organizados para Bradesco e Santander"],
    [/plano de benefícios vs outros planos/i, "Assistência médica: separação entre Plano de Benefícios e outros planos por região"],
    [/cpf.*dados pessoais/i, "CPF apresentado junto aos dados pessoais"],
    [/tipo de plano e tipo de movimentação/i, "Tipo de plano e tipo de movimentação reunidos numa só secção"],
    [/link para download da declaração|declaração plano de saúde/i, "Link para obter a declaração do plano de saúde no fluxo do Plano de Benefícios"],
    [/adicionar pdfs de carta|declaração de plano de saúde/i, "Disponibilização da carta e da declaração de plano de saúde"],
    [/texto orientativo dos tipos de plano/i, "Textos de ajuda sobre os tipos de plano na assistência médica"],
    [/texto de revisão jurídica nos documentos lgpd/i, "Documentos de privacidade com indicação da última revisão jurídica"],
    [/remover secção contactos e escalamento do plano de resposta a incidentes/i, "Plano de resposta a incidentes: conteúdo simplificado"],
    [/conta mêntore bank.*bradesco/i, "Conta bancária: opção Bradesco em substituição do modelo anterior"],
    [/primeiro emprego.*deficiência.*vale refeição/i, "Campos obrigatórios reforçados: primeiro emprego, deficiência e vale refeição/alimentação"],
    [/nome do ficheiro|prefixos fixos para nomes/i, "Nome do PDF gerado inclui o tipo de ficha e o primeiro nome"],
    [/dependente/i, "Melhorias no preenchimento de dependentes"],
    [/assinatura/i, "Melhorias no preenchimento e na geração da assinatura nos PDFs"],
    [/ficha cadastral.*template|substituir template pdf da ficha/i, "Atualização do modelo oficial da ficha cadastral"],
    [/assistência médica/i, "Melhorias no formulário de assistência médica"],
    [/ficha cadastral/i, "Melhorias no formulário da ficha cadastral"]
  ];

  for (const [re, subst] of mapa) {
    if (re.test(t)) return subst;
  }

  t = t
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (t.length > 160) t = `${t.slice(0, 157)}…`;
  if (!t) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const entradas = [];
const visto = new Set();

for (const c of commits) {
  if (deveOmitir(c.mensagem)) continue;
  const texto = paraTextoUtilizador(c.mensagem);
  if (!texto) continue;
  const chave = `${formatarDataPt(c.dataIso)}|${texto}`;
  if (visto.has(chave)) continue;
  visto.add(chave);
  entradas.push({
    dataIso: c.dataIso,
    data: formatarDataPt(c.dataIso),
    mesAno: mesAnoPt(c.dataIso),
    texto
  });
}

const porMes = new Map();
for (const e of entradas) {
  if (!porMes.has(e.mesAno)) porMes.set(e.mesAno, []);
  porMes.get(e.mesAno).push(e);
}

const agora = new Date();
const dataDoc = agora.toLocaleDateString("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Sao_Paulo"
});

const linhasMd = [];
linhasMd.push("# Histórico de atualizações — Formulários de Admissão");
linhasMd.push("");
linhasMd.push(
  "Guia informativo das principais mudanças na experiência de preenchimento dos formulários e na documentação de privacidade. Não inclui detalhes técnicos internos."
);
linhasMd.push("");
linhasMd.push(`**Última atualização deste guia:** ${dataDoc}`);
linhasMd.push("");
linhasMd.push("---");
linhasMd.push("");

for (const [mesAno, itens] of porMes) {
  linhasMd.push(`## ${mesAno}`);
  linhasMd.push("");
  linhasMd.push("| Data | O que mudou |");
  linhasMd.push("|------|-------------|");
  for (const e of itens) {
    const txt = e.texto.replace(/\|/g, " ");
    linhasMd.push(`| ${e.data} | ${txt} |`);
  }
  linhasMd.push("");
}

if (entradas.length === 0) {
  linhasMd.push("_Nenhuma atualização pública registada neste período._");
  linhasMd.push("");
}

fs.writeFileSync(outMd, `${linhasMd.join("\n")}\n`);
console.log(`Gerado: ${outMd} (${entradas.length} entradas para utilizador)`);
