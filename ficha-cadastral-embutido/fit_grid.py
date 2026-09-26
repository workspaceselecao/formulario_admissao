# Ajuste por mínimos quadrados: assinaturas das linhas horizontais da grade
# (linhas de pixel com muitos pixels escuros) no ASSET vs no RENDER ORIGINAL.
# Responde: qual mapeamento asset->página o PDF original realmente usa?
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '.tmp_deps'))
import fitz, json
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
tpl = json.load(open(os.path.join(here, 'template.json'), encoding='utf-8'))
doc = fitz.open(os.path.join(here, '..', 'F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf'))
DPI = 150.0
Z = DPI / 72.0
pix = doc[0].get_pixmap(dpi=int(DPI))
rend = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
rp = rend.load()
page_h = tpl['page']['height']

def linhas_asset(im):
    """y_px (a partir do topo) das linhas horizontais da grade no asset."""
    W, H = im.size
    p = im.load()
    ys = []
    for y in range(H):
        n = 0
        for x in range(0, W, 4):
            r, g, b, a = p[x, y]
            if a > 60 and (r + g + b) / 3 < 128:
                n += 1
        if n > 0.5 * (W // 4):
            ys.append(y)
    # agrupa linhas adjacentes
    grupos = []
    for y in ys:
        if grupos and y - grupos[-1][-1] <= 2:
            grupos[-1].append(y)
        else:
            grupos.append([y])
    return [sum(g) / len(g) for g in grupos]

def linhas_render(bx, by, bw, bh, margem=6):
    """y_px (a partir do topo da página) das linhas horizontais no render."""
    x0, x1 = int((bx + margem) * Z), int((bx + bw - margem) * Z)
    y0, y1 = int((page_h - by - bh) * Z), int((page_h - by) * Z)
    ys = []
    for y in range(y0, y1):
        n = 0
        for x in range(x0, x1, 4):
            v = rp[x, y]
            if (v[0] + v[1] + v[2]) / 3 < 128:
                n += 1
        if n > 0.5 * ((x1 - x0) // 4):
            ys.append(y)
    grupos = []
    for y in ys:
        if grupos and y - grupos[-1][-1] <= 2:
            grupos[-1].append(y)
        else:
            grupos.append([y])
    return [sum(g) / len(g) for g in grupos]

def ajustar(a_ys, r_ys, rotulo):
    """LSQ r = alpha*a + beta; reporta resíduos em px @150dpi."""
    n = min(len(a_ys), len(r_ys))
    if n < 2:
        print(f'{rotulo}: poucas linhas (asset {len(a_ys)}, render {len(r_ys)})')
        return
    a_ys, r_ys = a_ys[:n], r_ys[:n]
    ma = sum(a_ys) / n; mr = sum(r_ys) / n
    num = sum((a - ma) * (r - mr) for a, r in zip(a_ys, r_ys))
    den = sum((a - ma) ** 2 for a in a_ys)
    alpha = num / den if den else 1.0
    beta = mr - alpha * ma
    resid = [r - (alpha * a + beta) for a, r in zip(a_ys, r_ys)]
    rms = (sum(r * r for r in resid) / n) ** 0.5
    print(f'{rotulo}: n={n} alpha={alpha:.4f} beta={beta:.1f}px RMS={rms:.2f}px ({rms/Z:.2f}pt)')
    print(f'   asset y_px: {[round(v) for v in a_ys]}')
    print(f'   rend  y_px: {[round(v) for v in r_ys]}')
    print(f'   residuos px: {[round(r, 1) for r in resid]}')
    # se alpha ≈ (box pt / asset px) * Z => mapeamento "inteiro"
    return alpha, beta

for item in tpl['images']:
    name = os.path.basename(item['file'])
    if name not in ('img3.png', 'img5.png', 'img6.png', 'img2.png', 'img4.png', 'img1.png'):
        continue
    im = Image.open(os.path.join(here, item['file'])).convert('RGBA')
    a_ys = linhas_asset(im)
    r_ys = linhas_render(item['x'], item['y'], item['width'], item['height'])
    print(f'--- {name} (box h={item["height"]:.1f}pt, asset {im.size[1]}px, escala esperada {item["height"]/im.size[1]*Z:.4f})')
    ajustar(a_ys, r_ys, f'  {name}')
