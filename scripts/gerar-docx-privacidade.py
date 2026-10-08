#!/usr/bin/env python3
"""Gera Docs/Servicos_Privacidade_Termos.docx a partir das páginas publicadas em Docs/.

A cópia DOCX é um artefato de referência/documentação: sempre que os textos de
privacidade ou segurança mudarem, rode este script e commite o DOCX junto.

Uso:
    python scripts/gerar-docx-privacidade.py

Regras:
  - Cada página entra como "Heading 1" e o conteúdo do <article> da página é
    convertido em títulos, parágrafos, listas, tabelas e blocos de texto.
  - O carimbo dinâmico de revisão jurídica (<section class="doc-revisao-juridica">)
    é ignorado: ele é gerado em tempo de execução pela página publicada.
  - O texto é convertido fielmente (negrito/itálico/código preservados; links
    viram texto, pois o DOCX é uma cópia de leitura).
"""

from __future__ import annotations

import datetime
import pathlib
import re
import sys

from lxml import html as lhtml

try:
    import docx
except ImportError:  # pragma: no cover - dependência de ambiente
    sys.exit("python-docx não instalado. Instale com: pip install python-docx")

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DOCS = RAIZ / "Docs"
SAIDA = DOCS / "Servicos_Privacidade_Termos.docx"

# Ordem e títulos conforme o hub público (Docs/index.html).
PAGINAS = [
    ("index.html", "Privacidade e segurança (visão geral)"),
    ("aviso-de-privacidade.html", "Aviso de Privacidade — Hub Formulários RH"),
    ("privacy-policy.html", "Política de Privacidade"),
    ("terms-of-use.html", "Termos de Uso"),
    ("data-flow.html", "Fluxo de dados"),
    ("ripd.html", "Impacto na privacidade (RIPD)"),
    ("security-baseline.html", "Segurança da plataforma"),
    ("incident-response.html", "Resposta a incidentes"),
    ("legal-basis.html", "Bases legais (LGPD)"),
    ("governance.html", "Governança"),
]

IGNORAR = {"script", "style", "nav", "svg", "footer", "header", "button", "noscript"}


def texto(el) -> str:
    """Texto normalizado (espaços colapsados) do elemento e descendentes."""
    return " ".join((el.text_content() or "").split())


def escrever_inline(par, el):
    """Escreve o conteúdo inline do elemento no parágrafo (negrito/itálico/código).

    Controla os espaços entre trechos de marcação para não colar palavras
    (ex.: "com <strong>expiração</strong>" → "com expiração").
    """
    estado = {"espaco": False, "inicio": True}

    def emitir(valor: str, *, bold: bool = False, italic: bool = False, mono: bool = False):
        colapsado = re.sub(r"\s+", " ", valor or "")
        if not colapsado:
            return
        if colapsado == " ":
            estado["espaco"] = True
            return
        termina_espaco = colapsado.endswith(" ")
        conteudo = colapsado[:-1] if termina_espaco else colapsado
        if estado["inicio"]:
            conteudo = conteudo.lstrip(" ")
        if estado["espaco"]:
            conteudo = " " + conteudo.lstrip(" ")
        if not conteudo.strip():
            estado["espaco"] = True
            return
        estado["espaco"] = termina_espaco
        estado["inicio"] = False
        run = par.add_run(conteudo)
        if bold:
            run.bold = True
        if italic:
            run.italic = True
        if mono:
            run.font.name = "Consolas"

    def percorrer(no):
        if no.text:
            emitir(no.text)
        for filho in no:
            tag = (filho.tag or "").lower() if isinstance(filho.tag, str) else ""
            if tag in IGNORAR or tag in ("ul", "ol"):
                pass
            elif tag == "br":
                par.add_run().add_break()
                estado["espaco"] = False
                estado["inicio"] = False
            elif tag in ("strong", "b"):
                emitir(texto(filho), bold=True)
            elif tag in ("em", "i"):
                emitir(texto(filho), italic=True)
            elif tag == "code":
                emitir(texto(filho), mono=True)
            elif tag in ("a", "abbr", "span", "small", "sub", "sup", "cite", "q", "time"):
                percorrer(filho)
            else:
                emitir(texto(filho))
            if filho.tail:
                emitir(filho.tail)

    percorrer(el)


def render_lista(container, lista, estilo: str):
    for item in lista:
        if (item.tag or "").lower() != "li":
            continue
        par = container.add_paragraph(style=estilo)
        escrever_inline(par, item)
        for sub in item:
            tag_sub = (sub.tag or "").lower() if isinstance(sub.tag, str) else ""
            if tag_sub in ("ul", "ol"):
                render_lista(container, sub, "List Number 2" if estilo.startswith("List Number") else "List Bullet 2")


def render_tabela(container, tabela):
    linhas = [tr for tr in tabela.iter("tr")]
    if not linhas:
        return
    colunas = max(len([c for c in tr if (c.tag or "").lower() in ("td", "th")]) for tr in linhas)
    doc_tabela = container.add_table(rows=0, cols=colunas)
    doc_tabela.style = "Table Grid"
    for tr in linhas:
        celulas = [c for c in tr if (c.tag or "").lower() in ("td", "th")]
        linha = doc_tabela.add_row().cells
        for indice, celula in enumerate(celulas[:colunas]):
            linha[indice].text = texto(celula)
            if (celula.tag or "").lower() == "th":
                for run in linha[indice].paragraphs[0].runs:
                    run.bold = True
    container.add_paragraph()


def render_pre(container, pre):
    linhas = (pre.text_content() or "").split("\n")
    par = container.add_paragraph()
    for indice, linha in enumerate(linhas):
        if indice:
            par.add_run().add_break()
        run = par.add_run(linha.rstrip())
        run.font.name = "Consolas"


def render(container, el):
    for filho in el:
        tag = (filho.tag or "").lower() if isinstance(filho.tag, str) else ""
        if tag in IGNORAR:
            continue
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            container.add_heading(texto(filho), level=int(tag[1]))
        elif tag == "p":
            par = container.add_paragraph()
            escrever_inline(par, filho)
        elif tag in ("ul", "ol"):
            render_lista(container, filho, "List Number" if tag == "ol" else "List Bullet")
        elif tag == "blockquote":
            par = container.add_paragraph()
            escrever_inline(par, filho)
            par.paragraph_format.left_indent = docx.shared.Pt(18)
            for run in par.runs:
                run.italic = True
        elif tag == "table":
            render_tabela(container, filho)
        elif tag == "pre":
            render_pre(container, filho)
        elif tag == "section":
            if "doc-revisao" in (filho.get("class") or ""):
                continue  # carimbo dinâmico do Git, gerado pela página publicada
        elif tag in ("article", "div", "main", "details", "figure", "address"):
            render(container, filho)
        elif tag in ("hr", "script", "style", "template"):
            continue
        else:
            conteudo = texto(filho)
            if conteudo:
                par = container.add_paragraph()
                escrever_inline(par, filho)


def extrair_artigo(arvore):
    """Conteúdo principal da página: <article> dos documentos ou <main> da visão geral."""
    for consulta in (
        '//article[contains(@class, "doc-shell-main")]',
        '//main[contains(@class, "doc-main")]',
        "//main",
        "//body",
    ):
        encontrados = arvore.xpath(consulta)
        if encontrados:
            return encontrados[0]
    return None


def main() -> int:
    documento = docx.Document()
    documento.add_heading("Serviços — Privacidade e Termos", level=0)
    documento.add_paragraph(
        "Cópia extraída das páginas publicadas do Atentoform (Hub de Recrutamento & Seleção) "
        "para referência/documentação."
    )
    documento.add_paragraph(
        "Gerada automaticamente de Docs/*.html em "
        + datetime.date.today().strftime("%d/%m/%Y")
        + " — não editar este arquivo à mão; execute python scripts/gerar-docx-privacidade.py."
    )

    for arquivo, titulo in PAGINAS:
        caminho = DOCS / arquivo
        if not caminho.exists():
            print(f"FALTANDO: {caminho}")
            return 1
        arvore = lhtml.parse(str(caminho)).getroot()
        artigo = extrair_artigo(arvore)
        if artigo is None:
            print(f"SEM conteúdo principal: {arquivo}")
            return 1
        documento.add_heading(titulo, level=1)
        render(documento, artigo)

    documento.save(str(SAIDA))
    print(f"Gerado: {SAIDA} ({len(documento.paragraphs)} parágrafos, {len(documento.tables)} tabelas)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
