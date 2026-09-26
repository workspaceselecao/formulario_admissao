# Perícia final: para cada asset, encontra qual transformação (inteiro vs
# conteúdo-only x normal vs flip-vertical) reproduz o render do PDF original.
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
W, H = pix.width, pix.height
rend = Image.frombytes('RGB', (W, H), pix.samples)

def escureceu(v):
    return (v[0] + v[1] + v[2]) / 3 < 128

page_h = tpl['page']['height']
for item in tpl['images']:
    name = os.path.basename(item['file'])
    if name in ('img0.png', 'img7.png', 'img8.png'):
        continue
    im = Image.open(os.path.join(here, item['file'])).convert('RGBA')
    iw, ih = im.size
    bbox = im.getchannel('A').getbbox() or (0, 0, iw, ih)
    bx, by, bw, bh = item['x'], item['y'], item['width'], item['height']
    # área renderizada no PDF original (px @150dpi)
    x0 = int(bx * Z); x1 = int((bx + bw) * Z)
    y0 = int((page_h - by - bh) * Z); y1 = int((page_h - by) * Z)
    reg = rend.crop((max(0, x0), max(0, y0), min(W, x1), min(H, y1)))
    rw, rh = reg.size
    rp = reg.load()
    resultados = {}
    for modo in ('inteiro', 'conteudo'):
        for flip in (False, True):
            if modo == 'inteiro':
                src = im
                sl, st = 0, 0
                sw, sh = iw, ih
            else:
                src = im.crop(bbox)
                sl, st = bbox[0], bbox[1]
                sw, sh = bbox[2] - bbox[0], bbox[3] - bbox[1]
            sp = src.load()
            acertos = total = 0
            for yy in range(0, rh, 3):
                for xx in range(0, rw, 3):
                    if not escureceu(rp[xx, yy]):
                        continue
                    total += 1
                    # pixel da página -> pixel do asset
                    u = xx / rw; v = yy / rh
                    if flip: v = 1 - v
                    sx = int(sl + u * sw); sy = int(st + v * sh)
                    if 0 <= sx < src.width and 0 <= sy < src.height:
                        r, g, b, a = sp[sx, sy]
                        if a > 60 and (r + g + b) / 3 < 128:
                            acertos += 1
            pct = 100.0 * acertos / total if total else 0
            resultados[f'{modo}{"+flipV" if flip else ""}'] = pct
    melhor = max(resultados, key=resultados.get)
    resumo = '  '.join(f'{k}:{v:.0f}%' for k, v in resultados.items())
    print(f'{name}: MELHOR={melhor}   [{resumo}]')
