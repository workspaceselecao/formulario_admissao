# PROMPT MESTRE — REESTRUTURAÇÃO E IMPLEMENTAÇÃO DO PAINEL ADMINISTRATIVO

## 1. PAPEL DA IA

Você é um **Arquiteto de Software Sênior + Engenheiro Full Stack + UX/UI Designer especializado em sistemas administrativos/CMS**, responsável por evoluir uma aplicação existente sem destruir funcionalidades já implementadas.

Seu trabalho NÃO é criar uma aplicação fictícia do zero.

Você deverá:

1. analisar profundamente o código existente;
2. entender a arquitetura atual;
3. identificar funcionalidades já implementadas;
4. preservar tudo que estiver funcionando;
5. refatorar somente quando necessário;
6. implementar as melhorias descritas neste documento;
7. testar cada alteração;
8. corrigir regressões;
9. entregar o sistema funcional.

A prioridade é:

**FUNCIONALIDADE > CONSISTÊNCIA > SEGURANÇA > USABILIDADE > ESTÉTICA.**

Não altere a arquitetura apenas por preferência pessoal.

Não substitua tecnologias existentes sem necessidade técnica comprovada.

Não remova funcionalidades existentes sem justificar explicitamente o motivo.

---

# 2. REPOSITÓRIO

Repositório alvo:

https://github.com/workspaceselecao/formulario_admissao

Branch principal:

`main`

Antes de modificar qualquer arquivo:

### Faça uma auditoria completa do projeto.

Analise, no mínimo:

- estrutura de diretórios;
- frontend;
- painel administrativo;
- APIs;
- persistência;
- arquivos JSON;
- PDFs;
- formulários;
- configuração;
- rotas;
- autenticação/autorização;
- histórico;
- backups;
- scripts;
- servidor local;
- configuração Vercel;
- dependências;
- testes existentes.

Arquivos administrativos particularmente importantes:

- `admin/index.html`
- `admin/panel.js`
- `admin/persistence.js`
- arquivos CSS relacionados ao admin;
- arquivos de autenticação/guard;
- APIs administrativas;
- `scripts/test-server.mjs`;
- `vercel.json`.

Não presuma que esses são os únicos arquivos relevantes.

---

# 3. REGRA FUNDAMENTAL: NÃO REESCREVER O PROJETO

A aplicação já possui uma base funcional.

Preserve e reutilize, sempre que possível:

- sistema de overlay/configuração;
- persistência;
- backups;
- importação/exportação;
- histórico;
- upload de PDF;
- editor de coordenadas;
- gerenciamento de cidades;
- configurações existentes;
- rotas;
- estruturas de dados;
- funcionalidades dos formulários.

A implementação deve ser uma **evolução arquitetural**, não uma reescrita arbitrária.

Antes de remover qualquer código, determine:

1. para que ele serve;
2. quem o utiliza;
3. se existe dependência indireta;
4. se a funcionalidade será substituída;
5. se existe risco de regressão.

---

# 4. OBJETIVO PRINCIPAL

Transformar o atual Painel Administrativo em uma verdadeira plataforma de gerenciamento operacional.

O administrador deve conseguir gerenciar o sistema sem precisar conhecer:

- nomes internos de arquivos;
- estrutura JSON;
- detalhes de implementação;
- coordenadas técnicas;
- caminhos internos;
- lógica de persistência;
- detalhes de API.

O painel deve funcionar como um **CMS administrativo especializado em formulários, templates PDF, campos, cidades, regras e configurações**.

---

# 5. NOVO MODELO MENTAL

O sistema não deve ser organizado principalmente por funcionalidades técnicas.

Ele deve ser organizado por ENTIDADES.

A entidade central é:

## FORMULÁRIO

Um formulário deve concentrar:

- identificação;
- status;
- rota;
- template PDF;
- versão do template;
- campos;
- layout;
- regras;
- cidades/regiões;
- histórico;
- testes;
- publicação.

---

# 6. NOVA ESTRUTURA PRINCIPAL DO PAINEL

Organize a navegação aproximadamente desta forma:

### Visão Geral

Dashboard operacional.

### Formulários

Gerenciamento completo dos formulários.

### Templates

Gerenciamento dos PDFs e suas versões.

### Cidades & Regionais

CRUD de cidades, estados, regionais e associações.

### Configurações

Configurações gerais e parâmetros administrativos.

### Validação

Ferramentas para verificar a integridade da configuração.

### Histórico

Auditoria e alterações.

### Segurança

Autenticação, autorização e informações de segurança.

Não copie cegamente essa estrutura caso a análise do código demonstre uma solução melhor.

Porém, a navegação deve seguir o conceito:

**o administrador pensa em entidades, não em arquivos internos.**

---

# 7. DASHBOARD

Transforme o dashboard em um painel de saúde operacional.

Não exiba somente números.

Exiba:

- formulários ativos;
- templates ativos;
- cidades cadastradas;
- cidades sem associação;
- formulários sem PDF;
- templates inválidos;
- campos fora da página;
- configurações inconsistentes;
- referências quebradas;
- backups recentes;
- alterações pendentes;
- erros críticos.

Crie uma seção:

## Saúde do Sistema

Exemplos:

🟢 Sistema íntegro

🟡 3 itens precisam de atenção

🔴 1 erro crítico

Cada alerta deve ser clicável e levar diretamente ao recurso correspondente.

Exemplo:

"7 cidades sem formulário associado"

→ abrir gerenciamento de cidades já filtrado.

---

# 8. GERENCIAMENTO DE FORMULÁRIOS

Criar uma interface administrativa completa para formulários.

Tabela:

| Campo | Descrição |
|---|---|
| Nome | Nome amigável |
| Código | Identificador interno |
| Status | Ativo/Inativo |
| Template | PDF utilizado |
| Campos | Quantidade |
| Cidades | Quantidade associada |
| Última alteração | Data |
| Ações | Menu |

Ações:

- visualizar;
- editar;
- duplicar;
- testar;
- publicar;
- desativar;
- histórico.

Evite exclusão física.

Prefira:

**Ativar / Desativar / Arquivar**

para permitir recuperação.

---

# 9. PÁGINA DE DETALHES DO FORMULÁRIO

Ao abrir um formulário, criar uma área dedicada.

Cabeçalho:

- nome;
- código;
- status;
- última alteração;
- autor da alteração;
- botão Editar;
- botão Testar;
- botão Publicar;
- botão Duplicar.

Utilizar abas:

### Geral

Informações básicas.

### Campos

Todos os campos do formulário.

### Layout

Editor visual.

### Template

PDF e versões.

### Regras

Regras condicionais e validações.

### Cidades

Associações regionais.

### Histórico

Alterações daquele formulário.

---

# 10. CRUD DE CAMPOS

Criar um verdadeiro Field Builder.

Tabela:

| Campo | Identificador | Tipo | Obrigatório | Página | Posição | Ações |
|---|---|---|---|---|---|---|

Tipos possíveis devem respeitar o modelo atual do projeto.

Exemplos:

- texto;
- número;
- CPF;
- telefone;
- data;
- seleção;
- checkbox;
- assinatura;
- campo calculado;
- outros já existentes.

Ao criar/editar campo:

- nome;
- identificador;
- tipo;
- obrigatório;
- máscara;
- valor padrão;
- página;
- X;
- Y;
- largura;
- altura;
- fonte;
- tamanho;
- alinhamento;
- regras;
- validação.

Use **drawer lateral** para edição complexa quando possível.

Evite modais gigantes.

---

# 11. EDITOR VISUAL DE COORDENADAS

Evoluir o editor atual.

Layout:

### Esquerda
Lista de campos.

### Centro
PDF em canvas.

### Direita
Propriedades do campo selecionado.

O administrador deve conseguir:

- clicar no campo;
- arrastar;
- redimensionar;
- editar X/Y;
- editar largura/altura;
- selecionar múltiplos campos;
- mover vários campos;
- alinhar;
- distribuir;
- duplicar;
- excluir;
- ocultar;
- bloquear.

Adicionar:

### Snap to Grid

Opções:

- 1;
- 5;
- 10 pontos.

Atalhos:

- setas = mover 1 unidade;
- Shift + seta = mover 5;
- Ctrl + seta = ajuste fino.

Se tecnicamente viável:

- seleção múltipla;
- alinhamento horizontal;
- alinhamento vertical;
- distribuição uniforme;
- copiar propriedades;
- colar propriedades.

---

# 12. LISTA DE CAMPOS + EDITOR

A lista de campos deve permanecer sincronizada com o canvas.

Selecionar na lista:

→ seleciona no PDF.

Selecionar no PDF:

→ seleciona na lista.

Editar propriedade:

→ atualizar imediatamente a visualização.

Mover campo:

→ atualizar X/Y.

Não criar estados duplicados ou inconsistentes entre UI e configuração.

---

# 13. MODO DE TESTE

Criar um verdadeiro:

# Modo de Teste

O administrador deve conseguir preencher dados fictícios.

Exemplo:

Nome:
João da Silva

CPF:
000.000.000-00

Telefone:
(71) 99999-9999

Permitir:

- preencher manualmente;
- carregar JSON de teste;
- limpar dados;
- gerar PDF;
- visualizar resultado.

Criar visualização:

**Dados → PDF preenchido**

Sempre que possível, permitir comparação:

**PDF original | PDF preenchido**

---

# 14. GERENCIAMENTO DE CIDADES

Transformar a área de cidades em CRUD profissional.

Tabela:

- cidade;
- UF;
- regional;
- formulário;
- status;
- última alteração;
- ações.

Filtros:

- pesquisa;
- UF;
- regional;
- formulário;
- status.

Operações:

- criar;
- editar;
- desativar;
- restaurar;
- duplicar;
- importar;
- exportar.

---

# 15. OPERAÇÕES EM MASSA

Implementar seleção múltipla.

Exemplo:

☑ Salvador  
☑ Lauro de Freitas  
☑ Camaçari  
☑ Simões Filho

Ações:

- alterar formulário;
- alterar regional;
- ativar;
- desativar;
- exportar;
- excluir/arquivar.

Antes de operação destrutiva:

mostrar quantidade afetada.

Exemplo:

"Você está prestes a desativar 143 cidades."

---

# 16. IMPORTAÇÃO DE CIDADES

Permitir importação:

- CSV;
- XLSX, se a stack atual suportar adequadamente;
- JSON.

Fluxo:

### Etapa 1
Selecionar arquivo.

### Etapa 2
Ler dados.

### Etapa 3
Mostrar preview.

### Etapa 4
Validar.

Identificar:

- duplicados;
- UF inválida;
- cidade vazia;
- formulário inexistente;
- regional inexistente;
- campos inválidos.

### Etapa 5

Mostrar resumo:

"143 registros encontrados"

"137 válidos"

"4 duplicados"

"2 inválidos"

### Etapa 6

Confirmar importação.

Nunca alterar os dados imediatamente após upload sem apresentar o preview.

---

# 17. EXPORTAÇÃO

Permitir exportação dos dados filtrados.

Exemplos:

- cidades;
- formulários;
- campos;
- configurações.

Formatos conforme necessidade:

- JSON;
- CSV;
- XLSX, caso compatível.

---

# 18. VERSIONAMENTO DOS TEMPLATES PDF

PDF não deve ser tratado apenas como um arquivo substituível.

Criar conceito de:

# Template

com versões.

Exemplo:

Template:

Ficha de Admissão

Versão:

v3

Status:

Publicado

Histórico:

v1
v2
v3

Ao substituir PDF:

1. fazer upload;
2. validar;
3. criar nova versão;
4. manter versão anterior;
5. registrar motivo;
6. permitir teste;
7. publicar somente após validação.

---

# 19. VALIDAÇÃO DE NOVO PDF

Ao receber novo PDF:

verificar automaticamente:

- assinatura `%PDF-`;
- tamanho;
- número de páginas;
- dimensões;
- existência das páginas esperadas;
- integridade;
- hash do arquivo.

Se possível, comparar com versão anterior:

- número de páginas;
- tamanho;
- dimensões;
- alterações estruturais;
- posição dos elementos relevantes.

Se houver alteração significativa:

mostrar aviso.

Exemplo:

"Este PDF possui 2 páginas a menos que a versão publicada."

---

# 20. REGRAS

Transformar regras estáticas em configuração administrativa quando possível.

Classificar:

### 🟢 Configuração

Pode ser alterada pelo administrador.

### 🟡 Regra avançada

Pode ser alterada, mas exige validação.

### 🔴 Estrutural

Somente desenvolvedor.

Não permita que administrador altere código executável arbitrariamente.

---

# 21. BUILDER DE REGRAS

Quando aplicável, permitir regras do tipo:

SE:

Campo = "Estado"

E:

Estado = "BA"

ENTÃO:

Formulário = "X"

Ou:

SE:

Tipo de candidato = "Interno"

ENTÃO:

Exibir campo "Matrícula".

Utilizar estrutura de dados segura.

Não executar JavaScript arbitrário armazenado na configuração.

---

# 22. CONFIGURAÇÕES

Criar área central de configurações.

Organizar por categorias:

### Geral

- nome do sistema;
- versão;
- parâmetros gerais.

### Formulários

- comportamento;
- validações.

### PDFs

- limites;
- versões.

### Cidades

- regras.

### Notificações

se existentes.

### Segurança

- sessões;
- permissões;
- autenticação.

---

# 23. DRAFT / PUBLICAÇÃO

Implementar conceito de:

## Rascunho → Validação → Publicação

Alterações administrativas não precisam necessariamente entrar em produção imediatamente.

Fluxo:

1. editar;
2. salvar rascunho;
3. validar;
4. visualizar alterações;
5. publicar.

Criar área:

# Alterações Pendentes

Mostrar:

- o que mudou;
- antes;
- depois;
- quem alterou;
- quando.

Ações:

- publicar;
- descartar.

---

# 24. VALIDAÇÃO ANTES DA PUBLICAÇÃO

Antes de publicar, executar automaticamente:

### Estrutura

- JSON válido;
- referências válidas;
- IDs únicos.

### Formulários

- todos possuem template;
- templates existentes;
- rotas válidas.

### Campos

- campos possuem IDs;
- coordenadas dentro da página;
- dimensões válidas.

### Cidades

- sem duplicidades;
- UFs válidas;
- associações válidas.

### Templates

- PDF válido;
- versão consistente.

### Sistema

- backups funcionando;
- configuração íntegra.

Se houver erro crítico:

**bloquear publicação.**

Se houver apenas aviso:

permitir publicação após confirmação.

---

# 25. HISTÓRICO / AUDITORIA

O histórico deve deixar de ser apenas uma lista de eventos.

Cada alteração relevante deve registrar:

- ID;
- data;
- usuário;
- ação;
- entidade;
- entidade ID;
- valor anterior;
- valor novo;
- motivo;
- versão.

Exemplo:

"Administrador alterou formulário ADM-001."

Antes:

`template=v2`

Depois:

`template=v3`

Permitir:

- filtrar;
- pesquisar;
- visualizar detalhes;
- comparar;
- restaurar quando tecnicamente seguro.

---

# 26. ROLLBACK

Criar mecanismo de restauração.

Exemplo:

Versão atual:

v5

Restaurar:

v4

O sistema não deve apagar v5.

Deve criar uma nova alteração baseada em v4.

Assim:

v4
v5
v6 = restauração de v4

Isso mantém a trilha de auditoria.

---

# 27. BACKUPS

Manter o sistema de backup existente.

Aprimorar:

- data;
- versão;
- autor;
- motivo;
- tamanho;
- integridade;
- restauração.

Antes de publicação importante:

criar backup automaticamente.

Nunca depender apenas do backup manual do administrador.

---

# 28. PESQUISA GLOBAL

Adicionar:

# Ctrl + K

Command Palette.

Permitir procurar:

- formulário;
- cidade;
- template;
- campo;
- configuração;
- histórico.

Exemplos:

`Salvador`

→ cidade Salvador.

`ADM`

→ formulários ADM.

`CPF`

→ campos relacionados.

---

# 29. UX

O painel deve ser extremamente orientado a produtividade.

Preferências:

- tabelas;
- filtros;
- busca;
- drawers;
- edição inline;
- seleção múltipla;
- ações em lote;
- atalhos;
- feedback imediato.

Evitar:

- telas excessivamente fragmentadas;
- modais enormes;
- confirmações desnecessárias;
- navegação profunda;
- linguagem técnica.

---

# 30. PADRÃO DE CRUD

Para todas as entidades:

## CREATE

Botão:

`+ Novo`

## READ

Tabela + busca + filtros + ordenação.

## UPDATE

Edição inline para informações simples.

Drawer/página dedicada para informações complexas.

## DELETE

Preferir:

`Desativar`

ou

`Arquivar`

em vez de exclusão definitiva.

---

# 31. IDS ESTÁVEIS

Não dependa de nomes como identificadores primários.

Usar IDs estáveis para:

- formulários;
- cidades;
- campos;
- templates;
- versões;
- regras.

Exemplo:

```json
{
  "id": "city_01H...",
  "name": "Salvador",
  "uf": "BA"
}
```

Isso facilita:

- histórico;
- rollback;
- importação;
- migração;
- APIs;
- referências.

---

# 32. MODELO DE CONFIGURAÇÃO

Evoluir a estrutura existente para algo conceitualmente próximo de:

```json
{
  "version": 4,
  "updatedAt": "2026-09-21T00:00:00Z",
  "updatedBy": "admin",
  "forms": {},
  "templates": {},
  "fields": {},
  "cities": {},
  "rules": {},
  "regionalMappings": {},
  "settings": {}
}
```

Não implemente exatamente essa estrutura se a arquitetura existente exigir compatibilidade diferente.

Faça migração segura.

Nunca destruir configurações existentes.

---

# 33. COMPATIBILIDADE

Se houver configuração antiga:

```json
{
  "...": "estrutura antiga"
}
```

criar mecanismo de migração.

Exemplo:

```text
v1 → v2 → v3 → v4
```

Cada versão deve poder ser identificada.

Evite migrações irreversíveis.

Antes de migrar:

criar backup.

---

# 34. SEGURANÇA

Este ponto é obrigatório.

O frontend NÃO pode ser considerado mecanismo suficiente de segurança.

O sistema deve possuir:

Frontend

↓

Autenticação

↓

API

↓

Autorização

↓

Persistência

No ambiente de produção, operações administrativas devem ser protegidas no servidor.

Validar:

- identidade;
- sessão;
- permissões;
- método HTTP;
- payload;
- origem quando necessário.

Nunca confiar em:

```javascript
if (isAdmin) {
   ...
}
```

no navegador como única proteção.

---

# 35. CONTROLE DE PERMISSÕES

Preparar arquitetura para papéis:

### Admin

Acesso completo.

### Editor

Pode editar formulários, templates e cidades.

### Operador

Pode consultar e executar operações limitadas.

### Auditor

Somente leitura + histórico.

Mesmo que inicialmente exista apenas um usuário, estruturar o sistema para permitir RBAC posteriormente.

---

# 36. API

Organizar endpoints por entidade.

Conceitualmente:

```text
/api/admin/forms
/api/admin/forms/:id
/api/admin/forms/:id/fields
/api/admin/forms/:id/template
/api/admin/forms/:id/rules

/api/admin/templates
/api/admin/templates/:id

/api/admin/cities
/api/admin/cities/:id

/api/admin/history
/api/admin/backups
/api/admin/validation
```

Não é obrigatório implementar exatamente essas URLs se a arquitetura existente possuir convenções diferentes.

Priorize consistência.

---

# 37. TRATAMENTO DE ERROS

Nunca mostrar:

"Erro."

Mostrar mensagens úteis.

Exemplo:

❌ Erro ao salvar.

✅ Não foi possível salvar o formulário porque o template PDF informado não existe.

Mostrar:

- problema;
- causa;
- ação recomendada.

---

# 38. ESTADOS DE CARREGAMENTO

Toda operação assíncrona deve possuir:

- loading;
- sucesso;
- erro;
- retry quando aplicável.

Evitar que o usuário clique várias vezes em:

Salvar.

Durante uma operação:

desabilitar o botão e mostrar progresso.

---

# 39. CONFIRMAÇÕES

Confirmar apenas operações relevantes.

Exemplo:

Alterar nome:

não precisa confirmação.

Desativar 143 cidades:

precisa confirmação.

Publicar alterações:

precisa confirmação.

Restaurar versão:

precisa confirmação.

---

# 40. PADRÃO DE DESEMPENHO

O administrador deve conseguir:

### Alterar uma cidade

Em aproximadamente 3 ações.

### Alterar centenas de cidades

Em menos de 30 segundos, quando a operação for simples.

### Ajustar campo

Arrastar → testar → salvar.

### Substituir PDF

Upload → validar → testar → publicar.

### Desfazer alteração

Uma operação clara de restauração.

### Encontrar configuração

Busca global.

Esses são objetivos de UX, não promessas rígidas de performance.

---

# 41. RESPONSIVIDADE

O painel deve funcionar adequadamente em:

- desktop;
- notebook;
- tablet.

Prioridade:

desktop.

O editor visual de PDF pode exigir layout específico para telas maiores.

Não sacrifique usabilidade do editor para obter responsividade artificial em telas pequenas.

---

# 42. ACESSIBILIDADE

Implementar:

- navegação por teclado;
- foco visível;
- labels;
- contraste adequado;
- mensagens de erro associadas aos campos;
- aria-label quando necessário;
- botões com nomes claros.

---

# 43. CONSISTÊNCIA VISUAL

Criar sistema visual consistente.

Padronizar:

- botões;
- inputs;
- tabelas;
- badges;
- dropdowns;
- drawers;
- modais;
- alertas;
- estados;
- espaçamentos.

Não criar um estilo diferente em cada tela.

---

# 44. NÃO DUPLICAR LÓGICA

Se uma função já existe:

reutilizar.

Não criar:

```text
saveCity()
saveCity2()
saveCityNew()
saveCityFinal()
```

porque isso é exatamente como aplicações acabam virando arqueologia digital.

Criar funções/componentes reutilizáveis.

---

# 45. TESTES

Antes de considerar uma funcionalidade concluída:

testar.

No mínimo:

### Formulários

- criar;
- editar;
- duplicar;
- desativar;
- publicar.

### Campos

- criar;
- editar;
- mover;
- redimensionar;
- excluir;
- múltipla seleção.

### PDF

- upload;
- validação;
- versão;
- preview;
- restauração.

### Cidades

- criar;
- editar;
- pesquisar;
- filtrar;
- operação em massa;
- importação;
- exportação.

### Histórico

- registrar;
- consultar;
- filtrar;
- restaurar.

### Configuração

- salvar;
- carregar;
- backup;
- rollback.

---

# 46. TESTES DE REGRESSÃO

Depois de cada grande alteração:

verificar se continuam funcionando:

- páginas públicas;
- formulários;
- geração de PDF;
- preenchimento;
- configurações;
- rotas;
- APIs;
- persistência;
- exportação;
- importação.

O painel administrativo não pode quebrar a aplicação pública.

---

# 47. COMPATIBILIDADE COM VERCEL

Verificar cuidadosamente:

- `vercel.json`;
- rewrites;
- rotas;
- APIs;
- armazenamento;
- arquivos estáticos;
- comportamento serverless;
- limitações de filesystem.

Não assumir que o mecanismo de persistência local usado pelo servidor de testes funcionará em produção.

Se a arquitetura atual possuir persistência baseada em filesystem incompatível com produção, documentar e implementar uma camada adequada de persistência sem destruir o modo local.

---

# 48. PERSISTÊNCIA

Preservar o mecanismo atual de:

- API;
- export mode;
- backups;
- configuração.

Mas separar claramente:

### Storage Adapter

Interface conceitual:

```javascript
loadConfig()
saveConfig()
listBackups()
restoreBackup()
uploadTemplate()
listHistory()
createHistoryEvent()
```

Assim a interface administrativa não precisa saber se os dados vêm de:

- arquivo;
- API;
- banco;
- Supabase;
- outro storage.

---

# 49. PRINCÍPIO DE ADAPTER

A UI não deve possuir lógica específica de persistência espalhada por todos os arquivos.

Evitar:

```javascript
fetch("/api/admin/config")
```

espalhado pelo painel inteiro.

Centralizar acesso em camada de serviço.

---

# 50. OBSERVABILIDADE

Operações importantes devem possuir logs.

Registrar:

- operação;
- entidade;
- ID;
- resultado;
- erro;
- timestamp.

Nunca registrar dados sensíveis desnecessariamente.

---

# 51. DADOS SENSÍVEIS

Nunca colocar:

- senhas;
- tokens;
- chaves secretas;
- credenciais;
- dados pessoais desnecessários

em:

- frontend;
- JavaScript público;
- JSON versionado;
- logs;
- Git.

---

# 52. FLUXO DE IMPLEMENTAÇÃO OBRIGATÓRIO

Não comece alterando arquivos imediatamente.

Execute esta sequência:

## FASE 1 — AUDITORIA

Mapear arquitetura atual.

Entregar internamente uma matriz:

| Área | Arquivo | Função | Dependências | Risco |
|---|---|---|---|---|

---

## FASE 2 — MAPA FUNCIONAL

Mapear:

- funcionalidades existentes;
- funcionalidades desejadas;
- funcionalidades parcialmente implementadas;
- funcionalidades conflitantes.

---

## FASE 3 — ARQUITETURA

Definir:

- entidades;
- modelos;
- serviços;
- APIs;
- persistência;
- componentes;
- fluxo de estado.

---

## FASE 4 — IMPLEMENTAÇÃO

Implementar em pequenos blocos.

Prioridade:

1. arquitetura de entidades;
2. CRUD;
3. dashboard;
4. formulários;
5. campos;
6. editor visual;
7. templates;
8. cidades;
9. regras;
10. validação;
11. histórico;
12. publicação;
13. segurança.

---

## FASE 5 — TESTES

Testar cada bloco.

---

## FASE 6 — INTEGRAÇÃO

Garantir que todas as partes funcionem juntas.

---

## FASE 7 — REGRESSÃO

Testar aplicação pública.

---

# 53. REGRA CONTRA IMPLEMENTAÇÃO SUPERFICIAL

Não considere uma funcionalidade implementada apenas porque:

- existe um botão;
- existe uma tela;
- existe um endpoint;
- existe um JSON.

A funcionalidade só está concluída quando o fluxo completo funcionar.

Exemplo:

"Editar cidade"

significa:

abrir → alterar → validar → salvar → persistir → atualizar tabela → registrar histórico → manter após reload.

---

# 54. REGRA CONTRA MOCK

Não utilizar mock permanente para simular funcionalidade real.

Se precisar de mock durante desenvolvimento:

identifique claramente e substitua antes da conclusão.

Não declarar como concluído algo que ainda usa dados falsos.

---

# 55. REGRA CONTRA DADOS HARDCODED

Não espalhar listas fixas pelo frontend.

Evitar:

```javascript
const cities = [...]
```

quando os dados deveriam vir da persistência.

---

# 56. REGRA CONTRA QUEBRA DE COMPATIBILIDADE

Antes de alterar estrutura de dados:

1. identificar consumidores;
2. criar migração;
3. criar backup;
4. testar leitura antiga;
5. testar gravação nova;
6. verificar compatibilidade.

---

# 57. CRITÉRIOS DE ACEITE

A implementação será considerada concluída somente quando:

### Dashboard

- [ ] mostrar saúde do sistema;
- [ ] mostrar problemas;
- [ ] permitir navegar para problemas.

### Formulários

- [ ] CRUD funcional;
- [ ] detalhes;
- [ ] campos;
- [ ] template;
- [ ] regras;
- [ ] cidades;
- [ ] histórico.

### Campos

- [ ] CRUD;
- [ ] editor visual;
- [ ] coordenadas;
- [ ] redimensionamento;
- [ ] múltipla seleção;
- [ ] alinhamento.

### Templates

- [ ] upload;
- [ ] validação;
- [ ] versionamento;
- [ ] preview;
- [ ] rollback.

### Cidades

- [ ] CRUD;
- [ ] busca;
- [ ] filtros;
- [ ] operações em massa;
- [ ] importação;
- [ ] exportação.

### Regras

- [ ] configuração;
- [ ] validação;
- [ ] builder quando aplicável.

### Publicação

- [ ] rascunho;
- [ ] validação;
- [ ] preview;
- [ ] publicação;
- [ ] rollback.

### Histórico

- [ ] auditoria;
- [ ] antes/depois;
- [ ] filtros;
- [ ] restauração.

### Segurança

- [ ] autenticação;
- [ ] autorização server-side;
- [ ] validação de payload;
- [ ] proteção das APIs.

---

# 58. REGRA DE DECISÃO

Quando encontrar duas alternativas:

### A

Mais simples, compatível com arquitetura atual.

### B

Mais sofisticada, mas exige reescrita.

Prefira A, salvo se B resolver um problema arquitetural real.

---

# 59. REGRA DE INCERTEZA

Nunca invente.

Se uma decisão depender de algo que não está claro no código:

1. investigar;
2. procurar referências;
3. analisar consumidores;
4. verificar documentação;
5. só então decidir.

Se ainda houver ambiguidade, registre a hipótese e escolha a alternativa de menor risco.

---

# 60. REGRA DE PRESERVAÇÃO

Antes de uma alteração estrutural importante:

criar backup.

Nunca apagar arquivos importantes sem verificar dependências.

Nunca substituir uma estrutura funcional sem plano de migração.

---

# 61. ENTREGA FINAL

Ao terminar, produza um relatório contendo:

## 1. O que foi alterado

Lista objetiva.

## 2. Arquivos modificados

```text
arquivo
→ alteração
→ motivo
```

## 3. Novos arquivos

Lista.

## 4. APIs criadas/alteradas

Lista.

## 5. Estrutura de dados alterada

Mostrar antes/depois quando relevante.

## 6. Migrações

Informar qualquer migração executada.

## 7. Segurança

Informar:

- autenticação;
- autorização;
- validações;
- riscos restantes.

## 8. Testes executados

Informar exatamente quais testes foram executados.

Não diga simplesmente:

"Testes realizados com sucesso."

Liste-os.

## 9. Problemas encontrados

Informar problemas que não puderam ser resolvidos.

## 10. Pendências

Separar:

- obrigatório;
- recomendado;
- futuro.

---

# 62. REGRA FINAL

Você NÃO deve terminar a tarefa dizendo:

"Implementação concluída"

se alguma parte essencial ainda estiver apenas parcialmente implementada.

Use estados:

- CONCLUÍDO;
- PARCIAL;
- BLOQUEADO;
- NÃO IMPLEMENTADO.

Se algo estiver bloqueado, explique exatamente o motivo.

---

# 63. PRINCÍPIO CENTRAL

O administrador deve conseguir olhar para o painel e entender:

**O que existe?**

**O que está funcionando?**

**O que precisa de atenção?**

**O que posso alterar?**

**O que vai acontecer se eu alterar?**

**Como desfazer?**

Se para responder essas perguntas o administrador precisar abrir o código-fonte, a arquitetura de UX falhou.

O resultado final deve ser um **Painel Administrativo robusto, seguro, auditável, reversível e extremamente simples de operar**, aproveitando a infraestrutura existente em vez de destruí-la para reconstruí-la só porque uma IA ficou empolgada com um framework novo.