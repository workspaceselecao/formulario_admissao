# Painel Administrativo — Manual e Documentação Técnica

**Rota:** `/admin` (rewrite para `admin/admin.html`)
**Acesso:** e-mail corporativo **@atento.com** (verificação client-side, mesmo princípio do `guard.js`)

---

## Como acessar

1. Abra o site e abra o menu (hambúrguer no cabeçalho) em qualquer formulário;
2. Clique em **⚙ Configurações** (item novo da sidebar);
3. Informe seu e-mail **@atento.com** e confirme em **Validar acesso**;
4. A sessão administrativa dura 60 minutos e se renova automaticamente enquanto a página estiver em uso (mesmo mecanismo de sessão do `guard.js`);
5. Para sair, use o botão **Sair** no cabeçalho do painel.

> **Limitação (documentada por decisão de projeto):** a verificação é client-side,
> do mesmo tipo do `guard.js`. Não é autenticação server-side e não deve ser
> apresentada como controle de acesso forte. Para operações destrutivas em
> produção, a evolução recomendada é autenticação server-side.

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
| "✕ Não foi possível autorizar este acesso." | E-mail fora do domínio ou sem permissão | Mensagem é genérica de propósito (não revela detalhes) |

## Arquitetura de persistência (decisão importante)

- O painel **nunca edita os JSONs originais** nem usa **localStorage** como banco (proibição do projeto).
- Modelo de **overlay administrativo** sobre os JSONs:
  - **Modo API** (desenvolvimento / com backend): grava em `data/admin-config.json` com **backup automático** a cada salvamento (`data/backups/`), uploads em `data/uploads/`, auditoria em `data/historico.json`. Implementado em `scripts/test-server.mjs` (`/api/admin/*`), pronto para portar para serverless na Vercel.
  - **Modo exportação** (produção estática): overlay vive na sessão (sessionStorage, mesmo padrão do guard); **Exportar JSON** → versionar no repositório para efetivar na aplicação pública.
- Para que uma alteração do painel chegue ao PDF do candidato no modo exportação, o caminho é: **Painel → Exportar JSON → commit → deploy → aplicação pública**. No modo API, o backend pode servir o overlay para a aplicação pública (evolução prevista).

## Segurança

- Verificação: e-mail normalizado → domínio **exatamente** `@atento.com` (recusa subdomínios e `atento.com.br`) → pipeline salt+SHA-256+transformação idêntico ao `guard.js` → comparação com verificadores derivados (e-mails reais não ficam no código).
- Upload: validação de extensão/MIME/assinatura, limite de 20 MB, sanitização de nome (bloqueia `../`), armazenamento como arquivo (sem execução).
- Sessão: `sessionStorage` com expiração e renovação por atividade; **Sair** invalida a sessão.
- Auditoria: login, alterações de coordenadas, cidades, uploads, importações/exportações e verificações de integridade ficam no **Histórico**.

## Testes

`node scripts/run-test.mjs` cobre (Testes 9–13): painel servido, `admin-guard.js` (sem e-mails reais, sem uso de localStorage), regra de domínio da seção 69 do prompt (12 casos), corpus de verificadores derivados, sidebar nas 4 páginas e integração da API administrativa (config/backup/upload/histórico).
