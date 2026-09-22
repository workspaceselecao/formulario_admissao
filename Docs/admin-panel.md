# Painel Administrativo — Manual e Documentação Técnica

> **Reestruturação v3 (entidades):** a navegação segue o modelo de entidades —
> **Visão Geral · Formulários · Templates · Editor Visual · Cidades & Regionais ·
> Configurações · Validação · Histórico · Segurança** — com as ferramentas
> técnicas (Assistência, Dados & Backups, Regras, Sistema) no sub-menu
> **“Mais ferramentas”**. Novidades: detalhe do formulário com abas,
> versionamento de templates PDF, validação pré-publicação, Alterações
> Pendentes (publicar/descartar), Command Palette **Ctrl+K**, snap-to-grid e
> seleção múltipla no editor, exportação de cidades, duplicação e Modo de
> Teste com formulário de dados fictícios. Detalhes abaixo.

**Rota:** `/admin` (servido do arquivo físico `admin/index.html` — índice do diretório)
**Acesso:** autenticação **apartada** de dois fatores — qualquer e-mail com domínio **exatamente `@atento.com`** + um dos **códigos de acesso exclusivos do painel** (formato `ATN-XXXX-XXXX-XXXX`). Os códigos dos formulários públicos **não** autorizam este painel.

---

## Como acessar

1. Na **Home**, clique no card **Configurações** (substituiu o card Termos de Aceite) ou use o item **⚙ Configurações** do menu;
2. Informe seu e-mail **@atento.com**;
3. Informe o **código de acesso exclusivo do painel**;
4. **Validar acesso** — a sessão administrativa dura 60 minutos e se renova automaticamente enquanto a página estiver em uso;
5. Para sair, use o botão **Sair** no cabeçalho do painel — a sessão é encerrada e você retorna à Home do Hub.

> **Limitação (documentada por decisão de projeto):** a verificação é client-side,
> do mesmo tipo do `guard.js`. Não é autenticação server-side e não deve ser
> apresentada como controle de acesso forte. Para operações destrutivas em
> produção, a evolução recomendada é autenticação server-side.

## Detalhe do formulário (§9 — v3)

**Formulários** lista cada fluxo com código, rota, template (+ nº da versão),
quantidade de campos e cidades associadas. **Abrir** mostra a área dedicada com
abas **Geral / Campos / Template / Regras / Cidades / Histórico** e ações
**Editar** (nome de exibição, via `overlay.forms_meta`), **Testar** (abre o
Modo de Teste no Editor Visual) e **Duplicar** (cria um registro administrativo
`forms_meta[CODIGO-COPIA]` — a estrutura/rota do formulário continua definida no
código; nada é executado a partir da configuração). O botão **← Formulários** volta à lista.

## Field Builder: criar, renomear e excluir campos (§10 — v3)

A aba **Campos** do detalhe de formulário ganhou CRUD de campos com **IDs estáveis**:

- **＋ Campo** abre o drawer lateral com rótulo, tipo (texto, número, CPF,
  telefone, data, e-mail, seleção, radio, checkbox, imagem, assinatura), página,
  obrigatoriedade, coordenadas, **seção de destino (select restrito às seções
  que já existem no schema)** e opções (`valor|Rótulo`, uma por linha, para
  radio/checkbox/seleção). No **Editor Visual** há o mesmo atalho (**＋ Novo campo**);
- **ID estável:** o identificador é gerado **uma única vez** a partir do rótulo
  (sem acentos, minúsculo, `snake_case`, colisão → sufixo `_2`, `_3`… checando o
  JSON **efetivo**). Em renomeações um **novo ID é gerado** e o antigo nunca é
  reutilizado — o rótulo é só display; patches de coordenadas do id antigo
  migram para o novo caminho;
- **Exclusão segura:** bloqueada quando o campo é alvo de `dependencia` no
  schema (evita dependência órfã na aplicação pública); campos base entram como
  `{ "excluir": true }` e podem ser desfeitos no Histórico;
- **Gravação no overlay:** cada operação cria pendência em
  `overlay.campos_custom[docKey]` (lote por schema), com evento append-only e
  reverso no Histórico. O JSON do repositório **permanece intacto** até a
  exportação — contrato “estrutura é código”;
- **Nenhuma seção nova:** o painel não cria seções nem altera a estrutura do
  JSON do repositório — campos novos entram **somente em seções existentes**
  (criar sem seção válida é rejeitado na gravação e no gate de publicação);
- **Aplicação idempotente:** o overlay é aplicado sobre o JSON base a cada
  reconstrução (criar → insere na seção existente escolhida;
  renomear → recria com novo ID preservando conteúdo; excluir → remove). Aplicar
  duas vezes produz o mesmo resultado;
- **Publicação validada:** o gate de publicação (§24) valida o schema efetivo
  completo — coordenadas inválidas, grupo de opções vazio e `dependencia`
  apontando para campo inexistente são **erros críticos** que travam a
  publicação; campos fora da página são avisos.

## Templates: versionamento e validação (§18/§19 — v3)

Substituir um PDF agora executa o fluxo **upload → validar → motivo → testar → publicar**:

1. **Validação automática** do arquivo: assinatura `%PDF-`, tamanho (limite
   configurável em **Configurações → PDFs**), páginas e dimensões (pdf-lib).
   Erro estrutural **bloqueia** o upload com mensagem acionável;
2. **Comparação estrutural** com a versão publicada: páginas a menos/mais,
   mudança de dimensões por página e variação de tamanho > 40% geram avisos
   explícitos (ex.: “Este PDF possui 2 páginas a menos que a versão publicada”);
3. **Motivo obrigatório** da substituição (registrado no histórico);
4. **Nova versão** registrada em `overlay.templates_versoes[arquivo]` =
   `{ atual, anterior, historico }` com data, sha256, bytes e info de páginas;
5. No modo API o servidor mantém o arquivo físico de **cada versão**
   (`data/uploads/nome__TIMESTAMP.pdf` + `data/uploads.json`) —
   `GET /api/admin/uploads` lista as versões;
6. **Rollback** (§26): “Restaurar vN” **não apaga** a versão atual — cria
   `vN+1 = restauração de vN` e recoloca o arquivo físico anterior
   (`POST /api/admin/uploads/restaurar`). Trilha de auditoria sempre preservada.

A lista de versões por template fica abaixo da tabela de Templates.

## Editor Visual: snap, atalhos e multi-seleção (§11/§12 — v3)

* **Snap to grid** (1/5/10 pts) com caixa de seleção na toolbar;
* **Atalhos:** setas = mover 1 pt · **Shift+setas** = 5 pts · **Alt+setas** = 0,5 pt
  (ajuste fino) · **R** = restaurar campo selecionado · **Esc** = limpar seleção múltipla;
* **Redimensionar** pelo canto inferior direito da caixa selecionada;
* **Seleção múltipla** (Ctrl/Cmd+clique, limitada à página visível) com barra
  **Alinhar / Distribuir / Restaurar / Limpar** por eixo X ou Y;
* Lista lateral e canvas permanecem sincronizados nos dois sentidos (T4).

## Modo de Teste (§13 — v3)

**Editor Visual → Visualizar PDF de teste** abre o formulário de dados fictícios
(nome, CPF, telefone, e-mail, datas — pré-preenchidos) e gera o **PDF preenchido**
com esses valores. Opção **“Abrir também o PDF original”** para comparação
**original | preenchido**. Nenhum dado real é usado ou retido.

## Cidades: duplicar e exportar (§15/§17 — v3)

* **Duplicar** em qualquer linha cria uma nova entrada no overlay
  (`cidade (cópia)`) com a mesma ficha;
* **Exportar** (JSON ou CSV, com BOM para Excel) respeita **os filtros ativos**
  (busca, UF, ficha, filtro da Saúde) — o arquivo inclui a coluna `origem`;
* Importação valida **UF inválida (27 estados)** e **ficha inexistente**.

## Alterações Pendentes e publicação (§23/§24 — v3)

O Dashboard mostra o painel **Alterações Pendentes**: tudo que está no overlay e
ainda não foi marcado como publicado (`pendentesMarcados`).

* **Publicar** executa a **validação pré-publicação**: erro crítico (campo sem
  coordenada, cidade com ficha sem template) **bloqueia**; aviso (coordenada fora
  da página, UF suspeita) exige confirmação. Publicar registra um **marco**
  append-only — nada é apagado;
* **Descartar** remove os patches pendentes por grupo; cidades novas sem
  substituto na base são **preservadas** para não deixar mapeamento sem template;
* O relatório completo de integridade também está na seção **Validação**.

## Command Palette (§28 — v3)

**Ctrl+K** (ou ⌘K) abre a busca global: formulários, cidades, templates, campos
(sem acento/case) e seções. **Enter** abre o primeiro resultado; **Esc** fecha.
A dica “Ctrl + K para buscar” fica visível no cabeçalho.

## Configurações (§22 — v3)

Parâmetros por categoria (**Geral, Formulários, PDFs, Cidades, Segurança**),
salvos em `overlay.configuracoes` com leitura via default
(`configGet`/`configSetPath`; int limitada ao range definido). Toda alteração
registra evento no histórico.

## Modelo de dados — overlay v3 (§32/§33)

```json
{
  "campos_ficha": {},
  "campos_declaracao": {},
  "campos_custom": {},
  "cidades": {},
  "cidades_novas": [],
  "pdfs_meta": {},
  "forms_meta": {},
  "templates_versoes": {},
  "configuracoes": {}
}
```

`forms_meta`, `templates_versoes`, `configuracoes` e `campos_custom` são **novos
e opcionais** — overlays v1/v2 são migrados por normalização na carga (nenhum dado
é descartado e nenhuma chave antiga muda de formato). A exportação v3 inclui as
chaves novas; a importação aceita arquivos v1/v2 (campos ausentes = sem alteração)
e apresenta o diff por grupo antes de aplicar.

## Saúde do Sistema (Dashboard)

Ao abrir o **Dashboard**, a subseção **Saúde do Sistema** executa automaticamente uma verificação (sem rede) e mostra 🟢 íntegro / 🟡 itens de atenção / 🔴 erros críticos. Cada problema é um **link** que abre a seção correspondente já filtrada:

* "N cidade(s) com ficha não mapeada para PDF" → abre **Cidades** mostrando exatamente essas cidades (com chip de filtro removível);
* "PDF inacessível: …" → abre **PDFs** com a busca preenchida;
* "Coordenada inválida / fora da página" → abre o **Editor** no documento e campo correspondentes.

A verificação **completa** (com teste de acesso HTTP a templates e páginas) continua na seção **Segurança → Verificar integridade**; seu resultado também alimenta a Saúde do Dashboard. Ambas usam o mesmo coletor interno.

## Como editar cidade (qualquer origem)

1. Painel → **Cidades** → botão **Editar** em qualquer linha (JSON de origem ou overlay);
2. O modal permite alterar **cidade, UF, regional e ficha** (formModal com validação inline);
3. Duplicidade é revalidada com a mesma normalização da aplicação, **excluindo a própria linha** em edição;
4. Cidade do JSON: grava um **patch completo** `{ cidade, uf, regional, ficha }` no overlay (chaveado pela normalização do nome **original** — renomear não quebra a referência). Patches antigos `{ ficha }` continuam lidos;
5. Cidade do overlay: editada pelo `id` estável.

## Paginação e busca de cidades

A tabela mostra **50 cidades por página** (constante `CIDADES_POR_PAGINA` em `panel.js`), com contagem "N cidade(s) encontradas" e controles de página. Toda mudança de filtro volta à página 1. **Nenhum resultado é cortado silenciosamente.**

## Trocar ficha em massa

1. Selecione cidades pelos checkboxes ("selecionar todos" vale só para a página atual);
2. Na barra azul: escolha a ficha destino → **Aplicar**;
3. Confirme (a caixa mostra a quantidade e uma amostra das cidades afetadas);
4. **Um único evento agregado** é registrado no Histórico (ex.: `alteracao_cidade_massa`).

## Importar cidades (CSV/JSON) com preview

1. Painel → **Cidades** → **⬆ Importar CSV/JSON**;
2. Formatos aceitos: CSV com cabeçalho `cidade;uf;regional;ficha` (separador `,` ou `;`) ou JSON (array de objetos, aceita também o formato do `cidades_brasil.json`). **XLSX não é suportado** (exigiria biblioteca nova fora do build atual);
3. O **preview obrigatório** mostra: "N registros encontrados · N válidos · N duplicados · N inválidos (motivo)", com listas separadas;
4. Aplicar insere **somente os válidos** no overlay; duplicados/inválidos são apenas listados para revisão.

## Como editar metadados de PDF

Painel → **PDFs** → **Editar** em qualquer linha: altera `tipo` e `formulario` **exibidos** no painel/Dashboard/Assistência (via `overlay.pdfs_meta`, sem deploy). **O arquivo físico não é alterado por aqui** — a troca de template continua sendo exclusivamente pelo fluxo de upload/substituição (modo API).

## Editor de Coordenadas — busca e restauração granular

* **Lista de campos** ao lado do painel de propriedades: busca por label/seção/chave; itens com edição pendente levam um marcador (•); clicar seleciona o campo no canvas (trocando de página quando necessário);
* **↩ Restaurar este campo**: habilitado só quando o campo selecionado tem alteração pendente; reverte **apenas aquele campo** ao valor salvo no overlay (ou ao original, se nunca teve overlay) — as demais edições pendentes são preservadas (diferente de **Cancelar**, que descarta tudo).

## Importar configuração com diff campo a campo

**Dados → Importar configuração** agora calcula a diferença por chave (`campos_ficha`, `campos_declaracao`, `cidades`, `cidades_novas`, `pdfs_meta`) e mostra **novos**, **alterados (de → para)** e **idênticos (recolhidos)** em checkboxes marcados por padrão. Desmarque o que não deve entrar e aplique — só o que continuar marcado é mesclado no overlay. Cidades já existentes (overlay ou base) não são reimportadas.

## Histórico — filtros e desfazer

* **Filtros**: busca por texto (entidade/alteração) + select de **ação** + select de **usuário** — aplicados **antes** do corte de 200 itens exibidos;
* **↩ Desfazer**: disponível em eventos que guardam valor anterior (`reverso`). A reversão **não apaga o evento original** — cria um **novo** evento `desfazer` (com seu próprio reverso, permitindo desfazer o desfazer). A trilha completa permanece (v1 → v2 → v3 → v4=restauração de v2);
* **Ir para o registro**: eventos sem reverso automático navegam para a tela correspondente para reversão manual — **não é undo automático** (indicado no botão).

## Selos "Editável" vs "Somente leitura"

Todas as tabelas do painel indicam o que pode ser alterado ali mesmo:

* <span>✎ Editável</span> — o valor é editável pelo painel (vai para o overlay);
* <span>🔒 Somente leitura — código</span> — o registro é definido no código (alterar depende de desenvolvimento).

Formulários e Regras são sempre somente leitura; Cidades são sempre editáveis; PDFs têm tipo/formulário editáveis (Tarefa acima) e arquivo físico trocável só por upload.

## Como adicionar PDF

1. Painel → **PDFs** → **+ Adicionar PDF**;
2. Requer **modo API** (em produção estática o upload é bloqueado com aviso — versionar o PDF no repositório);
3. O arquivo é validado (extensão, MIME e assinatura `%PDF-`, limite de 20 MB), o nome é sanitizado e gravado em `data/uploads/`.

## Como substituir template

1. Painel → **PDFs** → seção **Substituir template**;
2. Selecione o template e o novo PDF → **Enviar substituição**;
3. Confirme na caixa de diálogo (o anterior vira backup automático em `data/backups/`);
4. Se o layout mudou, revise as coordenadas no Editor — o painel avisa disso.

## Como alterar coordenada (F-075 e Declaração)

1. Painel → **Coordenadas**;
2. Selecione o documento e a página;
3. Clique no campo desenhado sobre o PDF e **arraste**, ou digite X/Y/Largura/Altura (os dois modos ficam sincronizados);
4. **Salvar alterações** → revise o resumo (antes → depois) → confirme.

Sistema de coordenadas preservado: origem no canto **inferior esquerdo**, Y cresce para cima, unidade em pontos (pt) — idêntico ao pdf-lib.

## Como testar (preview)

- Painel → **Coordenadas** → **Visualizar PDF de teste**: gera um PDF com **dados fictícios** (nunca dados reais) sobre o template real, usando as coordenadas atuais do overlay.

## Como adicionar cidade

1. Painel → **Cidades** → **+ Nova cidade**;
2. Preencha cidade, UF, regional e ficha → **Adicionar cidade**;
3. A duplicidade é bloqueada usando a **mesma normalização da aplicação** (sem acentos, maiúsculas, espaços colapsados) e a correção histórica FICHA REEBOLSO → FICHA REEMBOLSO é preservada;
4. Para alterar a ficha de uma cidade existente, use **Alterar ficha** na linha da tabela.

## Como exportar / importar configuração

- **Dados → Exportar JSON**: baixa `admin-config-AAAA-MM-DD.json` com todo o overlay (campos alterados, associações, cidades novas);
- **Dados → Importar configuração**: valida a estrutura e mostra **antes de aplicar** quantos registros serão adicionados/alterados; exige confirmação.

## Como interpretar erros

| Mensagem | Causa | Ação |
|---|---|---|
| "Modo exportação" no Dashboard | API administrativa não disponível no ambiente | Use `node scripts/test-server.mjs` (dev) ou exporte/versione o JSON |
| "Upload de PDF exige o modo API" | Produção estática sem backend | Versione o PDF no repositório |
| "Cidade já cadastrada" | Normalização colidiu com entrada existente | Edite a ficha da entrada existente |
| "Falha ao carregar template" | PDF ausente/inacessível | Rode **Verificar integridade** (Segurança) |
| "✕ Não foi possível autorizar este acesso." | Domínio do e-mail inválido ou código incorreto | Mensagem é genérica de propósito (não revela detalhes) |

## Arquitetura de persistência (decisão importante)

- O painel **nunca edita os JSONs originais** nem usa **localStorage** como banco (proibição do projeto).
- Modelo de **overlay administrativo** sobre os JSONs:
  - **Modo API** (desenvolvimento / com backend): grava em `data/admin-config.json` com **backup automático** a cada salvamento (`data/backups/`), uploads em `data/uploads/`, auditoria em `data/historico.json`. Implementado em `scripts/test-server.mjs` (`/api/admin/*`), pronto para portar para serverless na Vercel.
  - **Modo exportação** (produção estática): overlay vive na sessão (sessionStorage, mesmo padrão do guard); **Exportar JSON** → versionar no repositório para efetivar na aplicação pública.
- Para que uma alteração do painel chegue ao PDF do candidato no modo exportação, o caminho é: **Painel → Exportar JSON → commit → deploy → aplicação pública**. No modo API, o backend pode servir o overlay para a aplicação pública (evolução prevista).

## Segurança

- Verificação (dois fatores, apartada): ① e-mail normalizado → domínio **exatamente** `@atento.com` (recusa subdomínios e `atento.com.br`); ② código exclusivo do painel → pipeline salt+SHA-256+transformação idêntico ao `guard.js` → comparado ao corpus próprio `CG` em `admin-guard.js` (códigos reais fora do código; gerados por `scripts/generate-admin-verifiers.mjs`). Os 5 verificadores do `guard.js` dos formulários são independentes e intocados.
- Upload: validação de extensão/MIME/assinatura, limite de 20 MB, sanitização de nome (bloqueia `../`), armazenamento como arquivo (sem execução).
- Sessão: `sessionStorage` (chaves `adm_*`) com expiração e renovação por atividade; **Sair** invalida a sessão e redireciona à Home do Hub (via `location.replace`, sem retorno ao painel pelo botão Voltar).
- Auditoria: login, alterações de coordenadas, cidades, uploads, importações/exportações e verificações de integridade ficam no **Histórico**.

## Testes

`node scripts/run-test.mjs` cobre (Testes 9–13): painel servido, `admin-guard.js` (sem e-mails reais, sem uso de localStorage), regra de domínio da seção 69 do prompt (12 casos), corpus de verificadores derivados, sidebar nas 4 páginas e integração da API administrativa (config/backup/upload/histórico).

O **Teste 14** cobre o painel v2 (Tarefas 0–7): elementos novos servidos (formOverlay, saúde, paginação, bulk, import, lista de campos, filtros de histórico, selos), ausência de localStorage, e comportamento puro executado em `node:vm` via `AdminPanel.__teste` — patch antigo/novo de cidade, ID estável/`origemChave`, classificação de importação (válidos/duplicados/inválidos), parser CSV/JSON, `pdfs_meta`, diff de importação com desmarque, paginação completa, pendência/restauração de campo e filtros de histórico antes do corte de 200.
