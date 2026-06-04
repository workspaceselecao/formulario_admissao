# Histórico de versionamento — Formulários de Admissão (ATENTO)

**Gerado em:** 2026-06-04T17:34:23.078Z
**Branch Git:** main
**Total de commits listados:** 215
**Última validação jurídica registrada (docs-revision.json):** 2026-06-04T14:28:33-03:00 — commit 2e359a3

Este ficheiro consolida o histórico de alterações do repositório Git e referências aos templates PDF, JSON de coordenadas e documentação em `/Docs`.

---

## 1. Ativos versionados (referência)

| Tipo | Referência | Ficheiro(s) | Configuração / metadados |
|------|------------|-------------|-------------------------|
| Template PDF — Ficha cadastral | F-075 / PR-011 | F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf | ficha_cadastral_campos.json (documento.versao: 37) |
| Template PDF — Assistência médica (Outros Planos) | Fichas regionais | FICHA *.pdf, cidades_brasil.json | assistencia_medica_campos.json |
| Template PDF — Plano de Benefícios | Declaração plano de saúde | DECLARACAO PLANO DE SAUDE.pdf | declaracao_plano_saude_campos.json |
| Documentação LGPD | /Docs | privacy-policy.html, terms-of-use.html, legal-basis.html, ripd.html, … | docs-revision.json (última validação jurídica) |

## 2. Commits Git (do mais recente ao mais antigo)

| Commit | Data (ISO) | Responsável | E-mail | Descrição |
|--------|------------|-------------|--------|-----------|
| f980160 | 2026-06-04T14:34:20-03:00 | robgomezsir | robgomez.sir@gmail.com | RIPD: link de download do historico de versionamento e script de geracao |
| 2e359a3 | 2026-06-04T14:28:33-03:00 | robgomezsir | robgomez.sir@gmail.com | Remover secção Contactos e escalamento do plano de resposta a incidentes. |
| d3534c4 | 2026-06-04T14:22:32-03:00 | robgomezsir | robgomez.sir@gmail.com | Atualizar carimbo de última validação jurídica (docs-revision.json). |
| b0cb36b | 2026-06-04T14:22:32-03:00 | robgomezsir | robgomez.sir@gmail.com | Atualizar texto de revisão jurídica nos documentos LGPD e exibir última validação via Git. |
| 5a0b3ea | 2026-06-04T13:53:56-03:00 | robgomezsir | robgomez.sir@gmail.com | Corrigir URL codificada do link da declaração Plano de Saúde. |
| 1ccd6df | 2026-06-04T13:53:49-03:00 | robgomezsir | robgomez.sir@gmail.com | Link para download da declaração no texto do Plano de Benefícios. |
| a546814 | 2026-06-04T13:50:57-03:00 | robgomezsir | robgomez.sir@gmail.com | Atualizar texto orientativo dos tipos de plano na Assistência Médica. |
| 773a57e | 2026-06-04T13:33:11-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajustar coordenada da data na declaração Plano de Benefícios (pág. 2). |
| 67e1a24 | 2026-06-04T13:29:13-03:00 | robgomezsir | robgomez.sir@gmail.com | Plano de Benefícios: ajustar data na pág. 2 e carimbar evidência no rodapé do PDF. |
| b2e2c12 | 2026-06-04T13:24:34-03:00 | robgomezsir | robgomez.sir@gmail.com | Copiar assinatura manuscrita da ficha cadastral para assistência médica. |
| 61dd602 | 2026-06-04T13:17:50-03:00 | robgomezsir | robgomez.sir@gmail.com | Subir assinatura manuscrita na ficha (+8 pt em y). |
| 822eba0 | 2026-06-04T13:14:54-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajustar coordenadas da assinatura manual e digitada na ficha F-075_37. |
| f8f9bef | 2026-06-04T13:08:32-03:00 | robgomezsir | robgomez.sir@gmail.com | Subir evidência técnica da assinatura no rodapé para margem visível (y=12 pt). |
| 197cd3a | 2026-06-04T13:05:45-03:00 | robgomezsir | robgomez.sir@gmail.com | Carimbar evidência técnica da assinatura automaticamente no rodapé do PDF. |
| daf9f19 | 2026-06-04T13:02:12-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajustar coordenadas da assinatura, data e evidência; corrigir offset na zona inferior. |
| 2a609d0 | 2026-06-04T12:52:52-03:00 | robgomezsir | robgomez.sir@gmail.com | Reverter conversão incorreta de Y: restaurar coordenadas pdf-lib da ficha F-075_37. |
| c3f1cce | 2026-06-04T12:49:50-03:00 | robgomezsir | robgomez.sir@gmail.com | Corrigir alinhamento PDF da ficha: converter Y do topo para pdf-lib. |
| e50902d | 2026-06-04T12:16:06-03:00 | robgomezsir | robgomez.sir@gmail.com | Atualizar ficha cadastral F-075_37: template PDF e coordenadas de assinatura, PIS e primeiro emprego. |
| 3043975 | 2026-06-04T03:17:58-03:00 | robgomezsir | robgomez.sir@gmail.com | Mover CPF para Dados Pessoais ao lado do nome completo. |
| 5c89dec | 2026-06-04T03:15:09-03:00 | robgomezsir | robgomez.sir@gmail.com | Unificar Tipo de plano e Tipo de movimentação num único módulo. |
| 1f2f292 | 2026-06-04T03:11:12-03:00 | robgomezsir | robgomez.sir@gmail.com | Atualizar template PDF da ficha cadastral F-075_38 (PR-011). |
| aed8dd4 | 2026-06-04T03:02:45-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: Plano de Benefícios vs Outros Planos por região. |
| fa515ec | 2026-06-04T02:46:06-03:00 | robgomezsir | robgomez.sir@gmail.com | Reorganizar dados bancários em colunas Bradesco e Santander. |
| 066c099 | 2026-06-04T02:43:24-03:00 | robgomezsir | robgomez.sir@gmail.com | Sincronizar assets e unificar assistência em DECLARACAO PLANO DE SAUDE.pdf |
| d3011be | 2026-06-04T02:38:18-03:00 | robgomezsir | robgomez.sir@gmail.com | Adicionar PDFs de carta e declaração de plano de saúde. |
| 4a947b5 | 2026-06-04T02:36:32-03:00 | robgomezsir | robgomez.sir@gmail.com | Atualizar ficha cadastral para PDF F-075_38 com novas opções bancárias. |
| 2687838 | 2026-05-24T01:35:44-03:00 | robgomezsir | robgomez.sir@gmail.com | Adicionar opção 'Não assinar manualmente' na Assistência Médica. |
| 3205809 | 2026-05-24T01:32:46-03:00 | robgomezsir | robgomez.sir@gmail.com | Alinhar checkbox 'Não assinar manualmente' na mesma linha do botão Limpar assinatura. |
| e3ba284 | 2026-05-24T01:26:57-03:00 | robgomezsir | robgomez.sir@gmail.com | Adicionar opção 'Não assinar manualmente' na ficha cadastral. |
| fef42e1 | 2026-05-24T01:15:32-03:00 | robgomezsir | robgomez.sir@gmail.com | Substituir template PDF da ficha cadastral pela revisão F-075_37__PR-011. |
| 64103c9 | 2026-05-24T01:10:37-03:00 | robgomezsir | robgomez.sir@gmail.com | Substituir Conta Mêntore Bank por Conta Corrente Bradesco na ficha cadastral. |
| 166b867 | 2026-05-05T23:42:00-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajuste de botão |
| 5bdb235 | 2026-05-02T05:02:44-03:00 | robgomezsir | robgomez.sir@gmail.com | Ficha Cadastral: CPF, agência e conta Bradesco na mesma linha (desktop) |
| 47a22f3 | 2026-05-02T04:38:51-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência Médica: opções de tipo de movimentação em largura igual (50/50) |
| 357d20a | 2026-05-02T04:36:42-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência Médica: .container com max-width 860px centralizado (igual Ficha Cadastral) |
| e8fb54d | 2026-05-02T04:33:24-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência Médica: grelha 12 col como Ficha Cadastral e rádios alinhados |
| 4533600 | 2026-05-02T04:29:12-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência Médica: validação alinhada à ficha (schema), datas e SUS; rótulos e nome da mãe |
| 6b937cf | 2026-05-02T04:19:28-03:00 | robgomezsir | robgomez.sir@gmail.com | Segurança e robustez: CSP e headers no Vercel, modal por aria-hidden, appStorage com logs, tokens CSS e raio unificado |
| f61e75d | 2026-05-01T15:13:06-03:00 | robgomezsir | robgomez.sir@gmail.com | PDF NÃO OPTANTE: diagonal Integração/Qtd até Ônibus/Valor unitário |
| ee96271 | 2026-05-01T15:07:36-03:00 | robgomezsir | robgomez.sir@gmail.com | Ficha Cadastral: NÃO OPTANTE no vale-transporte com marca d'água no PDF |
| 87a2b79 | 2026-05-01T15:03:18-03:00 | robgomezsir | robgomez.sir@gmail.com | Ficha Cadastral: tornar obrigatórios Primeiro Emprego, Deficiência e Vale Refeição/Alimentação |
| 7c21855 | 2026-05-01T14:50:06-03:00 | robgomezsir | robgomez.sir@gmail.com | Manter formulário e rascunho após gerar PDF; limpar só com Descartar rascunho |
| 2d6202d | 2026-05-01T14:44:04-03:00 | robgomezsir | robgomez.sir@gmail.com | Refatorar CSS partilhado do header, modais com estado unificado e localStorage namespaced |
| fa6e989 | 2026-05-01T02:30:25-03:00 | robgomezsir | robgomez.sir@gmail.com | PDF: prefixos fixos para nomes (Cadastral e Assistência Médica) + primeiro nome |
| 18ab64d | 2026-05-01T02:26:53-03:00 | robgomezsir | robgomez.sir@gmail.com | PDF: nome do ficheiro com tipo da ficha e primeiro nome do funcionário |
| 1a335b3 | 2026-05-01T00:05:58-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: aviso antes do PDF com encaminhamento ao Portal do Candidato |
| 819acb2 | 2026-04-30T23:59:46-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(home): modal de instruções em todo carregamento (sem persistência) |
| bdfc64d | 2026-04-30T23:48:49-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(home): modal de instruções ao candidato com checkbox de ciência |
| 7e18ef8 | 2026-04-30T19:56:24-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajuste de UI |
| c654b1c | 2026-04-29T14:35:12-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(ui): confirmação em modal para descartar rascunho, limpar assinatura e excluir dependente |
| 84bdb24 | 2026-04-29T02:51:50-03:00 | robgomezsir | robgomez.sir@gmail.com | docs: páginas HTML para documentação legal e remoção dos .md duplicados |
| 8f5b14f | 2026-04-29T02:48:16-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(nav): links de política, termos e hub Docs na sidebar |
| 306e6a7 | 2026-04-29T02:47:07-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(seo): URLs curtas para política, termos e hub Docs (redirects Vercel) |
| 93d7924 | 2026-04-29T02:42:16-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(deploy): redirecionar URLs antigas para /Docs e links absolutos |
| 1a0b50a | 2026-04-29T02:40:22-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(home): links do rodapé para Docs com âncoras e rótulo alinhado |
| 48bef72 | 2026-04-29T02:39:24-03:00 | robgomezsir | robgomez.sir@gmail.com | docs(ui): linguagem amigável na página índice de privacidade (Docs) |
| 34106ab | 2026-04-29T02:38:17-03:00 | robgomezsir | robgomez.sir@gmail.com | refactor(docs): mover políticas de Forms/ para Docs/ |
| 56c7a61 | 2026-04-29T02:31:34-03:00 | robgomezsir | robgomez.sir@gmail.com | docs(Forms): alinhar políticas aos modelos corporativos da raiz |
| 8a3873d | 2026-04-29T02:26:09-03:00 | robgomezsir | robgomez.sir@gmail.com | docs(Forms): pacote LGPD/segurança em Markdown e hub na home |
| 258ac5b | 2026-04-29T01:31:40-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(ui): sidebar à esquerda e títulos no painel e na aba |
| d9c0829 | 2026-04-29T01:29:35-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(ui): menu hambúrguer à esquerda do cabeçalho |
| a6dc7e0 | 2026-04-29T01:28:47-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(ui): troca entre Fichas na sidebar e ícone em Descartar rascunho |
| 156e2ab | 2026-04-29T01:25:54-03:00 | robgomezsir | robgomez.sir@gmail.com | style(ui): menu lateral como lista de links (sem pills) |
| 468500a | 2026-04-29T01:23:13-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(ui): overlay do menu cobre o cabeçalho e painel full-height |
| 1ce1b8b | 2026-04-29T01:19:26-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(ui): Início e Descartar rascunho na mesma linha no menu lateral |
| cbbf3e1 | 2026-04-29T01:13:21-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(ui): menu hambúrguer com Início, descartar rascunho e modelo PDF |
| 0f7b6ba | 2026-04-29T01:09:05-03:00 | robgomezsir | robgomez.sir@gmail.com | Header: Descartar rascunho no mesmo estilo de botão que Início |
| 8d24b63 | 2026-04-29T01:06:05-03:00 | robgomezsir | robgomez.sir@gmail.com | Foco em inputs: sem sombra; contorno tangerina (#EFA27F) no padrão marca |
| 4323147 | 2026-04-29T01:01:28-03:00 | robgomezsir | robgomez.sir@gmail.com | Tipografia: Poppins em todo o site (Google Fonts) |
| 82c4ea5 | 2026-04-29T00:52:57-03:00 | robgomezsir | robgomez.sir@gmail.com | Estilo Gradiente+Tangerina e animação spark nos botões Baixar ficha preenchida (PDF) |
| 1391569 | 2026-04-29T00:39:28-03:00 | robgomezsir | robgomez.sir@gmail.com | Ficha cadastral: mesmo datapicker/CSS para input[type=date] que assistência médica |
| 78c3f43 | 2026-04-29T00:38:40-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: datas em campo único (input date/datpicker nativo), migração rascunho v5 |
| 26da39f | 2026-04-29T00:29:48-03:00 | robgomezsir | robgomez.sir@gmail.com | Teclado numérico (inputmode) em CPF, agência, conta, número, datas e CPFs na assistência médica |
| 26e7d5b | 2026-04-29T00:25:58-03:00 | robgomezsir | robgomez.sir@gmail.com | VT: teclado numérico (decimal) nos campos Valor Unitário no mobile |
| 9754f6e | 2026-04-29T00:21:34-03:00 | robgomezsir | robgomez.sir@gmail.com | Layout: PIS compacto ao lado de Primeiro emprego; linha única no desktop, empilhado no mobile |
| 635e2d3 | 2026-04-29T00:17:08-03:00 | robgomezsir | robgomez.sir@gmail.com | Máscara PIS (000.00000.00-0), estado civil em maiúsculas no select |
| 5fe2f00 | 2026-04-26T13:48:01-03:00 | robgomezsir | robgomez.sir@gmail.com | Ficha cadastral: endereço em formato Cidade - UF; import na assistência médica |
| d961187 | 2026-04-26T02:28:56-03:00 | robgomezsir | robgomez.sir@gmail.com | Substitui seta por ícone home no link Início |
| 6aa12df | 2026-04-26T02:28:09-03:00 | robgomezsir | robgomez.sir@gmail.com | Estiliza «Início» como botão com hover, active e focus |
| 5483ec4 | 2026-04-26T02:26:26-03:00 | robgomezsir | robgomez.sir@gmail.com | Remove CTA «Abrir formulário →» dos cartões da home |
| 5261612 | 2026-04-26T02:25:51-03:00 | robgomezsir | robgomez.sir@gmail.com | Remove ícone placeholder com letra A nos cabeçalhos |
| 4e51a0b | 2026-04-26T02:24:36-03:00 | robgomezsir | robgomez.sir@gmail.com | Remove subtítulo F-075 do cabeçalho da Ficha Cadastral |
| 88ab53b | 2026-04-26T02:24:15-03:00 | robgomezsir | robgomez.sir@gmail.com | Remove subtítulo F-089 do cabeçalho da Assistência Médica |
| 16b28a3 | 2026-04-26T02:22:56-03:00 | robgomezsir | robgomez.sir@gmail.com | Remove texto da barra de rascunho no cabeçalho |
| 2983508 | 2026-04-26T00:41:26-03:00 | robgomezsir | robgomez.sir@gmail.com | Mobile: cabeçalho recolhível também em paisagem após rotação |
| 0cdea51 | 2026-04-26T00:37:34-03:00 | robgomezsir | robgomez.sir@gmail.com | Mobile: recolhe faixa de cabeçalho ao rolar a página |
| 18da907 | 2026-04-25T12:44:28-03:00 | robgomezsir | robgomez.sir@gmail.com | docs(readme): indica repositório GitHub e tipo de projeto estático |
| ad2de21 | 2026-04-25T12:43:02-03:00 | robgomezsir | robgomez.sir@gmail.com | docs: adiciona MANUTENCAO.md com guia de manutenção e liga o README |
| 7bdd3a9 | 2026-04-25T12:04:00-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(assistencia): carregar municípios via API kstr em vez de JSON local |
| 77967ee | 2026-04-25T00:59:47-03:00 | robgomezsir | robgomez.sir@gmail.com | Atualizar municipios_cidades_ficha_por_uf.json |
| 43493fb | 2026-04-25T00:58:32-03:00 | robgomezsir | robgomez.sir@gmail.com | Cidades: só JSON estático, caminhos absolutos, sem IBGE/Brasil API |
| 399c22d | 2026-04-24T23:48:15-03:00 | robgomezsir | robgomez.sir@gmail.com | Cidades: timeout IBGE, fallback estatico no repo |
| 5369c46 | 2026-04-24T23:37:11-03:00 | robgomezsir | robgomez.sir@gmail.com | Fallback Brasil API ao falhar cidades do IBGE |
| 7e99ecf | 2026-04-24T23:34:43-03:00 | robgomezsir | robgomez.sir@gmail.com | Corrigir carga de cidades: evita corrida change/input antes do mapa IBGE |
| cfdaa45 | 2026-04-24T23:25:15-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(assist): cidades após UF no mobile — evento input + AbortController IBGE |
| 7c7f17e | 2026-04-24T23:19:19-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(assistencia): transcrição de evidência da assinatura no PDF (doc, IP, fuso) |
| e428f56 | 2026-04-24T23:15:37-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(assistencia): assinatura manuscrita, PNG transparente, coordenadas rubrica/nome |
| 0640848 | 2026-04-24T23:06:56-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(ficha): canvas 1000x280, PNG transparente, nome legível no PDF |
| 9c8aaf2 | 2026-04-24T23:00:07-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(ficha): assinatura manual nas novas coordenadas, +40% no PDF, sem frase de evidência |
| 861eb64 | 2026-04-24T22:46:14-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(ficha): assinatura manuscrita no canvas e evidência no PDF |
| f3104f2 | 2026-04-24T22:18:34-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(ficha): cópia para Assistência Médica após o PDF e redirecionamento |
| e616a08 | 2026-04-24T16:59:13-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: aviso CPF dependente em modal (layout LGPD), não alert nativo. |
| da23bd9 | 2026-04-24T16:55:50-03:00 | robgomezsir | robgomez.sir@gmail.com | Dependentes: botão ✕ Excluir por módulo de filho (2–4), com reordenação dos dados. |
| 6f0bc49 | 2026-04-24T16:53:56-03:00 | robgomezsir | robgomez.sir@gmail.com | Popup CPF dependente: pedir remoção até ter documentação completa. |
| b594845 | 2026-04-24T16:53:01-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: alerta Pessoas Online quando CPF de filho incluído falta na validação. |
| 84e9b34 | 2026-04-24T16:49:06-03:00 | robgomezsir | robgomez.sir@gmail.com | Regra Cursor: sempre commit/push; referências de coordenadas assistência médica. |
| bab8a57 | 2026-04-24T16:48:14-03:00 | robgomezsir | robgomez.sir@gmail.com | Atualiza FICHA BH.pdf com ajustes de layout. |
| 9ad18ad | 2026-04-24T16:45:45-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: FICHA BH.pdf e mapeamento; README lista BH |
| a782aad | 2026-04-24T16:33:11-03:00 | robgomezsir | robgomez.sir@gmail.com | Dependentes: texto Pessoas Online; botões +/remover após último filho visível |
| 211b165 | 2026-04-24T16:22:56-03:00 | robgomezsir | robgomez.sir@gmail.com | assistencia_medica_campos: coords exatas checkboxes filho 2–4 |
| 585ae7e | 2026-04-24T16:15:09-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: filhos 2–4 Y +1/+2/+3; fonte PDF 7 pt |
| ae1c7eb | 2026-04-24T16:08:37-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: filhos 2–4 subidos (+1/+2/+3 pt); fonte PDF 7 |
| 1443739 | 2026-04-24T16:01:10-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: fonte PDF 8 pt |
| 6323c8e | 2026-04-24T15:59:58-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: coords de marcação (optante…filho1); filhos 2–4 incluir −3 pt; fonte PDF 10 |
| acc31db | 2026-04-24T15:42:59-03:00 | robgomezsir | robgomez.sir@gmail.com | assistencia_medica_campos: +3 pt em Y global; filhos 2–4 com passo de 32 pt (2 linhas) |
| 56f88a3 | 2026-04-24T15:31:58-03:00 | robgomezsir | robgomez.sir@gmail.com | assistencia_medica_campos: coordenadas de coordenadasassmedica.txt (A4 842pt) |
| 2c69484 | 2026-04-24T15:28:15-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: coordenadas de coordenadasficha.txt no JSON e preenchimento (data única, CEP, telefone) |
| 6e27282 | 2026-04-24T14:56:12-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: PDF por cidade (cidades_brasil.json); substitui templates por UF; novas fichas FSA/GNDI/GOIANIA/REEMBOLSO/SA_FO |
| 81934da | 2026-04-24T14:21:16-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: layout Estado\|Cidade\|Matrícula e linha Nome\|Mãe; matrícula mais estreita |
| 0ed0db5 | 2026-04-24T14:13:57-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência médica: cidades via API IBGE e ordem Estado \| Cidade \| Nome |
| 7a48a5b | 2026-04-23T23:25:13-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência Médica: DNV somente para neonatos até 28 dias de idade |
| 69439ff | 2026-04-22T22:03:08-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(validacao): define como obrigatorios somente Nome do Funcionario, Estado e CPF - remove marcador * e validacao de Matricula, SUS, Data de Nascimento, Assinatura e Data da assinatura |
| abfdae7 | 2026-04-22T21:54:43-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(layout): move Estado ao lado do Nome do Funcionario com proporcao 65/35 e ajusta mobile para campos em linhas individuais |
| 1a8a16b | 2026-04-22T21:46:48-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(uf): exibe nome completo do estado no seletor (ex: BA - Bahia) |
| d91c10f | 2026-04-22T21:41:55-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(mobile): datas de nascimento e admissao em linhas individuais com inputs horizontais - dados-datas colapsa para 1 coluna em telas <= 640px; data-triple usa nowrap para garantir layout horizontal dos campos DD/MM/AAAA |
| 379718a | 2026-04-22T21:33:05-03:00 | robgomezsir | robgomez.sir@gmail.com | chore: atualiza templates PDF regionais Norte e Nordeste (AC/AM/AP/PA/RO/RR/TO e AL/BA/CE/MA/PB/PE/PI/RN/SE) |
| 10718d4 | 2026-04-22T21:22:18-03:00 | robgomezsir | robgomez.sir@gmail.com | refactor(assistencia_medica): move campo Estado para ao lado de Data de Admissao e remove tipos de movimentacao nao utilizados - Campo UF renomeado para Estado e reposicionado na linha de datas; removidos Matrimonio, Exclusao de Dependente e Nascimento de Filho do tipo de movimentacao |
| 1f17c6a | 2026-04-22T21:16:06-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: adiciona templates PDF regionais F-089 e demais arquivos do workspace - 7 templates PDF de Assistencia Medica por regiao (Norte, Nordeste, Centro-Oeste, MG, Sul, RJ/ES, SP); adiciona cidades_brasil.json e atualiza atento.svg |
| 720e7d9 | 2026-04-22T21:03:51-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(assistencia_medica): adiciona selecao de UF com mapeamento para template PDF correto - Implementa logica de selecao de UF no formulario F-089, mapeando cada sigla ao arquivo PDF regional entre os 7 disponiveis (Norte, Nordeste, Centro-Oeste, MG, Sul, RJ/ES e SP). Template pre-carregado ao selecionar UF e validado antes de gerar ou baixar o PDF. |
| 880f11f | 2026-04-22T00:48:08-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: rascunho local fiável em mobile (visibilitychange, change imediato, debounce) |
| b915b80 | 2026-04-22T00:42:29-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajustes finais |
| d69c775 | 2026-04-21T17:20:16-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: modal na Ficha Cadastral para copiar dados correntes à Assistência Médica |
| 89aa421 | 2026-04-21T17:14:43-03:00 | robgomezsir | robgomez.sir@gmail.com | style(assistencia-medica): SUS/RG/CPF em 3 colunas iguais (alinhado a cargo/site/tel) |
| 0445688 | 2026-04-21T17:11:18-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(assistencia-medica): mobile dados do funcionário — 1 coluna, campos em linha completa |
| d5d8059 | 2026-04-21T17:06:52-03:00 | robgomezsir | robgomez.sir@gmail.com | style(assistencia-medica): layout dados do funcionário (SUS/RG/CPF, datas, cargo/site/tel) |
| 29ff35e | 2026-04-21T17:02:08-03:00 | robgomezsir | robgomez.sir@gmail.com | style(assistencia-medica): reorganizar endereço (rua/num, compl/bairro/cid) e telefone junto a site |
| 4701f39 | 2026-04-21T16:57:31-03:00 | robgomezsir | robgomez.sir@gmail.com | refactor(assistencia-medica): campo único de telefone com máscara; PDF mantém DDD e número separados |
| 8a21a04 | 2026-04-21T16:53:28-03:00 | robgomezsir | robgomez.sir@gmail.com | fix(assistencia-medica): simplificar CEP na linha do endereço e rótulo não optante |
| 4f8a5d8 | 2026-04-21T16:49:16-03:00 | robgomezsir | robgomez.sir@gmail.com | feat(assistencia-medica): CEP com ViaCEP e ajustes de UI do formulário |
| 5807c3d | 2026-04-21T16:19:50-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajuste na ficha |
| b2193bc | 2026-04-21T16:18:01-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência Médica: remove instrução acima do tipo de movimentação |
| c6cc164 | 2026-04-21T16:16:31-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência Médica: tipo de movimentação em 2 colunas, sem textos explicativos |
| 6a135ae | 2026-04-21T16:11:48-03:00 | robgomezsir | robgomez.sir@gmail.com | Correção de botões |
| c0c6503 | 2026-04-21T16:07:33-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência Médica: um bloco de filho e botões adicionar/remover (máx. 4) |
| e84ffff | 2026-04-21T16:00:00-03:00 | robgomezsir | robgomez.sir@gmail.com | Assistência Médica: filhos 2–4 no JSON (y −46 pt), formulário e PDF |
| df25e9d | 2026-04-21T15:55:25-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajuste fino |
| 4043f2f | 2026-04-21T15:50:00-03:00 | robgomezsir | robgomez.sir@gmail.com | Home: exibe logomarca real via atento.svg (img) e atualiza SVG vetorial |
| 46967b5 | 2026-04-21T15:47:10-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajustes de posição |
| 1c3621b | 2026-04-21T15:37:53-03:00 | robgomezsir | robgomez.sir@gmail.com | Home: logo Atento inline (conforme atento.svg) para exibir sempre |
| 18508eb | 2026-04-21T15:33:50-03:00 | robgomezsir | robgomez.sir@gmail.com | Ficha: data da assinatura em 3 caixas (coordenadas); home com logo atento.svg |
| 7bfc542 | 2026-04-21T15:22:41-03:00 | robgomezsir | robgomez.sir@gmail.com | README: documenta rewrite da raiz para a home |
| 86cd310 | 2026-04-21T15:22:36-03:00 | robgomezsir | robgomez.sir@gmail.com | Vercel: raiz serve a Home via rewrite (sem redirect para index.html) |
| 207b01d | 2026-04-21T15:19:48-03:00 | robgomezsir | robgomez.sir@gmail.com | Inclui JSON de campos e template PDF F-089 Assistência Médica |
| 0b56f44 | 2026-04-21T15:19:42-03:00 | robgomezsir | robgomez.sir@gmail.com | Adiciona home, formulário Assistência Médica (F-089) e ajustes de navegação |
| 5aca495 | 2026-04-21T14:45:47-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajuste de label |
| c22846f | 2026-04-21T14:37:57-03:00 | robgomezsir | robgomez.sir@gmail.com | PDF: não desenha linha de VT quando quantidade e valor são zero |
| 86a7bff | 2026-04-21T14:33:42-03:00 | robgomezsir | robgomez.sir@gmail.com | Layout: Primeiro Emprego e Possui Deficiência na mesma linha; PIS em linha total |
| 6135f7e | 2026-04-21T14:29:17-03:00 | robgomezsir | robgomez.sir@gmail.com | Layout: E-mail e Estado Civil na mesma linha (50% cada) |
| 6c2e3f9 | 2026-04-21T14:24:23-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajuste de textos |
| 8554904 | 2026-04-21T14:15:39-03:00 | robgomezsir | robgomez.sir@gmail.com | Rascunho local no navegador até gerar PDF; restaurar, pagehide e descartar |
| 81a125f | 2026-04-21T14:03:35-03:00 | robgomezsir | robgomez.sir@gmail.com | PDF: replica CPF no campo bancário também para Conta Salário Bradesco |
| 01d0e62 | 2026-04-21T13:58:31-03:00 | robgomezsir | robgomez.sir@gmail.com | Suporta 5 dependentes: coordenadas atualizadas no JSON e MAX_DEPENDENTES=5 |
| 6cab599 | 2026-04-21T13:39:18-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajuste fino de coordenada |
| 50aa551 | 2026-04-21T13:33:38-03:00 | robgomezsir | robgomez.sir@gmail.com | Alterar coordenada |
| 5629dee | 2026-04-21T13:21:29-03:00 | robgomezsir | robgomez.sir@gmail.com | alterando posiçao |
| 72e4f6b | 2026-04-21T13:21:11-03:00 | robgomezsir | robgomez.sir@gmail.com | alterand |
| 4feb05d | 2026-04-21T13:20:04-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajusta coordenadas do campo Data na assinatura (467,27; 67x15 pt) |
| c184dbb | 2026-04-21T13:14:15-03:00 | robgomezsir | robgomez.sir@gmail.com | Corrige coordenadas VA/VR: alimentação x55, refeição x245; flex x410 |
| 6f7683e | 2026-04-21T13:06:46-03:00 | robgomezsir | robgomez.sir@gmail.com | NOVA ALTERAÇÃO DE POSIÇÃO FINAL |
| bac6377 | 2026-04-21T13:04:29-03:00 | robgomezsir | robgomez.sir@gmail.com | NOVO AJUSTE DE POSIÇÃO |
| 9258bb1 | 2026-04-21T13:02:10-03:00 | robgomezsir | robgomez.sir@gmail.com | AJUSTE DE POSIÇÃO |
| cd79e4d | 2026-04-21T12:57:58-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajuste vertical: texto do PDF uma linha abaixo (sem alterar marcações) |
| 3bd597d | 2026-04-21T12:45:10-03:00 | robgomezsir | robgomez.sir@gmail.com | Preenchimento do PDF por coordenadas em ficha_cadastral_campos.json |
| 9b33649 | 2026-04-21T00:22:37-03:00 | robgomezsir | robgomez.sir@gmail.com | chore: remover templates antigos e ajustar alinhamento no PDF |
| ae7c356 | 2026-04-21T00:14:41-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: usar mapeamento de coordenadas no preenchimento do PDF |
| da5ee4c | 2026-04-20T23:53:10-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: atualizar ficha cadastral para revisão 37 |
| 09ead48 | 2026-04-20T01:36:08-03:00 | robgomezsir | robgomez.sir@gmail.com | docs: atualizar modelo DOCX da ficha cadastral |
| 98e360e | 2026-04-20T01:35:18-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: permitir formato na ficha limpa e padronizar nome do PDF |
| e34ab59 | 2026-04-20T01:31:00-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: disponibilizar carta de abertura para conta Bradesco |
| 7b20871 | 2026-04-20T00:50:35-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: reduzir bloco de dependentes com adição dinâmica |
| 708f058 | 2026-04-20T00:36:54-03:00 | robgomezsir | robgomez.sir@gmail.com | style: atualizar textos dos botões de download |
| 168b98d | 2026-04-20T00:32:30-03:00 | robgomezsir | robgomez.sir@gmail.com | style: adicionar rótulos nos campos de dependentes no mobile |
| 9a335ce | 2026-04-20T00:25:55-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: melhorar responsividade de dependentes e valores de vale-transporte |
| 1d23171 | 2026-04-19T21:15:36-03:00 | robgomezsir | robgomez.sir@gmail.com | style: alterar cabeçalho superior para branco |
| 8cc1bdb | 2026-04-19T21:11:30-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: validar campos obrigatórios antes de gerar PDF |
| ff0f922 | 2026-04-19T21:06:16-03:00 | robgomezsir | robgomez.sir@gmail.com | style: mover ações para o fim do formulário |
| 86a6e63 | 2026-04-19T21:02:09-03:00 | robgomezsir | robgomez.sir@gmail.com | style: aplicar identidade visual da logo no formulário |
| e54779d | 2026-04-19T21:00:41-03:00 | robgomezsir | robgomez.sir@gmail.com | style: ajustar proporções dos campos do módulo endereço |
| fb23b04 | 2026-04-19T20:56:54-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: limitar complemento a 35 caracteres no PDF |
| 7b93d16 | 2026-04-19T20:46:52-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: separar módulo de endereço com CEP prioritário |
| 0882fa8 | 2026-04-19T10:13:12-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: adicionar botão para baixar ficha cadastral vazia |
| 23415c7 | 2026-04-19T10:10:15-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: adicionar pesquisa e preenchimento automático por CEP |
| 6561e95 | 2026-04-19T10:07:07-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: incluir UF no campo de cidade |
| ec6f0ab | 2026-04-19T10:05:17-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: adicionar linha de progresso abaixo de cada grupo |
| 8b97a40 | 2026-04-19T10:00:01-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: estabilizar máscara de moeda no padrão R$ 0,00 |
| 8d076ac | 2026-04-19T09:54:10-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: aplicar maiúsculas e máscara monetária em tempo real |
| b8a94cf | 2026-04-19T09:47:49-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: ajustar assinatura e consolidar alterações locais do formulário |
| 8b5af22 | 2026-04-19T09:41:39-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: indicar obrigatoriedade em agência e conta |
| 1efe41a | 2026-04-19T09:40:36-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: posicionar nome do candidato acima da linha de assinatura |
| 4e86b68 | 2026-04-19T09:37:39-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: padronizar cor de seleção em Tipo de Conta |
| 06ef614 | 2026-04-19T09:35:42-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: substituir confirmação nativa por modal LGPD customizado |
| 588bb8e | 2026-04-19T09:32:31-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: aplicar aviso LGPD com decisão e limpeza automática |
| 1a83918 | 2026-04-19T09:29:35-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: exigir agência e conta ao selecionar Bradesco |
| 133ba46 | 2026-04-19T09:25:59-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: destacar seleção em Tipo de Conta |
| f64485f | 2026-04-19T09:23:26-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: destacar visualmente opção marcada em Primeiro Emprego |
| 758f9fb | 2026-04-19T09:11:37-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: varredura específica para email e vale refeição |
| 90de072 | 2026-04-19T09:04:02-03:00 | robgomezsir | robgomez.sir@gmail.com | Ajuste de FORM |
| 879d7a9 | 2026-04-19T09:01:30-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: corrigir captura de email e vale refeição no PDF |
| 3c74c38 | 2026-04-19T08:53:28-03:00 | robgomezsir | robgomez.sir@gmail.com | chore: definir novo template como página inicial |
| b8b19f1 | 2026-04-19T08:44:04-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: aplicar template intuitivo com exportação no PDF oficial |
| ce6744c | 2026-04-19T08:35:11-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: corrigir telefone, celular, email e exceções de posicionamento |
| 7b7b5bd | 2026-04-19T08:29:36-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: preencher campos na linha abaixo do rótulo |
| a282a3c | 2026-04-19T08:20:52-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: alinhar preenchimento ao modelo PREENCHER AQUI |
| b2be0a8 | 2026-04-19T08:07:14-03:00 | robgomezsir | robgomez.sir@gmail.com | fix: evitar falha de ArrayBuffer na geração do PDF |
| bf155ed | 2026-04-19T07:34:21-03:00 | robgomezsir | robgomez.sir@gmail.com | feat: publicar formulário de ficha cadastral com exportação em PDF |

## 3. Notas

- Alterações em coordenadas de PDF devem ser validadas visualmente após cada atualização de template.
- Documentos em `/Docs` incluem bloco de revisão jurídica com data do último commit (ver `doc-revision.js`).
- Para regenerar este ficheiro: `node scripts/gerar-historico-versionamento.mjs`

