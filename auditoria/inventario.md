# Inventário — telas, endpoints, entidades, integrações e storage (25/10/2026)

Referências `arquivo:linha` conforme o estado do repositório na data desta auditoria.

---

## 1. Telas / páginas

| Rota(s) | Arquivo | Linhas | Papel | Proteção |
|---|---|---|---|---|
| `/` | [index.html](../index.html) | 443 | Home / hub | pública |
| `/f075`, `/ficha_cadastral(.html)` | [ficha_cadastral.html](../ficha_cadastral.html) | 4.359 | F-075 | guard.js |
| `/f089`, `/assistencia_medica(.html)` | [assistencia_medica.html](../assistencia_medica.html) | 3.811 | F-089 | guard.js |
| `/bradesco`, `/carta_bradesco(.html)` | [carta_bradesco.html](../carta_bradesco.html) | 1.555 | Carta Bradesco | guard.js |
| `/admin` (todas variantes `/admin/*`) | [admin/index.html](../admin/index.html) | — | Painel v3 | admin-guard.js |
| `/aviso-de-privacidade` → `/aviso-de-privacidade.html` → `Docs/aviso-de-privacidade.html` | Docs |.redirects vercel.json | Hub LGPD | pública |
| `/politica-de-privacidade` → `Docs/privacy-policy.html`, `/termos-de-uso` → `Docs/terms-of-use.html`, `/privacidade-e-seguranca` → `Docs/index.html`; legado `/Forms/:path*` → `/Docs/:path*` | Docs | redirects | Hub LGPD | pública |

Seções da F-075 (jornada): dados pessoais → endereço → contato → dependentes → conta bancária (+ Carta) → benefícios/vale-transporte → declaração/assinatura → LGPD → PDF.
Seções da F-089: tipo de adesão → (Plano de Benefícios: só assinatura) · (Outros Planos: UF/cidade → ficha completa → dependentes → assinatura) → LGPD → PDF.

---

## 2. Endpoints

### 2.1 Produção (rotas estáticas Vercel — `vercel.json`)
| Rota | Destino |
|---|---|
| `/` | `index` (rewrite) |
| `/f075` / `/f089` / `/bradesco` / `/admin` | rewrites correspondentes |
| redirects | 6 regras para Docs + `/Forms/:path*` |

### 2.2 API local de desenvolvimento (`scripts/test-server.mjs`)
| Endpoint | Método | Estado/confirmação | Efeito |
|---|---|---|---|
| `/api/admin/config` | GET/HEAD | 200 JSON / 200 sem corpo (HEAD como sonda de modo) | retorna overlay |
| `/api/admin/config` | PUT/POST | 200 `{ ok, arquivo, backup }`; 400 JSON inválido | grava `data/admin-config.json` + backup automático |
| `/api/admin/backup` | GET | 200 lista | lista backups |
| `/api/admin/backup?id=` | GET | 200 arquivo / 404 | baixa backup |
| `/api/admin/upload` | POST | 200 `{ ok, nome, bytes, destino, versao }`; 400 sem `.pdf`/sem `%PDF-`/sem dados; 413 >20 MB | grava PDF + registra versão (timestamp, sha256) |
| `/api/admin/uploads` | GET | 200 lista | index de versões (cap 200) |
| `/api/admin/uploads/restaurar` | POST | 200 rollback | recopia versão anterior |
| `/api/admin/historico` | GET/POST | 200 | lê/registra eventos (também sonda de modo) |
| `/api/admin/*` | outro | 404 JSON | test-server.mjs:278 |

**Autenticação:** nenhuma nas rotas API (restrito a uso local). **Parâmetros:** corpo JSON; query `id` em backup.

---

## 3. Entidades de dados

| Entidade | Fonte | Campos-chave | Relacionamentos |
|---|---|---|---|
| Schema F-075 | `ficha_cadastral_campos.json` | `documento` (id/título/versão), `campos.<secao>` com `coordenadas` por campo/opção | — |
| Schema F-089 | `assistencia_medica_campos.json` | idem + `tipo_adesao` (grupos de opções), `dependentes` (cônjuge + slots filhos) | — |
| Schema declaração | `declaracao_plano_saude_campos.json` | assinatura + `evidencia.coordenadas` | — |
| Catálogo de cidades | `cidades_brasil.json` | `REGIONAL`, `CIDADE`, `FICHA A UTILIZAR` (sem UF) | → arquivo `FICHA *.pdf` |
| Catálogo Infinity | `cidades_infinity.json` | idem + `UF` | → arquivo; usado no fluxo Infinity |
| Chave normalizada de cidade | painel | convenção `FICHA SAFO` (chave) ↔ `FICHA SA_FO.pdf` (físico) | trava de sincronia (run-test 14.6b) |
| Template declarativo | `ficha-cadastral-embutido/template.json` | `images`, `blackBars` (161), `whiteBoxes`, `checkboxes`, `texts` (89), `marcacoes` (17), `fontes`/`fonteCheckbox` (subsets) | → assets PNG + TTF |
| Overlay administrativo | `data/admin-config.json` (dev) | `campos_ficha`, `campos_declaracao`, `cidades` (patch), `cidades_novas`, `pdfs_meta`, `forms_meta`, `templates_versoes`, `configuracoes`, `campos_custom` | aplicado sobre os JSONs base (migração v1→v3 aditiva) |
| Versões de upload | `data/uploads.json` | `{nome, arquivo, data, bytes, sha256}` | → arquivos em `data/uploads/nome__TIMESTAMP.pdf` |
| Histórico do painel | `data/historico.json` | eventos append-only (+`desfazer`) | — |
| Carimbo de revisão | `Docs/docs-revision.json` | `ultimaValidacaoIso`, `gitCommit`, `gitRemote/branch` | lido por `Docs/doc-revision.js` |

---

## 4. Integrações externas

| Serviço | URL/pacote | Consumidor | Uso | Fallback |
|---|---|---|---|---|
| pdf-lib (CDN) | unpkg.com, pinado 1.17.1, SRI nas páginas públicas | todas as gerações | escrita em PDF | nenhum (crítico) |
| fontkit (CDN) | unpkg.com 1.1.1 | ficha + painel | embutir TTF subsets | fallback Helvetica declarado no relatório |
| pdf.js (CDN) | unpkg.com 3.11.174 | painel | preview/overlay visual | nenhum |
| ViaCEP | viacep.com.br/ws/{cep}/json | ficha, assistência, carta | endereço por CEP | BrasilAPI (somente ficha) |
| Brasil API | brasilapi.com.br/api/cep/v1 | ficha | fallback CEP | — |
| API kstrtech | api.kstrtech.com.br/cidades/{UF} | assistência | municípios por UF (CORS aberto declarado) | `carregarMunicipiosIBGE` existe como remanescente |
| ipify | api.ipify.org | ficha, assistência | IP público para evidência no PDF | omitido do bloco em falha (toast) |
| Google Fonts | fonts.googleapis/gstatic | páginas | tipografia | nenhum |

Todas permitidas no CSP (`connect-src`), exceto pdf.js/painel (scripts `unpkg` object). Sem chaves de API: todas as integrações são públicas/awaits por contrato.

---

## 5. Scripts do repositório (`scripts/`)

| Script | Linhas aprox. | Papel |
|---|---|---|
| run-test.mjs | 1.880 | suíte de rotas/proteção/privacidade (498 atual) |
| test-server.mjs | 377 | servidor local + API admin |
| audit-panel.mjs | — | auditoria do painel contra dados reais (`node:vm`), roda no Teste 17 |
| atualizar-docs-revision.mjs / gerar-historico-versionamento.mjs | 30/214 | carimbos LGPD (automatizados no push) |
| gerar-ficha-vazia.js / gerar-ficha-preenchida.js | 41/105 | geração via engine para comparativo/validação |
| gerar-fontes-comprimidas.js | — | subsets TTF (fonteditor-core), regera `*-sub.ttf` |
| generate-admin-verifiers.mjs | — | gera novos `{salt, verifier}` do painel (não contém segredos, versionado) |
| verify-no-leaked-keys.mjs / pre-commit-check.mjs | — | segurança (apenas locais, gitignored) |
| audit-mobile.mjs, tmp-audit-bancos-iguais.mjs | — | auditorias auxiliares de UI (contidas no repo de scripts) |
| conferir-caixas-v38.py, fidelidade-ficha.py, remapear-campos-v38.py, extract_template.py | — | perícia/extração/validação das coordenadas (Python 3) |
| gerar-docx-privacidade.py | 243 | gera `Docs/Servicos_Privacidade_Termos.docx` |

---

## 6. Chaves de armazenamento do navegador

| Chave | Tipo | Escopo |
|---|---|---|
| `atento.forms:v1:ficha_cadastral_rascunho_v2` | localStorage | rascunho TTL 24 h ficha |
| `atento.forms:v1:rascunho_ttl_ficha_v1` | localStorage | meta do TTL (`savedAt`, `sig`, `decidedAt`) |
| `atento.forms:v1:assistencia_medica_rascunho_v5` / `…rascunho_ttl_assist_v1` | idem | assistência |
| `atento.forms:v1:carta_bradesco_rascunho_v1` / `…rascunho_ttl_carta_v1` | idem | carta |
| `atento.forms:v1:cross_copy_ficha_para_assistencia` (legada `_v1`) | localStorage | payload de cópia entre formulários |
| `atento.forms:v1:carta_bradesco_prefill_v1` | localStorage | prefill da carta |
| `ficha_cadastral_nao_perguntar_copia_assistencia` | localStorage | preferência do usuário |
| `atf_t`, `atf_x`, `atf_p`, `atf_g` | sessionStorage | sessão dos formulários (token, expiração, caminhos legados, flag de grupo) |
| `adm_t`, `adm_x`, `adm_e` | sessionStorage | sessão do painel |
| `adm_draft_cfg` | sessionStorage | rascunho de config do painel (modo exportação) |
| — proibido — | localStorage como banco do painel | persistência.js:26 declara a proibição |

---

## 7. Workflows CI/CD

| Workflow | Gatilho | Ações |
|---|---|---|
| `ci.yml` | push em `main`, qualquer PR | `node --check` (14 grupos de arquivos), presença/parse de estruturas e JSONs, presença do template F-075, `run-test.mjs` |
| `docs-automacao.yml` | push em `main` (não disparado pelos commits do próprio bot), `workflow_dispatch` | regenera/commita carimbo de revisão e histórico (3 tentativas, `concurrency` não-cancelável,히 `[skip ci]`) |
| Vercel | push em `main` | deploy estático automático (sem build) |
