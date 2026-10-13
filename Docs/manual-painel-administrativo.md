# Manual de Utilização — Painel Administrativo

Manual operacional para usuários ADM: passo a passo de todos os fluxos do painel
(`/admin`), do login à publicação. Documento técnico de referência:
`Docs/admin-panel.md`.

---

## 1. Acesso

1. Na Home do Hub, clique no card **Configurações** ou no item **⚙ Configurações** do menu.
2. Informe seu e-mail **@atento.com** (domínio exato; subdomínios e `atento.com.br` são recusados).
3. Informe o **código de acesso exclusivo do painel** (formato `ATN-XXXX-XXXX-XXXX`). Códigos dos formulários públicos **não** funcionam aqui.
4. Clique em **Validar acesso**. A sessão dura **60 minutos** e se renova sozinha enquanto a página estiver em uso.
5. Para sair, clique em **Sair** no cabeçalho. Se a mensagem for genérica ("Não foi possível autorizar"), confira e-mail e código — ela não revela detalhes de propósito.

> A verificação é client-side (não é controle de acesso forte). Não compartilhe seu código.

## 2. Conceito essencial (leia antes de editar)

- O painel **nunca edita os arquivos do repositório**. Toda edição vai para um **overlay administrativo** (rascunho da sessão).
- A aplicação pública lê os **JSONs/PDFs do repositório**. Para uma edição chegar ao público, é preciso **exportar o arquivo efetivo → substituir no repositório → commit/push** (o servidor republica o site).
- **Publicar alterações** no Dashboard valida e registra o **marco de publicação** — não dispensa a etapa de exportar/versionar (ver §4).
- Exceção: **Configurações do painel** valem só para o painel (não alteram a aplicação pública).

| O que você editou | Arquivo a levar ao repositório | Botão (Dados & Backups) |
|---|---|---|
| Coordenadas (Editor Visual) | `ficha_cadastral_campos.json` / `declaracao_plano_saude_campos.json` | ⬇ do schema correspondente |
| Campos (Field Builder) | o mesmo `*_campos.json` do formulário | idem (já vem incluído) |
| Cidades / fichas | `cidades_brasil.json` **e** `cidades_infinity.json` | ⬇ de cada um |
| Template embarcado | `template.json` na pasta do documento | ⬇ template do documento embarcado |
| Template PDF (troca de arquivo) | o PDF na raiz | upload exige **modo API**; em produção, versione o PDF no repositório |
| Configurações do painel | — (só o painel) | — |

## 3. Fluxo padrão de publicação (vale para qualquer ajuste)

1. Faça a edição na seção correspondente (Cidades, Editor, Campos etc.) e confirme/aplique — ela entra no overlay e aparece em **Alterações Pendentes** no Dashboard.
2. Abra **✓ Validação** e confira o relatório:
   - **Erro crítico** → corrija na origem antes de publicar (a publicação trava).
   - **Só avisos** → dá para publicar com confirmação.
3. No Dashboard, clique em **Publicar alterações** (registra o marco; nada é apagado).
4. Vá em **⌗ Dados & Backups → Exportar arquivos do repositório (efetivos)** e baixe o(s) arquivo(s) da tabela do §2.
5. Substitua o arquivo de **mesmo nome na raiz do repositório** pelo baixado.
6. `commit` + `push` → deploy. Confira na aplicação pública.
7. Se algo sair errado, veja **Histórico** (§11) para desfazer no painel, ou reverta o commit no repositório.

> Com overlay vazio, o arquivo exportado é idêntico ao do repositório — serve para conferir, não para alterar.

## 4. Dashboard (Visão Geral)

- **Cards**: Formulários, Templates PDF, Cidades, Campos F-075, Campos Declaração, Fichas Regionais, Alterações Pendentes, Cidades sem Associação, Formulários sem PDF, Modo de Persistência.
- **Saúde do Sistema**: verificação automática (sem rede) ao abrir. 🟢 íntegro / 🟡 atenção / 🔴 crítico. Cada problema é um **link** que abre a seção certa já filtrada.
- **Alterações Pendentes**: lista o que está no overlay e ainda não foi publicado.
  - **Publicar alterações** → valida (§10), registra o marco, persiste o overlay da sessão.
  - **Descartar pendências** → pede confirmação com a quantidade afetada e remove os patches por grupo. **Cidades novas sem substituto na base são preservadas** (para não deixar mapeamento sem template). É destrutivo: confira antes.

## 5. Cidades & Regionais

Tabela com busca, filtros (UF, ficha, filtro da Saúde) e **50 cidades por página** — trocar de filtro volta à página 1. Ações por linha:

- **Adicionar cidade** (`+ Nova cidade`): preencha cidade, UF, regional e ficha → **Adicionar cidade**. Duplicidade é bloqueada pela normalização (sem acentos/maiúsculas).
- **Editar**: altera cidade, UF, regional e ficha (validação inline; duplicidade revalidada excluindo a própria linha). Cidade do JSON grava patch completo no overlay; cidade do overlay é editada pelo id estável.
- **Duplicar**: cria `cidade (cópia)` no overlay com a mesma ficha.
- **Remover**: aparece só para cidade do overlay — remove apenas a entrada administrativa (o JSON do repositório não é tocado), com confirmação.
- **Alterar ficha**: troca a ficha de uma cidade existente.
- **Troca em massa**: marque cidades nos checkboxes (o "selecionar todos" vale só para a página atual) → na barra azul escolha a ficha destino → **Aplicar** → confirme (mostra quantidade e amostra). Gera **um único evento** no Histórico.
- **Importar** (`⬆ Importar CSV/JSON`): CSV com cabeçalho `cidade;uf;regional;ficha` (`,` ou `;`) ou JSON array (aceita o formato do `cidades_brasil.json`; **XLSX não suportado**). O **preview obrigatório** mostra válidos/duplicados/inválidos com motivo → **Aplicar** insere só os válidos. UF inválida e ficha inexistente barram o registro.
- **Exportar** (`⬇ Exportar` → **JSON** ou **CSV**): baixa `cidades-AAAA-MM-DD.{json|csv}` **respeitando os filtros ativos** (inclui coluna `origem`). Registra evento no Histórico.

## 6. Assistência (mapa regional)

Seção de leitura do mapa **ficha → arquivo PDF + cidades** (ex.: `FICHA REEMBOLSO → FICHA REEMBOLSO.pdf — N cidade(s)`). Para mudar qual ficha uma cidade usa, edite a cidade em **Cidades & Regionais** (§5) — aqui não há edição direta.

## 7. Formulários

- **Lista**: busque em **Pesquisar formulário…** (nome/código/rota). Clique no nome ou em **Abrir**.
- **Detalhe**: topo com `← Formulários` (volta), código/status/rota/arquivo e ações:
  - **✎ Editar** → modal `Editar metadados de CÓDIGO`, campo **Nome de exibição** → **Salvar**.
  - **▶ Testar** → sem documento associado abre a rota em nova aba; com documento, gera o PDF preenchido com dados fictícios.
  - **⧉ Duplicar** → modal `Duplicar formulário CÓDIGO` (**Código do clone**, **Nome**) → **Duplicar**. Cria registro administrativo; estrutura/rota continuam no código.
- **Abas**: **Geral** (só leitura) · **Campos** (lista por seção; **Editar** em todos, **Excluir** só em campo do painel; `✥ Editar layout` vai ao Editor; `＋ Campo` abre o Field Builder; `Desfazer operação` remove a pendência) · **Template** (arquivo/versão/rollback; `Enviar nova versão` leva a Templates; `↩ Restaurar versão anterior` faz rollback) · **Regras** (leitura, com selos ✎/🔒) · **Cidades** (F-089 lista fichas com link `gerenciar`) · **Histórico** (últimos 30 eventos do formulário).

## 8. Templates (PDFs)

- Busque em **Pesquisar template…**. Por linha: **Visualizar** (abre o PDF) e **Editar** (modal `Editar metadados do template`: Tipo e Formulário → **Salvar** — não toca o arquivo físico).
- **+ Adicionar PDF** (exige **modo API** — `node scripts/test-server.mjs`; em produção estática, versione o PDF no repositório): escolha o PDF → valida assinatura `%PDF-`, tamanho (limite em Configurações → PDFs), páginas/dimensões → confirme **Adicionar PDF**.
- **Substituir template**: selecione **Template** + **Novo PDF** → **Enviar substituição** → o painel compara com a versão publicada (páginas a menos/mais, dimensões, variação de tamanho > 40% geram avisos e pedem revisão das coordenadas) → informe o **Motivo** (obrigatório) → confirme. Registra nova versão com data, sha256, páginas e motivo.
- **Versões de templates** (abaixo da tabela): selo `vN — Publicado`, data, hash, histórico + **↩ Restaurar vN** (cria `vNova = restauração de vAntiga`, sem apagar a trilha; em modo API recoloca o arquivo físico).

## 9. Editor Visual (Coordenadas)

1. Selecione o **documento** (`Ficha Cadastral (F-075)` ou `Declaração Plano de Saúde`) e a **Página**.
2. Localize o campo na lista lateral (**Campos de dado** / **Campos do documento**) ou clique/arraste a caixa direto no PDF. Redimensione pelo canto inferior direito.
3. Ajuste: arrastar (com **Snap to grid** 1/5/10 pts), **setas** (1 pt) · **Shift+setas** (5 pts) · **Alt+setas** (0,5 pt), ou digite **X / Y / Largura / Altura**. Cores: laranja = dado · azul = texto fixo · verde = caixinha. Página e fonte são somente leitura.
4. **Seleção múltipla**: `Ctrl/Cmd+clique` (mesma página) → barra com eixo **X/Y** + **Alinhar** / **Distribuir** (3+) / **↩ Restaurar** / **Limpar** (`Esc`).
5. **Salvar alterações** → confira o resumo `campo + propriedade: antes → depois` → **Salvar** (vai ao overlay + Histórico, com reverso).
6. **↩ Restaurar este campo** (ou tecla **R**): reverte só o campo selecionado, preservando as demais pendências. **Cancelar** descarta tudo que não foi salvo.
7. **Visualizar PDF de teste** (ou `▶ Testar` no formulário): formulário de dados fictícios pré-preenchidos → **Gerar PDF preenchido** (nova aba; marque **Abrir também o PDF original** para comparar). Nenhum dado real é usado.

## 10. Field Builder (criar/alterar campos)

Em **Formulários → detalhe → aba Campos**, clique **＋ Campo** (atalho também no Editor: **＋ Novo campo**):

1. Preencha **Rótulo**, **Tipo** (texto, número, CPF, telefone, data, e-mail, seleção, radio, checkbox, imagem, assinatura), **Página**, **Obrigatório**, **X/Y/Largura/Altura**, **Seção de destino** (obrigatória; só seções que já existem no schema) e **Opções** (`valor|Rótulo`, uma por linha, para radio/checkbox/seleção). Confira **Aplicar ao formulário**.
2. **Gravar no overlay** → confirme **Gravar**. O ID é gerado uma vez (`snake_case` do rótulo; colisão → `_2`, `_3`…).
3. **Renomear** gera **ID novo** (o antigo nunca é reutilizado; patches de coordenadas migram).
4. **Excluir** (só campo do painel): **bloqueada** se alguma `dependencia` aponta para o campo (mostra onde). Campos base entram como exclusão pendente e podem ser desfeitos no Histórico.
5. O lote pendente mostra selos `criar/renomear/excluir`; **Desfazer operação** remove a pendência.

## 11. Documentos Embarcados

Abas **Templates Embarcados · Comparação · Logs**. O PDF é gerado pelo próprio app (template + schema) — nenhum PDF externo é carregado.

- **Templates Embarcados**: escolha documento/página/zoom → **▶ Gerar PDF de teste**; busque por chave/rótulo/coordenada; o campo selecionado mostra X/Y/Largura/Altura e a pendência; **✥ Ajustar no Editor Visual** edita a mesma chave de overlay.
- **Comparação**: sobreponha ao PDF oficial (opacidade + tolerância) → **Comparar**; mostra deslocamento estimado e % divergente.
- **Logs**: trilha da sessão por documento/autor/data.
- Para versionar: **Dados → ⬇ template do documento embarcado** → substitua o `template.json` na pasta do documento → commit.

## 12. Validação

Abre o **Relatório de integridade** automaticamente: coordenadas, cidade→ficha com template, schema do Field Builder, `template.json` embarcado.

- **Erro crítico** (✕): corrija na origem (Editor/Cidades/Templates) — a publicação fica **bloqueada**.
- **Aviso** (⚠): dá para publicar confirmando (`Publicar com avisos` / `Publicar mesmo assim`).

## 13. Histórico

Filtros (aplicados antes do corte de 200): **busca por texto** (entidade/alteração) + **Ação** + **Usuário**.

- Evento com reverso → **↩ Desfazer** (cria um **novo** evento `desfazer`; o original é preservado — dá para desfazer o desfazer).
- Evento sem reverso → **Ir para o registro** (leva à tela certa para reversão manual).

## 14. Segurança

- **Controles aplicados**: lista informativa (e-mail + código, sessão 60 min, upload validado, sem localStorage como banco etc.).
- **Verificar integridade** → **Executar verificação** (aguarda `Verificando…`): checagem **completa com rede** (acesso aos templates/páginas), diferente da Saúde rápida do Dashboard. Resultado registrado no Histórico.

## 15. Dados & Backups

- **Exportar JSON** (`Exportar configuração`): baixa `admin-config-AAAA-MM-DD.json` — **backup/transferência do overlay**, não alimenta a app pública.
- **Exportar arquivos do repositório (efetivos)**: `⬇ ficha_cadastral_campos.json` · `⬇ declaracao_plano_saude_campos.json` · `⬇ cidades_brasil.json` · `⬇ cidades_infinity.json` · `⬇ template do documento embarcado`. Substitua na raiz e comite (§2–§3).
- **Importar configuração**: valida a estrutura e mostra o **diff por grupo** (novos / alterados `de → para` / idênticos recolhidos) com checkboxes — só o marcado é aplicado. Exportar e reimportar na mesma sessão dá `0 novo(s) · 0 alterado(s)` (correto: nada mudou). Para transportar entre ambientes, importe em outra aba/navegador.
- **Backups**: em modo API, automáticos a cada salvamento (`data/backups/`). Em produção estática: indisponíveis — use o Exportar JSON como backup local.

## 16. Configurações

Categorias **Geral, Formulários, PDFs, Segurança** (+ Documentos). Alterne Ativado/Desativado ou edite número/texto — salva no overlay e registra evento `antes → depois`:

| Chave | Efeito |
|---|---|
| `geral.nome_sistema` | Título da aba e seção Sistema |
| `geral.manutencao` | Faixa de aviso no Dashboard |
| `formularios.validar_uf` | Valida UF no cadastro/importação de cidade |
| `formularios.exigir_template` | Cidade sem template trava (ligado) ou só avisa (desligado) a publicação |
| `pdfs.limite_mb` | Tamanho máximo no upload de template |
| `pdfs.manter_versoes` | Trilha completa de versões × só atual+anterior |
| `seguranca.confirmar_destrutivas` | Confirmação em descartar/excluir/remover/rollback |
| `documentos.tolerancia_visual_pt` | Tolerância da comparação oficial × embarcado |

## 17. Regras e Sistema (leitura)

- **Regras**: lista das regras de negócio com selos **✎ Editável** (editável no painel, vai ao overlay) e **🔒 Somente leitura — código** (depende de desenvolvimento). Formulários e Regras são sempre somente leitura.
- **Sistema**: modo de persistência (API × exportação), contagens e informações do ambiente.

## 18. Atalhos

- **Ctrl+K** (ou ⌘K): busca global (formulários, cidades, templates, campos, seções). **Enter** abre o 1º resultado; **Esc** fecha.
- No Editor: setas / Shift+setas / Alt+setas · **R** restaurar · **Esc** limpar seleção · **L** alinhar · **Shift+L** distribuir.

## 19. Se algo der errado

| Sintoma | Causa provável | Ação |
|---|---|---|
| Publiquei, mas a pública não mudou | Faltou exportar/versionar (§3) | Exportar arquivo efetivo → substituir → commit/push |
| Publicação bloqueada | Erro crítico em Validação | Corrigir na origem (§12) |
| "0 novo(s) · 0 alterado(s)" na importação | Arquivo igual ao overlay atual | Correto; importe em outra sessão para transportar |
| Cidade com ficha não mapeada | Grafia da ficha (ex.: chave é `FICHA SAFO`, arquivo `FICHA SA_FO.pdf`) | Abrir Cidades filtrada pelo aviso e corrigir a ficha |
| Upload/adicionar PDF bloqueado | Produção estática sem backend | Versionar o PDF no repositório |
| "Cidade já cadastrada" | Normalização colidiu | Editar a ficha da entrada existente |

## 20. Checklist de toda alteração

1. [ ] Editei e confirmei no painel (item aparece em Alterações Pendentes).
2. [ ] Validação sem erros críticos.
3. [ ] Cliquei **Publicar alterações**.
4. [ ] Exportei o(s) arquivo(s) efetivo(s) em Dados & Backups.
5. [ ] Substitui o(s) arquivo(s) na raiz do repositório.
6. [ ] Commit + push; conferi na aplicação pública.
