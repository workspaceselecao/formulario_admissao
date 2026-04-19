"""
Remapeia as coordenadas dos campos de dado do schema para as CAIXAS DE TEXTO
do PDF oficial "F-075 (PR-011) Ficha Cadastral para Admissão_com caixa.pdf".

Aquele arquivo é o v38 com uma camada de anotação: 65 retângulos de
preenchimento branco com traço preto de 0,5 pt, desenhados por cima, marcando
exatamente onde o candidato escreve. Nenhum deles existe no v38 simples — são a
fonte de verdade da geometria dos campos.

Cada campo do schema recebe a caixa como está no PDF:
    x       = x0 da caixa
    y       = y0 da caixa (Y cresce para cima, como no pdf-lib)
    largura = x1 - x0
    altura  = y1 - y0

Assim a caixa que o Editor Visual desenha sobre o PDF é a MESMA caixa impressa,
e o texto que a engine escreve cai dentro dela: a baseline é
`y + min((altura − 0,72 × 9) / 2; altura × 0,78)` — a caixa alta do valor
centralizada na caixa impressa (EmbeddedDocs.PERFIL_APP).

O mapeamento campo → caixa é explícito (índice 1-based na lista de caixas em
ordem de leitura) e cada escolha é conferida contra o PDF, para não trocar dois
campos de lugar:

    "rotulo"  — o texto estático que ancora a caixa. Tem que estar na mesma
                linha (Y) e começar à esquerda ou em cima dela.
    "quadro"  — a opção é ancorada pelo glifo ❑: o centro do ❑ impresso tem
                que cair dentro da caixa.
    "solto"   — a caixa não tem rótulo (linha de assinatura, rodapé de
                evidência); conferida só pela geometria.

Uso:
    python scripts/remapear-campos-v38.py          # mostra o plano e grava o schema
    python scripts/remapear-campos-v38.py --dry    # só conferência
"""
import sys, os, json
import pymupdf

try:  # os rótulos impressos têm glifos fora do cp1252 do console
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
REF_BOXES = os.path.join(RAIZ, "F-075_38 (PR-011) Ficha Cadastral para Admissão_com caixa.pdf")
SCHEMA = os.path.join(RAIZ, "ficha_cadastral_campos.json")

MESMA_LINHA_PT = 12.0   # tolerância de Y entre o rótulo e o topo da caixa
FOLGA_X_PT = 2.5        # o rótulo começa no máximo 2,5 pt à esquerda da caixa

# Exceções ao "x = x0 da caixa": o rótulo impresso INVADE a caixa e o valor
# precisa começar depois dele (senão a primeira letra cobre o rótulo).
AJUSTES = {
    # o rótulo "PIS:" (x 165,14..182,86) invade 1,96 pt da caixa 12
    "dados_pessoais.informarpis": {"x0": 184.5, "motivo": "rótulo PIS: invade a caixa"},
    # o rótulo "Nome:" (x 19,56..46,64) invade 27 pt da caixa de nome do dependente
    "dependentes.0.nome": {"x0": 47.6, "motivo": "rótulo Nome: invade a caixa"},
    "dependentes.1.nome": {"x0": 47.6, "motivo": "rótulo Nome: invade a caixa"},
    "dependentes.2.nome": {"x0": 47.6, "motivo": "rótulo Nome: invade a caixa"},
    "dependentes.3.nome": {"x0": 47.6, "motivo": "rótulo Nome: invade a caixa"},
    "dependentes.4.nome": {"x0": 47.6, "motivo": "rótulo Nome: invade a caixa"},
}

# campo → (índice da caixa 1-based, âncora)
MAPA = {
    "dados_pessoais.nome":                          (4,  ("rotulo", "Nome Completo:")),
    "dados_pessoais.craxá":                       (5,  ("rotulo", "Nome Social:")),
    "dados_pessoais.fone":                          (7,  ("rotulo", "Telefone:")),
    "dados_pessoais.celular":                       (6,  ("rotulo", "Celular:")),
    "dados_pessoais.email":                         (8,  ("rotulo", "E-mail:")),
    "dados_pessoais.estadocivil":                   (9,  ("rotulo", "Estado Civil:")),
    "dados_pessoais.primeiro_emprego.sim":          (10, ("quadro", "❑")),
    "dados_pessoais.primeiro_emprego.nao":          (11, ("quadro", "❑")),
    "dados_pessoais.informarpis":                   (12, ("rotulo", "PIS:")),
    "endereco.rua":                                 (14, ("rotulo", "Endereço:")),
    "endereco.numero":                              (15, ("rotulo", "Nº")),
    "endereco.complemento":                         (13, ("rotulo", "Complemento:")),
    "endereco.cep":                                 (17, ("rotulo", "CEP:")),
    "endereco.bairro":                              (18, ("rotulo", "Bairro:")),
    "endereco.cidadeuf":                            (16, ("rotulo", "Cidade:")),
    "deficiencia.possui_deficiencia.sim":           (19, ("quadro", "❑")),
    "deficiencia.possui_deficiencia.nao":           (20, ("quadro", "❑")),
    "deficiencia.tipo_deficiencia.fisica":          (23, ("quadro", "❑")),
    "deficiencia.tipo_deficiencia.auditiva":        (24, ("quadro", "❑")),
    "deficiencia.tipo_deficiencia.visual":          (25, ("quadro", "❑")),
    "deficiencia.tipo_deficiencia.intelectual":     (21, ("quadro", "❑")),
    "deficiencia.tipo_deficiencia.multipla":        (22, ("quadro", "❑")),
    "conta_bancaria.tipo_conta.conta_corrente":     (26, ("quadro", "❑")),
    "conta_bancaria.tipo_conta.bradesco":           (27, ("quadro", "❑")),
    "conta_bancaria.tipo_conta.poupanca_bradesco":   (28, ("quadro", "❑")),
    "conta_bancaria.tipo_conta.santander_corrente": (32, ("quadro", "❑")),
    "conta_bancaria.tipo_conta.santander_salario":  (31, ("quadro", "❑")),
    "conta_bancaria.bradesco_agencia":              (29, ("rotulo", "Agência:")),
    "conta_bancaria.bradesco_conta_digito":         (30, ("rotulo", "Conta/Dígito:")),
    "conta_bancaria.santander_agencia":             (29, ("rotulo", "Agência:")),
    "conta_bancaria.santander_conta_digito":        (30, ("rotulo", "Conta/Dígito:")),
    "conta_bancaria.cpf_titular":                   (33, ("rotulo", "Número do CPF")),
    "vale_alimentacao_refeicao.alimentacao":        (59, ("quadro", "❑")),
    "vale_alimentacao_refeicao.refeicao":           (57, ("quadro", "❑")),
    "vale_alimentacao_refeicao.flex":               (58, ("quadro", "❑")),
    # dependentes: 5 linhas × (nome | data de nascimento | CPF). Nas linhas,
    # "Data de nascimento:" e "CPF (do dependente):" começam ANTES da caixa da
    # coluna do meio/direita (x0 307,85 e 430,51) e "Nome:" invade a caixa da
    # esquerda (ver AJUSTES). O valor entra depois do rótulo sem cobri-lo.
    "dependentes.0.nome":                           (36, ("rotulo", "Nome:")),
    "dependentes.0.dtnasc":                         (34, ("rotulo", "Data de nascimento:")),
    "dependentes.0.cpf":                            (35, ("rotulo", "CPF (do dependente):")),
    "dependentes.1.nome":                           (39, ("rotulo", "Nome:")),
    "dependentes.1.dtnasc":                         (37, ("rotulo", "Data de nascimento:")),
    "dependentes.1.cpf":                            (38, ("rotulo", "CPF (do dependente):")),
    "dependentes.2.nome":                           (42, ("rotulo", "Nome:")),
    "dependentes.2.dtnasc":                         (40, ("rotulo", "Data de nascimento:")),
    "dependentes.2.cpf":                            (41, ("rotulo", "CPF (do dependente):")),
    "dependentes.3.nome":                           (45, ("rotulo", "Nome:")),
    "dependentes.3.dtnasc":                         (43, ("rotulo", "Data de nascimento:")),
    "dependentes.3.cpf":                            (44, ("rotulo", "CPF (do dependente):")),
    "dependentes.4.nome":                           (48, ("rotulo", "Nome:")),
    "dependentes.4.dtnasc":                         (46, ("rotulo", "Data de nascimento:")),
    "dependentes.4.cpf":                            (47, ("rotulo", "CPF (do dependente):")),
    # grade de vale-transporte: cada linha tem o rótulo à esquerda (ÔNIBUS,
    # METRÔ/TREM…); a coluna QUANTIDADE fica em x≈266 e a VALOR UNITÁRIO em
    # x≈454 — os cabeçalhos ficam 8 pt acima das caixas, sem invasão.
    "vale_transporte.itens.onibus.quantidade":      (50, ("rotulo", "ÔNIBUS")),
    "vale_transporte.itens.onibus.valor_unitario":  (49, ("rotulo", "ÔNIBUS")),
    "vale_transporte.itens.metro_trem.quantidade":  (52, ("rotulo", "METRÔ/TREM")),
    "vale_transporte.itens.metro_trem.valor_unitario": (51, ("rotulo", "METRÔ/TREM")),
    "vale_transporte.itens.intermunicipal.quantidade": (54, ("rotulo", "INTERMUNICIPAL")),
    "vale_transporte.itens.intermunicipal.valor_unitario": (53, ("rotulo", "INTERMUNICIPAL")),
    "vale_transporte.itens.integracao.quantidade":  (56, ("rotulo", "INTEGRAÇÃO")),
    "vale_transporte.itens.integracao.valor_unitario": (55, ("rotulo", "INTEGRAÇÃO")),
    # data segmentada da assinatura: três caixinhas sem rótulo na linha
    # (o trecho "DATA" fica embaixo, base 63,74); âncora só pela geometria.
    "assinatura.data.segmentos.dia":                (60, ("solto", "dia da assinatura")),
    "assinatura.data.segmentos.mes":                (61, ("solto", "mês da assinatura")),
    "assinatura.data.segmentos.ano":                (62, ("solto", "ano da assinatura")),
    "assinatura.rubrica":                           (63, ("solto", "linha de assinatura")),
    "assinatura.nome_legivel":                      (64, ("solto", "nome legível")),
    "assinatura.nome_legivel_sem_rubrica":          (64, ("solto", "nome legível sem rubrica")),
    "assinatura.evidencia":                         (65, ("solto", "rodapé de evidência")),
}


def caixas_do_pdf():
    """Os 65 retângulos de preenchimento, em ordem de leitura, com Y de baixo
    para cima (mesmo sistema do pdf-lib e do schema)."""
    doc = pymupdf.open(REF_BOXES)
    pg = doc[0]
    h = pg.rect.height
    caixas = [p["rect"] for p in pg.get_drawings() if p["type"] == "fs"]
    doc.close()
    caixas.sort(key=lambda r: (-(h - r.y1), r.x0))
    return [{"x0": r.x0, "y0": h - r.y1, "x1": r.x1, "y1": h - r.y0} for r in caixas]


def trechos_do_pdf():
    """Cada trecho estático com a caixa de tinta (x0, x1, y0, y1) em Y de baixo
    para cima — o Enough de uma caixa, não de uma fonte."""
    doc = pymupdf.open(REF_BOXES)
    pg = doc[0]
    h = pg.rect.height
    saida = []
    for b in pg.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = "".join(c["c"] for c in s["chars"]).strip()
                if not t:
                    continue
                saida.append({"t": t, "base": h - s["origin"][1],
                              "x0": s["bbox"][0], "x1": s["bbox"][2],
                              "y0": h - s["bbox"][3], "y1": h - s["bbox"][1]})
    doc.close()
    return saida


def achar(no, partes):
    """Acha o nó do schema pelo caminho pontilhado (seções, grupos e opções)."""
    if not partes:
        return no
    chave = partes[0]
    if isinstance(no.get(chave), dict):          # seção (ou campo) direto
        return achar(no[chave], partes[1:])
    for filial in ("campos", "opcoes"):
        d = no.get(filial)
        if isinstance(d, dict) and chave in d and isinstance(d[chave], dict):
            return achar(d[chave], partes[1:])
        if isinstance(d, list):
            for i, it in enumerate(d):
                if str(i) == chave and isinstance(it, dict):
                    return achar(it, partes[1:])
    itens = no.get("itens")
    if isinstance(itens, list):
        for i, it in enumerate(itens):
            if str(i) == chave and isinstance(it, dict):
                return achar(it, partes[1:])
    return None


def confere(c, ancora, trechos):
    """Confere a âncora escolhida contra a caixa. Devolve None ou o motivo."""
    tipo, alvo = ancora
    if tipo == "solto":
        return None
    if tipo == "quadro":
        dentro = [t for t in trechos
                  if t["t"] == alvo and c["x0"] - 1.5 <= (t["x0"] + t["x1"]) / 2 <= c["x1"] + 1.5
                  and c["y0"] - 1.5 <= (t["y0"] + t["y1"]) / 2 <= c["y1"] + 1.5]
        if not dentro:
            return "nenhum glifo %r com o centro dentro da caixa x=%.2f..%.2f y=%.2f..%.2f" % (
                alvo, c["x0"], c["x1"], c["y0"], c["y1"])
        return None
    cands = [t for t in trechos if t["t"].startswith(alvo)]
    if not cands:
        return "rótulo %r não existe no PDF" % alvo
    # o rótulo tem que estar na MESMA linha da caixa e começar à esquerda dela
    ok = [t for t in cands
          if abs(t["base"] - c["y1"]) <= MESMA_LINHA_PT
          and t["x0"] <= c["x0"] + FOLGA_X_PT]
    if not ok:
        melhor = min(cands, key=lambda t: abs(t["base"] - c["y1"]))
        return ("rótulo %r está em (x0=%.2f, base=%.2f) e a caixa em (x0=%.2f, y=%.2f..%.2f) "
                "— linhas diferentes" % (alvo, melhor["x0"], melhor["base"], c["x0"], c["y0"], c["y1"]))
    return None


def main():
    dry = "--dry" in sys.argv
    caixas = caixas_do_pdf()
    trechos = trechos_do_pdf()
    print("caixas de preenchimento no PDF: %d · trechos estáticos: %d"
          % (len(caixas), len(trechos)))

    with open(SCHEMA, encoding="utf-8") as fh:
        schema = json.load(fh)

    problemas, aplicados = [], 0
    for caminho, (idx, ancora) in sorted(MAPA.items()):
        if idx < 1 or idx > len(caixas):
            problemas.append("%s: índice de caixa %d fora de 1..%d" % (caminho, idx, len(caixas)))
            continue
        c = caixas[idx - 1]
        motivo = confere(c, ancora, trechos)
        if motivo:
            problemas.append("%s (caixa %d): %s" % (caminho, idx, motivo))
            continue
        no = achar(schema["campos"], caminho.split("."))
        if not isinstance(no, dict) or "coordenadas" not in no:
            problemas.append("%s: campo não encontrado no schema ou sem 'coordenadas'" % caminho)
            continue
        antigo = dict(no["coordenadas"])
        x0 = c["x0"]
        nota = AJUSTES.get(caminho)
        if nota:
            x0 = nota["x0"]
        no["coordenadas"] = {
            "x": round(x0, 2),
            "y": round(c["y0"], 2),
            "largura": round(c["x1"] - x0, 2),
            "altura": round(c["y1"] - c["y0"], 2),
        }
        aplicados += 1
        print("  %-44s cx %2d -> %7.2f,%7.2f %6.2fx%5.2f   (era %7.2f,%7.2f %6.2fx%5.2f)  %s%s"
              % (caminho, idx,
                 no["coordenadas"]["x"], no["coordenadas"]["y"],
                 no["coordenadas"]["largura"], no["coordenadas"]["altura"],
                 antigo.get("x", 0), antigo.get("y", 0),
                 antigo.get("largura", 0), antigo.get("altura", 0),
                 ancora[1],
                 "  [x ajustado: %s]" % nota["motivo"] if nota else ""))

    if problemas:
        print("\n%d PROBLEMA(S) — nada foi gravado:" % len(problemas))
        for p in problemas:
            print("   - " + p)
        return 1

    if dry:
        print("\n%d campo(s) conferem. --dry: schema não gravado." % aplicados)
        return 0

    with open(SCHEMA, "w", encoding="utf-8") as fh:
        json.dump(schema, fh, ensure_ascii=False, indent=2)
    print("\n%d campo(s) remapeado(s) para as caixas do v38. Schema gravado." % aplicados)
    return 0


if __name__ == "__main__":
    sys.exit(main())
