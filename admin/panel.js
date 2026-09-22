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
    "FICHA SA_FO": "FICHA SA_FO.pdf",
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
  const FORMULARIOS = [
    { nome: "F-075 · Ficha Cadastral", rota: "/f075", arquivo: "ficha_cadastral.html", template: FICHA_PDF, status: "Ativo", schema: "ficha_cadastral_campos.json" },
    { nome: "F-089 · Assistência Médica", rota: "/f089", arquivo: "assistencia_medica.html", template: "DECLARACAO (Plano de Benefícios) ou FICHA regional por cidade", status: "Ativo", schema: "assistencia_medica_campos.json + declaracao_plano_saude_campos.json" },
    { nome: "Carta Conta Salário Bradesco", rota: "/bradesco", arquivo: "carta_bradesco.html", template: "Gerado do zero (sem template)", status: "Ativo", schema: "—" },
    { nome: "Termos de Aceite", rota: "/termos", arquivo: "termos_aceite.html", template: "ARQUIVO MODELO.pdf / TERMO DE SIGILO_SP.pdf", status: "Indisponível (na home)", schema: "—" }
  ];
  const REGRAS = [
    { id: "RN-PIS", nome: "Primeiro Emprego → PIS", desc: "PIS é sempre visível e obrigatório, tanto para SIM quanto para NÃO.", class: "codigo" },
    { id: "RN-BANCO", nome: "Banco → campos bancários", desc: "Escolha do banco exibe campos específicos (agência, conta, dígito).", class: "codigo" },
    { id: "RN-PLANO", nome: "Plano → fluxo", desc: "Plano de Benefícios → DECLARACAO PLANO DE SAUDE.pdf (assinatura pág. 2). Outros Planos → cidade → ficha regional.", class: "codigo" },
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
    overlay: { campos_ficha: {}, campos_declaracao: {}, cidades: {}, cidades_novas: [], pdfs_meta: {} },
    docData: {},        // por docKey: {json, flat:[], pageSizes:[], pdfjsDoc, page, sel, dirty}
    cityMap: {}, cityArr: [], citySource: null,
    historicoLocal: [],
    cidadesNovasSeq: 1,
    // ── v2 ──
    cidadesPagina: 1,
    cidadesSelecao: {},          // chave de linha (origemChave | "n"+id) → true
    integridadeCache: null,      // { quando, itens:[{nivel,texto,go}], okN, warnN, errN }
    cidadesFiltroEspecial: null  // conjunto de chaves vindo do link da Saúde (T0)
  };
  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  const CIDADES_POR_PAGINA = 50; // configurável (T2.3)
  const PROPS_COORD = ["x", "y", "largura", "altura"];

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
    }

    // JSONs de campos
    for (const key of Object.keys(DOCS)) {
      const json = await fetchJSON(DOCS[key].jsonPath);
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
  // UI BÁSICA
  // ══════════════════════════════════════════════════════
  function showSection(name) {
    document.querySelectorAll(".admin-section").forEach(function (s) { s.classList.remove("active"); });
    const sec = $("sec-" + name);
    if (sec) sec.classList.add("active");
    document.querySelectorAll(".admin-side button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-section") === name);
    });
    if (name === "historico") renderHistorico();
    if (name === "dados") renderDados();
    if (name === "sistema") renderSistema();
    if (name === "cidades") renderCidades();
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
    const nAlteracoes = Object.keys(state.overlay.campos_ficha).length + Object.keys(state.overlay.campos_declaracao).length +
      Object.keys(state.overlay.cidades).length + (state.overlay.cidades_novas || []).length +
      Object.keys(state.overlay.pdfs_meta || {}).length;
    const cards = [
      { k: "Formulários", v: FORMULARIOS.length, s: "fluxos no código" },
      { k: "Templates PDF", v: pdfs.length, s: "arquivos em uso" },
      { k: "Cidades", v: state.cityArr.length, s: state.citySource },
      { k: "Campos F-075", v: nCoordFicha, s: "com coordenadas" },
      { k: "Campos Declaração", v: nCoordDecl, s: "página 2" },
      { k: "Fichas regionais", v: Object.keys(FICHA_UTILIZAR_PARA_ARQUIVO).length, s: "Outros Planos" },
      { k: "Alterações pendentes", v: nAlteracoes, s: state.modo === "api" ? "gravadas no servidor" : "no overlay da sessão" },
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
      const base = global.AdminPersistence.sanitizarNomeArquivo(file.name).replace(/\.pdf$/i, "");
      const nomeSeguro = base + ".pdf";
      const ok = await confirmModal(
        destinoAtual ? "Substituir template" : "Adicionar PDF",
        destinoAtual
          ? "<p>Template: <strong>" + esc(destinoAtual) + "</strong></p><p>O arquivo atual será preservado como backup e a versão anterior permanece registrada.</p><p><strong>Atenção:</strong> se a nova versão alterar o layout, as coordenadas dos campos podem precisar de revisão no Editor.</p>"
          : "<p>O arquivo será gravado no servidor como <strong>" + esc(nomeSeguro) + "</strong>.</p>",
        destinoAtual ? "Substituir" : "Enviar"
      );
      if (!ok) return null;
      const r = await global.AdminPersistence.uploadPdf(file, nomeSeguro);
      await logEvento({ acao: destinoAtual ? "substituicao_pdf" : "criacao_pdf", entidade: destinoAtual || nomeSeguro, alteracao: destinoAtual ? "substituído por " + nomeSeguro : "adicionado" });
      toast(destinoAtual ? "PDF substituído (backup criado): " + (r.nome || nomeSeguro) : "PDF gravado: " + (r.nome || nomeSeguro));
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
      const box = document.createElement("div");
      box.className = "field-box" + (st.sel === f ? " selected" : "") + (campoTemPendencia(docKey, f) ? " pending" : "");
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

  function attachDrag(box, f, docKey) {
    box.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      box.setPointerCapture(ev.pointerId);
      const st = state.docData[docKey];
      const startX = ev.clientX, startY = ev.clientY;
      const ox = f.coords.x, oy = f.coords.y;
      function onMove(e) {
        const dx = (e.clientX - startX) / st.renderViewport.w * st.pageSizes[st.page - 1].w;
        const dy = (e.clientY - startY) / st.renderViewport.h * st.pageSizes[st.page - 1].h;
        setCoords(f, round1(ox + dx), round1(oy - dy));
        updateBoxFromField(box, f, st);
        if (st.sel === f) fillEditorForm(f, docKey, true);
        st.dirty = true; updatePendingList(docKey); atualizarListaCampos(docKey);
      }
      function onUp() {
        box.removeEventListener("pointermove", onMove);
        box.removeEventListener("pointerup", onUp);
        $("edSave").disabled = false; $("edCancel").disabled = false;
      }
      box.addEventListener("pointermove", onMove);
      box.addEventListener("pointerup", onUp);
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
      b.classList.toggle("selected", b.dataset.key === f.key);
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
  async function restaurarCampo(docKey) {
    const st = state.docData[docKey];
    const f = st.sel;
    if (!f || !campoTemPendencia(docKey, f)) return;
    const patch = state.overlay[DOCS[docKey].overlayKey][f.key] || {};
    const antes = Object.assign({}, f.coords);
    for (const p of PROPS_COORD) {
      f.coords[p] = (p in patch) ? patch[p] : f.origCoords[p];
    }
    syncBox(f, docKey);
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

  async function previewTeste(docKey) {
    const d = DOCS[docKey];
    const st = state.docData[docKey];
    try {
      const res = await fetch(d.pdfPath);
      if (!res.ok) throw new Error("template HTTP " + res.status);
      const bytes = await res.arrayBuffer();
      const pdf = await PDFLib.PDFDocument.load(bytes);
      const font = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
      const pages = pdf.getPages();
      for (const f of st.flat) {
        const val = valorTeste(f);
        if (!val) continue;
        const pg = pages[(f.pagina || 1) - 1];
        if (!pg) continue;
        pg.drawText(String(val), {
          x: f.coords.x, y: f.coords.y,
          size: 9, font: font,
          maxWidth: f.coords.largura || undefined,
          color: PDFLib.rgb(0.55, 0.2, 0.05)
        });
      }
      const out = await pdf.save();
      const blob = new Blob([out], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
      await logEvento({ acao: "preview_teste", entidade: d.label, alteracao: "preview com dados fictícios" });
    } catch (e) {
      toast("Falha no preview: " + e.message, false);
    }
  }

  function valorTeste(f) {
    const norm = f.key.toLowerCase().replace(/\.[^.]+$/, "");
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
      if (!r.uf || r.uf.trim().length !== 2) { invalidos.push(Object.assign({ motivo: "UF ausente ou inválida" }, r)); continue; }
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
  function renderFormularios() {
    $("formTable").querySelector("tbody").innerHTML = FORMULARIOS.map(function (f) {
      const badge = f.status.indexOf("Ativo") === 0 ? "<span class='badge ok'>Ativo</span>" : "<span class='badge warn'>" + esc(f.status) + "</span>";
      // Tarefa 7 — selo de leitura: formulários são 100% código
      const selo = "<span class='badge readonly'>🔒 Somente leitura — código</span>";
      return "<tr><td>" + esc(f.nome) + "</td><td><code>" + esc(f.rota) + "</code></td><td>" + esc(f.arquivo) +
        "</td><td>" + esc(f.template) + "</td><td>" + badge + " " + selo + "</td></tr>";
    }).join("");
    renderRegras();
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
    $("regrasLista").innerHTML = html;
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
      gerado_em: new Date().toISOString(),
      usuario: (global.atentoAdminEmail && global.atentoAdminEmail()) || "",
      overlay: state.overlay
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
      const nTotalNovos = d.campos_ficha.novos.length + d.campos_declaracao.novos.length + d.cidades.novos.length + d.pdfs_meta.novos.length + d.cidades_novas.novos.length;
      const nTotalAlt = d.campos_ficha.alterados.length + d.campos_declaracao.alterados.length + d.cidades.alterados.length + d.pdfs_meta.alterados.length;

      // ── Tarefa 5 — diff campo a campo com checkboxes (marcados por padrão) ──
      const rotulos = { campos_ficha: "Coordenadas F-075", campos_declaracao: "Coordenadas Declaração", cidades: "Patches de cidade", pdfs_meta: "Metadados de PDF" };
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
      html += blocoMap("campos_ficha") + blocoMap("campos_declaracao") + blocoMap("cidades") + blocoMap("pdfs_meta");
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
        const destinos = { campos_ficha: {}, campos_declaracao: {}, cidades: {}, pdfs_meta: {} };
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
          pdfs_meta: Object.assign({}, state.overlay.pdfs_meta, destinos.pdfs_meta)
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
  // SISTEMA
  // ══════════════════════════════════════════════════════
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
      CIDADES_POR_PAGINA: CIDADES_POR_PAGINA
    }
  };
  document.addEventListener("DOMContentLoaded", init);
})(window);
