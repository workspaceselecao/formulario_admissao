# Hub de Recrutamento & Seleção — Formulários de Admissão

Aplicação **estática** (sem backend) que gera documentos oficiais de admissão preenchidos em PDF diretamente no navegador: Ficha Cadastral F-075 (PR-011), Assistência Médica F-089 (PR-090), Carta de Abertura de Conta Salário Bradesco e Termos de Aceite (BA/SP), com assinatura manuscrita, evidências técnicas de assinatura e painel administrativo de configuração.

Deploy de referência: **Vercel** (site estático). Sem banco de dados — os PDFs são preenchidos sobre os modelos oficiais por coordenadas em pontos PDF (origem no canto inferior esquerdo, convenção do [pdf-lib](https://github.com/Hopding/pdf-lib)).

---

## ✨ Funcionalidades

- **Ficha Cadastral F-075** — preenchimento completo, dependentes dinâmicos, vale-transporte, seleção bancária (Bradesco/Next/Santander), fluxo progressivo por etapas.
- **Assistência Médica F-089** — template PDF por região/UF, planos por região, cidades via JSON estático, dependentes/filhos 2–4.
- **Carta Bradesco** — geração do zero a partir do modelo timbrado, cargos TB-047_09, autopreenchimento a partir da Ficha Cadastral, busca de endereço por CEP.
- **Termos de Aceite** — sobreposição de dados no modelo PDF por região (BA/SP), RE/RG, data por extenso, "Não assinar".
- **Assinatura manuscrita** — canvas com PNG transparente, linha-guia, evidência técnica carimbada no PDF (documento, IP, fuso).
- **Rascunho com descarte automático (LGPD)** — retomada do preenchimento no mesmo dispositivo, com **expiração automática 24 horas após o último salvamento** (sem retenção indefinida) e modal de decisão sobre o descarte.
- **Autenticação por chaves de acesso** — derivadas (SHA-256 + salt), sessão com expiração; painel administrativo com códigos exclusivos apartados.
- **Painel Administrativo** — CRUD de cidades e templates PDF, editor visual de coordenadas, Field Builder, diff/histórico, exportação/importação.
- **Hub Docs (LGPD)** — aviso de privacidade corporativo (PO-026/027/029), política de privacidade, termos, base legal, RIPD e revisão jurídica versionada.
- **Home central** — navegação entre formulários, modal de instruções, identidade Gradiente+Tangerina.

## 🧱 Stack

| Camada | Tecnologia |
|---|---|
| Front-end | HTML5, CSS3, JavaScript (ES2020+, sem framework) |
| Geração de PDF | [pdf-lib](https://github.com/Hopding/pdf-lib) via CDN (com SRI), pdf.js (worker em blob) |
| APIs externas | ViaCEP, Brasil API, IBGE (cidades), ipify, kstrtech (municípios) |
| Infra | [Vercel](https://vercel.com) (headers de segurança, redirects e rewrites em `vercel.json`) |
| Qualidade | GitHub Actions (CI mínimo), suíte `scripts/run-test.mjs` |

## 🗺️ Rotas (vercel.json)

| Rota | Página |
|---|---|
| `/` | Home do hub (`index.html`) |
| `/f075` | Ficha Cadastral |
| `/f089` | Assistência Médica |
| `/bradesco` | Carta Bradesco |
| `/termos` | Termos de Aceite |
| `/admin` | Painel Administrativo |
| `/aviso-de-privacidade`, `/politica-de-privacidade`, `/termos-de-uso`, `/privacidade-e-seguranca` | Hub Docs |

## 📁 Estrutura

```text
index.html                     Home do hub
ficha_cadastral.html + .json   F-075 + coordenadas dos campos
assistencia_medica.html + .json F-089 + coordenadas
carta_bradesco.html + .js      Carta Bradesco + cargos
termos_aceite.html             Termos de Aceite
embedded-docs.js               Engine de geração embarcada (POC v38, fidelidade ≥ 99,5%)
guard.js / admin-guard.js      Autenticação por chaves derivadas (pública e admin)
rascunho-ttl.js                Descarte automático de rascunhos (TTL 24 h + modal LGPD)
admin/                         Painel administrativo (HTML/CSS/JS)
Docs/                          Hub LGPD (HTML, revisão jurídica, doc-revision)
scripts/                       Utilitários, servidor de testes e suíte run-test.mjs
F-075_38 ... .pdf             Modelo oficial da ficha (template canônico v38)
FICHA *.pdf                    Templates regionais (Outros Planos)
vercel.json                    Headers de segurança, redirects e rewrites
```

## 🚀 Instalação e uso local

Requisitos: [Node.js ≥ 18](https://nodejs.org) (para servidor de testes e CI).

```bash
git clone https://github.com/workspaceselecao/formulario_admissao.git
cd formulario_admissao
npm install            # instala pdf-lib (devDependency usada pelos scripts locais)
npm test               # suíte de rotas, proteção e privacidade (scripts/run-test.mjs)
```

Abrir `index.html` diretamente também funciona para inspeção rápida; para o comportamento completo (rotas curtas e guard), use um servidor estático.

## ⚙️ Configuração

- **Variáveis de ambiente:** nenhuma obrigatória. Não há backend nem chaves de serviço.
- **Coordenadas:** os JSONs `*_campos.json` mapeiam campo → (x, y, largura, altura) por template; o editor visual do painel administrativo gera overlay sem alterar os JSONs originais.
- **Códigos de acesso:** gerados por `scripts/generate-admin-verifiers.mjs`/`generate-verifiers.mjs` (não versionados); apenas verificadores derivados (SHA-256 + salt) vivem no código.
- **Servidor de testes do painel:** `node scripts/test-server.mjs` (modo API local com backups em `data/`, ignorado pelo Git).

## 🔒 Segurança

- **Headers** (`vercel.json`): CSP com SRI, HSTS, X-Frame-Options DENY, COOP/COEP require-corp, CORP same-origin, Permissions-Policy restritiva, X-Permitted-Cross-Domain-Policies.
- **Autenticação client-side** (decisão de projeto documentada): os formulários e o painel usam chaves com verificadores derivados (SHA-256 + salt + transformações); códigos reais **nunca** estão no código-fonte. Sessão em `sessionStorage` com expiração de 60 min (painel). Não é substituto de autenticação server-side.
- **LGPD**: hub Docs público com aviso de privacidade corporativo (PO-026/027/029), política de privacidade, termos de uso, base legal, RIPD e carimbo de revisão jurídica derivado do Git (`Docs/docs-revision.json`, atualizado por `scripts/atualizar-docs-revision.mjs`). Rascunhos locais expiram automaticamente 24 horas após o último salvamento (`rascunho-ttl.js`), sem retenção indefinida.

## ☁️ Deploy (Vercel)

1. Importe o repositório em [vercel.com/new](https://vercel.com/new) (preset **Other**, detecção automática).
2. O deploy usa apenas `vercel.json` — sem build step.
3. `main` é a Production Branch; qualquer push dispara deploy automático.
4. Rotas, headers e redirects são geridos pelo `vercel.json` versionado.

## 🔁 Fluxo de desenvolvimento

- Branches temporárias por tipo de mudança: `feat/*`, `fix/*`, `refactor/*`, `security/*`, `chore/*`, `docs/*`.
- `main` mantém **histórico linear**: preferir **Squash and merge** em PRs de mudança única; **Rebase and merge** quando os commits individuais tiverem valor histórico.
- Conventional Commits (`feat`, `fix`, `refactor`, `security`, `docs`, `style`, `test`, `build`, `ci`, `chore`, `perf`) com escopo do módulo (`forms`, `pdf`, `admin`, `security`, `ui`, `embedded`, ...).
- CI obrigatório antes do merge: verificação estrutural, sintaxe JS e suíte `scripts/run-test.mjs`.

## 🏷️ Versionamento

[Semantic Versioning](https://semver.org/lang/pt-BR/) com tags `vMAIOR.MENOR.PATCH`:

- `v0.1.0` — marco 1.0 funcional legado (F-075 + F-089 regionais operacionais, jul/2026).
- `v1.0.0` — plataforma completa: 4 documentos, painel administrativo, engine embarcada v38, hardening de segurança e hub LGPD.

## 📚 Documentação complementar

- [MANUTENCAO.md](MANUTENCAO.md) — guia de manutenção (cidades, templates, coordenadas, APIs, checklists).
- [PRD.md](PRD.md) — documento de requisitos do produto.
- [Docs/](Docs/index.html) — hub público LGPD (privacidade, termos, RIPD, resposta a incidentes).
