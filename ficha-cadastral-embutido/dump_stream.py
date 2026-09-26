# Despeja TODOS os operadores do content stream da página (e de Form XObjects
# aninhados) em ordem: q/Q/cm/re+f/Do/gs. Mostra a verdadeira ordem de pintura.
import re, os, zlib

pdf_path = os.path.join('..', 'F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf')
raw = open(pdf_path, 'rb').read()

objs = {}
for m in re.finditer(rb'(\d+) 0 obj(.*?)endobj', raw, re.S):
    objs[int(m.group(1))] = m.group(2)

page_num = None
for num, body in objs.items():
    head = body[:body.find(b'stream')] if b'stream' in body else body
    if b'/Type /Page' in head and b'/Contents' in head:
        page_num = num
        break
phead = objs[page_num][:objs[page_num].find(b'stream')] if b'stream' in objs[page_num] else objs[page_num]

def get_resources(head):
    res = {}
    m = re.search(rb'/Resources\s+(\d+)\s+0\s+R', head)
    if m:
        rbody = objs[int(m.group(1))]
        rhead = rbody[:rbody.find(b'stream')] if b'stream' in rbody else rbody
        res = rhead
    else:
        m2 = re.search(rb'/Resources\s*<<(.*?)>>\s*(?:/Type|/Parent|/MediaBox|>>)', head, re.S)
        if m2: res = m2.group(1)
        else:
            # pega tudo entre /Resources << e >> balanceado (simples)
            i = head.find(b'/Resources')
            if i >= 0: res = head[i:]
    return res

def get_xobjects(resbytes):
    xo = {}
    m = re.search(rb'/XObject\s*<<(.*)>>', resbytes, re.S)
    if m:
        for mm in re.finditer(rb'/(X\w+|\w+)\s+(\d+)\s+0\s+R', m.group(1)):
            xo[mm.group(1).decode()] = int(mm.group(2))
    return xo

def decode_stream(num):
    body = objs[num]
    i = body.find(b'stream')
    j = body.find(b'endstream')
    data = body[i + 6:j].strip(b'\r\n')
    if b'FlateDecode' in body[:i]:
        data = zlib.decompress(data)
    return data

def dump_ops(stream, indent, xobj_map, depth=0, vistos=None):
    if vistos is None: vistos = set()
    tok = re.finditer(
        rb'/(\w+)\s+Do|([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+re\b\s*(f\*?|B\*?|b\*?|W\*?|n|S)?|'
        rb'^(q|Q)\b|([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+cm\b', stream, re.M)
    for m in tok:
        if m.group(1):  # Do
            nome = m.group(1).decode()
            xr = xobj_map.get(nome)
            if xr is None:
                print(f'{indent}Do /{nome} (DESCONHECIDO)')
                continue
            body = objs[xr]
            bhead = body[:body.find(b'stream')] if b'stream' in body else body
            subtype = re.search(rb'/Subtype\s*/(\w+)', bhead)
            print(f'{indent}Do /{nome} -> obj {xr} Subtype={subtype.group(1).decode() if subtype else "?"}')
            if subtype and subtype.group(1) == b'Form' and xr not in vistos:
                vistos.add(xr)
                rres = get_resources(bhead)
                sub_xo = get_xobjects(rres)
                inner = decode_stream(xr)
                dump_ops(inner, indent + '    ', sub_xo, depth + 1, vistos)
        elif m.group(6):
            op = (m.group(6) or b'?').decode()
            x, y, w, h = (float(m.group(k)) for k in (2, 3, 4, 5))
            print(f'{indent}rect x={x:.2f} y={y:.2f} w={w:.2f} h={h:.2f} op={op}')
        elif m.group(7):
            print(f'{indent}{m.group(7).decode()}')
        elif m.group(8):
            vals = [float(m.group(k)) for k in range(8, 14)]
            print(f'{indent}cm {" ".join(f"{v:.3f}" for v in vals)}')

contents_ref = int(re.search(rb'/Contents\s+(\d+)\s+0\s+R', phead).group(1))
stream = decode_stream(contents_ref)
res = get_resources(phead)
xo = get_xobjects(res)
print('XObjects da página:', xo)
dump_ops(stream, '', xo)
