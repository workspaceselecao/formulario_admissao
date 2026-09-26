/**
 * ============================================================
 * EMBEDDED DOCS — geração 100% EMBARCADA de PDFs
 * ============================================================
 *
 * Substitui o gerador "nativo" (native-docs.js): em vez de recriar o
 * formulário elemento a elemento (textos fixos, réguas, caixas — o que
 * exigia calibração manual infinita), o PDF é montado a partir de um
 * TEMPLATE DECLARATIVO extraído do documento oficial:
 *
 *   template.json  — página, imagens (logos/molduras), barras pretas,
 *                    caixas brancas, textos estáticos e caixas de marcação;
 *   assets/*.png   — bytes das imagens (versionados no repositório);
 *   campos do schema (*_campos.json) — onde os DADOS do candidato entram.
 *
 * Nenhum PDF externo é carregado nem enviado: o próprio código desenha
 * tudo (pdf-lib) e escreve os dados por cima. O perfil de texto é o MESMO
 * da aplicação pública (ficha_cadastral.html), conferido pela suíte:
 *   • fonte 9 pt, Helvetica, truncamento na largura do campo − 2 pt;
 *   • baseline = y + min(altura × 0,78; 9 × 1,12), offset −9 pt quando
 *     y > 120 (LIMITE_Y_SEM_OFFSET_TEXTO_PT), x + 0,5 pt.
 *
 * Sem DOM, sem fetch, sem localStorage: as imagens chegam prontas
 * ({ imagens: { "assets/img0.png": Uint8Array } }) — no navegador o painel
 * baixa os bytes; em Node a suíte lê do disco. Multi-página: o template
 * declara `paginas` (cada uma com suas camadas) e os campos apontam a
 * página via `pagina`/`page` do schema (padrão 1).
 *
 * API: EmbeddedDocs.validarTemplate · EmbeddedDocs.gerarPdf
 *      EmbeddedDocs.PAGINA_MAX · EmbeddedDocs.PERFIL_APP
 * (window.EmbeddedDocs no navegador; require em Node.)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EmbeddedDocs = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FONTES_PADRAO = ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique", "Times-Roman", "Times-Bold", "Times-Italic", "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"];

  var SCHEMA_VERSION = "1.0";
  /** Campo fica fora da página acima desta folga (pt) — validação §31. */
  var FOLGA_FORA_PAGINA_PT = 12;

  /** Perfil de texto da aplicação (fonte de verdade: ficha_cadastral.html). */
  var PERFIL_APP = {
    fonte: "Helvetica",
    tamanho: 9,
    offsetX: 0.5,
    alturaFracao: 0.78,
    alturaTeto: 1.12,
    limiteYSemOffset: 120,
    offsetYUmaLinha: 9
  };

  /** Tamanho máximo de template (bytes) — guarda de custo, igual ao upload de PDF. */
  var TEMPLATE_MAX_BYTES = 8 * 1024 * 1024;
  /** Limites estruturais por camada (evita JSON malicioso/quebrado travar a aba). */
  var LIMITES = { imagens: 64, blackBars: 400, whiteBoxes: 400, texts: 1200, checkboxes: 200, paginas: 8 };

  function ehNumero(v) { return typeof v === "number" && isFinite(v); }
  function num(v, padrao) { var n = Number(v); return isFinite(n) ? n : (padrao || 0); }
  function arred(n) { return Math.round(num(n) * 100) / 100; }

  /**
   * Validação estrutural do template + contagem dos campos do schema.
   * Nunca lança: retorna { ok, erros[], avisos[], resumo }.
   * erros = impede geração (estrutura/dimensão/limite); avisos = incompleto
   * porém gerável (template sem textos estáticos, schema sem campos…).
   */
  function validarTemplate(template, schemaCampos) {
    var erros = [], avisos = [];
    if (!template || typeof template !== "object") {
      return { ok: false, erros: ["Template ausente ou inválido (esperado objeto template.json)."], avisos: [], resumo: null };
    }
    var page = template.page || {};
    if (!ehNumero(page.width) || !ehNumero(page.height) || page.width <= 0 || page.height <= 0) {
      erros.push("page.width/height ausentes ou inválidos — o tamanho da página é obrigatório (nada é inventado).");
    }
    var paginas = template.paginas;
    if (paginas != null) {
      if (!Array.isArray(paginas) || !paginas.length) erros.push("`paginas` declarado mas vazio (esperada lista de páginas).");
      else if (paginas.length > LIMITES.paginas) erros.push("Template com " + paginas.length + " página(s) — limite é " + LIMITES.paginas + ".");
    }
    var camadas = [["images", LIMITES.imagens], ["blackBars", LIMITES.blackBars], ["whiteBoxes", LIMITES.whiteBoxes], ["texts", LIMITES.textos || LIMITES.texts], ["checkboxes", LIMITES.checkboxes]];
    var contagens = {};
    for (var ci = 0; ci < camadas.length; ci++) {
      var chave = camadas[ci][0], max = camadas[ci][1];
      var lista = template[chave];
      if (lista == null) { contagens[chave] = 0; continue; }
      if (!Array.isArray(lista)) { erros.push("`" + chave + "` deve ser uma lista."); contagens[chave] = 0; continue; }
      if (lista.length > max) erros.push("`" + chave + "` tem " + lista.length + " item(ns) — limite é " + max + ".");
      contagens[chave] = lista.length;
    }
    var imagensSemArquivo = 0;
    for (var ii = 0; ii < (template.images || []).length; ii++) {
      var img = template.images[ii];
      if (!img || !img.file || typeof img.file !== "string" || !/^[\w.-]+$/.test(img.file.replace(/[/\\]/g, "/").split("/").pop())) imagensSemArquivo++;
      if (img && (img.width == null || img.height == null)) avisos.push("Imagem `" + (img && img.file || "?") + "` sem width/height (usa dimensão natural do PNG).");
    }
    if (imagensSemArquivo) erros.push(imagensSemArquivo + " imagem(ns) com `file` inválido (esperado nome de asset, ex.: assets/img0.png).");
    if (!contagens.texts) avisos.push("Template sem textos estáticos — confirme que é o template completo (layout vazio imprime só os dados).");
    if (!contagens.checkboxes && !contagens.blackBars) avisos.push("Template sem caixas de marcação nem barras — típico de extração parcial.");
    if (template.fontes) {
      for (var ti = 0; ti < (template.texts || []).length; ti++) {
        var f = (template.texts[ti] || {}).font;
        if (f && FONTES_PADRAO.indexOf(f) === -1) { erros.push("Fonte não padrão do PDF em texts: `" + f + "` (use " + FONTES_PADRAO.join(", ") + ")."); break; }
      }
    }
    // Campos do schema: contagem para o resumo e aviso quando o schema está vazio.
    var nCampos = 0;
    if (schemaCampos) {
      var folhas = [];
      coletarCoordenadas(schemaCampos, "", folhas, 0);
      nCampos = folhas.length;
      if (!nCampos) avisos.push("Schema sem campos com coordenadas — o PDF sai sem dados dinâmicos.");
      for (var fi = 0; fi < folhas.length; fi++) {
        var c = folhas[fi].coordenadas;
        if (!ehNumero(c.x) || !ehNumero(c.y)) { erros.push("Campo `" + folhas[fi].path + "` com coordenada inválida (x/y numéricos obrigatórios)."); break; }
      }
    }
    return {
      ok: erros.length === 0,
      erros: erros,
      avisos: avisos,
      resumo: {
        pagina: { width: arred(page.width), height: arred(page.height) },
        paginas: paginas ? paginas.length : 1,
        camadas: contagens,
        campos: nCampos
      }
    };
  }

  /** Aplatina o schema (mesma ordem do Editor Visual): path → { label, coordenadas, pagina }. */
  function coletarCoordenadas(no, caminho, saida, profundidade) {
    if (!no || typeof no !== "object" || profundidade > 12) return;
    if (no.coordenadas && typeof no.coordenadas === "object") {
      saida.push({
        path: caminho,
        label: no.label || "",
        tipo: no.tipo || no.type || null,
        coordenadas: no.coordenadas,
        pagina: num(no.pagina != null ? no.pagina : no.page, 1)
      });
    }
    for (var k in no) {
      if (!Object.prototype.hasOwnProperty.call(no, k) || k === "coordenadas") continue;
      var v = no[k];
      if (v && typeof v === "object" && !Array.isArray(v)) coletarCoordenadas(v, caminho ? caminho + "." + k : k, saida, profundidade + 1);
      else if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) {
          if (v[i] && typeof v[i] === "object") coletarCoordenadas(v[i], caminho + "." + i, saida, profundidade + 1);
        }
      }
    }
  }

  function folhasComCoordenadas(schemaCampos) {
    var saida = [];
    coletarCoordenadas(schemaCampos || {}, "", saida, 0);
    return saida;
  }

  /** Cálculo do Y de baseline (espaço pdf-lib, origem no canto INFERIOR esquerdo). */
  function baselinePdf(coordenada, tamanhoFonte) {
    var yBottom = num(coordenada.y);
    var h = num(coordenada.altura != null ? coordenada.altura : coordenada.height, 12);
    var y = yBottom + Math.min(h * PERFIL_APP.alturaFracao, tamanhoFonte * PERFIL_APP.alturaTeto);
    if (yBottom > PERFIL_APP.limiteYSemOffset) y -= PERFIL_APP.offsetYUmaLinha;
    return y;
  }

  /** Binária de truncamento idêntica a truncarTextoFonte() do app público. */
  function truncarTexto(font, texto, tamanho, larguraMax) {
    var t = String(texto == null ? "" : texto).trim();
    if (!t) return "";
    if (font.widthOfTextAtSize(t, tamanho) <= larguraMax) return t;
    var pontos = "...";
    var baixo = 0, alto = t.length;
    while (baixo < alto) {
      var meio = Math.ceil((baixo + alto) / 2);
      if (font.widthOfTextAtSize(t.slice(0, meio) + pontos, tamanho) <= larguraMax) baixo = meio;
      else alto = meio - 1;
    }
    return t.slice(0, alto) + pontos;
  }

  /** Páginas do template: `paginas[]` quando declarado; senão uma página única a partir das camadas soltas. */
  function paginasDoTemplate(template) {
    if (Array.isArray(template.paginas) && template.paginas.length) return template.paginas;
    return [{ images: template.images || [], blackBars: template.blackBars || [], whiteBoxes: template.whiteBoxes || [], texts: template.texts || [], checkboxes: template.checkboxes || [] }];
  }

  /**
   * Gera o PDF: template + assets + dados. `dados` é um mapa FLAT
   * ("dados_pessoais.campos.nome" → valor) — as folhas do schema, a mesma
   * chave que o Editor Visual e o overlay usam. Campos sem valor ficam em
   * branco; nada é inventado. Opções: { autor } (metadado do PDF).
   *
   * Retorna { bytes, paginas, desenhados, ignorados[], relatorio }.
   */
  function gerarPdf(template, schemaCampos, dados, PDFLib, assets, opcoes) {
    var ops = opcoes || {};
    var dadosMapa = dados || {};
    var imagens = (assets && assets.imagens) || {};
    if (!PDFLib || !PDFLib.PDFDocument) return Promise.reject(new Error("pdf-lib não disponível (CDN/bundle)."));
    if (!template || typeof template !== "object") return Promise.reject(new Error("Template ausente — carregue o template.json do documento."));

    var v = validarTemplate(template, schemaCampos);
    if (!v.ok) return Promise.reject(new Error("Template inválido: " + v.erros[0]));

    return PDFLib.PDFDocument.create().then(function (pdfDoc) {
      // embedFont é assíncrono: as fontes padrão precisam estar embutidas antes
      // de qualquer drawText (pdf-lib rejeita com erro obscuro caso contrário).
      return Promise.all([
        pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica),
        pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold)
      ]).then(function (fontes) {
      var helv = fontes[0], helvBold = fontes[1];
      var mapaFontes = {
        "Helvetica": helv, "Helvetica-Bold": helvBold,
        "Helvetica-Oblique": helv, "Helvetica-BoldOblique": helvBold,
        "Times-Roman": helv, "Times-Bold": helvBold, "Times-Italic": helv,
        "Courier": helv, "Courier-Bold": helvBold, "Courier-Oblique": helv, "Courier-BoldOblique": helvBold
      };
      var pageW = num(template.page.width), pageH = num(template.page.height);
      var pngCache = {};
      var relatorio = { imagensFaltando: [], textos: 0, checkboxes: 0, barras: 0 };
      var folhasPdf = [];      // página pdf-lib por índice (o PDF real)
      var paginas = paginasDoTemplate(template);

      // ── 1) Camadas de fundo por página (imagens → barras → caixas brancas → textos → marcações)
      return PDFLib.all ? Promise.all(paginas.map(function (p, idx) {
        return desenharPagina(pdfDoc, p, idx);
      })).then(function () { return finalizar(); }) : desenharPaginasSequencial().then(function () { return finalizar(); });

      function desenharPaginasSequencial() {
        var corrente = Promise.resolve();
        for (var i = 0; i < paginas.length; i++) {
          (function (p, idx) { corrente = corrente.then(function () { return desenharPagina(pdfDoc, p, idx); }); })(paginas[i], i);
        }
        return corrente;
      }

      function desenharPagina(pdfDocLocal, camadas, idx) {
        var folha = pdfDocLocal.addPage([pageW, pageH]);
        folhasPdf[idx] = folha;
        var lista = camadas.images || [];
        // Embed SEQUENCIAL e desenho na ordem fixa do template: com Promise.all,
        // drawImage rodava na ordem de CONCLUSÃO das promessas (variável entre
        // execuções) e os bytes do PDF divergiam de uma geração para outra.
        var corrente = Promise.resolve();
        for (var i = 0; i < lista.length; i++) {
          (function (img) {
            corrente = corrente.then(function () {
              var file = img && img.file;
              var bytes = file ? imagens[file] : null;
              if (!bytes) { relatorio.imagensFaltando.push(file || "?"); return null; }
              var cache = pngCache[file];
              var embed = cache ? Promise.resolve(cache) : pdfDocLocal.embedPng(bytes).then(function (emb) { pngCache[file] = emb; return emb; });
              return embed.then(function (emb) {
                folha.drawImage(emb, { x: num(img.x), y: num(img.y), width: num(img.width, emb.width), height: num(img.height, emb.height) });
                return null;
              }).catch(function (e) { relatorio.imagensFaltando.push(file + " (falha: " + (e && e.message || "?") + ")"); });
            });
          })(lista[i]);
        }
        return corrente.then(function () {
          var cor = PDFLib.rgb(0, 0, 0);
          var barras = camadas.blackBars || [];
          for (var b = 0; b < barras.length; b++) {
            var bar = barras[b];
            if (!bar || num(bar.width) <= 0 || num(bar.height) <= 0) continue;
            folha.drawRectangle({ x: num(bar.x), y: num(bar.y), width: num(bar.width), height: num(bar.height), color: cor });
          }
          relatorio.barras += barras.length;
          var brancas = camadas.whiteBoxes || [];
          var branco = PDFLib.rgb(1, 1, 1);
          for (var w = 0; w < brancas.length; w++) {
            var bx = brancas[w];
            if (!bx || num(bx.width) <= 0 || num(bx.height) <= 0) continue;
            folha.drawRectangle({ x: num(bx.x), y: num(bx.y), width: num(bx.width), height: num(bx.height), color: branco });
          }
          var textos = camadas.texts || [];
          for (var t = 0; t < textos.length; t++) {
            var tx = textos[t];
            if (!tx || !tx.text) continue;
            var fnt = mapaFontes[tx.font] || helv;
            folha.drawText(String(tx.text), { x: num(tx.x), y: num(tx.y), size: num(tx.size, 9), font: fnt, color: cor });
          }
          relatorio.textos += textos.length;
          var cbs = camadas.checkboxes || [];
          for (var c = 0; c < cbs.length; c++) {
            var cb = cbs[c];
            if (!cb) continue;
            var lado = num(cb.side, 5);
            if (lado <= 0) continue;
            folha.drawRectangle({ x: num(cb.x), y: num(cb.y), width: lado, height: lado, borderColor: cor, borderWidth: 0.75 });
          }
          relatorio.checkboxes += cbs.length;
        });
      }

      // ── 2) Dados do candidato por cima (perfil da aplicação) ──
      function finalizar() {
        var folhas = folhasComCoordenadas(schemaCampos || {});
        var desenhados = 0, ignorados = [];
        for (var i = 0; i < folhas.length; i++) {
          var f = folhas[i];
          var valor = valorDaFolha(dadosMapa, f.path);
          var vazio = valor == null || valor === "" || valor === false;
          if (vazio) { ignorados.push({ id: f.path, motivo: "sem valor informado" }); continue; }
          var idxPagina = Math.max(1, Math.round(num(f.pagina, 1))) - 1;
          if (idxPagina >= paginas.length) { ignorados.push({ id: f.path, motivo: "página " + (idxPagina + 1) + " fora do template (" + paginas.length + " pág.)" }); continue; }
          var coordenada = f.coordenadas || {};
          var x = num(coordenada.x), yBase = num(coordenada.y);
          if (x < -1 || yBase < -1 || x > pageW + FOLGA_FORA_PAGINA_PT || yBase > pageH + FOLGA_FORA_PAGINA_PT) {
            ignorados.push({ id: f.path, motivo: "coordenada fora da página (" + arred(x) + ", " + arred(yBase) + ")" });
            continue;
          }
          var w = num(coordenada.largura != null ? coordenada.largura : coordenada.width, 200);
          var str = truncarTexto(helv, String(valor), PERFIL_APP.tamanho, Math.max(8, w - 2));
          if (!str) { ignorados.push({ id: f.path, motivo: "texto vazio após truncar" }); continue; }
          var alvo = folhasPdf[idxPagina];
          if (!alvo) { ignorados.push({ id: f.path, motivo: "página " + (idxPagina + 1) + " não desenhada" }); continue; }
          alvo.drawText(str, {
            x: x + PERFIL_APP.offsetX,
            y: baselinePdf(coordenada, PERFIL_APP.tamanho),
            size: PERFIL_APP.tamanho,
            font: helv
          });
          desenhados++;
        }
        if (ops.autor) {
          try { pdfDoc.setProducer("Atentoform — geração embarcada"); pdfDoc.setCreator("embedded-docs.js"); } catch (e) { /* metadado é best-effort */ }
        }
        // Datas congeladas por padrão: o pdf-lib grava ModDate/CreationDate com o
        // relógio do momento, e gerações em segundos diferentes produziam bytes
        // distintos (o teste de determinismo da auditoria acusava). Ops.dataIso
        // permite carimbar uma data explícita quando fizer sentido.
        var dataIso = ops.dataIso != null ? String(ops.dataIso) : "2000-01-01T00:00:00.000Z";
        var dataPdf = String(dataIso).replace(/[-:T]/g, "").slice(0, 14) + "Z";
        try { pdfDoc.setCreationDate(new Date(dataIso)); pdfDoc.setModificationDate(new Date(dataIso)); } catch (e) { /* best-effort */ }
        return pdfDoc.save().then(function (bytes) {
          return { bytes: bytes, paginas: paginas.length, desenhados: desenhados, ignorados: ignorados, relatorio: relatorio };
        });
      }
      });
    });
  }

  /** Lê o valor no mapa FLAT pelo path da folha (aceita mapa aninhado também, para o modo do app). */
  function valorDaFolha(dados, path) {
    if (!dados) return null;
    if (Object.prototype.hasOwnProperty.call(dados, path)) return dados[path];
    var partes = String(path).split(".");
    var no = dados;
    for (var i = 0; i < partes.length; i++) {
      if (no == null || typeof no !== "object") return null;
      no = no[partes[i]];
    }
    return no === undefined ? null : no;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    PERFIL_APP: PERFIL_APP,
    PAGINA_MAX: LIMITES.paginas,
    TEMPLATE_MAX_BYTES: TEMPLATE_MAX_BYTES,
    FONTES_PADRAO: FONTES_PADRAO,
    validarTemplate: validarTemplate,
    folhasComCoordenadas: folhasComCoordenadas,
    baselinePdf: baselinePdf,
    truncarTexto: truncarTexto,
    valorDaFolha: valorDaFolha,
    gerarPdf: gerarPdf
  };
});
