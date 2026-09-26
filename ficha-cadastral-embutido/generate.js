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

  // (Não existe mais uma etapa de "caixas brancas de acabamento" aqui.
  // Elas formavam, no PDF original, um par preto+branco quase idêntico
  // usado só para apagar um trecho da grade da imagem de fundo. Extraídos
  // como dois elementos separados e redesenhados, qualquer imprecisão de
  // arredondamento entre os dois deixava uma fresta preta visível — o
  // efeito de "linha torta/quebrada" relatado. A imagem de fundo já traz
  // essas linhas corretas e contínuas, então o par inteiro foi descartado
  // na extração: ver extract_template.py, filtro `if h > 3: continue`.)

  // 3) Texto estático do layout (rótulos, títulos, cabeçalho) — desenhado
  //    palavra por palavra na posição exata extraída do PDF original
  for (const t of template.texts) {
    page.drawText(t.text, {
      x: t.x, y: t.y, size: t.size, font: fontMap[t.font] || helv,
      color: rgb(0, 0, 0),
    });
  }

  // 4) Checkboxes: quadrados vetoriais no lugar do glyph "❑" (evita
  //    depender de fonte customizada só por causa de um símbolo)
  for (const cb of template.checkboxes) {
    page.drawRectangle({
      x: cb.x, y: cb.y, width: cb.side, height: cb.side,
      borderColor: rgb(0, 0, 0), borderWidth: 0.75,
    });
  }

  // 5) Dados dinâmicos do candidato (exemplo de uso — mesmas coordenadas
  //    que hoje já vivem no módulo "Coordenadas" do admin)
  // As posições abaixo usam a MESMA linha de base real dos rótulos vizinhos
  // (a mesma fonte de coordenada corrigida no fix da linha de base), então
  // continuam corretas mesmo se o layout for reextraído no futuro.
  if (data.nomeCompleto) {
    // Nome vai na faixa em branco entre o rótulo "Nome Completo:" (baseline
    // y=696.03) e a divisória que inicia a linha "Nome Social:" (y=685.30
    // topo-baixo 156.95) — baseline própria, ~3pt acima dessa divisória.
    page.drawText(data.nomeCompleto, { x: 19.57, y: 685.30, size: 7.5, font: helv });
  }
  if (data.telefone) {
    // Mesma linha de base do rótulo "Telefone:" (y=650.65), começando
    // logo após o texto do rótulo (x1≈50.58).
    page.drawText(data.telefone, { x: 58, y: 650.65, size: 7.5, font: helv });
  }
  if (data.email) {
    // Mesma linha de base do rótulo "E-mail:" (y=629.68), logo após o
    // texto do rótulo (x1≈42.83).
    page.drawText(data.email, { x: 50, y: 629.68, size: 7.5, font: helv });
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
