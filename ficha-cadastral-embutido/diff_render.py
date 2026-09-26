# Diff pixel a pixel: original vs gerado (mesma escala, 150 dpi).
# Saída: mapa de calor das divergências + estatística por região.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '.tmp_deps'))
from PIL import Image, ImageChops

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '.tmp_render')
a = Image.open(os.path.join(out, 'original.png')).convert('RGB')
b = Image.open(os.path.join(out, 'gerado.png')).convert('RGB')
if a.size != b.size:
    b = b.resize(a.size)
diff = ImageChops.difference(a, b).convert('L')
px = diff.load()
W, H = diff.size
# Linhas com mais divergência (agrupadas em faixas de 10px de altura)
from collections import Counter
linhas = Counter()
cols = Counter()
TOTAL = W * H
n_diff = 0
for y in range(0, H, 2):
    for x in range(0, W, 2):
        if px[x, y] > 60:
            n_diff += 1
            linhas[y // 10 * 10] += 1
            cols[x // 10 * 10] += 1
print(f'pixels divergentes (amostra 1/4): {n_diff} de {TOTAL//4} ({100.0*n_diff/(TOTAL//4):.2f}%)')
print('\nTop 15 faixas horizontais com divergencia (y_px_150dpi -> y_pt_do_pdf):')
dpi = 150.0
pt = 72.0 / dpi
for y, c in sorted(linhas.items(), key=lambda kv: -kv[1])[:15]:
    y_pt = 842.25 - (y + 5) * pt  # topo da faixa, em pt a partir do rodapé
    print(f'  y_px~{y:4d} (y_pdf~{y_pt:6.1f}pt a partir do rodapé): {c}')
print('\nTop 10 colunas:')
for x, c in sorted(cols.items(), key=lambda kv: -kv[1])[:10]:
    print(f'  x_px~{x:4d} (x_pdf~{x*pt:6.1f}pt): {c}')
# Heatmap salvo
diff.point(lambda v: 255 if v > 60 else 0).save(os.path.join(out, 'diff.png'))
print('\nheatmap salvo em .tmp_render/diff.png')
