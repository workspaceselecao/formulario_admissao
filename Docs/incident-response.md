# Plano de Resposta a Incidentes

Documento alinhado ao modelo corporativo de referência, estruturado para integração com Segurança da Informação e Privacidade (LGPD).

---

## 1. Possíveis incidentes (exemplos)

- **Integridade da aplicação:** alteração não autorizada dos ficheiros estáticos ou do repositório (supply chain / deploy);
- **Disponibilidade:** indisponibilidade prolongada da hospedagem ou CDN;
- **Confidencialidade local:** vazamento ou exposição indevida relacionada ao **uso do browser ou do dispositivo** (PDF descarregado, equipamento partilhado, malware local);
- **Uso indevido:** utilização da plataforma contra políticas internas ou tentativa de abuso técnico.

---

## 2. Classificação inicial

| Nível | Descrição sumária |
|-------|-------------------|
| Alto | Comprometimento confirmado do que é servido aos utilizadores ou da cadeia de build |
| Médio | Indisponibilidade relevante ou suspeita de alteração ainda não confirmada |
| Baixo | Eventos limitados sem impacto direto em dados ou sem alteração de conteúdo |

---

## 3. Ações (fluxo)

1. **Identificação e registo** — abrir registo de incidente; preservar evidências (hashes, commits, logs de infraestrutura permitidos).
2. **Contenção imediata** — revert deploy, desativar versão comprometida, invalidar cache se aplicável.
3. **Investigação** — causa raiz, alcance temporal, dados afetados (se aplicável ao âmbito LGPD).
4. **Correção e recuperação** — patch, novo deploy verificado, testes.
5. **Comunicação** — stakeholders internos; avaliar comunicação a titulares e à ANPD com **Jurídico e DPO** quando houver dados pessoais afetados (LGPD).
6. **Encerramento e melhoria** — atualizar `security-baseline.md`, checklist de deploy ou controles preventivos.

---

## 4. Observação sobre impacto

Na ausência de **base de dados centralizada nesta aplicação** para os formulários, muitos cenários concentram risco no **dispositivo do usuário** ou na **integridade do site estático**. Mesmo assim, incidentes que envolvam dados pessoais (por exemplo divulgação indevisa por erro processual) devem seguir o programa de gestão de incidentes da organização.

---

## 5. Responsabilidades

| Papel | Atuação típica |
|-------|----------------|
| Segurança da Informação | Coordenação técnica e classificação |
| DPO / Privacidade | Avaliação LGPD e comunicações obrigatórias |
| TI | Infraestrutura, reversão de deploy, logs |

---

## 6. Contactos e escalamento

[Preencher conforme organograma interno ATENTO — incluir canal 24x7 se existir.]

---

## 7. Testes

Realizar **simulacros ou tabletop exercises** periodicamente (definir cadência interna).
