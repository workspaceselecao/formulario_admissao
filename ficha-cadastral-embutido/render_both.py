# Renderiza o PDF original e o PDF gerado pela engine embarcada para PNGs
# comparáveis (mesma escala). Saída: .tmp_render/original.png e .tmp_render/gerado.png
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '.tmp_deps'))
import fitz

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '.tmp_render')
os.makedirs(out, exist_ok=True)

orig = fitz.open(os.path.join(here, '..', 'F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf'))
pix = orig[0].get_pixmap(dpi=150)
pix.save(os.path.join(out, 'original.png'))
print('original:', pix.width, 'x', pix.height)

gen = os.path.join(here, 'output.pdf')
if os.path.exists(gen):
    doc2 = fitz.open(gen)
    pix2 = doc2[0].get_pixmap(dpi=150)
    pix2.save(os.path.join(out, 'gerado.png'))
    print('gerado:', pix2.width, 'x', pix2.height)
else:
    print('output.pdf não existe — gere com node generate.js')
