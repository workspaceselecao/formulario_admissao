# PRD retrospectivo — Formulários de admissão (estado atual, 25/10/2026)

**Objetivo:** descrever as funcionalidades e regras de negócio **que existem hoje**, com evidência de código. Não é um PRD prospectivo. Complementa [PRD.md](../PRD.md) (prospectivo) e [MANUTENCAO.md](../MANUTENCAO.md) (operações).

---

## 1. Funcionalidades existentes

### 1.1 Home (`index.html`, rota `/`)
- Hub de navegação: cards para F-075, F-089, Carta Bradesco e **Configurações** (painel), modal de instruções, identidade visual "Gradiente + Tangerina" (`#01426A` como cor institucional).
- Não carrega `guard.js` (pública) — travado pela suíte (run-test.mjs:178).

### 1.2 Ficha Cadastral F-075 (`ficha_cadastral.html`, rotas `/f075`, `/ficha_cadastral`)
| Funcionalidade | Evidência |
|---|---|
| Fluxo progressivo por etapas (percentuais por seção, etapas seguintes reveladas) | `calcularPercentuaisSecoes()` (ficha_cadastral.html:2800), `atualizarVisibilidadeEtapas()` (:2878) |
| Dependentes dinâmicos (adicionar/remover linhas, limite no código) | `adicionarDependente()` (:2957), `lerDependentesFormulario()` (:2928) |
| Conta bancária com regras por banco (Bradesco/Next/Santander) e gate da Conta Salário | `tipoContaEh*` (:2581–:2595), `sincronizarGateContaSalario()` (:2675) |
| Vale-transporte com marca d'água "não optante" | `atualizarUiValeTransporteNaoOptante()` (:2484), `desenharMarcaDaguaNaoOptanteValeTransporte()` (:2540) |
| CEP: ViaCEP com fallback Brasil API | `consultarCep()` (:2038), fetch ViaCEP (:2041), fetch BrasilAPI (:2057) |
| Assinatura manuscrita (canvas → PNG) + opção "não assinar manualmente" | `initAssinaturaCanvas()` (:2182), `canvasAssinaturaParaPngArrayBuffer()` (:2278) |
| Evidência técnica carimbada no rodapé do PDF (doc, data/hora, IP) | `caixaRodapeEvidenciaPdf()` (:2357), IP via `api.ipify.org` (:2305) |
| Geração do PDF pela engine embarcada (mesmo caminho do painel) | `EmbeddedDocs.gerarPdf` (:3885), template carregado por HTTP com `validarTemplate` (:3743–:3749), dados pela `montarDadosFicha()` (:3779) |
| Critério的血 de bloqueio: "Ainda vou abrir" sem agência/conta interrompe a geração e exige a Carta | `pendenciaContaSalarioSemDados()` + `modalContaSalarioSemDados`, ação única **Preencher Carta** (MANUTENCAO §4, Teste 20) |
| Cópia de dados para a Assistência | `construirPayloadCopiaParaAssistencia()` (:3010), `salvarPayloadCopiaAssistenciaNoStorage()` (:3070) |

### 1.3 Assistência Médica F-089 (`assistencia_medica.html`, rotas `/f089`, `/assistencia_medica`)
| Funcionalidade | Evidência |
|---|---|
| Escolha inicial: **Plano de Benefícios** (só assinatura na pág. 2 da declaração) ou **Outros Planos** (ficha completa regional) | `ehPlanoBeneficios()`/`ehOutrosPlanos()` (:1421–:1424), `gerarPDF()` ramifica (:3228) |
| Outros Planos: variante Infinity usa lista com UF (`cidades_infinity.json`); demais usem o catálogo `cidades_brasil.json` | `usaListaInfinity()` (:1430), `obterMapaCidadesAtivo()` (:1433) |
| UF → municípios via API kstr (lista completa, ordenada) | `buscarMunicipiosPorUf()` (:1822) |
| Ficha regional resolvida pelo nome da cidade → arquivo físico | `resolverArquivoPdfPorCidadeNome()` (:1491) |
| Dependentes (cônjuge + filhos 2–4) com campo DNV condicionado à idade em dias | `idadeFilhoEmDiasAteHoje()` (:1608), `filhoDeveExibirCampoDnv()` (:1625) |
| "Não optante" omite a seção de dependentes no PDF | MANUTENCAO §5, RF-22 |
| Download de modelo em branco | `baixarPdfVazioExecucao()` (:3429) |
| Consumir payload copiado da Ficha ao abrir | `tentarAplicarCopiaFichaCadastral()` (:2939) |

### 1.4 Carta Bradesco (`carta_bradesco.html`, rotas `/bradesco`, `/carta_bradesco`)
| Funcionalidade | Evidência |
|---|---|
| Geração do zero com timbrado (logo/carimbo PNG) e `carta_bradesco_cargos.js` (grupos/cargos TB-047_09) | `carregarAssetsCarta()` (:1120), `preencherSelectGrupos()` (:678) |
| Autopreenchimento a partir da Ficha | `aplicarPrefillFichaCadastral()` (:1499) |
| CEP ViaCEP | `consultarCep()` (:818) |
| Formatação de moeda e salário | `maskMoeda()` (:905), `moedaParaPdfSemSimbolo()` (:918) |
| Geração de PDF escrita em parágrafos run-a-run | `desenharParagrafo()` (:1144), `gerarPdfCartaBytes()` (:1227) |

### 1.5 Sessão de acesso entre formulários (`guard.js`)
| Regra | Evidência |
|---|---|
| Chave necessária só na inserção inicial; concede o grupo inteiro F-075/F-089/Carta nesta aba | `grantSession()` (guard.js:197) marca `atf_g=1` sobre todos os caminhos de `PROTECTED`; `sessionValid()` (:183) aceita o grupo |
| Acesso direto sem sessão pede sempre a chave | `createAuthUI()` no `DOMContentLoaded` (guard.js:369) |
| Expiração 60 min com **janela deslizante por atividade** (throttle 60 s; clique/tecla/toque/retorno à aba) | `iniciarVigencia()` (guard.js:335), `registrarAtividade()` (:231), `EXPIRY_MS`/`REFRESH_THROTTLE_MS`/`AVISO_FALTA_MS` (:50–:54) |
| Banner a ≤ 10 min da expiração: "Continuar sessão" / "Encerrar agora"; ao vencer, sessão limpa e tela da chave recarrega | `mostrarBannerExpiracao()` (guard.js:297), `agendarAviso()` (:280), `encerrarSessaoPorExpiracao()` (:240) |
| `/admin` apartado (guard dedicado) | `PROTECTED` não contém `/admin`; `admin-guard.js` independente |

### 1.6 Rascunho LGPD (todas as páginas, `rascunho-ttl.js`)
| Regra | Evidência |
|---|---|
| TTL fixo de 24 h **desde o último salvamento**, sem retenção indefinida | `expirou()` em rascunho-ttl.js; política documentada em MANUTENCAO §7.2 |
| Modal de decisão ao abrir com rascunho sem decisão e após gerar o PDF | `verificarAposSalvar()` chamado por `salvarRascunhoLocalSincrono()`/`salvarRascunho()`; "Apagar rascunho agora" × "Manter por 24 h"; ESC/fundo = manter |
| Rascunho versionado por página | chaves e versão em MANUTENCAO §7.2 (`ficha_v2`, `assist_v5`, `carta_v1`) |
| Timeout do modal agendado por `agendarModal()` — quando expira com a página aberta, limpa o formulário junto | MANUTENCAO §1 §7.2 |

### 1.7 Painel Administrativo (`/admin`)
| Funcionalidade | Evidência |
|---|---|
| Autenticação apartada: e-mail exatamente `@atento.com` + código exclusivo do painel | `isCorporateDomain()` (admin-guard.js:67 recusa subdomínios e `.com.br`), corpus `CG` (:37–:45) independente das 5 chaves dos formulários |
| Modelo **overlay**: os JSONs do repositório são a fonte primária e o painel nunca os edita diretamente | MANUTENCAO §9.1; `docEfetivoParaRepositorio` — export com overlay vazio é bit-a-bit igual ao do repo (auditoria de invariante) |
| Editor visual de coordenadas sobre o PDF, Field Builder, cidades, upload/versionamento de templates + rollback físico, histórico append-only | MANUTENCAO §9.1 (§10, §11, §18, §23/§24, §26) ; validação de schema no gate de publicação (`validarDocCampos`) |
| Persistência adaptativa: modo API (dev) ↔ modo exportação (produção estática) | `detectMode()` (persistence.js:52); API local em scripts/test-server.mjs:152–:278 |
| Configurações com regra "config sem consumidor não existe" | `CONFIG_DEFS` — toda chave lida em um fluxo (MANUTENCAO §9.1 §22) |
| Exportação fecha o ciclo painel → repo | **Exportar arquivos do repositório (efetivos)** regenera 4 JSONs com overlay aplicado (MANUTENCAO §9.1) |
| localStorage PROIBIDO como banco administrativo | persistence.js:26 (declaração de convenção) |

### 1.8 Hub Docs LGPD (`/Docs`)
- Aviso de privacidade (PO-026_04/PO-027_04/PO-029_05, DPO dpo-br@atento.com.br), política de privacidade, termos, base legal, RIPD, linha de resposta a incidentes, governança, baseline de segurança, fluxo de dados.
- Rodapé "Última validação" lido de `Docs/docs-revision.json` por `Docs/doc-revision.js` (carimbo regenerado a cada push no `main` pelo workflow `docs-automacao.yml`).

## 2. Regras de negócio consolidadas (máx. prioridade)

1. **PDF oficial é inviolável:** o arquivo em disco nunca é alterado; tudo é desenhado por cima na memória e baixado (RF-30).
2. **Dados permanecem no dispositivo:** nenhum formulário envia dados a servidor; persistência = `localStorage` (rascunho TTL 24 h) + `sessionStorage` (sessão de acesso); sem cookies de rastreamento.
3. **Chave de acesso uma única vez por aba** para o grupo de formulários; `/admin` exige fator duplo e código próprios.
4. **LGPD modais obrigatórias:** confirmação antes de exportar; decisão sobre o rascunho na primeira visita com rascunho e após cada geração de PDF.
5. **Coordenadas em pontos PDF, origem inferior esquerda** (convenção pdf-lib); os JSONs `*_campos.json` são a única fonte de geometria.
6. **Derivação sincronizada:** se a versão da chave de rascunho de uma página muda, o bloco `RascunhoTTL.init(...)` precisa acompanhar (travado pela suíte, teste 18).
7. **Chave do catálogo `FICHA SAFO` ↔ arquivo físico `FICHA SA_FO.pdf`** precisa bater nas pontas em `assistencia_medica.html` e `admin/panel.js` (teste 14.6b).
8. **Log de incluição no PDF da assistência (Outros Planos)**: metadados + IP + data/hora com a assinatura (RF-23).

## 3. Fora de escopo atual (sem vestígios no código)

Envio por e-mail, ATS/ERP, assinatura ICP-Brasil, multi-idioma, exercício de direitos do titular na ferramenta (canalizado pelo DPO corporativo) e qualquer automação de submissão.

## 4. Versionamento e governança

SemVer com tags `v0.1.0` → `v1.0.0`; branch única `main` com histórico linear; Conventional Commits com escopos `forms`, `pdf`, `admin`, `security`, `ui`, `embedded`; CI obrigatório antes do merge; a proteção formal de branch ainda não foi aplicada (procedimento descrito em MANUTENCAO §11.1).
