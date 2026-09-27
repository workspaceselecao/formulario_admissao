# -*- coding: utf-8 -*-
"""Reancora os campos de texto do schema nas caixas desenhadas pelo usuário
no PDF 'F-075_38 (PR-011) Ficha Cadastral para Admissão_com caixa.pdf'.

Conversão (engine embedded-docs.js: baseline = y + min(h*0.78; 9*1.12), -9 se y>120):
  - y > 120  -> y = (H - y1_caixa) + 2.3   (caps do texto centrado na caixa de 12.3:
             baseline a 2,89 do fundo, topo das maiúsculas a 2,96 do topo)
  - y <= 120 -> y = (H - y1_caixa) - 6.69  (sem o offset -9; mesmo centrado)
  x = x0 + 1 ; largura = w_caixa - 2 ; altura = h_caixa
Nota: o bbox de palavra do pymupdf inclui o ascender (~2pt acima das maiúsculas),
então ytop_palavra ≈ topo_da_caixa - 0,3 NÃO significa texto deslocado.
Radios (9.75x8.85) ficam intactos — as caixas do usuário batem com o schema.
"""
import json, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

H = 841.92
JSON_PATH = 'ficha_cadastral_campos.json'

# (x0, y0, x1, y1) das caixas de texto no PDF "com caixa" (coords pymupdf, top-down)
CAIXAS = {
    # ── Cabeçalho (código/revisão e vigência) ──
    'codigo_revisao': (198.45, 45.87, 286.50, 59.67),
    'data_publicacao': (362.50, 41.85, 421.60, 53.25),
    'vigencia': (362.75, 54.05, 421.85, 65.45),
    # ── Dados pessoais ──
    'dados_pessoais.campos.nome': (18.40, 135.14, 493.10, 147.44),
    'dados_pessoais.campos.craxá': (18.40, 157.94, 493.10, 170.24),
    'dados_pessoais.campos.fone': (18.40, 180.44, 249.75, 192.74),
    'dados_pessoais.campos.celular': (261.80, 180.24, 493.15, 192.54),
    'dados_pessoais.campos.email': (18.40, 203.14, 316.15, 215.44),
    'dados_pessoais.campos.estadocivil': (18.40, 225.94, 316.15, 238.24),
    'informarpis': (180.90, 248.69, 315.15, 260.99),
    # ── Endereço ──
    'endereco.campos.rua': (19.50, 271.59, 317.25, 283.89),
    'endereco.campos.numero': (329.25, 271.59, 374.60, 283.89),
    'endereco.campos.complemento': (384.35, 271.24, 571.85, 283.54),
    'endereco.campos.cep': (19.05, 294.14, 125.80, 306.44),
    'endereco.campos.bairro': (135.05, 294.24, 331.90, 306.54),
    'endereco.campos.cidadeuf': (339.35, 294.09, 574.10, 306.39),
    # ── Conta bancária ──
    'conta_bancaria.campos.bradesco_agencia': (297.35, 338.69, 408.95, 350.99),
    'conta_bancaria.campos.bradesco_conta_digito': (417.20, 338.69, 556.75, 350.99),
    'conta_bancaria.campos.santander_agencia': (297.35, 338.69, 408.95, 350.99),
    'conta_bancaria.campos.santander_conta_digito': (417.20, 338.69, 556.75, 350.99),
    'conta_bancaria.campos.cpf_titular': (297.50, 362.77, 483.95, 375.07),
    # ── Dependentes (5 linhas: nome / dtnasc / cpf) ──
    'dependentes.0.campos.nome': (19.65, 409.72, 300.75, 422.02),
    'dependentes.0.campos.dtnasc': (308.45, 409.52, 420.70, 421.82),
    'dependentes.0.campos.cpf': (430.60, 409.52, 565.00, 421.82),
    'dependentes.1.campos.nome': (19.65, 430.82, 300.75, 443.12),
    'dependentes.1.campos.dtnasc': (308.45, 430.62, 420.70, 442.92),
    'dependentes.1.campos.cpf': (430.60, 430.62, 565.00, 442.92),
    'dependentes.2.campos.nome': (19.65, 452.27, 300.75, 464.57),
    'dependentes.2.campos.dtnasc': (308.45, 452.07, 420.70, 464.37),
    'dependentes.2.campos.cpf': (430.60, 452.07, 565.00, 464.37),
    'dependentes.3.campos.nome': (19.65, 473.37, 300.75, 485.67),
    'dependentes.3.campos.dtnasc': (308.45, 473.17, 420.70, 485.47),
    'dependentes.3.campos.cpf': (430.60, 473.17, 565.00, 485.47),
    'dependentes.4.campos.nome': (19.65, 495.12, 300.75, 507.42),
    'dependentes.4.campos.dtnasc': (308.45, 494.92, 420.70, 507.22),
    'dependentes.4.campos.cpf': (430.60, 494.92, 565.00, 507.22),
    # ── Vale transporte (4 modalidades: quantidade / valor) ──
    'vale_transporte.itens.onibus.quantidade': (266.30, 556.25, 326.85, 568.55),
    'vale_transporte.itens.onibus.valor_unitario': (453.65, 555.72, 514.20, 568.02),
    'vale_transporte.itens.metro_trem.quantidade': (266.50, 577.10, 327.05, 589.40),
    'vale_transporte.itens.metro_trem.valor_unitario': (453.85, 576.55, 514.40, 588.85),
    'vale_transporte.itens.intermunicipal.quantidade': (266.60, 595.97, 327.15, 608.27),
    'vale_transporte.itens.intermunicipal.valor_unitario': (453.95, 595.42, 514.50, 607.72),
    'vale_transporte.itens.integracao.quantidade': (266.35, 616.02, 326.90, 628.32),
    'vale_transporte.itens.integracao.valor_unitario': (453.70, 615.47, 514.25, 627.77),
    # ── Assinatura (área y<120: sem offset -9) ──
    'assinatura.campos.nome_legivel': (60.30, 779.81, 293.15, 792.56),
    'assinatura.campos.nome_legivel_sem_rubrica': (60.30, 779.81, 293.15, 792.56),
    'assinatura.campos.rubrica': (60.00, 725.17, 292.85, 769.42),
    'assinatura.campos.data.segmentos.dia': (437.45, 755.82, 464.35, 768.57),
    'assinatura.campos.data.segmentos.mes': (478.05, 755.82, 505.65, 768.57),
    'assinatura.campos.data.segmentos.ano': (519.35, 755.82, 547.60, 768.57),
    # ── Rodapé: evidência ──
    'assinatura.campos.evidencia': (20.00, 825.66, 576.75, 838.41),
}

CAMPOS_FIXOS = {
    'codigo_revisao': {'x': 199.5, 'y': 589.9, 'largura': 86, 'altura': 13.8},
    'data_publicacao': {'x': 363.5, 'y': 601.2, 'largura': 57, 'altura': 11.4},
    'vigencia': {'x': 363.8, 'y': 589.7, 'largura': 57, 'altura': 11.4},
}


def y_schema(c):
    y1 = c[3]
    y_alvo = H - y1
    if y_alvo > 120:
        return round(y_alvo + 2.3, 2)
    return round(y_alvo - 6.69, 2)


def main():
    with open(JSON_PATH, encoding='utf-8') as f:
        schema = json.load(f)
    caminhos = {k: v for k, v in CAIXAS.items() if '.' in k or k.startswith('assinatura')}
    ajustados, nao_encontrados = [], []

    def aplica(no, path):
        if not isinstance(no, dict):
            return
        if 'coordenadas' in no and isinstance(no['coordenadas'], dict):
            if path in caminhos:
                c = caminhos[path]
                no['coordenadas']['x'] = round(c[0] + 1, 2)
                no['coordenadas']['y'] = y_schema(c)
                no['coordenadas']['largura'] = round(c[2] - c[0] - 2, 2)
                no['coordenadas']['altura'] = round(c[3] - c[1], 2)
                no['_fonte_caixa'] = 'PDF_com_caixa'
                ajustados.append(path)
            return
        for k, v in no.items():
            if isinstance(v, dict):
                aplica(v, path + '.' + k if path else k)
            elif isinstance(v, list):
                for i, item in enumerate(v):
                    aplica(item, f'{path}.{i}' if path else str(i))

    aplica(schema['campos'], '')
    for p in caminhos:
        if p not in ajustados:
            nao_encontrados.append(p)

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(schema, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(f'Ajustados: {len(ajustados)}/{len(caminhos)}')
    if nao_encontrados:
        print('NAO ENCONTRADOS:')
        for p in nao_encontrados:
            print('  -', p)
    for p in ajustados:
        print('  ok:', p)


if __name__ == '__main__':
    main()
