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
    overlay: { campos_ficha: {}, campos_declaracao: {}, cidades: {}, cidades_novas: [] },
    docData: {},        // por docKey: {json, flat:[], pageSizes:[], pdfjsDoc, page, sel, dirty}
    cityMap: {}, cityArr: [], citySource: null,
    historicoLocal: [],
    cidadesNovasSeq: 1
  };
  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

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
    if (cfg.overlay) state.overlay = Object.assign(state.overlay, cfg.overlay);

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

  function applyCidadesOverlay() {
    // patch de ficha por cidade normalizada
    for (const r of state.cityArr) {
      const patch = state.overlay.cidades[normalizarChaveCidade(r.cidade)];
      if (patch && patch.ficha) r.ficha = normalizarFicha(patch.ficha);
    }
    // cidades novas
    for (const nova of state.overlay.cidades_novas || []) {
      state.cityArr.push({
        idx: "n" + nova.id, cidade: nova.cidade, uf: nova.uf, regional: nova.regional,
        ficha: normalizarFicha(nova.ficha), fonte: "overlay administrativo"
      });
    }
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
      function close(val) {
        ov.classList.remove("show");
        ov.setAttribute("aria-hidden", "true");
        $("confirmOk").onclick = null;
        $("confirmCancel").onclick = null;
        resolve(val);
      }
      $("confirmOk").onclick = function () { close(true); };
      $("confirmCancel").onclick = function () { close(false); };
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
    const nAlteracoes = Object.keys(state.overlay.campos_ficha).length + Object.keys(state.overlay.campos_declaracao).length +
      Object.keys(state.overlay.cidades).length + (state.overlay.cidades_novas || []).length;
    const cards = [
      { k: "Formulários", v: FORMULARIOS.length, s: "fluxos no código" },
      { k: "Templates PDF", v: PDFS.length, s: "arquivos em uso" },
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
  }

  // ══════════════════════════════════════════════════════
  // PDFs
  // ══════════════════════════════════════════════════════
  function renderPdfs(filter) {
    const tbody = $("pdfTable").querySelector("tbody");
    const f = (filter || "").toLowerCase();
    tbody.innerHTML = "";
    PDFS.filter(function (p) { return !f || p.arquivo.toLowerCase().indexOf(f) !== -1 || p.formulario.toLowerCase().indexOf(f) !== -1; })
      .forEach(function (p) {
        const tr = document.createElement("tr");
        tr.innerHTML = "<td>" + esc(p.arquivo) + "</td><td>" + esc(p.tipo) + "</td><td>" + esc(p.formulario) +
          "</td><td class='num'>—</td><td><span class='badge ok'>Em uso</span></td>" +
          "<td><div class='row-actions'><button type='button' class='btn small secondary' data-visualizar='" + esc(p.path) + "'>Visualizar</button></div></td>";
        tbody.appendChild(tr);
      });
    tbody.querySelectorAll("button[data-visualizar]").forEach(function (b) {
      b.addEventListener("click", function () { window.open("../" + encodeURI(b.getAttribute("data-visualizar")), "_blank"); });
    });
    const sel = $("substTemplate");
    sel.innerHTML = PDFS.map(function (p) { return '<option value="' + esc(p.path) + '">' + esc(p.arquivo) + "</option>"; }).join("");
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
    await renderEditorPage(docKey);
  }

  async function renderEditorPage(docKey) {
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
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
    canvas.width = viewport.width; canvas.height = viewport.height;

    // caixas dos campos da página
    const fields = st.flat.filter(function (f) { return (f.pagina || 1) === st.page && f.coords && typeof f.coords.x === "number"; });
    for (const f of fields) {
      const box = document.createElement("div");
      box.className = "field-box" + (st.sel === f ? " selected" : "");
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
        st.dirty = true; updatePendingList(docKey);
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
    if (!numbersOnly) {
      ["edX", "edY", "edL", "edA", "edPg", "edT"].forEach(function (id) { $(id).disabled = false; });
      const temEstilo = ("fonte" in f.coords) || ("alinhamento" in f.coords);
      $("edFontNote").style.display = temEstilo ? "none" : "block";
      $("edT").disabled = true; // tamanho da fonte é fixado no código (implementação atual)
      $("edT").title = "Somente leitura: o tamanho da fonte é definido no código de geração.";
      $("edPg").disabled = true; // mover campo de página alteraria a lógica de geração
      $("edPg").title = "Somente leitura: a página é definida pelo schema e pela lógica de geração.";
    }
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
      const props = ["x", "y", "largura", "altura"];
      for (const p of props) {
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
    for (const key of Object.keys(porCampo)) {
      map[key] = Object.assign({}, map[key], porCampo[key].patch, { label: porCampo[key].label });
    }
    try {
      const r = await global.AdminPersistence.salvarOverlay(state.overlay);
      await logEvento({ acao: "alteracao_coordenada", entidade: DOCS[docKey].label, alteracao: diffs.map(function (d) { return d.key + "." + d.prop + ": " + d.de + "→" + d.para; }).join("; ") });
      st.dirty = false;
      updatePendingList(docKey);
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
  // CIDADES
  // ══════════════════════════════════════════════════════
  function renderCidades() {
    $("cidFonte").textContent = state.citySource;
    const q = ($("cidSearch").value || "").toLowerCase();
    const uf = $("cidUfFilter").value;
    const fi = $("cidFichaFilter").value;
    const rows = state.cityArr.filter(function (r) {
      if (q && r.cidade.toLowerCase().indexOf(q) === -1) return false;
      if (uf && r.uf !== uf) return false;
      if (fi && r.ficha !== fi) return false;
      return true;
    });
    const tbody = $("cidTable").querySelector("tbody");
    tbody.innerHTML = "";
    for (const r of rows.slice(0, 400)) {
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + esc(r.cidade) + "</td><td>" + esc(r.uf || "—") + "</td><td>" + esc(r.regional || "—") +
        "</td><td>" + esc(r.ficha) + "</td><td>" + esc(FICHA_UTILIZAR_PARA_ARQUIVO[r.ficha] || "⚠ não mapeado") + "</td>" +
        "<td><div class='row-actions'>" +
        (String(r.fonte).indexOf("overlay") === 0
          ? "<button type='button' class='btn small danger' data-rm-cidade='" + esc(String(r.idx)) + "'>Remover</button>"
          : "<button type='button' class='btn small secondary' data-ed-cidade='" + esc(normalizarChaveCidade(r.cidade)) + "' data-ficha-atual='" + esc(r.ficha) + "'>Alterar ficha</button>") +
        "</div></td>";
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll("button[data-ed-cidade]").forEach(function (b) {
      b.addEventListener("click", async function () {
        const cidade = b.getAttribute("data-ed-cidade");
        const atual = b.getAttribute("data-ficha-atual");
        const fichas = Object.keys(FICHA_UTILIZAR_PARA_ARQUIVO);
        const html = "<p>Cidade: <strong>" + esc(cidade) + "</strong></p><p>Ficha atual: " + esc(atual) + "</p>" +
          "<select id='mSel' style='width:100%;margin-top:10px;padding:9px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit'>" +
          fichas.map(function (f) { return "<option" + (f === atual ? " selected" : "") + ">" + esc(f) + "</option>"; }).join("") + "</select>";
        const ok = await confirmModal("Alterar associação cidade → ficha", html, "Salvar");
        if (!ok) return;
        const novo = $("mSel").value;
        state.overlay.cidades[cidade] = { ficha: novo };
        persistOverlaySilencioso("alteracao_cidade", cidade + " → " + novo);
        applyCidadesOverlay(); rebuildCityMap(); renderCidades(); renderAssistMap();
      });
    });
    tbody.querySelectorAll("button[data-rm-cidade]").forEach(function (b) {
      b.addEventListener("click", async function () {
        const id = b.getAttribute("data-rm-cidade");
        const nova = (state.overlay.cidades_novas || []).find(function (n) { return "n" + n.id === id; });
        if (!nova) return;
        const ok = await confirmModal("Remover cidade (overlay)",
          "<p>Será removida apenas a entrada administrativa (overlay) de <strong>" + esc(nova.cidade) + "</strong>. O JSON original do repositório não é alterado pelo painel.</p>", "Remover");
        if (!ok) return;
        state.overlay.cidades_novas = state.overlay.cidades_novas.filter(function (n) { return "n" + n.id !== id; });
        persistOverlaySilencioso("remocao_cidade", nova.cidade);
        applyCidadesOverlay(); rebuildCityMap(); renderCidades(); renderAssistMap();
      });
    });
    // filtros
    const ufs = Array.from(new Set(state.cityArr.map(function (r) { return r.uf; }).filter(Boolean))).sort();
    $("cidUfFilter").innerHTML = '<option value="">UF: todas</option>' + ufs.map(function (u) { return "<option" + (u === uf ? " selected" : "") + ">" + esc(u) + "</option>"; }).join("");
    const fichas = Array.from(new Set(state.cityArr.map(function (r) { return r.ficha; }))).sort();
    $("cidFichaFilter").innerHTML = '<option value="">Ficha: todas</option>' + fichas.map(function (f2) { return "<option" + (f2 === fi ? " selected" : "") + ">" + esc(f2) + "</option>"; }).join("");
  }

  async function adicionarCidade() {
    const nome = $("cidNome").value.trim();
    const uf = $("cidUf").value.trim().toUpperCase();
    const regional = $("cidRegional").value.trim().toUpperCase();
    const ficha = $("cidFicha").value;
    const msg = $("cidMsg");
    if (!nome || nome.length < 2) { msg.innerHTML = '<div class="notice err">Informe o nome da cidade.</div>'; return; }
    if (!uf || uf.length !== 2) { msg.innerHTML = '<div class="notice err">Informe a UF (2 letras).</div>'; return; }
    const k = normalizarChaveCidade(nome);
    if (state.cityMap[k]) {
      msg.innerHTML = '<div class="notice err">Cidade já cadastrada (normalização: "' + esc(k) + '"). Não há duplicidade.</div>';
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

  async function persistOverlaySilencioso(acao, entidade) {
    try { await global.AdminPersistence.salvarOverlay(state.overlay); } catch (e) { toast("Falha ao persistir: " + e.message, false); }
    await logEvento({ acao: acao, entidade: entidade, alteracao: "" });
  }

  // ══════════════════════════════════════════════════════
  // FORMULÁRIOS / REGRAS / SEGURANÇA
  // ══════════════════════════════════════════════════════
  function renderFormularios() {
    $("formTable").querySelector("tbody").innerHTML = FORMULARIOS.map(function (f) {
      const badge = f.status.indexOf("Ativo") === 0 ? "<span class='badge ok'>Ativo</span>" : "<span class='badge warn'>" + esc(f.status) + "</span>";
      return "<tr><td>" + esc(f.nome) + "</td><td><code>" + esc(f.rota) + "</code></td><td>" + esc(f.arquivo) +
        "</td><td>" + esc(f.template) + "</td><td>" + badge + "</td></tr>";
    }).join("");
    renderRegras();
  }

  function renderRegras() {
    const html = REGRAS.map(function (r) {
      const badge = r.class === "configuravel"
        ? "<span class='badge ok'>Configurável</span>"
        : "<span class='badge muted'>Implementada no código</span>";
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
  // INTEGRIDADE
  // ══════════════════════════════════════════════════════
  async function verificarIntegridade() {
    const out = [];
    const box = $("integridadeResultado");
    box.innerHTML = '<div class="notice info">Verificando…</div>';
    let okN = 0, warnN = 0, errN = 0;

    async function head(path) {
      try { const r = await fetch(encodeURI(path), { method: "HEAD" }); return r.ok; } catch (e) { return false; }
    }

    for (const p of PDFS) {
      if (await head(p.path)) { okN++; out.push("✓ " + p.arquivo); }
      else { errN++; out.push("✕ PDF inacessível: " + p.arquivo); }
    }

    const countByDoc = {};
    for (const key of Object.keys(DOCS)) {
      const flat = state.docData[key].flat;
      countByDoc[key] = flat.length;
      okN++;
      out.push("✓ " + DOCS[key].label + ": " + flat.length + " campos com coordenadas");
      for (const f of flat) {
        const c = f.coords;
        if (typeof c.x !== "number" || typeof c.y !== "number") { errN++; out.push("✕ Coordenada inválida: " + key + " → " + f.key); }
        const size = state.docData[key].pageSizes ? state.docData[key].pageSizes[(f.pagina || 1) - 1] : null;
        if (size && (c.x < 0 || c.y < 0 || c.x > size.w + 40 || c.y > size.h + 40)) {
          warnN++; out.push("⚠ Fora da página (aprox.): " + key + " → " + f.key);
        }
      }
    }

    let cidadesSemTemplate = 0;
    for (const r of state.cityArr) {
      if (!FICHA_UTILIZAR_PARA_ARQUIVO[r.ficha]) cidadesSemTemplate++;
    }
    if (cidadesSemTemplate) { warnN++; out.push("⚠ " + cidadesSemTemplate + " cidade(s) com ficha não mapeada para PDF"); }
    else { okN++; out.push("✓ Todas as " + state.cityArr.length + " cidades mapeadas para template existente"); }

    for (const f of FORMULARIOS) {
      const okRota = await head(f.arquivo);
      if (okRota) { okN++; out.push("✓ Formulário " + f.nome + " (rota " + f.rota + ")"); }
      else { errN++; out.push("✕ Arquivo do formulário inacessível: " + f.arquivo); }
    }

    const cor = errN ? "err" : (warnN ? "warn" : "ok");
    box.innerHTML = '<div class="notice ' + cor + '"><strong>Relatório de integridade:</strong><br>' +
      out.map(esc).join("<br>") + "</div>";
    await logEvento({ acao: "verificacao_integridade", entidade: "sistema", alteracao: "ok:" + okN + " warn:" + warnN + " err:" + errN });
  }

  // ══════════════════════════════════════════════════════
  // DADOS: EXPORT / IMPORT / BACKUP
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

  async function importarConfig(file) {
    try {
      const json = await global.AdminPersistence.lerArquivoJSON(file);
      if (!json || json.admin_config_v1 !== true || !json.overlay) {
        $("importPreview").innerHTML = '<div class="notice err">Estrutura inválida — esperado arquivo exportado por este painel (admin_config_v1).</div>';
        return;
      }
      const o = json.overlay;
      const nFicha = Object.keys(o.campos_ficha || {}).length;
      const nDecl = Object.keys(o.campos_declaracao || {}).length;
      const nCid = Object.keys(o.cidades || {}).length;
      const nNovas = (o.cidades_novas || []).length;
      $("importPreview").innerHTML = '<div class="notice warn">Serão aplicados: ' +
        nFicha + " campo(s) F-075 · " + nDecl + " campo(s) Declaração · " + nCid + " associação(ões) de cidade · " + nNovas +
        " cidade(s) nova(s).<br>Confirme para aplicar sobre o overlay atual.</div>" +
        '<button type="button" class="btn" id="btnImportOk">Aplicar importação</button>';
      $("btnImportOk").addEventListener("click", async function () {
        const ok = await confirmModal("Aplicar importação",
          "<p>Registros do arquivo serão mesclados no overlay atual (última gravação vence por campo).</p>", "Aplicar");
        if (!ok) return;
        state.overlay = {
          campos_ficha: Object.assign({}, state.overlay.campos_ficha, o.campos_ficha || {}),
          campos_declaracao: Object.assign({}, state.overlay.campos_declaracao, o.campos_declaracao || {}),
          cidades: Object.assign({}, state.overlay.cidades, o.cidades || {}),
          cidades_novas: (state.overlay.cidades_novas || []).concat(o.cidades_novas || [])
        };
        // reaplica overlay nos docs carregados
        for (const key of Object.keys(DOCS)) applyOverlayToDoc(key, state.docData[key].json);
        applyCidadesOverlay(); rebuildCityMap();
        await persistOverlaySilencioso("importacao", file.name);
        renderDashboard(); renderCidades(); renderAssistMap();
        $("importPreview").innerHTML = '<div class="notice ok">Importação aplicada.</div>';
      });
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
  // HISTÓRICO
  // ══════════════════════════════════════════════════════
  async function logEvento(ev) {
    const registro = Object.assign({
      data: new Date().toISOString(),
      usuario: (global.atentoAdminEmail && global.atentoAdminEmail()) || ""
    }, ev);
    state.historicoLocal.unshift(registro);
    await global.AdminPersistence.registrarEvento(registro);
  }

  async function renderHistorico() {
    const el = $("histLista");
    let remotos = null;
    if (state.modo === "api") {
      remotos = await global.AdminPersistence.carregarHistorico();
    }
    const eventos = (remotos && Array.isArray(remotos.eventos) ? remotos.eventos.slice() : [])
      .concat(state.historicoLocal)
      .sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
    el.innerHTML = eventos.length
      ? eventos.slice(0, 200).map(function (e) {
          const d = new Date(e.data);
          return '<div class="historico-item"><div class="h-data">' + esc(d.toLocaleString("pt-BR")) + "</div>" +
            '<span class="h-user">' + esc(e.usuario || "—") + "</span> · " + esc(e.acao || "") +
            (e.entidade ? " — <strong>" + esc(e.entidade) + "</strong>" : "") +
            (e.alteracao ? '<br><span style="color:var(--text-mid)">' + esc(e.alteracao) + "</span>" : "") + "</div>";
        }).join("")
      : '<div class="notice info">Nenhum evento registrado nesta sessão' + (state.modo === "api" ? " ou servidor." : " (modo exportação não persiste histórico).") + "</div>";
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
      $("edSave").disabled = true; $("edCancel").disabled = true;
      try { await loadDocForEditor(edDoc.value); } catch (e) { toast("Falha ao carregar template: " + e.message, false); }
    });
    $("edPage").addEventListener("change", function () {
      state.docData[edDoc.value].page = parseInt(this.value, 10) || 1;
      renderEditorPage(edDoc.value);
    });
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
      st.dirty = false; updatePendingList(edDoc.value);
      renderEditorPage(edDoc.value);
      $("edSave").disabled = true; $("edCancel").disabled = true;
      toast("Alterações não salvas foram descartadas.");
    });
    $("edTestPreview").addEventListener("click", function () { previewTeste(edDoc.value); });
    $("edGoCampos").addEventListener("click", function () { showSection("coordenadas"); toast("Use a busca e os controles sobre o PDF para localizar o campo."); });
    try { await loadDocForEditor("ficha_cadastral"); } catch (e) { /* template indisponível no ambiente */ }

    // Cidades
    $("cidSearch").addEventListener("input", renderCidades);
    $("cidUfFilter").addEventListener("change", renderCidades);
    $("cidFichaFilter").addEventListener("change", renderCidades);
    $("btnNovaCidade").addEventListener("click", function () { $("cidFormPanel").hidden = !$("cidFormPanel").hidden; });
    $("cidSalvar").addEventListener("click", adicionarCidade);
    $("cidCancelar").addEventListener("click", function () { $("cidFormPanel").hidden = true; });

    // Segurança / integridade
    $("btnIntegridade").addEventListener("click", verificarIntegridade);

    // Dados
    $("btnExport").addEventListener("click", exportarConfig);
    $("importFile").addEventListener("change", function () { if (this.files[0]) importarConfig(this.files[0]); });

    function syncBox(f, docKey) {
      const st = state.docData[docKey];
      const box = document.querySelector('.field-box[data-key="' + f.key.replace(/"/g, '\\"') + '"]');
      if (box) { updateBoxFromField(box, f, st); st.dirty = true; updatePendingList(docKey); $("edSave").disabled = false; $("edCancel").disabled = false; }
    }
  }

  global.AdminPanel = { showSection: showSection };
  document.addEventListener("DOMContentLoaded", init);
})(window);
