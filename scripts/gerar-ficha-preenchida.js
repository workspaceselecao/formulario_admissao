/**
 * Gera um PDF de TESTE completamente preenchido da Ficha Cadastral (F-075)
 * via engine embarcada (embedded-docs.js) — mesmo caminho do painel.
 *
 * Uso: node scripts/gerar-ficha-preenchida.js [saida.pdf] [--vazio]
 * Saída padrão: .tmp_render/output_preenchido.pdf
 *
 * Com --vazio o mesmo template é gerado SEM nenhum dado. O par
 * (preenchido, vazio) permite medir por diferença de pixels a tinta que a
 * engine escreveu — usado pela conferência numérica contra as caixas do v38.
 *
 * Serve para verificar visualmente se as coordenadas do schema
 * (ficha_cadastral_campos.json) batem com o template — checkboxes marcadas,
 * textos dentro das células, assinatura na linha.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const PDFLib = require("pdf-lib");
const fontkit = require("../ficha-cadastral-embutido/node_modules/@pdf-lib/fontkit");
const EmbeddedDocs = require("../embedded-docs.js");

const dir = path.join(__dirname, "..", "ficha-cadastral-embutido");
const vazio = process.argv.includes("--vazio");
const saida = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : path.join(__dirname, "..", ".tmp_render", vazio ? "output_vazio.pdf" : "output_preenchido.pdf");

const template = JSON.parse(fs.readFileSync(path.join(dir, "template.json"), "utf-8"));
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "ficha_cadastral_campos.json"), "utf-8")).campos;

const imagens = {};
for (const img of template.images || []) {
  const p = path.join(dir, img.file);
  if (fs.existsSync(p)) imagens[img.file] = new Uint8Array(fs.readFileSync(p));
}
const fontes = {};
const listaFontes = Object.keys(template.fontes || {}).map(n => template.fontes[n].arquivo)
  .concat(template.fonteCheckbox && template.fonteCheckbox.arquivo ? [template.fonteCheckbox.arquivo] : []);
for (const arq of listaFontes) {
  const p = path.join(dir, arq);
  if (fs.existsSync(p)) fontes[arq] = new Uint8Array(fs.readFileSync(p));
}

// Dados de teste: mapa FLAT path → valor. Opção de radio marcada = true.
const dados = {
  "dados_pessoais.campos.nome": "JOAO DA SILVA SANTOS TESTE",
  "dados_pessoais.campos.craxa": "JOAO SANTOS",
  "dados_pessoais.campos.fone": "(71) 3456-7890",
  "dados_pessoais.campos.celular": "(71) 98765-4321",
  "dados_pessoais.campos.email": "joao.santos@teste.com.br",
  "dados_pessoais.campos.estadocivil": "CASADO",
  "dados_pessoais.campos.primeiro_emprego.opcoes.nao": true,
  "dados_pessoais.campos.informarpis": "123.45678.90-1",
  "endereco.campos.rua": "AVENIDA TESTE DA SILVA, 123 - SALA 45",
  "endereco.campos.numero": "123",
  "endereco.campos.complemento": "APTO 501 - TORRE B",
  "endereco.campos.cep": "41950-000",
  "endereco.campos.bairro": "RIO VERMELHO",
  "endereco.campos.cidadeuf": "SALVADOR/BA",
  "deficiencia.campos.possui_deficiencia.opcoes.nao": true,
  "deficiencia.campos.tipo_deficiencia.opcoes.visual": true,
  "conta_bancaria.campos.tipo_conta.opcoes.bradesco": true,
  "conta_bancaria.campos.bradesco_agencia": "1234-5",
  "conta_bancaria.campos.bradesco_conta_digito": "98765-4",
  "conta_bancaria.campos.cpf_titular": "111.222.333-44",
  "dependentes.0.campos.nome": "MARIA SANTOS TESTE",
  "dependentes.0.campos.dtnasc": "01/01/1990",
  "dependentes.0.campos.cpf": "222.333.444-55",
  "dependentes.1.campos.nome": "JOAO FILHO TESTE",
  "dependentes.1.campos.dtnasc": "02/02/2010",
  "dependentes.1.campos.cpf": "333.444.555-66",
  "dependentes.2.campos.nome": "ANA SANTOS TESTE",
  "dependentes.2.campos.dtnasc": "03/03/2015",
  "dependentes.2.campos.cpf": "444.555.666-77",
  "dependentes.3.campos.nome": "PEDRO TESTE NETO",
  "dependentes.3.campos.dtnasc": "04/04/2018",
  "dependentes.3.campos.cpf": "555.666.777-88",
  "dependentes.4.campos.nome": "CARLA TESTE SOUZA",
  "dependentes.4.campos.dtnasc": "05/05/2020",
  "dependentes.4.campos.cpf": "666.777.888-99",
  "vale_transporte.itens.onibus.quantidade": "44",
  "vale_transporte.itens.onibus.valor_unitario": "5,20",
  "vale_transporte.itens.metro_trem.quantidade": "22",
  "vale_transporte.itens.metro_trem.valor_unitario": "4,50",
  "vale_transporte.itens.intermunicipal.quantidade": "10",
  "vale_transporte.itens.intermunicipal.valor_unitario": "8,00",
  "vale_transporte.itens.integracao.quantidade": "6",
  "vale_transporte.itens.integracao.valor_unitario": "3,75",
  "vale_alimentacao_refeicao.opcoes.alimentacao": true,
  "assinatura.campos.nome_legivel": "JOAO DA SILVA SANTOS",
  "assinatura.campos.data.segmentos.dia": "27",
  "assinatura.campos.data.segmentos.mes": "09",
  "assinatura.campos.data.segmentos.ano": "2026"
};

EmbeddedDocs.gerarPdf(template, schema, vazio ? {} : dados, PDFLib, { imagens, fontes }, { fontkit, autor: "teste" })
  .then(res => {
    fs.writeFileSync(saida, Buffer.from(res.bytes));
    console.log("Gerado:", saida, "(" + res.bytes.length + " bytes)");
    console.log("Campos desenhados:", res.desenhados, "| ignorados:", res.ignorados.length);
    const inesperados = res.ignorados.filter(i => i.motivo !== "sem valor informado");
    for (const ign of inesperados) console.log("  ignorado:", ign.id, "-", ign.motivo);
  })
  .catch(e => { console.error("ERRO:", e.message); process.exit(1); });
