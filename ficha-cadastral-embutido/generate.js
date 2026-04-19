// generate.js
// Recria o PDF "Ficha Cadastral de Admissão" inteiramente via pdf-lib,
// a partir de um template declarativo (template.json) + assets PNG embutidos.
// Nenhum PDF externo é carregado: o próprio código desenha layout, linhas,
// caixas e imagens, e escreve os dados do candidato por cima.

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb, PDFHexString, degrees } = require("pdf-lib");
const operators = require("pdf-lib/cjs/api/operators");
const fontkit = require("@pdf-lib/fontkit");

// ---------------------------------------------------------------------------
// Helper: quebra texto em linhas que cabem dentro de maxWidth
// ---------------------------------------------------------------------------
function wrapText(text, font, size, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    const w = font.widthOfTextAtSize(candidate, size);
    if (w > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ---------------------------------------------------------------------------
// Helper: "#RRGGBB" → cor pdf-lib (usado pelas divisórias coloridas do cabeçalho)
// ---------------------------------------------------------------------------
function hexToRgb(hex) {
  const h = String(hex).replace("#", "");
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  );
}

// ---------------------------------------------------------------------------
// Helper: espessura (pt) de uma divisória — `width`/`height` carregam o
// comprimento e a espessura; a espessura é o menor dos dois (0,48 pt na
// prática). Sem os dois, 0,48.
// ---------------------------------------------------------------------------
function espessuraDaDivisoria(bar) {
  const w = Number(bar.width) || 0;
  const h = Number(bar.height) || 0;
  if (w > 0 && h > 0) return Math.min(w, h);
  return w || h || 0.48;
}

async function generateFichaCadastral(data = {}) {
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, "template.json"), "utf-8"));

  const pdfDoc = await PDFDocument.create();

  // Registra fontkit para suporte a fontes TTF customizadas
  pdfDoc.registerFontkit(fontkit);

  const page = pdfDoc.addPage([template.page.width, template.page.height]);

  // ---- Fontes padrão (fallback) ----
  const helv     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ---- Fontes customizadas (TTF declaradas em template.fontes) ----
  const customFontCache = {};
  async function getCustomFont(name) {
    if (customFontCache[name]) return customFontCache[name];
    const decl = (template.fontes || {})[name];
    const rel = decl && decl.arquivo;
    if (!rel) return null;
    const fullPath = path.join(__dirname, rel);
    if (!fs.existsSync(fullPath)) return null;
    const bytes = fs.readFileSync(fullPath);
    const f = await pdfDoc.embedFont(bytes);
    customFontCache[name] = f;
    return f;
  }

  // Pre-carrega as fontes usadas no cabeçalho e nos textos (o `|| helv*` é o
  // fallback declarado em template.fontes, caso o TTF não esteja no repositório).
  const fallbackPadrao = { "Helvetica": helv, "Helvetica-Bold": helvBold };
  async function fonteDoTemplate(nome) {
    const decl = (template.fontes || {})[nome];
    if (!decl) return null;
    return (await getCustomFont(nome)) || fallbackPadrao[decl.fallback] || helv;
  }

  const arialNarrow     = (await fonteDoTemplate("Arial-Narrow"))      || helv;
  const arialNarrowBold = (await fonteDoTemplate("Arial-Narrow-Bold")) || helvBold;
  const arial           = (await fonteDoTemplate("Arial"))             || helv;
  const arialBold       = (await fonteDoTemplate("Arial-Bold"))        || helvBold;

  // ---- Fonte das checkboxes ----
  // O original usa o glifo Unicode U+2751 (quadrado branco com sombra) gravado
  // como texto Wingdings. A Wingdings do Windows não cobre U+2751; o Segoe UI
  // Symbol tem o glifo idêntico. Se o TTF não estiver disponível, cai no
  // quadrado vetorial desenhado (sem sombra).
  const simboloTtf = path.join(__dirname, "assets", "seguisym.ttf");
  const fonteCheckbox = fs.existsSync(simboloTtf)
    ? await pdfDoc.embedFont(fs.readFileSync(simboloTtf))
    : null;
  const GLIFO_CHECKBOX = "\u2751";

  // Mapa de nomes de fonte (template.json → objeto de fonte embedado)
  const fontMap = {
    "Helvetica":        helv,
    "Helvetica-Bold":   helvBold,
    "Arial-Narrow":     arialNarrow,
    "Arial-Narrow-Bold": arialNarrowBold,
    "Arial":            arial,
    "Arial-Bold":       arialBold,
  };

  // 1) Camada de fundo: imagens embutidas (logos + molduras/grades das tabelas)
  const imageCache = {};
  for (const img of template.images) {
    const bytes = fs.readFileSync(path.join(__dirname, img.file));
    if (!imageCache[img.file]) {
      imageCache[img.file] = await pdfDoc.embedPng(bytes);
    }
    const embedded = imageCache[img.file];
    if (img.rotacao) {
      // Imagem com rotação (ex.: carimbo "Uso Interno" do Canva, gravado a
      // -30° no PDF). drawImage gira em torno do canto (x,y); desloca x/y para
      // que o CENTRO da imagem girada coincida com o centro do bbox original.
      const teta = (img.rotacao * Math.PI) / 180;
      const dx = img.width / 2, dy = img.height / 2;
      const cx = img.x + dx, cy = img.y + dy;
      page.drawImage(embedded, {
        x: cx - (dx * Math.cos(teta) - dy * Math.sin(teta)),
        y: cy - (dx * Math.sin(teta) + dy * Math.cos(teta)),
        width: img.width,
        height: img.height,
        rotate: degrees(img.rotacao),
      });
    } else {
      page.drawImage(embedded, { x: img.x, y: img.y, width: img.width, height: img.height });
    }
  }

  // 2) Divisórias vetoriais (linhas finas pretas reais do documento original;
  //    `cor` para as réguas coloridas e `tracejado` para as linhas pontilhadas)
  for (const bar of template.blackBars) {
    const color = bar.cor ? hexToRgb(bar.cor) : rgb(0, 0, 0);
    if (bar.tracejado) {
      // `width`/`height` são o COMPRIMENTO e a ESPESSURA da divisória: a
      // espessura é sempre o menor dos dois (297 x 0,48 = linha de 0,48 pt).
      page.drawLine({
        start: { x: bar.x, y: bar.y },
        end: { x: bar.x + bar.width, y: bar.y + bar.height },
        thickness: espessuraDaDivisoria(bar),
        color,
        dashArray: bar.tracejado,
      });
      continue;
    }
    page.drawRectangle({
      x: bar.x, y: bar.y, width: bar.width, height: bar.height,
      color,
    });
  }

  // 2b) Caixas de campo (as linhas verticais/horizontais das tabelas): fundo
  //     branco + borda preta, exatamente como o Canva as desenhou no original.
  for (const bx of template.whiteBoxes || []) {
    const opts = {
      x: bx.x, y: bx.y, width: bx.width, height: bx.height,
      color: rgb(1, 1, 1),
    };
    if (bx.borda) {
      opts.borderColor = rgb(0, 0, 0);
      opts.borderWidth = bx.borda;
    }
    page.drawRectangle(opts);
  }

  // 3) Texto estático do layout (rótulos, títulos, cabeçalho)
  //    Entradas com "maxWidth" disparam word-wrap automático.
  //    Entradas com "espacamentoEntreGlifos" (pt extras por glifo, ex.: 0.13)
  //    são desenhadas via operadores brutos com o operador Tc do PDF — o Canva
  //    gerou o texto dessas linhas com letter-spacing que o TTF puro não
  //    reproduz, e sem o Tc elas terminam antes do fim da linha do original.
  for (const t of template.texts) {
    const font = fontMap[t.font] || helv;
    const size = t.size;
    const lineHeight = t.lineHeight || (size * 1.2);

    if (t.chars) {
      // Texto ancorado caractere a caractere: cada glifo recebe a origem x
      // EXATA do original (rawdict do PDF de referência). Reproduz o kerning
      // irregular do Canva, que nem letter-spacing uniforme (Tc) alcança.
      for (const c of t.chars) {
        page.drawText(c.c, { x: c.x, y: t.y, size, font, color: rgb(0, 0, 0) });
      }
      continue;
    }

    if (t.palavras) {
      // Texto ancorado palavra a palavra: cada palavra recebe a coordenada x
      // EXATA do original (extraída do PDF de referência). Reproduz o kerning
      // irregular do Canva, que letter-spacing uniforme (Tc) não alcança.
      for (const p of t.palavras) {
        page.drawText(p.t, { x: p.x, y: t.y, size, font, color: rgb(0, 0, 0) });
      }
      continue;
    }

    if (t.espacamentoEntreGlifos) {
      const O = operators;
      const fontKey = page.node.newFontDictionary(font.name, font.ref);
      page.pushOperators(
        O.pushGraphicsState(),
        O.beginText(),
        O.setFillingRgbColor(0, 0, 0),
        O.setFontAndSize(fontKey, size),
        O.setCharacterSpacing(t.espacamentoEntreGlifos),
        O.rotateAndSkewTextRadiansAndTranslate(0, 0, 0, t.x, t.y),
        O.showText(font.encodeText(t.text)),
        O.endText(),
        O.popGraphicsState(),
      );
      continue;
    }

    if (t.maxWidth) {
      // Texto com quebra de linha automática
      const lines = wrapText(t.text, font, size, t.maxWidth);
      lines.forEach((line, idx) => {
        page.drawText(line, {
          x: t.x,
          y: t.y - idx * lineHeight,
          size,
          font,
          color: rgb(0, 0, 0),
        });
      });
    } else {
      page.drawText(t.text, {
        x: t.x, y: t.y, size, font,
        color: rgb(0, 0, 0),
      });
    }
  }

  // 4) Checkboxes: o original as grava como TEXTO (glifo U+2751 Wingdings,
  //    quadrado branco com sombra). Cada glifo usa a ORIGEM exata (x, baseline)
  //    e o size extraidos do PDF de referencia — sem heuristica de posicao.
  for (const cb of template.checkboxes) {
    if (fonteCheckbox && cb.base != null) {
      page.drawText(GLIFO_CHECKBOX, {
        x: cb.x,
        y: cb.base,
        size: cb.size,
        font: fonteCheckbox,
        color: rgb(0, 0, 0),
      });
    } else if (fonteCheckbox) {
      // Fallback legado (checkboxes geometricas): quadrado visual dentro do bbox
      const w = cb.width != null ? cb.width : cb.side;
      const h = cb.height != null ? cb.height : cb.side;
      const size = cb.size || (w / 0.703);
      page.drawText(GLIFO_CHECKBOX, {
        x: cb.x - 0.55,
        y: cb.y + h - size * 0.035 - (9.96 - size) * 1.4,
        size,
        font: fonteCheckbox,
        color: rgb(0, 0, 0),
      });
    } else {
      const w = cb.width != null ? cb.width : cb.side;
      const h = cb.height != null ? cb.height : cb.side;
      page.drawRectangle({
        x: cb.x, y: cb.y,
        width: w,
        height: h,
        color: rgb(1, 1, 1),
        borderColor: rgb(0, 0, 0),
        borderWidth: cb.borda || 0.5,
      });
    }
  }

  // 5) Dados dinâmicos do candidato
  if (data.nomeCompleto) {
    // Caixa do campo "Nome Completo" fica em y=694.48-706.78 (whiteBox);
    // 685.30 caia em cima da linha "Nome Social" logo abaixo, sobrepondo o
    // rotulo (bug). Usa a mesma folga da caixa do telefone (~1.5pt acima do
    // fundo da caixa).
    page.drawText(data.nomeCompleto, { x: 19.57, y: 696.0, size: 7.5, font: arial });
  }
  if (data.telefone) {
    page.drawText(data.telefone, { x: 58, y: 650.65, size: 7.5, font: arial });
  }
  if (data.email) {
    page.drawText(data.email, { x: 50, y: 629.68, size: 7.5, font: arial });
  }

  return pdfDoc.save();
}

// Execução direta: gera output.pdf de comparação de layout (sem dados do
// candidato — o PDF oficial F-075 vem em branco).
if (require.main === module) {
  generateFichaCadastral({}).then((bytes) => {
    fs.writeFileSync(path.join(__dirname, "output.pdf"), bytes);
    console.log("Gerado: output.pdf");
  });
}

module.exports = { generateFichaCadastral };
