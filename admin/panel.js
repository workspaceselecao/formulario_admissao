/**
 * ============================================================
 * PAINEL ADMINISTRATIVO — lógica
 * ============================================================
 *
 * Fontes de dados (leitura): JSONs reais do repositório
 * (ficha_cadastral_campos.json, declaracao_plano_saude_campos.json,
 * cidades_brasil.json, cidades_infinity.json) + inventário dos
 * templates em uso no código.
 *
 * Alterações: modelo de OVERLAY (camada administrativa) sobre os
 * JSONs — os arquivos originais nunca são modificados pelo painel.
 * Persistência: admin/persistence.js (API em dev; exportação JSON
 * em produção estática; localStorage nunca é usado como banco).
 *
 * ── Evolução v2 (prompt-implementacao-painel-admin-FINAL.md) ──
 * T0  Saúde do Sistema no Dashboard (links diretos aos problemas).
 * T1  formModal() — componente genérico de formulário em modal.
 * T2  CRUD completo de Cidades (ID estável/origemChave, patch completo
 *     { cidade,uf,regional,ficha }, paginação real, troca de ficha em
 *     massa, importação CSV/JSON com preview obrigatório).
 * T3  Metadados de PDF editáveis — overlay.pdfs_meta (só metadado:
 *     o arquivo físico continua trocado EXCLUSIVAMENTE pelo fluxo de
 *     upload/substituição já existente).
 * T4  Busca de campos + restauração granular no Editor de Coordenadas.
 * T5  Diff campo a campo na importação de configuração.
 * T6  Histórico com filtros + "desfazer" append-only (o evento original
 *     nunca é apagado; desfazer cria um novo evento 'desfazer').
 * T7  Selos "✎ Editável" vs "🔒 Somente leitura — código".
 *
 * ── Reestruturação v3 ("Reestruturação do painel.md") ──
 * Organização por ENTIDADES (§6): formulários, templates, cidades,
 * configurações — ferramentas técnicas ficam no sub-menu "Mais ferramentas".
 * §8/9  Formulário como entidade central: tabela com template/campos/cidades
 *       + área de detalhe com abas (Geral/Campos/Template/Regras/Cidades/Histórico).
 * §11/12 Editor: snap-to-grid (1/5/10), atalhos de teclado (setas/Shift/Alt),
 *       redimensionar, seleção múltipla + alinhar/distribuir (multi seleção
 *       limitada à página visível — arquitetura atual).
 * §13   Modo de teste: formulário de dados fictícios → PDF preenchido.
 * §15/17 Cidades: duplicar, exportação JSON/CSV dos dados filtrados.
 * §18/19 Templates: versionamento por upload (hash/sha256, páginas,
 *       dimensões), comparação com a versão anterior, rollback via overlay.
 * §23   Alterações Pendentes no Dashboard (publicar/descartar).
 * §24   Validação pré-publicação com trava por erro crítico (seção Validação).
 * §28   Command Palette Ctrl+K (busca global de entidades).
 *
 * MIGRAÇÃO DO OVERLAY (§32/33): campos NOVOS e opcionais — `forms_meta`,
 * `templates_versoes`, `configuracoes` — adicionados com fallback seguro.
 * Overlays v1/v2 continuam lidos sem alteração (nenhum dado é descartado).
 * A aplicação pública lê os JSONs do repositório e não consome o overlay;
 * "publicar" (= "desmarcar pendência") é um marco operacional do painel.
 *
 * COMPATIBILIDADE DE OVERLAY (regra §2.8): overlays antigos continuam
 * lidos — patch de cidade só com { ficha } segue válido; pdfs_meta é
 * opcional (ausente = sem customização); cidades_novas mantém o formato
 * { id, cidade, uf, regional, ficha }.
 */

(function (global) {
  "use strict";

  // ══════════════════════════════════════════════════════
  // INVENTÁRIO (extraído do código — fonte de verdade)
  // ══════════════════════════════════════════════════════
  const FICHA_PDF = "F-075_37__PR-011__Ficha_Cadastral_para_Admissão.pdf";
  const DECLARACAO_PDF = "DECLARACAO PLANO DE SAUDE.pdf";
  const FICHA_UTILIZAR_PARA_ARQUIVO = {
    "FICHA BH": "FICHA BH.pdf",
    "FICHA FSA": "FICHA FSA.pdf",
    "FICHA GNDI": "FICHA GNDI.pdf",
    "FICHA GOIANIA": "FICHA GOIANIA.pdf",
    "FICHA REEMBOLSO": "FICHA REEMBOLSO.pdf",
    "FICHA SAFO": "FICHA SA_FO.pdf",
    "FICHA SJC": "FICHA SJC.pdf"
  };
  const PDFS = [
    { arquivo: FICHA_PDF, tipo: "Template principal", formulario: "F-075 Ficha Cadastral", path: FICHA_PDF },
    { arquivo: DECLARACAO_PDF, tipo: "Template principal", formulario: "F-089 (Plano de Benefícios)", path: DECLARACAO_PDF },
    { arquivo: "ARQUIVO MODELO.pdf", tipo: "Template (download)", formulario: "Termos de Aceite", path: "ARQUIVO MODELO.pdf" },
    { arquivo: "TERMO DE SIGILO_SP.pdf", tipo: "Template (download)", formulario: "Termos de Aceite (SP)", path: "TERMO DE SIGILO_SP.pdf" },
    { arquivo: "FICHA BH.pdf", tipo: "Regional", formulario: "F-089 (Outros Planos)", path: "FICHA BH.pdf" },
    { arquivo: "FICHA FSA.pdf", tipo: "Regional", formulario: "F-089 (Outros Planos)", path: "FICHA FSA.pdf" },
    { arquivo: "FICHA GNDI.pdf", tipo: "Regional", formulario: "F-089 (Outros Planos)", path: "FICHA GNDI.pdf" },
    { arquivo: "FICHA GOIANIA.pdf", tipo: "Regional", formulario: "F-089 (Outros Planos)", path: "FICHA GOIANIA.pdf" },
    { arquivo: "FICHA REEMBOLSO.pdf", tipo: "Regional", formulario: "F-089 (Outros Planos)", path: "FICHA REEMBOLSO.pdf" },
    { arquivo: "FICHA SA_FO.pdf", tipo: "Regional", formulario: "F-089 (Outros Planos)", path: "FICHA SA_FO.pdf" },
    { arquivo: "FICHA SJC.pdf", tipo: "Regional", formulario: "F-089 (Outros Planos)", path: "FICHA SJC.pdf" }
  ];
  const DOCS = {
    ficha_cadastral: {
      label: "Ficha Cadastral (F-075)",
      jsonPath: "../ficha_cadastral_campos.json",
      pdfPath: "../" + encodeURI(FICHA_PDF),
      pdfFile: FICHA_PDF,
      overlayKey: "campos_ficha"
    },
    declaracao_plano_saude: {
      label: "Declaração Plano de Saúde (F-089)",
      jsonPath: "../declaracao_plano_saude_campos.json",
      pdfPath: "../" + encodeURI(DECLARACAO_PDF),
      pdfFile: DECLARACAO_PDF,
      overlayKey: "campos_declaracao"
    }
  };
  /** Mapa código → arquivo físico do template (§9 aba Template e métricas). */
  const FORM_PDF_ARQUIVO = { "F-075": FICHA_PDF, "F-089": DECLARACAO_PDF };
  const FORMULARIOS = [
    { nome: "F-075 · Ficha Cadastral", rota: "/f075", arquivo: "ficha_cadastral.html", template: FICHA_PDF, status: "Ativo", schema: "ficha_cadastral_campos.json" },
    { nome: "F-089 · Assistência Médica", rota: "/f089", arquivo: "assistencia_medica.html", template: "DECLARACAO (Plano de Benefícios) ou FICHA regional por cidade", status: "Ativo", schema: "assistencia_medica_campos.json + declaracao_plano_saude_campos.json" },
    { nome: "Carta Conta Salário Bradesco", rota: "/bradesco", arquivo: "carta_bradesco.html", template: "Gerado do zero (sem template)", status: "Ativo", schema: "—" },
    { nome: "Termos de Aceite", rota: "/termos", arquivo: "termos_aceite.html", template: "ARQUIVO MODELO.pdf / TERMO DE SIGILO_SP.pdf", status: "Indisponível (na home)", schema: "—" }
  ];
  const REGRAS = [
    { id: "RN-PIS", nome: "Primeiro Emprego → PIS", desc: "PIS é sempre visível e obrigatório, tanto para SIM quanto para NÃO.", class: "codigo" },
    { id: "RN-BANCO", nome: "Banco → campos bancários", desc: "Escolha do banco exibe campos específicos (agência, conta, dígito).", class: "codigo" },
    { id: "RN-PLANO", nome: "Plano → fluxo", desc: "Plano de Benefícios → DECLARACAO PLANO DE SAUDE.pdf (assinatura pág. 2). Outros Planos → cidade → ficha regional.", class: "codigo" }, // F-089
    { id: "RN-CIDADE", nome: "Cidade → template", desc: "cidades_brasil.json / cidades_infinity.json mapeiam cidade → FICHA a utilizar (com correção histórica REEBOLSO→REEMBOLSO).", class: "configuravel" },
    { id: "RN-NAOOPTANTE", nome: "Não optante (VT)", desc: "Checkbox desabilita linhas e desenha marca d'água diagonal no PDF.", class: "codigo" },
    { id: "RN-DEPENDENTES", nome: "Limite de dependentes", desc: "Slots fixos para cônjuge e filhos no schema F-089.", class: "codigo" },
    { id: "RN-ASSINATURA", nome: "Assinatura manuscrita", desc: "Canvas com opção \"Não assinar\"; evidência (data/hora/IP) carimbada no rodapé.", class: "codigo" },
    { id: "RN-LGPD", nome: "Aviso LGPD", desc: "Confirmação obrigatória antes de gerar PDF; nada é retido pelo site.", class: "codigo" },
    { id: "RN-COORD", nome: "Coordenadas dos campos", desc: "Posições x/y/largura/altura por campo, nos JSONs — editáveis pelo painel.", class: "configuravel" },
    { id: "RN-CARTA", nome: "Carta Bradesco gerada", desc: "PDF construído programaticamente (logo, assinatura e carimbo em PNG).", class: "codigo" }
  ];
  const SEGURANCA = [
    "Autenticação apartada: e-mail @atento.com + código de acesso exclusivo do painel (dois fatores, pipeline criptográfico idêntico ao guard.js).",
    "Sessão em sessionStorage com expiração de 60 min e renovação por atividade.",
    "Mensagem de erro de acesso genérica (não revela existência de conta ou permissão).",
    "Upload de PDF validado por extensão, MIME e assinatura de conteúdo (%PDF-); limite de 20 MB.",
    "Nomes de arquivo sanitizados — caminhos arbitrários (../) bloqueados.",
    "Sem execução de conteúdo enviado: PDFs são armazenados/servidos como arquivo.",
    "localStorage NUNCA usado como banco administrativo (proibição do projeto).",
    "Recomendação: para operações destrutivas em produção, migrar para autenticação server-side."
  ];
  const DADOS_TESTE = {
    nomecompleto: "CANDIDATO DE TESTE", craxa: "TESTE", cpf: "000.000.000-00",
    fone: "(71) 99999-9999", celular: "(71) 99999-9999",
    email: "teste.teste@atento.com", estadocivil: "SOLTEIRO",
    data: "01/01/2026", datanascimento: "01/01/1990"
  };

  // ══════════════════════════════════════════════════════
  // ESTADO
  // ══════════════════════════════════════════════════════
  const state = {
    modo: null, origem: null,
    // v3: forms_meta, templates_versoes e configuracoes são novos e opcionais
    // (normalizados em carregarTudo) — overlays v1/v2 continuam válidos.
    overlay: { campos_ficha: {}, campos_declaracao: {}, campos_custom: {}, cidades: {}, cidades_novas: [], pdfs_meta: {}, forms_meta: {}, templates_versoes: {}, configuracoes: {} },
    docData: {},        // por docKey: {json, flat:[], pageSizes:[], pdfjsDoc, page, sel, dirty}
    docBase: {},        // por docKey: JSON original do repositório (sem overlay) — fonte para reconstrução e validação
    cityMap: {}, cityArr: [], citySource: null,
    historicoLocal: [],
    cidadesNovasSeq: 1,
    // ── v2 ──
    cidadesPagina: 1,
    cidadesSelecao: {},          // chave de linha (origemChave | "n"+id) → true
    integridadeCache: null,      // { quando, itens:[{nivel,texto,go}], okN, warnN, errN }
    cidadesFiltroEspecial: null, // conjunto de chaves vindo do link da Saúde (T0)
    // ── v3 ──
    formSel: null,               // código do formulário aberto no detalhe (§9)
    formTab: "geral",
    edSelMulti: [],              // seleção múltipla do editor (objetos campo, mesma página)
    pendentesMarcados: null      // null = nunca publicado; { acao: {iso} } = marcos
  };
  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  const CIDADES_POR_PAGINA = 50; // configurável (T2.3)
  const PROPS_COORD = ["x", "y", "largura", "altura"];
  const UFS_VALIDAS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

  // ══════════════════════════════════════════════════════
  // v3 — VALIDAÇÃO DE PDF (§19) e CAMPOS (§24) — funções puras
  // ══════════════════════════════════════════════════════
  /** Validação estrutural de um PDF (bytes): assinatura, tamanho, páginas e
   *  dimensões via pdf-lib. Nunca lança — retorna { ok, erros[], avisos[], info }. */
  async function validarPdfBytes(bytes, limiteMB) {
    const res = { ok: false, erros: [], avisos: [], info: null };
    const head = new Uint8Array(bytes.slice(0, 5));
    const sig = String.fromCharCode.apply(null, head);
    if (sig !== "%PDF-") { res.erros.push("Assinatura %PDF- ausente — o arquivo não é um PDF válido."); return res; }
    const limite = (limiteMB || 20) * 1024 * 1024;
    if (bytes.byteLength > limite) res.erros.push("Arquivo excede o limite de " + (limiteMB || 20) + " MB.");
    if (bytes.byteLength < 1024) res.avisos.push("Arquivo muito pequeno (< 1 KB) — possível PDF truncado.");
    try {
      const doc = await global.PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      const paginas = doc.getPages();
      res.info = {
        paginas: paginas.length,
        bytes: bytes.byteLength,
        dimensoes: paginas.map(function (p) { return { w: Math.round(p.getWidth() * 100) / 100, h: Math.round(p.getHeight() * 100) / 100 }; })
      };
      if (!paginas.length) res.erros.push("PDF sem páginas.");
    } catch (e) {
      res.erros.push("Não foi possível interpretar o PDF (estrutura inválida ou protegida): " + e.message);
    }
    res.ok = res.erros.length === 0;
    return res;
  }

  /** Hash SHA-256 (hex) de um ArrayBuffer — API crypto.subtle (browser e Node ≥15 via webcrypto global). */
  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  /** Comparação estrutural entre o PDF novo e a versão publicada (§19). */
  function compararPdfComAnterior(novaInfo, anteriorInfo) {
    const out = [];
    if (!novaInfo || !anteriorInfo) return out;
    if (anteriorInfo.paginas !== novaInfo.paginas) {
      const dif = novaInfo.paginas - anteriorInfo.paginas;
      out.push("Este PDF possui " + Math.abs(dif) + " página(s) " + (dif < 0 ? "a menos" : "a mais") + " que a versão publicada (" + anteriorInfo.paginas + " → " + novaInfo.paginas + ").");
    }
    const dOld = anteriorInfo.dimensoes || [], dNew = novaInfo.dimensoes || [];
    for (let i = 0; i < Math.min(dOld.length, dNew.length); i++) {
      if (Math.abs(dOld[i].w - dNew[i].w) > 1 || Math.abs(dOld[i].h - dNew[i].h) > 1) {
        out.push("Dimensões da página " + (i + 1) + " mudaram: " + dOld[i].w + "×" + dOld[i].h + " pt → " + dNew[i].w + "×" + dNew[i].h + " pt.");
      }
    }
    if (anteriorInfo.bytes && novaInfo.bytes && Math.abs(novaInfo.bytes - anteriorInfo.bytes) / anteriorInfo.bytes > 0.4) {
      out.push("Tamanho do arquivo mudou mais de 40% em relação à versão publicada — verifique se é o template correto.");
    }
    return out;
  }

  /** Coordenada dentro da página (§24 — margem de 40 pt para avarias de borda). */
  function coordenadaForaDaPagina(c, size) {
    if (!size) return false;
    return c.x < 0 || c.y < 0 || c.x > size.w + 40 || c.y > size.h + 40 ||
      (typeof c.largura === "number" && c.largura <= 0) || (typeof c.altura === "number" && c.altura <= 0);
  }

  /** UF válida (lista oficial dos 27 estados — validação de cadastro/importação). */
  function ufValida(uf) { return UFS_VALIDAS.indexOf(String(uf || "").trim().toUpperCase()) !== -1; }

  // ══════════════════════════════════════════════════════
  // v3 — FIELD BUILDER (§10): CRUD de campos — funções puras
  // ══════════════════════════════════════════════════════
  /** Tipos suportados — espelham o modelo atual do projeto (ficha/declaração). */
  const FIELD_TIPOS = ["texto", "numero", "cpf", "telefone", "data", "email", "selecao", "grupo_radio", "grupo_checkbox", "imagem", "assinatura"];

  /** Identificador estável a partir do nome: sem acentos, minúsculo, snake_case.
   *  Colisão (com ids existentes OU com ids base do schema) → sufixo _2, _3…
   *  “Não dependa de nomes como identificadores primários” (§): o id é gerado
   *  UMA vez e nunca muda em renomeações — o rótulo é só display. */
  function slugCampoId(nome, existentes) {
    let base = String(nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
      .slice(0, 48);
    if (!base) base = "campo";
    const usados = existentes || {};
    if (!(base in usados)) return base;
    for (let i = 2; ; i++) { if (!(base + "_" + i in usados)) return base + "_" + i; }
  }

  /** Objeto de campo customizado com defaults coerentes com o schema existente. */
  function novoCampoCustom(nome, opts) {
    const o = opts || {};
    return {
      id: o.id || slugCampoId(nome, o.existentes || {}),
      // sem seção inventada: o campo só entra em seção já existente no schema
      secao: String(o.secao || "").trim(),
      label: String(nome || "").trim(),
      tipo: o.tipo || "texto",
      obrigatorio: o.obrigatorio === true,
      pagina: Math.max(1, parseInt(o.pagina, 10) || 1),
      coordenadas: {
        x: Number(o.x != null ? o.x : 60),
        y: Number(o.y != null ? o.y : 60),
        largura: Number(o.largura != null ? o.largura : 200),
        altura: Number(o.altura != null ? o.altura : 12)
      },
      opcoes: o.opcoes || undefined,
      mascara: o.mascara || undefined,
      valor_padrao: o.valor_padrao || undefined,
      observacao: o.observacao || undefined,
      origem: "painel"
    };
  }

  /** Validação de um campo customizado (antes de gravar no overlay). */
  function validarCampoSchema(entry) {
    const erros = [], avisos = [];
    if (!entry || typeof entry !== "object") { erros.push("Campo ausente ou inválido."); return { erros: erros, avisos: avisos }; }
    if (!String(entry.label || "").trim()) erros.push("Rótulo (nome de exibição) é obrigatório.");
    if (FIELD_TIPOS.indexOf(entry.tipo) === -1) erros.push("Tipo desconhecido: \"" + entry.tipo + "\" — use um dos tipos do projeto.");
    const pg = parseInt(entry.pagina, 10);
    if (!(pg >= 1)) erros.push("Página deve ser um inteiro ≥ 1.");
    const c = entry.coordenadas || {};
    if (typeof c.x !== "number" || isNaN(c.x)) erros.push("Coordenada X deve ser numérica.");
    if (typeof c.y !== "number" || isNaN(c.y)) erros.push("Coordenada Y deve ser numérica.");
    if (typeof c.x === "number" && (c.x < 0 || c.y < 0)) erros.push("Coordenadas não podem ser negativas.");
    if (typeof c.largura !== "number" || c.largura <= 0) erros.push("Largura deve ser maior que zero.");
    if (typeof c.altura !== "number" || c.altura <= 0) erros.push("Altura deve ser maior que zero.");
    if (entry.tipo === "grupo_radio" || entry.tipo === "grupo_checkbox" || entry.tipo === "selecao") {
      const nOp = entry.opcoes ? Object.keys(entry.opcoes).length : 0;
      if (!nOp) erros.push("Campos de \"" + entry.tipo + "\" exigem opções definidas.");
      else if (nOp < 2) avisos.push("Campo de seleção com apenas 1 opção — confirme se é intencional.");
    }
    if (!String(entry.secao || "").trim()) erros.push("Seção de destino é obrigatória — escolha uma seção existente do schema.");
    if (entry.id && !/^[a-z0-9_]+$/.test(entry.id)) erros.push("Identificador deve conter apenas letras minúsculas, números e underscore.");
    return { erros: erros, avisos: avisos };
  }

  /** Dependências declaradas no JSON base: [{ de, campoKey }] para cada
   *  `dependencia: { campo: X }` encontrado (validação §10 de exclusão). */
  function coletarDependenciasSchema(node, out, path) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return out || [];
    const acc = out || [];
    const p = path || "";
    if (node.dependencia && node.dependencia.campo) {
      acc.push({ de: p, campoKey: String(node.dependencia.campo) });
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === "object") coletarDependenciasSchema(v, acc, p ? p + "." + k : k);
    }
    return acc;
  }

  /** Exclusão segura: bloqueada quando o campo é alvo de `dependencia` no
   *  schema (a aplicação pública avaliaria dependência de campo inexistente). */
  function validarExclusaoCampo(key, dependencias) {
    const bloqueios = [], avisos = [];
    for (const d of dependencias || []) {
      if (d.campoKey === key) bloqueios.push("Referenciado por `dependencia` em \"" + d.de + "\".");
    }
    return { ok: bloqueios.length === 0, bloqueios: bloqueios, avisos: avisos };
  }

  /** Validação estrutural de um documento de campos (integra overlay custom).
   *  Retorna { erros[], avisos[] } — usado no gate de publicação (§24). */
  function validarDocCampos(json, pageSizes) {
    const erros = [], avisos = [];
    if (!json || !json.campos) return { erros: erros, avisos: avisos };
    const flat = [];
    flattenFields(json.campos, "", flat);
    const idsCurto = {};
    for (const f of flat) {
      const segs = f.key.split(".");
      idsCurto[segs[segs.length - 1]] = true;
    }
    for (const f of flat) {
      if (!String(f.label || "").trim()) erros.push("Campo sem rótulo: " + f.key);
      const c = f.coords || {};
      if (typeof c.x !== "number" || typeof c.y !== "number") erros.push("Coordenada inválida: " + f.key);
      else if (c.x < 0 || c.y < 0) erros.push("Coordenada negativa: " + f.key);
      if (typeof c.largura === "number" && c.largura <= 0) erros.push("Largura inválida: " + f.key);
      if (typeof c.altura === "number" && c.altura <= 0) erros.push("Altura inválida: " + f.key);
      if (f.tipo === "grupo_radio" || f.tipo === "grupo_checkbox") {
        const no = f; // folhas de grupo têm coords; o grupo pai carrega opcoes
      }
      const size = pageSizes ? pageSizes[(f.pagina || 1) - 1] : null;
      if (coordenadaForaDaPagina(c, size)) avisos.push("Fora da página: " + f.key);
    }
    // dependências apontando para campos inexistentes
    const deps = coletarDependenciasSchema(json.campos, [], "");
    for (const d of deps) {
      if (!idsCurto[d.campoKey]) erros.push("dependencia aponta para campo inexistente: \"" + d.campoKey + "\" (em " + d.de + ").");
    }
    // grupos sem opções (nível pai — nós com `opcoes` vazios)
    (function walk(node) {
      if (!node || typeof node !== "object" || Array.isArray(node)) return;
      if (Array.isArray(node.opcoes) ? node.opcoes.length === 0 : node.opcoes && !Object.keys(node.opcoes).length) {
        erros.push("Grupo de opções vazio.");
      }
      for (const k of Object.keys(node)) { const v = node[k]; if (v && typeof v === "object") walk(v); }
    })(json.campos);
    return { erros: erros, avisos: avisos };
  }

  /** Remove recursivamente a propriedade `id` (short id) de um nó de campos. */
  function removerCampoRec(node, id) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return 0;
    let n = 0;
    for (const k of Object.keys(node)) {
      if (k === id) { delete node[k]; n++; continue; }
      n += removerCampoRec(node[k], id);
    }
    return n;
  }

  /** Renomeia a propriedade `id` → `novoId` (mesmo objeto, preserva conteúdo). */
  function renomearCampoRec(node, id, novoId) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    if (Object.prototype.hasOwnProperty.call(node, id)) {
      node[novoId] = node[id];
      delete node[id];
      return true;
    }
    for (const k of Object.keys(node)) {
      if (renomearCampoRec(node[k], id, novoId)) return true;
    }
    return false;
  }

  /** §10 — aplica o mapa campos_custom sobre uma CÓPIA do JSON base:
   *  renomeia (recria com rótulo novo sob id estável), cria e exclui.
   *  Idempotente: aplicar duas vezes produz o mesmo resultado.
   *  Mutação SEMANTICS: muta o objeto recebido (chamador passa cópia). */
  function aplicarCamposCustomEmJson(json, customMap) {
    const ops = { criados: [], renomeados: [], excluidos: [], conflitos: [] };
    if (!json || !json.campos) return ops;
    const cm = customMap || {};
    // 1) exclusões
    for (const id of Object.keys(cm)) {
      const e = cm[id];
      if (e && e.excluir) {
        const n = removerCampoRec(json.campos, id);
        if (n) ops.excluidos.push(id); else ops.conflitos.push(id + " (já ausente)");
      }
    }
    // 2) renomeações (recria com novo id preservando conteúdo)
    for (const id of Object.keys(cm)) {
      const e = cm[id];
      if (e && e.renomeadoDe && e.renomeadoDe !== id && e.id === id) {
        const ok = renomearCampoRec(json.campos, e.renomeadoDe, id);
        if (ok) ops.renomeados.push(e.renomeadoDe + "→" + id);
        else ops.conflitos.push("renomear: original \"" + e.renomeadoDe + "\" ausente");
      }
    }
    // 3) criações — SOMENTE em seções já existentes do schema. O painel não
    // cria seções nem altera a estrutura do JSON do repositório: um campo novo
    // sem seção de destino válida é rejeitado (não há "campos_adicionais").
    for (const id of Object.keys(cm)) {
      const e = cm[id];
      if (!e || e.excluir || e.renomeadoDe) continue;
      if (campoPresenteRec(json.campos, id)) { ops.conflitos.push("criar: id \"" + id + "\" já existe no schema"); continue; }
      const secao = json.campos[e.secao];
      if (!secao || typeof secao !== "object" || Array.isArray(secao)) {
        ops.conflitos.push("criar: seção \"" + e.secao + "\" não existe no schema");
        continue;
      }
      const pai = secao.campos && typeof secao.campos === "object" ? secao.campos : secao;
      pai[id] = entryParaSchema(e);
      ops.criados.push(id);
    }
    return ops;
  }

  /** Presença de propriedade com o nome dado em qualquer nível (sem deletar). */
  function campoPresenteRec(node, id) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    if (Object.prototype.hasOwnProperty.call(node, id)) return true;
    for (const k of Object.keys(node)) if (campoPresenteRec(node[k], id)) return true;
    return false;
  }
  /** Campo custom → objeto no formato do schema do projeto. */
  function entryParaSchema(e) {
    const out = { label: e.label, tipo: e.tipo, pagina: e.pagina || 1, coordenadas: Object.assign({}, e.coordenadas) };
    if (e.obrigatorio) out.obrigatorio = true;
    if (e.opcoes) out.opcoes = e.opcoes;
    if (e.mascara) out.mascara = e.mascara;
    if (e.valor_padrao) out.valor_padrao = e.valor_padrao;
    if (e.observacao) out.observacao = e.observacao;
    return out;
  }

  // ══════════════════════════════════════════════════════
  // FLATTEN JSON → CAMPOS
  // ══════════════════════════════════════════════════════
  function flattenFields(node, sectionPath, out) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(function (n, i) { flattenFields(n, sectionPath + "[" + i + "]", out); }); return; }
    if (node.coordenadas && typeof node.coordenadas === "object") {
      out.push({
        secao: sectionPath.replace(/\.[^.]+$/, "") || sectionPath,
        key: sectionPath,
        label: node.label || sectionPath,
        tipo: node.tipo || "texto",
        pagina: node.pagina || 1,
        coords: node.coordenadas,
        origCoords: Object.assign({}, node.coordenadas),
        obrigatorio: !!node.obrigatorio,
        mascara: node.mascara || "",
        observacao: node.observacao || ""
      });
      return; // coordenadas mais internas não são duplicadas
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        flattenFields(v, sectionPath ? sectionPath + "." + k : k, out);
      }
    }
  }

  function applyOverlayToDoc(docKey, json) {
    const overlayMap = state.overlay[DOCS[docKey].overlayKey] || {};
    for (const f of (docDataFlat(docKey, json) || [])) {
      const patch = overlayMap[f.key];
      if (patch) Object.assign(f.coords, patch);
    }
    // §10 — Field Builder: reconstrói o JSON EFETIVO aplicando criações,
    // renomeações e exclusões do overlay campos_custom (aditivo; o JSON
    // original do repositório permanece em state.docBase[docKey]).
    if (state.overlay.campos_custom && state.overlay.campos_custom[docKey]) {
      aplicarCamposCustomEmJson(json, state.overlay.campos_custom[docKey]);
    }
  }

  function docDataFlat(docKey, json) {
    const flat = [];
    flattenFields(json.campos, "", flat);
    return flat;
  }

  function normalizarChaveCidade(s) {
    return String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleUpperCase("pt-BR")
      .replace(/\s+/g, " ").trim();
  }
  function normalizarFicha(tipo) {
    let t = String(tipo || "").trim().toUpperCase().replace(/\s+/g, " ");
    if (t === "FICHA REEBOLSO") t = "FICHA REEMBOLSO";
    // O arquivo físico é FICHA SA_FO.pdf, mas a chave nas bases de cidades e na
    // aplicação pública é "FICHA SAFO" (sem underscore). Aceita a grafia com
    // underscore para não criar uma ficha inexistente no fluxo Outros Planos.
    if (t === "FICHA SA_FO") t = "FICHA SAFO";
    return t;
  }

  // ══════════════════════════════════════════════════════
  // CARREGAMENTO
  // ══════════════════════════════════════════════════════
  async function fetchJSON(path) {
    const res = await fetch(encodeURI(path), { cache: "no-store" });
    if (!res.ok) throw new Error(path + " → HTTP " + res.status);
    return res.json();
  }

  async function carregarTudo() {
    const cfg = await global.AdminPersistence.carregarConfig();
    state.modo = cfg.modo;
    state.origem = cfg.origem;
    if (cfg.overlay) {
      // v2: pdfs_meta é opcional — overlays antigos não o têm (compatibilidade §2.8)
      state.overlay = Object.assign(state.overlay, cfg.overlay);
      if (!state.overlay.pdfs_meta) state.overlay.pdfs_meta = {};
      if (!state.overlay.cidades) state.overlay.cidades = {};
      if (!state.overlay.cidades_novas) state.overlay.cidades_novas = [];
      // v3 (§32/33): entidades novas e opcionais — ausente = v1/v2 (migração aditiva,
      // nunca destrutiva; o JSON exportado passa a incluir as chaves novas)
      if (!state.overlay.forms_meta) state.overlay.forms_meta = {};
      if (!state.overlay.templates_versoes) state.overlay.templates_versoes = {};
      if (!state.overlay.configuracoes) state.overlay.configuracoes = {};
      if (!state.overlay.campos_custom) state.overlay.campos_custom = {};
    }

    // JSONs de campos — o original fica preservado em docBase (o overlay é
    // aplicado por cima a cada reconstrução; Field Builder §10)
    for (const key of Object.keys(DOCS)) {
      const json = await fetchJSON(DOCS[key].jsonPath);
      // clone defensivo: docBase é a fonte imutável para o Field Builder;
      // docData[key].json sofre mutação pelo overlay (§10)
      state.docBase[key] = JSON.parse(JSON.stringify(json));
      applyOverlayToDoc(key, json);
      state.docData[key] = { json: json, flat: docDataFlat(key, json), page: 1, sel: null, dirty: false };
    }

    // Cidades
    try {
      const brasil = await fetchJSON("../cidades_brasil.json");
      state.citySource = "cidades_brasil.json";
      state.cityArr = (Array.isArray(brasil) ? brasil : []).map(function (r, i) {
        return { idx: i, cidade: String(r.CIDADE || ""), uf: String(r.UF || ""), regional: String(r.REGIONAL || ""), ficha: normalizarFicha(r["FICHA A UTILIZAR"]), fonte: "cidades_brasil.json" };
      });
    } catch (e) {
      const inf = await fetchJSON("../cidades_infinity.json");
      state.citySource = "cidades_infinity.json";
      state.cityArr = (Array.isArray(inf) ? inf : []).map(function (r, i) {
        return { idx: i, cidade: String(r.CIDADE || ""), uf: String(r.UF || ""), regional: String(r.REGIONAL || ""), ficha: normalizarFicha(r["FICHA A UTILIZAR"]), fonte: "cidades_infinity.json" };
      });
    }
    applyCidadesOverlay();
    rebuildCityMap();
  }

  /**
   * T2.2 — aplica o overlay de cidades sobre o array base.
   * Patch de cidade suporta DOIS formatos (compatibilidade §2.8):
   *   antigo: { ficha }                    → só troca a ficha
   *   novo:   { cidade, uf, regional, ficha } → sobrepõe todos os campos
   * A chave do patch é a normalização do nome ORIGINAL do JSON
   * (capturada na 1ª carga como `origemChave`), imune a renomeações.
   */
  function applyCidadesOverlay() {
    for (const r of state.cityArr) {
      if (r.fonte !== "overlay administrativo") {
        if (!r.origemChave) r.origemChave = normalizarChaveCidade(r.cidade); // capturado UMA vez
        const patch = state.overlay.cidades[r.origemChave];
        if (patch) {
          if (patch.cidade) r.cidade = String(patch.cidade);
          if (patch.uf) r.uf = String(patch.uf);
          if (patch.regional) r.regional = String(patch.regional);
          if (patch.ficha) r.ficha = normalizarFicha(patch.ficha);
          r.editada = true;
        }
      }
    }
    // cidades novas (overlay)
    for (const nova of state.overlay.cidades_novas || []) {
      if (state.cityArr.some(function (r) { return r.fonte === "overlay administrativo" && r.idx === "n" + nova.id; })) continue;
      state.cityArr.push({
        idx: "n" + nova.id, cidade: nova.cidade, uf: nova.uf, regional: nova.regional,
        ficha: normalizarFicha(nova.ficha), fonte: "overlay administrativo", overlayId: nova.id
      });
    }
    // garante sequência de ids nova maior que a maior já usada (import pode trazer ids altos)
    let maxId = 0;
    for (const n of (state.overlay.cidades_novas || [])) maxId = Math.max(maxId, Number(n.id) || 0);
    state.cidadesNovasSeq = Math.max(state.cidadesNovasSeq, maxId + 1);
  }

  function rebuildCityMap() {
    state.cityMap = {};
    for (const r of state.cityArr) {
      const k = normalizarChaveCidade(r.cidade);
      if (k) state.cityMap[k] = r.ficha;
    }
  }

  // ══════════════════════════════════════════════════════
  // v3 — OVERLAY: EXPORT PURA, PENDENTES, STATUS DE TEMPLATE
  // ══════════════════════════════════════════════════════
  /** Espelha exatamente a estrutura gravada por exportarConfig()/persistência. */
  function exportarOverlayPuro() {
    return {
      campos_ficha: state.overlay.campos_ficha || {},
      campos_declaracao: state.overlay.campos_declaracao || {},
      campos_custom: state.overlay.campos_custom || {},
      cidades: state.overlay.cidades || {},
      cidades_novas: state.overlay.cidades_novas || [],
      pdfs_meta: state.overlay.pdfs_meta || {},
      forms_meta: state.overlay.forms_meta || {},
      templates_versoes: state.overlay.templates_versoes || {},
      configuracoes: state.overlay.configuracoes || {}
    };
  }

  /** §23 — alterações pendentes: itens do overlay ainda não marcados como publicados. */
  function calcularPendentes(overlay, marcados) {
    const pend = [];
    const pub = marcados || {};
    for (const key of Object.keys((overlay || {}).campos_ficha || {})) if (!pub[key]) pend.push({ overlayKey: "campos_ficha", chave: key, label: key, detalhe: resumoValor(overlay.campos_ficha[key]) });
    for (const key of Object.keys((overlay || {}).campos_declaracao || {})) if (!pub[key]) pend.push({ overlayKey: "campos_declaracao", chave: key, label: key, detalhe: resumoValor(overlay.campos_declaracao[key]) });
    for (const key of Object.keys((overlay || {}).cidades || {})) if (!pub[key]) pend.push({ overlayKey: "cidades", chave: key, label: key, detalhe: resumoValor(overlay.cidades[key]) });
    for (const n of (overlay || {}).cidades_novas || []) {
      const k = "n" + n.id;
      if (!pub[k]) pend.push({ overlayKey: "cidades_novas", chave: k, label: n.cidade, detalhe: (n.cidade || "") + " (" + (n.uf || "—") + ") → " + (n.ficha || "—") });
    }
    for (const key of Object.keys((overlay || {}).pdfs_meta || {})) if (!pub[key]) pend.push({ overlayKey: "pdfs_meta", chave: key, label: key, detalhe: resumoValor(overlay.pdfs_meta[key]) });
    for (const key of Object.keys((overlay || {}).forms_meta || {})) if (!pub[key]) pend.push({ overlayKey: "forms_meta", chave: key, label: key, detalhe: resumoValor(overlay.forms_meta[key]) });
    for (const key of Object.keys((overlay || {}).templates_versoes || {})) if (!pub[key]) pend.push({ overlayKey: "templates_versoes", chave: key, label: key, detalhe: resumoValor(overlay.templates_versoes[key]) });
    for (const key of Object.keys((overlay || {}).configuracoes || {})) if (!pub[key]) pend.push({ overlayKey: "configuracoes", chave: key, label: key, detalhe: resumoValor(overlay.configuracoes[key]) });
    for (const key of Object.keys((overlay || {}).campos_custom || {})) if (!pub[key]) pend.push({ overlayKey: "campos_custom", chave: key, label: "Campos — " + key, detalhe: resumoValorCamposCustom(overlay.campos_custom[key]) });
    return pend;
  }

  /** Resumo legível de um lote de campos customizados (lista de pendências). */
  function resumoValorCamposCustom(lote) {
    const ids = Object.keys(lote || {});
    const partes = [];
    for (const id of ids) {
      const e = lote[id];
      if (e && e.excluir) partes.push("− " + id);
      else if (e && e.renomeadoDe) partes.push(e.renomeadoDe + " → " + id);
      else partes.push("+ " + id);
    }
    return partes.length ? partes.join(", ") : "(vazio)";
  }

  /** §23 — marca todos os itens pendentes como publicados (append-only; limpa a lista).
   *  Cria um novo marco (a trilha de auditoria de eventos nunca é apagada). */
  function publicarPendentes(overlay, marcados, usuario) {
    const pend = calcularPendentes(overlay, marcados);
    const pub = Object.assign({}, marcados || {});
    const agora = new Date().toISOString();
    for (const p of pend) pub[p.chave] = { publicadoEm: agora, por: usuario || "" };
    return { marcados: pub, publicados: pend.length };
  }

  /** §23 — descarta SOMENTE os itens pendentes (por grupo); cidades_novas só sai
   *  se a cidade existir na base efetiva (senão vira buraco de mapeamento). */
  function descartarPendentesPuro(overlay, cityMap, marcados) {
    const o = overlay || {};
    const pend = calcularPendentes(o, marcados);
    const grupos = {};
    for (const p of pend) (grupos[p.overlayKey] || (grupos[p.overlayKey] = new Set())).add(p.chave);
    const manterMap = function (g) {
      const out = {}, marc = grupos[g] || new Set();
      for (const k of Object.keys(o[g] || {})) if (!marc.has(k)) out[k] = o[g][k];
      return out;
    };
    const novasRestantes = [];
    const novasMarc = grupos.cidades_novas || new Set();
    for (const n of o.cidades_novas || []) {
      const k = "n" + n.id;
      if (!novasMarc.has(k)) { novasRestantes.push(n); continue; }
      if (!(cityMap || {})[normalizarChaveCidade(n.cidade)]) novasRestantes.push(n); // sem substituto efetivo → manter
    }
    return {
      overlay: {
        campos_ficha: manterMap("campos_ficha"),
        campos_declaracao: manterMap("campos_declaracao"),
        cidades: manterMap("cidades"),
        cidades_novas: novasRestantes,
        pdfs_meta: manterMap("pdfs_meta"),
        forms_meta: manterMap("forms_meta"),
        templates_versoes: manterMap("templates_versoes"),
        configuracoes: manterMap("configuracoes"),
        campos_custom: manterMap("campos_custom")
      },
      descartados: pend.length
    };
  }

  /** §8 — status do template: número da versão (overlay) e se há rollback disponível. */
  function templateStatusParaForm(codigo, meta, versoes) {
    const m = meta || {}, v = versoes || {};
    const ent = v[m.template];
    const atual = ent && ent.atual;
    return { versao: atual && atual.versao ? atual.versao : null, rollback: !!(ent && ent.anterior && ent.anterior.arquivo) };
  }

  /** §8 — contagens derivadas (campos, cidades associadas) para a tabela de formulários.
   *  v3: nCamposCustom conta as operações do Field Builder (§10) por docKey. */
  function formulariosComMetricas(FORMS, DOCSMAP, docFlatLens, fichaParaArquivo, cityArr, formsMeta, versoes, camposCustom) {
    const porFicha = {};
    for (const r of cityArr) {
      const f = fichaParaArquivo[r.ficha];
      if (f) porFicha[f] = (porFicha[f] || 0) + 1;
    }
    const cc = camposCustom || {};
    return FORMS.map(function (f) {
      const docKey = f.docKey || null;
      const meta = (formsMeta || {})[f.codigo] || {};
      const st = templateStatusParaForm(f.codigo, Object.assign({ template: f.pdfFile || "" }, meta), versoes);
      const nCampos = docKey && docFlatLens[docKey] != null ? docFlatLens[docKey] : null;
      const nCidades = f.pdfFile ? (porFicha[f.pdfFile] || 0) : null;
      const nCamposCustom = docKey && cc[docKey] ? Object.keys(cc[docKey]).length : 0;
      return Object.assign({}, f, { nCampos: nCampos, nCidades: nCidades, nCamposCustom: nCamposCustom, templateStatus: st, meta: meta });
    });
  }

  // ══════════════════════════════════════════════════════
  // UI BÁSICA
  // ══════════════════════════════════════════════════════
  function showSection(name) {
    document.querySelectorAll(".admin-section").forEach(function (s) { s.classList.remove("active"); });
    const sec = $("sec-" + name);
    if (sec) sec.classList.add("active");
    // v3 (§6): item de menu — incluindo os que vivem no sub-menu "Mais ferramentas"
    document.querySelectorAll(".admin-side button[data-section]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-section") === name);
    });
    if (name === "historico") renderHistorico();
    if (name === "dados") renderDados();
    if (name === "sistema") renderSistema();
    if (name === "cidades") renderCidades();
    if (name === "formularios") { renderFormularios(); renderFormDetail(); }
    if (name === "validacao") renderValidacao();
    if (name === "configuracoes") renderConfiguracoes();
    if (name === "coordenadas") {
      // Auto-recuperação: se o template não carregou no init (ex.: CDN lenta
      // na abertura), tenta de novo ao entrar na seção — antes falava só no init.
      const edDocSel = $("edDoc");
      const docKey = edDocSel ? edDocSel.value : null;
      if (docKey && state.docData[docKey] && !state.docData[docKey].pdfjsDoc && global.pdfjsLib) {
        loadDocForEditor(docKey).catch(function (e) {
          toast("Falha ao carregar template: " + e.message, false);
        });
      }
    }
    window.scrollTo(0, 0);
  }

  function confirmModal(title, bodyHTML, okLabel) {
    return new Promise(function (resolve) {
      const ov = $("confirmOverlay");
      $("confirmTitle").textContent = title;
      $("confirmBody").innerHTML = bodyHTML;
      $("confirmOk").textContent = okLabel || "Confirmar";
      ov.classList.add("show");
      ov.setAttribute("aria-hidden", "false");
      $("confirmOk").focus();
      function close(val) {
        ov.classList.remove("show");
        ov.setAttribute("aria-hidden", "true");
        $("confirmOk").onclick = null;
        $("confirmCancel").onclick = null;
        ov.onkeydown = null;
        resolve(val);
      }
      $("confirmOk").onclick = function () { close(true); };
      $("confirmCancel").onclick = function () { close(false); };
      ov.onkeydown = function (ev) {
        if (ev.key === "Escape") { ev.preventDefault(); close(false); }
      };
    });
  }

  function toast(msg, ok) {
    const el = document.createElement("div");
    el.className = "notice " + (ok === false ? "err" : "ok");
    el.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2000;max-width:420px;box-shadow:var(--shadow-lg)";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.parentNode.removeChild(el); }, 4200);
  }

  // ══════════════════════════════════════════════════════
  // v3 — SUB-MENU LATERAL (§6: entidades em cima, ferramentas embaixo)
  // ══════════════════════════════════════════════════════
  function instalarSubmenu() {
    const toggle = document.querySelector("button[data-submenu-toggle]");
    const lista = $("adminSubmenu");
    if (!toggle || !lista) return;
    toggle.addEventListener("click", function () {
      const abrir = lista.hidden; // oculto agora → vai abrir
      lista.hidden = !abrir;
      toggle.textContent = (abrir ? "▾" : "▸") + " Mais ferramentas";
      toggle.setAttribute("aria-expanded", abrir ? "true" : "false");
    });
  }

  // ══════════════════════════════════════════════════════
  // v3 — VALIDAÇÃO PRÉ-PUBLICAÇÃO (§24): erro crítico trava; aviso exige confirmação
  // ══════════════════════════════════════════════════════
  function coletarProblemas() {
    const criticos = [], avisos = [];
    // Campos: coordenadas numéricas e dentro da página (quando as dimensões são conhecidas)
    for (const key of Object.keys(DOCS)) {
      const dd = state.docData[key];
      if (!dd || !dd.flat) continue;
      for (const f of dd.flat) {
        const c = f.coords;
        if (typeof c.x !== "number" || typeof c.y !== "number") {
          criticos.push("Coordenada inválida: " + DOCS[key].label + " → " + f.label);
          continue;
        }
        const size = dd.pageSizes ? dd.pageSizes[(f.pagina || 1) - 1] : null;
        if (coordenadaForaDaPagina(c, size)) avisos.push("Fora da página: " + DOCS[key].label + " → " + f.label);
      }
    }
    // Cidades → ficha mapeada; UF válida
    for (const r of state.cityArr) {
      if (!FICHA_UTILIZAR_PARA_ARQUIVO[r.ficha]) criticos.push("Cidade sem template mapeado: " + r.cidade + " (" + (r.uf || "—") + ") → ficha \"" + r.ficha + "\"");
      if (r.uf && !ufValida(r.uf)) avisos.push("UF suspeita: " + r.cidade + " → \"" + r.uf + "\"");
    }
    // §10 — Field Builder: validação estrutural completa do schema EFETIVO
    // (base + customizações do painel). Erro crítico trava a publicação.
    for (const key of Object.keys(DOCS)) {
      const json = fbDocEfetivo(key);
      if (!json || !json.campos) continue;
      const dd = state.docData[key];
      const v = validarDocCampos(json, dd ? dd.pageSizes : null);
      for (const e of v.erros) criticos.push("Schema de " + DOCS[key].label + ": " + e);
      for (const a of v.avisos) avisos.push("Schema de " + DOCS[key].label + ": " + a);
    }
    return { criticos: criticos, avisos: avisos };
  }

  /** §24 — gate de publicação: trava em erro crítico; confirmação em aviso. */
  async function validarAntesDePublicar() {
    const { criticos, avisos } = coletarProblemas();
    if (criticos.length) {
      await confirmModal("Publicação bloqueada",
        "<p>Há <strong>" + criticos.length + " erro(s) crítico(s)</strong>. A publicação foi bloqueada até a correção:</p><pre>" + esc(criticos.slice(0, 8).join("\n")) + (criticos.length > 8 ? "\n… e mais " + (criticos.length - 8) : "") + "</pre>",
        "Entendi");
      return false;
    }
    if (avisos.length) {
      return await confirmModal("Publicar com avisos",
        "<p>Há <strong>" + avisos.length + " aviso(s)</strong> que não impedem a publicação:</p><pre>" + esc(avisos.slice(0, 8).join("\n")) + (avisos.length > 8 ? "\n… e mais " + (avisos.length - 8) : "") + "</pre><p>Publicar mesmo assim?</p>",
        "Publicar mesmo assim");
    }
    return true;
  }

  // ══════════════════════════════════════════════════════
  // v3 — CONFIGURAÇÕES (§22): categorias, salvas em overlay.configuracoes
  // ══════════════════════════════════════════════════════
  const CONFIG_DEFS = [
    { key: "geral.nome_sistema", label: "Nome do sistema", categoria: "Geral", tipo: "texto", default: "Formulários de Admissão" },
    { key: "geral.manutencao", label: "Modo manutenção (aviso no painel)", categoria: "Geral", tipo: "bool", default: false },
    { key: "formularios.validar_uf", label: "Validar UF em cadastros e importações", categoria: "Formulários", tipo: "bool", default: true },
    { key: "formularios.exigir_template", label: "Exigir template válido para publicar", categoria: "Formulários", tipo: "bool", default: true },
    { key: "pdfs.limite_mb", label: "Limite de upload de PDF (MB)", categoria: "PDFs", tipo: "int", min: 1, max: 50, default: 20 },
    { key: "pdfs.manter_versoes", label: "Manter histórico de versões dos templates", categoria: "PDFs", tipo: "bool", default: true },
    { key: "cidades.validar_uf", label: "Validar UF (27 estados) em cidades", categoria: "Cidades", tipo: "bool", default: true },
    { key: "seguranca.confirmar_destrutivas", label: "Exigir confirmação em operações destrutivas", categoria: "Segurança", tipo: "bool", default: true }
  ];
  /** Leitura com default (§22); int é limitada ao range definido em CONFIG_DEFS. */
  function configGet(key) {
    const def = CONFIG_DEFS.find(function (d) { return d.key === key; });
    const cfg = state.overlay.configuracoes || {};
    const raw = key.split(".").reduce(function (acc, k) { return acc && acc[k]; }, cfg);
    if (raw == null) return def ? def.default : null;
    if (def && def.tipo === "bool") return raw !== false;
    if (def && def.tipo === "int") {
      const n = parseInt(raw, 10);
      if (isNaN(n)) return def.default;
      return Math.min(def.max, Math.max(def.min, n));
    }
    return raw;
  }
  /** Escrita por path "a.b" — preserva outras chaves. */
  function configSetPath(cfg, key, value) {
    const parts = key.split(".");
    const out = Object.assign({}, cfg || {});
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      node[k] = Object.assign({}, node[k] || {});
      node = node[k];
    }
    node[parts[parts.length - 1]] = value;
    return out;
  }
  /** Serialização de valor de configuração para o overlay (bool/int/texto). */
  function configValorParaOverlay(def, raw) {
    if (def.tipo === "bool") return raw === true || raw === "true";
    if (def.tipo === "int") { const n = parseInt(raw, 10); return isNaN(n) ? def.default : Math.min(def.max, Math.max(def.min, n)); };
    return String(raw);
  }

  function renderConfiguracoes() {
    const box = $("configLista");
    if (!box) return;
    const cats = Array.from(new Set(CONFIG_DEFS.map(function (d) { return d.categoria; })));
    let html = "";
    for (const cat of cats) {
      html += "<h4 style='margin:14px 0 6px;font-size:12.5px;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px'>" + esc(cat) + "</h4>";
      for (const d of CONFIG_DEFS.filter(function (x) { return x.categoria === cat; })) {
        const val = configGet(d.key);
        html += '<div class="diff-line" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
          '<label for="cfg_' + esc(d.key) + '" style="flex:1;min-width:240px;font-size:12.5px">' + esc(d.label) + '</label>';
        if (d.tipo === "bool") {
          const selTrue = val ? ' selected' : '';
          const selFalse = !val ? ' selected' : '';
          html += '<select id="cfg_' + esc(d.key) + '">' +
            '<option value="true"' + selTrue + '>Ativado</option>' +
            '<option value="false"' + selFalse + '>Desativado</option></select>';
        } else if (d.tipo === "int") {
          html += '<input type="number" id="cfg_' + esc(d.key) + '" value="' + esc(val) + '" min="' + d.min + '" max="' + d.max + '" style="width:110px">';
        } else {
          html += '<input type="text" id="cfg_' + esc(d.key) + '" value="' + esc(val) + '" style="width:220px">';
        }
        html += "</div>";
        // persistência do valor (listener pós-render)
        setTimeout(function () {
          const el = $("cfg_" + d.key);
          if (!el || el.dataset.bound) return;
          el.dataset.bound = "1";
          el.addEventListener("change", async function () {
            const novo = configValorParaOverlay(d, el.type === "checkbox" ? el.checked : el.value);
            const anterior = configGet(d.key);
            state.overlay.configuracoes = configSetPath(state.overlay.configuracoes, d.key, novo);
            await persistOverlaySilencioso("configuracao_alterada", d.key,
              { overlayKey: "configuracoes", itens: [{ chave: d.key, anterior: anterior }] },
              d.label + ": " + resumoValor(anterior) + " → " + resumoValor(novo));
            renderDashboard();
            toast("Configuração salva: " + d.label);
          });
        }, 0);
        html += "";
      }
    }
    box.innerHTML = html;
  }

  // ══════════════════════════════════════════════════════
  // v3 — VALIDAÇÃO (§24): relatório completo (seção própria)
  // ══════════════════════════════════════════════════════
  function renderValidacao() {
    const box = $("validacaoLista");
    if (!box) return;
    const { criticos, avisos } = coletarProblemas();
    const itensHtml = function (lista, classe, icone) {
      return lista.slice(0, 60).map(function (t) { return '<div class="diff-line ' + classe + '">' + icone + " " + esc(t) + "</div>"; }).join("") +
        (lista.length > 60 ? '<div class="diff-line">… e mais ' + (lista.length - 60) + "</div>" : "");
    };
    box.innerHTML =
      '<div class="notice ' + (criticos.length ? "err" : (avisos.length ? "warn" : "ok")) + '"><strong>Integridade da configuração:</strong> ' +
      criticos.length + " erro(s) crítico(s) · " + avisos.length + " aviso(s). " +
      (criticos.length ? "Erros críticos bloqueiam a publicação." : "Nenhum bloqueio de publicação.") + "</div>" +
      (criticos.length ? "<h4 style='margin:10px 0 6px;font-size:12.5px;color:var(--err)'>Erros críticos</h4>" + itensHtml(criticos, "", "✕") : "") +
      (avisos.length ? "<h4 style='margin:10px 0 6px;font-size:12.5px;color:var(--warn)'>Avisos</h4>" + itensHtml(avisos, "", "⚠") : "");
  }

  // ══════════════════════════════════════════════════════
  // TAREFA 1 — formModal(): formulário genérico em modal
  // ══════════════════════════════════════════════════════
  /**
   * Abre um modal com campos dinâmicos e resolve para os valores
   * validados (ou null se cancelado). Base de reuso das Tarefas 2, 3 e 5
   * — substitui formulários improvisados dentro do confirmModal.
   *
   * config = {
   *   title: string,
   *   fields: [{
   *     key, label, type: 'text'|'select'|'number',
   *     value, options?: [{v, t}]|string[], required?: bool,
   *     maxLength?: number, uppercase?: bool,
   *     placeholder?: string, help?: string,
   *     validate?: (value, allValues) => string|null   // erro inline
   *   }],
   *   okLabel?: string,
   *   validate?: (values) => string|null               // validação cruzada
   * }
   * @returns {Promise<Object|null>} valores por key, ou null se cancelado.
   *
   * Regras: required vazio bloqueia com erro inline (.notice.err) sem fechar;
   * Enter confirma (submit), Esc cancela; foco automático no primeiro campo;
   * nenhum fluxo novo deve montar HTML manual dentro do confirmBody.
   */
  function formModal(config) {
    return new Promise(function (resolve) {
      const ov = $("formOverlay");
      const form = $("formModalForm");
      const wrap = $("formModalFields");
      const errBox = $("formModalError");
      $("formModalTitle").textContent = config.title || "Editar";
      $("formModalOk").textContent = config.okLabel || "Salvar";
      errBox.hidden = true;
      wrap.innerHTML = "";

      const fields = config.fields || [];
      for (const f of fields) {
        const div = document.createElement("div");
        div.className = "fm-field";
        const id = "fm_" + f.key;
        let ctrl;
        if (f.type === "select") {
          const opts = (f.options || []).map(function (o) {
            const v = typeof o === "object" ? o.v : o;
            const t = typeof o === "object" ? (o.t || o.v) : o;
            return '<option value="' + esc(v) + '"' + (String(v) === String(f.value) ? " selected" : "") + ">" + esc(t) + "</option>";
          }).join("");
          ctrl = '<select id="' + id + '">' + opts + "</select>";
        } else {
          ctrl = '<input id="' + id + '" type="' + (f.type === "number" ? "number" : "text") + '" value="' + esc(f.value == null ? "" : f.value) + '"' +
            (f.maxLength ? ' maxlength="' + esc(f.maxLength) + '"' : "") +
            (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : "") +
            (f.uppercase ? ' style="text-transform:uppercase"' : "") + ">";
        }
        div.innerHTML =
          '<label for="' + id + '">' + esc(f.label) + (f.required ? ' <span aria-hidden="true" style="color:var(--err)">*</span>' : "") + "</label>" +
          ctrl + (f.help ? '<div class="field-list-count">' + esc(f.help) + "</div>" : "");
        wrap.appendChild(div);
      }

      function coletar() {
        const vals = {};
        for (const f of fields) {
          let v = $("fm_" + f.key).value;
          if (f.uppercase) v = v.trim().toUpperCase();
          if (f.type === "number") v = v === "" ? null : Number(v);
          vals[f.key] = v;
        }
        return vals;
      }

      function mostrarErro(msg, key) {
        errBox.textContent = msg;
        errBox.hidden = false;
        if (key) { const el = $("fm_" + key); if (el) el.focus(); }
      }

      function validar() {
        const vals = coletar();
        for (const f of fields) {
          const v = vals[f.key];
          if (f.required && (v == null || String(v).trim() === "")) {
            mostrarErro('Preencha o campo "' + f.label + '" para continuar.', f.key);
            return null;
          }
          if (f.validate) {
            const erro = f.validate(v, vals);
            if (erro) { mostrarErro(erro, f.key); return null; }
          }
        }
        if (config.validate) {
          const erro = config.validate(vals);
          if (erro) { mostrarErro(erro); return null; }
        }
        return vals;
      }

      ov.classList.add("show");
      ov.setAttribute("aria-hidden", "false");
      const primeiro = wrap.querySelector("input,select");
      if (primeiro) primeiro.focus();

      function close(val) {
        ov.classList.remove("show");
        ov.setAttribute("aria-hidden", "true");
        form.onsubmit = null;
        $("formModalCancel").onclick = null;
        ov.onkeydown = null;
        resolve(val);
      }
      form.onsubmit = function (ev) {
        ev.preventDefault();
        const vals = validar();
        if (vals) close(vals);
      };
      $("formModalCancel").onclick = function () { close(null); };
      ov.onkeydown = function (ev) { if (ev.key === "Escape") { ev.preventDefault(); close(null); } };
    });
  }

  /**
   * UX §6 — botão de ação assíncrona: desabilita a si mesmo e mostra
   * estado de carregamento enquanto `fn` corre; restaura no fim.
   * Uso: onclick = comLoading(btn, async () => {...});
   */
  function comLoading(btn, fn) {
    return async function () {
      if (btn.disabled) return;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Aguarde…";
      btn.setAttribute("aria-busy", "true");
      try { await fn(); }
      finally {
        btn.disabled = false;
        btn.textContent = original;
        btn.removeAttribute("aria-busy");
      }
    };
  }

  // ══════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════
  function countCoords(json) {
    const flat = [];
    flattenFields(json.campos, "", flat);
    return flat.length;
  }

  function renderDashboard() {
    const ficha = state.docData.ficha_cadastral;
    const decl = state.docData.declaracao_plano_saude;
    const nCoordFicha = countCoords(ficha.json);
    const nCoordDecl = countCoords(decl.json);
    const pdfs = pdfsEfetivos();
    const nAlteracoes = calcularPendentes(exportarOverlayPuro(), state.pendentesMarcados).length;
    const semAssoc = state.cityArr.filter(function (r) { return !FICHA_UTILIZAR_PARA_ARQUIVO[r.ficha]; }).length;
    const semPdf = Object.keys(FORM_PDF_ARQUIVO).filter(function (c) {
      return !pdfs.some(function (p) { return p.arquivo === FORM_PDF_ARQUIVO[c]; });
    }).length;
    const cards = [
      { k: "Formulários", v: FORMULARIOS.length, s: "fluxos no código" },
      { k: "Templates PDF", v: pdfs.length, s: "arquivos em uso" },
      { k: "Cidades", v: state.cityArr.length, s: state.citySource },
      { k: "Campos F-075", v: nCoordFicha, s: "com coordenadas" },
      { k: "Campos Declaração", v: nCoordDecl, s: "página 2" },
      { k: "Fichas regionais", v: Object.keys(FICHA_UTILIZAR_PARA_ARQUIVO).length, s: "Outros Planos" },
      { k: "Alterações pendentes", v: nAlteracoes, s: state.modo === "api" ? "gravadas no servidor" : "no overlay da sessão" },
      { k: "Cidades sem associação", v: semAssoc, s: "sem ficha → PDF mapeada" },
      { k: "Formulários sem PDF", v: semPdf, s: "template ausente" },
      { k: "Modo de persistência", v: state.modo === "api" ? "API" : "Export", s: state.origem || "" }
    ];
    $("dashCards").innerHTML = cards.map(function (c) {
      return '<div class="stat-card"><div class="k">' + esc(c.k) + '</div><div class="v">' + esc(c.v) +
        '</div><div class="s">' + esc(c.s) + "</div></div>";
    }).join("");

    const regioes = {};
    for (const r of state.cityArr) regioes[r.regional || "—"] = (regioes[r.regional || "—"] || 0) + 1;
    let status = "<table class='data'><tbody>";
    status += "<tr><td>F-075 Ficha Cadastral</td><td><span class='badge ok'>Ativo</span></td><td>" + nCoordFicha + " campos</td></tr>";
    status += "<tr><td>F-089 Assistência Médica</td><td><span class='badge ok'>Ativo</span></td><td>Plano de Benefícios + " + Object.keys(FICHA_UTILIZAR_PARA_ARQUIVO).length + " fichas regionais</td></tr>";
    status += "<tr><td>Carta Conta Salário</td><td><span class='badge ok'>Ativo</span></td><td>geração programática</td></tr>";
    status += "<tr><td>Termos de Aceite</td><td><span class='badge warn'>Indisponível</span></td><td>marcado na home</td></tr>";
    for (const reg of Object.keys(regioes).sort()) {
      status += "<tr><td>Regional " + esc(reg) + "</td><td><span class='badge muted'>" + regioes[reg] + " cidades</span></td><td></td></tr>";
    }
    status += "</tbody></table>";
    $("dashStatus").innerHTML = status;

    const note = $("admExportNote");
    if (state.modo === "export") {
      note.innerHTML = '<div class="export-note">⚠ <div><strong>Modo exportação.</strong> Este ambiente não tem a API administrativa ativa. As alterações ficam no overlay da sessão e são efetivadas via <em>Exportar JSON</em> (Dados) para versionamento no repositório. Em desenvolvimento, use <code>node scripts/test-server.mjs</code> para o modo API com gravação e backups automáticos.</div></div>';
    } else {
      note.innerHTML = '<div class="notice ok">✓ Modo API ativo — alterações gravadas no servidor com backup automático (' + esc(state.origem) + ").</div>";
    }

    // Tarefa 0 — Saúde do Sistema: roda automaticamente ao abrir o Dashboard.
    renderSaudeFromCache(); // mostra cache imediatamente (se houver)
    atualizarSaude();

    // v3 (§23) — Alterações Pendentes: publicar/descartar
    renderPendentes();
  }

  function renderPendentes() {
    const el = $("dashPendentes");
    if (!el) return;
    const pend = calcularPendentes(exportarOverlayPuro(), state.pendentesMarcados);
    if (!pend.length) {
      el.innerHTML = '<div class="saude-ok-line">Nenhuma alteração pendente — todas as edições do overlay já foram publicadas.</div>';
      return;
    }
    el.innerHTML = '<div class="notice info" style="margin-bottom:10px">' + pend.length +
      " alteração(ões) pendente(s) de publicação. " +
      (state.modo === "api"
        ? "Gravadas no servidor; <strong>publicar</strong> registra o marco de produção (backup automático é criado a cada salvamento)."
        : "No overlay da sessão — <strong>publicar</strong> registra o marco; para efetivar na aplicação pública, exporte o JSON (Dados) e versione-o no repositório.") + "</div>" +
      pend.slice(0, 12).map(function (p) {
        return '<div class="pend-linha"><span class="p-chave">' + esc(p.overlayKey) + " · " + esc(p.label) + '</span><span class="p-detalhe">' + esc(p.detalhe) + "</span></div>";
      }).join("") +
      (pend.length > 12 ? '<div class="section-desc">… e mais ' + (pend.length - 12) + "</div>" : "") +
      '<div class="editor-actions"><button type="button" class="btn" id="btnPublicarPend">Publicar alterações</button>' +
      '<button type="button" class="btn danger" id="btnDescartarPend">Descartar pendências</button></div>';
    const bp = $("btnPublicarPend"), bd = $("btnDescartarPend");
    if (bp) bp.onclick = comLoading(bp, publicarPendHandler);
    if (bd) bd.onclick = comLoading(bd, descartarPendHandler);
  }

  /** §23 — publicar: valida (§24), registra marco e persiste. */
  async function publicarPendHandler() {
    if (!(await validarAntesDePublicar())) return;
    const email = (global.atentoAdminEmail && global.atentoAdminEmail()) || "admin";
    const r = publicarPendentes(exportarOverlayPuro(), state.pendentesMarcados, email);
    state.pendentesMarcados = r.marcados;
    try { await global.AdminPersistence.salvarOverlay(exportarOverlayPuro()); } catch (e) { toast("Falha ao persistir: " + e.message, false); }
    await logEvento({ acao: "publicacao", entidade: "overlay administrativo", alteracao: r.publicados + " item(ns) publicados (marco de publicação)" + (state.modo === "api" ? " — modo API" : " — efetivar via exportação/versionamento") });
    renderDashboard();
    toast(r.publicados + " alteração(ões) publicada(s).");
  }

  /** §23 — descartar pendências (confirmação com quantidade afetada, §15/§39). */
  async function descartarPendHandler() {
    const overlay = exportarOverlayPuro();
    const pend = calcularPendentes(overlay, state.pendentesMarcados);
    if (!pend.length) return;
    const ok = await confirmModal("Descartar pendências",
      "<p>Você está prestes a <strong>descartar " + pend.length + " alteração(ões)</strong> do overlay administrativo (campos, cidades, metadados e versões).</p>" +
      "<p>Cidades novas cuja associação não exista na base serão preservadas para não deixar mapeamento sem template.</p>",
      "Descartar");
    if (!ok) return;
    const r = descartarPendentesPuro(overlay, state.cityMap, state.pendentesMarcados);
    state.overlay = r.overlay;
    try { await global.AdminPersistence.salvarOverlay(state.overlay); } catch (e) { toast("Falha ao persistir: " + e.message, false); }
    for (const key of Object.keys(DOCS)) applyOverlayToDoc(key, state.docData[key].json);
    applyCidadesOverlay(); rebuildCityMap();
    await logEvento({ acao: "descarte_pendencias", entidade: "overlay administrativo", alteracao: r.descartados + " item(ns) descartado(s)" });
    renderDashboard(); renderPdfs($("pdfSearch").value); renderCidades(); renderAssistMap();
    toast("Pendências descartadas.");
  }

  // ══════════════════════════════════════════════════════
  // TAREFA 0 — SAÚDE DO SISTEMA
  // ══════════════════════════════════════════════════════
  /**
   * Coletor reutilizável de problemas de integridade (reaproveita as
   * mesmas verificações da seção Segurança — não recria a lógica do zero).
   * Cada problema carrega `go` — função que abre a seção correta com o
   * filtro já aplicado (ex.: cidades sem ficha → sec-cidades filtrada).
   * `rapido=true` pula os HEADs de rede (verificação instantânea p/ Dashboard).
   */
  async function coletarIntegridade(rapido) {
    const itens = [];
    let okN = 0, warnN = 0, errN = 0;

    async function head(path) {
      try { const r = await fetch(encodeURI(path), { method: "HEAD" }); return r.ok; } catch (e) { return false; }
    }

    // 1) Templates PDF acessíveis
    for (const p of pdfsEfetivos()) {
      if (rapido) { okN++; continue; }
      if (await head(p.path)) okN++;
      else { errN++; itens.push({ nivel: "err", texto: "PDF inacessível: " + p.arquivo, go: function () { irParaPdfs(p.arquivo); } }); }
    }

    // 2) Coordenadas válidas e dentro da página
    for (const key of Object.keys(DOCS)) {
      const flat = state.docData[key].flat;
      okN++;
      for (const f of flat) {
        const c = f.coords;
        if (typeof c.x !== "number" || typeof c.y !== "number") {
          errN++;
          itens.push({ nivel: "err", texto: "Coordenada inválida: " + DOCS[key].label + " → " + f.label, go: function () { irParaCampo(key, f); } });
        } else if (!rapido) {
          const size = state.docData[key].pageSizes ? state.docData[key].pageSizes[(f.pagina || 1) - 1] : null;
          if (size && (c.x < 0 || c.y < 0 || c.x > size.w + 40 || c.y > size.h + 40)) {
            warnN++;
            itens.push({ nivel: "warn", texto: "Fora da página (aprox.): " + DOCS[key].label + " → " + f.label, go: function () { irParaCampo(key, f); } });
          }
        }
      }
    }

    // 3) Cidades → ficha mapeada para template existente
    const semTemplate = state.cityArr.filter(function (r) { return !FICHA_UTILIZAR_PARA_ARQUIVO[r.ficha]; });
    if (semTemplate.length) {
      warnN++;
      itens.push({
        nivel: "warn",
        texto: semTemplate.length + " cidade(s) com ficha não mapeada para PDF",
        go: function () { irParaCidadesSemTemplate(semTemplate); }
      });
    } else okN++;

    // 4) Formulários acessíveis
    for (const f of FORMULARIOS) {
      if (rapido) { okN++; continue; }
      if (await head(f.arquivo)) okN++;
      else { errN++; itens.push({ nivel: "err", texto: "Arquivo do formulário inacessível: " + f.arquivo, go: function () { showSection("formularios"); } }); }
    }

    return { quando: new Date().toISOString(), itens: itens, okN: okN, warnN: warnN, errN: errN };
  }

  /** T0 — verifica (modo rápido, sem rede) e renderiza no Dashboard. */
  async function atualizarSaude() {
    try {
      state.integridadeCache = await coletarIntegridade(true);
      renderSaudeFromCache();
    } catch (e) { /* saúde nunca deve quebrar o dashboard */ }
  }

  function renderSaudeFromCache() {
    const el = $("dashSaude");
    if (!el || !state.integridadeCache) return;
    const c = state.integridadeCache;
    let cls, dot, resumo;
    if (c.errN > 0) { cls = "err"; dot = "🔴"; resumo = c.errN + " erro(s) crítico(s)"; }
    else if (c.warnN > 0) { cls = "warn"; dot = "🟡"; resumo = c.warnN + " item(ns) precisam de atenção"; }
    else { cls = "ok"; dot = "🟢"; resumo = "Íntegro"; }
    let html = '<div class="saude-resumo ' + cls + '"><span class="dot" aria-hidden="true">' + dot + "</span> " + esc(resumo) + "</div>";
    if (c.itens.length) {
      html += '<div class="saude-lista">' + c.itens.map(function (it, i) {
        return '<button type="button" class="saude-link nivel-' + it.nivel + '" data-saude="' + i + '">' + esc(it.texto) + " →</button>";
      }).join("") + "</div>";
    } else {
      html += '<div class="saude-ok-line">Templates, coordenadas e associações cidade → ficha consistentes.</div>';
    }
    html += '<div class="saude-quando">Verificação automática (sem rede) — verificação completa com teste de acesso na seção Segurança.</div>';
    el.innerHTML = html;
    el.querySelectorAll("button[data-saude]").forEach(function (b) {
      b.addEventListener("click", function () {
        const it = c.itens[Number(b.getAttribute("data-saude"))];
        if (it && it.go) it.go();
      });
    });
  }

  // ── Navegação contextual a partir da Saúde (links já filtrados) ──
  function irParaCidadesSemTemplate(registros) {
    showSection("cidades");
    state.cidadesFiltroEspecial = registros.map(function (r) { return linhaCidadeKey(r); });
    state.cidadesPagina = 1;
    $("cidSearch").value = ""; $("cidUfFilter").value = ""; $("cidFichaFilter").value = "";
    renderCidades();
  }
  function irParaPdfs(nomeArquivo) {
    showSection("pdfs");
    $("pdfSearch").value = nomeArquivo;
    renderPdfs(nomeArquivo);
  }
  function irParaCampo(docKey, campo) {
    showSection("coordenadas");
    const sel = $("edDoc");
    if (sel.value !== docKey) {
      sel.value = docKey;
      loadDocForEditor(docKey).then(function () { selectField(docKey, campo); atualizarListaCampos(docKey); }).catch(function (e) {
        toast("Não foi possível abrir o template para destacar o campo: " + e.message, false);
      });
    } else {
      if (state.docData[docKey].page !== (campo.pagina || 1)) {
        state.docData[docKey].page = campo.pagina || 1;
        $("edPage").value = String(campo.pagina || 1);
        renderEditorPage(docKey);
      }
      selectField(docKey, campo);
      atualizarListaCampos(docKey);
    }
  }

  // ══════════════════════════════════════════════════════
  // TAREFA 3 — PDFs (metadados editáveis via overlay.pdfs_meta)
  // ══════════════════════════════════════════════════════
  /**
   * NOTA: aqui se edita SOMENTE METADADO (tipo/formulario exibidos no painel).
   * O arquivo físico de um template continua trocado EXCLUSIVAMENTE pelo
   * fluxo de upload/substituição já existente (modo API).
   * Mesmo padrão de applyOverlayToDoc: array-base constante + overlay.
   */
  function pdfsEfetivos() {
    const meta = state.overlay.pdfs_meta || {};
    return PDFS.map(function (p) {
      const m = meta[p.arquivo] || {};
      return Object.assign({}, p, {
        tipo: m.tipo || p.tipo,
        formulario: m.formulario || p.formulario,
        editado: !!meta[p.arquivo]
      });
    });
  }

  function renderPdfs(filter) {
    const tbody = $("pdfTable").querySelector("tbody");
    const f = (filter || "").toLowerCase();
    tbody.innerHTML = "";
    const lista = pdfsEfetivos().filter(function (p) { return !f || p.arquivo.toLowerCase().indexOf(f) !== -1 || p.formulario.toLowerCase().indexOf(f) !== -1; });
    for (const p of lista) {
      const tr = document.createElement("tr");
      const selo = p.editado ? "<span class='badge editable'>✎ Editável</span> " : "";
      tr.innerHTML = "<td>" + esc(p.arquivo) + "</td><td>" + selo + esc(p.tipo) + "</td><td>" + esc(p.formulario) +
        "</td><td class='num'>—</td><td><span class='badge ok'>Em uso</span></td>" +
        "<td><div class='row-actions'>" +
        "<button type='button' class='btn small secondary' data-visualizar='" + esc(p.path) + "'>Visualizar</button>" +
        "<button type='button' class='btn small secondary' data-editar-meta='" + esc(p.arquivo) + "'>Editar</button>" +
        "</div></td>";
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll("button[data-visualizar]").forEach(function (b) {
      b.addEventListener("click", function () { window.open("../" + encodeURI(b.getAttribute("data-visualizar")), "_blank"); });
    });
    tbody.querySelectorAll("button[data-editar-meta]").forEach(function (b) {
      b.addEventListener("click", function () { editarPdfMeta(b.getAttribute("data-editar-meta")); });
    });
    const sel = $("substTemplate");
    sel.innerHTML = pdfsEfetivos().map(function (p) { return '<option value="' + esc(p.path) + '">' + esc(p.arquivo) + "</option>"; }).join("");
  }

  async function editarPdfMeta(arquivo) {
    const atual = pdfsEfetivos().find(function (p) { return p.arquivo === arquivo; });
    if (!atual) return;
    const valores = await formModal({
      title: "Editar metadados do template",
      fields: [
        { key: "tipo", label: "Tipo", type: "text", value: atual.tipo, maxLength: 60, required: true, help: "Ex.: Template principal, Regional…" },
        { key: "formulario", label: "Formulário", type: "text", value: atual.formulario, maxLength: 80, required: true }
      ],
      okLabel: "Salvar"
    });
    if (!valores) return;
    // preserva outros campos já customizados deste arquivo (futuro), só sobrescreve o que o form edita
    const meta = state.overlay.pdfs_meta || (state.overlay.pdfs_meta = {});
    meta[arquivo] = Object.assign({}, meta[arquivo], { tipo: valores.tipo, formulario: valores.formulario });
    await persistOverlaySilencioso("edicao_pdf_metadata", arquivo,
      { overlayKey: "pdfs_meta", itens: [{ chave: arquivo, anterior: { tipo: atual.tipo, formulario: atual.formulario } }] },
      "de \"" + atual.tipo + " / " + atual.formulario + "\" para \"" + valores.tipo + " / " + valores.formulario + "\"");
    renderPdfs($("pdfSearch").value); renderAssistMap(); renderDashboard();
    toast("Metadados atualizados (overlay). O arquivo físico não é alterado — só o fluxo de upload substitui templates.");
  }

  // ══════════════════════════════════════════════════════
  // v3 — TEMPLATES: validação de PDF (§19), VERSIONAMENTO (§18) e ROLLBACK (§26)
  // ══════════════════════════════════════════════════════
  /** Próximo número de versão de um template (máx atual + histórico + 1). */
  function proximaVersaoTemplate(ent) {
    let n = 1;
    if (ent) {
      if (ent.atual && ent.atual.versao) n = Math.max(n, ent.atual.versao + 1);
      for (const h of ent.historico || []) if (h.versao) n = Math.max(n, h.versao + 1);
    }
    return n;
  }

  /** §26 — rollback: NÃO apaga a versão atual; cria nova versão = restauração.
   *  v4 → v5 → v6 (= restauração de v4); trilha de auditoria preservada. */
  async function rollbackTemplate(arquivo) {
    const ent = (state.overlay.templates_versoes || {})[arquivo];
    if (!ent || !ent.atual) { toast("Este template não possui versões registradas.", false); return; }
    const anterior = ent.anterior;
    if (!anterior) { toast("Não há versão anterior disponível para restaurar.", false); return; }
    const novaVersao = proximaVersaoTemplate(ent);
    const ok = await confirmModal("Restaurar versão anterior",
      "<p>Template: <strong>" + esc(arquivo) + "</strong></p>" +
      "<p>Versão atual: <strong>v" + esc(ent.atual.versao) + "</strong> → será preservada no histórico.</p>" +
      "<p>Será criada a <strong>v" + novaVersao + " = restauração de v" + esc(anterior.versao) + "</strong> (a trilha de auditoria é mantida).</p>" +
      (state.modo === "api" ? "<p>O arquivo físico da versão anterior será recolocado no servidor (se disponível em <code>data/uploads/</code>).</p>" : "<p>Em modo exportação o registro é de metadados — o PDF físico deve ser versionado no repositório.</p>"),
      "Restaurar v" + anterior.versao);
    if (!ok) return;
    let fisico = "não aplicável (modo exportação)";
    if (state.modo === "api") {
      try {
        await global.AdminPersistence.restaurarUploadArquivo(arquivo, anterior.arquivo);
        fisico = "arquivo físico restaurado no servidor";
      } catch (e) {
        fisico = "arquivo físico não restaurado (" + e.message + ") — reenvie o PDF se necessário";
      }
    }
    const historico = [ent.atual].concat(ent.historico || []);
    state.overlay.templates_versoes[arquivo] = {
      atual: { versao: novaVersao, arquivo: anterior.arquivo, nome: anterior.nome, data: new Date().toISOString(), sha256: anterior.sha256, bytes: anterior.bytes, info: anterior.info, restauradoDe: ent.atual.versao },
      anterior: null,
      historico: historico
    };
    await persistOverlaySilencioso("rollback_template", arquivo,
      { overlayKey: "templates_versoes", itens: [{ chave: arquivo, anterior: { atual: ent.atual, anterior: ent.anterior, historico: ent.historico } }] },
      "v" + novaVersao + " = restauração de v" + anterior.versao + " (antes: v" + ent.atual.versao + "). " + fisico);
    renderPdfs($("pdfSearch").value); renderDashboard();
    toast("Restauração registrada: v" + novaVersao + " (= v" + anterior.versao + "). " + fisico);
  }

  /** Painel de versões por template (§18) — abaixo da tabela de PDFs. */
  function renderVersoesTemplates() {
    const box = $("versoesContainer");
    if (!box) return;
    const versoes = state.overlay.templates_versoes || {};
    const comVersao = pdfsEfetivos().filter(function (p) { return !!versoes[p.arquivo]; });
    if (!comVersao.length) {
      box.innerHTML = '<div class="panel"><h3>Versões de templates</h3><div class="section-desc">Nenhum template com upload versionado ainda. Ao substituir um PDF, a substituição cria uma nova versão (com hash, páginas e motivo) e preserva a anterior para rollback.</div></div>';
      return;
    }
    box.innerHTML = comVersao.map(function (p) {
      const ent = versoes[p.arquivo];
      const hist = (ent.historico || []).slice(0, 3).map(function (h) {
        return '<div class="versao-linha"><span class="badge muted">v' + esc(h.versao) + "</span> " + esc((h.data || "").slice(0, 19).replace("T", " ")) +
          (h.restauradoDe ? " · restauração de v" + esc(h.restauradoDe) : "") +
          (h.sha256 ? ' <span class="vh">' + esc(String(h.sha256).slice(0, 12)) + "…</span>" : "") + "</div>";
      }).join("");
      return '<div class="panel"><h3>' + esc(p.arquivo) + "</h3>" +
        '<div class="versao-linha"><span class="badge ok">v' + esc(ent.atual.versao) + " — Publicado</span> " + esc((ent.atual.data || "").slice(0, 19).replace("T", " ")) +
        (ent.atual.restauradoDe ? " · restauração de v" + esc(ent.atual.restauradoDe) : "") +
        (ent.atual.sha256 ? ' <span class="vh">' + esc(String(ent.atual.sha256).slice(0, 12)) + "…</span>" : "") + "</div>" +
        (hist ? "<h4 style='margin:10px 0 4px;font-size:12px;color:var(--text-light)'>Histórico</h4>" + hist : "") +
        '<div class="editor-actions"><button type="button" class="btn small secondary" data-ver-upload="' + esc(p.arquivo) + '">Enviar nova versão</button>' +
        (ent.anterior ? '<button type="button" class="btn small secondary" data-ver-rollback="' + esc(p.arquivo) + '">↩ Restaurar v' + esc(ent.anterior.versao) + "</button>" : "") + "</div></div>";
    }).join("");
    box.querySelectorAll("[data-ver-upload]").forEach(function (b) {
      b.addEventListener("click", function () {
        $("substTemplate").value = b.getAttribute("data-ver-upload");
        $("substFile").click();
      });
    });
    box.querySelectorAll("[data-ver-rollback]").forEach(function (b) {
      b.addEventListener("click", function () { rollbackTemplate(b.getAttribute("data-ver-rollback")); });
    });
  }

  /**
   * Upload/substituição com VALIDAÇÃO (§19) e versionamento (§18):
   * 1. valida estrutura do PDF (assinatura, páginas, dimensões) — erros abortam;
   * 2. compara com a versão publicada (páginas/dimensões/tamanho) — avisos;
   * 3. motivo obrigatório na substituição;
   * 4. grava no servidor (modo API) e registra a nova versão no overlay.
   */
  async function fazerUpload(arquivoInputEl, destinoAtual) {
    const file = arquivoInputEl.files && arquivoInputEl.files[0];
    if (!file) { toast("Selecione um arquivo PDF.", false); return null; }
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      toast("Extensão/MIME inválido — envie um PDF.", false); return null;
    }
    if (state.modo !== "api") {
      toast("Upload de PDF exige o modo API (scripts/test-server.mjs). Em produção estática, versionar o PDF no repositório.", false);
      return null;
    }
    try {
      // §19 — validação automática do novo PDF
      const bytes = await file.arrayBuffer();
      const limiteMB = Number(configGet("pdfs.limite_mb")) || 20;
      const val = await validarPdfBytes(bytes, limiteMB);
      if (!val.ok) {
        await confirmModal("PDF inválido — upload bloqueado",
          "<p>O arquivo não passou na validação e <strong>não foi enviado</strong>:</p><pre>" + esc(val.erros.join("\n")) + "</pre>",
          "Entendi");
        return null;
      }
      // §19 — comparação estrutural com a versão publicada
      const ent = (state.overlay.templates_versoes || {})[destinoAtual || ""];
      const comparacoes = compararPdfComAnterior(val.info, ent && ent.atual && ent.atual.info);
      const hash = await sha256Hex(bytes);

      // §18.5 — motivo obrigatório na substituição
      let motivo = "";
      if (destinoAtual) {
        const m = await formModal({
          title: "Motivo da substituição",
          fields: [{ key: "motivo", label: "Motivo (registrado no histórico)", type: "text", required: true, maxLength: 140, placeholder: "Ex.: layout atualizado pela regional" }],
          okLabel: "Continuar"
        });
        if (!m) return null;
        motivo = m.motivo.trim();
      }

      const nomeDestino = destinoAtual || (global.AdminPersistence.sanitizarNomeArquivo(file.name).replace(/\.pdf$/i, "") + ".pdf");
      const resumo =
        "<p>Template: <strong>" + esc(nomeDestino) + "</strong></p>" +
        "<p>Validação: <strong>✓ PDF válido</strong> — " + val.info.paginas + " página(s), " + Math.round(val.info.bytes / 1024) + " KB" +
        (val.avisos.length ? "</p><p>⚠ " + esc(val.avisos.join(" · ")) : "") + "</p>" +
        (comparacoes.length ? "<div class='notice warn'>" + comparacoes.map(esc).join("<br>") + "<br>Revise as coordenadas no Editor Visual se o layout mudou.</div>" : "") +
        (destinoAtual ? "<p>Versão atual será preservada no histórico (rollback disponível). Motivo: <strong>" + esc(motivo) + "</strong></p>" :
          "<p>O arquivo será gravado no servidor como <strong>" + esc(nomeDestino) + "</strong>.</p>");
      const ok = await confirmModal(destinoAtual ? "Substituir template (nova versão)" : "Adicionar PDF", resumo, destinoAtual ? "Publicar nova versão" : "Enviar");
      if (!ok) return null;

      const r = await global.AdminPersistence.uploadPdf(file, nomeDestino);
      if (destinoAtual) {
        // §18 — nova versão: atual vira anterior; histórico preserva a trilha
        const versoes = state.overlay.templates_versoes || (state.overlay.templates_versoes = {});
        const anterior = versoes[nomeDestino] ? versoes[nomeDestino].atual : null;
        const nova = {
          versao: proximaVersaoTemplate(versoes[nomeDestino]),
          arquivo: (r.versao && r.versao.arquivo) || nomeDestino,
          nome: nomeDestino, data: new Date().toISOString(),
          sha256: hash, bytes: val.info.bytes, info: val.info, motivo: motivo
        };
        versoes[nomeDestino] = { atual: nova, anterior: anterior, historico: anterior ? [anterior].concat((versoes[nomeDestino].historico || [])) : (versoes[nomeDestino] ? versoes[nomeDestino].historico || [] : []) };
        await persistOverlaySilencioso("substituicao_pdf", nomeDestino,
          { overlayKey: "templates_versoes", itens: [{ chave: nomeDestino, anterior: anterior ? { atual: anterior } : null }] },
          "v" + nova.versao + " publicada (" + val.info.paginas + " pág., sha256 " + String(hash).slice(0, 12) + "…). Motivo: " + motivo +
          (comparacoes.length ? " Avisos: " + comparacoes.join(" ") : ""));
      } else {
        await logEvento({ acao: "criacao_pdf", entidade: nomeDestino, alteracao: "adicionado (" + val.info.paginas + " pág., sha256 " + String(hash).slice(0, 12) + "…)" });
      }
      renderPdfs($("pdfSearch").value); renderVersoesTemplates(); renderDashboard();
      toast(destinoAtual ? "Nova versão publicada: v" + (state.overlay.templates_versoes[nomeDestino] || {}).atual?.versao : "PDF gravado: " + (r.nome || nomeDestino));
      return r;
    } catch (e) {
      toast("Falha no upload: " + e.message, false);
      return null;
    }
  }

  // ══════════════════════════════════════════════════════
  // EDITOR DE COORDENADAS
  // ══════════════════════════════════════════════════════
  const pdfjsLib = global.pdfjsLib;
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  async function loadDocForEditor(docKey) {
    const d = DOCS[docKey];
    const st = state.docData[docKey];
    if (!st.pdfjsDoc) {
      const task = pdfjsLib.getDocument({ url: d.pdfPath });
      st.pdfjsDoc = await task.promise;
      st.pageSizes = [];
      for (let i = 1; i <= st.pdfjsDoc.numPages; i++) {
        const pg = await st.pdfjsDoc.getPage(i);
        const vp = pg.getViewport({ scale: 1 });
        st.pageSizes.push({ w: vp.width, h: vp.height });
      }
    }
    st.page = Math.min(st.page || 1, st.pageSizes.length);
    const sel = $("edPage");
    sel.innerHTML = st.pageSizes.map(function (_, i) {
      return '<option value="' + (i + 1) + '"' + ((i + 1) === st.page ? " selected" : "") + ">Página " + (i + 1) + " de " + st.pageSizes.length + "</option>";
    }).join("");
    atualizarListaCampos(docKey);
    await renderEditorPage(docKey);
  }

  /**
   * Serializa renders por documento: chamadas concorrentes (troca de página +
   * auto-recuperação + usuário acelerado) não podem renderizar no mesmo canvas
   * ao mesmo tempo — o pdf.js aborta e as caixas dos campos somem. O último
   * pedido ganha; os anteriores terminam sem desenhar (estado já desatualizado).
   */
  const renderChain = new Map();
  function renderEditorPage(docKey) {
    const prev = renderChain.get(docKey) || Promise.resolve();
    const next = prev.catch(function () { /* erro anterior não bloqueia */ }).then(function () {
      if (renderChain.get(docKey) !== next) return; // surpassado por pedido mais novo
      return doRenderEditorPage(docKey);
    });
    renderChain.set(docKey, next);
    return next;
  }

  async function doRenderEditorPage(docKey) {
    const st = state.docData[docKey];
    const stack = $("edPageStack");
    stack.querySelectorAll(".field-box").forEach(function (b) { b.remove(); });

    const page = await st.pdfjsDoc.getPage(st.page);
    const targetW = Math.min(860, Math.max(560, ($("edPageStack").parentElement.clientWidth || 760) - 36));
    const vp = page.getViewport({ scale: 1 });
    const scale = targetW / vp.width;
    const viewport = page.getViewport({ scale: scale });
    st.renderScale = scale; st.renderViewport = { w: viewport.width, h: viewport.height };

    const canvas = $("edCanvas");
    try {
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
    } catch (e) {
      // Render do canvas é best-effort: as caixas (dados) dependem só do viewport.
      if (!/fetch|network|aborted/i.test(e && e.message || "")) console.warn("renderEditorPage: render do canvas falhou:", e);
    }
    canvas.width = viewport.width; canvas.height = viewport.height;

    // caixas dos campos da página
    const fields = st.flat.filter(function (f) { return (f.pagina || 1) === st.page && f.coords && typeof f.coords.x === "number"; });
    for (const f of fields) {
      const noMulti = state.edSelMulti.some(function (x) { return x.key === f.key; });
      const box = document.createElement("div");
      box.className = "field-box" + (st.sel === f || noMulti ? " selected" : "") + (campoTemPendencia(docKey, f) ? " pending" : "");
      const size = st.pageSizes[st.page - 1];
      const x = f.coords.x / size.w * viewport.width;
      const yTop = (size.h - (f.coords.y + (f.coords.altura || 10))) / size.h * viewport.height;
      const w = (f.coords.largura || 100) / size.w * viewport.width;
      const h = Math.max(8, (f.coords.altura || 10) / size.h * viewport.height);
      box.style.left = x + "px"; box.style.top = yTop + "px";
      box.style.width = w + "px"; box.style.height = h + "px";
      box.textContent = f.label;
      box.title = f.label + "  (x:" + f.coords.x + ", y:" + f.coords.y + ")";
      box.dataset.secao = f.secao; box.dataset.key = f.key;
      attachDrag(box, f, docKey);
      attachResize(box, f, docKey); // §11 — redimensionar
      box.addEventListener("click", function (ev) { ev.stopPropagation(); selectField(docKey, f); });
      stack.appendChild(box);
    }
    if (!fields.length) {
      const hint = document.createElement("div");
      hint.className = "notice info";
      hint.style.cssText = "position:absolute;top:10px;left:10px;right:10px";
      hint.textContent = "Nenhum campo com coordenadas nesta página.";
      stack.appendChild(hint);
    }
    atualizarListaCampos(docKey); // pendências podem ter mudado
  }

  /** §11 — snap-to-grid (1/5/10 pts). */
  function snapValor() {
    const on = $("edSnap") && $("edSnap").checked;
    const g = parseInt(("edSnapGrid" ? ($("edSnapGrid") || {}).value : "5"), 10);
    return on ? (g || 5) : 0;
  }
  function aplicarSnap(n) {
    const g = snapValor();
    if (!g) return round1(n);
    return Math.round(n / g) * g;
  }

  function attachDrag(box, f, docKey) {
    box.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      box.setPointerCapture(ev.pointerId);
      const st = state.docData[docKey];
      // §11 — seleção múltipla: Ctrl/Cmd+clique adiciona à seleção (mesma página)
      if (ev.ctrlKey || ev.metaKey) {
        const idx = state.edSelMulti.indexOf(f);
        if (idx !== -1) state.edSelMulti.splice(idx, 1);
        else state.edSelMulti.push(f);
        box.classList.toggle("selected", state.edSelMulti.indexOf(f) !== -1);
        renderMultiBar(docKey);
        return;
      }
      // clique simples: seleção única e limpa a múltipla
      if (state.edSelMulti.length && state.edSelMulti.indexOf(f) === -1) { state.edSelMulti = []; }
      const startX = ev.clientX, startY = ev.clientY;
      const movendo = state.edSelMulti.length > 1 ? state.edSelMulti.slice() : [f];
      const origens = movendo.map(function (x) { return { f: x, x: x.coords.x, y: x.coords.y }; });
      let moveu = false;
      box.classList.add("dragging");
      function onMove(e) {
        const dx = (e.clientX - startX) / st.renderViewport.w * st.pageSizes[st.page - 1].w;
        const dy = (e.clientY - startY) / st.renderViewport.h * st.pageSizes[st.page - 1].h;
        moveu = true;
        const nx = aplicarSnap(origens[0].x + dx), ny = aplicarSnap(origens[0].y - dy);
        const ddx = nx - aplicarSnap(origens[0].x), ddy = ny - aplicarSnap(origens[0].y);
        for (const o of origens) setCoords(o.f, aplicarSnap(o.x + dx), aplicarSnap(o.y - dy));
        for (const o of origens) {
          const b = document.querySelector('.field-box[data-key="' + o.f.key.replace(/"/g, '\\"') + '"]');
          if (b) updateBoxFromField(b, o.f, st);
        }
        if (st.sel === f) fillEditorForm(f, docKey, true);
        st.dirty = true; updatePendingList(docKey); atualizarListaCampos(docKey);
      }
      function onUp() {
        box.removeEventListener("pointermove", onMove);
        box.removeEventListener("pointerup", onUp);
        box.classList.remove("dragging");
        if (moveu) { $("edSave").disabled = false; $("edCancel").disabled = false; }
      }
      box.addEventListener("pointermove", onMove);
      box.addEventListener("pointerup", onUp);
    });
  }

  /** §11 — redimensionar (handle no canto inferior direito da caixa selecionada). */
  function attachResize(box, f, docKey) {
    const handle = document.createElement("div");
    handle.className = "resize-handle";
    handle.setAttribute("aria-hidden", "true");
    box.appendChild(handle);
    handle.addEventListener("pointerdown", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      handle.setPointerCapture(ev.pointerId);
      const st = state.docData[docKey];
      const startX = ev.clientX, startY = ev.clientY;
      const oL = f.coords.largura || 100, oA = f.coords.altura || 10;
      function onMove(e) {
        const dx = (e.clientX - startX) / st.renderViewport.w * st.pageSizes[st.page - 1].w;
        const dy = (e.clientY - startY) / st.renderViewport.h * st.pageSizes[st.page - 1].h;
        f.coords.largura = Math.max(2, aplicarSnap(oL + dx));
        f.coords.altura = Math.max(4, aplicarSnap(oA - dy));
        updateBoxFromField(box, f, st);
        if (st.sel === f) fillEditorForm(f, docKey, true);
        st.dirty = true;
        $("edSave").disabled = false; $("edCancel").disabled = false;
      }
      function onUp() {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        updatePendingList(docKey); atualizarListaCampos(docKey);
      }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  /** §11/§15 — barra da seleção múltipla: alinhar/distribuir/restaurar. */
  function renderMultiBar(docKey) {
    const bar = $("edMultiBar");
    if (!bar) return;
    const n = state.edSelMulti.length;
    bar.hidden = n < 2;
    if (n >= 2) {
      $("edMultiInfo").textContent = n + " campo(s) selecionado(s) — " +
        Array.from(new Set(state.edSelMulti.map(function (f) { return f.pagina || 1; }))).join(", ") + " pág.";
      const al = $("edMultiAlinhar"), di = $("edMultiDistribuir"), rs = $("edMultiRestaurar"), lm = $("edMultiLimpar");
      al.onclick = function () { alinharSelecao(docKey, $("edMultiEixo").value); };
      di.onclick = function () { distribuirSelecao(docKey, $("edMultiEixo").value); };
      rs.onclick = async function () {
        for (const f of state.edSelMulti.slice()) await restaurarCampoObj(docKey, f);
        state.edSelMulti = [];
        renderEditorPage(docKey); renderMultiBar(docKey);
      };
      lm.onclick = function () { state.edSelMulti = []; renderEditorPage(docKey); renderMultiBar(docKey); };
    }
    // §10 — Field Builder a partir do editor: abre o drawer na aba Campos
    const novo = $("edNovoCampo");
    if (novo) {
      const form = (FORMULARIOS.find(function (x) { return x.docKey === docKey; }) || {});
      novo.onclick = function () {
        showSection("formularios");
        state.formSel = form.codigo || null;
        state.formTab = "campos";
        renderFormDetail();
        fbAbrirDrawer(formDetailPorCodigo(form.codigo), null);
      };
    }
  }

  function alinharSelecao(docKey, eixo) {
    const sel = state.edSelMulti;
    if (sel.length < 2) return;
    if (eixo === "x") {
      const alvo = Math.min.apply(null, sel.map(function (f) { return f.coords.x; }));
      for (const f of sel) f.coords.x = aplicarSnap(alvo);
    } else {
      const alvo = Math.max.apply(null, sel.map(function (f) { return f.coords.y; }));
      for (const f of sel) f.coords.y = aplicarSnap(alvo);
    }
    finalizarEdicaoMultipla(docKey);
  }

  function distribuirSelecao(docKey, eixo) {
    const sel = state.edSelMulti.slice().sort(function (a, b) { return eixo === "x" ? a.coords.x - b.coords.x : a.coords.y - b.coords.y; });
    if (sel.length < 3) { toast("Distribuição uniforme exige 3 ou mais campos.", false); return; }
    const primeiro = sel[0], ultimo = sel[sel.length - 1];
    const ini = eixo === "x" ? primeiro.coords.x : primeiro.coords.y;
    const fim = eixo === "x" ? ultimo.coords.x : ultimo.coords.y;
    const passo = (fim - ini) / (sel.length - 1);
    sel.forEach(function (f, i) { if (eixo === "x") f.coords.x = aplicarSnap(ini + passo * i); else f.coords.y = aplicarSnap(ini + passo * i); });
    finalizarEdicaoMultipla(docKey);
  }

  function finalizarEdicaoMultipla(docKey) {
    const st = state.docData[docKey];
    st.dirty = true;
    $("edSave").disabled = false; $("edCancel").disabled = false;
    renderEditorPage(docKey); updatePendingList(docKey); atualizarListaCampos(docKey);
  }

  /** Atalhos de teclado do editor (§11): setas movem; Shift=5; Alt=fino. */
  function instalarAtalhosEditor() {
    document.addEventListener("keydown", function (ev) {
      if (!document.getElementById("sec-coordenadas") || !document.getElementById("sec-coordenadas").classList.contains("active")) return;
      const modalAberto = document.querySelector(".modal-overlay.show, .cmdk-overlay.show");
      if (modalAberto) return;
      const tag = (ev.target && ev.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      const docKey = $("edDoc") && $("edDoc").value;
      if (!docKey || !state.docData[docKey]) return;
      const st = state.docData[docKey];
      if (ev.key === "Escape" && state.edSelMulti.length) { state.edSelMulti = []; renderEditorPage(docKey); renderMultiBar(docKey); return; }
      const alvo = st.sel;
      if (!alvo) return;
      const passo = ev.altKey ? 0.5 : (ev.shiftKey ? 5 : 1);
      const mapa = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, passo], ArrowDown: [0, -passo] };
      if (!mapa[ev.key]) return;
      ev.preventDefault();
      const lista = state.edSelMulti.length > 1 ? state.edSelMulti : [alvo];
      for (const f of lista) setCoords(f, aplicarSnap(f.coords.x + mapa[ev.key][0]), aplicarSnap(f.coords.y + mapa[ev.key][1]));
      st.dirty = true;
      $("edSave").disabled = false; $("edCancel").disabled = false;
      fillEditorForm(alvo, docKey, true);
      renderEditorPage(docKey);
    });
  }

  /** Atalho "R": restaura o campo selecionado (§29 — atalhos). */
  function instalarTeclaRestaurar() {
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "r" && ev.key !== "R") return;
      if (!document.getElementById("sec-coordenadas") || !document.getElementById("sec-coordenadas").classList.contains("active")) return;
      const tag = (ev.target && ev.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      const docKey = $("edDoc") && $("edDoc").value;
      const st = docKey && state.docData[docKey];
      if (st && st.sel && campoTemPendencia(docKey, st.sel)) restaurarCampo(docKey);
    });
  }

  function updateBoxFromField(box, f, st) {
    const size = st.pageSizes[st.page - 1];
    const vp = st.renderViewport;
    box.style.left = (f.coords.x / size.w * vp.w) + "px";
    box.style.top = ((size.h - (f.coords.y + (f.coords.altura || 10))) / size.h * vp.h) + "px";
    box.style.width = ((f.coords.largura || 100) / size.w * vp.w) + "px";
    box.style.height = Math.max(8, (f.coords.altura || 10) / size.h * vp.h) + "px";
  }

  function setCoords(f, x, y) {
    f.coords.x = x; f.coords.y = y;
  }
  function round1(n) { return Math.round(n * 2) / 2; }

  function selectField(docKey, f) {
    const st = state.docData[docKey];
    st.sel = f;
    document.querySelectorAll(".field-box").forEach(function (b) {
      const noMulti = state.edSelMulti.some(function (x) { return x.key === b.dataset.key; });
      b.classList.toggle("selected", b.dataset.key === f.key || noMulti);
    });
    fillEditorForm(f, docKey, false);
    atualizarListaCampos(docKey); // marca item selecionado na lista (T4)
  }

  function fillEditorForm(f, docKey, numbersOnly) {
    $("edFieldTitle").textContent = f.label;
    $("edFieldInfo").textContent = DOCS[docKey].label + " · " + (f.secao || "—") + " · " + f.key;
    $("edX").value = f.coords.x; $("edY").value = f.coords.y;
    $("edL").value = f.coords.largura != null ? f.coords.largura : "";
    $("edA").value = f.coords.altura != null ? f.coords.altura : "";
    $("edPg").value = f.pagina || 1;
    $("edT").value = f.tamanho || "";
    $("edObs").value = f.observacao || "";
    // Tarefa 4 — restauração granular: habilita só quando há pendência neste campo.
    // Fora do bloco numbersOnly: o estado deve refletir a pendência mesmo após restaurarCampo().
    $("edRestore").disabled = !campoTemPendencia(docKey, f);
    if (!numbersOnly) {
      // Habilita os inputs de coordenadas ao selecionar um campo (pág. e fonte
      // voltam a ficar somente leitura logo abaixo). Sem esta linha o editor
      // exibia os campos cinza e não permitia editar (regressão corrigida).
      ["edX", "edY", "edL", "edA", "edPg", "edT"].forEach(function (id) { $(id).disabled = false; });
      const temEstilo = ("fonte" in f.coords) || ("alinhamento" in f.coords);
      $("edFontNote").style.display = temEstilo ? "none" : "block";
      $("edT").disabled = true; // tamanho da fonte é fixado no código (implementação atual)
      $("edT").title = "Somente leitura: o tamanho da fonte é definido no código de geração.";
      $("edPg").disabled = true; // mover campo de página alteraria a lógica de geração
      $("edPg").title = "Somente leitura: a página é definida pelo schema e pela lógica de geração.";
    }
  }

  /** Tarefa 4 — o campo tem alteração pendente em relação ao overlay/original? */
  function campoTemPendencia(docKey, f) {
    for (const p of PROPS_COORD) {
      if (f.origCoords[p] !== f.coords[p] && !(f.origCoords[p] == null && f.coords[p] == null)) return true;
    }
    return false;
  }

  /**
   * Espelha o estado do campo na caixa do canvas e nos controles do editor.
   * Escopo do módulo: também é chamada por restaurarCampo() (Tarefa 4).
   */
  function syncBox(f, docKey) {
    const st = state.docData[docKey];
    const box = document.querySelector('.field-box[data-key="' + f.key.replace(/"/g, '\\"') + '"]');
    if (box) { updateBoxFromField(box, f, st); st.dirty = true; updatePendingList(docKey); $("edSave").disabled = false; $("edCancel").disabled = false; $("edRestore").disabled = !campoTemPendencia(docKey, f); }
  }

  /**
   * Tarefa 4 — lista lateral com busca (label, seção, página). Clicar
   * seleciona o campo REAPROVEITANDO selectField() (não duplica seleção).
   */
  function atualizarListaCampos(docKey) {
    const st = state.docData[docKey];
    if (!st) return;
    const q = ($("edBuscaCampo").value || "").toLowerCase().trim();
    const lista = st.flat.filter(function (f) {
      if (!q) return true;
      return (f.label || "").toLowerCase().indexOf(q) !== -1 ||
        (f.secao || "").toLowerCase().indexOf(q) !== -1 ||
        f.key.toLowerCase().indexOf(q) !== -1;
    });
    $("edListaContagem").textContent = q
      ? lista.length + " de " + st.flat.length + " campos (filtro \"" + q + "\")"
      : st.flat.length + " campos · " + st.flat.filter(function (f) { return campoTemPendencia(docKey, f); }).length + " com pendência";
    const el = $("edListaCampos");
    el.innerHTML = lista.slice(0, 300).map(function (f) {
      const cls = "field-item" + (st.sel === f ? " selected" : "") + (campoTemPendencia(docKey, f) ? " pending" : "");
      return '<button type="button" role="option" class="' + cls + '" data-field-key="' + esc(f.key) + '">' +
        '<span class="fi-label">' + esc(f.label) + "</span>" +
        '<span class="fi-meta">' + esc(f.secao || "—") + " · pág. " + (f.pagina || 1) + "</span></button>";
    }).join("") || '<div class="field-item" aria-disabled="true">Nenhum campo encontrado.</div>';
    el.querySelectorAll("button[data-field-key]").forEach(function (b) {
      b.addEventListener("click", function () {
        const f = st.flat.find(function (x) { return x.key === b.getAttribute("data-field-key"); });
        if (!f) return;
        // Troca de página se necessário antes de selecionar no canvas
        if ((f.pagina || 1) !== st.page) {
          st.page = f.pagina || 1;
          $("edPage").value = String(st.page);
          renderEditorPage(docKey).then(function () { selectField(docKey, f); });
        } else {
          selectField(docKey, f);
        }
      });
    });
  }

  /**
   * Tarefa 4 — restaurar UM campo: reverte apenas aquele campo ao valor
   * salvo no overlay (ou ao original, se nunca teve overlay), sem afetar
   * os demais pendentes. Ação trivial e reversível — sem confirmModal
   * (não infla confirmações, §6); o histórico registra o evento.
   */
  /** Restauração de UM campo por objeto (usada pelo atalho R e pela seleção múltipla). */
  async function restaurarCampoObj(docKey, f) {
    if (!f || !campoTemPendencia(docKey, f)) return false;
    const patch = state.overlay[DOCS[docKey].overlayKey][f.key] || {};
    const antes = Object.assign({}, f.coords);
    for (const p of PROPS_COORD) {
      f.coords[p] = (p in patch) ? patch[p] : f.origCoords[p];
    }
    syncBox(f, docKey);
    await logEvento({
      acao: "restauracao_campo", entidade: DOCS[docKey].label + " → " + f.label,
      alteracao: PROPS_COORD.filter(function (p) { return antes[p] !== f.coords[p]; })
        .map(function (p) { return p + ": " + antes[p] + "→" + f.coords[p]; }).join("; ") || "sem diferença efetiva"
    });
    return true;
  }

  async function restaurarCampo(docKey) {
    const st = state.docData[docKey];
    const f = st.sel;
    if (!f || !campoTemPendencia(docKey, f)) return;
    await restaurarCampoObj(docKey, f);
    fillEditorForm(f, docKey, true);
    atualizarListaCampos(docKey);
    await logEvento({
      acao: "restauracao_campo", entidade: DOCS[docKey].label + " → " + f.label,
      alteracao: PROPS_COORD.filter(function (p) { return antes[p] !== f.coords[p]; })
        .map(function (p) { return p + ": " + antes[p] + "→" + f.coords[p]; }).join("; ") || "sem diferença efetiva"
    });
    toast("Campo \"" + f.label + "\" restaurado — as demais edições pendentes foram preservadas.");
  }

  function updatePendingList(docKey) {
    const st = state.docData[docKey];
    const diffs = diffDoc(docKey);
    const el = $("edPending");
    if (!diffs.length) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="notice warn">' + diffs.length + " alteração(ões) pendente(s) nesta configuração.</div>";
  }

  function diffDoc(docKey) {
    const st = state.docData[docKey];
    const out = [];
    for (const f of st.flat) {
      const o = f.origCoords, c = f.coords;
      for (const p of PROPS_COORD) {
        if (o[p] !== c[p] && !(o[p] == null && c[p] == null)) {
          out.push({ key: f.key, label: f.label, prop: p, de: o[p], para: c[p] });
        }
      }
    }
    return out;
  }

  async function saveDocEdits(docKey) {
    const st = state.docData[docKey];
    const diffs = diffDoc(docKey);
    if (!diffs.length) { toast("Nenhuma alteração a salvar."); return; }
    const porCampo = {};
    for (const d of diffs) {
      porCampo[d.key] = porCampo[d.key] || { label: d.label, patch: {} };
      porCampo[d.key].patch[d.prop] = d.para;
    }
    let html = "<p>Alterações que serão salvas no overlay administrativo:</p><pre>";
    for (const key of Object.keys(porCampo)) {
      html += esc(key) + "\n";
      for (const p of Object.keys(porCampo[key].patch)) {
        html += "  " + p + ": " + esc(JSON.stringify(porCampo[key].patch[p])) + "\n";
      }
    }
    html += "</pre>";
    const ok = await confirmModal("Salvar alterações de coordenadas", html, "Salvar");
    if (!ok) return;
    const map = state.overlay[DOCS[docKey].overlayKey];
    // reverso (Tarefa 6): valor anterior de cada propriedade tocada, para undo
    const itens = [];
    for (const key of Object.keys(porCampo)) {
      const f = st.flat.find(function (x) { return x.key === key; });
      const patchAnterior = Object.assign({}, map[key]);
      const anterior = {};
      for (const p of Object.keys(porCampo[key].patch)) {
        anterior[p] = (p in patchAnterior) ? patchAnterior[p] : (f ? f.origCoords[p] : null);
      }
      itens.push({ chave: key, anterior: anterior });
      map[key] = Object.assign({}, map[key], porCampo[key].patch, { label: porCampo[key].label });
      // origCoords passa a refletir o valor SALVO (overlay → origem): sem isto,
      // o campo continuava "pendente" visualmente após o salvamento — e a
      // restauração granular voltava a um valor anterior ao último salvo.
      if (f) Object.assign(f.origCoords, map[key]);
    }
    try {
      const r = await global.AdminPersistence.salvarOverlay(state.overlay);
      await logEvento({
        acao: "alteracao_coordenada", entidade: DOCS[docKey].label,
        alteracao: diffs.map(function (d) { return d.key + "." + d.prop + ": " + d.de + "→" + d.para; }).join("; "),
        reverso: { overlayKey: DOCS[docKey].overlayKey, itens: itens }
      });
      st.dirty = false;
      updatePendingList(docKey);
      atualizarListaCampos(docKey);
      $("edRestore").disabled = true;
      toast(r.persistido ? "Gravado no servidor (com backup)." : "Overlay salvo na sessão — exporte o JSON (Dados) para efetivar.");
      renderDashboard();
    } catch (e) {
      toast("Falha ao salvar: " + e.message, false);
    }
  }

  // ══════════════════════════════════════════════════════
  // v3 — MODO DE TESTE (§13): dados fictícios → PDF preenchido
  // ══════════════════════════════════════════════════════
  /** Campos de teste exibidos no formulário (pré-preenchidos com DADOS_TESTE). */
  function camposModoTeste() {
    const defs = [
      { key: "nomecompleto", label: "Nome completo", value: DADOS_TESTE.nomecompleto },
      { key: "cpf", label: "CPF", value: DADOS_TESTE.cpf },
      { key: "fone", label: "Telefone", value: DADOS_TESTE.fone },
      { key: "celular", label: "Celular", value: DADOS_TESTE.celular },
      { key: "email", label: "E-mail", value: DADOS_TESTE.email },
      { key: "estadocivil", label: "Estado civil", value: DADOS_TESTE.estadocivil },
      { key: "datanascimento", label: "Data de nascimento", value: DADOS_TESTE.datanascimento },
      { key: "data", label: "Data do documento", value: DADOS_TESTE.data }
    ];
    return defs.map(function (d) {
      return Object.assign({ type: "text", required: false, help: "Dados fictícios — nunca use dados reais no teste." }, d);
    });
  }

  /** Gera o PDF preenchido com os valores do modo de teste (§13). */
  async function gerarPdfTeste(docKey, valores, comparar) {
    const d = DOCS[docKey];
    const st = state.docData[docKey];
    const res = await fetch(d.pdfPath);
    if (!res.ok) throw new Error("template HTTP " + res.status);
    const bytes = await res.arrayBuffer();
    const pdf = await global.PDFLib.PDFDocument.load(bytes);
    const font = await pdf.embedFont(global.PDFLib.StandardFonts.Helvetica);
    const pages = pdf.getPages();
    let escritos = 0;
    for (const f of st.flat) {
      const val = valorTeste(f, valores);
      if (!val) continue;
      const pg = pages[(f.pagina || 1) - 1];
      if (!pg) continue;
      pg.drawText(String(val), {
        x: f.coords.x, y: f.coords.y,
        size: 9, font: font,
        maxWidth: f.coords.largura || undefined,
        color: global.PDFLib.rgb(0.55, 0.2, 0.05)
      });
      escritos++;
    }
    const out = await pdf.save();
    const blob = new Blob([out], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    if (comparar) {
      // §13 — comparação: PDF original | PDF preenchido (duas abas)
      const urlOriginal = new URL(d.pdfPath, window.location.href).href;
      setTimeout(function () { window.open(urlOriginal, "_blank"); }, 400);
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    await logEvento({ acao: "preview_teste", entidade: d.label, alteracao: "modo de teste: " + escritos + " campo(s) preenchido(s) com dados fictícios" + (comparar ? " (comparação com o original)" : "") });
    return escritos;
  }

  async function previewTeste(docKey) {
    const d = DOCS[docKey];
    try {
      const valores = await formModal({
        title: "Modo de teste — " + d.label,
        fields: camposModoTeste().concat([
          { key: "__comparar", label: "Abrir também o PDF original (comparação)", type: "select", value: "nao", options: [{ v: "sim", t: "Sim — original | preenchido" }, { v: "nao", t: "Não — apenas preenchido" }] }]
        ),
        okLabel: "Gerar PDF preenchido",
        validate: function (vals) {
          // duplicidade não se aplica; validação leve: e-mail com @ quando preenchido
          if (vals.email && vals.email.indexOf("@") === -1) return "E-mail de teste inválido — deve conter @ (use um e-mail fictício).";
          return null;
        }
      });
      if (!valores) return;
      const escritos = await gerarPdfTeste(docKey, valores, valores.__comparar === "sim");
      toast("PDF de teste gerado — " + escritos + " campo(s) preenchido(s) com dados fictícios.");
    } catch (e) {
      toast("Falha no modo de teste: " + e.message, false);
    }
  }

  /** Valor de teste por campo: primeiro o informado no Modo de Teste, depois DADOS_TESTE. */
  function valorTeste(f, valores) {
    const norm = f.key.toLowerCase().replace(/\.[^.]+$/, "");
    if (valores) {
      for (const k of Object.keys(valores)) {
        if (k.charAt(0) === "_") continue;
        if (norm.indexOf(k) !== -1 && valores[k]) return valores[k];
      }
    }
    for (const k of Object.keys(DADOS_TESTE)) {
      if (norm.indexOf(k) !== -1) return DADOS_TESTE[k];
    }
    if (f.tipo === "data") return DADOS_TESTE.data;
    if (f.tipo === "texto" && f.coords && f.coords.largura > 200) return "TESTE - ADMINISTRACAO";
    return null;
  }

  // ══════════════════════════════════════════════════════
  // TAREFA 2 — CIDADES (CRUD completo)
  // ══════════════════════════════════════════════════════
  /** Chave estável de linha: overlay usa "n"+id (ID estável, T2.1);
   *  JSON usa origemChave = normalização do nome ORIGINAL. */
  function linhaCidadeKey(r) {
    return r.fonte === "overlay administrativo" ? String(r.idx) : (r.origemChave || normalizarChaveCidade(r.cidade));
  }

  function renderCidades() {
    $("cidFonte").textContent = state.citySource;
    const q = ($("cidSearch").value || "").toLowerCase();
    const uf = $("cidUfFilter").value;
    const fi = $("cidFichaFilter").value;
    const filtroEsp = state.cidadesFiltroEspecial;

    const rows = state.cityArr.filter(function (r) {
      if (filtroEsp && filtroEsp.indexOf(linhaCidadeKey(r)) === -1) return false; // link da Saúde (T0)
      if (q && r.cidade.toLowerCase().indexOf(q) === -1) return false;
      if (uf && r.uf !== uf) return false;
      if (fi && r.ficha !== fi) return false;
      return true;
    });
    state._cidadesFiltradas = rows;

    // chip do filtro especial (T0)
    const chip = $("cidFiltroEsp");
    if (filtroEsp) {
      chip.hidden = false;
      chip.innerHTML = "Mostrando apenas as cidade(s) apontadas pela Saúde do Sistema (" + rows.length + ") <button type='button' aria-label='Limpar filtro'>&times;</button>";
      chip.querySelector("button").onclick = function () { state.cidadesFiltroEspecial = null; renderCidades(); };
    } else chip.hidden = true;

    // ── Paginação real (T2.3): a tabela nunca corta silenciosamente ──
    const total = rows.length;
    const paginas = Math.max(1, Math.ceil(total / CIDADES_POR_PAGINA));
    if (state.cidadesPagina > paginas) state.cidadesPagina = paginas;
    const pag = state.cidadesPagina;
    const ini = (pag - 1) * CIDADES_POR_PAGINA;
    const rowsPagina = rows.slice(ini, ini + CIDADES_POR_PAGINA);

    const tbody = $("cidTable").querySelector("tbody");
    tbody.innerHTML = "";
    for (const r of rowsPagina) {
      const key = linhaCidadeKey(r);
      const tr = document.createElement("tr");
      const selo = r.editada ? "<span class='badge editable'>✎ Editável</span> " : "";
      tr.innerHTML =
        "<td class='chk'><input type='checkbox' data-sel-cidade='" + esc(key) + "'" + (state.cidadesSelecao[key] ? " checked" : "") + " aria-label='Selecionar " + esc(r.cidade) + "'></td>" +
        "<td>" + selo + esc(r.cidade) + "</td><td>" + esc(r.uf || "—") + "</td><td>" + esc(r.regional || "—") + "</td><td>" + esc(r.ficha) + "</td><td>" + esc(FICHA_UTILIZAR_PARA_ARQUIVO[r.ficha] || "⚠ não mapeado") + "</td>" +
        "<td><div class='row-actions'>" +
        "<button type='button' class='btn small secondary' data-edit-cidade='" + esc(key) + "'>Editar</button>" +
        "<button type='button' class='btn small secondary' data-dup-cidade='" + esc(key) + "'>Duplicar</button>" +
        (r.fonte === "overlay administrativo"
          ? "<button type='button' class='btn small danger' data-rm-cidade='" + esc(String(r.idx)) + "'>Remover</button>"
          : "") +
        "</div></td>";
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll("input[data-sel-cidade]").forEach(function (c) {
      c.addEventListener("change", function () {
        if (this.checked) state.cidadesSelecao[this.getAttribute("data-sel-cidade")] = true;
        else delete state.cidadesSelecao[this.getAttribute("data-sel-cidade")];
        renderBulkBar();
      });
    });
    tbody.querySelectorAll("button[data-edit-cidade]").forEach(function (b) {
      b.addEventListener("click", function () { editarCidade(b.getAttribute("data-edit-cidade")); });
    });
    tbody.querySelectorAll("button[data-dup-cidade]").forEach(function (b) {
      b.addEventListener("click", function () { duplicarCidade(b.getAttribute("data-dup-cidade")); });
    });
    tbody.querySelectorAll("button[data-rm-cidade]").forEach(function (b) {
      b.addEventListener("click", async function () {
        const id = b.getAttribute("data-rm-cidade");
        const nova = (state.overlay.cidades_novas || []).find(function (n) { return "n" + n.id === id; });
        if (!nova) return;
        const ok = await confirmModal("Remover cidade (overlay)",
          "<p>Será removida apenas a entrada administrativa (overlay) de <strong>" + esc(nova.cidade) + "</strong>. O JSON original do repositório não é alterado pelo painel.</p>", "Remover");
        if (!ok) return;
        const removida = Object.assign({}, nova);
        state.overlay.cidades_novas = state.overlay.cidades_novas.filter(function (n) { return "n" + n.id !== id; });
        delete state.cidadesSelecao["n" + removida.id];
        persistOverlaySilencioso("remocao_cidade", removida.cidade,
          { overlayKey: "cidades_novas", itens: [{ chave: "n" + removida.id, anterior: removida }] });
        applyCidadesOverlay(); rebuildCityMap(); renderCidades(); renderAssistMap(); renderDashboard();
      });
    });

    // contagem + paginação
    $("cidCount").textContent = filtroEsp
      ? total + " cidade(s) apontada(s) pela Saúde do Sistema (de " + state.cityArr.length + " no total)"
      : total + " cidade(s) encontradas (de " + state.cityArr.length + " no total) · página " + pag + " de " + paginas;
    const pagEl = $("cidPaginacao");
    if (paginas <= 1) { pagEl.innerHTML = ""; }
    else {
      let html = '<button type="button" data-pg="1"' + (pag === 1 ? " disabled" : "") + ' aria-label="Primeira página">«</button>' +
        '<button type="button" data-pg="' + (pag - 1) + '"' + (pag === 1 ? " disabled" : "") + ' aria-label="Página anterior">‹</button>';
      const janela = janelaPaginas(pag, paginas);
      for (const p of janela) {
        html += '<button type="button" data-pg="' + p + '"' + (p === pag ? ' class="atual"' : "") + ">" + p + "</button>";
      }
      html += '<button type="button" data-pg="' + (pag + 1) + '"' + (pag === paginas ? " disabled" : "") + ' aria-label="Próxima página">›</button>' +
        '<button type="button" data-pg="' + paginas + '"' + (pag === paginas ? " disabled" : "") + ' aria-label="Última página">»</button>';
      pagEl.innerHTML = html;
      pagEl.querySelectorAll("button[data-pg]").forEach(function (b) {
        b.addEventListener("click", function () {
          const p = parseInt(b.getAttribute("data-pg"), 10);
          if (p >= 1 && p <= paginas && p !== state.cidadesPagina) { state.cidadesPagina = p; renderCidades(); }
        });
      });
    }

    // "selecionar todos" só da página atual (T2.4)
    const selTodos = $("cidSelTodos");
    selTodos.checked = rowsPagina.length > 0 && rowsPagina.every(function (r) { return state.cidadesSelecao[linhaCidadeKey(r)]; });
    selTodos.onchange = function () {
      for (const r of rowsPagina) {
        if (this.checked) state.cidadesSelecao[linhaCidadeKey(r)] = true;
        else delete state.cidadesSelecao[linhaCidadeKey(r)];
      }
      renderCidades(); renderBulkBar();
    };

    renderBulkBar();
    // filtros
    const ufs = Array.from(new Set(state.cityArr.map(function (r) { return r.uf; }).filter(Boolean))).sort();
    $("cidUfFilter").innerHTML = '<option value="">UF: todas</option>' + ufs.map(function (u) { return "<option" + (u === uf ? " selected" : "") + ">" + esc(u) + "</option>"; }).join("");
    const fichas = Array.from(new Set(state.cityArr.map(function (r) { return r.ficha; }))).sort();
    $("cidFichaFilter").innerHTML = '<option value="">Ficha: todas</option>' + fichas.map(function (f2) { return "<option" + (f2 === fi ? " selected" : "") + ">" + esc(f2) + "</option>"; }).join("");
  }

  // ══════════════════════════════════════════════════════
  // v3 — CIDADES: EXPORTAÇÃO FILTRADA (§17) e DUPLICAR (§30)
  // ══════════════════════════════════════════════════════
  /** Serializa uma linha de cidade para CSV (com escape). */
  function cidadeLinhaCSV(r) {
    const esc2 = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
    return [esc2(r.cidade), esc2(r.uf), esc2(r.regional), esc2(r.ficha)].join(",");
  }

  /** §17 — exportação dos dados FILTRADOS (JSON ou CSV), incluindo a origem. */
  function exportarCidades(formato) {
    const rows = state._cidadesFiltradas || state.cityArr;
    if (!rows.length) { toast("Nenhuma cidade no filtro atual para exportar.", false); return; }
    const dados = rows.map(function (r) {
      return { cidade: r.cidade, uf: r.uf, regional: r.regional, ficha: r.ficha, origem: r.fonte };
    });
    const sufixo = new Date().toISOString().slice(0, 10);
    if (formato === "csv") {
      const conteudo = "cidade,uf,regional,ficha,origem\n" + dados.map(cidadeLinhaCSV).join("\n");
      const blob = new Blob(["\ufeff" + conteudo], { type: "text/csv;charset=utf-8" }); // BOM p/ Excel
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "cidades-" + sufixo + ".csv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    } else {
      global.AdminPersistence.baixarJSON({ exportadoEm: new Date().toISOString(), total: dados.length, cidades: dados }, "cidades-" + sufixo + ".json");
    }
    logEvento({ acao: "exportacao", entidade: "cidades", alteracao: dados.length + " cidade(s) exportada(s) como " + formato.toUpperCase() + " (filtro atual)" });
    toast(dados.length + " cidade(s) exportada(s) como " + formato.toUpperCase() + ".");
  }

  /** §30 — duplicar cidade (nova entrada no overlay; a original permanece). */
  async function duplicarCidade(key) {
    const r = state.cityArr.find(function (x) { return linhaCidadeKey(x) === key; });
    if (!r) return;
    const novoNome = r.cidade + " (cópia)";
    const k = normalizarChaveCidade(novoNome);
    if (state.cityMap[k]) { toast('Não foi possível duplicar: já existe "' + novoNome + '".', false); return; }
    state.overlay.cidades_novas = state.overlay.cidades_novas || [];
    state.overlay.cidades_novas.push({ id: state.cidadesNovasSeq++, cidade: novoNome, uf: r.uf, regional: r.regional, ficha: r.ficha });
    await persistOverlaySilencioso("duplicacao_cidade", novoNome,
      { overlayKey: "cidades_novas", itens: [{ chave: "n" + (state.cidadesNovasSeq - 1), anterior: null }] },
      "duplicada de " + r.cidade + " (" + r.uf + ") → " + r.ficha);
    applyCidadesOverlay(); rebuildCityMap(); renderCidades(); renderAssistMap(); renderDashboard();
    toast("Cidade duplicada: " + novoNome);
  }

  function janelaPaginas(atual, total) {
    const j = [];
    const ini = Math.max(1, atual - 2), fim = Math.min(total, atual + 2);
    for (let p = ini; p <= fim; p++) j.push(p);
    return j;
  }

  /** Barra de operações em massa (T2.4). */
  function renderBulkBar() {
    const chaves = Object.keys(state.cidadesSelecao);
    const bar = $("cidBulkBar");
    if (!chaves.length) { bar.hidden = true; return; }
    bar.hidden = false;
    $("cidBulkInfo").textContent = chaves.length + " selecionada(s)";
    const fichas = Object.keys(FICHA_UTILIZAR_PARA_ARQUIVO);
    if (!$("cidBulkFicha").options.length) {
      $("cidBulkFicha").innerHTML = fichas.map(function (f) { return "<option>" + esc(f) + "</option>"; }).join("");
    }
  }

  /** Tarefa 2.2 — editar qualquer cidade, qualquer origem, via formModal. */
  async function editarCidade(key) {
    const r = state.cityArr.find(function (x) { return linhaCidadeKey(x) === key; });
    if (!r) return;
    const fichas = Object.keys(FICHA_UTILIZAR_PARA_ARQUIVO);
    const valores = await formModal({
      title: "Editar cidade",
      fields: [
        { key: "cidade", label: "Cidade", type: "text", value: r.cidade, required: true, maxLength: 120 },
        { key: "uf", label: "UF", type: "text", value: r.uf, required: true, maxLength: 2, uppercase: true,
          validate: function (v) { return (v && v.length === 2) ? null : "UF deve ter exatamente 2 letras (ex.: SP)."; } },
        { key: "regional", label: "Regional", type: "text", value: r.regional, maxLength: 4, uppercase: true, help: "Se vazio, usa a UF." },
        { key: "ficha", label: "Ficha a utilizar", type: "select", value: r.ficha, options: fichas, required: true }
      ],
      okLabel: "Salvar",
      validate: function (vals) {
        // revalida duplicidade EXCLUINDO a própria linha em edição (T2.2)
        const k = normalizarChaveCidade(vals.cidade);
        const duplicada = state.cityArr.some(function (x) { return linhaCidadeKey(x) !== key && normalizarChaveCidade(x.cidade) === k; });
        return duplicada ? 'Já existe outra cidade cadastrada com essa combinação de nome ("' + k + '"). Escolha um nome distinto ou edite a entrada existente.' : null;
      }
    });
    if (!valores) return;
    const novo = { cidade: valores.cidade.trim(), uf: valores.uf.trim().toUpperCase(), regional: (valores.regional || "").trim().toUpperCase() || valores.uf.trim().toUpperCase(), ficha: valores.ficha };
    const antes = { cidade: r.cidade, uf: r.uf, regional: r.regional, ficha: r.ficha };
    const resumo = "{cidade: \"" + antes.cidade + "\" → \"" + novo.cidade + "\", uf: \"" + antes.uf + "\" → \"" + novo.uf + "\", regional: \"" + antes.regional + "\" → \"" + novo.regional + "\", ficha: \"" + antes.ficha + "\" → \"" + novo.ficha + "\"}";

    if (r.fonte === "overlay administrativo") {
      // T2.2 — cidade do overlay: edita o objeto pelo id (ID estável)
      const nova = (state.overlay.cidades_novas || []).find(function (n) { return "n" + n.id === String(r.idx); });
      if (!nova) { toast("Não foi possível localizar a entrada do overlay desta cidade.", false); return; }
      const anterior = Object.assign({}, nova);
      Object.assign(nova, novo);
      persistOverlaySilencioso("edicao_cidade", novo.cidade,
        { overlayKey: "cidades_novas", itens: [{ chave: "n" + nova.id, anterior: anterior }] }, resumo);
    } else {
      // T2.1/T2.2 — cidade do JSON: patch COMPLETO no overlay, chaveado pela
      // normalização do nome ORIGINAL (origemChave), não pelo nome editado.
      const chaveOrigem = r.origemChave || normalizarChaveCidade(r.cidade);
      const patchAnterior = Object.assign({}, state.overlay.cidades[chaveOrigem]); // pode ser patch antigo {ficha} ou inexistente
      state.overlay.cidades[chaveOrigem] = Object.assign({}, patchAnterior, novo);
      persistOverlaySilencioso("edicao_cidade", novo.cidade,
        { overlayKey: "cidades", itens: [{ chave: chaveOrigem, anterior: patchAnterior }] }, resumo);
    }
    applyCidadesOverlay(); rebuildCityMap(); renderCidades(); renderAssistMap(); renderDashboard();
    toast("Cidade atualizada no overlay: " + resumo);
  }

  /** Tarefa 2.4 — troca de ficha em massa (um único evento agregado). */
  async function aplicarBulk() {
    const chaves = Object.keys(state.cidadesSelecao);
    if (!chaves.length) return;
    const ficha = $("cidBulkFicha").value;
    const alvo = state.cityArr.filter(function (r) {
      return chaves.indexOf(linhaCidadeKey(r)) !== -1 && r.ficha !== ficha;
    });
    if (!alvo.length) { toast("Todas as cidades selecionadas já usam " + ficha + "."); return; }
    const amostra = alvo.slice(0, 12).map(function (r) { return esc(r.cidade + " (" + r.ficha + " → " + ficha + ")"); }).join(", ");
    const ok = await confirmModal("Trocar ficha em massa",
      "<p>Você está prestes a alterar a ficha de <strong>" + alvo.length + " cidade(s)</strong>.</p>" +
      (alvo.length > 12 ? "<pre>" + amostra + ", …</pre>" : "<pre>" + amostra + "</pre>") +
      "<p>Ficha destino: <strong>" + esc(ficha) + "</strong> (" + esc(FICHA_UTILIZAR_PARA_ARQUIVO[ficha] || "?") + ")</p>" +
      "<p>Um único evento agregado será registrado no Histórico. O JSON original não é alterado — tudo vai para o overlay.</p>",
      "Aplicar em " + alvo.length + " cidade(s)");
    if (!ok) return;

    const itens = []; // reverso agregado (Tarefa 6)
    for (const r of alvo) {
      const key = linhaCidadeKey(r);
      if (r.fonte === "overlay administrativo") {
        const nova = (state.overlay.cidades_novas || []).find(function (n) { return "n" + n.id === String(r.idx); });
        if (nova) { itens.push({ chave: "n" + nova.id, anterior: { ficha: nova.ficha }, overlayKey: "cidades_novas", id: nova.id }); nova.ficha = ficha; }
      } else {
        const chaveOrigem = r.origemChave || normalizarChaveCidade(r.cidade);
        const patchAnterior = Object.assign({}, state.overlay.cidades[chaveOrigem]);
        state.overlay.cidades[chaveOrigem] = Object.assign({}, patchAnterior, { ficha: ficha });
        itens.push({ chave: chaveOrigem, anterior: patchAnterior, overlayKey: "cidades" });
      }
    }
    await persistOverlaySilencioso("alteracao_cidade_massa", alvo.length + " cidade(s) → " + ficha,
      { multi: itens }, "troca de ficha de " + alvo.length + " cidade(s) para " + ficha + ": " +
      alvo.slice(0, 10).map(function (r) { return r.cidade; }).join(", ") + (alvo.length > 10 ? ", …" : ""));
    state.cidadesSelecao = {};
    applyCidadesOverlay(); rebuildCityMap(); renderCidades(); renderAssistMap(); renderDashboard();
    toast("Ficha alterada para " + alvo.length + " cidade(s).");
  }

  // ── Tarefa 2.5 — importação de cidades com preview obrigatório ──
  /**
   * Aceita CSV (separador ',' ou ';', com cabeçalho cidade;uf;regional;ficha)
   * ou JSON (array). XLSX NÃO é suportado nesta rodada (exigiria lib nova
   * sem build step disponível — §5 T2.5). Preview mostra resumo antes de
   * aplicar: válidos entram; duplicados/inválidos são listados para revisão.
   */
  function parseCidadesTexto(texto) {
    const registros = [];
    const erroEstrutura = "Estrutura não reconhecida — use CSV com cabeçalho (cidade;uf;regional;ficha) ou JSON array de objetos.";
    let json = null;
    if (/^\s*[[{]/.test(texto)) {
      try { json = JSON.parse(texto); } catch (e) { return { erro: "Arquivo não é um JSON válido: " + e.message }; }
      if (!Array.isArray(json)) return { erro: erroEstrutura };
      for (const item of json) {
        if (item && typeof item === "object") {
          registros.push({ cidade: String(item.cidade || item.CIDADE || ""), uf: String(item.uf || item.UF || ""), regional: String(item.regional || item.REGIONAL || ""), ficha: String(item.ficha || item["FICHA A UTILIZAR"] || item["FICHA A UTILIZAR".toLowerCase()] || item["ficha a utilizar"] || "") });
        }
      }
    } else {
      const linhas = String(texto).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      if (linhas.length < 2) return { erro: erroEstrutura };
      const sep = linhas[0].indexOf(";") !== -1 ? ";" : ",";
      const head = linhas[0].toLowerCase().split(sep).map(function (h) { return h.trim(); });
      const iC = head.indexOf("cidade"), iU = head.indexOf("uf"), iR = head.indexOf("regional"), iF = head.indexOf("ficha");
      if (iC === -1 || iU === -1) {
        return { erro: "Cabeçalho ausente — a primeira linha deve conter ao menos: cidade" + sep + "uf" + sep + "regional" + sep + "ficha" };
      }
      for (let i = 1; i < linhas.length; i++) {
        const cols = linhas[i].split(sep).map(function (c) { return c.trim(); });
        registros.push({ cidade: cols[iC] || "", uf: iU > -1 ? (cols[iU] || "") : "", regional: iR > -1 ? (cols[iR] || "") : "", ficha: iF > -1 ? (cols[iF] || "") : "" });
      }
    }
    return { registros: registros };
  }

  /** Classifica registros: válidos / duplicados / inválidos (para o preview). */
  function classificarCidadesImportadas(registros) {
    const validos = [], duplicados = [], invalidos = [];
    const vistasNaImportacao = {};
    for (const r of registros) {
      const k = normalizarChaveCidade(r.cidade);
      if (!k || k.length < 2) { invalidos.push(Object.assign({ motivo: "cidade ausente" }, r)); continue; }
      if (!r.uf || r.uf.trim().length !== 2 || !ufValida(r.uf)) { invalidos.push(Object.assign({ motivo: "UF ausente ou inválida (use a sigla de um dos 27 estados)" }, r)); continue; }
      if (r.ficha && !(FICHA_UTILIZAR_PARA_ARQUIVO[normalizarFicha(r.ficha)])) { invalidos.push(Object.assign({ motivo: "ficha informada não existe (use: " + Object.keys(FICHA_UTILIZAR_PARA_ARQUIVO).join(", ") + ")" }, r)); continue; }
      if (vistasNaImportacao[k]) { duplicados.push(Object.assign({ motivo: "duplicado no arquivo" }, r)); continue; }
      vistasNaImportacao[k] = true;
      if (state.cityMap[k]) { duplicados.push(Object.assign({ motivo: "já cadastrada" }, r)); continue; }
      validos.push({ cidade: r.cidade.trim(), uf: r.uf.trim().toUpperCase(), regional: (r.regional || "").trim().toUpperCase() || r.uf.trim().toUpperCase(), ficha: normalizarFicha(r.ficha) || "FICHA REEMBOLSO" });
    }
    return { validos: validos, duplicados: duplicados, invalidos: invalidos };
  }

  async function importarCidadesFile(file) {
    const preview = $("cidImportPreview");
    $("cidImportPanel").hidden = false;
    try {
      const texto = await file.text();
      const parsed = parseCidadesTexto(texto);
      if (parsed.erro) { preview.innerHTML = '<div class="notice err">' + esc(parsed.erro) + "</div>"; return; }
      const cls = classificarCidadesImportadas(parsed.registros);
      if (!parsed.registros.length) { preview.innerHTML = '<div class="notice err">Nenhum registro encontrado no arquivo.</div>'; return; }
      const total = parsed.registros.length;

      function linhas(lista, classe) {
        return lista.slice(0, 50).map(function (r) {
          return '<div class="' + classe + '">• ' + esc((r.cidade || "(sem nome)") + " / " + (r.uf || "—")) + " — " + esc(r.motivo || "") + "</div>";
        }).join("") + (lista.length > 50 ? "<div>… e mais " + (lista.length - 50) + "</div>" : "");
      }
      preview.innerHTML =
        '<div class="import-resumo notice warn"><strong>Preview da importação:</strong> ' + total + " registros encontrados · " +
        cls.validos.length + " válidos · " + cls.duplicados.length + " duplicados · " + cls.invalidos.length + " inválidos" +
        (cls.invalidos.length ? " (" + Array.from(new Set(cls.invalidos.map(function (r) { return r.motivo; }))).join(", ") + ")" : "") + ".</div>" +
        (cls.validos.length ? '<div class="import-lista">' + cls.validos.map(function (r) { return '<div class="ok">✓ ' + esc(r.cidade + " (" + r.uf + ") → " + r.ficha) + "</div>"; }).join("") + "</div>" : "") +
        (cls.duplicados.length ? '<div class="import-lista">' + linhas(cls.duplicados, "dup") + "</div>" : "") +
        (cls.invalidos.length ? '<div class="import-lista">' + linhas(cls.invalidos, "erro") + "</div>" : "") +
        '<button type="button" class="btn" id="btnCidImportOk"' + (cls.validos.length ? "" : " disabled") + ">Aplicar " + cls.validos.length + " válido(s)</button>";

      const btn = $("btnCidImportOk");
      if (!btn) return;
      btn.addEventListener("click", comLoading(btn, async function () {
        const ok = await confirmModal("Importar cidades",
          "<p>Serão adicionadas <strong>" + cls.validos.length + " cidade(s)</strong> ao overlay administrativo. Duplicados e inválidos <strong>não</strong> são aplicados.</p>", "Importar");
        if (!ok) return;
        for (const r of cls.validos) {
          state.overlay.cidades_novas.push({ id: state.cidadesNovasSeq++, cidade: r.cidade, uf: r.uf, regional: r.regional, ficha: r.ficha });
        }
        await persistOverlaySilencioso("importacao_cidades", file.name, null,
          cls.validos.length + " cidade(s) importada(s) de " + file.name + " (" + total + " registros: " + cls.validos.length + " válidos, " + cls.duplicados.length + " duplicados, " + cls.invalidos.length + " inválidos)");
        applyCidadesOverlay(); rebuildCityMap(); renderCidades(); renderAssistMap(); renderDashboard();
        preview.innerHTML = '<div class="notice ok">' + cls.validos.length + " cidade(s) importada(s) para o overlay.</div>";
      }));
    } catch (e) {
      preview.innerHTML = '<div class="notice err">Não foi possível ler o arquivo: ' + esc(e.message) + "</div>";
    }
  }

  async function adicionarCidade() {
    const nome = $("cidNome").value.trim();
    const uf = $("cidUf").value.trim().toUpperCase();
    const regional = $("cidRegional").value.trim().toUpperCase();
    const ficha = $("cidFicha").value;
    const msg = $("cidMsg");
    if (!nome || nome.length < 2) { msg.innerHTML = '<div class="notice err">Informe o nome da cidade (mínimo 2 letras).</div>'; return; }
    if (!uf || uf.length !== 2) { msg.innerHTML = '<div class="notice err">Informe a UF com exatamente 2 letras (ex.: SP).</div>'; return; }
    const k = normalizarChaveCidade(nome);
    if (state.cityMap[k]) {
      msg.innerHTML = '<div class="notice err">Não foi possível adicionar: já existe uma cidade cadastrada com essa combinação de nome/UF (normalização "' + esc(k) + '"). Edite a entrada existente na tabela.</div>';
      return;
    }
    const ok = await confirmModal("Adicionar cidade",
      "<p>Será adicionada ao overlay administrativo (os JSONs originais não são alterados pelo painel):</p><pre>Cidade: " + esc(nome) +
      "\nUF: " + esc(uf) + "\nRegional: " + esc(regional || uf) + "\nFicha: " + esc(ficha) + "\nChave normalizada: " + esc(k) + "</pre>", "Adicionar");
    if (!ok) return;
    state.overlay.cidades_novas = state.overlay.cidades_novas || [];
    state.overlay.cidades_novas.push({ id: state.cidadesNovasSeq++, cidade: nome, uf: uf, regional: regional || uf, ficha: ficha });
    $("cidNome").value = ""; $("cidUf").value = ""; $("cidRegional").value = "";
    msg.innerHTML = '<div class="notice ok">Cidade adicionada ao overlay.</div>';
    persistOverlaySilencioso("criacao_cidade", nome + " (" + uf + ") → " + ficha);
    applyCidadesOverlay(); rebuildCityMap(); renderCidades(); renderAssistMap(); renderDashboard();
  }

  function renderAssistMap() {
    const porFicha = {};
    for (const r of state.cityArr) {
      porFicha[r.ficha] = porFicha[r.ficha] || [];
      porFicha[r.ficha].push(r.cidade);
    }
    let html = "";
    for (const ficha of Object.keys(porFicha).sort()) {
      html += esc(ficha) + " → " + esc(FICHA_UTILIZAR_PARA_ARQUIVO[ficha] || "⚠ arquivo não mapeado") +
        "\n    └ " + porFicha[ficha].length + " cidade(s): " + esc(porFicha[ficha].slice(0, 8).join(", ")) + (porFicha[ficha].length > 8 ? ", …" : "") + "\n\n";
    }
    $("assocMap").textContent = html;
  }

  async function persistOverlaySilencioso(acao, entidade, reverso, alteracao) {
    try { await global.AdminPersistence.salvarOverlay(state.overlay); } catch (e) { toast("Falha ao persistir: " + e.message, false); }
    await logEvento({ acao: acao, entidade: entidade, alteracao: alteracao || "", reverso: reverso });
  }

  // ══════════════════════════════════════════════════════
  // FORMULÁRIOS / REGRAS / SEGURANÇA
  // ══════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════
  // v3 — FORMULÁRIOS (§8): tabela de entidades + métricas derivadas
  // ══════════════════════════════════════════════════════
  function metricasFormularios() {
    const flatLens = {};
    for (const key of Object.keys(DOCS)) flatLens[key] = (state.docData[key] && state.docData[key].flat || []).length;
    return formulariosComMetricas(FORMULARIOS, DOCS, flatLens, FICHA_UTILIZAR_PARA_ARQUIVO, state.cityArr, state.overlay.forms_meta, state.overlay.templates_versoes, state.overlay.campos_custom);
  }

  function renderFormularios() {
    const tbody = $("formTable").querySelector("tbody");
    if (!tbody) return;
    const q = (($("formSearch") || {}).value || "").toLowerCase();
    const linhas = metricasFormularios().filter(function (f) { return !q || (f.nome + " " + f.codigo + " " + f.rota).toLowerCase().indexOf(q) !== -1; });
    tbody.innerHTML = linhas.map(function (f) {
      const badge = f.status.indexOf("Ativo") === 0 ? "<span class='badge ok'>Ativo</span>" : "<span class='badge warn'>" + esc(f.status) + "</span>";
      const tpl = f.pdfFile ? esc(f.pdfFile) + (f.nCamposCustom ? " <span class='badge editable' title='Campos criados/alterados pelo painel (§10)'>+" + f.nCamposCustom + "</span>" : "") : "<span style='color:var(--text-light)'>" + esc(f.template) + "</span>";
      const ver = f.templateStatus.versao ? " <span class='badge muted'>v" + esc(f.templateStatus.versao) + "</span>" : "";
      return "<tr><td><a href='#' data-form-abrir='" + esc(f.codigo) + "'><strong>" + esc(f.nome) + "</strong></a></td><td><code>" + esc(f.codigo) + "</code></td><td><code>" + esc(f.rota) + "</code></td><td>" + tpl + ver +
        "</td><td class='num'>" + (f.nCampos == null ? "—" : f.nCampos) + "</td><td class='num'>" + (f.nCidades == null ? "—" : f.nCidades) + "</td><td>" + badge +
        "</td><td><div class='row-actions'><button type='button' class='btn small secondary' data-form-abrir='" + esc(f.codigo) + "'>Abrir</button></div></td></tr>";
    }).join("");
    tbody.querySelectorAll("[data-form-abrir]").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        abrirFormDetail(a.getAttribute("data-form-abrir"));
      });
    });
    renderRegras();
  }

  function abrirFormDetail(codigo) {
    state.formSel = codigo;
    state.formTab = "geral";
    renderFormDetail();
  }

  /** §9 — detalhe do formulário com abas. */
  function formDetailPorCodigo(codigo) {
    return metricasFormularios().find(function (f) { return f.codigo === codigo; });
  }

  function renderFormDetail() {
    const detail = $("formDetail"), list = $("formListView");
    if (!detail || !list) return;
    const f = state.formSel ? formDetailPorCodigo(state.formSel) : null;
    detail.hidden = !f;
    list.style.display = f ? "none" : "";
    if (!f) return;
    $("fdNome").textContent = f.nome;
    $("fdMeta").textContent = "Código " + f.codigo + " · " + f.status + " · " + f.rota + " · " + f.arquivo;
    // abas
    detail.querySelectorAll(".tabs button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === state.formTab);
      b.setAttribute("aria-selected", b.getAttribute("data-tab") === state.formTab ? "true" : "false");
    });
    detail.querySelectorAll(".tab-pane").forEach(function (p) {
      p.classList.toggle("active", p.id === "fdPane-" + state.formTab);
    });
    renderFdGeral(f);
    renderFdCampos(f);
    renderFdTemplate(f);
    renderFdRegras(f);
    renderFdCidades(f);
    renderFdHistorico(f);
  }

  function renderFdGeral(f) {
    const st = f.templateStatus;
    const kv = [
      ["Nome", f.nome],
      ["Código", f.codigo],
      ["Status", f.status],
      ["Rota", f.rota],
      ["Arquivo", f.arquivo],
      ["Template", f.pdfFile || f.template + " (gerado no código)"],
      ["Versão do template", st.versao ? "v" + st.versao + (st.rollback ? " · rollback disponível" : "") : "— (sem upload versionado)"],
      ["Campos", f.nCampos == null ? "— (sem schema de coordenadas)" : f.nCampos + " com coordenadas"],
      ["Cidades associadas", f.nCidades == null ? "— (não aplica)" : f.nCidades]
    ];
    $("fdGeral").innerHTML = '<div class="kv-list">' + kv.map(function (p) {
      return '<div class="kv"><span class="k">' + esc(p[0]) + '</span><span class="v">' + esc(p[1]) + "</span></div>";
    }).join("") + "</div>";
  }

  function renderFdCampos(f) {
    const box = $("fdCamposTabela");
    if (!box) return;
    if (!f.docKey) {
      box.innerHTML = '<div class="notice info">Este formulário não possui schema de campos com coordenadas — a geração de PDF é feita no código.</div>';
      renderFdCamposBuilder(f);
      return;
    }
    const dd = state.docData[f.docKey];
    const flat = (dd && dd.flat) || [];
    const porSecao = {};
    for (const c of flat) {
      const s = c.secao || "—";
      (porSecao[s] || (porSecao[s] = [])).push(c);
    }
    box.innerHTML = Object.keys(porSecao).sort().map(function (s) {
      return '<h4 style="margin:10px 0 4px;font-size:12px;color:var(--text-light)">' + esc(s) + " — " + porSecao[s].length + " campo(s)</h4>" +
        porSecao[s].map(function (c) {
          const custom = c.origem === "painel";
          const selo = custom ? " <span class='badge editable' title='Criado/alterado pelo painel (§10)'>painel</span>" : "";
          const lote = custom ? (state.overlay.campos_custom[f.docKey] || {})[fbIdDeKey(c.key)] : null;
          const ops = lote && lote.renomeadoDe ? " — renomeado de <code>" + esc(lote.renomeadoDe) + "</code>" : "";
          const acoes = custom
            ? "<span style='float:right'><button type='button' class='btn small secondary' data-fb-edit='" + esc(c.key) + "'>Editar</button> <button type='button' class='btn small secondary' data-fb-del='" + esc(c.key) + "'>Excluir</button></span>"
            : "<span style='float:right'><button type='button' class='btn small secondary' data-fb-edit='" + esc(c.key) + "'>Editar</button></span>";
          return '<div class="diff-line"><span class="path">' + esc(c.label) + '</span>' + selo + " <code style=\"font-size:10.5px;color:var(--text-light)\">" + esc(c.key) + "</code> · pág. " + (c.pagina || 1) + ops + acoes + "</div>";
        }).join("");
    }).join("") +
      (f.nCamposCustom ? '<div class="notice info" style="margin-top:8px">' + f.nCamposCustom + " personalização(ões) do painel pendente(s) de publicação — o JSON do repositório permanece intacto até a exportação (contrato “estrutura é código”).</div>" : "");
    box.querySelectorAll("[data-fb-edit]").forEach(function (b) { b.addEventListener("click", function () { fbAbrirEditor(f, b.getAttribute("data-fb-edit")); }); });
    box.querySelectorAll("[data-fb-del]").forEach(function (b) { b.addEventListener("click", function () { fbExcluirCampo(f, b.getAttribute("data-fb-del")); }); });
    renderFdCamposBuilder(f);
  }

  // ══════════════════════════════════════════════════════
  // v3 — FIELD BUILDER (§10): UI do CRUD de campos
  // ══════════════════════════════════════════════════════
  /** docKey alvo de um formulário pelo nome/código (para o select de destino). */
  function fbAbrirForm(nome) {
    const alvo = String(nome || "").trim();
    if (!alvo) return null;
    const f = FORMULARIOS.find(function (x) { return x.nome === alvo || x.codigo === alvo; });
    return f && f.docKey ? f.docKey : null;
  }

  /** id curto do campo a partir da chave flat (último segmento). */
  function fbIdDeKey(key) {
    const segs = String(key || "").split(".");
    return segs[segs.length - 1];
  }

  /** JSON EFETIVO (base + overlay custom) — o mesmo contrato do export futuro. */
  function fbDocEfetivo(docKey) {
    if (!state.docBase[docKey]) return null;
    const json = JSON.parse(JSON.stringify(state.docBase[docKey]));
    const lote = (state.overlay.campos_custom || {})[docKey];
    if (lote) aplicarCamposCustomEmJson(json, lote);
    return json;
  }

  /** Reaplica o overlay custom ao JSON ativo e reconstrói flat/lista/editor. */
  function fbReconstruirDoc(docKey) {
    const dd = state.docData[docKey];
    if (!dd || !state.docBase[docKey]) return;
    dd.json = JSON.parse(JSON.stringify(state.docBase[docKey]));
    applyOverlayToDoc(docKey, dd.json);
    dd.flat = docDataFlat(docKey, dd.json);
    dd.dirty = false;
    atualizarListaCampos(docKey);
    // render do editor reflete o schema reconstruído (a seção usa id "sec-coordenadas")
    const sec = document.getElementById("sec-coordenadas");
    if (typeof renderEditorPage === "function" && sec && sec.classList.contains("active")) {
      try { renderEditorPage(docKey); } catch (e) { /* editor não inicializado */ }
    }
  }

  /** Lote de customizações do docKey (objeto vivo do overlay). */
  function fbLote(docKey) {
    state.overlay.campos_custom = state.overlay.campos_custom || {};
    if (!state.overlay.campos_custom[docKey]) state.overlay.campos_custom[docKey] = {};
    return state.overlay.campos_custom[docKey];
  }

  /** Itens de customização com apelidos de exibição (tabela do builder). */
  function fbListaCamposCustom(lote) {
    const out = [];
    for (const id of Object.keys(lote || {})) {
      const e = lote[id];
      if (e && e.excluir) out.push({ id: id, acao: "excluir", rotuloAcao: "Exclusão", alvo: id, entry: null });
      else if (e && e.renomeadoDe) out.push({ id: id, acao: "renomear", rotuloAcao: "Renomeação", alvo: e.renomeadoDe + " → " + id, entry: e });
      else if (e) out.push({ id: id, acao: "criar", rotuloAcao: "Criação", alvo: id, entry: e });
    }
    return out;
  }

  /** Seções EXISTENTES no schema efetivo — o painel não inventa seções:
   *  campos novos só podem entrar em uma delas (sem "campos_adicionais"). */
  function fbSecoesExistentes(docKey) {
    const json = fbDocEfetivo(docKey);
    if (!json || !json.campos || typeof json.campos !== "object") return [];
    return Object.keys(json.campos).filter(function (k) {
      const v = json.campos[k];
      return v && typeof v === "object" && !Array.isArray(v);
    });
  }

  /** Marca no select a seção do campo (ou a primeira seção existente). */
  function fbSelectSecao(valor) {
    const sel = $("fbSecao");
    if (!sel) return;
    if (valor && !Array.prototype.some.call(sel.options, function (o) { return o.value === valor; })) {
      const op = document.createElement("option");
      op.value = valor;
      op.textContent = valor + " (ausente no schema)";
      sel.appendChild(op);
    }
    sel.value = valor || (sel.options[0] ? sel.options[0].value : "");
  }

  /** ids já ocupados no JSON EFETIVO (usados pelo gerador de IDs estáveis). */
  function fbIdsExistentes(docKey) {
    const json = fbDocEfetivo(docKey);
    if (!json || !json.campos) return {};
    const flat = [];
    flattenFields(json.campos, "", flat);
    const ids = {};
    for (const f of flat) {
      const segs = f.key.split(".");
      ids[segs[segs.length - 1]] = true;
    }
    return ids;
  }

  /** Painel lateral (drawer) do builder — criação e edição de campos. */
  function renderFdCamposBuilder(f) {
    const box = $("fdCamposBuilder");
    if (!box) return;
    if (!f.docKey) { box.innerHTML = ""; return; }
    const dd = state.docData[f.docKey];
    if (!dd) { box.innerHTML = ""; return; }
    const lote = (state.overlay.campos_custom || {})[f.docKey] || {};
    const itens = fbListaCamposCustom(lote);
    const secoes = fbSecoesExistentes(f.docKey);
    const secoesOpts = secoes.length
      ? secoes.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + "</option>"; }).join("")
      : '<option value="">(nenhuma seção no schema)</option>';
    let html = "";
    if (itens.length) {
      html += '<h4 style="margin:14px 0 6px;font-size:12px;color:var(--text-light)">Field Builder — ' + itens.length + " operação(ões) pendente(s) neste schema</h4>";
      html += itens.map(function (it) {
        const badge = it.acao === "excluir" ? "<span class='badge warn'>excluir</span>"
          : it.acao === "renomear" ? "<span class='badge editable'>renomear</span>"
          : "<span class='badge ok'>criar</span>";
        const det = it.entry ? " — " + esc(it.entry.label) + " (" + esc(it.entry.tipo) + ", pág. " + esc(it.entry.pagina) + ")" : "";
        return '<div class="diff-line">' + badge + " <span class='path'>" + esc(it.alvo) + "</code></span>" + det +
          '<span style="float:right"><button type="button" class="btn small secondary" data-fb-desfazer="' + esc(it.id) + '">Desfazer operação</button></span></div>';
      }).join("");
    }
    // drawer de criação/edição (começa fechado)
    html += '<div id="fbDrawer" class="fb-drawer" hidden>' +
      '<h4 id="fbDrawerTitulo" style="margin:0 0 8px;font-size:13px"></h4>' +
      '<div class="form-grid" style="grid-template-columns:1fr 1fr">' +
      '<div><label for="fbNome">Rótulo (nome de exibição) *</label><input type="text" id="fbNome" placeholder="Ex.: Telefone comercial"></div>' +
      '<div><label for="fbTipo">Tipo</label><select id="fbTipo">' + FIELD_TIPOS.map(function (t) { return '<option value="' + t + '">' + t + "</option>"; }).join("") + "</select></div>" +
      '<div><label for="fbPagina">Página</label><input type="number" id="fbPagina" min="1" step="1" value="1"></div>' +
      '<div><label for="fbObrig">Obrigatório</label><select id="fbObrig"><option value="nao">Não</option><option value="sim">Sim</option></select></div>' +
      '<div><label for="fbX">X (pts)</label><input type="number" id="fbX" step="1" value="60"></div>' +
      '<div><label for="fbY">Y (pts)</label><input type="number" id="fbY" step="1" value="60"></div>' +
      '<div><label for="fbL">Largura (pts)</label><input type="number" id="fbL" step="1" value="200"></div>' +
      '<div><label for="fbA">Altura (pts)</label><input type="number" id="fbA" step="1" value="12"></div>' +
      '<div style="grid-column:1/-1"><label for="fbSecao">Seção de destino (somente seções existentes do schema)</label><select id="fbSecao">' + secoesOpts + "</select></div>" +
      '<div style="grid-column:1/-1"><label for="fbOpcoes">Opções (radio/checkbox/seleção) — uma por linha: <code>valor|Rótulo</code></label><textarea id="fbOpcoes" rows="3" placeholder="SIM|Sim aceito\nNAO|Não aceito"></textarea></div>' +
      '<div style="grid-column:1/-1"><label for="fbDestino">Aplicar ao formulário</label><select id="fbDestino">' +
      FORMULARIOS.filter(function (x) { return x.docKey; }).map(function (x) { return '<option value="' + esc(x.docKey) + '">' + esc(x.nome) + "</option>"; }).join("") +
      "</select><p class='section-desc'>Cada campo pertence a um schema — a migração entre formulários é feita duplicando o campo (IDs estáveis evitam colisões).</p></div>" +
      '</div>' +
      '<div id="fbDrawerAviso"></div>' +
      '<div class="editor-actions">' +
      '<button type="button" class="btn" id="fbSalvar">Gravar no overlay</button>' +
      '<button type="button" class="btn secondary" id="fbCancelar">Cancelar</button>' +
      "</div>" +
      '<p class="section-desc">§10 — O ID é gerado uma única vez a partir do rótulo e <strong>nunca muda em renomeações</strong> (o rótulo é só exibição). A gravação cria pendência no overlay; a publicação valida o schema completo.</p>';
    box.innerHTML = html;

    box.querySelectorAll("[data-fb-desfazer]").forEach(function (b) {
      b.addEventListener("click", function () { fbDesfazerOperacao(f, b.getAttribute("data-fb-desfazer")); });
    });
    const novo = $("fdNovoCampo");
    if (novo) {
      novo.disabled = false;
      novo.onclick = function () { fbAbrirDrawer(f, null); };
    }
  }

  /** Abre o drawer no modo criação (idEditar == null) ou edição. */
  function fbAbrirDrawer(f, idEditar) {
    const fSel = f || formDetailPorCodigo(state.formSel);
    if (!fSel || !fSel.docKey) { toast("Este formulário não possui schema de campos.", false); return; }
    renderFdCamposBuilder(fSel); // garante drawer no DOM
    const drawer = $("fbDrawer");
    if (!drawer) return;
    drawer.hidden = false;
    $("fbDrawerTitulo").textContent = idEditar ? "Editar campo — " + idEditar : "Novo campo";
    $("fbDestino").value = fSel.docKey;
    $("fbDestino").disabled = !!idEditar;
    $("fbDrawerAviso").innerHTML = "";
    if (idEditar) {
      const lote = (state.overlay.campos_custom || {})[fSel.docKey] || {};
      const e = lote[idEditar];
      if (e && !e.excluir) {
        $("fbNome").value = e.label || "";
        $("fbTipo").value = e.tipo || "texto";
        $("fbPagina").value = e.pagina || 1;
        $("fbObrig").value = e.obrigatorio ? "sim" : "nao";
        $("fbX").value = e.coordenadas ? e.coordenadas.x : 60;
        $("fbY").value = e.coordenadas ? e.coordenadas.y : 60;
        $("fbL").value = e.coordenadas ? e.coordenadas.largura : 200;
        $("fbA").value = e.coordenadas ? e.coordenadas.altura : 12;
        fbSelectSecao(e.secao);
        $("fbOpcoes").value = e.opcoes ? Object.keys(e.opcoes).map(function (v) { return v + "|" + e.opcoes[v]; }).join("\n") : "";
      } else {
        // campo base: pré-preenche a partir do schema efetivo (sem ID novo ainda)
        const flat = state.docData[fSel.docKey].flat;
        const campo = flat.find(function (x) { return fbIdDeKey(x.key) === idEditar; });
        if (campo) {
          $("fbNome").value = campo.label;
          $("fbTipo").value = campo.tipo || "texto";
          $("fbPagina").value = campo.pagina || 1;
          $("fbX").value = campo.coords.x; $("fbY").value = campo.coords.y;
          $("fbL").value = campo.coords.largura || 200; $("fbA").value = campo.coords.altura || 12;
        }
      }
    } else {
      ["fbNome", "fbOpcoes"].forEach(function (id) { $(id).value = ""; });
      $("fbTipo").value = "texto"; $("fbPagina").value = 1; $("fbObrig").value = "nao";
      $("fbX").value = 60; $("fbY").value = 60; $("fbL").value = 200; $("fbA").value = 12;
      fbSelectSecao(null);
    }
    $("fbSalvar").onclick = function () { fbGravar(fSel, idEditar); };
    $("fbCancelar").onclick = function () { drawer.hidden = true; };
    $("fbNome").focus();
  }

  /** Lê o drawer, valida e grava a operação (criar/renomear) no overlay. */
  async function fbGravar(f, idEditar) {
    const docKey = $("fbDestino").value;
    if (!DOCS[docKey]) { toast("Formulário de destino inválido.", false); return; }
    const nome = $("fbNome").value.trim();
    if (!nome) { $("fbDrawerAviso").innerHTML = '<div class="notice err">O rótulo é obrigatório.</div>'; return; }
    const tipo = $("fbTipo").value;
    const opcoesTxt = $("fbOpcoes").value.trim();
    let opcoes;
    if (tipo === "grupo_radio" || tipo === "grupo_checkbox" || tipo === "selecao") {
      opcoes = {};
      for (const linha of opcoesTxt.split("\n")) {
        const t = linha.trim(); if (!t) continue;
        const pipe = t.indexOf("|");
        if (pipe === -1) { $("fbDrawerAviso").innerHTML = '<div class="notice err">Opção inválida: "' + esc(t) + '" — use valor|Rótulo.</div>'; return; }
        opcoes[t.slice(0, pipe).trim()] = t.slice(pipe + 1).trim();
      }
    }
    // seção de destino: obrigatória e restrita às seções JÁ existentes no schema
    const secao = String($("fbSecao").value || "").trim();
    const secoesValidas = fbSecoesExistentes(docKey);
    if (secoesValidas.indexOf(secao) === -1) {
      $("fbDrawerAviso").innerHTML = '<div class="notice err">Seção de destino inválida: "' + esc(secao || "(vazia)") +
        '". Escolha uma das seções existentes do schema (' + esc(secoesValidas.join(", ") || "nenhuma") + ").</div>";
      return;
    }
    const lote = fbLote(docKey);
    const idsEfetivos = fbIdsExistentes(docKey);
    let id, entry, mutacao;
    if (idEditar) {
      id = idEditar;
      const e0 = lote[idEditar];
      const campoBase = e0 && !e0.excluir ? null : state.docData[docKey].flat.find(function (x) { return fbIdDeKey(x.key) === idEditar; });
      const labelAnterior = e0 && !e0.excluir ? e0.label : (campoBase || {}).label;
      const labelMudou = labelAnterior != null && labelAnterior !== nome;
      if (labelMudou) {
        // §10 — renomeação: NOVO id (gerado contra o estado efetivo), mesmo
        // conteúdo; o id antigo nunca é reaproveitado.
        const idsSemEle = Object.assign({}, idsEfetivos); delete idsSemEle[idEditar];
        id = slugCampoId(nome, idsSemEle);
        entry = novoCampoCustom(nome, { id: id, tipo: tipo, secao: secao, obrigatorio: $("fbObrig").value === "sim", pagina: $("fbPagina").value, x: $("fbX").value, y: $("fbY").value, largura: $("fbL").value, altura: $("fbA").value, opcoes: opcoes });
        entry.renomeadoDe = idEditar;
        mutacao = "renomear \"" + idEditar + "\" → \"" + id + "\" (rótulo: " + nome + ")";
      } else if (!e0 || e0.excluir) {
        // campo BASE sem mudança de rótulo — o Field Builder só altera rótulos
        // (coordenadas são do Editor Visual); nada a gravar.
        toast("Nenhuma mudança de rótulo — use o Editor Visual para ajustar coordenadas.");
        return;
      } else {
        // edição da própria entrada (sem renomeação): atualiza uma CÓPIA
        // (mutar antes da confirmação vazaria a entrada mesmo no cancelamento)
        entry = JSON.parse(JSON.stringify(e0));
        entry.label = nome; entry.tipo = tipo; entry.pagina = parseInt($("fbPagina").value, 10) || 1;
        entry.obrigatorio = $("fbObrig").value === "sim";
        entry.coordenadas = { x: Number($("fbX").value), y: Number($("fbY").value), largura: Number($("fbL").value), altura: Number($("fbA").value) };
        entry.secao = secao;
        if (opcoes) entry.opcoes = opcoes; else delete entry.opcoes;
        mutacao = "editar \"" + id + "\" (rótulo: " + nome + ")";
      }
    } else {
      // criação — ID estável gerado contra o estado efetivo (colisão → sufixo)
      id = slugCampoId(nome, idsEfetivos);
      entry = novoCampoCustom(nome, { id: id, tipo: tipo, secao: secao, obrigatorio: $("fbObrig").value === "sim", pagina: $("fbPagina").value, x: $("fbX").value, y: $("fbY").value, largura: $("fbL").value, altura: $("fbA").value, opcoes: opcoes });
      mutacao = "criar \"" + id + "\" (rótulo: " + nome + ")";
    }
    const v = validarCampoSchema(entry);
    if (v.erros.length) { $("fbDrawerAviso").innerHTML = '<div class="notice err">' + v.erros.map(esc).join("<br>") + "</div>"; return; }
    const avisoHtml = v.avisos.length ? '<div class="notice warn">' + v.avisos.map(esc).join("<br>") + "</div>" : "";
    const anterior = (state.overlay.campos_custom || {})[docKey] ? JSON.parse(JSON.stringify(state.overlay.campos_custom[docKey])) : null;
    if (idEditar && id !== idEditar && anterior) {
      // §10 — migra o patch de coordenadas do id antigo para o novo (o id é
      // estável, mas o caminho de patch herda a posição física do campo)
      if (anterior[DOCS[docKey].overlayKey] && anterior[DOCS[docKey].overlayKey][idEditar]) {
        anterior[DOCS[docKey].overlayKey][id] = anterior[DOCS[docKey].overlayKey][idEditar];
        delete anterior[DOCS[docKey].overlayKey][idEditar];
      }
    }
    const ok = await confirmModal("Field Builder — gravar operação",
      "<p>Operação: <strong>" + esc(mutacao) + "</strong></p>" +
      (id !== idEditar && idEditar ? "<p class='section-desc'>Um novo ID é gerado em renomeações — o antigo permanece no histórico (rastreabilidade de IDs estáveis).</p>" : "") +
      avisoHtml +
      "<p class='section-desc'>A gravação é local (overlay) e cria pendência para publicação. O JSON do repositório só muda na exportação — contrato “estrutura é código”.</p>",
      "Gravar");
    if (!ok) return;
    lote[id] = entry;
    fbReconstruirDoc(docKey);
    await persistOverlaySilencioso("field_builder", DOCS[docKey].label + " — " + id, { overlayKey: "campos_custom", chave: docKey, anterior: anterior }, mutacao);
    $("fbDrawer").hidden = true;
    renderFormDetail();
    renderDashboard();
    toast("Operação gravada: " + mutacao);
  }

  /** §10 — exclusão segura: bloqueada quando há dependencia apontando para o campo. */
  async function fbExcluirCampo(f, keyCurto) {
    const fSel = f || formDetailPorCodigo(state.formSel);
    if (!fSel || !fSel.docKey) return;
    const docKey = fSel.docKey;
    const base = state.docBase[docKey];
    const deps = base && base.campos ? coletarDependenciasSchema(base.campos, [], "") : [];
    const alvo = deps.filter(function (d) { return d.campoKey === keyCurto; });
    const v = validarExclusaoCampo(keyCurto, deps);
    const extra = alvo.length
      ? "<p>O campo é referenciado por <code>dependencia</code> em: " + alvo.map(function (d) { return "<code>" + esc(d.de) + "</code>"; }).join(", ") + ".</p>"
      : "";
    const msg = "<p>Excluir o campo <strong>" + esc(keyCurto) + "</strong> do schema de " + esc(DOCS[docKey].label) + "?</p>" + extra +
      (v.ok ? "<p class='section-desc'>A exclusão fica como pendência do overlay e pode ser desfeita (Histórico) até a publicação.</p>"
            : "<div class='notice err'>" + v.bloqueios.map(esc).join("<br>") + "</div>");
    const ok = await confirmModal("Excluir campo", msg, v.ok ? "Excluir" : null);
    if (!ok || !v.ok) return;
    const lote = fbLote(docKey);
    const anterior = JSON.parse(JSON.stringify(lote));
    lote[keyCurto] = { excluir: true };
    fbReconstruirDoc(docKey);
    await persistOverlaySilencioso("field_builder", DOCS[docKey].label + " — " + keyCurto, { overlayKey: "campos_custom", chave: docKey, anterior: anterior }, "excluir \"" + keyCurto + "\"");
    renderFormDetail();
    renderDashboard();
    toast("Exclusão gravada como pendência: " + keyCurto);
  }

  /** Remove a operação pendente (volta ao estado anterior do lote). */
  async function fbDesfazerOperacao(f, id) {
    const fSel = f || formDetailPorCodigo(state.formSel);
    if (!fSel || !fSel.docKey) return;
    const docKey = fSel.docKey;
    const lote = fbLote(docKey);
    if (!lote[id]) return;
    const anterior = JSON.parse(JSON.stringify(lote));
    delete lote[id];
    fbReconstruirDoc(docKey);
    await persistOverlaySilencioso("field_builder", DOCS[docKey].label + " — " + id, { overlayKey: "campos_custom", chave: docKey, anterior: anterior }, "desfeita operação sobre \"" + id + "\"");
    renderFormDetail();
    renderDashboard();
    toast("Operação desfeita: " + id);
  }

  function renderFdTemplate(f) {
    const box = $("fdTemplate");
    if (!box) return;
    if (!f.pdfFile) { box.innerHTML = '<div class="notice info">Sem template PDF — o documento é gerado programaticamente.</div>'; return; }
    const ent = (state.overlay.templates_versoes || {})[f.pdfFile];
    const atual = ent && ent.atual;
    box.innerHTML =
      '<div class="kv-list">' +
      '<div class="kv"><span class="k">Arquivo</span><span class="v">' + esc(f.pdfFile) + "</span></div>" +
      '<div class="kv"><span class="k">Versão atual</span><span class="v">' + (atual ? "v" + esc(atual.versao) + " — " + esc(atual.nome) + " · " + esc(atual.data) : "original do repositório (sem upload versionado)") + "</span></div>" +
      '<div class="kv"><span class="k">Rollback</span><span class="v">' + (ent && ent.anterior ? "v" + esc(ent.anterior.versao) + " disponível" : "—") + "</span></div>" +
      "</div>" +
      '<div class="editor-actions"><button type="button" class="btn secondary" id="fdSubstBtn">Enviar nova versão (upload)</button>' +
      (ent && ent.anterior ? '<button type="button" class="btn secondary" id="fdRollbackBtn">↩ Restaurar versão anterior</button>' : "") + "</div>";
    const sb = $("fdSubstBtn");
    if (sb) sb.onclick = function () {
      showSection("pdfs");
      $("substTemplate").value = f.pdfFile;
      $("substFile").focus();
      toast("Selecione o novo PDF e confirme a substituição — a versão anterior é preservada.");
    };
    const rb = $("fdRollbackBtn");
    if (rb) rb.onclick = function () { rollbackTemplate(f.pdfFile); };
  }

  function renderFdRegras(f) {
    const box = $("fdRegras");
    if (!box) return;
    const alvo = { "F-075": "ficha_cadastral", "F-089": "assistencia_medica" }[f.codigo];
    const html = REGRAS.filter(function (r) {
      if (alvo === "ficha_cadastral") return ["RN-PIS", "RN-BANCO", "RN-NAOOPTANTE", "RN-ASSINATURA", "RN-LGPD", "RN-COORD"].indexOf(r.id) !== -1;
      if (alvo === "assistencia_medica") return ["RN-PLANO", "RN-CIDADE", "RN-DEPENDENTES", "RN-ASSINATURA", "RN-LGPD"].indexOf(r.id) !== -1;
      return ["RN-LGPD"].indexOf(r.id) !== -1;
    }).map(function (r) {
      const badge = r.class === "configuravel"
        ? "<span class='badge editable'>✎ Editável</span>"
        : "<span class='badge readonly'>🔒 Somente leitura — código</span>";
      return '<div class="diff-line"><span class="path">' + esc(r.id) + " — " + esc(r.nome) + "</span> " + badge + "<br>" + esc(r.desc) + "</div>";
    }).join("");
    box.innerHTML = html || '<div class="notice info">Nenhuma regra mapeada para este formulário.</div>';
  }

  function renderFdCidades(f) {
    const box = $("fdCidades");
    if (!box) return;
    if (f.codigo !== "F-089") { box.innerHTML = '<div class="notice info">Associação regional aplica-se ao fluxo F-089 (Outros Planos): cidade → ficha regional.</div>'; return; }
    const porFicha = {};
    for (const r of state.cityArr) (porFicha[r.ficha] || (porFicha[r.ficha] = [])).push(r.cidade);
    box.innerHTML = Object.keys(porFicha).sort().map(function (ficha) {
      const arr = porFicha[ficha];
      return '<div class="diff-line"><span class="path">' + esc(ficha) + '</span> → ' + esc(FICHA_UTILIZAR_PARA_ARQUIVO[ficha] || "⚠ não mapeado") +
        " · " + arr.length + " cidade(s): " + esc(arr.slice(0, 6).join(", ")) + (arr.length > 6 ? ", …" : "") +
        " <a href='#' data-fd-ir-cidades>gerenciar</a></div>";
    }).join("");
    box.querySelectorAll("[data-fd-ir-cidades]").forEach(function (a) {
      a.addEventListener("click", function (ev) { ev.preventDefault(); showSection("cidades"); });
    });
  }

  async function renderFdHistorico(f) {
    const box = $("fdHistorico");
    if (!box) return;
    const todos = await eventosHistorico();
    const doForm = todos.filter(function (e) {
      const alvo = ((e.entidade || "") + " " + (e.alteracao || ""));
      return alvo.toLowerCase().indexOf(f.codigo.toLowerCase()) !== -1 ||
        (f.pdfFile && alvo.indexOf(f.pdfFile) !== -1);
    }).slice(0, 30);
    box.innerHTML = doForm.length
      ? doForm.map(function (e) {
        return '<div class="historico-item"><div class="h-data">' + esc(new Date(e.data).toLocaleString("pt-BR")) + "</div>" +
          '<span class="h-user">' + esc(e.usuario || "—") + "</span> · " + esc(e.acao || "") +
          (e.entidade ? " — <strong>" + esc(e.entidade) + "</strong>" : "") +
          (e.alteracao ? '<br><span style="color:var(--text-mid)">' + esc(e.alteracao) + "</span>" : "") + "</div>";
      }).join("")
      : '<div class="notice info">Nenhum evento registrado para este formulário ainda.</div>';
  }

  /** §8 — duplicar formulário: cria metadados de formulário no overlay (a
   *  estrutura/rota permanece no código — o clone é um registro administrativo). */
  async function duplicarFormulario(codigo) {
    const f = formDetailPorCodigo(codigo);
    if (!f) return;
    const valores = await formModal({
      title: "Duplicar formulário " + f.codigo,
      fields: [
        { key: "codigo", label: "Código do clone", type: "text", value: f.codigo + "-COPIA", required: true, help: "Registro administrativo — a rota/estrutura do formulário é definida no código." },
        { key: "nome", label: "Nome", type: "text", value: f.nome + " (cópia)", required: true }
      ],
      okLabel: "Duplicar"
    });
    if (!valores) return;
    const codigoNovo = valores.codigo.trim().toUpperCase().replace(/\s+/g, "-");
    if ((state.overlay.forms_meta || {})[codigoNovo]) { toast('Já existe um formulário com o código "' + codigoNovo + '".', false); return; }
    state.overlay.forms_meta[codigoNovo] = {
      clonadoDe: f.codigo, nome: valores.nome, criadoEm: new Date().toISOString(),
      template: f.pdfFile || ""
    };
    await persistOverlaySilencioso("criacao_formulario", codigoNovo,
      { overlayKey: "forms_meta", itens: [{ chave: codigoNovo, anterior: null }] },
      "clone administrativo de " + f.codigo + " (estrutura do original é definida no código)");
    renderDashboard();
    toast("Formulário duplicado como registro administrativo: " + codigoNovo);
  }

  function renderRegras() {
    const html = REGRAS.map(function (r) {
      // Tarefa 7 — selos consistentes em toda seção
      const badge = r.class === "configuravel"
        ? "<span class='badge editable'>✎ Editável</span>"
        : "<span class='badge readonly'>🔒 Somente leitura — código</span>";
      const nota = r.class === "configuravel" ? "" :
        " <em style='color:var(--text-light)'>(alterar depende de lógica implementada no código)</em>";
      return '<div class="diff-line"><span class="path">' + esc(r.id) + " — " + esc(r.nome) + "</span> " + badge +
        "<br>" + esc(r.desc) + nota + "</div>";
    }).join("");
    $("regrasPainel").innerHTML = html;
    // v3: o painel "Regras de negócio" dentro da lista de Formulários foi
    // substituído pelo detalhe com abas — regrasLista pode não existir.
    const rl = $("regrasLista");
    if (rl) rl.innerHTML = html;
    $("segLista").innerHTML = SEGURANCA.map(function (s) { return '<div class="diff-line">✓ ' + esc(s) + "</div>"; }).join("");
  }

  // ══════════════════════════════════════════════════════
  // INTEGRIDADE (seção Segurança — verificação completa, com rede)
  // ══════════════════════════════════════════════════════
  async function verificarIntegridade() {
    const box = $("integridadeResultado");
    box.innerHTML = '<div class="notice info">Verificando…</div>';
    // reutiliza o MESMO coletor da Saúde (T0) — modo completo, com rede
    const c = await coletarIntegridade(false);
    const cor = c.errN ? "err" : (c.warnN ? "warn" : "ok");
    const extra = state.cityArr.length + " cidade(s) mapeadas: " + (c.itens.some(function (i) { return i.texto.indexOf("ficha não mapeada") !== -1; }) ? "há pendências" : "todas com template existente");
    box.innerHTML = '<div class="notice ' + cor + '"><strong>Relatório de integridade:</strong><br>' +
      c.itens.map(function (i) { return (i.nivel === "err" ? "✕ " : "⚠ ") + i.texto; }).join("<br>") +
      (c.itens.length ? "<br>" : "") + "✓ " + extra + "</div>";
    state.integridadeCache = { quando: c.quando, itens: c.itens, okN: c.okN + 1, warnN: c.warnN, errN: c.errN };
    renderSaudeFromCache();
    await logEvento({ acao: "verificacao_integridade", entidade: "sistema", alteracao: "ok:" + c.okN + " warn:" + c.warnN + " err:" + c.errN });
  }

  // ══════════════════════════════════════════════════════
  // TAREFA 5 — DADOS: EXPORT / IMPORT (com diff) / BACKUP
  // ══════════════════════════════════════════════════════
  async function exportarConfig() {
    const payload = {
      admin_config_v1: true,
      admin_config_v3: true,
      gerado_em: new Date().toISOString(),
      usuario: (global.atentoAdminEmail && global.atentoAdminEmail()) || "",
      overlay: exportarOverlayPuro()
    };
    const data = new Date().toISOString().slice(0, 10);
    global.AdminPersistence.baixarJSON(payload, "admin-config-" + data + ".json");
    await logEvento({ acao: "exportacao", entidade: "config administrativa", alteracao: "download JSON" });
    toast("Exportação gerada.");
  }

  /** Diff de um valor "de → para" em texto curto. */
  function resumoValor(v) {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }

  /** Tarefa 5 — diff por chave entre overlay importado e o atual.
   *  Retorna {novos:[{k,v}], alterados:[{k,de,para}], identicos:n} por overlayKey. */
  function diffOverlayMaps(atualMap, novoMap) {
    const novos = [], alterados = [];
    let identicos = 0;
    const chaves = Object.keys(novoMap || {});
    for (const k of chaves) {
      const a = atualMap[k], n = novoMap[k];
      if (!a) novos.push({ k: k, v: n });
      else if (resumoValor(a) !== resumoValor(n)) alterados.push({ k: k, de: a, para: n });
      else identicos++;
    }
    return { novos: novos, alterados: alterados, identicos: identicos, total: chaves.length };
  }

  function diffImportacao(o) {
    const atual = state.overlay;
    return {
      campos_ficha: diffOverlayMaps(atual.campos_ficha || {}, o.campos_ficha || {}),
      campos_declaracao: diffOverlayMaps(atual.campos_declaracao || {}, o.campos_declaracao || {}),
      cidades: diffOverlayMaps(atual.cidades || {}, o.cidades || {}),
      pdfs_meta: diffOverlayMaps(atual.pdfs_meta || {}, o.pdfs_meta || {}),
      forms_meta: diffOverlayMaps(atual.forms_meta || {}, o.forms_meta || {}),
      templates_versoes: diffOverlayMaps(atual.templates_versoes || {}, o.templates_versoes || {}),
      configuracoes: diffOverlayMaps(atual.configuracoes || {}, o.configuracoes || {}),
      campos_custom: diffOverlayMaps(atual.campos_custom || {}, o.campos_custom || {}),
      cidades_novas: (function () {
        const existentes = {};
        for (const n of (atual.cidades_novas || [])) existentes[normalizarChaveCidade(n.cidade)] = n;
        const novos = [], duplicados = [];
        for (const n of (o.cidades_novas || [])) {
          const k = normalizarChaveCidade(n.cidade);
          // duplicada se já existe no overlay OU na base efetiva (cityMap:
          // JSON + overlay) — evita criar linha duplicada na tabela
          if (existentes[k] || state.cityMap[k]) duplicados.push(n);
          else novos.push(n);
        }
        return { novos: novos, duplicados: duplicados };
      })()
    };
  }

  async function importarConfig(file) {
    try {
      const json = await global.AdminPersistence.lerArquivoJSON(file);
      if (!json || json.admin_config_v1 !== true || !json.overlay) {
        $("importPreview").innerHTML = '<div class="notice err">Estrutura inválida — esperado arquivo exportado por este painel (admin_config_v1). Nada foi alterado.</div>';
        return;
      }
      const o = json.overlay;
      const d = diffImportacao(o);
      const nTotalNovos = d.campos_ficha.novos.length + d.campos_declaracao.novos.length + d.cidades.novos.length + d.pdfs_meta.novos.length + d.cidades_novas.novos.length + d.forms_meta.novos.length + d.templates_versoes.novos.length + d.configuracoes.novos.length + d.campos_custom.novos.length;
      const nTotalAlt = d.campos_ficha.alterados.length + d.campos_declaracao.alterados.length + d.cidades.alterados.length + d.pdfs_meta.alterados.length + d.forms_meta.alterados.length + d.templates_versoes.alterados.length + d.configuracoes.alterados.length + d.campos_custom.alterados.length;

      // ── Tarefa 5 — diff campo a campo com checkboxes (marcados por padrão) ──
      const rotulos = { campos_ficha: "Coordenadas F-075", campos_declaracao: "Coordenadas Declaração", cidades: "Patches de cidade", pdfs_meta: "Metadados de PDF", forms_meta: "Metadados de formulários", templates_versoes: "Versões de templates", configuracoes: "Configurações", campos_custom: "Campos do Field Builder (§10)" };
      function blocoMap(key) {
        const dd = d[key];
        if (!dd.total) return "";
        let html = "<h4 style='margin:10px 0 4px;font-size:12.5px'>" + rotulos[key] + " (" + dd.total + ")</h4>";
        const item = function (ck, val, marcado, label) {
          return "<div class='diff-line'><label style='display:flex;gap:8px;align-items:flex-start;cursor:pointer'>" +
            "<input type='checkbox' data-imp='" + key + "|" + esc(ck) + "'" + (marcado ? " checked" : "") + "> <span>" + label + "</span></label></div>";
        };
        for (const n of dd.novos) html += item(n.k, n.v, true, "<span class='path'>" + esc(n.k) + "</span> <span class='new'>novo</span> — " + esc(resumoValor(n.v)));
        for (const a of dd.alterados) html += item(a.k, a.para, true, "<span class='path'>" + esc(a.k) + "</span> <span class='old'>" + esc(resumoValor(a.de)) + "</span> → <span class='new'>" + esc(resumoValor(a.para)) + "</span>");
        if (dd.identicos) html += "<details style='margin:6px 0'><summary style='font-size:11.5px;color:var(--text-light);cursor:pointer'>" + dd.identicos + " idêntico(s) (recolhidos — não alteram nada)</summary></details>";
        return html;
      }
      let html = "<div class='notice warn'><strong>Diff da importação:</strong> " + nTotalNovos + " novo(s) · " + nTotalAlt + " alterado(s). Desmarque o que NÃO deve ser aplicado.</div>";
      html += blocoMap("campos_ficha") + blocoMap("campos_declaracao") + blocoMap("cidades") + blocoMap("pdfs_meta") + blocoMap("forms_meta") + blocoMap("templates_versoes") + blocoMap("configuracoes") + blocoMap("campos_custom");
      if (d.cidades_novas.novos.length || d.cidades_novas.duplicados.length) {
        html += "<h4 style='margin:10px 0 4px;font-size:12.5px'>Cidades novas (" + d.cidades_novas.novos.length + " novas · " + d.cidades_novas.duplicados.length + " já existentes)</h4>";
        for (const n of d.cidades_novas.novos) {
          html += "<div class='diff-line'><label style='display:flex;gap:8px;align-items:flex-start;cursor:pointer'>" +
            "<input type='checkbox' data-imp='cidades_novas|" + esc(normalizarChaveCidade(n.cidade)) + "' checked> <span><span class='path'>" + esc(n.cidade) + " (" + esc(n.uf) + ")</span> <span class='new'>nova</span> → " + esc(n.ficha || "—") + "</span></label></div>";
        }
        if (d.cidades_novas.duplicados.length) html += "<div class='diff-line' style='color:var(--text-light)'>" + d.cidades_novas.duplicados.length + " cidade(s) já existente(s) no overlay atual — não serão reimportadas.</div>";
      }
      html += '<button type="button" class="btn" id="btnImportOk" style="margin-top:12px">Aplicar selecionadas</button>';
      $("importPreview").innerHTML = html;

      $("btnImportOk").addEventListener("click", comLoading($("btnImportOk"), async function () {
        const marcados = Array.from(document.querySelectorAll("input[data-imp]:checked")).map(function (c) { return c.getAttribute("data-imp"); });
        if (!marcados.length) { toast("Nenhum item selecionado — nada foi aplicado.", false); return; }
        const ok = await confirmModal("Aplicar importação",
          "<p>Serão aplicados <strong>" + marcados.length + " item(ns)</strong> selecionados. Itens desmarcados permanecem como estão.</p>", "Aplicar");
        if (!ok) return;

        // aplica apenas o que continuar marcado, mesclando no overlay atual
        const destinos = { campos_ficha: {}, campos_declaracao: {}, cidades: {}, pdfs_meta: {}, forms_meta: {}, templates_versoes: {}, configuracoes: {}, campos_custom: {} };
        const novasSelecionadas = new Set();
        for (const m of marcados) {
          const pipe = m.indexOf("|");
          const grupo = m.slice(0, pipe), chave = m.slice(pipe + 1);
          if (grupo === "cidades_novas") { novasSelecionadas.add(chave); continue; }
          const n = (o[grupo] || {})[chave];
          if (n) destinos[grupo][chave] = n;
        }
        state.overlay = {
          campos_ficha: Object.assign({}, state.overlay.campos_ficha, destinos.campos_ficha),
          campos_declaracao: Object.assign({}, state.overlay.campos_declaracao, destinos.campos_declaracao),
          cidades: Object.assign({}, state.overlay.cidades, destinos.cidades),
          cidades_novas: (state.overlay.cidades_novas || []).concat((o.cidades_novas || []).filter(function (n) { return novasSelecionadas.has(normalizarChaveCidade(n.cidade)); })),
          pdfs_meta: Object.assign({}, state.overlay.pdfs_meta, destinos.pdfs_meta),
          forms_meta: Object.assign({}, state.overlay.forms_meta, destinos.forms_meta),
          templates_versoes: Object.assign({}, state.overlay.templates_versoes, destinos.templates_versoes),
          configuracoes: Object.assign({}, state.overlay.configuracoes, destinos.configuracoes),
          campos_custom: Object.assign({}, state.overlay.campos_custom, destinos.campos_custom)
        };
        for (const key of Object.keys(DOCS)) applyOverlayToDoc(key, state.docData[key].json);
        applyCidadesOverlay(); rebuildCityMap();
        await persistOverlaySilencioso("importacao", file.name, null, marcados.length + " item(ns) aplicados de " + file.name + " (" + nTotalNovos + " novos, " + nTotalAlt + " alterados no diff)");
        renderDashboard(); renderPdfs($("pdfSearch").value); renderCidades(); renderAssistMap();
        $("importPreview").innerHTML = '<div class="notice ok">Importação aplicada: ' + marcados.length + " item(ns).</div>";
      }));
    } catch (e) {
      $("importPreview").innerHTML = '<div class="notice err">' + esc(e.message) + "</div>";
    }
  }

  async function renderDados() {
    const el = $("dadosModo");
    if (state.modo === "api") {
      el.className = "notice ok";
      el.textContent = "Modo API ativo — gravação no servidor com backup automático a cada salvamento.";
      const lista = await global.AdminPersistence.listarBackups();
      $("backupLista").innerHTML = lista.length
        ? lista.map(function (b) { return '<div class="diff-line">📦 ' + esc(b.nome || b.id) + (b.data ? ' <span style="color:var(--text-light)">' + esc(b.data) + "</span>" : "") + "</div>"; }).join("")
        : "Nenhum backup ainda — será criado no primeiro salvamento.";
    } else {
      el.className = "notice warn";
      el.textContent = "Modo exportação — sem API neste ambiente. Alterações vivem no overlay da sessão; use Exportar JSON e versione no repositório.";
      $("backupLista").textContent = "Backups no servidor indisponíveis neste modo. Use a exportação JSON como backup local.";
    }
  }

  // ══════════════════════════════════════════════════════
  // TAREFA 6 — HISTÓRICO (filtros + desfazer append-only)
  // ══════════════════════════════════════════════════════
  async function logEvento(ev) {
    const registro = Object.assign({
      data: new Date().toISOString(),
      usuario: (global.atentoAdminEmail && global.atentoAdminEmail()) || ""
    }, ev);
    state.historicoLocal.unshift(registro);
    await global.AdminPersistence.registrarEvento(registro);
  }

  /** Todos os eventos (remotos + locais) ordenados do mais recente. */
  async function eventosHistorico() {
    let remotos = null;
    if (state.modo === "api") remotos = await global.AdminPersistence.carregarHistorico();
    return (remotos && Array.isArray(remotos.eventos) ? remotos.eventos.slice() : [])
      .concat(state.historicoLocal)
      .sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
  }

  async function renderHistorico() {
    const el = $("histLista");
    const todos = await eventosHistorico();

    // popula selects de ação e usuário (uma vez por render — mantém seleção)
    const acaoSel = $("histAcao"), userSel = $("histUsuario");
    const acaoAtual = acaoSel.value, userAtual = userSel.value;
    const acoes = Array.from(new Set(todos.map(function (e) { return e.acao || ""; }).filter(Boolean))).sort();
    const usuarios = Array.from(new Set(todos.map(function (e) { return e.usuario || ""; }).filter(Boolean))).sort();
    acaoSel.innerHTML = '<option value="">Ação: todas</option>' + acoes.map(function (a) { return '<option value="' + esc(a) + '"' + (a === acaoAtual ? " selected" : "") + ">" + esc(a) + "</option>"; }).join("");
    userSel.innerHTML = '<option value="">Usuário: todos</option>' + usuarios.map(function (u) { return '<option value="' + esc(u) + '"' + (u === userAtual ? " selected" : "") + ">" + esc(u) + "</option>"; }).join("");

    // ── filtros aplicados ANTES do corte de 200 itens (regra §5 T6) ──
    const q = ($("histBusca").value || "").toLowerCase().trim();
    const fAcao = acaoSel.value, fUser = userSel.value;
    const filtrados = todos.filter(function (e) {
      if (fAcao && e.acao !== fAcao) return false;
      if (fUser && (e.usuario || "") !== fUser) return false;
      if (q) {
        const alvo = ((e.entidade || "") + " " + (e.alteracao || "")).toLowerCase();
        if (alvo.indexOf(q) === -1) return false;
      }
      return true;
    });

    $("histContagem").textContent = filtrados.length + " evento(s) exibido(s)" + (filtrados.length !== todos.length ? " (de " + todos.length + " no total)" : "") + " — últimos " + Math.min(200, filtrados.length);

    el.innerHTML = filtrados.length
      ? filtrados.slice(0, 200).map(function (e) {
          const d = new Date(e.data);
          const podeDesfazer = !!e.reverso;
          return '<div class="historico-item"><div class="h-data">' + esc(d.toLocaleString("pt-BR")) + "</div>" +
            '<span class="h-user">' + esc(e.usuario || "—") + "</span> · " + esc(e.acao || "") +
            (e.entidade ? " — <strong>" + esc(e.entidade) + "</strong>" : "") +
            (e.alteracao ? '<br><span style="color:var(--text-mid)">' + esc(e.alteracao) + "</span>" : "") +
            '<div class="h-actions">' +
            (podeDesfazer
              ? '<button type="button" class="btn small secondary" data-undo="' + esc(String(e.data)) + '">↩ Desfazer</button>'
              : '<button type="button" class="btn small secondary" data-ir="' + esc(String(e.data)) + '" title="Este evento não guarda reverso automático — navega para o registro correspondente para reversão manual (não é undo automático).">Ir para o registro</button>') +
            "</div></div>";
        }).join("")
      : '<div class="notice info">Nenhum evento corresponde aos filtros' + (todos.length ? "" : (state.modo === "api" ? " ou servidor." : " (modo exportação não persiste histórico).")) + "</div>";

    el.querySelectorAll("button[data-undo]").forEach(function (b) {
      b.addEventListener("click", async function () {
        const ev = filtrados.find(function (x) { return String(x.data) === b.getAttribute("data-undo"); });
        if (ev) desfazerEvento(ev);
      });
    });
    el.querySelectorAll("button[data-ir]").forEach(function (b) {
      b.addEventListener("click", function () {
        const ev = filtrados.find(function (x) { return String(x.data) === b.getAttribute("data-ir"); });
        if (ev) irParaRegistro(ev);
      });
    });
  }

  /** Roteia o usuário para a tela/registro do evento (undo manual — NÃO é
   *  undo automático; explicito por evento sem `reverso`, §5 T6). */
  function irParaRegistro(ev) {
    const a = ev.acao || "";
    if (a.indexOf("cidade") !== -1) showSection("cidades");
    else if (a.indexOf("coordenada") !== -1 || a.indexOf("campo") !== -1) showSection("coordenadas");
    else if (a.indexOf("pdf") !== -1) showSection("pdfs");
    else if (a.indexOf("import") !== -1 || a.indexOf("export") !== -1) showSection("dados");
    else showSection("historico");
    toast("Navegação manual (não é undo automático): " + (ev.acao || "evento") + " — " + (ev.entidade || ""));
  }

  /**
   * Tarefa 6 — desfazer APPEND-ONLY: o evento original NUNCA é apagado.
   * Aplica o `reverso` e cria um NOVO evento (acao: 'desfazer') com o seu
   * próprio reverso — permitindo desfazer o desfazer e preservando a trilha
   * completa (v1 → v2 → v3 → v4=restauração de v2).
   */
  async function desfazerEvento(ev) {
    const rev = ev.reverso;
    if (!rev) { irParaRegistro(ev); return; }
    const ok = await confirmModal("Desfazer evento",
      "<p>Evento: <strong>" + esc(ev.acao || "") + "</strong>" + (ev.entidade ? " — " + esc(ev.entidade) : "") + "</p>" +
      "<p>O valor anterior será aplicado e um <strong>novo</strong> evento de desfazer será registrado. O evento original permanece no histórico (trilha completa preservada).</p>",
      "Desfazer");
    if (!ok) return;

    const itens = rev.multi || [rev];
    const aplicados = [];
    for (const item of itens) {
      if (!item || !item.anterior || item.anterior.__vazio) continue;
      if (item.overlayKey === "cidades_novas") {
        const nova = (state.overlay.cidades_novas || []).find(function (n) { return "n" + n.id === item.chave; });
        if (nova) {
          // restauração total se o anterior era a entrada completa (remoção), senão merge campo a campo
          if (item.anterior.cidade != null) Object.assign(nova, item.anterior);
          else for (const p of Object.keys(item.anterior)) nova[p] = item.anterior[p];
          aplicados.push("cidades_novas:" + item.chave);
        }
      } else if (item.overlayKey === "pdfs_meta") {
        const meta = state.overlay.pdfs_meta || (state.overlay.pdfs_meta = {});
        meta[item.chave] = Object.assign({}, item.anterior);
        aplicados.push("pdfs_meta:" + item.chave);
      } else if (rev.overlayKey === "campos_ficha" || rev.overlayKey === "campos_declaracao" || item.overlayKey === "campos_ficha" || item.overlayKey === "campos_declaracao") {
        const k = rev.overlayKey || item.overlayKey;
        const map = state.overlay[k];
        if (map) {
          map[item.chave] = Object.assign({}, map[item.chave], item.anterior);
          const docKey = k === "campos_ficha" ? "ficha_cadastral" : "declaracao_plano_saude";
          if (state.docData[docKey]) applyOverlayToDoc(docKey, state.docData[docKey].json);
          aplicados.push(k + ":" + item.chave);
        }
      } else if (item.overlayKey === "cidades" || rev.overlayKey === "cidades") {
        const map = state.overlay.cidades;
        if (map) {
          // patch vazio (anterior de uma criação) = remover o patch
          if (!Object.keys(item.anterior).length) delete map[item.chave];
          else map[item.chave] = Object.assign({}, item.anterior);
          aplicados.push("cidades:" + item.chave);
        }
      } else if (item.overlayKey === "forms_meta" || item.overlayKey === "configuracoes" || item.overlayKey === "templates_versoes" || item.overlayKey === "campos_custom") {
        // v3 — chaves novas seguem o mesmo padrão append-only de pdfs_meta
        // (campos_custom: substituição TOTAL do lote — não merge — pois é uma
        // entidade por docKey, e undo de criação = anterior null → delete)
        const map = state.overlay[item.overlayKey] || (state.overlay[item.overlayKey] = {});
        if (item.anterior == null) delete map[item.chave];
        else map[item.chave] = Object.assign({}, item.anterior);
        const docKeyC = item.overlayKey === "campos_custom" ? item.chave : null;
        if (docKeyC && state.docData[docKeyC]) fbReconstruirDoc(docKeyC);
        aplicados.push(item.overlayKey + ":" + item.chave);
      }
    }
    if (!aplicados.length) {
      // reverso vazio (ex.: criação sem valor anterior) — remove o que foi criado
      for (const item of itens) {
        if (item.overlayKey === "cidades" && state.overlay.cidades[item.chave] != null) { delete state.overlay.cidades[item.chave]; aplicados.push("cidades:" + item.chave + " (removido)"); }
        if (item.overlayKey === "pdfs_meta" && state.overlay.pdfs_meta[item.chave] != null) { delete state.overlay.pdfs_meta[item.chave]; aplicados.push("pdfs_meta:" + item.chave + " (removido)"); }
      }
    }
    if (!aplicados.length) { toast("Não foi possível reverter este evento automaticamente — use \"Ir para o registro\" para reversão manual.", false); return; }

    // novo evento 'desfazer' com o SEU reverso (estado atual = valor revertido-para)
    const reversoDoUndo = { overlayKey: rev.overlayKey, multi: itens.map(function (item) {
      let atual = null;
      if (item.overlayKey === "cidades_novas") {
        const nova = (state.overlay.cidades_novas || []).find(function (n) { return "n" + n.id === item.chave; });
        atual = nova ? Object.assign({}, nova) : null;
      } else if (item.overlayKey === "pdfs_meta") {
        atual = state.overlay.pdfs_meta ? state.overlay.pdfs_meta[item.chave] : null;
      } else if (item.overlayKey === "cidades") {
        atual = state.overlay.cidades[item.chave];
      } else {
        const k = item.overlayKey || rev.overlayKey;
        atual = state.overlay[k] ? state.overlay[k][item.chave] : null;
      }
      return { chave: item.chave, anterior: atual, overlayKey: item.overlayKey || rev.overlayKey };
    }) };

    try {
      await global.AdminPersistence.salvarOverlay(state.overlay);
      await logEvento({
        acao: "desfazer",
        entidade: "desfez: " + (ev.acao || "") + (ev.entidade ? " — " + ev.entidade : ""),
        alteracao: "revertido: " + aplicados.join(", "),
        reverso: reversoDoUndo
      });
    } catch (e) {
      toast("Falha ao persistir o desfazer: " + e.message, false);
      return;
    }
    renderDashboard(); renderPdfs($("pdfSearch").value); renderCidades(); renderAssistMap();
    renderHistorico();
    toast("Evento desfeito — trilha completa preservada no Histórico.");
  }

  // ══════════════════════════════════════════════════════
  // v3 — COMMAND PALETTE (§28): Ctrl+K — busca global de entidades
  // ══════════════════════════════════════════════════════
  /** Índice de busca: formulários, cidades, templates, campos e seções. */
  function construirIndiceBusca() {
    const itens = [];
    for (const f of FORMULARIOS) itens.push({ tipo: "Formulário", titulo: f.nome, sub: f.rota + " · " + f.codigo, acao: function () { showSection("formularios"); abrirFormDetail(f.codigo); } });
    for (const p of pdfsEfetivos()) itens.push({ tipo: "Template", titulo: p.arquivo, sub: p.tipo + " · " + p.formulario, acao: function () { showSection("pdfs"); $("pdfSearch").value = p.arquivo; renderPdfs(p.arquivo); } });
    for (const r of state.cityArr) itens.push({ tipo: "Cidade", titulo: r.cidade, sub: (r.uf || "—") + " · " + r.ficha, acao: function () { showSection("cidades"); $("cidSearch").value = r.cidade; state.cidadesPagina = 1; renderCidades(); } });
    for (const key of Object.keys(DOCS)) {
      const dd = state.docData[key];
      if (!dd) continue;
      for (const c of dd.flat.slice(0, 400)) {
        itens.push({ tipo: "Campo", titulo: c.label, sub: DOCS[key].label + " · " + c.key, acao: function () { irParaCampo(key, c); } });
      }
    }
    const secoes = [
      ["dashboard", "Visão Geral"], ["formularios", "Formulários"], ["pdfs", "Templates"],
      ["coordenadas", "Editor Visual"], ["cidades", "Cidades & Regionais"], ["configuracoes", "Configurações"],
      ["validacao", "Validação"], ["historico", "Histórico"], ["seguranca", "Segurança"],
      ["dados", "Dados & Backups"], ["regras", "Regras"], ["assistencia", "Assistência"], ["sistema", "Sistema"]
    ];
    for (const s of secoes) itens.push({ tipo: "Seção", titulo: s[1], sub: "navegar", acao: function () { showSection(s[0]); } });
    return itens;
  }

  /** Busca por termo (título e subtítulo, sem acento, case-insensitive). */
  function buscarIndice(itens, q) {
    const norm = function (s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
    const t = norm(q).trim();
    if (!t) return itens.slice(0, 12);
    return itens.filter(function (i) { return norm(i.titulo).indexOf(t) !== -1 || norm(i.sub).indexOf(t) !== -1; }).slice(0, 12);
  }

  function instalarCommandPalette() {
    const ov = $("cmdkOverlay"), input = $("cmdkInput"), res = $("cmdkResults");
    if (!ov || !input || !res) return;
    function abrir() {
      ov.classList.add("show");
      ov.setAttribute("aria-hidden", "false");
      input.value = "";
      render("");
      input.focus();
    }
    // dica permanente de descoberta (§28/§29)
    const hint = $("cmdkHint");
    if (hint) { hint.textContent = "Ctrl + K para buscar"; hint.hidden = false; }
    function fechar() {
      ov.classList.remove("show");
      ov.setAttribute("aria-hidden", "true");
    }
    function render(q) {
      const achados = buscarIndice(construirIndiceBusca(), q);
      res.innerHTML = achados.map(function (i, idx) {
        return '<button type="button" role="option" class="cmdk-item' + (idx === 0 ? " sel" : "") + '">' +
          '<span class="ck">' + esc(i.tipo) + "</span><span><strong>" + esc(i.titulo) + '</strong><br><span class="ct">' + esc(i.sub) + "</span></span></button>";
      }).join("");
      res.querySelectorAll(".cmdk-item").forEach(function (b, idx) {
        b.addEventListener("click", function () { fechar(); achados[idx].acao(); });
      });
      res._primeira = achados[0] || null;
    }
    document.addEventListener("keydown", function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "k" || ev.key === "K")) {
        ev.preventDefault();
        ov.classList.contains("show") ? fechar() : abrir();
      } else if (ev.key === "Escape" && ov.classList.contains("show")) {
        fechar();
      }
    });
    input.addEventListener("input", function () { render(this.value); });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        if (res._primeira) { fechar(); res._primeira.acao(); }
      }
    });
  }

  function renderSistema() {
    $("sisModo").innerHTML = state.modo === "api"
      ? "API administrativa ativa (" + esc(state.origem) + "). Configurações gravadas em <code>data/admin-config.json</code> com backups automáticos em <code>data/backups/</code>."
      : "Produção estática — modo exportação. A aplicação pública lê os JSONs do repositório; para efetivar alterações, exporte o JSON e versione-o. Para gravação direta, disponibilize a API <code>/api/admin/*</code> (implementada em <code>scripts/test-server.mjs</code> e pronta para serverless).";
    $("sisSobre").innerHTML = "Painel Administrativo — Formulários de Admissão.<br>" +
      "Leitura de dados: JSONs reais do repositório.<br>" +
      "Templates PDF: " + PDFS.length + " em uso.<br>" +
      "Persistência: overlay administrativo (nunca os JSONs originais; nunca localStorage).<br>" +
      "Proteção: client-side, mesmo padrão do guard.js — ver seção Segurança.";
  }

  // ══════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════
  async function init() {
    try {
      await carregarTudo();
    } catch (e) {
      toast("Falha ao carregar configurações: " + e.message, false);
    }
    const email = (global.atentoAdminEmail && global.atentoAdminEmail()) || "";
    $("adminUserEmail").textContent = email;
    await logEvento({ acao: "login", entidade: "painel administrativo", alteracao: state.modo === "api" ? "modo API" : "modo exportação" });

    renderDashboard(); renderPdfs(); renderFormularios(); renderRegras(); renderAssistMap(); renderCidades();

    // navegação
    document.querySelectorAll(".admin-side button").forEach(function (b) {
      b.addEventListener("click", function () { showSection(b.getAttribute("data-section")); });
    });

    // PDFs
    $("pdfSearch").addEventListener("input", function () { renderPdfs(this.value); });
    $("btnUploadPdf").addEventListener("click", function () { $("pdfUploadInput").click(); });
    $("pdfUploadInput").addEventListener("change", function () { fazerUpload(this, null); this.value = ""; });
    $("btnSubstPdf").addEventListener("click", function () { fazerUpload($("substFile"), $("substTemplate").value); });

    // Editor
    const edDoc = $("edDoc");
    edDoc.addEventListener("change", async function () {
      $("edSave").disabled = true; $("edCancel").disabled = true; $("edRestore").disabled = true;
      try { await loadDocForEditor(edDoc.value); } catch (e) { toast("Falha ao carregar template: " + e.message, false); }
    });
    $("edPage").addEventListener("change", function () {
      state.docData[edDoc.value].page = parseInt(this.value, 10) || 1;
      renderEditorPage(edDoc.value);
    });
    $("edBuscaCampo").addEventListener("input", function () { atualizarListaCampos(edDoc.value); });
    $("edRestore").addEventListener("click", function () { restaurarCampo(edDoc.value); });
    $("edX").addEventListener("input", function () { const f = state.docData[edDoc.value].sel; if (!f) return; f.coords.x = round1(parseFloat(this.value) || 0); syncBox(f, edDoc.value); });
    $("edY").addEventListener("input", function () { const f = state.docData[edDoc.value].sel; if (!f) return; f.coords.y = round1(parseFloat(this.value) || 0); syncBox(f, edDoc.value); });
    $("edL").addEventListener("input", function () { const f = state.docData[edDoc.value].sel; if (!f) return; f.coords.largura = round1(parseFloat(this.value) || 0); syncBox(f, edDoc.value); });
    $("edA").addEventListener("input", function () { const f = state.docData[edDoc.value].sel; if (!f) return; f.coords.altura = round1(parseFloat(this.value) || 0); syncBox(f, edDoc.value); });
    $("edSave").addEventListener("click", function () { saveDocEdits(edDoc.value); });
    $("edCancel").addEventListener("click", async function () {
      const st = state.docData[edDoc.value];
      for (const f of st.flat) Object.assign(f.coords, f.origCoords, state.overlay[DOCS[edDoc.value].overlayKey][f.key] || {});
      // origCoords é o original; para restaurar o overlay aplicado, recarrega overlay:
      for (const f2 of st.flat) {
        const patch = state.overlay[DOCS[edDoc.value].overlayKey][f2.key];
        if (patch) { for (const p of ["x", "y", "largura", "altura"]) { if (p in patch) f2.coords[p] = patch[p]; } }
      }
      st.dirty = false; updatePendingList(edDoc.value); atualizarListaCampos(edDoc.value);
      $("edRestore").disabled = true;
      renderEditorPage(edDoc.value);
      $("edSave").disabled = true; $("edCancel").disabled = true;
      toast("Alterações não salvas foram descartadas.");
    });
    $("edTestPreview").addEventListener("click", function () { previewTeste(edDoc.value); });
    $("edGoCampos").addEventListener("click", function () { showSection("coordenadas"); toast("Use a busca de campos (lista lateral) para localizar e selecionar."); });

    // Cidades
    $("cidSearch").addEventListener("input", function () { state.cidadesPagina = 1; renderCidades(); }); // reset pág. 1 a cada filtro (T2.3)
    $("cidUfFilter").addEventListener("change", function () { state.cidadesPagina = 1; renderCidades(); });
    $("cidFichaFilter").addEventListener("change", function () { state.cidadesPagina = 1; renderCidades(); });
    $("btnNovaCidade").addEventListener("click", function () { $("cidFormPanel").hidden = !$("cidFormPanel").hidden; });
    $("cidSalvar").addEventListener("click", adicionarCidade);
    $("cidCancelar").addEventListener("click", function () { $("cidFormPanel").hidden = true; });
    $("btnBulkAplicar").addEventListener("click", function () { aplicarBulk(); });
    $("btnBulkLimpar").addEventListener("click", function () { state.cidadesSelecao = {}; renderCidades(); });
    $("btnImportCidades").addEventListener("click", function () { $("cidImportFile").click(); });
    $("cidImportFile").addEventListener("change", function () { if (this.files[0]) importarCidadesFile(this.files[0]); this.value = ""; });

    // Segurança / integridade
    $("btnIntegridade").addEventListener("click", comLoading($("btnIntegridade"), verificarIntegridade));

    // Dados
    $("btnExport").addEventListener("click", comLoading($("btnExport"), exportarConfig));
    $("importFile").addEventListener("change", function () { if (this.files[0]) importarConfig(this.files[0]); });

    // Histórico (Tarefa 6 — filtros)
    $("histBusca").addEventListener("input", renderHistorico);
    $("histAcao").addEventListener("change", renderHistorico);
    $("histUsuario").addEventListener("change", renderHistorico);

    // Formulários (v3)
    $("formSearch").addEventListener("input", function () { renderFormularios(); });
    $("fdVoltar").addEventListener("click", function () { state.formSel = null; renderFormDetail(); });
    $("fdEditar").addEventListener("click", async function () {
      const f = formDetailPorCodigo(state.formSel);
      if (!f) return;
      const valores = await formModal({
        title: "Editar metadados de " + f.codigo,
        fields: [{ key: "rotulo", label: "Nome de exibição", type: "text", value: (state.overlay.forms_meta[f.codigo] || {}).nome || f.nome, maxLength: 120 }],
        okLabel: "Salvar"
      });
      if (!valores) return;
      const anterior = state.overlay.forms_meta[f.codigo] || null;
      state.overlay.forms_meta[f.codigo] = Object.assign({}, anterior, { nome: valores.rotulo });
      await persistOverlaySilencioso("edicao_formulario", f.codigo,
        { overlayKey: "forms_meta", itens: [{ chave: f.codigo, anterior: anterior }] },
        "nome: \"" + (anterior && anterior.nome || f.nome) + "\" → \"" + valores.rotulo + "\"");
      renderFormDetail(); renderDashboard();
      toast("Metadados do formulário atualizados.");
    });
    $("fdTestar").addEventListener("click", async function () {
      const f = formDetailPorCodigo(state.formSel);
      if (!f) return;
      if (!f.docKey) { window.open(f.rota, "_blank"); return; }
      showSection("coordenadas");
      const sel = $("edDoc");
      if (sel.value !== f.docKey) { sel.value = f.docKey; try { await loadDocForEditor(f.docKey); } catch (e) { toast("Falha ao carregar template: " + e.message, false); } }
      previewTeste(f.docKey);
    });
    $("fdDuplicar").addEventListener("click", function () { duplicarFormulario(state.formSel); });
    document.querySelectorAll("#formDetail .tabs button").forEach(function (b) {
      b.addEventListener("click", function () { state.formTab = b.getAttribute("data-tab"); renderFormDetail(); });
    });
    $("fdIrLayout").addEventListener("click", function () {
      const f = formDetailPorCodigo(state.formSel);
      if (!f || !f.docKey) return;
      showSection("coordenadas");
      const sel = $("edDoc");
      if (sel.value !== f.docKey) { sel.value = f.docKey; loadDocForEditor(f.docKey).catch(function (e) { toast("Falha ao carregar template: " + e.message, false); }); }
    });

    // Templates (v3) — versões
    renderVersoesTemplates();

    // Editor (v3) — snap/atalhos/palette/submenu
    instalarSubmenu();
    instalarAtalhosEditor();
    instalarTeclaRestaurar();
    instalarCommandPalette();

    // Cidades (v3) — exportação com menu JSON/CSV
    $("btnExportCidades").addEventListener("click", function (ev) {
      ev.stopPropagation();
      $("cidExportMenu").hidden = !$("cidExportMenu").hidden;
    });
    document.addEventListener("click", function (ev) {
      const menu = $("cidExportMenu");
      if (menu && !menu.hidden && !menu.contains(ev.target) && ev.target !== $("btnExportCidades")) menu.hidden = true;
    });
    document.querySelectorAll("#cidExportMenu button").forEach(function (b) {
      b.addEventListener("click", function () { exportarCidades(b.getAttribute("data-export")); $("cidExportMenu").hidden = true; });
    });

    // expõe flag de instalação dos handlers do editor para a suíte de testes
    global.AdminPanel.__teste._syncBoxInstalado = true;
  }

  // ══════════════════════════════════════════════════════
  // API interna para testes automatizados (scripts/run-test.mjs executa
  // este arquivo em node:vm com stubs e exercita lógica pura).
  // Nada aqui é usado pelos fluxos de UI.
  // ══════════════════════════════════════════════════════
  global.AdminPanel = {
    showSection: showSection,
    __teste: {
      state: state,
      normalizarChaveCidade: normalizarChaveCidade,
      normalizarFicha: normalizarFicha,
      aplicarOverlayCidades: applyCidadesOverlay,
      classificarCidadesImportadas: classificarCidadesImportadas,
      parseCidadesTexto: parseCidadesTexto,
      diffImportacao: diffImportacao,
      diffOverlayMaps: diffOverlayMaps,
      pdfsEfetivos: pdfsEfetivos,
      campoTemPendencia: campoTemPendencia,
      CIDADES_POR_PAGINA: CIDADES_POR_PAGINA,
      // v3 (reestruturação)
      exportarOverlayPuro: exportarOverlayPuro,
      calcularPendentes: calcularPendentes,
      publicarPendentes: publicarPendentes,
      descartarPendentesPuro: descartarPendentesPuro,
      compararPdfComAnterior: compararPdfComAnterior,
      coordenadaForaDaPagina: coordenadaForaDaPagina,
      ufValida: ufValida,
      formulariosComMetricas: formulariosComMetricas,
      proximaVersaoTemplate: proximaVersaoTemplate,
      configGet: configGet,
      configSetPath: configSetPath,
      construirIndiceBusca: construirIndiceBusca,
      buscarIndice: buscarIndice,
      cidadeLinhaCSV: cidadeLinhaCSV,
      FICHA_UTILIZAR_PARA_ARQUIVO: FICHA_UTILIZAR_PARA_ARQUIVO,
      // v3 — Field Builder (§10)
      slugCampoId: slugCampoId,
      novoCampoCustom: novoCampoCustom,
      validarCampoSchema: validarCampoSchema,
      coletarDependenciasSchema: coletarDependenciasSchema,
      validarExclusaoCampo: validarExclusaoCampo,
      validarDocCampos: validarDocCampos,
      aplicarCamposCustomEmJson: aplicarCamposCustomEmJson,
      removerCampoRec: removerCampoRec,
      renomearCampoRec: renomearCampoRec,
      campoPresenteRec: campoPresenteRec,
      fbDocEfetivo: fbDocEfetivo,
      fbReconstruirDoc: fbReconstruirDoc,
      fbListaCamposCustom: fbListaCamposCustom,
      fbIdsExistentes: fbIdsExistentes,
      fbSecoesExistentes: fbSecoesExistentes
    }
  };
  document.addEventListener("DOMContentLoaded", init);
})(window);
