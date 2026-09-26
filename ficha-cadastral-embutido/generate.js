// generate.js
// Recria o PDF "Ficha Cadastral de Admissão" inteiramente via pdf-lib,
// a partir de um template declarativo (template.json) + assets PNG embutidos.
// Nenhum PDF externo é carregado: o próprio código desenha layout, linhas,
// caixas e imagens, e escreve os dados do candidato por cima.

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

async function generateFichaCadastral(data = {}) {
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, "template.json"), "utf-8"));

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([template.page.width, template.page.height]);

  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMap = { Helvetica: helv, "Helvetica-Bold": helvBold };

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

  // 3) Pequenas caixas brancas (mesmo truque visual do original, cobre
  //    trechos da grade para dar acabamento limpo às áreas de checkbox)
  for (const box of template.whiteBoxes) {
    page.drawRectangle({
      x: box.x, y: box.y, width: box.width, height: box.height,
      color: rgb(1, 1, 1),
    });
  }

  // 4) Texto estático do layout (rótulos, títulos, cabeçalho) — desenhado
  //    palavra por palavra na posição exata extraída do PDF original
  for (const t of template.texts) {
    page.drawText(t.text, {
      x: t.x, y: t.y, size: t.size, font: fontMap[t.font] || helv,
      color: rgb(0, 0, 0),
    });
  }

  // 5) Checkboxes: quadrados vetoriais no lugar do glyph "❑" (evita
  //    depender de fonte customizada só por causa de um símbolo)
  for (const cb of template.checkboxes) {
    page.drawRectangle({
      x: cb.x, y: cb.y, width: cb.side, height: cb.side,
      borderColor: rgb(0, 0, 0), borderWidth: 0.75,
    });
  }

  // 6) Dados dinâmicos do candidato (exemplo de uso — mesmas coordenadas
  //    que hoje já vivem no módulo "Coordenadas" do admin)
  if (data.nomeCompleto) {
    page.drawText(data.nomeCompleto, { x: 22, y: template.page.height - 152, size: 8, font: helv });
  }
  if (data.telefone) {
    page.drawText(data.telefone, { x: 90, y: template.page.height - 184, size: 8, font: helv });
  }
  if (data.email) {
    page.drawText(data.email, { x: 90, y: template.page.height - 205, size: 8, font: helv });
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
