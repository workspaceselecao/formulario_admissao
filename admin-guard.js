/**
 * ============================================================
 * ADMIN-GUARD — Proteção client-side do Painel Administrativo
 * ============================================================
 *
 * Autenticação APARTADA dos formulários públicos (guard.js):
 *
 *   1. E-mail corporativo com domínio EXATAMENTE @atento.com
 *      (recusa subdomínios e variações como atento.com.br);
 *   2. Código de acesso EXCLUSIVO do painel (ATN-XXXX-XXXX-XXXX),
 *      com verificadores próprios no array CG abaixo — os códigos
 *      dos outros formulários NÃO autorizam este painel.
 *
 * Pipeline de verificação dos códigos: idêntico ao guard.js
 * (entrada → normalização → salt → SHA-256 → transformação → verificação).
 *
 * Limitação (idêntica à do guard.js, aceita por decisão de projeto):
 * proteção client-side — NÃO é autenticação server-side. Não deve ser
 * apresentada como controle de acesso forte.
 *
 * Sessão: sessionStorage (mesmo padrão do guard.js), expira em 60 min
 * e é renovada por atividade (click/keypress/touchstart a cada 30s).
 * Proibido persistir estado/flag de acesso administrativo em localStorage.
 */

(function () {
  "use strict";

  // ══════════════════════════════════════════════════════
  // VERIFICADORES DOS CÓDIGOS DO PAINEL (derivados — códigos reais
  // NÃO presentes neste arquivo; exclusivos deste módulo)
  // ══════════════════════════════════════════════════════
  // Cada {s, v} = {salt, verifier} de um código exclusivo do painel,
  // derivado com o MESMO pipeline do guard.js:
  //   v = hex( troca-pares( XOR-mascara-sal( inverte-bits( SHA-256( salt || utf8(codigo) ) ) ) ) )
  // Para gerar novos códigos: scripts/generate-admin-verifiers.mjs
  const CG = [
    { s: "505292a1b9ff015a8a048b1bbaafce71", v: "0766a9e5d19738c3f5f1951ce5c029fe20ee0df226393e02cc3b0858a109a68f" },
    { s: "12f205bbcab6ab4f34697c11f3d097eb", v: "e22e3a67ca8bd93164f8baa24c5c5050b251dfa1185e02432074ad3e46f00346" },
    { s: "4c233b9f84149d216caef584aba44011", v: "fb7a22bfe66c8fdfc6c62d817c028543a9641cced3aa7609efe8c96004787579" },
    { s: "4892a303ea3f8e795904229ae0b33452", v: "c982dbf44b167f94ed194955fbfcfb1920e3b8ff71784cf9a98e42a898b4d800" },
    { s: "f8d7747044c86cc4ed35a90070351a13", v: "07db55b2b49fcd7bd69f7461cbe5601b0d98c196e391bb8e2a81b5d198744739" }
  ];

  // ══════════════════════════════════════════════════════
  // REGRAS DE ENTRADA
  // ══════════════════════════════════════════════════════
  const DOMAIN = "@atento.com";
  const EMAIL_RE = /^[a-z0-9._%+\-]+@atento\.com$/;

  // ══════════════════════════════════════════════════════
  // SESSÃO (chaves próprias do painel — apartadas do guard.js)
  // ══════════════════════════════════════════════════════
  const ADMIN_TK = "adm_t";
  const ADMIN_TX = "adm_x";
  const ADMIN_TE = "adm_e";
  const EXPIRY_MS = 60 * 60 * 1000;
  var _refreshTimer = null;

  // ══════════════════════════════════════════════════════
  // CRIPTOGRAFIA — pipeline idêntico ao guard.js
  // ══════════════════════════════════════════════════════
  function normalizeEmail(raw) {
    return String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
  }

  function isCorporateDomain(email) {
    if (!email || email.length <= DOMAIN.length) return false;
    if (!email.endsWith(DOMAIN)) return false; // recusa sub.atento.com, atento.com.br, gmail.com…
    return EMAIL_RE.test(email);
  }

  function normalizeCode(raw) {
    return String(raw || "").replace(/[\s\-]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  async function deriveVerifier(normalized, salt) {
    var data = new Uint8Array(normalized.length);
    for (var i = 0; i < normalized.length; i++) data[i] = normalized.charCodeAt(i);

    var saltData = new Uint8Array(salt.length);
    for (var i = 0; i < salt.length; i++) saltData[i] = salt.charCodeAt(i);

    var combined = new Uint8Array(saltData.length + data.length);
    combined.set(saltData, 0);
    combined.set(data, saltData.length);

    var hashBuf = await crypto.subtle.digest("SHA-256", combined);
    var bytes = new Uint8Array(hashBuf);

    // Etapa 1: inversão de bits dentro de cada byte
    var reversed = new Uint8Array(32);
    for (var i = 0; i < 32; i++) {
      var b = bytes[i], r = 0;
      for (var j = 0; j < 8; j++) { r = (r << 1) | (b & 1); b >>= 1; }
      reversed[i] = r;
    }

    // Etapa 2: XOR com máscara derivada do salt (constante compartilhada com guard.js)
    var maskStr = "guard-salt-mask-v1:" + salt;
    var maskData = new Uint8Array(maskStr.length);
    for (var i = 0; i < maskStr.length; i++) maskData[i] = maskStr.charCodeAt(i);
    var maskBuf = await crypto.subtle.digest("SHA-256", maskData);
    var mask = new Uint8Array(maskBuf);

    var xored = new Uint8Array(32);
    for (var i = 0; i < 32; i++) xored[i] = reversed[i] ^ mask[i];

    // Etapa 3: troca de bytes em pares
    var shuffled = new Uint8Array(32);
    for (var i = 0; i < 32; i += 2) {
      shuffled[i] = xored[i + 1];
      shuffled[i + 1] = xored[i];
    }

    // Etapa 4: hex (minúsculas)
    var hex = "";
    for (var i = 0; i < 32; i++) hex += shuffled[i].toString(16).padStart(2, "0");
    return hex;
  }

  // Verifica o CÓDIGO exclusivo do painel contra o corpus CG
  async function verifyPanelCode(input) {
    var norm = normalizeCode(input);
    if (!norm.startsWith("ATN") || norm.length !== 15) return false;
    for (var i = 0; i < CG.length; i++) {
      var v = await deriveVerifier(norm, CG[i].s);
      if (v === CG[i].v) return true;
    }
    return false;
  }

  // Autenticação do painel: domínio @atento.com + código exclusivo
  async function verifyAcesso(emailRaw, codeRaw) {
    var email = normalizeEmail(emailRaw);
    if (!isCorporateDomain(email)) return { ok: false, email: "" };
    var codeOk = await verifyPanelCode(codeRaw);
    if (!codeOk) return { ok: false, email: "" };
    return { ok: true, email: email };
  }

  // ══════════════════════════════════════════════════════
  // SESSÃO
  // ══════════════════════════════════════════════════════
  function genToken() {
    var a = new Uint8Array(32);
    crypto.getRandomValues(a);
    return Array.from(a, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function sessionValid() {
    try {
      var tk = sessionStorage.getItem(ADMIN_TK);
      var tx = sessionStorage.getItem(ADMIN_TX);
      var te = sessionStorage.getItem(ADMIN_TE);
      if (!tk || !tx || !te) return false;
      if (!isCorporateDomain(String(te))) return false;
      return Date.now() < parseInt(tx, 10);
    } catch (e) { return false; }
  }

  function grantSession(email) {
    sessionStorage.setItem(ADMIN_TK, genToken());
    sessionStorage.setItem(ADMIN_TX, String(Date.now() + EXPIRY_MS));
    sessionStorage.setItem(ADMIN_TE, email);
  }

  function adminEmail() {
    try { return sessionStorage.getItem(ADMIN_TE) || ""; } catch (e) { return ""; }
  }

  function refreshSession() {
    try {
      var tx = sessionStorage.getItem(ADMIN_TX);
      if (tx) sessionStorage.setItem(ADMIN_TX, String(Date.now() + EXPIRY_MS));
    } catch (e) { /* ignore */ }
  }

  function scheduleRefresh() {
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(refreshSession, 30000);
  }

  // ══════════════════════════════════════════════════════
  // UI — TELA DE AUTENTICAÇÃO (identidade visual do guard.js)
  // ══════════════════════════════════════════════════════
  var GUARD_STYLE = document.createElement("style");
  // Centralização com rolagem segura em telas baixas: em vez de center rígido,
  // margens automáticas garantem o centro SEM cortar o card quando o conteúdo
  // excede a altura da tela (mobile landscape, teclado aberto etc.).
  GUARD_STYLE.textContent = "html[data-admin-hidden] body{display:flex!important;flex-direction:column;align-items:center;min-height:100vh;margin:0 auto}";
  document.head.appendChild(GUARD_STYLE);

  var AUTH_CSS = [
    "#af{display:none;position:fixed;inset:0;z-index:999999;background:#f0ede8;font-family:'Poppins',sans-serif;color:#1a1714;-webkit-overflow-scrolling:touch}",
    // Centralização segura: margin:auto no card centraliza quando há espaço e,
    // quando falta espaço (mobile/teclado), resolve para 0 e o overlay rola —
    // sem o corte de topo do justify-content:center em flex com overflow.
    "#af.show{display:flex;flex-direction:column;align-items:center;overflow-y:auto;padding:24px 16px}",
    ".af-c{width:min(420px,92vw);text-align:center;padding:48px 32px;margin:auto}",
    ".af-icon{height:60px;width:auto;margin:0 auto 16px;object-fit:contain}",
    ".af-title{font-size:20px;font-weight:700;margin-bottom:12px;letter-spacing:-0.3px}",
    ".af-desc{font-size:14px;color:#4a453f;margin-bottom:28px;line-height:1.6}",
    ".af-label{display:block;text-align:left;font-size:12px;font-weight:600;color:#4a453f;margin:0 2px 6px;letter-spacing:.3px}",
    ".af-input{width:100%;font-family:'Poppins',sans-serif;font-size:16px;font-weight:600;text-align:center;padding:13px 16px;border:2px solid #d4cfc8;border-radius:10px;background:#fff;outline:none;color:#1a1714;transition:border-color .2s,box-shadow .2s;box-sizing:border-box}",
    ".af-input:focus{border-color:#efa27f;box-shadow:none}",
    ".af-input::placeholder{color:#b0aaa3;font-weight:400;font-size:14px}",
    ".af-input--code{font-size:17px;letter-spacing:2px}",
    ".af-btn{width:100%;margin-top:20px;padding:14px 24px;font-family:'Poppins',sans-serif;font-size:15px;font-weight:600;border:none;border-radius:10px;cursor:pointer;background:#01426A;color:#fff;transition:background .2s,transform .1s;letter-spacing:0.2px}",
    ".af-btn:hover{background:#013756}",
    ".af-btn:active{transform:scale(0.98)}",
    ".af-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}",
    ".af-msg{margin-top:16px;padding:12px 16px;border-radius:8px;font-size:13px;font-weight:500;line-height:1.5;display:none}",
    ".af-msg.err{display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}",
    ".af-msg.ok{display:block;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}",
    ".af-footer{margin-top:40px;font-size:12px;color:#7a756e}",
    "@media (max-width:380px){.af-c{padding:36px 20px}.af-icon{height:48px}.af-title{font-size:18px}}",
  ].join("\n");

  function createAuthUI() {
    var style = document.createElement("style");
    style.textContent = AUTH_CSS;
    document.head.appendChild(style);

    var overlay = document.createElement("div");
    overlay.id = "af";
    overlay.innerHTML =
      '<div class="af-c">' +
        '<img class="af-icon" src="/logomarca.png" alt="Logo" decoding="async">' +
        '<h1 class="af-title">Painel Administrativo</h1>' +
        '<p class="af-desc">Acesso restrito.</p>' +
        '<label class="af-label" for="afEmail">E-mail corporativo</label>' +
        '<input type="email" class="af-input" id="afEmail" autocomplete="username" spellcheck="false">' +
        '<label class="af-label" for="afCode" style="margin-top:14px">Código de acesso (exclusivo do painel)</label>' +
        '<input type="text" class="af-input af-input--code" id="afCode" placeholder="ATN-____-____-____" maxlength="18" autocomplete="off" spellcheck="false">' +
        '<button type="button" class="af-btn" id="afBtn">Validar acesso</button>' +
        '<div class="af-msg" id="afMsg"></div>' +
        '<p class="af-footer">Ambiente administrativo protegido</p>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.classList.add("show");
    setTimeout(function () { document.getElementById("afEmail").focus(); }, 100);

    // Máscara do código: ATN-XXXX-XXXX-XXXX (mesma do guard.js)
    document.getElementById("afCode").addEventListener("input", function (e) {
      var raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      var f = "", pos = 0;
      for (var i = 0; i < raw.length && i < 15; i++) {
        if (i === 3 || i === 7 || i === 11) f += "-";
        f += raw[i];
      }
      e.target.value = f;
    });

    function doVerifyOnEnter(e) { if (e.key === "Enter") { e.preventDefault(); doVerify(); } }
    document.getElementById("afEmail").addEventListener("keydown", doVerifyOnEnter);
    document.getElementById("afCode").addEventListener("keydown", doVerifyOnEnter);
    document.getElementById("afBtn").addEventListener("click", doVerify);

    function doVerify() {
      var email = document.getElementById("afEmail").value.trim();
      var code = document.getElementById("afCode").value.trim();
      var msg = document.getElementById("afMsg");
      var btn = document.getElementById("afBtn");

      if (!email || email.indexOf("@") === -1) {
        msg.textContent = "Informe um e-mail corporativo válido.";
        msg.className = "af-msg err";
        return;
      }
      if (!code) {
        msg.textContent = "Informe o código de acesso do painel.";
        msg.className = "af-msg err";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Validando…";

      verifyAcesso(email, code).then(function (r) {
        if (r.ok) {
          msg.textContent = "✓ Acesso autorizado";
          msg.className = "af-msg ok";
          grantSession(r.email);
          setTimeout(function () {
            overlay.classList.remove("show");
            overlay.parentNode.removeChild(overlay);
            revealContent();
          }, 600);
        } else {
          // Mensagem genérica: não revela se o e-mail existe, se o domínio
          // falhou ou se o código é inválido.
          msg.textContent = "✕ Não foi possível autorizar este acesso.";
          msg.className = "af-msg err";
          btn.disabled = false;
          btn.textContent = "Validar acesso";
          document.getElementById("afEmail").focus();
          document.getElementById("afEmail").select();
        }
      }).catch(function () {
        msg.textContent = "✕ Não foi possível autorizar este acesso.";
        msg.className = "af-msg err";
        btn.disabled = false;
        btn.textContent = "Validar acesso";
      });
    }
  }

  // ══════════════════════════════════════════════════════
  // REVELAR CONTEÚDO
  // ══════════════════════════════════════════════════════
  function revealContent() {
    document.documentElement.removeAttribute("data-admin-hidden");
    if (GUARD_STYLE && GUARD_STYLE.parentNode) GUARD_STYLE.parentNode.removeChild(GUARD_STYLE);
  }

  // ══════════════════════════════════════════════════════
  // ENCERRAR SESSÃO ADMINISTRATIVA (exposta globalmente)
  // Desloga e leva o usuário à Home do Hub. location.replace()
  // remove o painel do histórico — "Voltar" não retorna ao painel.
  // ══════════════════════════════════════════════════════
  window.atentoAdminEndSession = function () {
    try {
      sessionStorage.removeItem(ADMIN_TK);
      sessionStorage.removeItem(ADMIN_TX);
      sessionStorage.removeItem(ADMIN_TE);
    } catch (e) { /* ignore */ }
    window.location.replace("/");
  };

  window.atentoAdminEmail = adminEmail;

  // ══════════════════════════════════════════════════════
  // INICIALIZAÇÃO — somente no painel
  // ══════════════════════════════════════════════════════
  function currentPath() {
    var p = window.location.pathname.replace(/\/+$/, "");
    return p || "/";
  }

  function isProtected(path) {
    // Protege qualquer URL sob /admin, em todas as variantes: /admin,
    // /admin/, /admin.html, /admin/index.html, /admin/admin.html e as
    // formas cleanUrls da Vercel (/admin/admin, /admin/index — redirects
    // dos arquivos .html). Tudo dentro de /admin/ é do painel; nenhuma
    // página pública começa com /admin, então a regra não gera falso
    // positivo (ex.: "/administrator" NÃO casa — exige a barra).
    var p = String(path || "").replace(/\/+$/, "");
    return p === "/admin" || p === "/admin.html" || p.startsWith("/admin/");
  }

  var path = currentPath();
  if (isProtected(path)) {
    document.documentElement.setAttribute("data-admin-hidden", "");

    document.addEventListener("DOMContentLoaded", function () {
      if (sessionValid()) {
        refreshSession();
        revealContent();
        document.addEventListener("click", scheduleRefresh);
        document.addEventListener("keypress", scheduleRefresh);
        document.addEventListener("touchstart", scheduleRefresh);
      } else {
        try { sessionStorage.removeItem(ADMIN_TK); sessionStorage.removeItem(ADMIN_TX); sessionStorage.removeItem(ADMIN_TE); } catch (e) { /* ignore */ }
        createAuthUI();
      }
    });
  }
})();
