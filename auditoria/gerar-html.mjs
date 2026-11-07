// Converte AUDITORIA-COMPLETA.md em um HTML único e autorrente (offline-friendly).
// Uso: node gerar-html.mjs   (roda dentro de auditoria/; sem dependências externas)
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "AUDITORIA-COMPLETA.md";
const DST = "AUDITORIA-COMPLETA.html";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function slug(t) {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const CODE_OPEN = "\u2401", CODE_CLOSE = "\u2402";

function inline(raw, ids) {
  let s = esc(raw);
  // preserva <br/> inteiro (usado em tabelas/diagramas dos originais)
  s = s.replace(/&lt;br\/?&gt;/g, "<br/>");
  // code spans → placeholders para não serem reformatted
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return CODE_OPEN + (codes.length - 1) + CODE_CLOSE; });
  // links
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, h) => `<a href="${h}">${t}</a>`);
  // bold / itálico
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(«"'—–-])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // restaura code spans
  s = s.replace(new RegExp(CODE_OPEN + "(\\d+)" + CODE_CLOSE, "g"), (m, i) => `<code>${codes[+i]}</code>`);
  return s;
}

function render(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  const ids = new Set();
  let i = 0;
  let closeLists = () => {};
  while (i < lines.length) {
    const line = lines[i];

    // ---------- cercas de código ----------
    if (/^```/.test(line)) {
      closeLists(); closeLists = () => {};
      const lang = line.slice(3).trim();
      i++; const body = [];
      while (i < lines.length && !/^```/.test(lines[i])) { body.push(lines[i]); i++; }
      i++; // fecha
      if (lang === "mermaid") {
        out.push(`<pre class="mermaid">${esc(body.join("\n"))}</pre>`);
      } else {
        out.push(`<pre class="cod"><code>${esc(body.join("\n"))}</code></pre>`);
      }
      continue;
    }
    if (/^\s*$/.test(line)) { closeLists(); closeLists = () => {}; i++; continue; }

    // ---------- separador ----------
    if (/^-{3,}\s*$/.test(line) || /^\*{3,}\s*$/.test(line)) {
      closeLists(); closeLists = () => {}; out.push("<hr/>"); i++; continue;
    }

    // ---------- títulos ----------
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeLists(); closeLists = () => {};
      const level = h[1].length, text = h[2].trim();
      let id = slug(text.replace(/\*\*/g, "")); let base = id, n = 2;
      while (ids.has(id)) id = base + "-" + n++;
      ids.add(id);
      out.push(`<h${level} id="${id}">${inline(text, ids)}</h${level}>`);
      i++; continue;
    }

    // ---------- tabela ----------
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeLists(); closeLists = () => {};
      const head = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim()));
        i++;
      }
      let t = `<table><thead><tr>${head.map(c => `<th>${inline(c, ids)}</th>`).join("")}</tr></thead><tbody>`;
      for (const r of rows) t += `<tr>${r.map(c => `<td>${inline(c, ids)}</td>`).join("")}</tr>`;
      t += "</tbody></table>";
      out.push(t);
      continue;
    }

    // ---------- listas (bullets e numeradas, com um nível de aninhamento) ----------
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      const indent = Math.floor(li[1].length / 2);
      const ordered = /(\d+\.)$/.test(li[0].trim()) || /^\d+\./.test(li[2]);
      const text = li[3];
      // fecha listas mais profundas
      if (openLists.length && openLists[openLists.length - 1].n > indent) {
        const top = openLists.pop(); out.push(`</li></${top.tag}>`);
      }
      if (!openLists.length || openLists[openLists.length - 1].n < indent) {
        const tag = ordered ? "ol" : "ul"; openLists.push({ n: indent, tag });
        out.push(`<${tag}><li>${inline(text, ids)}`);
      } else {
        out.push(`</li><li>${inline(text, ids)}`);
      }
      // garante fechamento no próximo bloco não-lista
      closeLists = () => {
        while (openLists.length) { const top = openLists.pop(); out.push(`</li></${top.tag}>`); }
      };
      i++; continue;
    }

    // ---------- parágrafo ----------
    closeLists(); closeLists = () => {};
    const para = [line]; i++;
    while (
      i < lines.length && !/^\s*$/.test(lines[i]) && !/^```/.test(lines[i]) &&
      !/^-{3,}\s*$/.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) &&
      !/^(\s*)([-*]|\d+\.)\s+/i.test(lines[i])
    ) { para.push(lines[i]); i++; }
    out.push(`<p>${inline(para.join(" "), ids)}</p>`);
  }
  closeLists();
  return { body: out.join("\n"), headings: null };
}

let openLists = [];

const md = readFileSync(SRC, "utf8");
const { body } = render(md);

// índice a partir dos headings "Parte N" presentes no corpo
const partReg = /<h1 id="([^"]+)">(Parte[^<]*)<\/h1>/g;
const parts = []; let m;
while ((m = partReg.exec(body)) !== null) parts.push({ id: m[1], title: m[2] });

const nav = parts.map(p => `<a href="#${p.id}">${p.title.replace(/^Parte\s*(\d+).*/, "Parte $1")}</a>`).join("");
const toc = parts.map(p => `<li><a href="#${p.id}">${p.title}</a></li>`).join("");

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Auditoria completa — Formulários de Admissão</title>
<style>
  :root { --line:#d9dee5; --muted:#5b6472; }
  * { box-sizing:border-box; }
  body { font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; line-height:1.62; color:#1f2937; margin:0; background:#fff; }
  .container { max-width:1080px; margin:0 auto; padding:0 24px 72px; }
  .topnav { position:sticky; top:0; z-index:9; background:#fff; border-bottom:1px solid var(--line); padding:8px 24px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .topnav a { display:inline-block; padding:5px 12px; border-radius:999px; background:#eef2f7; color:#24405e; text-decoration:none; font-size:.85rem; }
  .topnav a:hover { background:#dbe5f0; }
  h1 { font-size:1.7rem; margin:2.2rem 0 .9rem; line-height:1.25; border-bottom:2px solid #e7ebf1; padding-bottom:.4rem; }
  h2 { font-size:1.32rem; margin:2rem 0 .7rem; }
  h3 { font-size:1.08rem; margin:1.4rem 0 .5rem; }
  h4, h5 { margin:1.1rem 0 .4rem; }
  table { border-collapse:collapse; width:100%; margin:1rem 0; font-size:.92rem; }
  th, td { border:1px solid var(--line); padding:7px 10px; text-align:left; vertical-align:top; }
  th { background:#f3f5f8; }
  tr:nth-child(even) td { background:#fbfcfd; }
  code { background:#f5f5f7; border:1px solid #ececf0; border-radius:4px; padding:1px 5px; font-size:.86em; font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace; }
  pre.cod { background:#0f172a; color:#e2e8f0; padding:14px 16px; border-radius:8px; overflow-x:auto; }
  pre.cod code { background:none; border:none; color:inherit; padding:0; }
  pre.mermaid { background:#fbfcfe; border:1px dashed #cbd5e1; border-radius:8px; padding:16px; text-align:center; overflow-x:auto; font-family:ui-monospace,Consolas,monospace; font-size:.82rem; color:#40506b; margin:1.2rem 0; }
  .tocbox { background:#f7f9fc; border:1px solid var(--line); border-radius:10px; padding:14px 20px 14px 40px; margin:1rem 0 2rem; }
  blockquote { border-left:4px solid #cbd5e1; margin:1rem 0; padding:.2rem 1rem; color:var(--muted); }
  hr { border:none; border-top:1px solid var(--line); margin:2rem auto; width:70%; }
  a { color:#1d4ed8; }
  .nota { color:var(--muted); font-size:.85rem; margin-top:.4rem; }
  @media print { .topnav { display:none; } pre.cod { white-space:pre-wrap; } }
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
  window.addEventListener("load", () => {
    if (window.mermaid) {
      window.mermaid.initialize({ startOnLoad:false, theme:"neutral", flowchart:{ curve:"basis" } });
      window.mermaid.run({ querySelector: "pre.mermaid" })
        .catch(err => console.warn("Mermaid indisponível — os diagramas aparecem como código-fonte.", err));
    }
  });
</script>
</head>
<body>
  <  div class="topnav" style="width:100%">${nav}<a href="#toc">⌂ Sumário</a></div>
  <div class="container">
${body}
  </div>
</body>
</html>`;

writeFileSync(DST, html, "utf8");
console.log(`${DST} gerado (${(html.length / 1024).toFixed(1)} KB). Partes: ${parts.length}`);
