# Recorta faixas específicas dos dois renders e monta comparativos lado a lado.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '.tmp_deps'))
from PIL import Image, ImageDraw

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '.tmp_render')
a = Image.open(os.path.join(out, 'original.png')).convert('RGB')
b = Image.open(os.path.join(out, 'gerado.png')).convert('RGB')
W, H = a.size

faixas = [
    ('faixa_header', 0, 210),
    ('faixa_importante_nome', 200, 380),
    ('faixa_telefone_estado', 360, 520),
    ('faixa_deficiencia_banco', 500, 800),
    ('faixa_vale_refeicao', 1380, 1480),
]
for nome, y0, y1 in faixas:
    ca = a.crop((0, y0, W, y1))
    cb = b.crop((0, y0, W, y1))
    comp = Image.new('RGB', (W, (y1 - y0) * 2 + 8), (255, 0, 0))
    comp.paste(ca, (0, 0))
    comp.paste(cb, (0, (y1 - y0) + 8))
    comp.save(os.path.join(out, nome + '.png'))
    print(nome, 'ok (topo=original, baixo=gerado)')
