# Perícia: lista os objetos /Subtype /Image do PDF oficial com Width/Height/SMask,
# e as dimensões dos objetos smask apontados. Compara com os PNGs do repositório.
import re, sys, zlib, os

pdf_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join('..', 'F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf')
raw = open(pdf_path, 'rb').read()
print('PDF:', pdf_path, len(raw), 'bytes')

# Encontra todos os dicionários de imagem (objeto N ... << ... /Subtype /Image ... >> stream)
objs = {}
for m in re.finditer(rb'(\d+) 0 obj(.*?)endobj', raw, re.S):
    objs[int(m.group(1))] = m.group(2)

img_objs = []
for num, body in objs.items():
    if re.search(rb'/Subtype\s*/Image', body):
        head = body[:body.find(b'stream')]
        def dint(key):
            mm = re.search(rb'/' + key + rb'\s+(-?\d+)', head)
            return int(mm.group(1)) if mm else None
        img_objs.append((num, dint(b'Width'), dint(b'Height'), dint(b'BitsPerComponent'), dint(b'SMask')))

print('\nObjetos de imagem no PDF:')
smask_refs = []
for num, w, h, bpc, smask in img_objs:
    print(f'  obj {num}: {w}x{h} bpc={bpc} smask={smask}')
    if smask: smask_refs.append(smask)

print('\nObjetos smask:')
for num in smask_refs:
    body = objs.get(num, b'')
    head = body[:body.find(b'stream')]
    w = re.search(rb'/Width\s+(\d+)', head)
    h = re.search(rb'/Height\s+(\d+)', head)
    print(f'  obj {num} (smask): {w.group(1).decode()}x{h.group(1).decode() if h else "?"}')

print('\nPNGs no repositório (assets/):')
from PIL import Image
ad = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
for f in sorted(os.listdir(ad)):
    im = Image.open(os.path.join(ad, f))
    print(f'  {f}: {im.size}')
