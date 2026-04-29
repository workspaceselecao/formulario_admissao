# Política de Privacidade

## 1. Introdução

Esta plataforma foi desenvolvida com base no princípio de Privacy by Design, priorizando a **minimização** e a **não retenção centralizada** de dados pessoais nos sistemas desta aplicação.

Trata-se de uma **plataforma destinada ao uso interno da empresa ATENTO**, disponibilizada como ferramenta de apoio ao preenchimento de formulários.

---

## 2. Natureza do Tratamento de Dados

Os dados inseridos pelo usuário:

- São processados **exclusivamente no navegador** (client-side), para composição do PDF;
- **Não são enviados** a servidores desta aplicação para armazenamento de formulário ou finalização obrigatória do PDF;
- **Não são armazenados** em bases de dados remotas operadas por esta solução para os dados digitados nos formulários;
- **Não são compartilhados** com terceiros por intermédio desta aplicação no fluxo técnico descrito em `data-flow.md`;
- Permanecem durante o preenchimento na **memória do dispositivo** e, quando aplicável, em **armazenamento local opcional** exclusivamente no navegador (ver §7);
- São **eliminados da sessão de trabalho** após a geração do arquivo PDF **conforme** os fluxos e confirmações exibidos ao usuário (incluindo modal de decisão LGPD, quando aplicável).

---

## 3. Dados Inseridos pelo Usuário

O usuário poderá inserir, voluntariamente:

- Nome, CPF, RG  
- Endereço e contatos  
- Dados profissionais e bancários  
- Informações de dependentes  
- Demais campos previstos nos modelos de formulário institucional em uso  

Esses dados são utilizados exclusivamente para composição do documento PDF gerado localmente.

---

## 4. Finalidade

A finalidade do tratamento neste contexto é:

> Gerar um arquivo PDF com base nas informações inseridas pelo próprio usuário, no âmbito dos processos de admissão e assistência médica conforme os formulários disponibilizados.

---

## 5. Base Legal

O tratamento ocorre com base em:

- **Execução de procedimento solicitado pelo titular** (preenchimento e geração do documento solicitado pelo próprio usuário).

Fundamentos adicionais ou específicos por tipo de dado devem constar do inventário corporativo de tratamentos e do documento `legal-basis.md`.

---

## 6. Compartilhamento de Dados

Não há qualquer compartilhamento de dados **por intermédio desta aplicação** com terceiros para os fins de tratamento descritos nesta política.

Serviços de infraestrutura (por exemplo hospedagem estática ou CDN) podem processar metadados de acesso conforme políticas do fornecedor; não devem incluir o **corpo dos formulários** nos registos operacionais da aplicação.

---

## 7. Armazenamento e Retenção

**7.1 Ausência de base centralizada:** não há armazenamento dos dados do formulário em **servidor de aplicação** operado por esta solução para consulta posterior típica de “cadastro web”.

**7.2 Descarte após geração do PDF:** os dados utilizados na sessão são tratados conforme as mensagens da aplicação no momento da geração do arquivo.

**7.3 Rascunho local (quando ativo na versão implantada):** pode existir **persistência opcional no navegador** (por exemplo `localStorage`) apenas para permitir retomar o preenchimento no mesmo dispositivo. Tal persistência:
- permanece sob controlo local do usuário;
- pode ser **eliminada** pelo usuário através da função **Descartar rascunho** ou equivalente;
- não substitui políticas de arquivo físico ou sistemas oficiais da ATENTO.

---

## 8. Segurança

A aplicação utiliza **HTTPS** em ambiente de produção e arquitetura que reduz persistência e transmissão desnecessárias de dados pessoais. Medidas complementares constam de `security-baseline.md`.

---

## 9. Direitos do Titular

O titular pode exercer seus direitos previstos na LGPD junto aos **canais institucionais** da ATENTO indicados pelo responsável pelo tratamento.

Na medida em que não há base de dados centralizada desta aplicação para os dados digitados pelo usuário, parte dos direitos pode relacionar-se a informações sob **custódia local** do dispositivo ou a processos de RH/arquivo já existentes na empresa.

---

## 10. Responsável pela Plataforma

Plataforma destinada ao uso interno da empresa **ATENTO**.  
[Dados de contato do encarregado/DPO e canal do titular — completar conforme governança corporativa.]

---

## 11. Alterações

Esta política pode ser atualizada a qualquer momento para refletir mudanças legais, organizacionais ou de versão da aplicação.
