"""
Script de extração: le o PDF oficial (F-075_38) e gera automaticamente o
template.json + os assets PNG usados pelo generate.js (pdf-lib) e pelo engine
embarcado (embedded-docs.js), SEM precisar mapear coordenadas manualmente.

O template.json do repositório foi extraído de
"F-075_38 (PR-011) Ficha Cadastral para Admissão.pdf" (o documento canônico).
As COORDENADAS dos campos de dado, essas, saem de uma outra fonte: as 65 caixas
de preenchimento de "..._com caixa.pdf", que é o mesmo v38 com os retângulos
marcados por cima — ver .tmp_render/remapear_v38.py.

Uso:
    pip install pdfplumber pymupdf pillow
    python extract_template.py caminho/do/PDF_original.pdf pasta_saida/

Isso extrai:
  - tamanho exato da pagina
  - imagens (logos, cabecalho e grades das tabelas) com alpha, ja compostas com o smask
  - linhas/retangulos vetoriais reais (divisorias pretas, caixas brancas de acabamento)
  - todo o texto estatico (rotulos), ANCORADO CARACTERE A CARACTERE (a origem
    exata de cada glifo), com fonte e tamanho originais
  - os simbolos de checkbox (glyph "❑"), preservados com a posicao e o corpo
    exatos (o engine redesenha o glifo com a fonte declarada em fonteCheckbox)
  - o CATALOGO DE CAMPOS do documento: cada trecho/checkbox ganha `id` estavel,
    `nome` (como o ADM o enxerga no formulario de edicao), `secao`, `papel`
    (rotulo/valor/opcao/texto) e a ligacao com a sua caixinha. E o que permite
    listar e reescrever "Código/Revisão", "Data da publicação", "Vigência" e as
    opcoes de BANCO numa versao futura sem reextrair o PDF.

O resultado (template.json + assets/) e 100% embutivel no codigo: nenhum PDF
externo precisa ser carregado depois disso para gerar o documento.
"""
import sys, os, json, io
import pdfplumber
import fitz
from PIL import Image

# Fonte do PDF oficial -> (nome no template, arquivo TTF do repositorio)
FONTES = {
    "Arial-BoldMT": ("Arial-Bold", "assets/arialbd.ttf"),
    "ArialMT": ("Arial", "assets/arial.ttf"),
    "ArialNarrow-Bold": ("Arial-Narrow-Bold", "assets/ARIALNB.ttf"),
    "ArialNarrow": ("Arial-Narrow", "assets/ARIALN.ttf"),
    "HelveticaLTPro-Roman": ("Helvetica", None),
    "FreeSerif": ("Helvetica", None),
}

# Fallback de cada familia, usado quando o TTF nao pode ser embutido (o engine
# cai no padrao do pdf-lib sem quebrar). A versao "Narrow" cai no Arial largo
# equivalente: ~22% mais largo, por isso o aviso de fidelidade.
FALLBACK_FONTE = {
    "Arial": "Helvetica",
    "Arial-Bold": "Helvetica-Bold",
    "Arial-Narrow": "Helvetica",
    "Arial-Narrow-Bold": "Helvetica-Bold",
}

GLIFO_CHECKBOX = "❑"
# Campos de texto sao emitidos agrupados em trechos (um por linha de base +
# fonte + corpo). Como CADA glifo recebe a origem x exata do PDF, o agrupamento
# nao afeta o resultado: ele so evita miles de chamadas de desenho. O vao
# maximo de 1,2 em separa linhas diferentes sem partir a linha ao meio (o
# PDF oficial tem espacamento irregular: vaos internos de ate 0,72 em).
VAO_MAX_EM = 1.2

# Tolerancia (pt) para considerar dois trechos na MESMA linha visual. O
# cabecalho do F-075 desalinha rotulo e valor em ate 2,3 pt (o Canva nao
# alinha as caixas com a linha de base); ja a separacao real entre linhas do
# corpo e de 9 pt ou mais, entao 3 pt nao mistura linhas diferentes.
MESMA_LINHA_PT = 3.0
# Distancia maxima (pt) entre um rotulo e o valor a sua direita: evita casar
# um rotulo com o proximo bloco da pagina.
VALOR_MAX_PT = 100.0
# Largura util antes da margem direita: e o `maxWidth` que o ADM pode usar para
# reescrever um trecho sem que o texto novo estoure a folha.
MARGEM_DIREITA_PT = 12.0
# Abaixo desta largura o trecho e considered "curto" (cabe um rotulo com valor
# ao lado, e nao um paragrafo).
LARGURA_MAXIMA_PT = 470.0

# Nome de campo mais legivel que o proprio texto, para os trechos cujo texto
# NAO e o nome (rotulos, cabecalho, avisos). Chave: texto exato do PDF.
NOMES_CURADOS = {
    "Código/Revisão:": "Código/Revisão",
    "Data da publicação:": "Data da publicação",
    "Vigência:": "Vigência",
    "F-075(PR-011)/38 ": "Código/Revisão",
    "29/05/2026": "Data da publicação",
    "2 anos": "Vigência",
    "Atenção": "Aviso — Atenção",
    "Importante:": "Aviso — Importante",
    "DADOS PESSOAIS": "Dados pessoais",
    "DEPENDENTES": "Dependentes",
    "BENEFÍCIOS - VALE TRANSPORTE": "Benefícios — Vale transporte",
    "VALE REFEIÇÃO/ALIMENTAÇÃO": "Vale refeição / alimentação",
    "DADOS": "Conta bancária",
    "CONTA": "Conta bancária",
    "BANCÁRIA ": "Conta bancária",
    "Ficha Cadastral de Admissão – Operacional e Administrativo ": "Título do formulário",
    "NOME COMPLETO DO CANDIDATO": "Assinatura — nome completo",
    "DATA ": "Assinatura — data",
    "VALE TRANSPORTE": "Vale transporte — modalities",
    "TIPO DEFICIÊNCIA": "Tipo de deficiência",
    "QUANTIDADE": "Dependentes — quantidade",
    "VALOR UNITÁRIO": "Dependentes — valor unitário",
    "Banco:": "Banco",
    "Agência:": "Agência",
    "Conta/Dígito: ": "Conta/Dígito",
    "Número do CPF": "Número do CPF",
    "Banco: ": "Banco",
}

# Seções do formulário por faixa de Y (base pdf-lib, de baixo para cima; a
# primeira faixa que contém o Y vale). O F-075 tem blocos de altura diferente
# e títulos no MEIO do bloco (ex.: "DADOS CONTA BANCÁRIA" fica DEPOIS dos
# rótulos das colunas), então a faixa é declarada em vez de inferida do título
# mais próximo. Cabeçalhos continuam sendo usados como reserva para trechos que
# caírem fora de toda faixa (ex.: um bloco novo numa versão futura do PDF).
FAIXAS_SECOES = [
    (760.0, 9999.0, "Cabeçalho"),
    (700.0, 760.0, "Aviso — Importante"),
    (518.0, 700.0, "Dados pessoais"),
    (460.0, 518.0, "Conta bancária"),
    (280.0, 460.0, "Dependentes"),
    (165.0, 280.0, "Benefícios — Vale transporte"),
    (100.0, 165.0, "Vale refeição / alimentação"),
    (60.0, 100.0, "Aviso — Atenção"),
    (0.0, 60.0, "Assinatura"),
]


def nome_fonte(fontname):
    base = fontname.split("+")[-1]
    for k, v in FONTES.items():
        if k == base:
            return v[0]
    return "Helvetica"


def une_glifos(b, page_h):
    """Agrupa glifos consecutivos (mesma fonte, corpo e linha de base) em trechos."""
    trechos = []
    for ch, fonte, size, base, x in b:
        if trechos:
            a = trechos[-1]
            vao = x - a["ultimo_x"]
            if (a["fonte"] == fonte and abs(a["size"] - size) < 0.01
                    and abs(a["base"] - base) < 0.05 and -0.6 <= vao <= VAO_MAX_EM * size):
                a["chars"].append({"c": ch, "x": round(x, 2)})
                a["ultimo_x"] = x
                a["fim"] = x
                continue
        trechos.append({"fonte": fonte, "size": round(size, 2), "base": base,
                        "chars": [{"c": ch, "x": round(x, 2)}], "x": x,
                        "ultimo_x": x, "fim": x})
    out = []
    for t in trechos:
        txt = "".join(c["c"] for c in t["chars"])
        # `base` ja esta em coordenadas pdf-lib (origem no canto INFERIOR
        # esquerdo): nao ha conversao a fazer aqui.
        out.append({"text": txt, "x": round(t["x"], 2), "y": round(t["base"], 2),
                    "size": t["size"], "font": t["fonte"], "chars": t["chars"]})
    return out


# ═══════════════════════════════════════════════════════════════════════════
# CATÁLOGO DE CAMPOS — o formulário que o ADM edita
# ═══════════════════════════════════════════════════════════════════════════
# A extração bruta entrega trechos que misturam várias coisas numa linha só
# ("Bradesco:  Corrente  Conta Salário  Poupança" é UM trecho com 3 caixinhas).
# Para o ADM poder trocar as opções de banco numa versão futura, cada opção
# precisa ser um campo próprio. A segmentação abaixo quebra o trecho NAS
# CAIXINHAS, mantendo o x exato de cada glifo — o desenho ancorado continua
# byte a byte igual ao PDF oficial; só a lista de campos muda.


def _mesma_linha(y1, y2):
    return abs(y1 - y2) <= MESMA_LINHA_PT


def _fim_do_trecho(t):
    """x do último glifo visível (o fim visual do trecho)."""
    visiveis = [c["x"] for c in t["chars"] if c["c"].strip()]
    return max(visiveis) if visiveis else t["x"]


def segmentar_por_checkboxes(texts, caixas):
    """Quebra cada trecho nas caixinhas que caem na mesma linha."""
    saida = []
    for t in texts:
        dentro = [c for c in caixas if _mesma_linha(t["y"], c["base"])
                  and t["x"] - 0.6 <= c["x"] <= _fim_do_trecho(t) + 0.6]
        dentro.sort(key=lambda c: c["x"])
        if not dentro:
            saida.append(dict(t))
            continue
        # Corta o trecho em: [antes da 1a caixa] [entre caixas] [depois]
        cortes = [c["x"] for c in dentro]
        grupos, atual = [], []
        for ch in t["chars"]:
            while cortes and ch["x"] >= cortes[0] - 0.01:
                grupos.append(atual)
                atual = []
                cortes.pop(0)
            atual.append(ch)
        grupos.append(atual)
        for g in grupos:
            # Tira espaços das pontas: eles não desenham nada e, num trecho
            # reescrito, empurrariam o texto novo para a direita da caixinha.
            while g and not g[0]["c"].strip():
                g.pop(0)
            while g and not g[-1]["c"].strip():
                g.pop()
            if not g:
                continue  # pedaço só de espaços: não é campo
            saida.append({
                "text": "".join(c["c"] for c in g),
                "x": round(g[0]["x"], 2), "y": t["y"],
                "size": t["size"], "font": t["font"], "chars": g,
            })
    return saida


def _secao_de(y, cabecalhos):
    """Faixa declarada do documento; o título em negrito mais próximo acima é a reserva."""
    for ymin, ymax, nome in FAIXAS_SECOES:
        if ymin <= y < ymax:
            return nome
    melhor = None
    for h in cabecalhos:
        if h["y"] > y + MESMA_LINHA_PT:
            if melhor is None or h["y"] > melhor["y"]:
                melhor = h
    return melhor["nome"] if melhor else "Campos"


def _pareia_rotulos(texts):
    """Rótulo "Nome:" + valor à direita → papel/rotuloDe de cada um."""
    for i, t in enumerate(texts):
        nome = t["text"].strip()
        if not nome.endswith(":"):
            continue
        rotulo = nome[:-1].strip()
        if not rotulo or len(rotulo) > 40:
            continue
        t["papel"] = "rotulo"
        t["nome"] = NOMES_CURADOS.get(t["text"], rotulo)
        # Primeiro trecho à direita na MESMA linha que não seja outro rótulo
        # nem o rótulo de uma opção (a opção já está ligada à sua caixinha).
        melhor = None
        for j, o in enumerate(texts):
            if j == i or not _mesma_linha(t["y"], o["y"]):
                continue
            if o.get("opcaoDe") or o["x"] < _fim_do_trecho(t):
                continue
            if o["x"] - _fim_do_trecho(t) > VALOR_MAX_PT:
                continue
            if o["text"].strip().endswith(":"):
                continue
            if melhor is None or o["x"] < melhor["x"]:
                melhor = o
        if melhor is not None:
            melhor["papel"] = "valor"
            melhor["rotuloDe"] = t["id"]
            melhor["nome"] = t["nome"]


def _prefixa_opcoes(texts):
    """Nome da opçãoqualified com o rótulo do seu grupo ("Bradesco — Corrente")."""
    for t in texts:
        if t.get("papel") != "opcao":
            continue
        grupo = None
        for o in texts:
            if o is t or o.get("papel") != "rotulo" or not _mesma_linha(o["y"], t["y"]):
                continue
            if o["x"] < t["x"] and (grupo is None or o["x"] > grupo["x"]):
                grupo = o
        if grupo is not None:
            t["grupo"] = grupo["nome"]
            t["nome"] = grupo["nome"] + " — " + t["text"].strip()


def _liga_opcoes(texts, caixas):
    """Associa cada caixinha ao rótulo à sua direita e vice-versa."""
    for c in caixas:
        rotulo = None
        for t in texts:
            if not _mesma_linha(c["base"], t["y"]):
                continue
            if t["x"] < c["x"] - 0.6 or t["x"] > c["x"] + 120.0:
                continue
            if not t["text"].strip():
                continue
            if rotulo is None or t["x"] < rotulo["x"]:
                rotulo = t
        c["rotulo"] = rotulo["text"].strip() if rotulo else ""
        c["nome"] = c["rotulo"] or c["id"]
        if rotulo is not None:
            rotulo["papel"] = "opcao"
            rotulo["opcaoDe"] = c["id"]


def cataloga_campos(template):
    """Dá nome, seção, papel e id a cada trecho e caixinha do documento."""
    # Trechos só de espaços não desenham nada (o glifo em branco é ignorado
    # no desenho) e não são campo nenhum: saem do catálogo e do template.
    template["texts"] = [t for t in template["texts"] if t["text"].strip()]
    textos = template["texts"]
    caixas = template["checkboxes"]
    for i, t in enumerate(textos):
        t["id"] = "t%02d" % i
    for i, c in enumerate(caixas):
        c["id"] = "c%02d" % i

    cabecalhos = []
    for t in textos:
        txt = t["text"].strip()
        if not txt:
            continue
        if t["font"] == "Arial-Bold" and t["size"] >= 8.9 and t["x"] <= 300.0:
            cabecalhos.append({"id": t["id"], "y": t["y"], "x": t["x"],
                                "nome": NOMES_CURADOS.get(t["text"], txt)})

    _liga_opcoes(textos, caixas)
    _pareia_rotulos(textos)
    _prefixa_opcoes(textos)

    largura_util = template["page"]["width"] - MARGEM_DIREITA_PT
    titulo_ids = {h["id"] for h in cabecalhos}
    for t in textos:
        t["secao"] = _secao_de(t["y"], cabecalhos)
        if t.get("papel") in ("rotulo", "valor", "opcao"):
            t["nome"] = t.get("nome") or t["text"].strip()
        elif t["id"] in titulo_ids:
            t["papel"] = "titulo"          # título de bloco/tabela (estrutural)
            t["nome"] = NOMES_CURADOS.get(t["text"], t["text"].strip())
        elif t["text"].strip(": ,;.·-") == "":
            t["papel"] = "pontuacao"       # dois-pontos solto, vírgula solta…
            t["nome"] = t["text"].strip()
        else:
            t["papel"] = "texto"
            t["nome"] = NOMES_CURADOS.get(t["text"], t["text"].strip())
        # `maxWidth` = espaço livre à direita. Serve à quebra quando o ADM
        # reescreve o trecho (o trecho ancorado ignora — os glifos têm x fixo).
        t["maxWidth"] = round(max(20.0, min(largura_util - t["x"], LARGURA_MAXIMA_PT)), 2)
        t["lineHeight"] = round(t["size"] * 1.2, 2)
        t["visivel"] = True

    for c in caixas:
        c["secao"] = _secao_de(c["base"], cabecalhos)
        c["visivel"] = True



def extract(pdf_path: str, out_dir: str, page_index: int = 0):
    assets_dir = os.path.join(out_dir, "assets")
    os.makedirs(assets_dir, exist_ok=True)

    doc = fitz.open(pdf_path)
    page_fitz = doc[page_index]
    page_h, page_w = page_fitz.rect.height, page_fitz.rect.width

    # As fontes declaradas sao DERIVADAS do mapa FONTES: toda familia que tem
    # TTF no repositorio e declarada, nao so as duas primeiras. No F-075 v38
    # nueve trechos usam Arial-Narrow(-Bold) — sem esta linha eles caiam no
    # fallback largo e estouravam a caixa.
    familias = {}
    for _pdf, (nome, arquivo) in FONTES.items():
        if not arquivo or nome in familias:
            continue
        familias[nome] = {"arquivo": arquivo,
                          "fallback": FALLBACK_FONTE.get(nome, "Helvetica")}

    template = {
        "page": {"width": round(page_w, 2), "height": round(page_h, 2)},
        "fontes": familias,
        "fonteCheckbox": {"arquivo": "assets/seguisym.ttf"},
        "images": [], "blackBars": [], "whiteBoxes": [], "texts": [], "checkboxes": []
    }

    # ---- Imagens (compostas com smask -> PNG RGBA), na ordem em que aparecem
    for i, im in enumerate(page_fitz.get_image_info(xrefs=True)):
        xref = im["xref"]
        base = doc.extract_image(xref)
        img = Image.open(io.BytesIO(base["image"])).convert("RGBA")
        smask_xref = base.get("smask")
        if smask_xref:
            smask_data = doc.extract_image(smask_xref)
            mask_img = Image.open(io.BytesIO(smask_data["image"])).convert("L")
            if mask_img.size != img.size:
                mask_img = mask_img.resize(img.size)
            img.putalpha(mask_img)
        fname = f"assets/img{i}.png"
        img.save(os.path.join(out_dir, fname))
        x0, y0, x1, y1 = im["bbox"]
        template["images"].append({
            "file": fname, "x": round(x0, 2), "y": round(page_h - y1, 2),
            "width": round(x1 - x0, 2), "height": round(y1 - y0, 2)
        })

    # ---- Texto ancorado + marcacoes (origem exata de cada glifo)
    glifos, caixas = [], []
    for b in page_fitz.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                fonte = nome_fonte(s["font"])
                size = s["size"]
                for ch in s["chars"]:
                    cx, cy = ch["origin"]
                    if ch["c"] == GLIFO_CHECKBOX:
                        caixas.append({"x": round(cx, 2), "base": round(page_h - cy, 2),
                                       "size": round(size, 2)})
                    else:
                        # Espacos entram tambem: e o que mantem `text` igual ao
                        # texto real do PDF (o desenho ignora o glifo em branco).
                        glifos.append((ch["c"], fonte, size, page_h - cy, cx))
    template["texts"] = une_glifos(glifos, page_h)
    template["checkboxes"] = caixas

    # ---- Catálogo de campos: a segmentação por caixinha PRECEDE a vetorial
    # (que pode acrescentar caixinhas desenhadas) para que validas e opções de
    # banco virem campos individuais.
    textos = segmentar_por_checkboxes(template["texts"], template["checkboxes"])
    template["texts"] = textos

    # ---- Retangulos vetoriais (divisorias e caixas de acabamento)
    with pdfplumber.open(pdf_path) as pdf:
        p = pdf.pages[page_index]

        # IMPORTANTE: o pdf-plumber mede a partir da MEDIA BOX, e nao da Crop
        # Box. A F-075_37 (versao anterior) tinha MediaBox [0, 7.83, ...] e
        # CropBox [0, 0, ...]: usar a altura da pagina (842,25) como origem
        # derruba todas as divisorias 7,83 pt para fora do lugar. O v38 tem
        # MediaBox == CropBox, mas `p.bbox[3]` ja e a base certa (o topo do
        # recorte, no mesmo sistema do pdf-lib) e nao custa nada depender
        # dela em vez da altura da pagina.
        ref_h = p.bbox[3]

        seen = set()
        for r in p.rects:
            key = (round(r["x0"], 1), round(r["x1"], 1), round(r["top"], 1), round(r["bottom"], 1))
            if key in seen:
                continue
            seen.add(key)
            w, h = r["x1"] - r["x0"], r["bottom"] - r["top"]
            if w > page_w * 0.95 and h > page_h * 0.9:
                continue  # fundo de pagina inteiro, ignorar
            entry = {"x": round(r["x0"], 2), "y": round(ref_h - r["bottom"], 2),
                     "width": round(w, 2), "height": round(h, 2)}
            linha = w <= 3 or h <= 3      # divisoria: fina em pelo menos um eixo
            if linha:
                # Divisoria real (horizontal ~0.48 pt ou VERTICAL ~0.48 pt de
                # largura). As verticais sao tan importantes quanto as
                # horizontais: sem elas a tabela perde as colunas.
                if r.get("stroking_color") is not None and r.get("non_stroking_color") is None:
                    rgb = tuple(round(c, 2) for c in r["stroking_color"])
                    if rgb != (0.0, 0.0, 0.0):
                        entry["cor"] = "#%02X%02X%02X" % tuple(int(round(c * 255)) for c in rgb)
                        entry["width"] = max(round(w, 2), 0.48)
                template["blackBars"].append(entry)
            elif r.get("non_stroking_color") == (1.0, 1.0, 1.0) and r.get("stroking_color") is not None:
                # Caixa de campo: fundo branco que COBRE o que estiver embaixo
                # (e o que faz a grade sumir nos pontos certainos do original).
                # A borda so existe quando o PDF realmente CONTORNA a caixa
                # (contorno escuro com espessura > 0). Na F-075_37 o contorno
                # e branco com espessura 0 e o par preto que vem depois e
                # desenhado com alfa 0 (invisivel): desenhar borda preta ali
                # seria inventar traco que o original nao tem.
                if _escuro(r.get("stroking_color")) and (r.get("linewidth") or 0) > 0:
                    entry["borda"] = round(r["linewidth"], 2)
                if w < 15 and h < 15:
                    entry.update({"x": round(r["x0"], 2), "width": w, "height": h})
                    template["checkboxes"].append(entry)   # quadradinho desenhado
                else:
                    template["whiteBoxes"].append(entry)
            # Qualquer outro retangulo "alto e largo" e o par preto+branco de
            # acabamento (o preto vem com alfa 0 e nao aparece no original):
            # descartado junto com o branco correspondente.

    with open(os.path.join(out_dir, "template.json"), "w", encoding="utf-8") as f:
        cataloga_campos(template)
        json.dump(template, f, ensure_ascii=False, indent=2)

    secoes = sorted({t["secao"] for t in template["texts"]})
    print(f"OK: {len(template['images'])} imagens, {len(template['blackBars'])} linhas, "
          f"{len(template['whiteBoxes'])} caixas brancas, {len(template['texts'])} trechos de texto, "
          f"{len(template['checkboxes'])} checkboxes -> {out_dir}/template.json")
    print(f"    campos editáveis: {len(template['texts'])} trechos + {len(template['checkboxes'])} caixinhas "
          f"em {len(secoes)} seções: " + ", ".join(secoes))


def _escuro(cor):
    """True se a cor de contorno e preta (ou quase)."""
    if not cor or not isinstance(cor, (tuple, list)) or len(cor) < 3:
        return False
    return all(c <= 0.2 for c in cor[:3])


if __name__ == "__main__":
    pdf_path, out_dir = sys.argv[1], sys.argv[2]
    extract(pdf_path, out_dir)
