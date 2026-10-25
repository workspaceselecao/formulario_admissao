# Resumo executivo — Auditoria do Hub de Recrutamento & Seleção (Formulários de Admissão)

**Data:** 25/10/2026 · **Escopo:** auditoria somente-leitura · **Método:** inspeção do repositório, rastreamento de fluxos no código e execução da suíte de testes local (nenhum código alterado, nenhuma dependência instalada).

---

## 1. O produto em uma frase

Aplicação **web estática** (sem backend em produção) por meio da qual candidato/RH preenchem formulários de admissão no navegador e **geram PDFs preenchidos sobre os documentos oficiais corporativos** — Ficha Cadastral F-075 (PR-011), Assistência Médica F-089 (PR-090), Declaração de Plano de Saúde e Carta de Abertura de Conta Salário Bradesco — com assinatura manuscrita em canvas, evidência técnica (documento, data/hora, IP) carimbada no rodapé e todos os dados de formulário **restritos ao dispositivo do usuário** (LGPD por desenho).

## 2. Problema de negócio atendido

- Elimina o preenchimento manual em papel/impressão: PDF oficial sai idêntico ao modelo, já preenchido e assinado.
- Reduz fricção do candidato (mobile-friendly, rascunho retomável por 24 h, copiar dados entre formulários, CEP autopreenchido).
- Custo operacional mínimo: hospedagem estática em Vercel, sem banco de dados, sem servidor, sem variáveis de ambiente.
- Conformidade LGPD documentada publicamente (hub `/Docs`: aviso de privacidade PO-026/027/029, política, termos, base legal, RIPD).

## 3. Público e perfis

| Perfil | Uso | Acesso |
|---|---|---|
| **Candidato** | Preenche e gera os PDFs (desktop ou mobile) | Chave episódica de acesso (família de 5 códigos `ATN-…`) — proteção client-side |
| **RH / operações** | Orienta links, valida PDFs, baixa modelos em branco | Mesmas chaves |
| **Administrador do painel** | Configura coordenadas, cidades, templates PDF; publica JSONs no repositório | Dois fatores client-side: e-mail exatamente `@atento.com` + código exclusivo do painel |
| **Técnico/manutenção** | Re-medir coordenadas, reextrair templates, CI/deploy | Git |

## 4. Funcionalidades principais (verificadas em código)

1. **Ficha Cadastral F-075:** fluxo progressivo por etapas, dependentes dinâmicos, vale-transporte, seleção bancária Bradesco/Next/Santander, gate "Conta Salário — Ainda vou abrir" que interrompe a geração e redireciona para a Carta; geração via **engine embarcada própria** (`EmbeddedDocs.gerarPdf`) sobre `template.json` declarativo (fonte definitiva, mesma engine do painel).
2. **Assistência Médica F-089:** dois fluxos — Plano de Benefícios (só assinatura na pág. 2 da declaração) e Outros Planos (ficha regional por UF/cidade).
3. **Carta Bradesco:** geração do zero com timbrado, cargos/tab groups (`carta_bradesco_cargos.js`), autopreenchimento a partir da Ficha, CEP por ViaCEP.
4. **Painel administrativo `/admin`:** overlay sobre os JSONs de coordenadas (nunca os edita diretamente), editor visual sobre o PDF, Field Builder, cidades, upload/versionamento de templates com rollback, exportação "formato original + overlay aplicado", histórico append-only.
5. **Hub Docs LGPD** e carimbos automáticos de revisão jurídica a cada push no `main` (GitHub Actions bot).

## 5. Arquitetura em 4 linhas

- **Front-end:** HTML5/CSS3/JS vanilla (ES2020+, zero frameworks), ~10,7 mil linhas inline nas 4 páginas + painel.
- **PDF:** `pdf-lib@1.17.1` via CDN com SRI; engine declarativa `embedded-docs.js` (template JSON + assets PNG extraídos do documento oficial + subsets de fonte de 17–20 KB → PDF de ~117 KB).
- **"Backend":** nenhum em produção. Em dev, `scripts/test-server.mjs` emula rotas e expõe `API /api/admin/*` local (grava em `data/`, gitignored). O painel detecta o modo automaticamente (API ↔ exportação).
- **Autenticação:** guardas client-side derivadas (salt + SHA-256 + transformações), códigos reais nunca versionados.

## 6. Qualidade e infraestrutura

- **Suíte local re-executada nesta auditoria: 498 testes passaram, 0 falharam** (`node scripts/run-test.mjs`, exit 0).
- **CI:** GitHub Actions (Node 22) — sintaxe JS, estrutura/JSONs, suíte completa em todo push/PR.
- **Bot de docs:** workflow `docs-automacao.yml` regenera e commita carimbo de revisão jurídica e histórico de versões a cada push no `main` (commit `[skip ci]`, com retentativas).
- **Deploy:** Vercel, preset Other, sem build step; rotas/headers geridos por `vercel.json` (CSP com allowlist de integrações, HSTS, COOP/COEP, Permissions-Policy restritiva).

## 7. Constatações principais

| # | Constatação | Status |
|---|---|---|
| 1 | Arquitetura estática sem backend, sem banco, sem variáveis de ambiente — como documentado | ✅ Verificada |
| 2 | Dados de formulário apenas no dispositivo; rascunho TTL 24 h sem retenção indefinida; copys LGPD alinhadas ao aviso publicado | ✅ Verificada |
| 3 | Autenticação client-side é **decisão documentada do projeto**, não substitui server-side — conteúdo protegido é entregue ao navegador e um usuário avançado pode contornar a guarda | ✅ Verificada (limitação declarada no próprio código) |
| 4 | Segredos não versionados: `keys*.txt` e `data/` gitignored; apenas verificadores derivados no código | ✅ Verificada |
| 5 | Persistência do painel em produção é **manual** (exportar → commit → deploy) — não há gravacao central de configurações em produção | ✅ Verificada (limitação por design) |
| 6 | Sem telemetria/analytics/observabilidade — falhas de API surfacem via toasts | ✅ Verificada (mesma ausência que facilita a privacidade, dificulta diagnóstico em produção) |

## 8. Principais riscos e recomendações (detalhe na matriz)

1. **Proteção de branch ausente no `main`** — qualquer push direto publica (limitação operacional já documentada; CI é o único portão).
2. **Dependências externas via CDN** (unpkg, Google Fonts) em rede corporativa restritiva podem indisponibilizar geração de PDF — mitigável hospedando assets no domínio.
3. **Número mágico do gate de tamanho:** o PDF embarcado (~117 KB) cabe no limite de 248 KB de anexo; re-geração de fontes com TTF completo volta o PDF a ~2,7 MB sem falha automática durante o CI — recomenda-se teste de tamanho na suíte.
4. **Higiene local:** pastas de trabalho `.kilo/worktrees/`, `.tmp_render`, `.tmp_viz` e `scratch_*.json` existem no disco mas estão ignoradas pelo Git (nenhuma vazou para o repositório).

## 9. Documentos desta auditoria

| Documento | Conteúdo |
|---|---|
| [prd-retrospectivo.md](prd-retrospectivo.md) | PRD retrospectivo — funcionalidades e regras de negócio existentes |
| [docs-tecnico.md](docs-tecnico.md) | Técnica de front-end e do "back-end" (guards, engine, API local, painel) |
| [inventario.md](inventario.md) | Inventário de telas, endpoints, entidades, integrações e chaves de storage |
| [arquitetura-e-fluxos.md](arquitetura-e-fluxos.md) | Diagramas (Mermaid) de arquitetura e fluxos ponta a ponta |
| [constatacoes-matriz.md](constatacoes-matriz.md) | Matriz verificada/inferida/não confirmada + débitos + referências de código |

## 10. Pendências que exigem confirmação humana

- Status do CI no GitHub (runs lá na nuvem) e estado do deploy na Vercel — não verificáveis 100% offline; local está verde e o `vercel.json` é a fonte de verdade versionada.
- Política real de expiração/rotação das chaves corporativas `ATN-…` (conteúdo de `keys-testes.txt` foi deliberadamente não lido) — administrativo, fora do escopo técnico.
