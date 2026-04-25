# Manutenção — Formulários de admissão (HTML + PDF)

Documento de referência para quem alterar modelos oficiais, coordenadas, cidades, integrações e deploy. A aplicação é **estática** (sem backend): HTML, JavaScript e [pdf-lib](https://github.com/Hopding/pdf-lib) preenchem os PDFs no navegador.

---

## 1. Visão geral da arquitetura

| Peça | Função |
|------|--------|
| `index.html` | Página inicial; links para a Ficha Cadastral e a Assistência Médica. |
| `ficha_cadastral.html` | Formulário F-075 (PR-011) — um **único** template PDF. |
| `assistencia_medica.html` | Formulário F-089 (PR-090) — **vários** templates PDF, escolhidos **por cidade** (ver §6). |
| `*_campos.json` | Coordenadas e metadados dos campos no PDF (pontos, tamanho da fonte implícita no código). |
| Arquivos `FICHA *.pdf` / `F-075_*.pdf` | Modelos oficiais; o código **não** altera o arquivo no disco, apenas desenha por cima na exportação. |
| `vercel.json` | Redireciona `/` → `index.html` na Vercel. |

Não existe banco de dados nem servidor de formulário: o usuário gera o PDF no próprio navegador. Após **gerar o PDF** com sucesso, o fluxo de **LGPD** apaga o preenchimento e o rascunho no `localStorage` (ver §8).

---

## 2. Estrutura de arquivos (raiz)

| Arquivo / pasta | O que é |
|------------------|---------|
| `index.html` | Home. |
| `ficha_cadastral.html` | Fluxo ficha cadastral. |
| `assistencia_medica.html` | Fluxo assistência médica. |
| `ficha_cadastral_campos.json` | Schema + coordenadas do template da ficha. |
| `assistencia_medica_campos.json` | Schema + coordenadas (um layout comum; o template muda o **arquivo** PDF, não este JSON, salvo ajuste manual). |
| `cidades_brasil.json` | **Apenas assistência:** lista de cidades com `FICHA A UTILIZAR` (mapeia para qual PDF). |
| `F-075_37 (PR-011) Ficha Cadastral para Admissão.pdf` | Template da ficha (nome referenciado no HTML). |
| `FICHA GOIANIA.pdf`, `FICHA GNDI.pdf`, `FICHA REEMBOLSO.pdf`, `FICHA FSA.pdf`, `FICHA SA_FO.pdf`, `FICHA BH.pdf` | Templates da assistência (nomes exatos usados no código). |
| `municipios_cidades_ficha_por_uf.json` | **Legado** — já **não** é usado pelo `assistencia_medica.html` (a lista de municípios vem da API; ver §6.1). Pode manter-se no repositório sem efeito no site. |
| `coordenadasficha.txt`, `coordenadasassmedica.txt` | Notas de leitura de coordenadas (página, x, y, largura, altura) — **referência humana** para alinhar com o JSON; não são carregados pela aplicação. |
| `scripts/gerar-municipios-cidades-ficha-por-uf.mjs`, `scripts/merge-municipios-cidades-uf.mjs` | Geram/merge do JSON de municípios; **obsoletos** para o fluxo atual (§9). |
| `vercel.json` | Configuração de deploy. |

Quando o número do processo (ex. F-075, PR-011, revisão 37) mudar no **documento PDF oficial**, atualize o **cabeçalho visível** no HTML (subtítulo) e, se for o caso, o nome do arquivo do template e a constante `TEMPLATE_PATH` na ficha.

---

## 3. Sistema de coordenadas no PDF (pdf-lib)

- **Origem:** canto **inferior esquerdo** da página, como no pdf-lib.
- Em `*_campos.json`, cada retângulo de texto costuma ter: `x`, `y`, `largura`, `altura` (pontos PDF; página A4 comum ≈ 595×842 pt).
- Ao mudar o **PDF oficial** (novo desenho), re-medir os campos e **atualizar o JSON** correspondente. O arquivo `.txt` de coordenadas serve de apoio à medição, mantendo a mesma convenção (`width`/`height` nos `.txt` = `largura`/`altura` no JSON).

Estrutura geral do JSON:

- `documento` — metadados (id, título, versão).
- `campos` — secções (ex. `dados_pessoais`, `endereco`) com objetos aninhados; `coordenadas` em cada campo ou opção.
- **Assistência:** inclui `tipo_adesao` (grupos de checkboxes com várias `opcoes`) e `dependentes` (cônjuge + filhos com slots).

Se adicionar um **campo novo** no formulário web, tem de existir **entrada correspondente** no JSON e o código em `gerarPDF()` (ou equivalente) tem de o **ler e desenhar** — o JSON sozinho não cria o campo no PDF.

---

## 4. Ficha cadastral — onde atualizar o quê

| O quê | Onde |
|-------|------|
| Caminho do template PDF | `ficha_cadastral.html` — constante `TEMPLATE_PATH` (caminho relativo `./F-075_...pdf`). Se renomear o arquivo, altere aqui. |
| Coordenadas / novos rótulos no PDF | `ficha_cadastral_campos.json`. Ajuste `documento.versao` se fizer sentido. |
| Textos, máscaras, opções (estado civil, etc.) | HTML (campos) + JSON (coordenadas). |
| CEP: ViaCEP; fallback | ViaCEP primeiro; se falhar, [Brasil API CEP](https://brasilapi.com.br/) (`/api/cep/v1/{cep}`). |
| Cópia de dados para Assistência Médica | `localStorage` com chave partilhada (§8.1) — o fluxo copia `cidadeuf` e outros campos; ver funções de “copiar para assistência” no HTML. |
| Rascunho | `RASCUNHO_STORAGE_KEY` em `ficha_cadastral.html` (§8.2). |
| Nome do arquivo baixado | Lógica em `gerarPDF()` (prefixo do nome, nome do usuário, versão vazia). |
| Evidência / IP (se aplicável) | Padrão semelhante à assistência em partes do fluxo; rever `fetch` a `api.ipify.org` e texto no PDF. |

Template único: **não** há seleção por cidade; só um `F-075_...pdf`.

---

## 5. Assistência médica — fluxo e dependências

1. O usuário escolhe o **estado (UF)** e a **cidade** (select `#cidade`).
2. A lista de cidades do estado vem da **API pública** (ver §6.1); o select mostra **apenas** cidades presentes em `cidades_brasil.json` (filtrado no cliente).
3. O PDF a usar é resolvido por `resolverArquivoPdfPorCidadeNome(nome)` a partir de `cidades_brasil.json` e do mapa `FICHA_UTILIZAR_PARA_ARQUIVO` em `assistencia_medica.html`.
4. O `gerarPDF()` carrega os **bytes** do template correto, desenha campos, assinatura (canvas → PNG), bloco de **evidência** (ID do documento, data/hora, fuso, IP), e inicia o download do arquivo `F-089 (PR-090) Adesão Assistência Médica - {nome}.pdf` (nomes conforme o código).
5. **“Não optante”** omite a secção de dependentes (cônjuge/filhos) no desenho do PDF, conforme lógica no `gerarPDF()`.

Onde o código toca o schema:

- `carregarCamposSchema()` busca `assistencia_medica_campos.json`.
- `gerarPDF()` chama `escreverTextoCampoCoord`, `preencherDataSegmentada`, `marcarRadioJsonOpcao`, `marcarCheckboxCoord`, `desenharPngAjustadoNoCampo`, etc.

---

## 6. Cidades, `cidades_brasil.json` e arquivos PDF (assistência)

### 6.1 API de municípios (lista por UF)

- **URL base:** `https://api.kstrtech.com.br/cidades/{UF}` (ex.: `.../SP`).
- **Resposta:** array JSON de **strings** com o nome oficial do município.
- **CORS:** a API expõe `Access-Control-Allow-Origin: *` (pode ser chamada do browser).
- Constante no código: `CIDADES_KSTR_API_BASE` em `assistencia_medica.html`.

A lista completa devolvida é **filtrada** para o usuário: só entram cujo nome, após `normalizarChaveCidade()`, existe no mapa carregado a partir de `cidades_brasil.json`.

### 6.2 Arquivo `cidades_brasil.json`

Cada registo costuma ter:

- `REGIONAL` — agrupamento comercial (referência; não usado no filtro técnico principal).
- `CIDADE` — nome da cidade (o código normaliza: maiúsculas, sem acentos, espaços unificados).
- `FICHA A UTILIZAR` — chave lógica, por exemplo: `FICHA GOIANIA`, `FICHA GNDI`, `FICHA REEMBOLSO`, `FICHA FSA`, `FICHA SAFO`, `FICHA BH`.

Há **correção** no código para typo `FICHA REEBOLSO` → `FICHA REEMBOLSO`.

### 6.3 Mapa tipo de ficha → arquivo PDF

Em `assistencia_medica.html`, o objeto `FICHA_UTILIZAR_PARA_ARQUIVO` associa o valor de `FICHA A UTILIZAR` ao arquivo na raiz, por exemplo:

- `FICHA GNDI` → `FICHA GNDI.pdf`
- `FICHA SAFO` → `FICHA SA_FO.pdf` (o nome do arquivo no disco difere ligeiramente do texto lógico)

**Para adicionar um tipo de ficha completamente novo:**

1. Incluir o PDF no repositório.
2. Adicionar a entrada em `FICHA_UTILIZAR_PARA_ARQUIVO`.
3. Preencher `FICHA A UTILIZAR` em `cidades_brasil.json` com a **mesma** chave (após o `.trim().toUpperCase()` equivalente usado no código, para tipos multi-palavra use o mesmo padrão que as entradas existentes).

**Para adicionar uma cidade coberta por uma ficha existente:** basta **uma nova linha** no array de `cidades_brasil.json` com `CIDADE` = nome alinhado ao retornado pela API (o `normalizarChaveCidade` alinha com variações de acentuação/maiúsculas).

**Se a cidade não aparecer no select** para um estado, mas existir no JSON, verificar se a **string** da `CIDADE` após normalização coincide com a da API (diferenças como “D’” vs `D` podem exigir ajuste no JSON).

### 6.4 CEP (assistência)

- Apenas [ViaCEP](https://viacep.com.br/) (`/ws/{cep}/json/`). Preenche rua, bairro e tenta alinhar o select de cidade com `tentarSincronizarSelectCidadeComTexto`.

### 6.5 Download do modelo em branco

- Exige UF + cidade com ficha mapeada; o arquivo baixado replica o **nome** do template resolvido (ex. `FICHA GNDI.pdf`).

---

## 7. Chaves e políticas no navegador

### 7.1 Cópia ficha → assistência (partilhada)

- `cross_copy_ficha_para_assistencia_v1` — payload JSON escrito na ficha e lido na assistência ao abrir (não persistir indefinidamente: o fluxo costuma removê-la após consumir).

### 7.2 Rascunhos (versão no nome da chave)

| Página | Chave `localStorage` |
|--------|------------------------|
| Ficha | `ficha_cadastral_rascunho_v2` |
| Assistência | `assistencia_medica_rascunho_v4` |

Se alterar a **estrutura** do objeto guardado (novos campos obrigatórios no rascunho), considere **incrementar a versão** (ex. `v3`, `v5`) para evitar rascunhos incompatíveis; atualize a constante no arquivo HTML correspondente e documente a mudança.

### 7.3 Outras chaves (ficha)

- `ficha_cadastral_nao_perguntar_copia_assistencia` — o usuário optou por não ser questionado sobre ir para a assistência com dados copiados.

### 7.4 LGPD

- Antes de exportar, modal de confirmação. Após sucesso, limpeza de formulário e rascunho, conforme implementação em `gerarPDF()` / equivalente na ficha.

---

## 8. APIs e serviços externos (resumo)

| Serviço | Uso |
|---------|-----|
| `api.kstrtech.com.br/cidades/{UF}` | Lista de municípios (assistência). |
| `viacep.com.br` | CEP (ambos os fluxos na assistência; ficha com ViaCEP + fallback). |
| `brasilapi.com.br/api/cep/v1` | Fallback de CEP na ficha, se ViaCEP falhar. |
| `api.ipify.org` | IP público (evidência no rodapé / texto de assinatura — conforme o HTML). |
| `unpkg.com/pdf-lib` | Biblioteca de PDF (script em CDN). |

Monitorize falhas de rede (CORS, 504): o código mostra toasts; a API de cidades kstr **declara** CORS aberto, ao contrário de tentativas antigas (IBGE/Brasil API no fluxo de municípios) documentadas comentário no HTML.

---

## 9. Scripts Node na pasta `scripts/`

- `gerar-municipios-cidades-ficha-por-uf.mjs` / `merge-municipios-cidades-uf.mjs` — serviam o antigo arquivo `municipios_cidades_ficha_por_uf.json`. O site **já não depende** dele para a lista de cidades.
- Só executar de novo se quiserem **dados off-line** ou relatórios; não é requisito de deploy.

---

## 10. Deploy (Vercel)

- Arquivo `vercel.json`: `cleanUrls` e rewrite de `/` para `index.html`.
- Projeto: **estático**; faça `git push` e ligue o repositório na Vercel.
- Todos os caminhos a recursos (JSON, PDF) devem existir no **repositório** (ou URLs absolutas estáticas).

---

## 11. Checklist rápido

### Nova **cidade** na assistência (ficha PDF já existente)

1. Confirmar o nome exato com a API: `https://api.kstrtech.com.br/cidades/{UF}`.
2. Adicionar em `cidades_brasil.json` com `FICHA A UTILIZAR` igual a um dos tipos já mapeados em `FICHA_UTILIZAR_PARA_ARQUIVO`.
3. Testar no browser: UF → cidade no select → pré-visualização/gerar PDF.

### Novo **tipo** de ficha (novo PDF)

1. Adicionar o `.pdf` na raiz.
2. Incluir em `FICHA_UTILIZAR_PARA_ARQUIVO`.
3. Atualizar as linhas em `cidades_brasil.json` com o novo `FICHA A UTILIZAR`.
4. Se o **layout** do form não for o mesmo, rever **todas** as coordenadas em `assistencia_medica_campos.json` (e o `gerarPDF()` se houver campos novos).

### **Revisão** do PDF oficial (governo/NotreDame)

1. Substituir o arquivo PDF.
2. Re-medir coordenadas (use os `.txt` de apoio e atualize o JSON).
3. Atualizar subtítulo/código de processo no HTML visível.
4. Teste completo de impressão/geração e leitura em leitor PDF.

---

## 12. Referência cruzada

- O `README.md` na raiz resume arquivos e publicação; este documento aprofunda **manutenção e pontos de extensão**.

Para o **código** exato (constantes, nomes de funções, filtros de cidade), a fonte de verdade é:

- `assistencia_medica.html` — `garantirMapaCidadesBrasil`, `normalizarChaveCidade`, `FICHA_UTILIZAR_PARA_ARQUIVO`, `buscarMunicipiosPorUf`, `carregarMunicipiosIBGE`, `gerarPDF`.
- `ficha_cadastral.html` — `TEMPLATE_PATH`, carregamento de `ficha_cadastral_campos.json`, `gerarPDF` e CEP.

---

*Última atualização: alinhada ao uso da API kstr para municípios e ao fluxo de `cidades_brasil.json` descrito no repositório.*
