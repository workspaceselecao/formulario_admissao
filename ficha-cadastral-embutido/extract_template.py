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
    "Arial-BoldMT": "Helvetica-Bold",
    "ArialMT": "Helvetica",
    "HelveticaLTPro-Roman": "Helvetica",
    "Arial,Bold": "Helvetica-Bold",
    "Arial": "Helvetica",
}

def map_font(fontname: str) -> str:
    base = fontname.split("+")[-1]
    for k, v in FONT_MAP.items():
        if k in base:
            return v
    return "Helvetica"

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

        seen = set()
        for r in p.rects:
            key = (round(r["x0"], 1), round(r["x1"], 1), round(r["top"], 1), round(r["bottom"], 1))
            if key in seen:
                continue
            seen.add(key)
            w, h = r["x1"] - r["x0"], r["bottom"] - r["top"]
            if w > page_w * 0.95 and h > page_h * 0.9:
                continue  # fundo de pagina inteiro, ignorar
            entry = {"x": round(r["x0"], 2), "y": round(page_h - r["bottom"], 2),
                      "width": round(w, 2), "height": round(h, 2)}
            if r.get("non_stroking_color") == (1.0, 1.0, 1.0):
                template["whiteBoxes"].append(entry)
            else:
                template["blackBars"].append(entry)

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

            if "FreeSerif" in w["fontname"] or w["text"] in ("❑", "☐", "□"):
                side = round((w["x1"] - w["x0"]) * 0.85, 2)
                cap = w['size'] * 0.72
                box_bottom = baseline_y - (cap - side) / 2
                template["checkboxes"].append({
                    "x": round(w["x0"] + ((w["x1"] - w["x0"]) - side) / 2, 2),
                    "y": round(box_bottom, 2),
                    "side": side
                })
            else:
                template["texts"].append({
                    "text": w["text"], "x": round(w["x0"], 2), "y": round(baseline_y, 2),
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
