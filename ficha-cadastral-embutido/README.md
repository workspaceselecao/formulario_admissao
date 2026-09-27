# Ficha Cadastral — geração 100% embarcada (prova de conceito)

Este pacote comprova que dá para recriar o PDF da Ficha Cadastral inteiramente
via `pdf-lib`, sem carregar nenhum arquivo pronto externo. Comparação lado a
lado (`compare_gen_top.png` vs `compare_orig_top.png`) mostra fidelidade
praticamente pixel a pixel com o original.

## Arquivos

- `extract_template.py` — script reutilizável. Lê **qualquer** um dos PDFs
  prontos da Atento e gera automaticamente `template.json` + `assets/*.png`.
  Não é preciso mapear coordenada nenhuma na mão.
- `template.json` — já gerado para a Ficha Cadastral: tamanho da página,
  imagens (logos + molduras/grades das tabelas), linhas/divisórias vetoriais,
  caixas brancas de acabamento, todo o texto estático (rótulos) com fonte e
  posição originais, e os checkboxes convertidos em quadrados vetoriais.
- `assets/` — as 9 imagens (logo Atento, selo ONE, carimbo "Uso Interno" e as
  molduras/grades de cada bloco de tabela), já extraídas com transparência.
- `generate.js` — gerador em `pdf-lib` (a mesma lib que o Atentoform já usa
  no navegador): monta o PDF do zero a partir do `template.json` + `assets/`,
  e desenha os dados do candidato por cima, nas coordenadas de campo.
- `output.pdf` — exemplo gerado.

## Decisões técnicas (documentadas para não se perderem)

1. **Fonte**: as TTF reais (Arial, Arial Bold, Arial Narrow, Arial Narrow Bold,
   copiadas de `C:\Windows\Fonts`) estão em `assets/*.ttf` e são declaradas no
   próprio `template.json`:

   ```json
   "fontes": {
     "Arial-Narrow": { "arquivo": "assets/ARIALN.ttf", "fallback": "Helvetica" }
   }
   ```

   `generate.js` (Node) e `embedded-docs.js` (navegador) leem essa mesma
   declaração — não existe mais mapa de fonte hardcoded em código. `fallback` é
   a fonte padrão do PDF usada quando o TTF não chega (asset ausente ou
   fontkit indisponível): a geração nunca quebra, só as métricas mudam e o
   relatório avisa (`relatorio.fontesFallback`, mostrado no painel). Embeddar
   TTF no pdf-lib exige `registerFontkit`: no painel o fontkit vem do CDN
   (`@pdf-lib/fontkit`), na POC é a dependência `@pdf-lib/fontkit`.
   **As TTF são fonte versionada** — se não forem commitadas, o deploy cai no
   fallback (a auditoria `audit-panel.mjs` acusa a ausência).
2. **Trechos longos**: os blocos do cabeçalho ("Ficha Cadastral…",
   "Importante: …", "Nome Completo: …") e o aviso "Atenção: …" são **trechos
   únicos** com `maxWidth`/`lineHeight`, não um fragmento por palavra. A
   extração crua do PDF entregava uma entrada por palavra (e com coordenadas
   tortas — a palavra "da" da primeira linha do "Atenção" vinha em `x = 330` no
   meio da linha); o texto agora é re-quebrado pela fonte real, o que conserta a
   posição e o corpo do texto de uma vez.
3. **Camadas de linha/caixa** (o que faz a tabela ter "linhas verticais e
   horizontais" como no original):
   - `blackBars` — divisórias. `width`/`height` são **comprimento e
     espessura** (a espessura é o menor dos dois: 297 × 0,48 = linha de
     0,48 pt). `cor` opcional (a "tabelinha" do cabeçalho é azul `#003366`) e
     `tracejado: [0.48, 0.48]` desenha linha pontilhada (`drawLine` +
     `dashArray`).
   - `whiteBoxes` — caixas de campo: fundo branco + `borda` (0,5 pt). São as
     linhas verticais/horizontais internas das tabelas; sem elas as colunas
     somem.
   - `checkboxes` — os quadradinhos de marcação, com a **geometria real**
     (`width`/`height` + `borda`) do retângulo que o Canva desenhou.
4. **Checkboxes (`❑`)**: o glifo `❑` do original é a MESMA marcação que o
   Canva já desenhou como retângulo — extraímos o retângulo (geometria exata,
   inclusive o preenchimento branco que apaga a grade atrás) e descartamos o
   glifo, para não desenhar dois quadradinhos.
5. **Molduras/grades das tabelas**: ao exportar do Canva, os títulos e
   textos viraram texto real (vetorial), mas as bordas/linhas de várias
   tabelas foram "achatadas" em imagens raster (eu confirmei isso abrindo
   cada uma). Em vez de tentar redesenhar cada linha manualmente (arriscado
   e caro de manter), mantive essas molduras como imagens PNG com fundo
   transparente, **embutidas como assets do próprio código** (não como
   arquivo externo enviado por candidato/admin). É a mesma lógica de manter
   um logo como asset — só que agora existe *dentro* do projeto, versionado,
   e não depende de recriar um PDF pronto inteiro a cada ajuste de layout.
6. As poucas linhas divisórias que o Canva exportou como vetor real (ex.:
   as linhas simples da seção "Dados Pessoais") foram mantidas como
   retângulos pretos finos desenhados via código — 100% vetorial.

## Fidelidade medida (diff de pixels contra o PDF oficial)

Referência: **F-075_38 (PR-011) Ficha Cadastral para Admissão.pdf** (150 dpi,
tolerância 200/255):

| Estado | página inteira |
|---|---|
| template da v37 | 15,2% |
| reextração do 38 (template + assets) | 2,30% |
| + letter-spacing (`espacamentoEntreGlifos`) nas linhas do bloco "Atenção" | 2,12% |
| + carimbo "Uso Interno" recortado do render oficial | 1,68% |
| + ancoragem caractere a caractere (`chars` no template) | 1,20% |
| + correção da altura da página na extração (841,92, não 842,25) | 0,47% |
| + moldura vetorial da tabelinha do cabeçalho + carimbo recalibrado | **0,48%** |

O resíduo é antialiasing de fonte (o original usa subsets do Canva com
contornos ligeiramente mais grossos que os TTF do Windows).

## Ancoragem caractere a caractere (`chars`)

O Canva grava o texto com kerning irregular (cada palavra e às vezes cada
glifo recebe posição própria). Nem letter-spacing uniforme (Tc) reproduz
isso: as linhas longas acumulavam deriva interna de até ~2 pt no meio da
linha. Entradas de `template.texts` com `"chars"` (lista de `{c, x}` extraída
do rawdict do PDF de referência) são desenhadas **caractere a caractere**,
cada uma na origem x exata do original. O `extract_template.py` já grava as
entradas nesse formato por padrão; as chaves legadas (`palavras`,
`espacamentoEntreGlifos`, `maxWidth`) continuam suportadas pelo `generate.js`.

ATENÇÃO: a conversão baseline-pdf → y-do-template deve usar a **altura real
da página** (`page.rect.height` = 841,92), e não um valor fixo (842,25 era o
erro que deslocava todos os textos em ~0,33 pt).

## Checkboxes por origem exata

Cada glifo `❑` do original é gravado no template com `x`, `base` (baseline
PDF) e `size` extraídos do rawdict — sem heurística de posicionamento. A
Wingdings do Windows não cobre U+2751, então usamos Segoe UI Symbol
(`assets/seguisym.ttf`), cujo glifo é idêntico. Sem a fonte, cai no quadrado
vetorial.

## Letter-spacing (`espacamentoEntreGlifos`)

O Canva gravou o texto com letter-spacing que o TTF puro não reproduz: sem
compensação, as linhas longas terminam de 1,5 pt a 17 pt antes do original.
Entradas de `template.texts` com `"espacamentoEntreGlifos": <pt>` são
desenhadas com o operador **Tc** (`setCharacterSpacing`, via
`page.pushOperators`), o que fecha a largura de cada linha. Os valores
calibrados para o 38 estão no próprio `template.json`.

## Carimbo "Uso Interno" rotacionado

No PDF oficial o carimbo é gravado com uma **matriz de transformação rotacionada**
(−30°) — o `extract_template.py` extrai o PNG bruto, que sai girado. Em vez de
tentar recompor a rotação via `drawImage(rotate)`, o asset usado
(`assets/img1.png`) é um **recorte renderizado do próprio PDF oficial**
(região do bbox, 300 dpi), convertido para RGBA com alpha derivado da
cor de fundo — captura exatamente o visual final, rotação incluída. Para
imagens futuras com rotação, `generate.js` também aceita `"rotacao": <graus>`
no `template.images` (gira em torno do centro do bbox).

## Sem dados de exemplo no output.pdf

O `output.pdf` gerado pela execução direta sai **em branco** (igual ao PDF
oficial, que não tem preenchimento) — os dados do candidato entram via
`generateFichaCadastral(dados)` quando chamado pelo painel.

## Bug corrigido: texto "flutuando" alto demais dentro das linhas

Na primeira versão, o texto era posicionado com `y = alturaPagina - bottom`,
onde `bottom` vem da caixa delimitadora que o `pdfplumber` calcula a partir do
ascent/descent **declarado pela fonte**. Fontes incorporadas como subset
(caso desta aqui, exportada pelo Canva) às vezes declaram esses valores de
forma inconsistente, e o texto acabava desenhado alguns pontos acima de onde
deveria — quase imperceptível em textos soltos, mas bem visível em linhas
estreitas (ex.: a tabela de Vale Transporte, onde "ÔNIBUS" aparecia colado na
linha de cima em vez de centralizado na célula).

A correção: cada caractere de um PDF carrega, na própria matriz de
renderização (`char["matrix"][5]"`), a posição real da linha de base — o
mesmo valor que qualquer leitor de PDF usa para desenhar o glifo. Passei a
usar esse valor diretamente em vez de reconstruí-lo a partir de
ascent/descent. Resultado: de 9,2% para 3,8% de pixels divergentes num
diff automático contra o PDF original (o que sobrou é só antialiasing de
fonte, não deslocamento). `extract_template.py` já está atualizado com o
fix — vale para qualquer um dos 4 documentos.

## Bug corrigido (2): linhas "quebradas/tortas" em Possui Deficiência, Banco/Bradesco, Santander e Vale Alimentação

Causa real: no PDF original, várias linhas de divisão fazem parte de um **par
preto+branco quase idêntico** — um retângulo preto (alto, 12-16pt) coberto
por um retângulo branco praticamente do mesmo tamanho logo em cima, cujo
efeito líquido é *nada visível* (a linha de verdade, fina, já está desenhada
dentro da própria imagem de fundo). Eu tinha extraído os dois lados do par
como elementos independentes (`blackBars` + `whiteBoxes`) e desenhado
ambos separadamente. Qualquer imprecisão de arredondamento entre as duas
extrações deixava uma fresta preta visível na borda — exatamente o efeito
de "linha torta/quebrada" relatado.

Correção: `extract_template.py` agora descarta esse par inteiro na extração
(filtro `if h > 3: continue` — uma divisória real tem no máximo ~1.5pt de
altura; qualquer coisa mais alta que isso é sempre um desses pares de
acabamento, nunca uma linha de verdade). A imagem de fundo já contém a
linha certa e contínua, então ela simplesmente aparece sozinha, sem
nenhuma sobreposição. `generate.js` não desenha mais a etapa de "caixas
brancas" — ela deixou de ser necessária.

## Bug corrigido (3): dados de exemplo fora da linha (nome/telefone/e-mail)

Depois do fix da linha de base (bug 1), os rótulos se moveram alguns pontos
para baixo — mas as três coordenadas de exemplo no `generate.js` (nome,
telefone, e-mail) tinham sido calibradas visualmente ANTES desse fix e
ficaram desatualizadas: o telefone e o e-mail apareciam numa linha acima
do rótulo certo, e o nome ficava colado no rótulo "Nome Completo:".
Corrigido usando a mesma linha de base real dos rótulos vizinhos (os
valores `y` de `template.texts`), então as três posições de exemplo agora
acompanham automaticamente qualquer reextração futura do layout.

## Como usar para os outros 3 documentos

Envie os PDFs prontos (Assistência Médica, Carta Bradesco, Termos de Aceite)
e eu rodo o mesmo `extract_template.py` em cada um — ele já generaliza tudo
que fiz manualmente aqui. O resultado é um `template.json` + `assets/` por
documento, prontos para o mesmo `generate.js` (só trocando o arquivo de
template carregado).

## Próximo passo sugerido no Atentoform

- O módulo **Coordenadas** do admin passa a editar o `template.json` (campos
  dinâmicos) em vez de apontar coordenadas para um PDF externo.
- O módulo **PDFs** deixa de guardar um arquivo pronto e passa a guardar
  `template.json` + `assets/*.png` por documento — tudo dentro do próprio
  banco/config da aplicação, sem upload de arquivo `.pdf` a cada revisão.
- `generate.js` vira uma função única `generatePdf(templateId, dadosDoCandidato)`
  reaproveitada pelos 4 documentos.
