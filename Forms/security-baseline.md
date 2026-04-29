# Baseline de Segurança

## Arquitetura

- Aplicação **100% client-side** para preenchimento e geração de PDF;
- **Zero persistência centralizada** dos dados do formulário em servidores desta solução;
- **Zero transmissão obrigatória** dos dados pessoais preenchidos para APIs/backend proprietário desta aplicação para conclusão do PDF.

**Nota:** versões com **rascunho local** utilizam armazenamento no navegador do usuário; não constitui backend remoto da aplicação. Política de uso desse recurso está em `privacy-policy.md` e `data-flow.md`.

---

## Medidas Implementadas

- **HTTPS** obrigatório em produção (transporte cifrado);
- Processamento local dos dados no fluxo de geração do PDF;
- Descarte de dados da sessão conforme fluxos da aplicação após geração do arquivo;
- Ausência de envio dos campos do formulário para armazenamento remoto nos termos da arquitetura descrita.

---

## Restrições Técnicas (desenvolvimento e operação)

- **Não** utilizar `localStorage` / `sessionStorage` para fins não documentados ou além do escopo de rascunho aprovado;
- **Proibido** registrar em logs de aplicação conteúdo de formulários com dados pessoais ou dados sensíveis;
- **Proibido** integrar esta camada com APIs externas para **envio** dos dados preenchidos sem avaliação de impacto, contrato e base legal;
- Controlo de alterações no repositório (pull requests revisados, permissões mínimas nos ambientes de CI/CD).

---

## Camada de Entrega

| Área | Expectativa |
|------|-------------|
| Repositório | Apenas pessoas autorizadas; branch protection quando aplicável |
| Build/deploy | Pipeline auditável; artefactos verificáveis |
| Dependências | Inventário das bibliotecas JS (PDF, etc.); plano de atualização por CVE |
| Hospedagem | HTTPS; eventual CDN/WAF conforme política corporativa |

---

## Risco Residual

**Baixo** no que respeita a exposição por armazenamento central nesta aplicação ou por transmissão obrigatória dos formulários para servidores da ferramenta — dados sob responsabilidade direta do usuário após download do PDF e, quando ativo, rascunho apenas local.

Riscos remanescentes incluem: uso de equipamento comprometido, partilha de sessão em terminal público, ou alteração maliciosa dos ficheiros estáticos servidos — mitigados por controles de CI/CD, HTTPS e resposta a incidentes (`incident-response.md`).

---

## Revisão

Revisar esta baseline quando houver mudança de hospedagem, dependências críticas ou novos fluxos de dados.
