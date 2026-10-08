/*!
 * rascunho-ttl.js — Descarte automático de rascunhos após 24 horas (LGPD)
 *
 * Compartilhado pelas páginas públicas (ficha_cadastral, assistencia_medica,
 * carta_bradesco, termos_aceite). Ver MANUTENCAO.md §7.2.
 *
 * Comportamento:
 *  - Retenção máxima fixa: o rascunho é descartado automaticamente 24 horas
 *    após o último salvamento observado — não há retenção indefinida (LGPD).
 *  - Na primeira vez que um rascunho existe sem decisão registrada, um modal
 *    oferece apagar agora ou manter por 24 horas.
 *    Fechar o modal (ESC/fundo) equivale a manter por 24 horas (padrão seguro).
 *  - O modal também é apresentado ao finalizar a geração do PDF, quando o
 *    rascunho acaba de ser gravado sem decisão registrada: a página chama
 *    RascunhoTTL.verificarAposSalvar() após o salvamento pós-geração.
 *  - O modal usa o layout geral da aplicação (.modal-overlay/.modal-card/
 *    .modal-head/.modal-body/.modal-actions/.btn-modal), herdando o tema.
 *  - A decisão (apagar agora/manter por 24 horas) vale para aquele rascunho;
 *    ao descartar manualmente (menu "Descartar rascunho") a decisão é limpa e
 *    o ciclo recomeça no próximo.
 *  - As páginas informam cada salvamento ao módulo; rascunhos antigos sem
 *    horário recuperável recebem prazo transitório desde a primeira abertura.
 *
 * Integração: carregue o módulo no <head> e inicialize após as funções de
 * storage/limpeza da página estarem definidas, antes de restaurar o rascunho:
 *   <script>
 *     RascunhoTTL.init({
 *       draftKey: RASCUNHO_STORAGE_KEY,
 *       legacyKeys: [/* chaves legadas, se houver *\/],
 *       metaKey: LS_NS + "rascunho_ttl_<pagina>_v1",
 *       limparFormulario: function () { limparDadosFormulario(); },
 *       notificar: function (msg, ok) { showToast(msg, ok); }
 *     });
 *   </script>
 *
 *   Pós-geração do PDF (após gravar o rascunho, na rotina de sucesso da página):
 *     window.RascunhoTTL?.verificarAposSalvar();
 */
(function (global) {
  "use strict";

  var TTL_PADRAO_MS = 24 * 60 * 60 * 1000; // 24 horas
  var POLL_PADRAO_MS = 30 * 1000; // reavalia a cada 30s com a página aberta

  var cfg = null;
  var modalAberto = false;
  var overlayEl = null;
  var escHandler = null;

  // ── storage seguro (modo privado, quota, SecurityError) ──
  function lsGet(key) {
    try { return global.localStorage.getItem(key); } catch (_) { return null; }
  }
  function lsSet(key, valor) {
    try { global.localStorage.setItem(key, valor); return true; } catch (_) { return false; }
  }
  function lsDel(key) {
    try { global.localStorage.removeItem(key); } catch (_) { /* noop */ }
  }

  // ── hash curto para detectar mudança de conteúdo do rascunho ──
  function hashDjb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i += 1) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  // ── meta da decisão/TTL (chave própria por página) ──
  function lerMeta() {
    if (!cfg) return null;
    var raw = lsGet(cfg.metaKey);
    if (!raw) return null;
    try {
      var m = JSON.parse(raw);
      return (m && typeof m === "object") ? m : null;
    } catch (_) { return null; }
  }
  function gravarMeta(meta) {
    if (!cfg) return;
    lsSet(cfg.metaKey, JSON.stringify(meta));
  }
  function limparMeta() {
    if (cfg) lsDel(cfg.metaKey);
  }

  function limparDecisao() {
    limparMeta();
  }

  function registrarSalvamento(salvoComSucesso) {
    if (!cfg || salvoComSucesso !== true) return;
    var agora = Date.now();
    var meta = sincronizarMeta(agora);
    if (!meta) return;
    meta.savedAt = agora;
    meta.savedAtEstimated = false;
    gravarMeta(meta);
  }

  function payloadExpirou(savedAt, metaKey) {
    var meta = null;
    var raw = metaKey ? lsGet(metaKey) : null;
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") meta = parsed;
      } catch (_) { /* payload sem metadados de origem */ }
    }
    var salvo = (typeof savedAt === "number" && isFinite(savedAt) && savedAt > 0)
      ? savedAt
      : (meta && typeof meta.savedAt === "number" ? meta.savedAt : 0);
    if (!salvo) return true;
    var ttl = (cfg && typeof cfg.ttlMs === "number" && cfg.ttlMs > 0) ? cfg.ttlMs : TTL_PADRAO_MS;
    return (Date.now() - salvo) >= ttl;
  }

  // Campo `t` embutido no blob do rascunho (ficha/assistência) — null se ausente.
  function tstampDoBlob(raw) {
    try {
      var obj = JSON.parse(raw);
      if (obj && typeof obj.t === "number" && isFinite(obj.t) && obj.t > 0) return obj.t;
    } catch (_) { /* blob sem timestamp */ }
    return null;
  }

  // Conteúdo bruto do rascunho (chave atual ou legada ainda não migrada).
  function rascunhoBruto() {
    if (!cfg) return null;
    var raw = lsGet(cfg.draftKey);
    if (raw != null) return raw;
    var legacy = cfg.legacyKeys || [];
    for (var i = 0; i < legacy.length; i += 1) {
      raw = lsGet(legacy[i]);
      if (raw != null) return raw;
    }
    return null;
  }

  // Sincroniza a meta com o rascunho atual; devolve a meta vigente (ou null).
  function sincronizarMeta(agora) {
    if (!cfg) return null;
    var raw = rascunhoBruto();
    if (raw == null) {
      limparMeta();
      return null;
    }
    var sig = hashDjb2(raw);
    var meta = lerMeta();
    if (!meta) {
      var tInicial = tstampDoBlob(raw);
      meta = { savedAt: tInicial || agora, savedAtEstimated: !tInicial, sig: sig, decidedAt: 0 };
      gravarMeta(meta);
    } else {
      var alterou = false;
      if (meta.sig !== sig) {
        var tAtual = tstampDoBlob(raw);
        meta.sig = sig;
        meta.savedAt = tAtual || agora;
        meta.savedAtEstimated = !tAtual;
        alterou = true;
      }
      // Metadados legados de retenção indefinida deixam de valer (LGPD).
      if ("choice" in meta) {
        delete meta.choice;
        alterou = true;
      }
      if (alterou) gravarMeta(meta);
    }
    return meta;
  }

  function expirou(meta, agora) {
    if (!meta) return false;
    var ttl = (cfg && typeof cfg.ttlMs === "number" && cfg.ttlMs > 0) ? cfg.ttlMs : TTL_PADRAO_MS;
    var salvo = typeof meta.savedAt === "number" ? meta.savedAt : 0;
    if (!salvo) return false;
    return (agora - salvo) >= ttl;
  }

  // Remove o rascunho do armazenamento e limpa a meta da decisão.
  function removerRascunhoStorage() {
    if (!cfg) return;
    lsDel(cfg.draftKey);
    var legacy = cfg.legacyKeys || [];
    for (var i = 0; i < legacy.length; i += 1) lsDel(legacy[i]);
    var related = cfg.relatedKeys || [];
    for (var j = 0; j < related.length; j += 1) lsDel(related[j]);
    limparMeta();
  }

  // Descarte completo: storage + formulário da página (+ aviso, se aplicável).
  function descartar(silencioso, mensagem) {
    if (!cfg) return;
    removerRascunhoStorage();
    if (typeof cfg.limparFormulario === "function") {
      try { cfg.limparFormulario(); } catch (_) { /* noop */ }
    }
    if (!silencioso && typeof cfg.notificar === "function") {
      try { cfg.notificar(mensagem || "Rascunho descartado automaticamente (24 horas).", true); } catch (_) { /* noop */ }
    }
  }

  // Registra a decisão do usuário (modal, ESC ou fundo): manter por 24 h
  // (decidedAt evita reabrir o modal) ou apagar agora. Não existe decisão de
  // retenção indefinida — o prazo de 24 h é sempre aplicado (LGPD).
  function decidir(choice) {
    if (!cfg) return;
    if (choice === "delete") {
      fecharModal();
      descartar(false, "Rascunho apagado.");
      return;
    }
    var meta = lerMeta() || { sig: "" };
    meta.decidedAt = Date.now();
    gravarMeta(meta);
    fecharModal();
  }

  // ── modal de decisão (mesmo layout geral da aplicação:
  //    .modal-overlay/.modal-card/.modal-head/.modal-body/.modal-actions/.btn-modal) ──

  function sincronizarBodyModalOpen() {
    var doc = global.document;
    if (!doc || !doc.body || !doc.body.classList || !doc.querySelector) return;
    if (doc.querySelector(".modal-overlay.show")) doc.body.classList.add("modal-open");
    else doc.body.classList.remove("modal-open");
  }

  function aoTeclarEsc(ev) {
    if (ev && (ev.key === "Escape" || ev.key === "Esc")) {
      decidir(null); // fechou sem responder → padrão seguro
    }
  }

  function fecharModal() {
    modalAberto = false;
    var doc = global.document;
    if (escHandler && doc && typeof doc.removeEventListener === "function") {
      doc.removeEventListener("keydown", escHandler, true);
    }
    escHandler = null;
    if (overlayEl) {
      if (typeof overlayEl.setAttribute === "function") {
        overlayEl.setAttribute("hidden", "");
        overlayEl.setAttribute("aria-hidden", "true");
      }
      if (overlayEl.classList && overlayEl.classList.remove) overlayEl.classList.remove("show");
      if (typeof overlayEl.remove === "function") overlayEl.remove();
    }
    overlayEl = null;
    sincronizarBodyModalOpen();
  }

  // Chamada após a gravação do rascunho (ex.: ao finalizar a geração do PDF):
  // se o rascunho acabou de nascer sem decisão registrada, apresenta o modal.
  function verificarAposSalvar() {
    if (!cfg || modalAberto) return;
    var meta = sincronizarMeta(Date.now());
    if (meta && !meta.decidedAt) mostrarModal();
  }

  function mostrarModal() {
    var doc = global.document;
    if (!doc || modalAberto) return;
    modalAberto = true;

    var overlay = doc.createElement("div");
    overlay.className = "modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "rttl-titulo");

    var card = doc.createElement("div");
    card.className = "modal-card";

    var titulo = doc.createElement("div");
    titulo.className = "modal-head modal-head--rascunho";
    titulo.id = "rttl-titulo";
    titulo.textContent = "Atenção aos dados do rascunho";

    var corpo = doc.createElement("div");
    corpo.className = "modal-body";

    var p1 = doc.createElement("p");
    var metaAtual = lerMeta();
    p1.textContent = metaAtual && metaAtual.savedAtEstimated
      ? "Não foi possível determinar quando este rascunho foi salvo. O rascunho e os dados preenchidos serão excluídos em até 24 horas a partir desta abertura."
      : "Os dados preenchidos e o rascunho salvos neste dispositivo serão excluídos automaticamente 24 horas após o último salvamento.";

    var p2 = doc.createElement("p");
    p2.textContent = "Não há opção de retenção indefinida: o rascunho e os dados não permanecem neste dispositivo além do prazo de 24 horas.";

    var p3 = doc.createElement("p");
    p3.textContent = "Se fechar esta janela sem escolher, o rascunho será apagado após 24 horas. Você também pode apagá-lo agora.";

    corpo.appendChild(p1);
    corpo.appendChild(p2);
    corpo.appendChild(p3);

    var acoes = doc.createElement("div");
    acoes.className = "modal-actions";

    var btnManter24h = doc.createElement("button");
    btnManter24h.type = "button";
    btnManter24h.className = "btn-modal confirm";
    btnManter24h.textContent = "Manter rascunho por 24 horas";
    btnManter24h.addEventListener("click", function () { decidir("auto"); });

    var btnApagarAgora = doc.createElement("button");
    btnApagarAgora.type = "button";
    btnApagarAgora.className = "btn-modal confirm";
    btnApagarAgora.textContent = "Apagar rascunho agora";
    btnApagarAgora.addEventListener("click", function () { decidir("delete"); });

    acoes.appendChild(btnManter24h);
    acoes.appendChild(btnApagarAgora);
    card.appendChild(titulo);
    card.appendChild(corpo);
    card.appendChild(acoes);
    overlay.appendChild(card);

    overlay.addEventListener("click", function (ev) {
      if (ev && ev.target === overlay) decidir(null);
    });

    doc.body.appendChild(overlay);
    overlayEl = overlay;

    // mesmo mecanismo das modais da aplicação (setModalOverlayVisible)
    if (typeof overlay.removeAttribute === "function") overlay.removeAttribute("hidden");
    if (overlay.classList && overlay.classList.add) overlay.classList.add("show");
    if (typeof overlay.setAttribute === "function") overlay.setAttribute("aria-hidden", "false");
    sincronizarBodyModalOpen();

    if (typeof btnManter24h.focus === "function") {
      try { btnManter24h.focus(); } catch (_) { /* noop */ }
    }
    if (doc.addEventListener) {
      escHandler = aoTeclarEsc;
      doc.addEventListener("keydown", escHandler, true);
    }
  }

  function agendarModal() {
    var doc = global.document;
    if (!doc) return;
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", function () {
        if (rascunhoBruto() != null) mostrarModal();
      });
    } else if (rascunhoBruto() != null) {
      mostrarModal();
    }
  }

  // ── avaliação periódica (página aberta): sincroniza meta e expira ──
  // O modal NÃO é disparado aqui para não interromper o preenchimento; ele
  // aparece no carregamento da página (agendarModal) quando há rascunho sem
  // decisão registrada — até lá vale o padrão seguro (descarte após 24 h).
  function tick() {
    if (!cfg) return;
    var agora = Date.now();
    var meta = sincronizarMeta(agora);
    if (!meta) return;
    if (expirou(meta, agora)) {
      descartar(false); // em sessão aberta, avisa o usuário
    }
  }

  function init(config) {
    if (!config || !config.draftKey || !config.metaKey) return;
    cfg = {
      draftKey: config.draftKey,
      legacyKeys: Array.isArray(config.legacyKeys) ? config.legacyKeys : [],
      relatedKeys: Array.isArray(config.relatedKeys) ? config.relatedKeys : [],
      metaKey: config.metaKey,
      limparFormulario: (typeof config.limparFormulario === "function") ? config.limparFormulario : null,
      notificar: (typeof config.notificar === "function") ? config.notificar : null,
      ttlMs: (typeof config.ttlMs === "number" && config.ttlMs > 0) ? config.ttlMs : TTL_PADRAO_MS,
      pollMs: (typeof config.pollMs === "number") ? config.pollMs : POLL_PADRAO_MS
    };

    if (cfg.pollMs > 0 && typeof global.setInterval === "function") {
      global.setInterval(tick, cfg.pollMs);
      var doc = global.document;
      if (doc && typeof doc.addEventListener === "function") {
        doc.addEventListener("visibilitychange", function () {
          if (!doc.hidden) tick();
        });
      }
    }

    var meta = sincronizarMeta(Date.now());
    if (!meta) return; // sem rascunho — nada a fazer
    if (expirou(meta, Date.now())) {
      descartar(true); // no load: silencioso (o usuário ainda não viu o rascunho)
      return;
    }
    if (!meta.decidedAt) agendarModal();
  }

  global.RascunhoTTL = {
    init: init,
    tick: tick,
    verificarAposSalvar: verificarAposSalvar,
    limparDecisao: limparDecisao,
    registrarSalvamento: registrarSalvamento,
    payloadExpirou: payloadExpirou,
    _internais: { hashDjb2: hashDjb2, sincronizarMeta: sincronizarMeta, expirou: expirou, decidir: decidir, lerMeta: lerMeta, modalEstaAberto: function () { return modalAberto; } }
  };
})(typeof window !== "undefined" ? window : globalThis);
