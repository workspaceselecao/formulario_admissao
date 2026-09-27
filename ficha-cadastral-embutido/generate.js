// generate.js
// Recria o PDF "Ficha Cadastral de Admissão" inteiramente via pdf-lib,
// a partir de um template declarativo (template.json) + assets PNG embutidos.
// Nenhum PDF externo é carregado: o próprio código desenha layout, linhas,
// caixas e imagens, e escreve os dados do candidato por cima.

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb, PDFHexString } = require("pdf-lib");
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
    page.drawImage(embedded, { x: img.x, y: img.y, width: img.width, height: img.height });
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

  // 4) Checkboxes: quadrados reais do documento (branco + borda 0,5 pt)
  for (const cb of template.checkboxes) {
    page.drawRectangle({
      x: cb.x, y: cb.y,
      width: cb.width != null ? cb.width : cb.side,
      height: cb.height != null ? cb.height : cb.side,
      color: rgb(1, 1, 1),
      borderColor: rgb(0, 0, 0),
      borderWidth: cb.borda || 0.5,
    });
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

// Execução direta: gera um PDF de exemplo em output.pdf
if (require.main === module) {
  generateFichaCadastral({
    nomeCompleto: "MARIA DA SILVA SANTOS",
    telefone: "(71) 99999-0000",
    email: "maria.santos@exemplo.com",
  }).then((bytes) => {
    fs.writeFileSync(path.join(__dirname, "output.pdf"), bytes);
    console.log("Gerado: output.pdf");
  });
}

module.exports = { generateFichaCadastral };
