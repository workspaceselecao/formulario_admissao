/**
 * ============================================================
 * GUARD — Proteção Client-Side por Chaves Derivadas
 * ============================================================
 *
 * Proteção de rotas usando verificação criptográfica derivada.
 * As chaves reais NUNCA existem neste arquivo.
 *
 * Pipeline: entrada → normalização → salt → SHA-256 → transformação → verificação.
 *
 * Limitação: esta é uma proteção client-side. Um usuário avançado
 * com controle do navegador pode potencialmente contornar esta verificação.
 * Não é uma alternativa a autenticação server-side.
 */

(function () {
  "use strict";

  // ══════════════════════════════════════════════════════
  // VERIFICADORES (derivados — chaves reais NÃO presentes)
  // ══════════════════════════════════════════════════════
  const G = [
    {s:"647bf95884b9ac63be150662af7f6606",v:"496628d3534827646656c7a2242c3053ec229ada9cb7771c81d8361ba64a1263"},
    {s:"fa3f3a5b49a7a2ec2fbbab6c3535622f",v:"b8d2b520eaf647e916306a91287fadcc3c51dc1eb6676526f061de7c0205a741"},
    {s:"65d0cd525429b66788bfb0f6a2429913",v:"8d1e1385be51a64cadcc20922a9031b33fe801064cfd1d494de88e6454376494"},
    {s:"f227731aadf2d541412b56e9a396a7e7",v:"625d719e00d26618721c88a111586020af49259a2dd5a16b54f050efb9d6c5df"},
    {s:"79ad39a631416c32d7ebcac26c6c6a94",v:"65d7924d0bf19c63e9c072edafdfb80894f0f770c036305fe7d94a8056c30d01"}
  ];

  // ══════════════════════════════════════════════════════
  // ROTAS PROTEGIDAS
  // ══════════════════════════════════════════════════════
  const PROTECTED = ["/f075", "/f089", "/bradesco", "/termos"];

  // ══════════════════════════════════════════════════════
  // SESSÃO
  // ══════════════════════════════════════════════════════
  const TK = "atf_t";
  const TX = "atf_x";
  const TP = "atf_p";
  const EXPIRY_MS = 60 * 60 * 1000;
  var _refreshTimer = null;

  // ══════════════════════════════════════════════════════
  // CRIPTOGRAFIA
  // ══════════════════════════════════════════════════════
  function normalize(raw) {
    return raw.replace(/[\s\-]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
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

    // Step 1: Bit reversal within each byte
    var reversed = new Uint8Array(32);
    for (var i = 0; i < 32; i++) {
      var b = bytes[i], r = 0;
      for (var j = 0; j < 8; j++) { r = (r << 1) | (b & 1); b >>= 1; }
      reversed[i] = r;
    }

    // Step 2: XOR with mask derived from salt
    var maskStr = "guard-salt-mask-v1:" + salt;
    var maskData = new Uint8Array(maskStr.length);
    for (var i = 0; i < maskStr.length; i++) maskData[i] = maskStr.charCodeAt(i);
    var maskBuf = await crypto.subtle.digest("SHA-256", maskData);
    var mask = new Uint8Array(maskBuf);

    var xored = new Uint8Array(32);
    for (var i = 0; i < 32; i++) xored[i] = reversed[i] ^ mask[i];

    // Step 3: Pairwise byte swap
    var shuffled = new Uint8Array(32);
    for (var i = 0; i < 32; i += 2) {
      shuffled[i] = xored[i + 1];
      shuffled[i + 1] = xored[i];
    }

    // Step 4: Hex encode (lowercase)
    var hex = "";
    for (var i = 0; i < 32; i++) hex += shuffled[i].toString(16).padStart(2, "0");
    return hex;
  }

  // ══════════════════════════════════════════════════════
  // VERIFICAÇÃO DE CHAVE
  // ══════════════════════════════════════════════════════
  async function verifyCode(input) {
    var norm = normalize(input);
    if (!norm.startsWith("ATN") || norm.length !== 15) return false;
    for (var i = 0; i < G.length; i++) {
      var v = await deriveVerifier(norm, G[i].s);
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

  function sessionValid(path) {
    try {
      var tk = sessionStorage.getItem(TK);
      var tx = sessionStorage.getItem(TX);
      var tp = sessionStorage.getItem(TP);
      if (!tk || !tx || !tp) return false;
      if (tp !== path) return false;
      return Date.now() < parseInt(tx, 10);
    } catch (e) { return false; }
  }

  function grantSession(path) {
    sessionStorage.setItem(TK, genToken());
    sessionStorage.setItem(TX, String(Date.now() + EXPIRY_MS));
    sessionStorage.setItem(TP, path);
  }

  function refreshSession() {
    try {
      var tx = sessionStorage.getItem(TX);
      if (tx) sessionStorage.setItem(TX, String(Date.now() + EXPIRY_MS));
    } catch (e) { /* ignore */ }
  }

  function scheduleRefresh() {
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(refreshSession, 30000);
  }

  // ══════════════════════════════════════════════════════
  // UI — TELA DE AUTENTICAÇÃO
  // ══════════════════════════════════════════════════════
  var AUTH_CSS = [
    "#af{display:none;position:fixed;inset:0;z-index:999999;background:#f0ede8;font-family:'Poppins',sans-serif;color:#1a1714}",
    "#af.show{display:flex;align-items:center;justify-content:center}",
    ".af-c{width:min(420px,92vw);text-align:center;padding:48px 32px}",
    ".af-logo{height:64px;width:auto;margin:0 auto 32px;object-fit:contain}",
    ".af-icon{font-size:40px;margin-bottom:16px}",
    ".af-title{font-size:20px;font-weight:700;margin-bottom:12px;letter-spacing:-0.3px}",
    ".af-desc{font-size:14px;color:#4a453f;margin-bottom:32px;line-height:1.6}",
    ".af-input{width:100%;font-family:'Poppins',sans-serif;font-size:18px;font-weight:600;letter-spacing:2px;text-align:center;padding:14px 16px;border:2px solid #d4cfc8;border-radius:10px;background:#fff;outline:none;color:#1a1714;transition:border-color .2s,box-shadow .2s;box-sizing:border-box}",
    ".af-input:focus{border-color:#01426A;box-shadow:0 0 0 3px rgba(1,66,106,0.15)}",
    ".af-input::placeholder{color:#b0aaa3;font-weight:400;letter-spacing:1px;font-size:16px}",
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
    // Inject CSS
    var style = document.createElement("style");
    style.textContent = AUTH_CSS;
    document.head.appendChild(style);

    // Create overlay
    var overlay = document.createElement("div");
    overlay.id = "af";
    overlay.innerHTML =
      '<div class="af-c">' +
        '<img class="af-logo" src="atento.svg" alt="Atento" width="194" height="194" decoding="async">' +
        '<div class="af-icon">🔐</div>' +
        '<h1 class="af-title">Acesso protegido</h1>' +
        '<p class="af-desc">Digite sua chave de acesso para continuar.</p>' +
        '<input type="text" class="af-input" id="afInput" placeholder="ATN-____-____-____" maxlength="18" autocomplete="off" spellcheck="false">' +
        '<button type="button" class="af-btn" id="afBtn">Validar acesso</button>' +
        '<div class="af-msg" id="afMsg"></div>' +
        '<p class="af-footer">🔒 Ambiente protegido</p>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.classList.add("show");

    // Focus input
    setTimeout(function () { document.getElementById("afInput").focus(); }, 100);

    // Mask input: ATN-XXXX-XXXX-XXXX
    document.getElementById("afInput").addEventListener("input", function (e) {
      var raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      var f = "", pos = 0;
      for (var i = 0; i < raw.length && i < 15; i++) {
        if (i === 3 || i === 7 || i === 11) f += "-";
        f += raw[i];
      }
      e.target.value = f;
    });

    // Enter key
    document.getElementById("afInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); doVerify(); }
    });

    // Button click
    document.getElementById("afBtn").addEventListener("click", function () {
      doVerify();
    });

    // Verify
    function doVerify() {
      var input = document.getElementById("afInput").value.trim();
      var msg = document.getElementById("afMsg");
      var btn = document.getElementById("afBtn");

      if (input.length < 5) {
        msg.textContent = "Formato de chave inválido. Verifique a chave informada.";
        msg.className = "af-msg err";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Validando…";

      verifyCode(input).then(function (ok) {
        if (ok) {
          msg.textContent = "✓ Acesso autorizado";
          msg.className = "af-msg ok";
          grantSession(window.location.pathname);
          setTimeout(function () {
            overlay.classList.remove("show");
            overlay.parentNode.removeChild(overlay);
            revealContent();
          }, 600);
        } else {
          msg.textContent = "✕ Chave inválida. Não foi possível autorizar este acesso.";
          msg.className = "af-msg err";
          btn.disabled = false;
          btn.textContent = "Validar acesso";
          document.getElementById("afInput").focus();
          document.getElementById("afInput").select();
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════
  // REVELAR CONTEÚDO
  // ══════════════════════════════════════════════════════
  function revealContent() {
    document.documentElement.removeAttribute("data-guard-hidden");
  }

  // ══════════════════════════════════════════════════════
  // ENCERRAR SESSÃO (exposta globalmente)
  // ══════════════════════════════════════════════════════
  window.atentoEndSession = function () {
    try {
      sessionStorage.removeItem(TK);
      sessionStorage.removeItem(TX);
      sessionStorage.removeItem(TP);
    } catch (e) { /* ignore */ }
    window.location.reload();
  };

  // ══════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════
  function isProtected(path) {
    for (var i = 0; i < PROTECTED.length; i++) {
      if (path === PROTECTED[i]) return true;
    }
    return false;
  }

  var path = window.location.pathname;
  if (isProtected(path)) {
    // Hide content immediately — body may not exist yet
    document.documentElement.setAttribute("data-guard-hidden", "");

    document.addEventListener("DOMContentLoaded", function () {
      if (sessionValid(path)) {
        refreshSession();
        revealContent();
        // Refresh on user activity
        document.addEventListener("click", scheduleRefresh);
        document.addEventListener("keypress", scheduleRefresh);
        document.addEventListener("touchstart", scheduleRefresh);
      } else {
        createAuthUI();
      }
    });
  }
})();
