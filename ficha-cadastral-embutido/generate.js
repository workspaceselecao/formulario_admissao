// generate.js
// Recria o PDF "Ficha Cadastral de Admissão" inteiramente via pdf-lib,
// a partir de um template declarativo (template.json) + assets PNG embutidos.
// Nenhum PDF externo é carregado: o próprio código desenha layout, linhas,
// caixas e imagens, e escreve os dados do candidato por cima.

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
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

  // 2) Divisórias vetoriais (linhas finas pretas reais do documento original)
  for (const bar of template.blackBars) {
    page.drawRectangle({
      x: bar.x, y: bar.y, width: bar.width, height: bar.height,
      color: rgb(0, 0, 0),
    });
  }

  // 3) Texto estático do layout (rótulos, títulos, cabeçalho)
  //    Entradas com "maxWidth" disparam word-wrap automático.
  for (const t of template.texts) {
    const font = fontMap[t.font] || helv;
    const size = t.size;
    const lineHeight = t.lineHeight || (size * 1.2);

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

  // 4) Checkboxes: quadrados vetoriais no lugar do glyph "❑"
  for (const cb of template.checkboxes) {
    page.drawRectangle({
      x: cb.x, y: cb.y, width: cb.side, height: cb.side,
      borderColor: rgb(0, 0, 0), borderWidth: 0.75,
    });
  }

  // 5) Dados dinâmicos do candidato
  if (data.nomeCompleto) {
    page.drawText(data.nomeCompleto, { x: 19.57, y: 685.30, size: 7.5, font: arial });
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
