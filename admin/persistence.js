/**
 * ============================================================
 * ADMIN PERSISTENCE — Camada de persistência do Painel
 * ============================================================
 *
 * Estratégia adaptativa (decisão arquitetural):
 *
 * 1. MODO API (desenvolvimento / quando houver backend):
 *    - GET  /api/admin/config            → config administrativa (overlay) atual
 *    - PUT  /api/admin/config            → grava overlay + backup automático
 *    - GET  /api/admin/backup            → histórico de backups (lista)
 *    - GET  /api/admin/backup?id=N       → baixa um backup específico
 *    - POST /api/admin/upload            → upload de PDF (Base64 + validações)
 *    - GET  /api/admin/historico         → lista de eventos de auditoria
 *    - POST /api/admin/historico         → registra evento
 *
 * 2. MODO EXPORTAÇÃO (produção estática, sem API):
 *    - Configurações alteradas existem apenas na sessão do navegador
 *      (variável em memória + rascunho em sessionStorage, NÃO em localStorage).
 *    - "Salvar" gera arquivo JSON para o administrador versionar no repositório.
 *    - "Importar" lê o arquivo JSON validado de volta.
 *
 * LIMITAÇÃO DOCUMENTADA: no modo exportação NÃO há persistência servida ao
 * site público — a aplicação pública continua lendo os JSONs do repositório.
 * Para efetivar alterações em produção estática, o JSON exportado deve ser
 * commitado. O modo API grava em data/ (gitignored) e a leitura pública
 * passa a considerar o overlay quando servido por backend.
 *
 * localStorage é PROIBIDO como banco administrativo. Uso permitido:
 * sessionStorage para rascunho de sessão (mesmo padrão do guard.js).
 */

(function (global) {
  "use strict";

  const DRAFT_KEY = "adm_draft_cfg";

  // ══════════════════════════════════════════════════════
  // DETECÇÃO DE MODO
  // ══════════════════════════════════════════════════════
  async function detectMode() {
    try {
      const res = await fetch("/api/admin/config", { method: "HEAD" });
      if (res.ok || res.status === 404) return "api"; // 404 = API existe, config ainda não criada
    } catch (e) { /* sem API */ }
    return "export";
  }

  // ══════════════════════════════════════════════════════
  // CONFIG ADMINISTRATIVA (OVERLAY)
  // ══════════════════════════════════════════════════════
  async function carregarConfig() {
    const modo = await detectMode();
    if (modo === "api") {
      try {
        const res = await fetch("/api/admin/config", { cache: "no-store" });
        if (res.status === 404) return { overlay: null, modo, origem: "servidor (vazio)" };
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        return { overlay: json, modo, origem: "servidor" };
      } catch (e) {
        return { overlay: null, modo: "export", origem: "fallback export (" + e.message + ")" };
      }
    }
    // Modo exportação: rascunho de sessão apenas (nunca localStorage).
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) return { overlay: JSON.parse(raw), modo, origem: "rascunho da sessão" };
    } catch (e) { /* ignore */ }
    return { overlay: null, modo, origem: "vazio" };
  }

  async function salvarOverlay(overlay) {
    const modo = await detectMode();
    if (modo === "api") {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overlay, null, 2)
      });
      if (!res.ok) throw new Error("Falha ao gravar no servidor (HTTP " + res.status + ")");
      return { persistido: true, destino: "servidor (data/admin-config.json + backup automático)" };
    }
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(overlay)); } catch (e) { /* quota */ }
    return { persistido: false, destino: "rascunho da sessão — exporte o JSON para efetivar" };
  }

  function limparRascunhoSessao() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
  }

  // ══════════════════════════════════════════════════════
  // BACKUPS (modo API)
  // ══════════════════════════════════════════════════════
  async function listarBackups() {
    try {
      const res = await fetch("/api/admin/backup", { cache: "no-store" });
      if (!res.ok) return [];
      return await res.json();
    } catch (e) { return []; }
  }

  function urlBackup(id) {
    return "/api/admin/backup?id=" + encodeURIComponent(id);
  }

  // ══════════════════════════════════════════════════════
  // UPLOAD DE PDF (modo API)
  // ══════════════════════════════════════════════════════
  async function uploadPdf(file, nomeSeguro) {
    const buf = await file.arrayBuffer();
    // Validação de conteúdo: assinatura PDF "%PDF-"
    const head = new Uint8Array(buf.slice(0, 5));
    const sig = String.fromCharCode.apply(null, head);
    if (sig !== "%PDF-") throw new Error("Arquivo não é um PDF válido (assinatura ausente).");
    if (file.size > 20 * 1024 * 1024) throw new Error("PDF excede o limite de 20 MB.");

    let base64 = "";
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      base64 += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nomeSeguro, data: base64 })
    });
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try { const j = await res.json(); if (j && j.erro) msg = j.erro; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    return await res.json();
  }

  // ══════════════════════════════════════════════════════
  // HISTÓRICO / AUDITORIA
  // ══════════════════════════════════════════════════════
  async function registrarEvento(evento) {
    const registro = Object.assign({ data: new Date().toISOString() }, evento);
    try {
      await fetch("/api/admin/historico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registro)
      });
      return true;
    } catch (e) {
      // Modo exportação: evento fica apenas na lista em memória do painel.
      return false;
    }
  }

  async function carregarHistorico() {
    try {
      const res = await fetch("/api/admin/historico", { cache: "no-store" });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  // ══════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ══════════════════════════════════════════════════════
  function baixarJSON(obj, nomeArquivo) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function sanitizarNomeArquivo(nome) {
    return String(nome || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._\- ]/g, "")
      .replace(/\s+/g, " ").trim()
      .replace(/\.\./g, "")            // bloqueia traversal
      .replace(/^[.\s]+/, "")
      .slice(0, 120);
  }

  function lerArquivoJSON(file) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () {
        try { resolve(JSON.parse(String(r.result))); }
        catch (e) { reject(new Error("Arquivo não é um JSON válido.")); }
      };
      r.onerror = function () { reject(new Error("Falha ao ler o arquivo.")); };
      r.readAsText(file);
    });
  }

  // ══════════════════════════════════════════════════════
  // EXPORTAÇÃO GLOBAL
  // ══════════════════════════════════════════════════════
  global.AdminPersistence = {
    detectMode,
    carregarConfig,
    salvarOverlay,
    limparRascunhoSessao,
    listarBackups,
    urlBackup,
    uploadPdf,
    registrarEvento,
    carregarHistorico,
    baixarJSON,
    sanitizarNomeArquivo,
    lerArquivoJSON
  };
})(window);
