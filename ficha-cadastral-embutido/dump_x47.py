# Dump recursivo COMPLETO e ordenado dos operadores do Form X47 (obj 16),
# resolvendo Subtype/dimensões de cada XObject e mostrando retângulos preenchidos.
import re, zlib

raw = open('../F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf', 'rb').read()
objs = {}
for m in re.finditer(rb'(\d+) 0 obj(.*?)endobj', raw, re.S):
    objs[int(m.group(1))] = m.group(2)

def head_of(num):
    body = objs[num]
    i = body.find(b'stream')
    return body[:i] if i >= 0 else body

def decode(num):
    body = objs[num]
    i = body.find(b'stream'); j = body.find(b'endstream')
    data = body[i+6:j].strip(b'\r\n')
    if b'FlateDecode' in body[:i]: data = zlib.decompress(data)
    return data

def xobj_map(head):
    xo = {}
    i = head.find(b'/XObject')
    if i >= 0:
        seg = head[i:]
        j = seg.find(b'>>')
        for mm in re.finditer(rb'/(\w+)\s+(\d+)\s+0\s+R', seg[:j+2]):
            xo[mm.group(1).decode()] = int(mm.group(2))
    return xo

TOK = re.compile(
    rb'/(\w+)\s+Do|'
    rb'([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+re\b\s*(f\*?|B\*?|b\*?|W\*?|n|S)?|'
    rb'(?<![A-Za-z])(q|Q)(?![A-Za-z])')

vistos = set()
def dump(num, indent):
    head = head_of(num)
    xo = xobj_map(head)
    stream = decode(num)
    for m in TOK.finditer(stream):
        if m.group(1):
            nome = m.group(1).decode()
            xr = xo.get(nome)
            if xr is None:
                print(f'{indent}Do /{nome} ??'); continue
            h2 = head_of(xr)
            st = re.search(rb'/Subtype\s*/(\w+)', h2)
            sub = st.group(1).decode() if st else '?'
            if sub == 'Image':
                w = re.search(rb'/Width\s+(\d+)', h2).group(1).decode()
                hh = re.search(rb'/Height\s+(\d+)', h2).group(1).decode()
                print(f'{indent}Do /{nome} = IMG obj{xr} {w}x{hh}')
            else:
                bb = re.search(rb'/BBox\s*\[([^\]]*)\]', h2)
                print(f'{indent}Do /{nome} = FORM obj{xr} BBox={bb.group(1).decode() if bb else "?"}')
                if xr not in vistos:
                    vistos.add(xr)
                    dump(xr, indent + '   | ')
        elif m.group(6):
            op = m.group(6).decode()
            x, y, w, h = (float(m.group(k)) for k in (2, 3, 4, 5))
            if op not in ('W*', 'W', 'n'):
                print(f'{indent}rect x={x:.2f} y={y:.2f} w={w:.2f} h={h:.2f} op={op}')

print('=== X47 (obj 16) em ordem ===')
vistos.add(16)
dump(16, '')
