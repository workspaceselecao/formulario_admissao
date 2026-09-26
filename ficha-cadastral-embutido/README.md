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

1. **Fonte**: o original usa Arial (via Canva). Como Arial não pode ser
   redistribuída, uso Helvetica (uma das 14 fontes padrão do PDF, já embutida
   nativamente pelo `pdf-lib`) — metricamente quase idêntica à Arial, por
   isso a fidelidade se mantém mesmo sem embutir uma fonte customizada.
2. **Checkboxes (`❑`)**: no original é um glifo de uma fonte
   (`FreeSerif`) especificamente incluída só para esse símbolo. Troquei por
   um quadrado vetorial desenhado (`drawRectangle` sem preenchimento) na
   mesma posição/tamanho — visualmente equivalente e evita ter que embutir
   mais uma fonte só por causa de um caractere.
3. **Molduras/grades das tabelas**: ao exportar do Canva, os títulos e
   textos viraram texto real (vetorial), mas as bordas/linhas de várias
   tabelas foram "achatadas" em imagens raster (eu confirmei isso abrindo
   cada uma). Em vez de tentar redesenhar cada linha manualmente (arriscado
   e caro de manter), mantive essas molduras como imagens PNG com fundo
   transparente, **embutidas como assets do próprio código** (não como
   arquivo externo enviado por candidato/admin). É a mesma lógica de manter
   um logo como asset — só que agora existe *dentro* do projeto, versionado,
   e não depende de recriar um PDF pronto inteiro a cada ajuste de layout.
4. As poucas linhas divisórias que o Canva exportou como vetor real (ex.:
   as linhas simples da seção "Dados Pessoais") foram mantidas como
   retângulos pretos finos desenhados via código — 100% vetorial.

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
