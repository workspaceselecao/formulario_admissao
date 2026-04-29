# Plano de resposta a incidentes de segurança e privacidade

**Objetivo:** orientar deteção, contenção, erradicação e recuperação de incidentes relacionados com a solução de formulários web e dados tratados no âmbito dos fluxos institucionais.

---

## 1. Âmbito

Inclui:

- Comprometimento ou adulteração do site estático / repositório;
- Divulgação indevida de PDFs ou dados sob custódia de utilizadores (orientação de reporte);
- Falhas de hospedagem ou CDN que afetem disponibilidade ou integridade.

---

## 2. Classificação inicial

| Gravidade | Critérios exemplo |
|-----------|-------------------|
| Alta | Alteração maliciosa do bundle servido aos utilizadores |
| Média | Indisponibilidade prolongada |
| Baixa | Incidente limitado sem impacto em dados |

---

## 3. Fluxo de resposta (resumo)

1. **Detetar e registar** — canal interno de segurança / SOC se aplicável.  
2. **Contenção** — desativar deploy comprometido, reverter commit, invalidar cache se necessário.  
3. **Investigação** — alcance, tempo de exposição, evidências.  
4. **Erradicação e recuperação** — correções, novo deploy verificado.  
5. **Comunicação** — stakeholders internos; comunicação a titulares e ANPD conforme LGPD se aplicável (avaliação caso a caso com Jurídico/Privacidade).  
6. **Lições aprendidas** — atualização de baseline e controlos.

---

## 4. Responsáveis

| Papel | Ação |
|-------|------|
| Encarregado (DPO) | Avaliar obrigações de comunicação à ANPD e titulares |
| Segurança da Informação | Coordenação técnica |
| TI | Infraestrutura e reversão de deploy |

---

## 5. Contactos

[Preencher números internos e escalamento 24x7 se existir.]

---

## 6. Relação com LGPD

Incidentes que envolvam dados pessoais devem ser tratados em articulação com o processo de gestão de incidentes de dados da organização e registo obrigatório quando aplicável.

---

## 7. Testes e simulacros

[Periodicidade sugerida para tabletop exercises — definir.]
