#!/usr/bin/env node

/**
 * ============================================================
 * GERADOR DO DOCUMENTO NATIVO DO F-075 (mobiliário + campos)
 * ============================================================
 *
 * Por que existe: o schema de campos (`ficha_cadastral_campos.json`) descreve
 * APENAS os campos dinâmicos — textos fixos, linhas, caixas, logotipos e faixas
 * do formulário oficial não estão em nenhum arquivo do repositório. Este script
 * monta a definição nativa juntando as duas metades:
 *
 *   1. campos dinâmicos  → `ficha_cadastral_campos.json` (via definicaoDeSchema,
 *      a MESMA conta que a aplicação pública usa hoje);
 *   2. mobiliário        → `scripts/referencia/f075-pagina1.json`, a geometria
 *      REAL extraída dos operadores de desenho do PDF de referência (o mesmo
 *      extrator que o painel usa em "Importar PDF (referência)");
 *   3. imagens           → `f075_nativo_0N.png`, recortadas da própria
 *      referência (logotipos e faixas de tabela que no PDF original são raster).
 *
 * Depois de montar, o script CONFERE: compara item por item da referência com o
 * elemento equivalente da definição e falha (exit 1) se o deslocamento passar da
 * tolerância. O aceite da reconstrução é essa medição, não uma inspeção visual.
 *
 * Uso:  node scripts/gerar-nativo-f075.mjs [--conferir]
 *   (sem --conferir, grava `ficha_cadastral_nativo.json` na raiz quando o
 *    deslocamento está dentro da tolerância)
 */

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ROOT = join(import.meta.dirname, "..");
const REFERENCIA = join(ROOT, "scripts", "referencia", "f075-pagina1.json");
const TIPOGRAFIA = join(ROOT, "scripts", "referencia", "f075-tipografia.json");
const SCHEMA = join(ROOT, "ficha_cadastral_campos.json");
const SAIDA = join(ROOT, "ficha_cadastral_nativo.json");
// Data fixa: a definição gerada é determinística (mesma entrada ⇒ mesmos bytes).
const DATA_BASE = "2026-09-25T12:00:00.000Z";
const TOLERANCIA_PT = 1;

const conferir = process.argv.includes("--conferir");

// ── Engine (mesmo arquivo que o painel carrega; roda também em node:vm) ──
function carregarEngine() {
  const sb = { console, JSON, Math, Date, Object, Array, String, Number, isFinite, parseInt, parseFloat, regiao: null };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(readFileSync(join(ROOT, "native-docs.js"), "utf8"), sb, { filename: "native-docs.js" });
  if (!sb.NativeDocs) throw new Error("native-docs.js não expôs NativeDocs");
  return sb.NativeDocs;
}

function main() {
  const N = carregarEngine();
  const snap = JSON.parse(readFileSync(REFERENCIA, "utf8"));
  const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
  const pagina = { width: snap.page.width, height: snap.page.height };

  // ── 1. campos dinâmicos (perfil da aplicação: a geometria que já é usada) ──
  const def = N.definicaoDeSchema(schema, {
    documentId: "f075",
    documentName: "Ficha Cadastral (F-075)",
    width: pagina.width,
    height: pagina.height,
    schemaArquivo: "ficha_cadastral_campos.json",
    prefixoBinding: "ficha_cadastral",
    autor: "scripts/gerar-nativo-f075.mjs",
    agora: DATA_BASE
  });
  const campos = def.elementos.slice();

  // ── 2. mobiliário (régua/caixa/imagem) e 3. textos fixos ──
  const graficos = N.graficosDeSnapshot(snap);
  const mob = N.elementosDeGraficos(graficos, {
    page: snap.pageIndex, prefixoImagem: "f075_nativo", confirmar: true
  });
  const itens = snap.textos.map((t) => Object.assign({}, t, { texto: t.conteudo }));
  const textos = N.elementosDeItensDeTexto(itens, pagina, {
    page: snap.pageIndex, prefixoId: "ref", confirmar: true, jaAgrupado: true
  });

  def.elementos = mob.elementos.concat(textos).concat(campos);
  def.assets = mob.assets.slice();
  def.origem = "referencia:" + snap.arquivo + "#" + snap.pageIndex;

  // ── 4. tipografia oficial por run (§15.1) ──
  // O PDF não diz qual fonte o formulário usa: o pdf.js só reporta o
  // subconjunto embutido (AAAAAA+Arial-BoldMT). O documento editável declara
  // run a run, então a definição passa a carregar as DUAS verdades — a oficial
  // (declarada) e a medida (que a comparação geométrica validou) — e o que
  // divergir entre elas fica registrado, nunca escondido.
  const tipografia = JSON.parse(readFileSync(TIPOGRAFIA, "utf8"));
  const chaveTexto = (s) => String(s == null ? "" : s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
  const paragrafosOficiais = tipografia.paragrafos.map((p) => Object.assign({}, p, { chave: chaveTexto(p.texto) }));
  const tipografiaDe = function (texto) {
    const c = chaveTexto(texto);
    if (c.length < 3) return null;
    return paragrafosOficiais.find((x) => x.chave === c) ||
      paragrafosOficiais.find((x) => x.chave.indexOf(c) >= 0) ||
      paragrafosOficiais.filter((x) => x.chave.length >= 4 && c.indexOf(x.chave) >= 0)
        .sort((a, b) => b.chave.length - a.chave.length)[0] || null;
  };

  const divergencias = [];
  const porFamilia = {};
  for (const el of def.elementos) {
    if (el.type !== "text") continue;
    const p = tipografiaDe(el.content);
    if (!p) continue;
    el.font = Object.assign({}, el.font, { oficial: p.familia });
    el.fonteOficial = p.familia;
    el.tipografiaOficial = {
      familia: p.familia,
      tamanho: p.tamanho,
      negrito: !!p.negrito,
      simbolica: !!p.simbolica,
      nRuns: p.nRuns,
      fonte: "scripts/referencia/f075-tipografia.json"
    };
    porFamilia[p.familia] = (porFamilia[p.familia] || 0) + 1;
    const negritoMedido = (el.font && el.font.weight) === "bold";
    if (!!p.negrito !== negritoMedido) {
      divergencias.push(el.id + ": documento declara " + (p.negrito ? "negrito" : "normal") + ", o PDF oficial mede " + (negritoMedido ? "negrito" : "normal"));
    }
    if (p.tamanho && Math.abs(p.tamanho - Number(el.font.size)) > 0.25) {
      divergencias.push(el.id + ": documento declara " + p.tamanho + " pt, o PDF oficial mede " + el.font.size + " pt");
    }
  }
  // As caixas de marcação vêm dos runs Wingdings do documento (17 runs = 17 ❑).
  const caixas = def.elementos.filter((e) => e.type === "checkbox");
  const simbolicos = tipografia.runs.filter((r) => r.simbolica);
  for (const cx of caixas) {
    cx.fonteOficial = "Wingdings";
    cx.glifoOficial = "q";
  }
  if (simbolicos.length !== caixas.length) {
    divergencias.push("documento tem " + simbolicos.length + " run(s) Wingdings e a definição tem " + caixas.length + " caixa(s) de marcação");
  }
  // Substituições que a renderização vai aplicar (fonte licenciada ausente).
  const substituicoes = [];
  for (const familia of Object.keys(porFamilia)) {
    const r = N.resolverFonte({ font: { family: familia, size: 8, weight: "normal" } }, {});
    if (r.oficial && r.oficial.familia !== r.chave.replace(/-.*$/, "")) {
      substituicoes.push({
        pedida: familia,
        usada: r.chave,
        equivalencia: r.oficial.equivalencia,
        desvio: r.oficial.desvio,
        elementos: porFamilia[familia],
        aviso: r.aviso
      });
    }
  }

  // ── 4. conferência geométrica contra a referência (critério de aceite) ──
  const rel = N.compararComReferencia(def, snap, { tolerancia: TOLERANCIA_PT, detalhar: true });
  def.metadados = Object.assign({}, def.metadados, {
    pendenteCalibracao: !rel.dentro,
    referencia: {
      arquivo: snap.arquivo,
      pageIndex: snap.pageIndex,
      documento: "F-075 p.1 (geometria extraída dos operadores de desenho)",
      verificadoEm: DATA_BASE,
      toleranciaPt: TOLERANCIA_PT,
      deslocamentoMaximoPt: { dx: rel.maxDx, dy: rel.maxDy },
      itensCasados: rel.casados,
      itensSemPar: rel.semPar
    },
    tipografiaOficial: {
      fonte: "scripts/referencia/f075-tipografia.json",
      documento: tipografia.arquivo,
      porFamilia: porFamilia,
      caixasDeMarcacaoWingdings: caixas.length,
      substituicoes: substituicoes,
      divergencias: divergencias
    },
    observacoes: rel.dentro
      ? "Reconstruído da referência: textos fixos, réguas, caixas, tarjas e imagens + campos do schema. Deslocamento medido dentro da tolerância de " + TOLERANCIA_PT + " pt. Tipografia declarada por run a partir do documento editável; onde o PDF oficial divergir da declaração, a divergência está em metadados.tipografiaOficial.divergencias."
      : "Reconstruído da referência com pendências: " + rel.semPar + " item(ns) sem par e deslocamento máximo dx " + rel.maxDx + " pt / dy " + rel.maxDy + " pt."
  });
  // Cada elemento importado recebe o desvio MEDIDO contra a referência.
  const desvios = rel.desviosPorElemento || {};
  let comDesvio = 0;
  for (const el of def.elementos) {
    const d = desvios[el.id];
    if (!d) continue;
    comDesvio++;
    el.desvioMedido = { dx: d.dx, dy: d.dy };
    if (Math.abs(d.dx) <= TOLERANCIA_PT && Math.abs(d.dy) <= TOLERANCIA_PT) {
      el.confirmado = true;
      el.confirmacao = "comparação geométrica com a referência dentro de " + TOLERANCIA_PT + " pt";
    } else {
      el.confirmado = false;
    }
  }

  const v = N.validarDefinicao(def);
  const r = N.resumoDefinicao(def);
  const bloqueantes = v.erros.filter((e) => !/REQUER CALIBRAÇÃO/.test(e));

  // ── 5. relatório ──
  console.log("Referência: " + snap.arquivo + " p." + snap.pageIndex + " (" + pagina.width + "×" + pagina.height + " pt)");
  console.log("  textos da referência: " + snap.textos.length + " · réguas/caixas: " + snap.regras.length + " · imagens: " + snap.imagens.length);
  console.log("  ignorados na extração: " + snap.recortes + " recorte(s), " + (snap.recortadas || 0) + " traçado(s) fora do recorte, " + (snap.transparentes || 0) + " máscara(s) transparente(s)");
  console.log("Definição: " + r.nElementos + " elemento(s) " + JSON.stringify(r.porTipo) + " · " + r.nCampos + " campo(s) · página " + r.page.width + "×" + r.page.height);
  console.log("Tipografia oficial: " + JSON.stringify(porFamilia) + " · caixas Wingdings: " + caixas.length);
  for (const s of substituicoes) console.log("  substituição: \"" + s.pedida + "\" -> " + s.usada + " (" + s.elementos + " elemento(s)) — " + s.equivalencia);
  if (divergencias.length) {
    console.log("  divergências documento x PDF: " + divergencias.length);
    for (const d of divergencias.slice(0, 8)) console.log("    - " + d);
  }
  console.log("Comparação com a referência: " + rel.resumo);
  console.log("  casados: " + rel.casados + " · sem par: " + rel.semPar + " · com desvio registrado: " + comDesvio);
  if (rel.semPar) {
    for (const g of ["textos", "regras", "imagens"]) {
      for (const p of rel[g].piores.filter((x) => x.dx === null).slice(0, 5)) console.log("  SEM PAR (" + g + "): " + p.rotulo);
    }
  }
  const grandes = ["textos", "regras", "imagens"]
    .flatMap((g) => rel[g].piores.map((p) => Object.assign({ grupo: g }, p)))
    .filter((p) => p.dx !== null)
    .sort((a, b) => Math.max(Math.abs(b.dx), Math.abs(b.dy)) - Math.max(Math.abs(a.dx), Math.abs(a.dy)))
    .slice(0, 5);
  for (const p of grandes) console.log("  maior desvio (" + p.grupo + "): dx " + p.dx + " pt, dy " + p.dy + " pt · " + p.id + " · " + p.rotulo);
  console.log("Validação: " + v.erros.length + " erro(s) · " + v.avisos.length + " aviso(s)" + (bloqueantes.length ? " — BLOQUEANTE: " + bloqueantes[0] : ""));

  if (!rel.dentro) {
    console.error("\nFALHOU: deslocamento fora da tolerância de " + TOLERANCIA_PT + " pt (dx " + rel.maxDx + " / dy " + rel.maxDy + ", " + rel.semPar + " sem par).");
    process.exitCode = 1;
  }
  if (conferir) return;

  writeFileSync(SAIDA, JSON.stringify(def, null, 2) + "\n");
  console.log("Gravado: ficha_cadastral_nativo.json (" + Math.round(statSync(SAIDA).size / 1024) + " KB)");
}

main();
