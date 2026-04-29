# Fluxo de Dados

Este documento descreve o fluxo de dados da ferramenta de formulários e PDF **na perspetiva técnica**, alinhado ao modelo corporativo e complementado com o comportamento das versões que disponibilizam rascunho local.

---

## Entrada

Usuário insere dados manualmente nos formulários HTML servidos estaticamente.

---

## Processamento

- Processamento ocorre exclusivamente no navegador.
- Dados mantidos em **memória (RAM)** durante a sessão de preenchimento e geração do PDF.

**Modelo corporativo original (minimização máxima):** ausência de uso de `localStorage`, `sessionStorage` ou `IndexedDB` para dados pessoais — estado puramente efémero.

**Versões implantadas com recurso de rascunho:** pode existir uso **controlado** de `localStorage` (ou equivalente) **apenas** para permitir retomar o preenchimento no mesmo navegador/dispositivo, com:
- eliminação disponível via **Descartar rascunho**;
- finalidade limitada à conveniência do usuário até gerar o PDF ou descartar;
- **sem** envio desses dados ao servidor da aplicação para armazenamento remoto do formulário.

---

## Geração

- Biblioteca JavaScript gera o PDF localmente no dispositivo.

---

## Saída

- Download direto para o dispositivo do usuário.

---

## Descarte

- Dados removidos da memória de trabalho após a geração, **conforme** fluxos de UI e confirmações (ex.: modal LGPD).
- Rascunho local removido quando o usuário aciona **Descartar rascunho** ou quando a lógica da versão elimina após conclusão.

---

## Observação — O que não há (por desenho)

Não há, nos termos desta solução:

- Backend aplicacional obrigatório para guardar o formulário completo nos servidores desta app;
- API própria para receber os campos preenchidos para conclusão do PDF;
- Banco de dados central nesta aplicação para os dados digitados no formulário;
- Envio obrigatório dos dados do formulário para servidores para gerar o PDF;
- Logs de aplicação contendo **payload** de formulários com dados pessoais.

Infraestrutura de hospedagem/CDN pode gerar logs operacionais sem conteúdo do formulário — devem ser considerados no inventário de tratamentos quando aplicável.

---

## Diagrama (texto)

```
                    ┌─────────────────────┐
[Usuário] ────────► │ Formulário (browser)│ ──► [PDF local] ──► [Dispositivo]
                    └──────────┬──────────┘
                               │ opcional (versão com rascunho)
                               ▼
                    [ Rascunho só no navegador ]
```
