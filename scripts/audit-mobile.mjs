/**
 * ============================================================
 * AUDIT-MOBILE — Detecta transbordamentos horizontais a 360px
 * ============================================================
 *
 * Uso: node scripts/audit-mobile.mjs [width] [height]
 * Abre cada página do site num Chrome/Edge headless com viewport
 * mobile (360×740, DPR 3) e mede:
 *   - documentElement.scrollWidth vs clientWidth (transbordamento)
 *   - elementos que ultrapassam a largura visível (até 6 exemplos)
 *
 * Requer puppeteer-core (npm i --no-save puppeteer-core) e
 * Chrome ou Edge instalado na máquina (detecção automática).
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PORT = parseInt(process.env.PORT, 10) || 3456;
const HOST = "127.0.0.1";
const W = parseInt(process.argv[2] || "360", 10);
const H = parseInt(process.argv[3] || "740", 10);

const ROUTES = [
  "/",
  "/f075",
  "/f089",
  "/bradesco",
  "/termos",
  "/admin",
  "/Docs/",
];

// Guarda de segurança: servidor precisa estar no ar
async function assertServer() {
  try {
    const res = await fetch(`http://${HOST}:${PORT}/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    throw new Error(`Servidor não respondeu em http://${HOST}:${PORT} (${e.message}). Inicie com: node scripts/test-server.mjs`);
  }
}

function findChrome() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "CDIRX86:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ];
  for (const p of candidates) {
    const real = p.replace("CDIRX86:", "C:");
    try {
      if (fs.existsSync(real)) return real;
    } catch { /* ignore */ }
  }
  throw new Error("Chrome ou Edge não encontrado para puppeteer-core");
}

// Semeia as sessões dos guards ANTES dos scripts da página rodarem,
// para que o conteúdo real (formulários/painel) seja revelado e medido.
function seedSession(route) {
  try {
    sessionStorage.setItem('atf_t', 'audit');
    sessionStorage.setItem('atf_x', String(Date.now() + 3600000));
    sessionStorage.setItem('atf_p', route);
  } catch (e) {}
  try {
    sessionStorage.setItem('adm_t', 'audit');
    sessionStorage.setItem('adm_x', String(Date.now() + 3600000));
    sessionStorage.setItem('adm_e', 'audit@atento.com');
  } catch (e) {}
}

// Detecta transbordamento: mede scrollWidth e coleta elementos fora da viewport
function collectOverflow(w) {
  const de = document.documentElement;
  const overflowX = de.scrollWidth - de.clientWidth;
  const wide = [];
  if (document.body) {
    const all = document.body.querySelectorAll("*");
    const lim = Math.min(all.length, 2500);
    for (let i = 0; i < lim; i++) {
      const el = all[i];
      const r = el.getBoundingClientRect();
      if (r.width > 5 && (r.right > de.clientWidth + 1 || r.left < -1)) {
        const cs = getComputedStyle(el);
        if (cs.position === "fixed") continue;
        wide.push(
          el.tagName.toLowerCase() +
            (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : "") +
            "→right=" + Math.round(r.right) + ",left=" + Math.round(r.left)
        );
      }
    }
  }
  return { overflowX, clientW: de.clientWidth, scrollW: de.scrollWidth, wide: wide.slice(0, 6), vw: w };
}

async function main() {
  await assertServer();
  const exe = findChrome();
  console.log(`Auditoria mobile ${W}×${H} — navegador: ${exe.includes("chrome") ? "Chrome" : "Edge"}`);

  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--hide-scrollbars"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

    let totalIssues = 0;
    const summary = [];

    for (const route of ROUTES) {
      const url = `http://${HOST}:${PORT}${route}`;
      // Sessão semeada ANTES dos scripts: o guard revela o conteúdo real
      await page.evaluateOnNewDocument(seedSession, route);
      try {
        await page.goto(url, { waitUntil: "load", timeout: 20000 });
      } catch (e) {
        summary.push({ route, err: "load timeout" });
        console.log(`✖ ${route}: falha ao carregar`);
        continue;
      }

      // Aguarda layout assentado
      await new Promise((r) => setTimeout(r, 450));

      let m;
      try {
        m = await page.evaluate(collectOverflow, W);
        // Confirma que o guard revelou o conteúdo (metodologia válida)
        m.revealed = await page.evaluate(
          "!document.documentElement.hasAttribute('data-guard-hidden') && !document.documentElement.hasAttribute('data-admin-hidden')"
        );
      } catch (e) {
        summary.push({ route, err: "eval" });
        continue;
      }

      const hasIssue = m && m.overflowX > 1;
      if (hasIssue) totalIssues++;
      summary.push({ route, ...m });
      const flag = hasIssue ? "❌" : "✅";
      const rev = m.revealed ? "revelado" : "BLOQUEADO";
      console.log(`${flag} ${route}  overflowX=${m ? m.overflowX : "?"}px  (${m ? m.scrollW : "?"} > ${m ? m.clientW : "?"})  [${rev}]${hasIssue ? "  wide: " + m.wide.join(" | ") : ""}`);
    }

    console.log("\n══════════════════════════════════════════");
    console.log(`Resultado: ${totalIssues} rota(s) com transbordamento horizontal`);
    console.log("══════════════════════════════════════════\n");
    process.exitCode = totalIssues > 0 ? 2 : 0;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
