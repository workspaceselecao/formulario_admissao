# Documentos Nativos — gerador de PDF da própria aplicação

Guia do **Gerador Nativo de PDFs Padronizados** (seção **▣ Documentos Nativos** do
painel), implementado a partir de `IMPLEMENTAÇÃO DE GERADOR NATIVO D.md`.

> **Resumo em uma frase:** o documento oficial passa a ter **representação própria**
> (página + elementos em pontos), e o PDF vira **resultado** da aplicação — não mais
> uma dependência estrutural de um arquivo externo com coordenadas por cima.

---

## 1. Por que existe

O fluxo anterior funcionava, mas tinha um limite estrutural: qualquer mudança de
texto fixo, linha, caixa ou layout exigia substituir o PDF inteiro e re-medir
coordenadas. O gerador nativo mantém o mesmo PDF como produto final, porém a
**geometria** passa a ser dado do sistema (`native-docs.js`), separada dos dados do
candidato e das regras de negócio.

**Regra de ouro (§47):** o sistema não “imita visualmente” o documento — ele o
**representa matematicamente**. Fidelidade geométrica > aparência aproximada.

---

## 2. Onde vive o quê

| Peça | Papel |
|---|---|
| `native-docs.js` (raiz) | **Engine**: definição, validação, sistema de coordenadas, renderer pdf-lib, versionamento/hash, comparador, importação de referência e bootstrap a partir do schema. Não conhece DOM, formulário nem cidade. |
| `admin/index.html` → `#sec-documentos` | Seção do painel com as subseções: **Templates Nativos · Comparação · Importar PDF · Versões · Logs · Assets & Fontes**. |
| `admin/panel.js` → bloco “GERADOR NATIVO” | Camada administrativa: preview do PDF **real** gerado, edição (arraste + precisão numérica), versões, comparação, importação e integração com overlay/pendências/gate. |
| `admin/panel.css` | Caixas dos elementos (`.dn-el`), alça de redimensionamento e palco de comparação. |
| `overlay.docs_nativos` | `{ [documentId]: { meta, definicao, versoes, log } }` — chave **nova e opcional**; overlay antigo continua válido (migração aditiva). |

O engine é carregado **antes** do painel (`<script src="/native-docs.js">`) e fica em
`window.NativeDocs` — é o mesmo objeto que a aplicação pública poderá usar quando um
documento estiver em modo `native` (§51).

---

## 3. Modelo do documento

```jsonc
{
  "schemaVersion": "1.0",          // nunca salvar definição sem versão (§23)
  "documentId": "f075",
  "documentName": "Ficha Cadastral (F-075)",
  "documentVersion": "1.0.0",
  "page": {
    "width": 595.5, "height": 842.25, "unit": "pt", "orientation": "portrait",
    "esperado": { "width": 595.5, "height": 842.25 },   // dimensão MEDIDA do template (§31)
    "tolerancia": 1
  },
  "metadados": { "criadoEm": "…", "criadoPor": "…", "alteradoEm": "…",
                 "status": "RASCUNHO|VALIDACAO|PUBLICADO|ARQUIVADO",
                 "pendenteCalibracao": true },
  "assets": [ { "id": "logomarca", "tipo": "imagem", "arquivo": "logomarca.png" } ],
  "elementos": [ /* … */ ]
}
```

**Sistema de coordenadas (§5):** `x` = distância da esquerda, `y` = distância do
**topo**, unidade **pt**. A conversão para o espaço do pdf-lib (origem inferior
esquerda) acontece em **um único lugar** (`NativeDocs.converterY`), usado por todas
as camadas — nenhum outro ponto converte Y.

**Elementos (§7):** `text`, `field`, `line`, `rectangle`, `circle`, `ellipse`,
`image`, `table`, `checkbox`, `signature`, `group`. Todos aceitam `rotation`,
`opacity`, `visible`, `zIndex` e `page`. Destaques:

* `field` separa **conteúdo** (`binding`, resolvido dos dados) de **apresentação**
  (x/y/w/h, fonte, alinhamento) — §9;
* `table` tem colunas com largura, cabeçalho, bordas, células com `texto` ou `campo`;
* `group` permite mover vários elementos juntos (§21);
* `checkbox` desenha a moldura e marca “X” quando `marcado`/`binding` = sim/true.

**Ancoragem vertical (`ancoraV`)** — onde o texto “senta” na caixa:

| Valor | Uso |
|---|---|
| `campo` | **Perfil da aplicação** (padrão do bootstrap): baseline a `min(altura × 0,78; fonte × 1,12)` acima da base da caixa, mais `offsetY`. É o que reproduz o PDF atual. |
| `base` | Baseline exatamente no fundo da caixa (texto importado de referência). |
| `topo` / `meio` | Alinhamento geométrico simples. |

---

## 4. Como operar no painel

### 4.1 Criar o documento (prova de conceito: F-075)

1. **Documentos Nativos → Templates Nativos → ＋ Documento a partir do schema**;
2. escolha o schema (`ficha_cadastral_campos.json` ou `declaracao_plano_saude_campos.json`);
3. o painel **mede o template** (pdf.js) e converte cada campo do schema para o
   sistema do gerador, preservando a geometria: `y_topo = altura_página − y_pdf − altura`
   e o perfil de texto da aplicação gravado **no próprio elemento**;
4. o documento nasce `RASCUNHO`, modo `external` e marcado como
   **REQUER CALIBRAÇÃO** — porque o schema só descreve os campos dinâmicos.

### 4.2 Editar

* **Preview = o PDF de verdade**, gerado pela engine e renderizado com pdf.js. Não
  existe “imitação” no editor: o que aparece na tela é a saída final (§32).
* Clique no elemento (lista lateral ou caixa sobre o PDF) e ajuste **X · Y · Largura ·
  Altura** com precisão decimal, além de **fonte, tamanho, alinhamento, ancoragem,
  página, cor, rotação, conteúdo/binding, truncamento e “calibrado/confirmado”**.
* Arraste para mover (com **snap** de 1/5/10 pt) e use a alça do canto para redimensionar.
* **Zoom 50–200%** muda só a exibição — a escala real do documento continua em pt (§18).
* `＋ Adicionar elemento` cria elementos novos (texto, campo, linha, retângulo, elipse,
  tabela, imagem, assinatura, checkbox); `⊞ Agrupar seleção` (Ctrl/Cmd + clique)
  agrupa; `↑/↓ Camada` muda a ordem de desenho (§20).
* **Salvar alterações** grava no overlay (pendência administrativa) e registra o diff no
  log do documento. **Reverter** descarta o que ainda não foi salvo.

### 4.3 Reconstruir o mobiliário da referência (o que o schema não descreve)

O documento nativo do F-075 já nasce **fiel nos campos** (ver §6), mas o formulário
oficial também tem textos fixos, linhas, caixas e logotipo. Dois caminhos:

* **Importar PDF (referência)** — extrai página e blocos de texto com posição e
  tamanho (usa `pdf.js`); tudo entra como **REQUER CALIBRAÇÃO**, para você confirmar um
  a um. O relatório diz explicitamente o que **não** é identificado automaticamente
  (linhas, bordas, retângulos, imagens, assinaturas gráficas, tabelas) e oferece
  “Ajustar página às dimensões medidas” quando as dimensões divergem.
* **Reconstrução manual** no editor (linha/retângulo/imagem/tabela).

### 4.4 Comparar e medir a fidelidade

O comparador tem **duas medidas**, e as duas aparecem juntas:

* **visual** — diferença em pixels, deslocamento estimado e sobreposição (a tinta dos dois
  PDFs, o seu sobre o original);
* **geométrico** — item por item contra a referência congelada do documento
  (`scripts/referencia/…`, ou a última referência importada nesta sessão):
  `texto 102/102 · réguas 17/17 · imagens 9/9 · dx 0 pt, dy 0 pt (tolerância 1 pt)`. É o
  número que responde "reconstruí o mobiliário certo?" — independente de haver dados
  preenchidos na hora.

Aba **Comparação** renderiza o **template oficial** e o **PDF nativo** na mesma
escala e reporta:

* **diferença nas áreas impressas** (percentual de pontos com tinta divergentes) —
  o fundo branco não entra na conta, senão uma página vazia “pareceria” quase igual;
* **deslocamento estimado** (dx/dy em pt) — a translação que melhor alinha o desenho,
  buscada numa janela proporcional à tolerância, com desempate pelo menor
deslocamento (duas páginas idênticas devolvem `0,0`, não ruído);
* **tolerância** configurável em pt (`Configurações → Documentos`), padrão 1 pt.

Diferença alta no começo é **esperado** enquanto o formulário não estiver reconstruído.
`Abrir os dois PDFs` permite conferir visualmente fora do painel.

### 4.5 Versões, integridade e log

* **Congelar versão e publicar** grava: status escolhido, motivo, autor, data, número
  da versão (patch), nº de elementos e **hash SHA-256** da definição (§42). A versão
  guarda a **definição completa** (pacote restaurável, §39).
* Aba **Versões** lista tudo e permite **Restaurar** — a restauração cria uma versão
  nova; a trilha nunca é reescrita (§24/§41).
* Aba **Logs** mostra o log do documento (documento · versão · autor · data · alteração),
  no mesmo formato do exemplo do §41.
* **Exportar definição** gera `document-definition-<id>.json` (definição + meta +
  versões + log). **Importar definição** valida, mostra as alterações e só aplica
  depois da confirmação (§40) — nunca sobrescreve em silêncio.

### 4.6 Assets e fontes

* **Assets**: imagens do repositório (`logomarca.png`, `icone.png`,
  `carta_bradesco_logo.png`, `carta_bradesco_assinatura.png`, `carta_bradesco_carimbo.png`)
  são incorporadas por nome, com os bytes lidos em tempo de geração (cache por sessão).
  Nome com diretório/caminho relativo é rejeitado.
* **Fontes (§15)**: as **14 fontes padrão do PDF** (Helvetica, Times, Courier e
  variações) — não dependem da fonte instalada no computador do candidato. Família fora
  dessa lista **não é substituída em silêncio**: a validação acusa. Texto fora do WinAnsi
  (emoji, “✔”) é normalizado/removido — nunca quebra a geração.

### 4.7 Tipografia oficial por run (§15.1)

O PDF oficial **não diz** qual fonte o formulário usa: o pdf.js só reporta o subconjunto
embutido (`AAAAAA+Arial-BoldMT`). Quem declara é o **documento editável** (o `.docx`
que a área de formulários mantém), run a run: Arial, Arial Narrow, Wingdings, com
tamanho e negrito próprios.

```bash
# O .docx é da empresa (fonte licenciada) e NÃO entra no repositório; só o extrato:
node scripts/extrair-tipografia-f075.mjs "E:/Atento/FORMULARIOS/F-075_38 (PR-011) ….docx"
# → scripts/referencia/f075-tipografia.json  (artefato versionado)
```

O gerador do F-075 casa cada bloco medido no PDF com o parágrafo do documento e grava
`font`/`fonteOficial`/`tipografiaOficial` no elemento. Resultado no F-075:

| Declarado no documento | Blocos | Como o PDF reproduz |
|---|---|---|
| **Arial** | 72 | Helvetica — **equivalente métrico** (medido: 99,5% das larguras) |
| **Arial Narrow** | 9 (bloco do cabeçalho) | Helvetica — **NÃO equivalente** (medido: 18% mais estreita) |
| **Wingdings** | 17 runs (`q`/`o`) | as 17 caixas de marcação ❑ desenhadas como `checkbox` |

Nada disso é aplicado às cegas: o engine resolve a fonte na ordem **asset licenciado →
fonte padrão equivalente → Helvetica**, e **registra cada queda** em
`fontesSubstituidas` (devolvido por `renderizarPdf`) e em
`metadados.tipografiaOficial.substituicoes`. Para embutir a fonte de verdade, basta
entregá-la em `assets.fontes` (`{ "Arial Narrow": <bytes TTF|PDFFont já embutida> }`) —
nada mais muda.

**Por que o tamanho declarado NÃO sobrescreve o medido:** os dois divergem. O gerador
registra a divergência bloco a bloco (63 no F-075: o documento diz 8 pt onde o PDF
oficial ficou com 6,96 pt, e marca negrito onde o PDF saiu normal) e mantém como
autoridade a geometria/tamanho **medidos**, que são o que o comparador valida. Medido na
bancada: aplicar os tamanhos/negritos declarados **piora** a reprodução de tinta de
88,84% para 80,18% — ou seja, o PDF em circulação não é um desenho fiel do `.docx`, e
“consertar” isso mudaria o formulário que está em produção.

---

## 5. Modo híbrido: `external` × `native` (§3/§49)

Cada documento tem um **modo declarado** e um **modo efetivo**:

```
modoEfetivo = "native"  somente se  modo declarado = native
                              E     status = PUBLICADO
                              E     definição sem erro crítico
caso contrário             = "external"  (com o motivo)
```

Enquanto o modo efetivo for `external`, **nada muda para a aplicação pública**: ela
continua usando o template oficial. Essa é a garantia de não regressão (§49) e o que
permite migrar documento a documento (§36).

No gate de publicação do painel (seção **Validação** e pré-publicação):

* documento em `external`/`RASCUNHO` → **avisos** (não travam nada);
* documento declarado `native` **e** `PUBLICADO` com erro crítico → **bloqueia**.

---

## 6. Fidelidade já garantida (F-075)

O documento do F-075 tem **duas metades**, e as duas são medidas:

**a) campos dinâmicos** — o bootstrap do `ficha_cadastral_campos.json` produz 1 elemento
por campo com coordenadas (36 campos + assinatura) e, para **todos** eles, a mesma
posição do PDF atual:

* `x = coordenada.x + 0,5` (offset da aplicação);
* `baseline = y + min(altura × 0,78; 9 × 1,12) − (y > 120 ? 9 : 0)` no espaço do pdf-lib;
* largura útil `largura − 2`, truncamento com `...`.

Essas constantes **não foram inventadas**: estão em `PERFIL_APP` (engine) e a
auditoria as confere contra o **próprio `ficha_cadastral.html`**, falhando se o código
de geração atual mudar sem o perfil ser atualizado.

O mesmo bootstrap roda para a **declaração (F-089)**, com os campos na página 2.

**b) mobiliário do formulário oficial** — textos fixos, réguas, caixas, tarjas,
logotipos e faixas de tabela do F-075, reconstruídos da **geometria real** do PDF de
referência (não do schema, que não os descreve):

| Peça | Quantidade no F-075 | De onde vem |
|---|---|---|
| Textos fixos (rótulos, títulos, avisos) | 102 blocos | itens de texto do pdf.js, agrupados por linha |
| Caixas de marcação (❑) | 17 | glifo simbólico do PDF → elemento `checkbox` de verdade |
| Réguas e caixas | 17 (7 `line` + 10 `rectangle`) | caminhos (`re`, `moveTo/lineTo`) dos operadores de desenho |
| Imagens (logo, ONE, carimbo, faixas de tabela) | 9 | XObjects do PDF convertidos em PNG na raiz |

**Como isso foi feito (e por que é reproduzível):**

```bash
node scripts/gerar-nativo-f075.mjs          # regrava ficha_cadastral_nativo.json
node scripts/gerar-nativo-f075.mjs --conferir   # só confere (exit 1 se sair da tolerância)
```

1. `scripts/referencia/f075-pagina1.json` — **referência congelada**: a geometria do PDF
   oficial (textos com baseline/tamanho/família, réguas, caixas, imagens, e o que foi
   ignorado: recortes, máscaras transparentes). Gerada pelo **mesmo extrator que o painel
   usa** em *Documentos Nativos → Importar PDF (referência)* — logo, o painel e o build
   reconstroem a mesma coisa.
2. `scripts/gerar-nativo-f075.mjs` — monta a definição: campos do schema (perfil da
   aplicação) + mobiliário da referência, com as bandas de camada do mobiliário (10/20/30,
   incremento fracionário) **sempre abaixo** dos campos (100+).
3. `f075_nativo_01.png` … `f075_nativo_09.png` (raiz) — imagens recortadas da referência.
   São dados do repositório: a geração **não abre o PDF oficial**.
4. `ficha_cadastral_nativo.json` (raiz) — o documento versionado. O painel o carrega como
   **linha de base** (registro `origemRepo`) quando o overlay ainda não tem o documento;
   edições ficam no overlay e voltam pelo botão *Dados & Backups → ⬇
   ficha_cadastral_nativo.json*.
5. `scripts/referencia/f075-tipografia.json` — **tipografia declarada por run** (extraída
   do documento editável por `scripts/extrair-tipografia-f075.mjs`, ver §4.7). O gerador
   casa cada bloco medido com o parágrafo do documento e anota `fonteOficial` +
   `tipografiaOficial`; o que divergir fica em `metadados.tipografiaOficial.divergencias`.

**Medição de aceite (não é inspeção visual):**

```
Tipografia oficial: {"Arial Narrow":9,"Arial":72} · caixas Wingdings: 17
  substituição: "Arial Narrow" -> Helvetica (9 elemento(s))
  divergências documento x PDF: 63
Comparação com a referência: texto 102/102 · réguas 17/17 · imagens 9/9
  deslocamento máximo dx 0 pt, dy 0 pt (tolerância 1 pt) · 128 casados · 0 sem par
```

Medido por `NativeDocs.compararComReferencia` (§27.3): cada item da referência é casado
com o elemento equivalente e o deslocamento é medido em pontos (x da esquerda e baseline
contra baseline). Roda sem navegador, é o critério do Teste 18.10 e da auditoria, e cada
elemento importado guarda `desvioMedido`.

**Diferença visual residual (medida, não estimada):** comparando os dois PDFs em pixels
(escala 1,5×, limiar de tinta 200), **88,84% da tinta da referência é reproduzida** e
**98,07% dos pixels são equivalentes**, com deslocamento `0,0` px.

A causa **não** é largura de glifo — isso foi medido e está errado: Arial e Helvetica têm
as **mesmas** larguras de avanço (99,5% no F-075, medido com as métricas das fontes
reais). O que sobra é:

1. **glifos não embutidos** — nos blocos de texto a reprodução varia de 40% a 79%
   (“Atenção: A ausência da certidão…” 55%, “é fundamental…” 52%, “Conta Salário” 40%)
   enquanto o **volume** de tinta é praticamente igual ao da referência: mesmo traço, no
   lugar ligeiramente diferente, porque a referência usa o contorno Arial embutido e o
   gerador usa uma fonte padrão que o rasterizador substitui. É aqui que embutir a fonte
   licenciada (`assets.fontes`) rende;
2. **réguas finas** — as três réguas de 0,5 pt saem com 2 px de altura onde a referência
   tem 1 px (a de 1 pt sai com 2 px onde a referência tem 3 px).

Já corrigido por medição (com teste): os 10 retângulos do fundo **pintavam contorno
preto que não existe** (4.312 px de tinta inventada por página) — o pdf-lib emite `B`
(preenche e traça) quando `borderWidth` é passado, mesmo sem `borderColor`, e o traçado
assume a cor padrão do PDF. Agora saem como `f` (só preenchimento) quando o elemento não
declara `stroke`.

**O que este documento ainda NÃO reproduz** (declarado, nunca inventado): o carimbo de
"Documento Uso Interno" do cabeçalho já está na imagem do logotipo; o que fica de fora é
(1) tabela **vinculada a dados** (no F-075 as grades vieram do PDF como imagem — converter
em `table` é evolução, não requisito) e (2) a fonte licenciada (acima).

---

## 7. Editor “Nativo” × Editor Visual (coordenadas)

São **complementares**, não duplicados:

| | Editor Visual (`/admin` → Editor Visual) | Documentos Nativos |
|---|---|---|
| Fonte do desenho | PDF externo (pdf.js) | **definição nativa** (engine) |
| O que edita | coordenadas dos campos no JSON | geometria + textos/linhas/imagens/tabelas |
| Produz | `*_campos.json` (com o template) | PDF gerado pela aplicação |
| Status | Produção | Migração (§36), F-075 em validação |

Enquanto a migração não terminar, **o caminho de produção continua sendo o Editor
Visual** + **Dados → Exportar arquivos do repositório**.

---

## 8. Testes e auditoria

```bash
node scripts/run-test.mjs        # Teste 18 cobre o gerador (inclui 18.10: o F-075 reconstruído)
node scripts/audit-panel.mjs     # 13.* confere o gerador contra os dados REAIS
```

O **Teste 18** prova, entre outras coisas: bootstrap fiel campo a campo; Y convertido
numa única camada; PDF real, com as dimensões exatas, **determinístico** e independente
do template; nenhum dado inventado (sem dados, nada é desenhado); validação §31 (id
duplicado, dimensão divergente, elemento fora da página = aviso, binding ausente, fonte
não suportada, imagem sem dimensão, JSON com `eval`/`on*` barrado); versão patch +
SHA-256 + pacote restaurável + log; comparador detectando deslocamento/dimensão;
importação agrupando fragmentos e marcando REQUER CALIBRAÇÃO; camadas e agrupamento;
e a integração com o painel (pendência, gate que só bloqueia em `native` +
`PUBLICADO`, diff de importação e configurações).

O **18.10** é o teste de aceite da reconstrução: extrai mobiliário de uma lista de
operadores sintética (régua fina → `line`; retângulo grande → `rectangle`; `re` com
largura/altura — não um segundo ponto; recorte `W n` não desenha; `ca = 0` não desenha;
`setGState` chega em pares) e, sobre os **arquivos reais**, exige: nenhum item da
referência sem par, deslocamento máximo ≤ 1 pt, 1 elemento por item da referência, banda
de camadas do mobiliário abaixo dos campos, `desvioMedido` registrado, assets existindo na
raiz, e o gerador reproduzindo a definição (`--conferir`, exit 0).

A **auditoria** roda o mesmo pipeline em `node:vm` e confere contra os arquivos reais:
perfil do engine espelhando as constantes do `ficha_cadastral.html`, 1 elemento por
campo do schema, **mesma baseline e mesmo x** em todos os campos, PDF com as dimensões
exatas do template oficial e determinístico, a declaração (F-089) na página 2 e a
reconstrução do F-075 (referência de origem, cobertura total, tolerância, camadas e
assets).

---

## 9. Critérios de aceitação (§48) — o que está feito e o que falta

| Critério | Situação |
|---|---|
| PDF gerado sem o arquivo original | ✅ engine gera PDF independente (`renderizarPdf`) |
| Definição estruturada e versionada | ✅ `schemaVersion` + `documentVersion` + status |
| Elementos independentes e ordenáveis | ✅ tipos §7 + `zIndex` + grupos |
| Dados separados do layout | ✅ `binding` resolve dados; engine não conhece regra de negócio |
| Tamanho/proporção/orientação/margens | ✅ dimensão medida; validação contra o template |
| Textos/fontes/linhas/caixas/tabelas/imagens | ✅ tipos implementados no renderer |
| Posicionamento e escala determinísticos | ✅ tudo em pt; geração determinística |
| Administrar: editar/mover/redimensionar/adicionar/remover/duplicar/agrupar/camadas | ✅ no editor (arraste + precisão decimal) |
| Salvar/versionar/validar/publicar/arquivar | ✅ overlay + versões + status + gate |
| Comparação original × nativo | ✅ lado a lado + sobreposição + % e deslocamento + **deslocamento geométrico item por item contra a referência congelada** |
| Reconstrução do formulário oficial completo | ✅ F-075: textos, réguas, caixas, tarjas, caixas de marcação e imagens, com deslocamento medido ≤ 1 pt (resíduo = métrica de fonte licenciada) |
| Migração dos demais documentos | ⏳ próxima fase (F-075 → F-089 → Conta Salário) |
| Modo nativo como padrão da aplicação pública | ⏳ só após fidelidade validada no F-075 (§36/§37) |
| Descontinuação dos PDFs externos | ⏳ fase final opcional (§50, Fase 14) |

**Decisões registradas**

* **Biblioteca:** `pdf-lib` (já no projeto) é suficiente — sem segunda biblioteca (§46).
  Não há extração de vetores do PDF de origem (o pdf-lib não expõe parsing de conteúdo;
  o pdf.js é usado apenas para medir página e extrair texto, no navegador).
* **Rotação/letterSpacing:** suportados pelo renderer; rotação também exposta no
  editor. Réguas (§18) não foram implementadas — o zoom + coordenadas numéricas +
  grids de encaixe cobrem o posicionamento; se forem necessárias, entram como melhoria
  de UI sem impacto no formato.
* **Persistência:** o documento nativo vive no **overlay** (mesma regra do painel) e
  pode ser exportado/importado; `localStorage` continua proibido.
