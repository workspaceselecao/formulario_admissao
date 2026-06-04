# PRD — Site de Formulários de Admissão (HTML → PDF)

**Versão do documento:** 1.0  
**Data:** 26 de abril de 2026  
**Produto:** Formulários de admissão Atento (Ficha Cadastral e Assistência Médica)  
**Repositório:** [workspaceselecao/formulario_admissao](https://github.com/workspaceselecao/formulario_admissao)

---

## 1. Resumo executivo

O site é uma **aplicação web estática** que permite ao candidato ou ao RH preencher dois formulários oficiais de admissão no navegador e **gerar o PDF preenchido** sobre os modelos corporativos (F-075 e F-089), sem servidor de aplicação nem base de dados. Os dados e o **rascunho local opcional** permanecem no dispositivo também após gerar o PDF até o usuário acionar **Descartar rascunho** (ou limpar o armazenamento do navegador); a modal LGPD comunica esse comportamento.

**Proposta de valor:** reduzir fricção no preenchimento, manter aderência aos PDFs oficiais, operar com custo baixo (hospedagem estática) e privacidade por desenho (processamento no cliente).

---

## 2. Objetivos do produto

| Objetivo | Indicador sugerido |
|----------|-------------------|
| Permitir conclusão do preenchimento e download do PDF sem instalação de software | Taxa de conclusão até “download iniciado” (se instrumentado) |
| Garantir correspondência visual com os templates oficiais | Zero desvios não documentados em revisão de amostras |
| Minimizar perda de dados durante o preenchimento | Uso de rascunho em `localStorage` + recuperação ao reabrir |
| Cumprir expectativa de privacidade e gestão dos dados locais | Rascunho em `localStorage` + recuperação ao reabrir + descarte apenas por **Descartar rascunho** (mensagens LGPD antes de exportar) |
| Funcionar em desktop e mobile (incluindo assinatura e teclado) | Testes manuais / dispositivos reais nas principais combinações SO+navegador |

---

## 3. Público-alvo e personas

- **Candidato (operacional ou administrativo):** preenche a ficha cadastral e/ou a adesão à assistência médica; pode usar celular ou computador.
- **RH / operações:** orienta o link, valida PDFs gerados, pode precisar de modelo em branco ou de consistência entre cidade e tipo de ficha (assistência).
- **Manutenção técnica:** atualiza coordenadas JSON, PDFs oficiais, `cidades_brasil.json` e deploy (ver `MANUTENCAO.md`).

---

## 4. Escopo

### 4.1 Dentro do escopo (MVP atual)

- **Home** (`index.html`): escolha entre Ficha Cadastral e Assistência Médica.
- **Ficha cadastral** (F-075 / PR-011, revisão conforme subtítulo no site): um único template PDF; campos de dados pessoais, endereço, conta (incl. Bradesco / Mentore), dependentes, benefícios, transporte, vale refeição, declaração com **assinatura em canvas** exportada para o PDF.
- **Assistência médica** (F-089 / PR-090): tipo de movimentação (optante / não optante), dados do funcionário, endereço, dependentes modulares (cônjuge/filhos), assinatura; **seleção de UF e cidade** com lista via API de municípios; **template PDF único** (`DECLARACAO PLANO DE SAUDE.pdf`) para qualquer cidade; evidência no documento (metadados, data/hora, fuso, IP via serviço externo).
- **Geração de PDF no cliente** com [pdf-lib](https://github.com/Hopding/pdf-lib) (CDN); coordenadas em `*_campos.json`.
- **CEP:** ViaCEP (e fallback Brasil API na ficha, conforme implementação).
- **Rascunho** por formulário em `localStorage` (chaves versionadas).
- **Cópia de dados** da ficha para a assistência (payload em `localStorage`, fluxo com modal e opção de não perguntar novamente).
- **LGPD:** modal antes de exportar; **Descartar rascunho** apaga formulário + rascunho local quando o utilizador escolher.
- **UX mobile:** cabeçalho recolhível ao scroll (retrato e paisagem em dispositivos touch), layout responsivo.
- **Deploy:** Vercel (`vercel.json`), site estático.

### 4.2 Fora do escopo (explícito)

- Backend, autenticação, perfis de usuário, armazenamento centralizado de submissões.
- Envio automático por e-mail ou integração com ATS/ERP.
- Assinatura eletrônica qualificada (ICP-Brasil) ou carimbo de tempo.
- Multi-idioma (pt-BR apenas).
- Garantias legais além do fluxo LGPD implementado (política de privacidade separada no site não descrita neste repositório como página).

---

## 5. Requisitos funcionais

### 5.1 Navegação e estrutura

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-01 | O utilizador deve aceder à home e escolher um dos dois formulários | Must |
| RF-02 | Cada formulário deve exibir identificação do documento (códigos F/PR) e link “Início” | Must |
| RF-03 | O estado de rascunho deve ser indicado na UI (texto de rascunho + ação de descartar) | Should |

### 5.2 Ficha cadastral

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-10 | Validar campos obrigatórios e regras de negócio antes de gerar PDF (mensagens/toasts) | Must |
| RF-11 | Suportar máscaras e formatação (telefone, moeda, maiúsculas onde aplicável) | Must |
| RF-12 | Integrar CEP com preenchimento de endereço (ViaCEP + fallback) | Must |
| RF-13 | Dependentes dinâmicos até limite máximo definido no código | Must |
| RF-14 | Capturar assinatura desenhada e incluir no PDF | Must |
| RF-15 | Oferecer download opcional de carta Bradesco (`.docx`) quando aplicável ao fluxo de conta | Should |
| RF-16 | Após PDF gerado com sucesso: persistir rascunho local e manter o formulário preenchido até **Descartar rascunho** | Must |
| RF-17 | Opcional: sugerir cópia de dados para fluxo de Assistência Médica | Should |

### 5.3 Assistência médica

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-20 | Carregar lista de cidades por UF via API pública (todos os municípios da UF) | Must |
| RF-21 | Usar template PDF único `DECLARACAO PLANO DE SAUDE.pdf` independentemente da cidade/UF | Must |
| RF-22 | Omitir secção de dependentes no PDF para “não optante”, conforme regra de negócio | Must |
| RF-23 | Incluir assinatura e bloco de evidência (IP, data/hora, etc.) no PDF | Must |
| RF-24 | Permitir download de modelo em branco quando UF + cidade válidos | Should |
| RF-25 | Consumir payload copiado da ficha cadastral ao abrir, quando existir | Should |
| RF-26 | Rascunho versionado em `localStorage`; `change` para persistência imediata em mobile | Must |

### 5.4 PDF e artefactos

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-30 | Não alterar o ficheiro PDF no servidor; apenas desenhar por cima na memória e descarregar | Must |
| RF-31 | Nome de ficheiro exportado previsível e rastreável (padrão definido no código) | Should |
| RF-32 | Coordenadas alinhadas ao sistema de referência do pdf-lib (origem inferior esquerda) | Must |

### 5.5 Privacidade e consentimento

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-40 | Modal LGPD antes da exportação; cancelar interrompe a geração | Must |
| RF-41 | Dados só são apagados do formulário e do `localStorage` quando o utilizador aciona **Descartar rascunho** (ou limpa o navegador) | Must |
| RF-42 | Chaves `localStorage` documentadas; versão incrementada quando o schema de rascunho quebrar compatibilidade | Should |

---

## 6. Requisitos não funcionais

| ID | Categoria | Descrição |
|----|-----------|-----------|
| RNF-01 | Disponibilidade | Dependência de CDN (pdf-lib), APIs (CEP, cidades, IP) e hospedagem estática; falhas devem surfaced via UI (toasts) |
| RNF-02 | Performance | PDF gerado no cliente; templates carregados por pedido HTTP; evitar bloqueio prolongado da UI (async) |
| RNF-03 | Segurança | Sem credenciais no cliente; dados sensíveis em memória/`localStorage` até o utilizador descartar o rascunho ou limpar o armazenamento |
| RNF-04 | Compatibilidade | Navegadores modernos com ES modules / fetch / canvas; testar Safari iOS e Chrome Android |
| RNF-05 | Manutenibilidade | JSON de campos + `MANUTENCAO.md` como fonte de verdade operacional |
| RNF-06 | Acessibilidade | Melhor esforço: foco em modais, labels, contrastes; não há auditoria WCAG formal no escopo atual |

---

## 7. Fluxos de utilizador (alto nível)

### 7.1 Ficha cadastral → PDF

1. Entrada pela home → formulário.  
2. (Opcional) Restaurar rascunho automático.  
3. Preencher secções; progresso visual por secção onde implementado.  
4. Validar; corrigir erros destacados.  
5. Confirmar LGPD.  
6. Gerar PDF → download.  
7. Formulário e rascunho **permanecem** preenchidos (corrigir dados e gerar novamente sem recomeçar).  
8. (Opcional) Modal para copiar dados para Assistência Médica.

### 7.2 Assistência médica → PDF

1. Entrada pela home → formulário.  
2. Selecionar tipo de adesão.  
3. Escolher UF → cidade (lista restrita ao catálogo).  
4. Carregar template associado; preencher campos e dependentes se optante.  
5. Assinatura.  
6. LGPD → gerar PDF → download.  
7. Dados continuam na página até **Descartar rascunho** (mesmo comportamento na ficha).

### 7.3 Descarte de rascunho

Utilizador confirma descarte → estado local apagado e UI atualizada.

---

## 8. Dados e integrações externas

| Sistema | Uso |
|---------|-----|
| `unpkg.com` / pdf-lib | Biblioteca de manipulação PDF |
| ViaCEP | Endereço por CEP |
| Brasil API (`/api/cep/v1`) | Fallback CEP (ficha) |
| `api.kstrtech.com.br/cidades/{UF}` | Lista de municípios (assistência) |
| `api.ipify.org` | IP público (evidência no PDF — assistência) |

**Ficheiros de dados no repositório:** `ficha_cadastral_campos.json`, `assistencia_medica_campos.json`, `cidades_brasil.json`, PDFs modelo na raiz.

---

## 9. UX / UI

- Identidade visual: tipografia DM Sans / DM Mono, cor de destaque institucional (`#01426A`), cartões por secção.  
- **Mobile:** grelhas colapsam para uma coluna; inputs com `font-size` adequado em iOS onde necessário (ex.: selects UF/cidade 16px na assistência); cabeçalho com comportamento de recolha ao scroll e suporte a rotação (paisagem em touch).  
- Feedback: toasts para sucesso/erro; modais para LGPD e cópia entre formulários.

---

## 10. Métricas e instrumentação (recomendações)

O produto atual **não exige** analytics no PRD; para evolução:

- Eventos: `form_start`, `pdf_success`, `pdf_error`, `draft_restored`, `lgpd_confirm`, `lgpd_cancel`.  
- Taxa de erro por API (CEP, cidades) via logs agregados se no futuro existir proxy ou edge.

---

## 11. Riscos e dependências

| Risco | Mitigação |
|-------|-----------|
| Indisponibilidade da API de cidades ou mudança de contrato | Fallback documentado em `MANUTENCAO.md`; monitorização; cache offline futuro |
| CORS ou bloqueio de CDN em redes corporativas | Hospedar pdf-lib localmente ou via mesmo domínio |
| Divergência nome cidade API vs `cidades_brasil.json` | Normalização + ajuste manual do JSON |
| PDF oficial atualizado sem atualizar JSON | Checklist em `MANUTENCAO.md`; revisão visual pós-deploy |
| `localStorage` cheio ou privado | Mensagem clara ao utilizador; descarte de rascunho |

---

## 12. Roadmap sugerido (não comprometido)

1. **Curto prazo:** testes automatizados de fumo (carregar página, validar JSON); monitorização de links externos.  
2. **Médio prazo:** página de política de privacidade e cookies (se exigido pelo compliance).  
3. **Longo prazo:** opcional backend só para telemetria agregada ou fila de “submeter PDF” (fora do modelo atual).

---

## 13. Glossário

- **Template PDF:** ficheiro oficial não modificado em disco; o desenho é composto na exportação.  
- **Coordenadas:** retângulos em pontos PDF definidos no `*_campos.json`.  
- **Rascunho:** serialização local do estado do formulário; eliminação explícita com **Descartar rascunho** ou limpeza do navegador.  
- **LGPD (fluxo UI):** confirmação explícita antes de gerar o documento; texto alinhado à retenção local até descarte pelo utilizador.

---

## 14. Referências no repositório

- `README.md` — visão geral e lista de ficheiros.  
- `MANUTENCAO.md` — operações, APIs, chaves `localStorage`, checklists.  
- `vercel.json` — rewrites para deploy.

---

*Documento derivado do comportamento e da documentação existentes no repositório; alterações de código devem refletir-se neste PRD em revisões futuras.*
