/**
 * ============================================================
 * ADMIN-GUARD — Proteção client-side do Painel Administrativo
 * ============================================================
 *
 * Mesmo princípio do guard.js (entrada → normalização → salt →
 * SHA-256 → transformação → verificação), adaptado: a entrada é o
 * e-mail corporativo e a regra de domínio é EXATAMENTE @atento.com
 * (sem subdomínios e sem variações como atento.com.br).
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
  // VERIFICADORES DERIVADOS — e-mails reais NÃO presentes
  // ══════════════════════════════════════════════════════
  // Cada {s, v} = {salt, verifier} de um e-mail @atento.com autorizado,
  // derivado com o MESMO pipeline do guard.js:
  //   v = hex( troca-pares( XOR-mascara-sal( inverte-bits( SHA-256( salt || utf8(email) ) ) ) ) )
  // Para liberar novos e-mails, gere o par com scripts/generate-admin-verifiers.mjs
  // (arquivo gitignored, mesmo fluxo do generate-verifiers.mjs) e adicione aqui.
  const G = [
    { s: "f2d0c9a3b8e14f2d8a5c6b7d9e0f1a2b", v: "24fa3b7c3701cdd9a4d692d82f3706528e34c81406e0b1f6401a36eb005a69f2" },
    { s: "4a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d", v: "8edcf8668e93070e961b328690828ff2a2b92e3c4144288c4259424ddcca2658" }
  ];

  // ══════════════════════════════════════════════════════
  // REGRA DE DOMÍNIO — somente @atento.com exato
  // ══════════════════════════════════════════════════════
  const DOMAIN = "@atento.com";
  const EMAIL_RE = /^[a-z0-9._%+\-]+@atento\.com$/;

  // ══════════════════════════════════════════════════════
  // SESSÃO
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

  async function verifyEmail(input) {
    var email = normalizeEmail(input);
    if (!isCorporateDomain(email)) return false;
    for (var i = 0; i < G.length; i++) {
      var v = await deriveVerifier(email, G[i].s);
      if (v === G[i].v) return true;
    }
    return false;
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
  GUARD_STYLE.textContent = "html[data-admin-hidden] body{display:flex!important;align-items:center;justify-content:center;min-height:100vh}";
  document.head.appendChild(GUARD_STYLE);

  var AUTH_CSS = [
    "#af{display:none;position:fixed;inset:0;z-index:999999;background:#f0ede8;font-family:'Poppins',sans-serif;color:#1a1714}",
    "#af.show{display:flex;align-items:center;justify-content:center}",
    ".af-c{width:min(420px,92vw);text-align:center;padding:48px 32px}",
    ".af-icon{height:60px;width:auto;margin:0 auto 16px;object-fit:contain}",
    ".af-title{font-size:20px;font-weight:700;margin-bottom:12px;letter-spacing:-0.3px}",
    ".af-desc{font-size:14px;color:#4a453f;margin-bottom:32px;line-height:1.6}",
    ".af-input{width:100%;font-family:'Poppins',sans-serif;font-size:16px;font-weight:600;text-align:center;padding:14px 16px;border:2px solid #d4cfc8;border-radius:10px;background:#fff;outline:none;color:#1a1714;transition:border-color .2s,box-shadow .2s;box-sizing:border-box}",
    ".af-input:focus{border-color:#efa27f;box-shadow:none}",
    ".af-input::placeholder{color:#b0aaa3;font-weight:400;font-size:15px}",
    ".af-btn{width:100%;margin-top:18px;padding:14px 24px;font-family:'Poppins',sans-serif;font-size:15px;font-weight:600;border:none;border-radius:10px;cursor:pointer;background:#01426A;color:#fff;transition:background .2s,transform .1s;letter-spacing:0.2px}",
    ".af-btn:hover{background:#013756}",
    ".af-btn:active{transform:scale(0.98)}",
    ".af-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}",
    ".af-msg{margin-top:16px;padding:12px 16px;border-radius:8px;font-size:13px;font-weight:500;line-height:1.5;display:none}",
    ".af-msg.err{display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}",
    ".af-msg.ok{display:block;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}",
    ".af-footer{margin-top:40px;font-size:12px;color:#7a756e}"
  ].join("\n");

  function createAuthUI() {
    var style = document.createElement("style");
    style.textContent = AUTH_CSS;
    document.head.appendChild(style);

    var overlay = document.createElement("div");
    overlay.id = "af";
    overlay.innerHTML =
      '<div class="af-c">' +
        '<img class="af-icon" src="logomarca.png" alt="Logo" decoding="async">' +
        '<h1 class="af-title">Painel Administrativo</h1>' +
        '<p class="af-desc">Acesso restrito.<br>Informe seu e-mail corporativo <strong>@atento.com</strong></p>' +
        '<input type="email" class="af-input" id="afInput" placeholder="nome.sobrenome@atento.com" autocomplete="username" spellcheck="false">' +
        '<button type="button" class="af-btn" id="afBtn">Validar acesso</button>' +
        '<div class="af-msg" id="afMsg"></div>' +
        '<p class="af-footer">Ambiente administrativo protegido</p>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.classList.add("show");
    setTimeout(function () { document.getElementById("afInput").focus(); }, 100);

    document.getElementById("afInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); doVerify(); }
    });
    document.getElementById("afBtn").addEventListener("click", doVerify);

    function doVerify() {
      var input = document.getElementById("afInput").value.trim();
      var msg = document.getElementById("afMsg");
      var btn = document.getElementById("afBtn");

      if (!input || input.indexOf("@") === -1) {
        msg.textContent = "Informe um e-mail corporativo válido (ex.: nome.sobrenome@atento.com).";
        msg.className = "af-msg err";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Validando…";

      verifyEmail(input).then(function (ok) {
        if (ok) {
          msg.textContent = "✓ Acesso autorizado";
          msg.className = "af-msg ok";
          grantSession(normalizeEmail(input));
          setTimeout(function () {
            overlay.classList.remove("show");
            overlay.parentNode.removeChild(overlay);
            revealContent();
          }, 600);
        } else {
          // Mensagem genérica: não revela se o e-mail existe ou falta apenas permissão.
          msg.textContent = "✕ Não foi possível autorizar este acesso.";
          msg.className = "af-msg err";
          btn.disabled = false;
          btn.textContent = "Validar acesso";
          document.getElementById("afInput").focus();
          document.getElementById("afInput").select();
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
  // ══════════════════════════════════════════════════════
  window.atentoAdminEndSession = function () {
    try {
      sessionStorage.removeItem(ADMIN_TK);
      sessionStorage.removeItem(ADMIN_TX);
      sessionStorage.removeItem(ADMIN_TE);
    } catch (e) { /* ignore */ }
    window.location.reload();
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
    return path === "/admin" || path === "/admin.html";
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
