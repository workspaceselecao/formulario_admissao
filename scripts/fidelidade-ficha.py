"""Mede a fidelidade do template gerado (output.pdf) contra o PDF de referência.

    python scripts/fidelidade-ficha.py "F-075_38 (PR-011) Ficha Cadastral para Admissão.pdf" [dpi] [bloco_pt]

Rode `node scripts/gerar-ficha-vazia.js` antes: o output precisa ser o PDF só com
o template, sem dado nenhum.
"""
import sys, os
import numpy as np
import pymupdf

REF = sys.argv[1]
DPI = int(sys.argv[2]) if len(sys.argv) > 2 else 150
BLK = float(sys.argv[3]) if len(sys.argv) > 3 else 20.0
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "ficha-cadastral-embutido", "output.pdf")
Z = DPI / 72.0


def gray(path):
    d = pymupdf.open(path)
    pm = d[0].get_pixmap(matrix=pymupdf.Matrix(Z, Z), colorspace=pymupdf.csGRAY)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width)
    d.close()
    return a


a, b = gray(REF), gray(OUT)
h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1])
a, b = a[:h, :w], b[:h, :w]
ink_a, ink_b = a < 200, b < 200
falta, sobra = ink_a & ~ink_b, ink_b & ~ink_a
dif = falta | sobra
print("ref %dx%d  out %dx%d" % (a.shape[1], a.shape[0], b.shape[1], b.shape[0]))
print("tinta ref %.2f%%  out %.2f%%" % (100 * ink_a.mean(), 100 * ink_b.mean()))
print("DIFERENTES %.3f%%  |  falta %.3f%%  sobra %.3f%%  (da tinta ref: %.2f%%)"
      % (100 * dif.mean(), 100 * falta.mean(), 100 * sobra.mean(), 100 * dif.sum() / max(ink_a.sum(), 1)))

print("\nfaixa      dif%   falta%  sobra%  tinta_ref%")
for i in range(20):
    y0, y1 = h * i // 20, h * (i + 1) // 20
    print(" %4d-%4d  %5.2f   %5.2f   %5.2f   %5.2f"
          % (y0, y1, 100 * dif[y0:y1].mean(), 100 * falta[y0:y1].mean(),
             100 * sobra[y0:y1].mean(), 100 * ink_a[y0:y1].mean()))

# piores blocos (em pontos, origem no topo-esquerda da pagina)
px = max(1, int(round(BLK * Z)))
scores = []
for y0 in range(0, h - px + 1, px):
    for x0 in range(0, w - px + 1, px):
        d = dif[y0:y0 + px, x0:x0 + px]
        if d.sum() == 0:
            continue
        scores.append((d.sum() / d.size, x0 / Z, y0 / Z, d.sum()))
scores.sort(reverse=True)
print("\npiores blocos de %.0fpt (x de 0, y do topo, %% dif, px):" % BLK)
for s, x, y, n in scores[:25]:
    print("  x=%6.1f y=%6.1f  %5.2f%%  %5d" % (x, y, 100 * s, n))
