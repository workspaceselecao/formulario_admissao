"""Revisão visual numérica do PDF preenchido do F-075 v38 (caixas do "com caixa").

A conferência é feita em pixels, não a olho: o PDF preenchido é comparado com o
PDF **vazio** (mesmo template, nenhum dado) e a diferença é exatamente a tinta
que a engine escreveu por cima. Cada valor é medido contra a caixa impressa
correspondente (65 retângulos do PDF oficial "com caixa") e cada "X" de opção é
medido contra o ❑ que ele marca.

Relatório:
  TEXTO   — para cada valor: caixa (Y), tinta medida (Y) e folga;
  MARCAS  — para cada "X": a opção que ele marca e quanto foge da caixa.

Uso:
    node scripts/gerar-ficha-preenchida.js
    node scripts/gerar-ficha-preenchida.js --vazio
    python scripts/conferir-caixas-v38.py [preenchido.pdf] [vazio.pdf]
"""
import sys, os, json, unicodedata
import numpy as np
import pymupdf

try:  # rótulos e glifos impressos estão fora do cp1252 do console
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, "ficha-cadastral-embutido", "template.json")
SCHEMA = os.path.join(ROOT, "ficha_cadastral_campos.json")
REF = os.path.join(ROOT, "F-075_38 (PR-011) Ficha Cadastral para Admissão_com caixa.pdf")
POS = [a for a in sys.argv[1:] if not a.startswith("--")]
PRE = POS[0] if len(POS) > 0 else os.path.join(ROOT, ".tmp_render", "output_preenchido.pdf")
VAZ = POS[1] if len(POS) > 1 else os.path.join(ROOT, ".tmp_render", "output_vazio.pdf")

Z = 8.0
JANELA_PT = 8.0     # meia-janela de busca da tinta em torno da baseline do valor
FOLGA = 0.5        # tolerância entre a tinta e a borda da caixa
TAM, ALTURA_FRACAO, ALTURA_TINTA = 9, 0.78, 0.72


def norm(s):
    s = unicodedata.normalize("NFKD", str(s))
    return "".join(c for c in s if not unicodedata.combining(c)).replace(" ", "").lower()


def baseline(co):
    """EmbeddedDocs.baselinePdf: caixa alta do valor centrada na caixa impressa."""
    h = co.get("altura") if co.get("altura") is not None else co.get("height")
    h = 12 if h is None else h
    y = co["y"] + min((h - TAM * ALTURA_TINTA) / 2, h * ALTURA_FRACAO)
    return max(co["y"] + 0.5, y)


def folhas(no, caminho="", d=None):
    d = [] if d is None else d
    if not isinstance(no, dict):
        return d
    if isinstance(no.get("coordenadas"), dict) and "x" in no["coordenadas"]:
        d.append((caminho, no["coordenadas"]))
    for k, v in no.items():
        if isinstance(v, dict):
            folhas(v, (caminho + "." + k) if caminho else k, d)
        elif isinstance(v, list):
            for i, it in enumerate(v):
                if isinstance(it, dict):
                    folhas(it, "%s.%d" % (caminho, i), d)
    return d


def opcoes(no, caminho="", d=None):
    """Coordenadas das OPÇÕES (filhas de `opcoes`) — é nelas que o X é marcado."""
    d = [] if d is None else d
    if not isinstance(no, dict):
        return d
    ops = no.get("opcoes")
    if isinstance(ops, dict):
        for k, v in ops.items():
            if isinstance(v, dict) and isinstance(v.get("coordenadas"), dict):
                d.append(((caminho + "." + k) if caminho else k, v["coordenadas"]))
    for k, v in no.items():
        if isinstance(v, dict):
            opcoes(v, (caminho + "." + k) if caminho else k, d)
        elif isinstance(v, list):
            for i, it in enumerate(v):
                if isinstance(it, dict):
                    opcoes(it, "%s.%d" % (caminho, i), d)
    return d


def tinta(pagina):
    pm = pagina.get_pixmap(matrix=pymupdf.Matrix(Z, Z), colorspace=pymupdf.csGRAY)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width)
    return a < 200, pm.height, pm.width


def main():
    tpl = json.load(open(TEMPLATE, encoding="utf-8"))
    estatico = set()
    for t in tpl.get("texts", []):
        estatico.add(norm(t.get("text", "")))
        for c in t.get("chars", []):
            estatico.add(norm(c.get("c", "")))

    pre, vaz = pymupdf.open(PRE), pymupdf.open(VAZ)
    pp = pre[0]
    H, W = pp.rect.height, pp.rect.width
    pi, ph, pw = tinta(pp)
    vi, _, _ = tinta(vaz[0])
    novo = pi & ~vi                     # tinta escrita pela engine
    sx, sy = pw / W, ph / H

    campos = folhas(json.load(open(SCHEMA, encoding="utf-8"))["campos"])
    ops = opcoes(json.load(open(SCHEMA, encoding="utf-8"))["campos"])

    # ---------- TEXTO ----------
    print("=== TEXTO: a tinta do valor cabe na caixa impressa? ===")
    print("%-40s %-22s %-16s %7s" % ("valor", "campo", "caixa y", "tinta y"))
    usados, furos, medidos = set(), [], 0
    for b in pp.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = "".join(c["c"] for c in s["chars"]).strip()
                # ❑ é a caixinha impressa (camada checkboxes), não dado
                if not t or norm(t) in estatico or t == "❑":
                    continue
                base = H - s["origin"][1]
                c0 = max(0, int(s["bbox"][0] * sx) - 2)
                c1 = min(pw, int(s["bbox"][2] * sx) + 2)
                if c1 <= c0:
                    continue
                a = max(0, int((H - base - JANELA_PT) * sy))
                b2 = min(ph, int((H - base + JANELA_PT) * sy))
                ls = np.nonzero(novo[a:b2, c0:c1].sum(axis=1) >= 3)[0]
                if not len(ls):
                    continue
                yb, yt = H - (a + ls.max()) / sy, H - (a + ls.min()) / sy
                melhor, dist = None, 1e9
                for i, (caminho, co) in enumerate(campos):
                    if i in usados:
                        continue
                    dx = abs(co["x"] + 0.5 - s["bbox"][0])
                    dy = abs(baseline(co) - base)
                    if dx <= 3 and dy < dist:
                        melhor, dist = i, dy
                if melhor is None:
                    print("%-40s %-22s %s" % (t[:40], "(sem campo)", "sem correspondência"))
                    continue
                usados.add(melhor)
                caminho, co = campos[melhor]
                y0, y1 = co["y"], co["y"] + (co.get("altura") or 0)
                fora = (yb < y0 - FOLGA) or (yt > y1 + FOLGA)
                medidos += 1
                if fora:
                    furos.append((caminho, t, y0, y1, yb, yt))
                print("%-40s %-22s %6.2f..%6.2f  %6.2f..%6.2f%s"
                      % (t[:40], caminho.split(".")[-1][:22], y0, y1, yb, yt,
                         "  <-- ESCAPA" if fora else ""))

    # ---------- MARCAS ----------
    print("\n=== MARCAS: o X cai dentro do ❑ da opção? ===")
    marcadas = 0
    for b in pp.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if "".join(c["c"] for c in s["chars"]).strip() != "X":
                    continue
                marcadas += 1
                x0, x1 = s["bbox"][0], s["bbox"][2]
                base = H - s["origin"][1]
                cx = (x0 + x1) / 2
                alvo = min(ops, key=lambda o: abs((o[1]["x"] + (o[1].get("largura") or 0) / 2) - cx)
                           + abs((o[1]["y"] + (o[1].get("altura") or 0) / 2) - (base - s["size"] * 0.36)))
                caminho, co = alvo
                x0c, x1c = co["x"], co["x"] + (co.get("largura") or 0)
                y0c, y1c = co["y"], co["y"] + (co.get("altura") or 0)
                a, b2 = int((H - (y1c + FOLGA)) * sy), int((H - (y0c - FOLGA)) * sy)
                c0, c1 = int((x0c - FOLGA) * sx), int((x1c + FOLGA) * sx)
                fora = int(novo[max(0, a):b2, max(0, c0):c1].sum())
                ai, bi = int((H - (y1c - 0.5)) * sy), int((H - (y0c + 0.5)) * sy)
                ci, di = int((x0c + 0.5) * sx), int((x1c - 0.5) * sx)
                dentro = int(novo[max(0, ai):bi, max(0, ci):di].sum()) if bi > ai and di > ci else 0
                print("   X em x %7.2f..%7.2f -> %-46s %d px dentro%s"
                      % (x0, x1, caminho[:46], dentro,
                         "  <-- FOGE DA CAIXA" if fora and dentro < fora else ""))

    print("\n%d valor(es) medido(s), %d com tinta fora da caixa; %d marca(s) X"
          % (medidos, len(furos), marcadas))
    for caminho, t, y0, y1, yb, yt in furos:
        print("   FORA: %-46s caixa %6.2f..%6.2f  tinta %6.2f..%6.2f" % (caminho[:46], y0, y1, yb, yt))
    pre.close()
    vaz.close()
    return 1 if furos else 0


if __name__ == "__main__":
    sys.exit(main())
