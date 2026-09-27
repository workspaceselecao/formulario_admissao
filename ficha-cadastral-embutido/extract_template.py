"""
Script de extração: le um PDF pronto (padrão Atento) e gera automaticamente
o template.json + os assets PNG usados pelo generate.js (pdf-lib), SEM precisar
mapear coordenadas manualmente.

Uso:
    pip install pdfplumber pymupdf pillow --break-system-packages
    python3 extract_template.py caminho/do/PDF_original.pdf pasta_saida/

Isso extrai:
  - tamanho exato da pagina
  - imagens (logos e molduras/grades das tabelas) com alpha, ja compostas com a smask
  - linhas/retangulos vetoriais reais (divisorias pretas, caixas brancas de acabamento)
  - todo o texto estatico (rotulos), com fonte e tamanho originais, palavra por palavra
  - os simbolos de checkbox (glyph "❑"), convertidos em quadrados vetoriais

O resultado (template.json + assets/) e 100% embutivel no código: nenhum PDF
externo precisa ser carregado depois disso para gerar o documento.
"""
import sys, os, json, io
import pdfplumber
import fitz
from PIL import Image

FONT_MAP = {
    "Arial-BoldMT": "Arial-Bold",
    "ArialMT": "Arial",
    "ArialNarrow-Bold": "Arial-Narrow-Bold",
    "ArialNarrow": "Arial-Narrow",
    "HelveticaLTPro-Roman": "Helvetica",
    "Arial,Bold": "Arial-Bold",
    "Arial": "Arial",
    "TimesNewRoman": "Times-Roman",
    "Wingdings": "Symbol",
}

def map_font(fontname: str) -> str:
    base = fontname.split("+")[-1]
    for k, v in FONT_MAP.items():
        if k in base:
            return v
    return "Helvetica"

# Glifos que o PDF usa para desenhar uma caixa de marcação como texto.
GLIFOS_MARCACAO = ("❑", "☐", "□", "▫")


def _escuro(cor):
    """True se a cor de contorno e preta (ou quase)."""
    if not cor or not isinstance(cor, (tuple, list)) or len(cor) < 3:
        return False
    return all(c <= 0.2 for c in cor[:3])

def ja_tem_checkbox_perto(checkboxes, x, y, tol=3.0):
    """True se ja existe um quadrado DESENHADO (retangulo) nessa posicao.

    Alguns PDFs desenham a caixa E deixam o glifo; outros so usam o glifo.
    A comparacao e feita entre o glifo (origem x + linha de base y) e a caixa
    ja extraida, com uma tolerancia de 3 pt.
    """
    for cb in checkboxes:
        dentro_x = cb["x"] - tol <= x <= cb["x"] + cb["width"] + tol
        dentro_y = cb["y"] - tol <= y <= cb["y"] + cb["height"] + tol
        if dentro_x and dentro_y:
            return True
    return False

def extract(pdf_path: str, out_dir: str, page_index: int = 0):
    assets_dir = os.path.join(out_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)

    doc = fitz.open(pdf_path)
    page_fitz = doc[page_index]
    page_h, page_w = page_fitz.rect.height, page_fitz.rect.width

    template = {
        "page": {"width": round(page_w, 2), "height": round(page_h, 2)},
        "images": [], "blackBars": [], "whiteBoxes": [], "texts": [], "checkboxes": []
    }

    # Imagens (compostas com smask -> PNG RGBA), na ordem em que aparecem
    for i, im in enumerate(page_fitz.get_image_info(xrefs=True)):
        xref = im["xref"]
        base = doc.extract_image(xref)
        img = Image.open(io.BytesIO(base["image"])).convert("RGBA")
        smask_xref = base.get("smask")
        if smask_xref:
            smask_data = doc.extract_image(smask_xref)
            mask_img = Image.open(io.BytesIO(smask_data["image"])).convert("L")
            if mask_img.size != img.size:
                mask_img = mask_img.resize(img.size)
            img.putalpha(mask_img)
        fname = f"assets/img{i}.png"
        img.save(os.path.join(out_dir, fname))
        x0, y0, x1, y1 = im["bbox"]
        template["images"].append({
            "file": fname, "x": round(x0, 2), "y": round(page_h - y1, 2),
            "width": round(x1 - x0, 2), "height": round(y1 - y0, 2)
        })

    with pdfplumber.open(pdf_path) as pdf:
        p = pdf.pages[page_index]

        # IMPORTANTE: o pdf-plumber mede a partir da MEDIA BOX, e nao da Crop
        # Box. A F-075_37 tem MediaBox [0, 7.83, ...] e CropBox [0, 0, ...]:
        # usar a altura da pagina (842,25) como origem derruba todas as
        # divisórias 7,83 pt para fora do lugar. `p.bbox[3]` ja e a base certa
        # (o topo do recorte, no mesmo sistema do pdf-lib).
        ref_h = p.bbox[3]

        seen = set()
        for r in p.rects:
            key = (round(r["x0"], 1), round(r["x1"], 1), round(r["top"], 1), round(r["bottom"], 1))
            if key in seen:
                continue
            seen.add(key)
            w, h = r["x1"] - r["x0"], r["bottom"] - r["top"]
            if w > page_w * 0.95 and h > page_h * 0.9:
                continue  # fundo de pagina inteiro, ignorar
            entry = {"x": round(r["x0"], 2), "y": round(ref_h - r["bottom"], 2),
                     "width": round(w, 2), "height": round(h, 2)}
            linha = w <= 3 or h <= 3      # divisoria: fina em pelo menos um eixo
            if linha:
                # Divisoria real (horizontal ~0.5pt ou VERTICAL ~0.5pt de
                # largura). As verticais sao tan importantes quanto as
                # horizontais: sem elas a tabela perde as colunas.
                if r.get("stroking_color") is not None and r.get("non_stroking_color") is None:
                    rgb = tuple(round(c, 2) for c in r["stroking_color"])
                    if rgb != (0.0, 0.0, 0.0):
                        entry["cor"] = "#%02X%02X%02X" % tuple(int(round(c * 255)) for c in rgb)
                        entry["width"] = max(round(w, 2), 0.48)
                template["blackBars"].append(entry)
            elif r.get("non_stroking_color") == (1.0, 1.0, 1.0) and r.get("stroking_color") is not None:
                # Caixa de campo / quadrado de marcacao: fundo branco. Vai para
                # whiteBoxes e COBRE o que estiver embaixo (e o que faz a grade
                # sumir nos pontos certainos do original).
                # A borda so existe quando o PDF realmente CONTORNA a caixa
                # (contorno escuro com espessura > 0). Na F-075_37 o contorno
                # e branco com espessura 0 e o par preto que vem depois e
                # desenhado com alfa 0 ( invisivel): desenhar borda preta ali
                # seria inventar traco que o original nao tem.
                if _escuro(r.get("stroking_color")) and (r.get("linewidth") or 0) > 0:
                    entry["borda"] = round(r["linewidth"], 2)
                if w < 15 and h < 15:
                    template["checkboxes"].append(entry)   # quadradinho de marcação
                else:
                    template["whiteBoxes"].append(entry)
            # Qualquer outro retangulo "alto e largo" e o par preto+branco de
            # acabamento que o Canva usa para apagar um trecho da grade. O par
            # inteiro (preto E o branco correspondente) e descartado: extraidos
            # separadamente e desenhados com qualquer imprecisao de
            # arredondamento sobra uma fresta preta na borda (aparenta linha
            # quebrada/torta). A imagem de fundo ja traz a linha certa.

        chars = p.chars
        for w in p.extract_words(extra_attrs=["fontname", "size"]):
            # IMPORTANTE: nao usar "page_h - w['bottom']" para a posicao vertical.
            # w['bottom'] vem das metricas de ascent/descent DECLARADAS pela fonte,
            # que em fontes incorporadas/subset (ex.: exportacao do Canva) podem
            # estar erradas e jogam o texto para cima dentro da linha. A posicao
            # correta e a linha de base REAL, que fica salva na propria matriz de
            # renderizacao de cada caractere (matrix[5], em coordenadas nativas do
            # PDF - ja no mesmo sistema bottom-left que o pdf-lib usa).
            matching = [c for c in chars if c['x0'] >= w['x0'] - 0.15 and c['x1'] <= w['x1'] + 0.15
                        and abs(c['top'] - w['top']) < 0.6]
            baseline_y = matching[0]['matrix'][5] if matching else (page_h - w['bottom'])

            if w["text"] in GLIFOS_MARCACAO:
                # O glifo "❑" e a MESMA marcação que o Canva ja desenhou como
                # retangulo (branco + borda) — e esse retangulo, extraido com a
                # geometria exata, ja foi para `checkboxes` acima. Aqui o glifo
                # e so descartado, para nao desenhar dois quadradinhos.
                #
                #MAS: na revisao F-075_37 o PDF NAO desenha o retangulo — a
                # marcacao existe so como glifo de texto. Descartar o glifo
                # apagaria as 17 caixas da ficha. Nesse caso o glifo vira um
                # quadrado vetorial com a geometria REAL medida no raster do
                # proprio PDF (lado = 0,70 x corpo, topo apoiado na linha de
                # base), e nao em texto.
                if not ja_tem_checkbox_perto(template["checkboxes"], w["x0"], baseline_y):
                    lado = round(w["size"] * 0.70, 2)
                    template["checkboxes"].append({
                        "x": round(w["x0"] + 0.30, 2),
                        "y": round(baseline_y - lado, 2),
                        "width": lado, "height": lado,
                        "borda": 0.5,
                    })
                continue
            elif "FreeSerif" in w["fontname"]:
                continue   # FreeSerif so foi usado para os glifos de marcação
            else:
                template["texts"].append({
                    "text": w["text"], "x": round(w["x0"], 2), "y": round(baseline_y, 2),
                    "fim": round(w["x1"], 2),
                    "size": round(w["size"], 2), "font": map_font(w["fontname"])
                })

    with open(os.path.join(out_dir, "template.json"), "w", encoding="utf-8") as f:
        json.dump(template, f, ensure_ascii=False, indent=2)

    print(f"OK: {len(template['images'])} imagens, {len(template['blackBars'])} linhas, "
          f"{len(template['whiteBoxes'])} caixas brancas, {len(template['texts'])} textos, "
          f"{len(template['checkboxes'])} checkboxes -> {out_dir}/template.json")

if __name__ == "__main__":
    pdf_path, out_dir = sys.argv[1], sys.argv[2]
    extract(pdf_path, out_dir)
