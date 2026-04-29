# Governança de Privacidade

## Princípios

- **Privacy by Design** — privacidade considerada desde o desenho da solução e dos processos;
- **Minimização de dados** — apenas o necessário ao preenchimento e à geração do PDF (e rascunho local, quando existir, estritamente para esse fim);
- **Transparência** — políticas e comunicações na aplicação (`privacy-policy.md`, modais, termos).

---

## Diretrizes

- Não coletar dados desnecessários para além dos campos dos formulários institucionais;
- Não armazenar dados em **servidor desta aplicação** para fins de cadastro web centralizado dos formulários;
- Garantir segurança no processamento conforme `security-baseline.md`;
- Manter documentação em `/Forms` alinhada à versão implantada da aplicação;
- Coordenação entre **Privacidade (DPO)**, **Jurídico**, **Segurança da Informação** e **TI** para alterações que afetem dados pessoais ou risco.

---

## Papéis (resumo)

| Papel | Função |
|-------|--------|
| Responsável pelo tratamento | Definição das finalidades institucionais (corporativo ATENTO) |
| DPO / Privacidade | Supervisão LGPD, interfaces com titulares e órgão fiscalizador |
| Jurídico | Validade de termos, bases legais e contratos |
| Segurança da Informação | Baseline, incidentes, exceções |
| TI / DevOps | Pipeline, hospedagem, permissões de repositório |

---

## Revisões

- Documentação revisada **periodicamente** e **ad hoc** quando houver:
  - nova versão da aplicação com mudança de fluxo de dados;
  - alteração legal ou orientação da ANPD;
  - incidente com lições aprendidas relevantes.

Registar datas de aprovação nas versões dos documentos ou em registo interno de governança.

---

## Documentação de referência

| Documento | Uso |
|-----------|-----|
| `privacy-policy.md` | Transparência ao usuário/titular |
| `terms-of-use.md` | Regras de uso da ferramenta |
| `data-flow.md` | Base técnica e RIPD |
| `legal-basis.md` | Fundamentos normativos |
| `security-baseline.md` | Controlos mínimos |
| `incident-response.md` | Resposta a incidentes |
| `ripd.md` | Avaliação de impacto |
