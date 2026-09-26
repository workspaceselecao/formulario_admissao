# Mede segmentos de linhas horizontais escuras nos dois renders numa faixa de y,
# e imprime as diferenças (segmentos presentes num e ausentes no outro).
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '.tmp_deps'))
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '.tmp_render')
a = Image.open(os.path.join(out, 'original.png')).convert('RGB')
b = Image.open(os.path.join(out, 'gerado.png')).convert('RGB')
ap, bp = a.load(), b.load()
W = a.size[0]

def linhas_horizontais(px, y0, y1, x0=0, x1=None, limiar=110):
    """Lista (y_px, x_ini, x_fim) de segmentos escuros longos."""
    x1 = x1 or W
    segs = []
    for y in range(y0, y1):
        runs = []
        ini = None
        for x in range(x0, x1):
            v = px[x, y]
            escuro = (v[0] + v[1] + v[2]) / 3 < limiar
            if escuro and ini is None:
                ini = x
            elif not escuro and ini is not None:
                if x - ini > 30:
                    runs.append((ini, x))
                ini = None
        if ini is not None and x1 - ini > 30:
            runs.append((ini, x1))
        for r in runs:
            segs.append((y, r[0], r[1]))
    # agrupa y adjacente com x parecido
    agrupados = []
    for y, xa, xb in segs:
        if agrupados and abs(y - agrupados[-1][0]) <= 2 and abs(xa - agrupados[-1][1]) < 12 and abs(xb - agrupados[-1][2]) < 12:
            g = agrupados[-1]
            agrupados[-1] = ((g[0] + y) / 2 if isinstance(g[0], float) else (g[0] + y) / 2, min(g[1], xa), max(g[2], xb))
        else:
            agrupados.append((y, xa, xb))
    return agrupados

def comparar(nome, y0, y1, x0, x1):
    la = linhas_horizontais(ap, y0, y1, x0, x1)
    lb = linhas_horizontais(bp, y0, y1, x0, x1)
    def chave(s): return (round(s[0] / 6), s[1] // 40, s[2] // 40)
    sa = {chave(s): s for s in la}
    sb = {chave(s): s for s in lb}
    print(f'== {nome} (y_px {y0}-{y1}, x_px {x0}-{x1}) ==')
    print('  so no ORIGINAL:')
    for k, s in sorted(sa.items()):
        if k not in sb: print(f'    y_px={s[0]:.0f} x={s[1]}..{s[2]}  (y_pdf={842.25 - s[0]*0.48:.1f}pt)')
    print('  so no GERADO:')
    for k, s in sorted(sb.items()):
        if k not in sa: print(f'    y_px={s[0]:.0f} x={s[1]}..{s[2]}  (y_pdf={842.25 - s[0]*0.48:.1f}pt)')
    print()

# Região DADOS CONTA BANCÁRIA (y bottom-up ~460-530 -> y_px ~650-796)
comparar('conta bancaria', 640, 800, 60, 1200)
# Região VA row (y bottom-up ~133-158 -> y_px ~1424-1476)
comparar('vale refeicao row', 1400, 1500, 0, 1241)
# Região primeiro emprego (y bottom-up ~575-595 -> y_px ~517-560)
comparar('primeiro emprego', 500, 580, 0, 700)
