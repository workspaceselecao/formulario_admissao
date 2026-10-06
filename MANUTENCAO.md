# Manutenção — Formulários de admissão (HTML + PDF)

Documento de referência para quem alterar modelos oficiais, coordenadas, cidades, integrações e deploy. A aplicação é **estática** (sem backend): HTML, JavaScript e [pdf-lib](https://github.com/Hopding/pdf-lib) preenchem os PDFs no navegador.

---

## 1. Visão geral da arquitetura

| Peça | Função |
|------|--------|
| `index.html` | Página inicial; links para a Ficha Cadastral e a Assistência Médica. |
| `ficha_cadastral.html` | Formulário F-075 (PR-011) — gera o PDF pela **engine embarcada** (`EmbeddedDocs.gerarPdf`), o mesmo caminho do painel. |
| `assistencia_medica.html` | Formulário F-089 (PR-090) — **Plano de Benefícios** (`DECLARACAO PLANO DE SAUDE.pdf`, só assinatura, pág. 2) ou **Outros Planos** (ficha regional por cidade; ver §6). |
| `*_campos.json` | Coordenadas e metadados dos campos no PDF (pontos, tamanho da fonte implícita no código). |
| Arquivos `FICHA *.pdf` / `F-075_*.pdf` | Modelos oficiais; o código **não** altera o arquivo no disco, apenas desenha por cima na exportação. |
| `vercel.json` | Redireciona `/` → `index.html` na Vercel. |

Não existe banco de dados nem servidor de formulário: o usuário gera o PDF no próprio navegador. Após gerar o PDF com sucesso, preenchimento e rascunho no `localStorage` **permanecem** no dispositivo até o uso de **Descartar rascunho** no menu ou limpeza manual do armazenamento do navegador (ver §7 e §8). Além disso, por segurança o rascunho é **descartado automaticamente 1 hora após o último salvamento** (`rascunho-ttl.js`): na primeira vez que existe um rascunho sem decisão registrada, um modal pergunta se o usuário prefere **manter o rascunho** ou permitir o descarte automático (ver §7.2).

---

## 2. Estrutura de arquivos (raiz)

| Arquivo / pasta | O que é |
|------------------|---------|
| `index.html` | Home. |
| `ficha_cadastral.html` | Fluxo ficha cadastral. |
| `assistencia_medica.html` | Fluxo assistência médica. |
| `ficha_cadastral_campos.json` | Schema + coordenadas do template da ficha. |
| `assistencia_medica_campos.json` | Schema + coordenadas (um layout comum; o template muda o **arquivo** PDF, não este JSON, salvo ajuste manual). |
| `cidades_brasil.json` | Base de cidades do fluxo **Outros Planos** (REGIONAL/CIDADE/FICHA A UTILIZAR — **sem** UF). Lida pela aplicação pública e pelo painel. |
| `cidades_infinity.json` | Mesmas cidades com a coluna **UF**; usada pelo fluxo Outros Planos → variante Infinity e para o painel exibir/validar UF. |
| `F-075_38 (PR-011) Ficha Cadastral para Admissão.pdf` | Template da ficha (documento canônico v38; nome referenciado no HTML e no painel). |
| `F-075_38 (PR-011) Ficha Cadastral para Admissão_com caixa.pdf` | Mesmo v38 com as 65 caixas de preenchimento desenhadas por cima — fonte das coordenadas de `ficha_cadastral_campos.json`. |
| `F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf` | Versão anterior (v37), mantida no repositório como histórico. **Não** é mais o template. |
| `DECLARACAO PLANO DE SAUDE.pdf` | Declaração — fluxo **Plano de Benefícios** (assinatura na página 2). |
| `declaracao_plano_saude_campos.json` | Coordenadas da declaração (fluxo Plano de Benefícios). |
| `embedded-docs.js` | **Gerador EMBARCADO de PDFs** (engine): template declarativo (`template.json` + assets PNG extraídos do documento oficial) + campos do schema de coordenadas → PDF montado pela própria aplicação via pdf-lib — **nenhum PDF externo é carregado nem enviado**. Validação estrutural, renderer determinístico (datas congeladas) e perfil de texto idêntico ao app público. Usado pelo painel (seção **Documentos Embarcados**) e pelo `ficha_cadastral.html` (geração unificada). |
| `ficha-cadastral-embutido/` | **Prova de conceito e template do F-075**: `extract_template.py` (extrai `template.json` + `assets/*.png` de qualquer PDF oficial — generaliza para os 4 documentos), `template.json` (página, 3 imagens, 161 barras pretas, 89 textos estáticos, 17 marcações) e `generate.js` (gerador standalone Node). **`template.json` e `assets/*.png` são fonte versionada** (o painel os busca via HTTP no deploy estático); só `output.pdf` é artefato, ignorado pelo `.gitignore`. |
| `FICHA GOIANIA.pdf`, `FICHA GNDI.pdf`, `FICHA REEMBOLSO.pdf`, `FICHA FSA.pdf`, `FICHA SA_FO.pdf`, `FICHA BH.pdf` | Fichas regionais — fluxo **Outros Planos** (`cidades_brasil.json`). |
| `rascunho-ttl.js` | **Descarte automático de rascunhos (LGPD)**: TTL de 1 h após o último salvamento + modal “manter rascunho / descartar após 1 hora”. Compartilhado pelas 4 páginas públicas; chaves e política em §7.2. |
| `vercel.json` | Configuração de deploy. |

Quando o número do processo (ex. F-075, PR-011, revisão 38) mudar no **documento PDF oficial**, re-extraia o template embarcado (`python ficha-cadastral-embutido/extract_template.py "F-075_... .pdf" ficha-cadastral-embutido/`) e confira a fidelidade (`node scripts/gerar-ficha-vazia.js` + `python scripts/fidelidade-ficha.py ...`). O cabeçalho visível no HTML (subtítulo) acompanha o documento oficial.

> **Nomenclatura das fichas regionais:** a **chave** usada em `cidades_brasil.json`, `cidades_infinity.json` e no valor de `FICHA A UTILIZAR` é `FICHA SAFO` (sem underscore), enquanto o **arquivo físico** se chama `FICHA SA_FO.pdf`. As duas pontas precisam de chave idêntica (`FICHA_UTILIZAR_PARA_ARQUIVO` em `assistencia_medica.html` e em `admin/panel.js`). Se divergirem, a ficha não é encontrada e a cidade fica sem template. A suíte (`scripts/run-test.mjs`, teste 14.6b) trava essa sincronia contra os dados reais.

---

## 3. Sistema de coordenadas no PDF (pdf-lib)

- **Origem:** canto **inferior esquerdo** da página, como no pdf-lib (`y` cresce para cima).
- Em `ficha_cadastral_campos.json`, use **os mesmos valores** medidos na ferramenta (ficha F-075 ≈ 596×842 pt). Ex.: nome no topo do formulário tem `y` alto (≈ 687); assinatura no rodapé tem `y` baixo (≈ 21–67). **Não converter** `y` com `altura_pagina - y` — isso inverte o formulário e embaralha os campos.
- Ao mudar o **PDF oficial**, re-medir e copiar `x`/`y`/`width`/`height` para o JSON (`largura`/`altura`).
- **Evidência técnica da assinatura** (hash/doc, data/hora, IP): em `ficha_cadastral.html` e `assistencia_medica.html`, `caixaRodapeEvidenciaPdf()` carimba o texto no **rodapé** da página (fluxo Outros Planos: página 1; Plano de Benefícios: página 2 da declaração). No JSON, `assinatura.evidencia.coordenadas` define só margens (`x`, `y` inferior, `largura`).

Estrutura geral do JSON:

- `documento` — metadados (id, título, versão).
- `campos` — secções (ex. `dados_pessoais`, `endereco`) com objetos aninhados; `coordenadas` em cada campo ou opção.
- **Assistência:** inclui `tipo_adesao` (grupos de checkboxes com várias `opcoes`) e `dependentes` (cônjuge + filhos com slots).

Se adicionar um **campo novo** no formulário web, tem de existir **entrada correspondente** no JSON e o código em `gerarPDF()` (ou equivalente) tem de o **ler e desenhar** — o JSON sozinho não cria o campo no PDF.

> **Gerador embarcado (`embedded-docs.js`)** desenha os textos estáticos e as camadas do formulário direto do template declarativo e escreve os dados nos campos do schema — as coordenadas dos `*_campos.json` são usadas EXATAMENTE como estão (origem no canto inferior esquerdo, igual ao pdf-lib; nada é re-medido). O perfil de texto da aplicação (fonte 9 pt, `x + 0,5`, baseline `y + min((altura − 0,72 × 9) / 2; altura × 0,78)` — a caixa alta do valor centralizada na caixa de preenchimento, sem faixa especial por Y) está em `EmbeddedDocs.PERFIL_APP`: é o ÚNICO caminho de geração, usado pelo painel **e pelo `ficha_cadastral.html`** — o app público carrega a engine (`<script src="./embedded-docs.js">`) e chama `EmbeddedDocs.gerarPdf` com o mapa flat de dados (`montarDadosFicha()`), conferido pela auditoria.

> **Fonte e quebra de linha no template.** `template.texts[].font` aceita uma fonte padrão do PDF **ou** um nome declarado em `template.fontes` (`{ "arquivo": "assets/X.ttf", "fallback": "Helvetica" }`). O TTF só é embutido se os bytes chegarem em `assets.fontes` **e** o fontkit estiver carregado (CDN `@pdf-lib/fontkit` no painel; sem ele a engine usa `fallback` e reporta em `relatorio.fontesFallback`). Trechos com `maxWidth` são re-quebrados pela fonte real com `lineHeight` (padrão `tamanho × 1,2`), descendo linha a linha a partir de `y`.

> **Linhas, caixas e a "tabelinha" do cabeçalho.** `blackBars` = divisórias, com `width`/`height` carregando **comprimento e espessura** (espessura = o menor dos dois), `cor` opcional (a moldura do cabeçalho é azul `#003366`) e `tracejado: [0.48, 0.48]` para linha pontilhada. `whiteBoxes` = caixas de campo (fundo branco + `borda`) — são elas que desenham as linhas verticais/horizontais internas das tabelas; sem elas as colunas somem. `checkboxes` = quadradinhos de marcação com a geometria real (`width`/`height` + `borda`). A auditoria (`scripts/audit-panel.mjs`) acusa a ausência de qualquer um desses grupos.

---

## 4. Ficha cadastral — onde atualizar o quê

| O quê | Onde |
|-------|------|
| Template embarcado (camadas do PDF) | `ficha-cadastral-embutido/template.json` + `assets/` — carregado pelo `ficha_cadastral.html` (`TEMPLATE_EMBARCADO_PATH`) e pelo painel. Re-extrair via `extract_template.py`. |
| Coordenadas / novos rótulos no PDF | `ficha_cadastral_campos.json`. Ajuste `documento.versao` se fizer sentido. |
| Textos, máscaras, opções (estado civil, etc.) | HTML (campos) + JSON (coordenadas). |
| Mapeamento dado → PDF | `ficha_cadastral.html` — `montarDadosFicha()` (paths flat do schema); regras de negócio (Next→Conta Corrente, colunas Santander, VT zerado) ficam aí. |
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
- `gerarPDF()` chama `EmbeddedDocs.gerarPdf` (engine embarcada) e depois aplica o que é exclusivo do app: rubrica manuscrita (`desenharPngAjustadoNoCampo`) e marca d'água de não optante do VT (`desenharMarcaDaguaNaoOptanteValeTransporte`).

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

| Página | Chave `localStorage` do rascunho | Chave da decisão TTL (`rascunho-ttl.js`) |
|--------|------------------------|--------|
| Ficha | `atento.forms:v1:ficha_cadastral_rascunho_v2` | `atento.forms:v1:rascunho_ttl_ficha_v1` |
| Assistência | `atento.forms:v1:assistencia_medica_rascunho_v5` | `atento.forms:v1:rascunho_ttl_assist_v1` |
| Carta Bradesco | `atento.forms:v1:carta_bradesco_rascunho_v1` | `atento.forms:v1:rascunho_ttl_carta_v1` |
| Termos de Aceite | `atento.forms:v1:termos_aceite_rascunho_v1` | `atento.forms:v1:rascunho_ttl_termos_v1` |

Se alterar a **estrutura** do objeto guardado (novos campos obrigatórios no rascunho), considere **incrementar a versão** (ex. `v3`, `v5`) para evitar rascunhos incompatíveis; atualize a constante no arquivo HTML correspondente e documente a mudança.

**Descarte automático (TTL 1 h — LGPD):** o módulo compartilhado `rascunho-ttl.js` guarda em `rascunho_ttl_<página>_v1` a decisão do usuário (`choice`: `auto` — padrão — ou `keep`), o horário do último salvamento (`savedAt`) e a assinatura do conteúdo (`sig`). Sem decisão explícita, o rascunho é apagado 1 hora após o último salvamento; no primeiro acesso com rascunho sem decisão, um modal pergunta **Manter rascunho** ou **Descartar após 1 hora** (fechar o modal — ESC ou clique no fundo — vale **Descartar após 1 hora**). Descartar manualmente pelo menu limpa a decisão e o ciclo recomeça no próximo rascunho. Se **incrementar a versão** da chave do rascunho de uma página, atualize também `draftKey` (e `legacyKeys`, se houver) no bloco `RascunhoTTL.init(...)` no fim do `<body>` da mesma página — a suíte trava essa sincronia (teste 18).

### 7.3 Outras chaves (ficha)

- `ficha_cadastral_nao_perguntar_copia_assistencia` — o usuário optou por não ser questionado sobre ir para a assistência com dados copiados.

### 7.4 LGPD

- Antes de exportar, modal de confirmação (LGPD). Após PDF gerado com sucesso, **`gerarPDF()`** grava o estado atual no rascunho (`salvarRascunhoLocalSincrono()`); formulário não é zerado automaticamente — limpeza explícita em **Descartar rascunho**. O rascunho não permanece indefinidamente: sem escolha do usuário vale o **descarte automático após 1 h** do último salvamento (`rascunho-ttl.js`, §7.2); quem preferir pode optar por **manter o rascunho** no modal de proteção de dados.

### 7.5 Documentos em `/Docs` (revisão jurídica)

- Texto padrão no rodapé dos HTML em `/Docs`: revisão validada com Jurídico e Privacidade; **Última validação em** lida de `Docs/docs-revision.json` (data/hora e commit do último push).
- `Docs/aviso-de-privacidade.html` (rota `/aviso-de-privacidade`) transcreve o **Aviso de Privacidade — Hub Formulários RH** (políticas corporativas PO-026_04, PO-027_04 e PO-029_05; DPO `dpo-br@atento.com.br`). Alteração relevante no funcionamento do Hub, nas categorias de dados, finalidades, integrações externas ou formas de armazenamento exige **reavaliar e atualizar o Aviso** (§ 13 do documento); a suíte trava o essencial dessa adequação (Teste 19).
- Após alterar política, termos ou base legal, executar: `node scripts/atualizar-docs-revision.mjs` e commitar o JSON atualizado junto com os HTML.
- Guia público de atualizações (RIPD): `node scripts/gerar-historico-versionamento.mjs` gera `Docs/historico-versionamento.md` (link em `ripd.html`).

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

- `test-server.mjs` — servidor local de desenvolvimento: serve o site e emula as rotas de acesso do `vercel.json` (`/f075`, `/f089`, `/bradesco`, `/termos`, `/admin`), além da API administrativa `/api/admin/*` (config com backup automático, uploads validados, histórico) gravando em `data/` (gitignored). Executar com `node scripts/test-server.mjs`.
- `run-test.mjs` — suíte de testes do projeto (o 14 cobre o painel v2, o 15/16 o painel v3/Field Builder e o 17 a auditoria de dados); executar com `node scripts/run-test.mjs`.
- `audit-panel.mjs` — auditoria do painel contra os dados reais do repositório: roda o pipeline do painel (`carregarTudo` + coletores + gate de publicação) em `node:vm` e falha em qualquer falso positivo ou configuração sem consumidor. Executar com `node scripts/audit-panel.mjs` (também roda no Teste 17).
- `atualizar-docs-revision.mjs` — atualiza `Docs/docs-revision.json` após alterar política, termos ou base legal (ver seção LGPD/Docs).
- `gerar-historico-versionamento.mjs` — regenera `Docs/historico-versionamento.md` (guia público de atualizações, RIPD).
- Não há script de build: o deploy é de site estático e não depende destes scripts.

## 9.1 Painel Administrativo

- Código em `admin/` (index.html, panel.js, panel.css, persistence.js) + `admin-guard.js` na raiz.
- Chaves/códigos reais **não são versionados**: vivem em `keys-testes.txt` (gitignored via `keys*.txt`, convenção do `keys.txt` usado pelos geradores de verificadores). A suíte (`scripts/run-test.mjs`) e o servidor de teste (`scripts/test-server.mjs`) leem dele; sem o arquivo, os testes dependentes de chave são marcados como skipped. Repositórios novos precisam criar o arquivo (10 linhas: 5 chaves de formulário + 5 códigos do painel).
- Acesso (autenticação **apartada**, dois fatores): qualquer e-mail com domínio **exatamente `@atento.com`** + **código exclusivo do painel** (5 códigos `ATN-…`, verificadores no corpus `CG` de `admin-guard.js`; pipeline idêntico ao `guard.js`). As chaves dos formulários (`guard.js`) são independentes e não autorizam o painel. Novos códigos via `scripts/generate-admin-verifiers.mjs` (não contém segredos, versionado).
- Modelo de dados: **overlay** sobre `ficha_cadastral_campos.json`, `declaracao_plano_saude_campos.json`, `cidades_brasil.json`/`cidades_infinity.json` — os JSONs do repositório permanecem a fonte primária e nunca são editados pelo painel.
- Formato do overlay (v3, compatível com v1/v2): `campos_ficha`, `campos_declaracao`, `cidades` (patch `{ ficha }` antigo ou patch completo `{ cidade, uf, regional, ficha }` novo, chaveado pela normalização do nome ORIGINAL), `cidades_novas` (`{ id, cidade, uf, regional, ficha }` com `id` estável), `pdfs_meta` (`{ arquivo: { tipo, formulario } }`) e as chaves novas da reestruturação: `forms_meta` (metadados/por formulário), `templates_versoes` (`{ arquivo: { atual, anterior, historico } }` — versionamento §18, rollback §26), `configuracoes` (§22, leitura com default e range), `campos_custom` (`{ docKey: { id: entrada } }` — Field Builder §10). Migração aditiva na carga — nenhum dado é descartado.
- Field Builder (§10): CRUD de campos na aba Campos do formulário (＋ Campo) e no Editor Visual (＋ Novo campo). O painel **não cria seções**: campos novos entram somente em seções já existentes do schema (o select de destino lista as seções do JSON efetivo); sem seção válida a gravação é rejeitada. IDs estáveis: gerados uma única vez via `slugCampoId` (colisão contra o JSON efetivo → sufixo `_2`), renomeação gera ID novo com `renomeadoDe` (o antigo nunca é reutilizado; patch de coordenadas migra para o caminho novo); exclusão de campos base via `{ excluir: true }` e **bloqueada** se o campo é alvo de `dependencia`. Aplicação idempotente (`aplicarCamposCustomEmJson`) sobre o base preservado em `state.docBase`; JSONs do repositório permanecem intactos até a exportação. Gate de publicação valida schema efetivo (`validarDocCampos`): coordenada inválida, grupo vazio e dependência órfã travam; campo fora da página é aviso.
- Navegação v3 por entidades: Visão Geral · Formulários · Templates · Editor Visual · Cidades & Regionais · Configurações · Validação · Histórico · Segurança (+ sub-menu "Mais ferramentas": Assistência, Dados & Backups, Regras, Sistema). Detalhe do formulário com abas; Command Palette **Ctrl+K**.
- Publicação (§23/§24): Dashboard lista **Alterações Pendentes**; publicar exige validação (erro crítico trava; aviso confirma) e registra marco append-only (`pendentesMarcados`, chaveado por grupo: `grupo|chave`, com leitura da chave legada); descartar remove patches pendentes preservando cidades novas sem substituto.
- Configurações (§22): parâmetros por categoria com `efeito` declarado. **Regra: configuração sem consumidor não existe** — toda chave de `CONFIG_DEFS` é lida em um fluxo (nome do sistema/título da aba, aviso de manutenção no Dashboard, validação de UF em cadastro e importação, bloqueio de publicação com cidade sem template, limite de upload, histórico de versões de template, confirmação de operações destrutivas). `cidades.validar_uf` foi consolidada em `formularios.validar_uf` (`CONFIG_ALIASES` lê a legada).
- Caminhos do repositório a partir do painel: sempre via `urlRepositorio()` (`../` + nome), porque a página vive em `/admin/` — usar o nome cru faz o `HEAD` de integridade bater em `/admin/arquivo.pdf` e acusar “PDF inacessível” para todos os templates.
- Exportação para o repositório (fecha o ciclo painel → aplicação pública): **Dados → Exportar arquivos do repositório (efetivos)** gera `ficha_cadastral_campos.json`, `declaracao_plano_saude_campos.json`, `cidades_brasil.json` e `cidades_infinity.json` no **formato original** e já com o overlay aplicado (base + Field Builder + coordenadas + cidades). O fluxo é: editar no painel → exportar → substituir o arquivo na raiz → commit/deploy. Invariante verificada pela auditoria: com overlay vazio o arquivo gerado é **idêntico** ao do repositório (`docEfetivoParaRepositorio`, `cidadesEfetivasParaRepositorio`). O `admin-config.json` (Exportar JSON) é só backup/transferência do overlay — a aplicação pública não o lê.
- Documentos Embarcados (geração 100% embarcada): seção **▣ Documentos Embarcados** — engine em `embedded-docs.js` (template declarativo `template.json` + assets PNG + campos do schema → PDF via pdf-lib, sem PDF externo). Abas: Templates Embarcados (preview do PDF **real** gerado com dados de teste + localizador de campos com atalho para o Editor Visual), Comparação (template oficial × embarcado, com sobreposição, % de diferença nas áreas impressas e deslocamento estimado) e Logs (trilha da sessão; o versionamento definitivo é o git). Configuração: `documentos.tolerancia_visual_pt`. O perfil de texto e o determinismo (datas congeladas) são conferidos pela auditoria contra o `ficha_cadastral.html` e o template real. Manual: `Docs/admin-panel.md` § Documentos Embarcados; POC: `ficha-cadastral-embutido/`.
- Auditoria de dados: `node scripts/audit-panel.mjs` roda o pipeline do painel contra os arquivos reais e falha em falso positivo/configuração fantasma; o Teste 17 da suíte executa essa auditoria.
- Editor (§11): snap-to-grid (1/5/10), setas/Shift/Alt para mover, R restaura, redimensionar pelo handle, seleção múltipla (Ctrl+clique, mesma página) com alinhar/distribuir/restaurar.
- Templates (§18/§19): upload valida %PDF-, tamanho, páginas e dimensões (pdf-lib), compara com a versão publicada, exige motivo, registra sha256; modo API versiona o arquivo físico (`data/uploads/nome__TIMESTAMP.pdf` + `data/uploads.json`; `GET /api/admin/uploads`; rollback via `POST /api/admin/uploads/restaurar`).
- Funcionalidades v2 do painel: Saúde do Sistema no Dashboard (links filtrados), edição completa de cidades (qualquer origem), paginação (50/página), troca de ficha em massa (1 evento agregado), importação CSV/JSON de cidades com preview obrigatório, busca/restauração granular de campos no Editor, diff campo a campo na importação de config, histórico com filtros + desfazer append-only (novo evento `desfazer`, trilha nunca apagada), selos "✎ Editável" / "🔒 Somente leitura — código".
- Persistência: modo API (`data/admin-config.json` + `data/backups/` + `data/historico.json`) em dev; modo exportação (JSON versionado) em produção estática. `localStorage` é proibido como banco administrativo.
- Para liberar um novo e-mail de administrador: gerar o par `{salt, verifier}` e adicionar ao array `G` de `admin-guard.js`.
- Manual completo: `Docs/admin-panel.md`.

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
- `ficha_cadastral.html` — `TEMPLATE_EMBARCADO_PATH`, carregamento de `ficha_cadastral_campos.json`, `gerarPDF` (via engine) e CEP.
- `embedded-docs.js` — `validarTemplate`, `gerarPdf`, `folhasComCoordenadas`, `baselinePdf`, `truncarTexto`, `quebrarTexto`, `valorDaFolha`, `fontesDoTemplate`, `PERFIL_APP`.
- `ficha-cadastral-embutido/extract_template.py` — extração de `template.json` + `assets/` a partir de qualquer PDF oficial (POC documentada no `README.md` do diretório).
- **Cuidado de realm ao testar o renderer:** o pdf-lib valida objetos aninhados contra o `Object`/`Array` do próprio realm. Com o engine dentro de `node:vm`, `addPage` falha com NaN — testes do renderer devem carregar o engine **no realm do host** (eval indireto), como `audit-panel.mjs` faz. E o pdf-lib grava `ModDate/CreationDate` com o relógio do momento: para comparar bytes entre duas gerações, as datas precisam estar congeladas (o engine faz isso por padrão).

---

*Última atualização: geração embarcada de PDFs (`embedded-docs.js` + `ficha-cadastral-embutido/`) substitui o gerador nativo na seção Documentos Embarcados do painel; assistência com template único `DECLARACAO PLANO DE SAUDE.pdf` e municípios via API kstr.*
