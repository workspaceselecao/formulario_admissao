# Baseline de segurança da aplicação

**Objetivo:** definir o nível mínimo de controlos aplicável ao conjunto de formulários web estáticos e à sua cadeia de entrega.

---

## 1. Princípios

- **Confidencialidade:** não expor dados preenchidos além do controlo do utilizador e dos fluxos institucionais definidos.
- **Integridade:** preservar o código servido e os artefactos estáticos contra alterações não autorizadas.
- **Disponibilidade:** manter a página acessível dentro dos SLAs da hospedagem.

---

## 2. Arquitetura relevante

- Aplicação predominantemente **client-side** para preenchimento e geração de PDF.
- Sem backend obrigatório desta app para conclusão do PDF.

---

## 3. Controles técnicos recomendados

| Área | Medida |
|------|--------|
| Transporte | HTTPS obrigatório em produção |
| Conteúdo estático | Integridade de deploy (CI/CD, revisão de PRs, permissões de repositório) |
| Dependências | Inventário e atualização periódica de bibliotecas JS utilizadas |
| Segredos | Não embutir credenciais ou chaves no frontend |

---

## 4. Dados sensíveis no navegador

- Evitar persistência desnecessária; onde existir rascunho local, documentar finalidade e ciclo de vida (ver `data-flow.md`).
- Orientar o utilizador sobre partilha de equipamentos.

---

## 5. Logging

- Não registar no código campos de formulário completos em consola ou telemetria inadvertida.
- Logs de infraestrutura (CDN/WAF) sem payload de corpo de formulário quando aplicável.

---

## 6. Gestão de vulnerabilidades

- Monitorização de CVE em dependências front-end.
- Processo de correção alinhado ao `incident-response.md`.

---

## 7. Papéis e responsabilidades

| Função | Responsabilidade |
|--------|------------------|
| TI / DevOps | Pipeline, HTTPS, permissões |
| Segurança da Informação | Baseline, exceções aprovadas |
| Privacidade | Alinhamento LGPD com medidas técnicas |

---

## 8. Revisão

Revisar esta baseline quando houver mudança relevante de hospedagem, bibliotecas ou fluxo de dados.
