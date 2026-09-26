# Lista a ordem real dos operadores no content stream da página do PDF original:
# retângulos preenchidos (re ... f) vs desenhos de imagem (Do), na sequência do stream.
import re, sys, os, zlib

pdf_path = os.path.join('..', 'F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf')
raw = open(pdf_path, 'rb').read()

# pega todos os objetos
objs = {}
for m in re.finditer(rb'(\d+) 0 obj(.*?)endobj', raw, re.S):
    objs[int(m.group(1))] = m.group(2)

# encontra o objeto página (com /Contents) — assume 1 página
page_num = None
contents_refs = []
for num, body in objs.items():
    head = body[:body.find(b'stream')] if b'stream' in body else body
    if b'/Type /Page' in head and b'/Contents' in head:
        page_num = num
        mm = re.search(rb'/Contents\s+(\d+)\s+0\s+R', head)
        if mm: contents_refs.append(int(mm.group(1)))
        # Contents pode ser array
        for mm2 in re.finditer(rb'/Contents\s*\[([^\]]*)\]', head):
            contents_refs += [int(x) for x in re.findall(rb'(\d+)\s+0\s+R', mm2.group(1))]
        break
print('página obj', page_num, 'contents refs', contents_refs)

def decode_stream(num):
    body = objs[num]
    i = body.find(b'stream')
    j = body.find(b'endstream')
    data = body[i + 6:j].strip(b'\r\n')
    if b'FlateDecode' in body[:i]:
        data = zlib.decompress(data)
    return data

seq = []
for ref in contents_refs:
    stream = decode_stream(ref)
    # percorre tokens na ordem: "x y w h re" + fill, e "/ImgN Do"
    for m in re.finditer(rb'([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+re\s*(\w*)|(/[\w]+)\s+Do', stream):
        if m.group(5) is not None and m.group(1) is not None:
            x, y, w, h = (float(m.group(k)) for k in (1, 2, 3, 4))
            op = m.group(5).decode() or 'f'
            seq.append(('rect', x, y, w, h, op))
        elif m.group(6) is not None:
            seq.append(('img', m.group(6).decode()))

print(f'\ntotal ops: {len(seq)} ({sum(1 for s in seq if s[0]=="img")} imagens, {sum(1 for s in seq if s[0]=="rect")} retângulos)')
# Resolve nomes /ImgN -> xref via XObject dict do page
head = objs[page_num][:objs[page_num].find(b'stream')] if b'stream' in objs[page_num] else objs[page_num]
res = re.search(rb'/XObject\s*<<(.*?)>>', head, re.S)
xobj = {}
if res:
    for mm in re.finditer(rb'/(Img\w+)\s+(\d+)\s+0\s+R', res.group(1)):
        xobj[mm.group(1).decode()] = int(mm.group(2))
    print('XObject map:', xobj)

def w_px(v): return int(v * 150 / 72)
print('\nSequência (ordem do stream) — retângulos marcados com (x,y,w,h)pt:')
for i, s in enumerate(seq):
    if s[0] == 'img':
        xr = xobj.get(s[1], '?')
        w = objs.get(xr, b'')
        mm = re.search(rb'/Width\s+(\d+)', w) if xr != '?' else None
        mm2 = re.search(rb'/Height\s+(\d+)', w) if xr != '?' else None
        dim = f'{mm.group(1).decode()}x{mm2.group(1).decode()}' if mm and mm2 else '?'
        print(f'{i:3d}: IMG {s[1]} (obj {xr}, {dim}px)')
    else:
        print(f'{i:3d}: rect x={s[1]:.2f} y={s[2]:.2f} w={s[3]:.2f} h={s[4]:.2f} op={s[5]}')
