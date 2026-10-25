# Arquitetura e fluxos — auditória diagramada (25/10/2026)

Diagramas em Mermaid. Estado verificado no repositório; não descreve nada além do que existe.

---

## 1. Diagrama de arquitetura atual

```mermaid
flowchart LR
    subgraph Cliente["Navegador do usuário"]
        UI["Páginas estáticas<br/>ficha / assistência / carta / home"]
        GUARD["guard.js — chave ATN-…<br/>sessão sessionStorage"]
        TTL["rascunho-ttl.js | TTL 24h"]
        ENGINE["embedded-docs.js<br/>template.json + schema + dados"]
        PANEL["painel /admin<br/>admin-guard.js"]
    end

    subgraph Edge["Vercel — site estático"]
        STATIC["arquivos do repo<br/>vercel.json: rotas/headers"]
    end

    subgraph Dados["Dados versionados no Git"]
        JSONS["*_campos.json · cidades*.json<br/>template.json · docs-revision.json"]
        PDFS["PDFs modelo oficiais"]
        SUBSET["assets/*-sub.ttf"]
    end

    subgraph Externos["Serviços externos (HTTPS)"]
        CEP["ViaCEP / BrasilAPI"]
        CID["kstrtech cidades"]
        IP["ipify"]
        CDN["unpkg.com<br/>pdf-lib · fontkit · pdf.js"]
        GFONTS["Google Fonts"]
    end

    subgraph DevOps["CI/CD (GitHub Actions)"]
        CI["ci.yml — Node 22<br/>check + suíte 498"]
        BOT["docs-automation.yml<br/>carimbo jurídico automático"]
    end

    subgraph Dev["Somente desenvolvimento"]
        API["test-server.mjs<br/>/api/admin/* → data/"]
    end

    UI --> GUARD --> ENGINE
    UI --> TTL
    UI --> CEP & CID & IP & CDN & GFONTS
    ENGINE --> JSONS & SUBSET & PDFS
    STATIC --> UI
    PANEL --> API
    PANEL --> CDN & JSONS
    CI --> BOT --> JSONS
```

**Leitura:** o cliente concentra 100% da lógica de dados; a edge (Vercel) só entrega arquivos e headers; a única escrita server-side do produto é do servidor **local** de dev em `data/`.

---

## 2. Fluxo A — Autenticação e sessão entre formulários

```mermaid
sequenceDiagram
    actor U as Usuário
    participant P as Página protegida (f075/f089/bradesco)
    participant G as guard.js
    participant ST as sessionStorage

    U->>P: abre rota protegida
    P->>G: isProtected(path) ✔
    G->>ST: lê atf_t/atf_x/atf_g
    alt sessão válida e grupo liberado
        G->>P: revela conteúdo + iniciarVigencia()
        Note right of G: atividade prolonga 60 min (throttle 60 s)
    else sem sessão
        G->>U: tela de chave (overlay #af)
        U->>G: digita ATN-… e valida
        G->>G: SHA-256(salt‖chave)+transformações × 5 pares
        alt confere ≡ algum verifier
            G->>ST: grava atf_t (token 32B), atf_x (+60 min), atf_p, atf_g=1
            G->>P: revela + iniciarVigencia()
            Note right of G: faltando ≤10 min: banner "Continuar sessão / Encerrar agora"
        else não confere
            G->>U: "✕ Chave inválida" (foco no campo)
        end
    end
```

Falha tratada: expiração real → `encerrarSessaoPorExpiracao()` limpa as 4 chaves e recarrega (tela de chave volta). Navegação entre f075↔f089↔bradesco **não** repete a chave (`atf_g` cobre o grupo; `atf_p` mantém compatibilidade com sessões antigas).

---

## 3. Fluxo B — Ficha Cadastral → PDF (caminho feliz)

```mermaid
sequenceDiagram
    actor U
    participant FC as ficha_cadastral.html
    participant EXT as ViaCEP → BrasilAPI · ipify
    participant ED as EmbeddedDocs (engine)
    participant CDN as pdf-lib@1.17.1 (unpkg)
    participant ARQ as template.json + campos + assets (mesmo domínio)

    U->>FC: carrega (sessão já válida)
    FC->>ARQ: fetch JSONs/assets com cache:no-store
    ED->>FC: validarTemplate(template, schema) ✔
    U->>FC: preenche (dependentes, banco, VT…)
    FC->>EXT: CEP → autopreenche endereço (fallback BrasilAPI)
    U->>FC: confirma modal LGPD
    FC->>EXT: IP público (evidência) com timeout
    FC->>FC: validarCamposObrigatorios() → gate Conta Salário
    alt pendência "Ainda vou abrir" sem agência/conta
        FC->>U: modal obrigatória → Preencher Carta (rascunho 24 h) → carta_bradesco
    else ok
        FC->>ED: gerarPdf(template, schema, montarDadosFicha())
        ED->>CDN: desenha camadas/dados sobre o template (em memória)
        ED->>FC: bytes ~117 KB
        FC->>U: download + registro do rascunho (TTL 24 h)
    end
```

Tratamentos de falha: template/schema ausentes → toast e geração bloqueada; LGPD cancelado → nada é gerado; rascunho expira com a página aberta → modal + limpeza do formulário no vencimento.

---

## 4. Fluxo C — Assistência Médica (ramificação)

```mermaid
flowchart TD
    A[Abre /f089] --> B{Plano?}
    B -- Plano de Benefícios --> C[Somente assinatura<br/>DECLARACAO PLANO DE SAUDE.pdf<br/>assinatura na pág. 2]
    B -- Outros Planos --> D{Variante?}
    D -- Infinity --> E[lê cidades_infinity.json<br/>UF incluída]
    D -- Outros --> F[lê cidades_brasil.json]
    E --> G[UF → kstrtech /cidades/UF]
    F --> G
    G --> H[cidade selecionada →<br/>resolverArquivoPdfPorCidadeNome<br/>chave FICHA SAFO → FICHA SA_FO.pdf]
    H --> I[formulário + dependentes<br/>não optante omite dependentes no PDF]
    I --> J[assinatura + evidência IP]
    J --> K[EmbeddedDocs.gerarPdf<br/>+ rubrica PNG + marca d'água VT]
    C --> L[LGPD → PDF]
    K --> L
```

Dependência crítica: nome da cidade tem de bater entre o JSON da lista e `FICHA_UTILIZAR_PARA_ARQUIVO` nas duas pontas (app e painel); divergência = cidade sem template.

---

## 5. Fluxo D — Carta Bradesco

```mermaid
sequenceDiagram
    actor U
    participant CB as carta_bradesco.html
    participant FC as Ficha (localStorage prefill)
    participant VIA as ViaCEP
    participant PDF as pdf-lib

    U->>CB: abre (via ficha ou direto)
    CB->>FC: aplicarPrefillFichaCadastral() (payload de consumo único)
    CB->>VIA: CEP → rua/bairro
    U->>CB: grupo/cargo (carta_bradesco_cargos.js), salário (moeda)
    U->>CB: LGPD confirmado
    CB->>PDF: gerarPdfCartaBytes — desenha timbrado, logo, carimbo e parágrafos run-a-run
    CB->>U: download da carta
```

---

## 6. Fluxo E — Configuração (painel → aplicação pública)

```mermaid
sequenceDiagram
    actor A as Administrador
    participant AD as /admin (painel)
    participant DET as persistence.js detectMode()
    participant API as test-server.mjs (dev)
    participant REPO as JSONs/PDFs do repo
    participant VER as Vercel

    A->>AD: valida e-mail @atento.com + código exclusivo (CG)
    AD->>DET: sonda GET /api/admin/historico
    alt JSON ⇒ modo API (dev)
        AD->>API: PUT config (backup auto), POST upload (PDF assinatura/tamanho), POST historico
    else 404/HTML ⇒ modo exportação
        AD->>AD: sessão do navegador; Exportar JSON / Exportar arquivos do repo
    end
    AD->>AD: Editar overlay (Field Builder, editor visual, cidades)<br/>validarDocCampos no gate
    A->>REPO: substitui JSONs exportados (bit-a-bit = base + overlay)
    A->>VER: commit/push → deploy automático
    Note over A,VER: app pública lê os JSONs do repo — painel nunca lhes escreve direto
```

---

## 7. Fluxo F — Ciclo de docs LGPD (automático)

```mermaid
flowchart LR
    push["push no main"] --> CI["ci.yml: síntese + suíte (498)"]
    push --> BOT["docs-automation.yml"]
    BOT --> R1["docs-revision.json (carimbo)"]
    BOT --> R2["historico-versionamento.md"]
    R1 --> COMMIT["commit [skip ci] — sem loop"]
    R2 --> COMMIT
    COMMIT --> VER["Vercel redeploy"]
```

---

## 8. Fluxo G — Rascunho (TTL/decisão LGPD)

```mermaid
stateDiagram-v2
    [*] --> SemDecisao : rascunho gravado (savedAt)
    SemDecisao --> Apagar : usuário escolhe "Apagar agora"
    SemDecisao --> Manter : "Manter 24 h" (ou ESC/fundo)
    Manter --> Expirado : passa o TTL após último salvamento
    Expirado --> Limpo : limpa rascunho + formulário
    Apagar --> Limpo
    Limpo --> [*]
```
