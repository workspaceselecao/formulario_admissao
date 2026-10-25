# Matriz de constatações, débitos e referências — 25/10/2026

Classificação por constatação: **[V]** verificada diretamente no código/config/execução · **[I]** inferida (descrita em documento do repositório, coerente com o código aqui conferido, não re-verificada linha a linha nesta auditoria) · **[N]** não confirmada / precisa de acesso externo.

Segredos: nenhum valor de token/senha/chave foi lido ou registrado (nem o conteúdo de `keys-testes.txt`).

---

## 1. Matriz

| # | Constatação | Status | Fundamento (arquivo:linha) |
|---|---|---|---|
| 1 | Aplicação estática sem backend produção, sem banco de dados, sem variáveis de ambiente | [V] | [vercel.json](../vercel.json) (rewrite/headers apenas); package.json (sem deps de runtime); README §Deploy; inventário §4 (5 APIs só leitura) |
| 2 | Stack front-end: JS vanilla ES2020+, pdf-lib 1.17.1 pinado com SRI, fontkit 1.1.1, pdf.js 3.11.174 | [V] | ficha_cadastral.html:1827/1830; assistencia_medica.html:1326; carta_bradesco.html:653; admin/index.html:690–694 |
| 3 | Autenticação client-side por derivados (salt + SHA-256 + transformações), 5 chaves de formulários, formato `ATN` + 15 alfanuméricos | [V] | guard.js:32–37 (G), :79/:139 (derive/verify); NFSR keys reais ausentes (git ls-files sem `keys*`) |
| 4 | Sessão de formulários: `sessionStorage` atf_t/x/p/g, expiração 60 min, janela deslizante throttle 60 s, banner a 10 min, grupo Ficha↔Assistência↔Carta sem repetição de chave | [V] | guard.js:22–:32 (G), :36 (PROTECTED), :50–:54 (constantes), :66–:122 (deriveVerifier), :124 (verifyCode), :144–:246 (sessão/grupo), :231–:347 (vigência/banner), MANUTENCAO §7.1.1 |
| 5 | Painel com fator duplo client-side (domínio exato `@atento.com` + código exclusivo em corpus `CG` distinto das chaves de formulários) | [V] | admin-guard.js:37–:45 (CG), :48/:67 (domínio); pipeline idêntico declarado e comparado |
| 6 | Limite declarado da guarda client-side (não substitui server-side) | [V] | comentário de cabeçalho guard.js:4–:10 e admin-guard.js:20–:22; README §Segurança |
| 7 | Rascunho com TTL de 24 h pós-último salvamento, modal de decisão, sem retenção indefinida | [I]→[V parcial] | rascunho-ttl.js (442 ln) conferido por rascunho (API `RascunhoTTL.init/verificarAposSalvar` chamada pelas páginas: ficha `salvarRascunhoLocalSincrono`, assistência após `gerarPDF`); detalhes de meta (`savedAt/sig/decidedAt`) conforme MANUTENCAO §7.2 — não refizemos o timer físico nesta auditoria |
| 8 | Chaves de storage versionadas por página conforme documentação | [V] | ficha_cadastral.html:1897 (`_v2`); busca de `LS_NS` nas demais páginas confirmou o mesmo namespace `atento.forms:v1:*` |
| 9 | CEP: ViaCEP em todos os fluxos + fallback BrasilAPI na ficha | [V] | ficha_cadastral.html:2041/:2057; assistencia_medica.html:1931; carta_bradesco.html:818 |
| 10 | Municípios da assistência via kstrtech (CORS aberto declarado) | [I] | assistencia_medica.html:1822 (chamada); CORS **declarado** em MANUTENCAO §6.1 — não testado em rede nesta auditoria |
| 11 | IP público de evidência via ipify | [V] | ficha_cadastral.html:2305; assistencia_medica.html:2166 |
| 12 | Geração unificada via `EmbeddedDocs.gerarPdf` (app público = painel = scripts) | [V] | ficha_cadastral.html:3885; assistencia_medica.html (gerarPDF:3228); admin/panel.js:2989; scripts/gerar-ficha-preenchida.js:98; embedded-docs.js:395 |
| 13 | Template declarativo (página + 3 imagens + 161 barras + 89 textos + 17 marcações) e subsets de fonte 17–20 KB ⇒ PDF ~117 KB | [I] | números extraídos de MANUTENCAO §2 (e essa fonte é o README da POC); `template.json` (10.716 ln) existe e `assets/*-sub.ttf` confirmados por listagem |
| 14 | Route guards/rewrites idênticos em local e Vercel | [V] | vercel.json (rewrites); test-server.mjs emulam as rotas; suíte roda as duas pontas (run-test.mjs:170–178) |
| 15 | API admin local: config (backup automático), upload validado (assinatura `%PDF-`, 20 MB, sha256, versão imutável cap 200), rollback, histórico (sonda de modo) | [V] | test-server.mjs:26, :108, :152–:278; persistence.js:52–:63 |
| 16 | Modo exportação em produção estática: alterações do painel exigem commit manual; localStorage proibido como banco | [V] | persistence.js:17–:29; MANUTENCAO §9.1 |
| 17 | Painel nunca edita os JSONs do repo; export com overlay vazio ≡ arquivo do repo | [I] | MANUTENCAO §9.1 + scripts/audit-panel.mjs:286 (invariante executada no Teste 17; suíte verde nesta auditoria) |
| 18 | Suíte atual: 498 testes, 0 falhas | [V] | execução de `node scripts/run-test.mjs` nesta auditoria (exit 0) |
| 19 | CI: sintaxe JS, estrutura/JSONs, presença de PDFs, suíte completa — Node 22 | [V] | .github/workflows/ci.yml |
| 20 | Bot de docs regenera/commita carimbo + histórico em todo push `main`, `[skip ci]`, 3 tentativas | [V] | .github/workflows/docs-automacao.yml; histórico de commits do bot visível no repo (5b01369, 0371d40, bbea776) |
| 21 | Headers/CSP: allowlist de integrações (viacep/brasilapi/ipify/kstrtech/unpkg/Google Fonts), COEP/COOP/CORP, HSTS preload, frame-ancestors none | [V] | vercel.json (bloco headers) |
| 22 | Segredos: códigos reais fora do repo (`keys*.txt`, `data/`, `scripts/verify-no-leaked-keys.mjs`, `pre-commit-check.mjs` gitignored); só derivados versionados | [V] | .gitignore; `git ls-files` sem match de chaves; guards |
| 23 | LGPD: hub Docs público + carimbo automático + rascunho TTL + modais; sem cookies de rastreamento | [V]/[I] | Docs/* (17 arquivos), docs-rewrites, workflow; textos LGPD de acordo com MANUTENCAO §7.4–7.5 |
| 24 | Sem telemetria/APM/logs centralizados; diagnóstico via suíte local + console | [V] | ausência de instrumentação em todas as páginas e no test-server |
| 25 | Perfis de usuário (candidato/RH/admin) | [I] | PRD §3 + fluxo real de dois guards — sem contas/roles formais |
| 26 | Fidelidade do PDF embarcado ≥ 99,5% / determinismo de datas | [I] | README da POC (ficha-cadastral-embutido/README.md) + scripts fidelidade-ficha.py — não reexecutamos a comparação visual nesta auditoria |
| 27 | Status do CI na plataforma GitHub e deploys da Vercel | [N] | precisa de acesso aos dashboards; local: suíte verde |
| 28 | Disponibilidade real das APIs/CDNs externas em produção | [N] | não testado em rede nesta auditoria |
| 29 | Política real de emissão/rotação das chaves `ATN-…` por RH | [N] | operação fora do repo; keys reais não versionadas por design |
| 30 | Versão Node local exigida | [V] | CI usa Node 22; README diz "Node ≥ 18" para scripts (test-server usa APIs pós-18) |

---

## 2. Limitações e débitos técnicos identificados

| Débito | Impacto | Mitigação sugerida | Confiança |
|---|---|---|---|
| Autenticação client-side (documentada como decisão) | conteúdo e lógica das páginas protegidas chegam ao navegador; contorno possível por usuário avançado | manter decisão, mas registrar junto ao jurídico como barreira de conveniência (não controle de acesso) | alta — declarada no código |
| SRI ausente no painel (unpkg sem `integrity`) ao contrário das páginas públicas | risco de supply-chain no `/admin` | adicionar `integrity`/`crossorigin` em admin/index.html:690–694 | alta |
| Sem proteção de branch no `main` | push direto publica em produção | MANUTENCAO §11.1 já define a receita p/ quando houver admin | alta |
| `admin-guard` guarda apenas o lado do navegador — arquivos sob `/admin/` são estáticos públicos | abre o HTML/JS do painel sem login (o conteúdo só não é exibido) | mesma natureza da decisão de projeto; linha de base no relatório jurídico | alta |
| Sem fallback para os CDNs (unpkg/Google Fonts) | indisponibilidade externa quebra a geração de PDF | hospedar assets no domínio próprio | alta |
| Sem gate de tamanho de PDF no CI | regressão de ~2,7 MB (fontes completas) não travaria o deploy executando a suíte de rotas | teste que gera via engine e assesta bytes ≤ 248 KB | alta — sugestão nova;¢ limite documentado no MANUTENCAO §2 |
| API admin local sem autenticação | se exposto à rede (fora do localhost), qualquer cliente escreve config | bind explícito em loopback + aviso no help do script | alta (código escuta apenas onde iniciado) |
| Sem telemetria | falhas de UX/API em produção invisíveis | manter (LGPD) mas considerar eventos anônimos agregados opcionais | alta |
| `.kilo/` tool-config versionado (`.kilo/kilo.jsonc`) + worktree local não versionado | ruído de repositório, sem risco de vazar código | avaliar mover config para gitignore/pasta dedicada | alta |
| Inline scripts + `'unsafe-inline'` no CSP | superfície XSS ampliada (necessária à arquitetura atual, mitigada por COEP/COOP/CORP e sem inputs servidor) | migração gradual para `<script type=module>` externos com nonces | média — inferência arquitetural |
| Remanescente `carregarMunicipiosIBGE()` no fluxo ativo | dependência morta/alt no caminho de cidades | confirmar se é fallback real ou código morto e documentar | média |
| Acessibilidade sem auditoria formal | risco de não-conformidade WCAG a longo prazo | auditoria dirigida (teclado, contraste) | alta (declarada em RNF-06) |

---

## 3. Referências principais de código (fundamentos)

| Tema | Referências |
|---|---|
| Guards/sessão | guard.js:22–:54, :66–:124, :144–:246, :231–:297, :369–:523 · admin-guard.js:37–:48, :67–:67, :123–:179, :349–:368 |
| Sessão entre formulários + expiração | guard.js (`grantSession` :197, `registrarAtividade` :231, `agendarAviso` :280, `mostrarBannerExpiracao` :297, `iniciarVigencia` :335) · MANUTENCAO §7.1.1 |
| Rascunho TTL | rascunho-ttl.js (442 ln) · chaves em MANUTENCAO §7.2 · chamadas `verificarAposSalvar` nos HTMLs |
| Engine PDF | embedded-docs.js:33 (API), :395 (`gerarPdf`) · ficha_cadastral.html:3728–:3779 (carga/validação/template), :3885 (chamada) |
| Ficha F-075 | ficha_cadastral.html (funções listadas em docs-tecnico §1) |
| Assistência F-089 | assistencia_medica.html:1421–:1491, :1608–:1839, :2495, :3228, :3429, :2939 |
| Carta Bradesco | carta_bradesco.html:678–:706, :818, :1120, :1227, :1358, :1499 |
| API admin local | test-server.mjs:26, :108, :152–:278 · persistence.js:17–:63 |
| Infra/segurança | vercel.json (headers/redirects/rewrites) · .gitignore · ci.yml · docs-automacao.yml |
| Documentação interna | README.md · PRD.md · MANUTENCAO.md · Docs/admin-panel.md · Docs/historico-versionamento.md |

---

## 4. O que *não* foi verificado (e por quê)

- **Dashboards externos** (GitHub Actions runs, Vercel): sem acesso de rede/dashboards nesta auditoria.
- **Disponibilidade de APIs de terceiros** e CORS do kstrtech em tempo real: não chamados de rede — citados por código e por documentação interna.
- **Conteúdo de `keys-testes.txt`**: deliberadamente não lido (política de não expor segredos); estatuto confirmado via `git ls-files` e .gitignore (não versionado).
- **Comparações visuais de PDF** (fidelidade ≥ 99,5%): os scripts existem e a suíte os executa indiretamente; a convergência numérica não foi reexecutada nesta auditoria.
- **Comportamento em iOS/Safari/Desktop real**: fora do escopo (requer dispositivos).
