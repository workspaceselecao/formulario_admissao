# Manutenção — Formulários de admissão (HTML + PDF)

Documento de referência para quem alterar modelos oficiais, coordenadas, cidades, integrações e deploy. A aplicação é **estática** (sem backend): HTML, JavaScript e [pdf-lib](https://github.com/Hopding/pdf-lib) preenchem os PDFs no navegador.

---

## 1. Visão geral da arquitetura

| Peça | Função |
|------|--------|
| `index.html` | Página inicial; links para a Ficha Cadastral e a Assistência Médica. |
| `ficha_cadastral.html` | Formulário F-075 (PR-011) — um **único** template PDF. |
| `assistencia_medica.html` | Formulário F-089 (PR-090) — **Plano de Benefícios** (`DECLARACAO PLANO DE SAUDE.pdf`, só assinatura, pág. 2) ou **Outros Planos** (ficha regional por cidade; ver §6). |
| `*_campos.json` | Coordenadas e metadados dos campos no PDF (pontos, tamanho da fonte implícita no código). |
| Arquivos `FICHA *.pdf` / `F-075_*.pdf` | Modelos oficiais; o código **não** altera o arquivo no disco, apenas desenha por cima na exportação. |
| `vercel.json` | Redireciona `/` → `index.html` na Vercel. |

Não existe banco de dados nem servidor de formulário: o usuário gera o PDF no próprio navegador. Após gerar o PDF com sucesso, preenchimento e rascunho no `localStorage` **permanecem** no dispositivo até o uso de **Descartar rascunho** no menu ou limpeza manual do armazenamento do navegador (ver §7 e §8).

---

## 2. Estrutura de arquivos (raiz)

| Arquivo / pasta | O que é |
|------------------|---------|
| `index.html` | Home. |
| `ficha_cadastral.html` | Fluxo ficha cadastral. |
| `assistencia_medica.html` | Fluxo assistência médica. |
| `ficha_cadastral_campos.json` | Schema + coordenadas do template da ficha. |
| `assistencia_medica_campos.json` | Schema + coordenadas (um layout comum; o template muda o **arquivo** PDF, não este JSON, salvo ajuste manual). |
| `cidades_brasil.json` | Legado/referência regional (não seleciona mais o PDF da assistência). |
| `F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf` | Template da ficha (nome referenciado no HTML). |
| `DECLARACAO PLANO DE SAUDE.pdf` | Declaração — fluxo **Plano de Benefícios** (assinatura na página 2). |
| `declaracao_plano_saude_campos.json` | Coordenadas da declaração (fluxo Plano de Benefícios). |
| `FICHA GOIANIA.pdf`, `FICHA GNDI.pdf`, `FICHA REEMBOLSO.pdf`, `FICHA FSA.pdf`, `FICHA SA_FO.pdf`, `FICHA BH.pdf` | Fichas regionais — fluxo **Outros Planos** (`cidades_brasil.json`). |
| `Carta Abertura de Conra Salario.pdf` | Download opcional na ficha (conta salário Bradesco). |
| `municipios_cidades_ficha_por_uf.json` | **Legado** — já **não** é usado pelo `assistencia_medica.html` (a lista de municípios vem da API; ver §6.1). Pode manter-se no repositório sem efeito no site. |
| `coordenadasficha.txt`, `coordenadasassmedica.txt` | Notas de leitura de coordenadas (página, x, y, largura, altura) — **referência humana** para alinhar com o JSON; não são carregados pela aplicação. |
| `scripts/gerar-municipios-cidades-ficha-por-uf.mjs`, `scripts/merge-municipios-cidades-uf.mjs` | Geram/merge do JSON de municípios; **obsoletos** para o fluxo atual (§9). |
| `vercel.json` | Configuração de deploy. |

Quando o número do processo (ex. F-075, PR-011, revisão 37) mudar no **documento PDF oficial**, atualize o **cabeçalho visível** no HTML (subtítulo) e, se for o caso, o nome do arquivo do template e a constante `TEMPLATE_PATH` na ficha.

---

## 3. Sistema de coordenadas no PDF (pdf-lib)

- **Origem:** canto **inferior esquerdo** da página, como no pdf-lib (`y` cresce para cima).
- Em `ficha_cadastral_campos.json` e `coordenadasficha.txt`, use **os mesmos valores** medidos na ferramenta (ficha F-075 ≈ 596×842 pt). Ex.: nome no topo do formulário tem `y` alto (≈ 687); assinatura no rodapé tem `y` baixo (≈ 21–67). **Não converter** `y` com `altura_pagina - y` — isso inverte o formulário e embaralha os campos.
- Ao mudar o **PDF oficial**, re-medir, atualizar o `.txt` e copiar `x`/`y`/`width`/`height` para o JSON (`largura`/`altura`).
- **Evidência técnica da assinatura** (hash/doc, data/hora, IP): em `ficha_cadastral.html` e `assistencia_medica.html`, `caixaRodapeEvidenciaPdf()` carimba o texto no **rodapé** da página (fluxo Outros Planos: página 1; Plano de Benefícios: página 2 da declaração). No JSON, `assinatura.evidencia.coordenadas` define só margens (`x`, `y` inferior, `largura`).

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

1. O usuário escolhe **Plano de Benefícios** ou **Outros Planos** (`tipoPlano` no início do formulário).
2. **Plano de Benefícios:** apenas a secção **Assinatura**; PDF `DECLARACAO PLANO DE SAUDE.pdf` (coordenadas em `declaracao_plano_saude_campos.json`, página 2).
3. **Outros Planos:** formulário completo; UF + cidade (API kstr, filtrado por `cidades_brasil.json`); PDF regional via `FICHA_UTILIZAR_PARA_ARQUIVO`.
4. O `gerarPDF()` ramifica conforme `ehPlanoBeneficios()` / `ehOutrosPlanos()`.
5. **“Não optante”** omite a secção de dependentes (cônjuge/filhos) no desenho do PDF, conforme lógica no `gerarPDF()`.

Onde o código toca o schema:

- `carregarCamposSchema()` busca `assistencia_medica_campos.json`.
- `gerarPDF()` chama `escreverTextoCampoCoord`, `preencherDataSegmentada`, `marcarRadioJsonOpcao`, `marcarCheckboxCoord`, `desenharPngAjustadoNoCampo`, etc.

---

## 6. Cidades e template PDF (assistência)

### 6.1 API de municípios (lista por UF)

- **URL base:** `https://api.kstrtech.com.br/cidades/{UF}` (ex.: `.../SP`).
- **Resposta:** array JSON de **strings** com o nome oficial do município.
- **CORS:** a API expõe `Access-Control-Allow-Origin: *` (pode ser chamada do browser).
- Constante no código: `CIDADES_KSTR_API_BASE` em `assistencia_medica.html`.

A lista completa devolvida pela API é apresentada no select `#cidade` (ordenada por nome).

### 6.2 Template PDF único

- Arquivo: `DECLARACAO PLANO DE SAUDE.pdf` na raiz do repositório.
- Constante: `TEMPLATE_ASSISTENCIA_PDF` em `assistencia_medica.html`.
- Funções: `carregarTemplateAssistencia()` / `carregarTemplateParaCidadeSelecionada()`.

**Para trocar o modelo oficial:** substituir o PDF na raiz (mantendo o nome ou atualizando a constante) e rever as coordenadas em `assistencia_medica_campos.json`.

### 6.3 Arquivo `cidades_brasil.json` (legado)

Mantido no repositório apenas como referência regional/histórica; **não** é mais carregado pelo fluxo da assistência médica.

### 6.4 CEP (assistência)

- Apenas [ViaCEP](https://viacep.com.br/) (`/ws/{cep}/json/`). Preenche rua, bairro e tenta alinhar o select de cidade com `tentarSincronizarSelectCidadeComTexto`.

### 6.5 Download do modelo em branco

- Disponível sem exigir UF/cidade; baixa `DECLARACAO_PLANO_DE_SAUDE.pdf` (cópia de `DECLARACAO PLANO DE SAUDE.pdf`).

---

## 7. Chaves e políticas no navegador

### 7.1 Cópia ficha → assistência (partilhada)

- `cross_copy_ficha_para_assistencia_v1` — payload JSON escrito na ficha e lido na assistência ao abrir (campos, dependentes, `assinaturaCanvasPng`, `naoAssinarManualmente`, nome/data); removido após consumir.

### 7.2 Rascunhos (versão no nome da chave)

| Página | Chave `localStorage` |
|--------|------------------------|
| Ficha | `ficha_cadastral_rascunho_v2` |
| Assistência | `assistencia_medica_rascunho_v4` |

Se alterar a **estrutura** do objeto guardado (novos campos obrigatórios no rascunho), considere **incrementar a versão** (ex. `v3`, `v5`) para evitar rascunhos incompatíveis; atualize a constante no arquivo HTML correspondente e documente a mudança.

### 7.3 Outras chaves (ficha)

- `ficha_cadastral_nao_perguntar_copia_assistencia` — o usuário optou por não ser questionado sobre ir para a assistência com dados copiados.

### 7.4 LGPD

- Antes de exportar, modal de confirmação (LGPD). Após PDF gerado com sucesso, **`gerarPDF()`** grava o estado atual no rascunho (`salvarRascunhoLocalSincrono()`); formulário não é zerado automaticamente — limpeza explícita em **Descartar rascunho**.

### 7.5 Documentos em `/Docs` (revisão jurídica)

- Texto padrão no rodapé dos HTML em `/Docs`: revisão validada com Jurídico e Privacidade; **Última validação em** lida de `Docs/docs-revision.json` (data/hora e commit do último push).
- Após alterar política, termos ou base legal, executar: `node scripts/atualizar-docs-revision.mjs` e commitar o JSON atualizado junto com os HTML.

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

### Nova **cidade** na assistência

Qualquer município retornado pela API já aparece no select; não é necessário alterar `cidades_brasil.json`. Testar: UF → cidade → gerar PDF com `DECLARACAO PLANO DE SAUDE.pdf`.

### Novo **template** da assistência (substituir PDF único)

1. Substituir `DECLARACAO PLANO DE SAUDE.pdf` na raiz (ou atualizar `TEMPLATE_ASSISTENCIA_PDF` em `assistencia_medica.html`).
2. Rever **todas** as coordenadas em `assistencia_medica_campos.json` (e o `gerarPDF()` se houver campos novos).

### **Revisão** do PDF oficial (governo/NotreDame)

1. Substituir o arquivo PDF.
2. Re-medir coordenadas (use os `.txt` de apoio e atualize o JSON).
3. Atualizar subtítulo/código de processo no HTML visível.
4. Teste completo de impressão/geração e leitura em leitor PDF.

---

## 12. Referência cruzada

- O `README.md` na raiz resume arquivos e publicação; este documento aprofunda **manutenção e pontos de extensão**.

Para o **código** exato (constantes, nomes de funções, filtros de cidade), a fonte de verdade é:

- `assistencia_medica.html` — `TEMPLATE_ASSISTENCIA_PDF`, `carregarTemplateAssistencia`, `buscarMunicipiosPorUf`, `carregarMunicipiosIBGE`, `gerarPDF`.
- `ficha_cadastral.html` — `TEMPLATE_PATH`, carregamento de `ficha_cadastral_campos.json`, `gerarPDF` e CEP.

---

*Última atualização: assistência com template único `DECLARACAO PLANO DE SAUDE.pdf` e municípios via API kstr.*
