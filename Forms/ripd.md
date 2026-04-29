# RIPD — Relatório de Impacto à Proteção de Dados

Referência: Lei nº 13.709/2018 (LGPD), arts. 38 e seguintes. Modelo alinhado ao relatório corporativo de referência, passível de complementação pelo DPO.

---

## 1. Descrição

Ferramenta de geração de PDF com **processamento local no navegador**, destinada ao uso interno ATENTO para suporte aos formulários de admissão e assistência médica conforme versões implantadas.

---

## 2. Natureza do Tratamento

- Dados inseridos voluntariamente pelo usuário nos formulários;
- Processamento temporário em memória durante preenchimento e geração do PDF;
- **Ausência de armazenamento centralizado** dos dados do formulário em servidores desta aplicação;
- Opcionalmente, **rascunho apenas no navegador** (quando a versão assim previr), com função de descarte pelo usuário.

---

## 3. Riscos Identificados

| Risco | Descrição |
|-------|-----------|
| Exposição local | PDF ou sessão em dispositivo partilhado ou comprometido |
| Uso indevido | Informações falsas ou utilização contra políticas internas |
| Integridade da entrega | Alteração maliciosa dos artefactos estáticos ou cadência de deploy |
| Dependências | Vulnerabilidades em bibliotecas JS de terceiros |

---

## 4. Medidas de Mitigação

- **Não persistência central** nos termos da arquitetura atual da ferramenta;
- Processamento local para geração do PDF;
- Uso de **HTTPS** em produção;
- Baseline de segurança e gestão de dependências (`security-baseline.md`);
- Comunicações na UI (ex.: decisões LGPD na geração do PDF);
- Função de **descarte de rascunho** quando aplicável.

---

## 5. Avaliação de risco

**Risco BAIXO a MÉDIO-BAIXO** no que respeita a tratamentos remotos centralizados por esta app, considerando:

- Não há retenção em bases remotas desta solução para os dados digitados no formulário;
- Não há compartilhamento por esta camada com terceiros para fins descritos na política;
- Tráfego obrigatório dos campos do formulário para servidores próprios da aplicação **não** faz parte do fluxo de conclusão do PDF.

Riscos residuais concentram-se em **ambiente do usuário**, **integridade do deploy** e **cadeia de dependências** — ver mitigações acima.

---

## 6. Conclusão

A solução, adequadamente documentada e operada, tende a ser compatível com os princípios da LGPD:

- Necessidade  
- Minimização  
- Segurança  
- Prevenção  

Homologação final compete ao **DPO** e áreas envolvidas após preenchimento de dados identificação do tratamento, bases legais completas no ROPA e revisões periódicas.

---

## 7. Histórico de revisão

| Versão | Data | Responsável | Notas |
|--------|------|-------------|-------|
| [ ] | [ ] | [ ] | Alinhamento ao modelo corporativo e `/Forms` |
