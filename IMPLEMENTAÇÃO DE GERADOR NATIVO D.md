# IMPLEMENTAÇÃO DE GERADOR NATIVO DE PDFs PADRONIZADOS

## Contexto do projeto

A aplicação **Formulários de Admissão** atualmente trabalha com arquivos PDF externos/prontos, utilizados como templates oficiais.

O funcionamento atual depende de arquivos PDF fornecidos externamente e, em determinados documentos, de coordenadas previamente definidas para posicionar os dados sobre o PDF.

Essa abordagem funciona, mas cria uma limitação estrutural:

- qualquer alteração visual no documento exige um novo PDF;
- alterações de textos fixos exigem substituição do arquivo;
- inclusão ou remoção de elementos exige novo template;
- alterações de layout exigem novas coordenadas;
- a manutenção dos documentos depende de arquivos externos;
- pequenas mudanças tornam necessário reconstruir e redistribuir o PDF inteiro.

## Objetivo

Implementar na própria aplicação um **Sistema Nativo de Geração de PDFs Padronizados**, capaz de recriar os documentos atualmente utilizados pela aplicação **sem depender do PDF original como arquivo externo**.

A aplicação deverá gerar o PDF diretamente a partir de uma definição estruturada do documento.

O resultado final deverá reproduzir o documento oficial original com máxima fidelidade visual e geométrica, incluindo:

- textos;
- fontes;
- tamanhos de fonte;
- pesos;
- alinhamentos;
- espaçamentos;
- tabelas;
- linhas;
- bordas;
- caixas;
- retângulos;
- círculos;
- formas geométricas;
- imagens;
- logotipos;
- ícones;
- assinaturas gráficas;
- cabeçalhos;
- rodapés;
- campos;
- elementos decorativos;
- margens;
- dimensões;
- proporções;
- posicionamentos;
- páginas;
- orientação;
- escala.

A geração deverá produzir um PDF real e independente.

Depois de gerado, o documento não poderá depender do template original.

---

# 1. PRINCÍPIO FUNDAMENTAL

Não implementar esse recurso simplesmente como uma nova camada de texto sobre um PDF externo.

O objetivo é:

> RECRIAR O DOCUMENTO.

O PDF original deverá ser utilizado apenas como **referência de engenharia/reprodução**, e não como dependência obrigatória em tempo de execução.

A aplicação deverá possuir uma representação própria do documento.

Exemplo conceitual:

```text
DOCUMENTO
 ├── propriedades da página
 ├── metadados
 ├── fontes
 ├── imagens
 ├── textos
 ├── linhas
 ├── retângulos
 ├── círculos
 ├── tabelas
 ├── campos dinâmicos
 └── elementos gráficos
```

Cada elemento deverá possuir suas próprias propriedades geométricas e visuais.

---

# 2. PRESERVAÇÃO DA APLICAÇÃO EXISTENTE

Antes de implementar qualquer alteração:

1. analisar integralmente o projeto atual;
2. identificar todos os PDFs atualmente utilizados;
3. identificar todas as coordenadas existentes;
4. identificar todos os campos dinâmicos;
5. identificar regras de preenchimento;
6. identificar associações entre documentos;
7. identificar regras relacionadas às cidades;
8. identificar configurações administrativas;
9. identificar chaves utilizadas no `localStorage`;
10. identificar o fluxo atual de geração;
11. identificar todos os pontos onde os PDFs externos são carregados.

NÃO remover funcionalidades existentes.

NÃO substituir imediatamente o mecanismo atual.

O novo sistema deverá ser implementado inicialmente como uma arquitetura paralela e compatível com a existente.

---

# 3. ARQUITETURA HÍBRIDA DURANTE A MIGRAÇÃO

Criar dois modos de geração:

```text
PDF_MODE = "external"
PDF_MODE = "native"
```

### External

Mantém exatamente o comportamento atual.

Utiliza os PDFs externos existentes.

### Native

Utiliza o novo mecanismo de geração.

Isso permitirá testar cada documento individualmente antes de abandonar o template externo.

Exemplo:

```javascript
const pdfGenerationMode = {
    fichaF075: "native",
    assistenciaMedica: "external",
    contaSalario: "external"
};
```

Posteriormente todos poderão migrar para:

```javascript
{
    fichaF075: "native",
    assistenciaMedica: "native",
    contaSalario: "native"
}
```

---

# 4. REPRESENTAÇÃO ESTRUTURADA DO DOCUMENTO

Criar um formato declarativo para representar cada PDF.

Exemplo conceitual:

```javascript
const documentDefinition = {
    id: "f075",
    name: "Ficha F-075",
    version: "1.0.0",

    page: {
        width: 595.28,
        height: 841.89,
        unit: "pt",
        orientation: "portrait"
    },

    background: null,

    elements: []
};
```

Utilizar **pontos PDF (pt)** como unidade interna padrão.

Não utilizar pixels como unidade principal.

---

# 5. SISTEMA DE COORDENADAS

O sistema deverá utilizar coordenadas determinísticas.

Adotar:

```text
X = distância horizontal a partir da esquerda
Y = distância vertical a partir do topo
```

Porém, internamente converter para o sistema de coordenadas utilizado pela biblioteca PDF.

Exemplo:

```javascript
function convertY(yTop, pageHeight, elementHeight) {
    return pageHeight - yTop - elementHeight;
}
```

A conversão deverá ocorrer em uma única camada.

Nenhum componente deverá fazer conversões manualmente.

---

# 6. DIMENSÕES EXATAS

A página deverá preservar suas dimensões reais.

Exemplo A4:

```javascript
{
    width: 595.28,
    height: 841.89
}
```

Não utilizar:

```text
800x1100
1024x768
100vw
100vh
```

para representar a página PDF.

A escala deverá ser física e determinística.

O documento deverá preservar:

- largura;
- altura;
- proporção;
- orientação;
- margens;
- sangrias, quando existentes;
- área útil.

---

# 7. ELEMENTOS DO DOCUMENTO

Criar um sistema de elementos.

Cada elemento deverá possuir, no mínimo:

```javascript
{
    id,
    type,
    x,
    y,
    width,
    height,
    rotation,
    opacity,
    visible,
    zIndex
}
```

Tipos mínimos:

```text
text
image
line
rectangle
circle
ellipse
table
checkbox
signature
field
group
```

---

# 8. TEXTO

O mecanismo de texto deverá permitir:

```javascript
{
    type: "text",
    content: "NOME DO DOCUMENTO",
    x: 100,
    y: 50,
    width: 300,
    height: 20,

    font: {
        family: "Arial",
        size: 10,
        weight: "bold",
        style: "normal"
    },

    color: "#000000",

    alignment: "left",

    lineHeight: 1.2,

    letterSpacing: 0,

    uppercase: false
}
```

Suportar:

- texto fixo;
- texto dinâmico;
- placeholders;
- alinhamento;
- quebra de linha;
- negrito;
- itálico;
- sublinhado;
- tamanho;
- cor;
- espaçamento;
- rotação;
- largura máxima;
- altura máxima.

---

# 9. CAMPOS DINÂMICOS

Separar claramente:

### Conteúdo

```text
{{NOME}}
{{CPF}}
{{DATA_NASCIMENTO}}
{{CIDADE}}
```

### Apresentação

```text
x
y
font
size
alignment
width
height
```

Isso permitirá alterar o conteúdo sem modificar a geometria.

Exemplo:

```javascript
{
    type: "field",
    id: "nome",
    binding: "candidato.nome",

    style: {
        x: 120,
        y: 245,
        width: 300,
        height: 18,
        fontFamily: "Arial",
        fontSize: 10
    }
}
```

---

# 10. LINHAS

Implementar linhas vetoriais reais.

Exemplo:

```javascript
{
    type: "line",
    x1: 50,
    y1: 100,
    x2: 545,
    y2: 100,

    stroke: "#000000",
    strokeWidth: 0.75,
    lineStyle: "solid"
}
```

Suportar:

- espessura;
- cor;
- linha contínua;
- tracejada;
- pontilhada;
- extremidades;
- orientação.

---

# 11. RETÂNGULOS E CAIXAS

Suportar:

```javascript
{
    type: "rectangle",
    x: 50,
    y: 200,
    width: 495,
    height: 80,

    fill: null,
    stroke: "#000000",
    strokeWidth: 0.5,

    radius: 0
}
```

Deve ser possível reproduzir:

- caixas de campos;
- tabelas;
- molduras;
- cabeçalhos;
- áreas destacadas;
- células.

---

# 12. FORMAS GEOMÉTRICAS

Implementar suporte a:

- círculo;
- elipse;
- retângulo;
- linha;
- polígonos simples.

Esses elementos deverão ser vetoriais.

Não transformar formas simples em imagens rasterizadas.

---

# 13. IMAGENS

O sistema deverá permitir incorporar imagens ao documento.

Exemplo:

```javascript
{
    type: "image",
    id: "logo-atento",

    source: "embedded",

    x: 40,
    y: 30,
    width: 120,
    height: 45,

    fit: "contain"
}
```

As imagens deverão poder ser:

- PNG;
- JPEG;
- SVG, caso suportado pela biblioteca.

Quando possível, utilizar SVG para logotipos e elementos vetoriais.

---

# 14. EMBEDDING DE ASSETS

Criar um sistema de assets internos.

Estrutura conceitual:

```text
/assets
    /documents
        f075
        assistencia
        conta-salario

    /images
        logo
        icons
        signatures
```

Porém, os assets necessários para geração deverão fazer parte da própria aplicação/build quando possível.

O sistema não deverá depender de um PDF externo para reconstruir o documento.

---

# 15. FONTES

Criar uma camada de gerenciamento de fontes.

A aplicação deverá:

1. identificar as fontes utilizadas nos documentos;
2. verificar disponibilidade;
3. incorporar fontes quando necessário;
4. garantir que a aparência não dependa da fonte instalada no computador do usuário.

Quando uma fonte específica não puder ser incorporada/licenciada, utilizar uma alternativa previamente definida e documentada.

Nunca deixar a geração depender implicitamente da fonte existente no sistema operacional.

---

# 16. TABELAS

Criar componente de tabela.

Exemplo:

```javascript
{
    type: "table",

    x: 50,
    y: 300,

    width: 495,

    rows: [...],

    columns: [...],

    borders: {
        top: true,
        right: true,
        bottom: true,
        left: true,
        innerHorizontal: true,
        innerVertical: true
    }
}
```

Permitir:

- largura de coluna;
- altura de linha;
- bordas;
- espessura;
- alinhamento;
- células mescladas;
- preenchimento;
- textos;
- campos dinâmicos.

---

# 17. CAMADA VISUAL DE EDIÇÃO

Criar dentro do `/admin` um novo módulo:

```text
Gerenciador de Documentos Nativos
```

Esse módulo deverá permitir visualizar o documento em um editor visual.

Interface conceitual:

```text
┌─────────────────────────────────────────────────────┐
│ Documento: F-075                       [Salvar]     │
├───────────────┬─────────────────────────────────────┤
│ ELEMENTOS     │                                     │
│               │          PREVIEW DO PDF             │
│ Texto         │                                     │
│ Campo         │                                     │
│ Linha         │                                     │
│ Retângulo     │                                     │
│ Imagem        │                                     │
│ Tabela        │                                     │
│               │                                     │
├───────────────┴─────────────────────────────────────┤
│ Propriedades do elemento selecionado                │
│ X | Y | W | H | Fonte | Tamanho | Cor | Alinhamento│
└─────────────────────────────────────────────────────┘
```

---

# 18. GRID E RÉGUAS

O editor deverá possuir:

- régua horizontal;
- régua vertical;
- grid;
- snap;
- coordenadas;
- zoom;
- centralização;
- movimentação precisa.

O zoom visual não poderá alterar a escala real do documento.

Exemplo:

```text
Zoom: 50%
Zoom: 75%
Zoom: 100%
Zoom: 150%
Zoom: 200%
```

O documento continuará representando exatamente suas dimensões físicas.

---

# 19. POSICIONAMENTO PRECISO

Permitir edição numérica:

```text
X: 124.50 pt
Y: 235.25 pt
W: 180.00 pt
H: 18.00 pt
```

Não depender exclusivamente do arraste com mouse.

O usuário deverá poder posicionar um elemento com precisão decimal.

---

# 20. SISTEMA DE CAMADAS

Implementar `zIndex`.

Exemplo:

```text
background
logo
moldura
tabela
texto
campo
assinatura
```

Permitir:

- trazer para frente;
- enviar para trás;
- subir camada;
- descer camada.

---

# 21. AGRUPAMENTO

Permitir agrupar elementos.

Exemplo:

```text
HEADER
 ├── logo
 ├── título
 ├── linha
 └── subtítulo
```

Mover o grupo deverá mover todos os elementos proporcionalmente.

---

# 22. COMPONENTES REUTILIZÁVEIS

Criar componentes reutilizáveis.

Exemplo:

```text
HeaderAtento
FooterAtento
CampoCPF
CampoNome
TabelaEndereco
BlocoAssinatura
```

Isso permitirá que diferentes documentos compartilhem componentes.

Uma alteração no componente poderá refletir nos documentos que o utilizam, desde que explicitamente configurado para isso.

---

# 23. SISTEMA DE TEMPLATES

Criar um formato JSON versionado.

Exemplo:

```json
{
    "schemaVersion": "1.0",
    "documentId": "f075",
    "documentVersion": "1.0.0",

    "page": {
        "width": 595.28,
        "height": 841.89
    },

    "elements": []
}
```

Nunca salvar uma definição sem versão.

---

# 24. VERSIONAMENTO

Cada documento deverá possuir:

```text
ID
Nome
Versão
Data de criação
Data de alteração
Autor
Status
```

Status:

```text
RASCUNHO
VALIDAÇÃO
PUBLICADO
ARQUIVADO
```

Somente documentos publicados poderão ser utilizados oficialmente na geração.

---

# 25. COMPARAÇÃO VISUAL

Criar ferramenta de comparação:

```text
PDF ORIGINAL
      ×
PDF NATIVO
```

Permitir:

- lado a lado;
- sobreposição;
- transparência;
- diferença visual.

Exemplo:

```text
Original: 50%
Nativo:   50%
```

ou:

```text
Original opacity: 50%
Native opacity:   50%
```

Isso permitirá identificar deslocamentos de poucos pontos.

---

# 26. CALIBRAÇÃO

Criar ferramenta de calibração.

O administrador poderá importar temporariamente o PDF original exclusivamente como referência.

A ferramenta deverá permitir:

1. selecionar um elemento;
2. visualizar sua posição;
3. informar X/Y/W/H;
4. testar;
5. comparar;
6. ajustar;
7. salvar a geometria no documento nativo.

O PDF original não deverá ser necessário para a geração final.

---

# 27. CONVERSÃO DO PDF ATUAL PARA MODELO NATIVO

Criar uma ferramenta:

```text
IMPORTAR PDF COMO REFERÊNCIA
```

Essa ferramenta deverá analisar o PDF quando tecnicamente possível.

Extrair:

- tamanho da página;
- textos;
- posições;
- fontes;
- linhas;
- retângulos;
- imagens;
- elementos gráficos.

Quando um elemento não puder ser identificado automaticamente, permitir reconstrução manual no editor.

IMPORTANTE:

Não assumir que qualquer PDF poderá ser convertido perfeitamente de maneira automática.

PDF é um formato de saída extremamente flexível. Um documento pode ter sido criado por várias técnicas diferentes.

Portanto, a aplicação deverá ter:

```text
AUTOMAÇÃO + CORREÇÃO MANUAL
```

e não depender exclusivamente de parsing automático.

---

# 28. RENDERIZAÇÃO

A biblioteca de geração deverá produzir PDF vetorial sempre que possível.

Priorizar:

- texto real;
- linhas vetoriais;
- formas vetoriais;
- imagens incorporadas.

Não transformar o documento inteiro em uma imagem.

A geração como imagem rasterizada deverá ser considerada apenas como último recurso para elementos que realmente não possam ser reproduzidos vetorialmente.

---

# 29. QUALIDADE DE IMPRESSÃO

O PDF final deverá ser apropriado para impressão.

Não utilizar resolução de tela como referência de qualidade.

Preservar:

- dimensões físicas;
- vetores;
- fontes incorporadas;
- imagens em resolução adequada;
- escala 1:1.

---

# 30. TESTES DE REGRESSÃO VISUAL

Criar mecanismo de validação.

Para cada documento:

```text
template original
        ↓
geração nativa
        ↓
renderização
        ↓
comparação
```

Criar tolerância configurável.

Exemplo conceitual:

```javascript
visualTolerance = 1.0;
```

O sistema deverá detectar:

- deslocamento;
- diferença de escala;
- ausência de elementos;
- diferença de dimensão;
- diferença de texto;
- diferença de cor;
- diferença de espessura.

---

# 31. VALIDAÇÃO DE DIMENSÕES

Antes de publicar um documento:

```javascript
assert(page.width === expectedWidth);
assert(page.height === expectedHeight);
```

Validar também:

- elementos fora da página;
- elementos parcialmente cortados;
- fontes inexistentes;
- imagens inexistentes;
- campos sem binding;
- IDs duplicados;
- elementos sem posição;
- elementos sem dimensão quando necessário.

---

# 32. PREVIEW

O editor deverá possuir:

```text
Preview visual
```

e também:

```text
Gerar PDF de teste
```

O preview deve representar o documento da maneira mais próxima possível da saída final.

Entretanto, a validação definitiva deverá ocorrer no PDF efetivamente gerado.

---

# 33. DADOS DINÂMICOS

O mecanismo nativo deverá continuar utilizando os mesmos dados atualmente utilizados pela aplicação.

Não duplicar a lógica de negócio.

Exemplo:

```text
Dados do candidato
        ↓
Modelo de dados atual
        ↓
Template nativo
        ↓
Renderer PDF
        ↓
PDF final
```

---

# 34. SEPARAÇÃO ENTRE DADOS E APRESENTAÇÃO

A arquitetura deverá seguir:

```text
DATA
 ↓
DOCUMENT DEFINITION
 ↓
LAYOUT ENGINE
 ↓
PDF RENDERER
 ↓
PDF
```

Nunca misturar:

```text
dados do candidato
+
coordenadas
+
regras de negócio
+
renderização
```

em um único arquivo.

---

# 35. COMPATIBILIDADE COM O SISTEMA ADMINISTRATIVO

O novo gerenciador deverá ser integrado ao painel administrativo existente.

Adicionar uma seção:

```text
Documentos
```

Subseções:

```text
Templates Nativos
Documentos Externos
Componentes
Assets
Fontes
Versões
Validação
Comparação
Logs
```

---

# 36. MIGRAÇÃO

Não migrar todos os documentos de uma vez.

Executar:

```text
1. Criar engine
2. Criar editor
3. Criar formato JSON
4. Migrar primeiro documento
5. Comparar com original
6. Corrigir diferenças
7. Publicar
8. Migrar segundo documento
9. Repetir
```

---

# 37. PRIMEIRO DOCUMENTO

Utilizar inicialmente o documento **F-075** como prova de conceito.

A migração deverá atingir fidelidade visual antes de migrar os demais.

Somente após validação do F-075:

```text
F-075
↓
Assistência Médica
↓
Conta Salário
↓
Demais documentos
```

---

# 38. BACKUP

Antes de qualquer alteração:

criar backup da configuração atual.

Preservar:

- PDFs;
- JSON;
- coordenadas;
- configurações;
- assets;
- regras;
- localStorage;
- arquivos administrativos.

Nunca realizar migração destrutiva.

---

# 39. EXPORTAÇÃO

Permitir exportar um documento nativo.

Formato:

```text
document-definition.json
```

Opcionalmente:

```text
document-package.zip
```

contendo:

```text
document.json
/assets
/fonts
/images
```

Isso permitirá backup e transferência do documento.

---

# 40. IMPORTAÇÃO

Permitir importar um pacote.

Antes da importação:

```text
VALIDAR
↓
MOSTRAR ALTERAÇÕES
↓
CONFIRMAR
↓
IMPORTAR
```

Não sobrescrever silenciosamente documentos existentes.

---

# 41. LOG DE ALTERAÇÕES

Registrar:

```text
documento
versão
usuário
data
alteração
```

Exemplo:

```text
F-075
v1.2.0
Administrador
24/09/2026 22:14
Alterado campo CPF
X: 420 → 425
```

---

# 42. INTEGRIDADE

Cada documento publicado deverá possuir um identificador de versão.

Opcionalmente:

```text
SHA-256
```

para garantir integridade da definição.

---

# 43. SEGURANÇA

Não permitir que dados arbitrários sejam executados como JavaScript através do JSON do documento.

O JSON deverá ser apenas declarativo.

Evitar:

```javascript
eval()
new Function()
```

ou qualquer mecanismo equivalente.

---

# 44. PERFORMANCE

A geração deverá ocorrer de maneira eficiente.

Evitar:

- reconstrução desnecessária de fontes;
- carregamento repetido de imagens;
- processamento redundante;
- criação excessiva de objetos.

Assets compartilhados deverão ser cacheados.

---

# 45. ARQUITETURA RECOMENDADA

Organizar o código aproximadamente assim:

```text
/src
    /pdf
        PdfEngine.js
        PdfRenderer.js
        CoordinateSystem.js
        FontManager.js
        AssetManager.js

    /documents
        DocumentDefinition.js
        DocumentRegistry.js
        DocumentValidator.js
        DocumentVersioning.js

    /elements
        TextElement.js
        FieldElement.js
        ImageElement.js
        LineElement.js
        RectangleElement.js
        TableElement.js
        GroupElement.js

    /editor
        DocumentEditor.js
        CanvasRenderer.js
        Ruler.js
        Grid.js
        Selection.js
        PropertiesPanel.js

    /comparison
        PdfComparator.js
        VisualDiff.js

    /admin
        NativeDocuments.js
        DocumentVersions.js
        DocumentValidation.js
```

Adaptar essa estrutura à arquitetura real existente. Não reorganizar o projeto inteiro desnecessariamente.

---

# 46. BIBLIOTECA PDF

Antes da implementação, analisar a biblioteca PDF já utilizada pelo projeto.

Caso `pdf-lib` seja suficiente, reutilizá-la.

Não adicionar uma segunda biblioteca PDF sem necessidade.

Caso alguma capacidade necessária não exista na biblioteca atual, documentar exatamente:

```text
REQUISITO
↓
LIMITAÇÃO DA BIBLIOTECA
↓
ALTERNATIVA
```

Antes de substituir a biblioteca principal.

---

# 47. REGRA DE OURO

O novo sistema NÃO deve tentar "imitar visualmente" o documento.

Ele deve representar matematicamente o documento.

Ou seja:

```text
Documento oficial
       ↓
Geometria
       ↓
Elementos
       ↓
Definição estruturada
       ↓
Renderer
       ↓
PDF
```

A fidelidade deverá ser tratada como requisito técnico, não como preferência estética.

---

# 48. CRITÉRIOS DE ACEITAÇÃO

A implementação somente será considerada concluída quando:

### Arquitetura

- o PDF puder ser gerado sem o arquivo original;
- a definição do documento estiver estruturada;
- os elementos forem independentes;
- os dados estiverem separados do layout.

### Fidelidade

O PDF nativo deverá preservar:

- tamanho;
- proporção;
- orientação;
- margens;
- textos;
- fontes;
- imagens;
- linhas;
- caixas;
- tabelas;
- formas;
- posicionamento;
- escala.

### Administração

O administrador deverá conseguir:

- editar elementos;
- mover elementos;
- redimensionar;
- editar propriedades;
- adicionar;
- remover;
- duplicar;
- agrupar;
- ordenar camadas;
- salvar;
- versionar;
- validar;
- publicar;
- arquivar.

### Geração

O sistema deverá:

- gerar PDF independente;
- preservar dimensões;
- incorporar recursos necessários;
- manter dados dinâmicos;
- funcionar sem o PDF original.

---

# 49. REGRA DE NÃO REGRESSÃO

Durante a implementação:

NÃO quebrar:

- geração atual;
- preenchimento;
- formulários;
- painel administrativo;
- autenticação;
- cidades;
- configurações;
- associações;
- armazenamento;
- coordenadas existentes.

Toda alteração deverá ser compatível com o funcionamento atual até que a migração seja oficialmente concluída.

---

# 50. ORDEM DE IMPLEMENTAÇÃO

Implementar rigorosamente nesta ordem:

```text
FASE 1
Análise da aplicação atual

FASE 2
Arquitetura do Document Definition

FASE 3
PDF Engine

FASE 4
Sistema de elementos

FASE 5
Renderer

FASE 6
Editor visual

FASE 7
Sistema de assets

FASE 8
Versionamento

FASE 9
Comparador visual

FASE 10
Migração do F-075

FASE 11
Validação do F-075

FASE 12
Migração dos demais documentos

FASE 13
Modo nativo como padrão

FASE 14
Descontinuação opcional dos PDFs externos
```

---

# 51. RESULTADO ESPERADO

Ao final, a aplicação deverá deixar de depender conceitualmente de:

```text
PDF oficial externo
+
coordenadas
```

e passar a trabalhar com:

```text
DOCUMENT DEFINITION
+
ASSETS
+
DADOS
+
PDF ENGINE
```

O administrador poderá alterar um texto fixo, mover uma linha, alterar uma caixa, trocar uma imagem ou modificar uma estrutura do documento sem precisar substituir o PDF inteiro.

O PDF continuará sendo o produto final.

Porém, o PDF passará a ser **resultado da aplicação**, e não mais sua dependência estrutural.

---

# 52. INSTRUÇÃO FINAL PARA A IA DE DESENVOLVIMENTO

Antes de modificar qualquer código:

1. analisar o repositório completo;
2. mapear a arquitetura atual;
3. identificar o fluxo de geração dos PDFs;
4. identificar todos os templates;
5. identificar todas as coordenadas;
6. identificar todos os campos;
7. identificar dependências;
8. identificar limitações da biblioteca PDF atual;
9. propor a arquitetura mínima necessária;
10. somente então implementar.

Não criar arquivos ou estruturas desnecessárias.

Não reescrever a aplicação inteira.

Não substituir funcionalidades existentes sem necessidade.

Não assumir dimensões, fontes ou coordenadas.

Quando uma informação não estiver disponível no código, marcar explicitamente como:

```text
REQUER CALIBRAÇÃO
```

Nunca inventar valores.

A implementação deverá priorizar:

**fidelidade geométrica > aparência aproximada.**

**compatibilidade > refatoração desnecessária.**

**determinismo > conveniência.**

**dados separados de apresentação.**

**PDF nativo independente do template externo.**