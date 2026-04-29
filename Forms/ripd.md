# Relatório de Impacto à Proteção de Dados (RIPD / DPIA)

**Referência:** Lei nº 13.709/2018 (LGPD), arts. 38 e seguintes.

**Estado:** modelo para elaboração e registro pela área de Privacidade.

---

## 1. Identificação do tratamento

| Campo | Descrição |
|--------|-----------|
| Nome do tratamento | Formulários web de admissão e assistência médica (geração local de PDF) |
| Responsável | [ATENTO — completar] |
| Encarregado (DPO) | [Contacto — completar] |
| Sistemas envolvidos | [Repositório estático, hospedagem, CDN — completar] |

---

## 2. Finalidades

- Suporte ao preenchimento de formulários institucionais;
- Geração local de PDF para arquivo e tramitação conforme processos internos.

---

## 3. Categorias de titulares e dados

- Titulares: candidatos/colaboradores e dependentes conforme formulários.
- Dados: identificação, contactos, dados profissionais, eventualmente dados sensíveis em fluxos específicos de assistência médica.

---

## 4. Base legal

Ver `legal-basis.md` e parecer jurídico.

---

## 5. Fluxo de dados

Ver `data-flow.md`.

---

## 6. Necessidade e proporcionalidade

[Descrever por que solução client-side é proporcional; alternativas consideradas.]

---

## 7. Riscos aos direitos dos titulares

| Risco | Mitigação |
|--------|-----------|
| Perda ou extração de PDF no dispositivo do utilizador | Políticas internas de arquivo; orientação ao utilizador |
| Rascunho local em equipamento partilhado | Funcionalidade de descarte; comunicação clara |
| Indisponibilidade da página estática | Gestão de hospedagem e continuidade |

---

## 8. Medidas de segurança

Ver `security-baseline.md` e `incident-response.md`.

---

## 9. Consultas e pareceres

[Registar envolvimento do DPO e stakeholders antes da homologação.]

---

## 10. Conclusão e revisão

- Data da primeira aprovação: [ ]  
- Próxima revisão periódica: [ ]  
