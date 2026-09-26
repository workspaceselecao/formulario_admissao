# Teste de alinhamento: as linhas vetoriais (blackBars/whiteBoxes extraídas do PDF
# original) devem cair exatamente sobre os pixels opacos/transparentes das molduras PNG.
# Compara dois mapeamentos pixel->pt:
#   A) atual (png inteiro esticado na caixa do template)
#   B) apenas o conteúdo visível (bbox alfa) esticado na caixa do template
import json, os
from PIL import Image

d = os.path.dirname(os.path.abspath(__file__))
tpl = json.load(open(os.path.join(d, 'template.json'), encoding='utf-8'))

def coletar_linhas_verticais():
    """x das linhas verticais de grade (retângulos altos e finos) + horizontais."""
    vert, horiz = [], []
    for b in tpl['blackBars'] + tpl['whiteBoxes']:
        w, h = b['width'], b['height']
        if h >= 8 and w <= 2.2:
            vert.append((b['x'] + w / 2, b['y'], b['y'] + h))
        if w >= 40 and h <= 2.2:
            horiz.append((b['y'] + h / 2, b['x'], b['x'] + w))
    return vert, horiz

def alpha_eh_linha(v):
    """Linha desenhada = pixel escuro (grade preta com alpha)."""
    r, g, b, a = v
    return a > 60 and (r + g + b) / 3 < 128

def teste(img_item, mapeamento):
    p = os.path.join(d, img_item['file'])
    im = Image.open(p).convert('RGBA')
    W, H = im.size
    bx, by, bw, bh = img_item['x'], img_item['y'], img_item['width'], img_item['height']
    bbox = im.getchannel('A').getbbox() or (0, 0, W, H)
    if mapeamento == 'A':
        cl, ct, cr, cb = 0, 0, W, H
    else:
        cl, ct, cr, cb = bbox
    def px2x(px): return bx + (px - cl + 0.5) * bw / (cr - cl)
    def py2y(py): return by + (cb - 1 - py + 0.5) * bh / (cb - ct)
    acertos = falhas = 0
    detalhes = []
    for lx, y0, y1 in coletar_linhas_verticais()[0]:
        if not (bx - 2 <= lx <= bx + bw + 2): continue
        ym = (max(y0, by) + min(y1, by + bh)) / 2
        py = int(round(ct + (cb - 1 - (ym - by) * (cb - ct) / bh)))
        achou = any(alpha_eh_linha(im.getpixel((px, py)))
                    for px in range(max(0, int((lx - bx) * (cr - cl) / bw + cl) - 4),
                                    min(W, int((lx - bx) * (cr - cl) / bw + cl) + 5)))
        if achou: acertos += 1
        else:
            falhas += 1
            if len(detalhes) < 3: detalhes.append(f'x={lx:.1f} y={ym:.1f}')
    return acertos, falhas, detalhes

vert, horiz = coletar_linhas_verticais()
print(f'{len(vert)} linhas verticais, {len(horiz)} horizontais no template')
for img_item in tpl['images']:
    name = os.path.basename(img_item['file'])
    if name in ('img0.png', 'img7.png', 'img8.png'):
        continue  # logos, sem grade
    for m in ('A', 'B'):
        a, f, det = teste(img_item, m)
        print(f"{name} mapeamento {m}: {a} acertos, {f} falhas  {det}")
