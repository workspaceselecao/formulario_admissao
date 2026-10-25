# Documentação técnica — front-end e "back-end" (estado verificado, 25/10/2026)

Auditoria somente-leitura. Todas as conclusões abaixo foram conferidas no código; onde não foi possível confirmar diretamente, está marcado na [matriz de constatações](constatacoes-matriz.md).

---

## 1. Front-end

### 1.1 Stack e versões

| Camada | Tecnologia | Versão/última | Evidência |
|---|---|---|---|
| Linguagem | JavaScript ES2020+ vanilla, sem framework/bundler | — | inline em `ficha_cadastral.html` (4.359 linhas), `assistencia_medica.html` (3.811), `carta_bradesco.html` (1.555), `index.html` (443) |
| Geração de PDF | [pdf-lib](https://github.com/Hopding/pdf-lib) via unpkg com **SRI** (`integrity="sha384-weMABw…`") | 1.17.1 (pinado) | ficha_cadastral.html:1827, assistencia_medica.html:1326, carta_bradesco.html:653; admin/index.html:690 (sem SRI no painel — ver débitos) |
| Fontkit | `@pdf-lib/fontkit` via unpkg | 1.1.1 | ficha_cadastral.html:1830, admin/index.html:693 |
| Preview de PDF no painel | `pdfjs-dist` via unpkg | 3.11.174 | admin/index.html:694 |
| Dev-dependências (Node) | `pdf-lib@^1.17.1`, `fonteditor-core@^2.6.3` (subsets de fonte) | — | package.json |
| Fontes web | Google Fonts (DM Sans/DM Mono; Poppins nos guards/Docs) | — | CSP de vercel.json (`fonts.googleapis.com`/`fonts.gstatic.com`) |

### 1.2 Estrutura e organização

- **Sem build step**: arquivos servidos como estão; a "organização de módulos" é por convenção de arquivos na raiz.
- JS das páginas é **inline no `<body>`** (uma SPA leve por página); módulos compartilhados na raiz: `guard.js`, `admin-guard.js`, `rascunho-ttl.js`, `embedded-docs.js`, `shared-header-nav.css`.
- Painel: `admin/index.html` (+ `panel.js` 5.599 linhas, `persistence.js` 258, `panel.css` 651).
- Dados sob `Docs/` (hub LGPD), `scripts/` (17 utilitários Node/Python), `ficha-cadastral-embutido/` (POC/template declarativo, `template.json` com 10.716 linhas + `assets/`).

### 1.3 Páginas, telas e responsabilidades

| Página | Rotas | Responsabilidade |
|---|---|---|
| `index.html` | `/` | Hub de escolha + modal de instruções + card Configurações |
| `ficha_cadastral.html` | `/f075`, `/ficha_cadastral(.html)` | F-075 completa (seções, etapas, dependentes, bancos, VT, assinatura) |
| `assistencia_medica.html` | `/f089`, `/assistencia_medica(.html)` | F-089 nos dois fluxos (Plano de Benefícios e Outros Planos/regionais) |
| `carta_bradesco.html` | `/bradesco`, `/carta_bradesco(.html)` | Carta de abertura de conta salário |
| `admin/index.html` | `/admin` (+variantes) | Painel de configuração v3 (nav por entidades, Ctrl+K) |
| `Docs/*.html` | redirects em vercel.json | Hub LGPD público |

### 1.4 Estado, formulários e persistência

- **Estado do formulário:** DOM como fonte de verdade; serialização para rascunho via `coletarEstadoRascunho()`/`aplicarEstadoRascunho()` (assistência) e equivalentes na ficha/carta.
- **Rascunho:** `localStorage` com chaves versionadas (`atento.forms:v1:*`), expiração TTL 24 h via `rascunho-ttl.js` (meta em chave própria com `savedAt`, `sig`, `decidedAt`); persistência imediata em `change` no mobile.
- **Copys entre formulários:** `localStorage` com payloads de consumo único (`atento.forms:v1:cross_copy_ficha_para_assistencia`, `atento.forms:v1:carta_bradesco_prefill_v1`), removidos após consumo/descarte.
- **Sessão de acesso:** `sessionStorage` `atf_t/x/p/g` (formulários) e `adm_t/x/e` (painel); rascunho de config do painel em `adm_draft_cfg` (sessionStorage — nunca localStorage).
- **Não há framework de estado** nem biblioteca de formulários: máscaras/validações são implementadas à mão (ex.: `maskCPF`, `maskCep`, `maskTelefone`, `maskPIS`, `maskMoeda`, `aplicarMaiusculas`).

### 1.5 Validações, erros e carregamento

- Validação pré-geração: `validarCamposObrigatorios()` em cada página (ficha e assistência marcam campos inválidos via `marcarCampoInvalido()` e toasts `showToast()`); assistência tem `validarCamposPlanoBeneficios()` dedicado.
- Falhas de rede (CEP, cidades, IP) aparecem como toasts; IPs externos possuem timeout via `AbortSignal.timeout` / `AbortController`.
- Template PDF e assets são carregados por `fetch` com `cache: "no-store"` e validados por `EmbeddedDocs.validarTemplate()` antes de qualquer geração (ficha_cadastral.html:3728–:3771). Painel detecta 404/HTML de host estático → modo exportação (persistence.js:52–:63).

### 1.6 Comunicação com o exterior (a partir do navegador)

| Destino | Uso | Páginas |
|---|---|---|
| `unpkg.com` | pdf-lib/fontkit/pdfjs-dist | todas que geram PDF + painel |
| `viacep.com.br/ws/{cep}/json/` | CEP | ficha (:2041), assistência (:1931), carta (:818) |
| `brasilapi.com.br/api/cep/v1/{cep}` | fallback de CEP na ficha | ficha (:2057) |
| `api.kstrtech.com.br/cidades/{UF}` | lista de municípios da assistência | assistência (:1822); CORS declarado aberto (MANUTENCAO §6.1) |
| `api.ipify.org` | IP público para evidência do PDF | ficha (:2305), assistência (:2166) |
| `fonts.googleapis.com` / `fonts.gstatic.com` | tipografia | CSP de vercel.json |
| `api.ibge`/IBGE | `carregarMunicipiosIBGE()` existe (assistência:1839) — remanescente do fluxo antigo de municípios (hoje kstr é o ativo) | — |

Não há chamadas de API para um backend do próprio produto em produção.

### 1.7 Autenticação de front-end (guards)

- `guard.js` — IIFE: 5 pares `{salt, verifier}` (`G`); pipeline `normalizar → concat(salt, entrada) → SHA-256 → inversão de bits por byte → XOR com máscara derivada do salt → troca de pares → hex` (`deriveVerifier()`, guard.js:66–:122). Formato da chave: inicia com `ATN`, 15 caracteres alfanuméricos (`verifyCode()`, guard.js:124). Sessão em `sessionStorage` com token aleatório de 32 bytes (`genToken()`).
- `admin-guard.js` — mesmo pipeline, corpus `CG` próprio (5 códigos exclusivos) **+** e-mail com domínio exatamente `@atento.com` (regex/`endsWith`; recusa subdomínios e `atento.com.br`). Sessão `adm_t/x/e`; refresh por atividade a cada 30 s (`scheduleRefresh()`). Mensagens de erro genéricas (não revelam qual fator falhou).
- **Limitação declarada no código:** proteção client-side; não substitui autenticação server-side (comentários de cabeçalho dos dois arquivos e README §Segurança).

### 1.8 Responsividade e acessibilidad

- Layout responsivo collapse-to-1-column no mobile; selects com 16 px para evitar zoom do iOS; cabeçalho recolhível ao scroll (comportamento em rotação); guarda de teclado virtual via `visualViewport` nos overlays de autenticação (`createAuthUI`, guard.js:369).
- A11y em melhor-esforço: `role="alert"`/`aria-live` no banner de expiração, labels nos inputs do admin-guard, foco automático; **não há auditoria WCAG formal** (RNF-06 do PRD).

---

## 2. "Back-end"

### 2.1 O que existe de fato

**Não há backend em produção.** O único componente server-side do produto é o **servidor local de desenvolvimento** (`scripts/test-server.mjs`, 377 linhas, Node ≥ 18 sem frameworks — `node:http`):

| Endpoint | Métodos | Comportamento (verificado) |
|---|---|---|
| `/` e rotas do `vercel.json` (`/f075`, `/f089`, `/bradesco`, `/admin`, docs) | GET | serve os arquivos e emula rewrites |
| `/api/admin/config` | GET/HEAD; PUT/POST | HEAD = sonda de modo; PUT/POST grava `data/admin-config.json` **com backup automático do estado anterior** em `data/backups/` (test-server.mjs:152–:197); corpo limitado a 5 MB; JSON inválido → 400 |
| `/api/admin/backup` | GET; GET `?id=` | lista backups ou baixa um específico (nome sanitizado via `sanitizarNomeArquivo`) |
| `/api/admin/upload` | POST | recebe Base64 JSON; exige `%PDF-` na assinatura (:210), limite 20 MB (→413), nome `.pdf` sanitizado; registra **versão física com timestamp** (`registrarVersaoUpload`, :26) e index `data/uploads.json` (cap 200 versões, sha256 por versão) |
| `/api/admin/uploads` | GET | lista versões de uploads |
| `/api/admin/uploads/restaurar` | POST | rollback físico: recopia a versão anterior (§26) |
| `/api/admin/historico` | GET/POST | eventos de auditoria em `data/historico.json` — **também é a sonda de detecção de modo** do painel (persistence.js:52) |
| `/api/admin/*` desconhecido | — | 404 JSON (test-server.mjs:278) |

Tudo grava em `data/` (gitignored). Em produção estática (Vercel preset Other, sem serverless), a API não existe e o painel opera em **modo exportação**: sessão do navegador + geração de JSON para o administrador versionar no repo.

### 2.2 Tarefas agendadas / assíncronas

- **No navegador:** timer do TTL do rascunho (`tick()` + `agendarModal()` em rascunho-ttl.js), contagem do banner de sessão (`setInterval` 10 s), regeneração de guardas por atividade com throttle.
- **No GitHub Actions:** workflow `docs-automacao.yml` em todo push no `main` — regenera `Docs/docs-revision.json` + `Docs/historico-versionamento.md`, valida e commita (bot `github-actions[bot]`, mensagem `[skip ci]`, até 3 tentativas com re-sync); `concurrency: docs-automacao` sem cancelamento.
- **Nenhum cron, fila ou webhook** no produto.

### 2.3 Engine de geração embarcada (`embedded-docs.js`, 768 linhas)

- API pública: `EmbeddedDocs.validarTemplate` e `EmbeddedDocs.gerarPdf` (UMD — funciona no browser e em Node, embedded-docs.js:48, :395).
- Entradas: `template.json` declarativo (página, 3 imagens, 161 barras pretas, 89 textos estáticos, 17 marcações) + schema de coordenadas (`*_campos.json`) + mapa flat de dados + assets (PNGs e fontes TTF em bytes) + fontkit opcional.
- Perfil de texto único da aplicação (`EmbeddedDocs.PERFIL_APP`: fonte 9 pt, `x+0,5`, baseline centrado na caixa) — MESMO caminho do painel e do `ficha_cadastral.html` (garantia de fidelidade, MANUTENCAO §3 nota).
- Sem fontkit (CDN bloqueada) cai em `fallback` Helvetica e reporta em `relatorio.fontesFallback` (degradação visível, não silenciosa).
- Fontes: subsets `*-sub.ttf` de 17–20 KB (Segoe apenas com glifo ❑ U+2751) → PDF de ~117 KB; TTFs completos só são insumo do `scripts/gerar-fontes-comprimidas.js`.

### 2.4 Segurança do server local

- Sanitização de nome de arquivo (normaliza acentos, proíbe `..`, trim 120 chars) antes de qualquer `join`/`basename`.
- Validação de magia de PDF, limite de tamanho e rate-free (sem upload infinito: index cap 200).
- Sem autenticação nas rotas `/api/admin/*` — aceitável **apenas** porque o servidor é local de dev (escuta localhost); não expor à rede. (Ver débitos.)

### 2.5 Logs e monitoramento

- Não há logging estruturado, APM ou telemetria em nenhuma camada (decisão LGPD-friendly). Diagnóstico hoje = console do navegador + suíte local.

---

## 3. Testes e CI

- **Suíte:** `scripts/run-test.mjs` (1.880 linhas) — 20 grupos de testes cobrindo estrutura, guards (janela deslizante/banner em Testes 2/7), rascunho TTL (18), LGPD Docs (19), gate da conta salário (20), painel v2/v3 (9–13), cidades/regionais (14.6b), auditoria de dados via `audit-panel.mjs` (17). **Execução desta auditoria: 498 passaram, 0 falharam (exit 0).**
- **Testes optativos por secret local:** arquivos dependentes de `keys-testes.txt` são marcados *skipped* sem o arquivo (convencão documentada, MANUTENCAO §9.1).
- **CI:** `.github/workflows/ci.yml` (push/PR) — `node --check` em todos os JS, presença/JSON-parse de estruturas e JSONs-chave, presença dos PDFs modelo, suíte completa. **Node 22**.
- **Bot de docs:** `docs-automacao.yml` (ver §2.2).

---

## 4. Infraestrutura e deploy

- **Vercel**, preset Other, sem build: `vercel.json` única fonte de rotas (`cleanUrls`, redirects para Docs, rewrites `/f075`,`/f089`,`/bradesco`,`/admin`).
- **Headers** (todas as rotas): CSP (allowlist de viacep/brasilapi/ipify/kstrtech + unpkg + Google Fonts; `worker-src blob:` para o worker do pdf.js), HSTS preload, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy restritiva, COOP same-origin, COEP require-corp, CORP same-origin, X-Permitted-Cross-Domain-Policies none.
- **Variáveis de ambiente:** nenhuma.
- **Ambientes:** produção (main → Vercel). Não há homologação dedicada; preview branches da Vercel são possíveis mas não configuradas como processo.
- **CI/CD:** GitHub Actions como acima; deploy automático a cada push no `main` (inclusive o commit do bot de docs).
- **Pontos críticos de disponibilidade:** unpkg (bibliotecas), Google Fonts, ViaCEP/BrasilAPI (CEP), kstrtech (municípios), ipify (evidência). Sem fallback nesses CDNs.

---

## 5. Dados e armazenamento

| Persistência | O que guarda | Tecnologia |
|---|---|---|
| `ficha_cadastral_campos.json` (911 ln) | schema + coordenadas F-075 | arquivo estático versionado |
| `assistencia_medica_campos.json` (969 ln) | schema + coordenadas F-089 | idem |
| `declaracao_plano_saude_campos.json` (83 ln) | coordenadas da declaração | idem |
| `cidades_brasil.json` (1.366 ln) / `cidades_infinity.json` (1.639 ln) | catálogo cidade→ficha regional (sem/ com UF) | idem |
| `ficha-cadastral-embutido/template.json` (10.716 ln) | template declarativo das camadas visuais | idem |
| `localStorage` | rascunhos TTL 24 h + copys entre formulários | navegador |
| `sessionStorage` | sessões de acesso + rascunho de config do painel | navegador |
| `data/` (dev) | admin-config, backups, uploads versionados, histórico | filesystem gitignored |
| Nenhuma | dados de candidatos | — |

- **Relacionamentos:** schema aninhado por seção (`dados_pessoais`, `endereco`, `dependentes.0..n`, `vale_transporte.itens`); sem chaves estrangeiras formais — é design documental.
- **Migrações:** por versionamento de schema/chave do rascunho (v2/v5/v1) com `lsMigrateLegacy()`/`lsRemoveDual()`; overlay do painel tem migração aditiva v1→v3 (nenhum dado descartado, MANUTENCAO §9.1).
- **Índices/backup:** n/a (não há banco). Backups: automáticos no modo API (`data/backups/`), export/import JSON no modo estático, versões físicas de PDF com sha256 (cap 200).

---

## 6. Segurança e privacidade (levantamento)

| Aspecto | Estado verificado | Ref |
|---|---|---|
| Credenciais/versionação | códigos reais NÃO versionados — apenas `{salt, verifier}` derivados; `keys*.txt`, `data/`, scripts auxiliares com chaves gitignored; `git ls-files` não contém arquivo de chaves | .gitignore; MANUTENCAO §9.1 |
| Headers/CSP | CSP com allowlist fechada de integrações, COEP/COOP/CORP, frame-ancestors none, HSTS preload | vercel.json |
| Uploads dev | validação de assinatura PDF, tamanho, sanitização de nome, versionamento imutável | test-server.mjs |
| Autenticação | client-side (limitação declarada e aceita por decisão de projeto); painel com fator duplo local (domínio + código exclusivo) | guards |
| Dados pessoais | permanecem no dispositivo; PDF sai "download" sem upload; rascunho TTL 24 h sem retenção indefinida; evidência de assinatura inclui IP público e data/hora no próprio PDF | rascunho-ttl.js; guards |
| Comunicações externas | fetch sobre HTTPS para 5 serviços de terceiros com dados de endereço/IP — CSP ações correspondentes | vercel.json §connect-src |
| Riscos identificáveis | 1) bypass da guarda client-side (documentado); 2) dependência de CDNs (indisponibilidade); 3) sessão em `sessionStorage` é apagada quando a aba fecha (by design); 4) e-mail do painel validado apenas por domínio (sem verificação de conta real); 5) sem CSP nonce/hash para inline scripts (`'unsafe-inline'` necessário pela arquitetura inline) | matriz |
| LGPD | hub Docs público + carimbo automático; rascunho com expiração; modais de decisão; sem cookies de tracking | Docs/, run-test 19 |

Valores de segredos não foram lidos nem registrados neste documento (política da auditoria). Nome das variáveis relevantes: nenhuma variável de ambiente existe no produto.
