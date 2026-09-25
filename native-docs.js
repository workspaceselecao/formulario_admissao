/**
 * ============================================================
 * GERADOR NATIVO DE PDFs PADRONIZADOS — engine declarativo
 * ============================================================
 *
 * Por que existe (IMPLEMENTAÇÃO DE GERADOR NATIVO D.md, §1/§47/§51): hoje todo
 * documento depende de um PDF pronto + coordenadas. Qualquer mudança de texto
 * fixo, caixa ou linha exige substituir o arquivo inteiro. Aqui o documento
 * passa a ter representação PRÓPRIA (geometria + elementos) e o PDF vira
 * RESULTADO da aplicação, não sua dependência estrutural.
 *
 * Regra de ouro (§47): não "imitar visualmente" — representar matematicamente.
 * Fidelidade geométrica > aparência aproximada.
 *
 * ── Camadas (§34) ─────────────────────────────────────────────
 *   DADOS (candidato)  →  DOCUMENT DEFINITION  →  LAYOUT  →  PDF RENDERER
 * Nada aqui conhece formulário, cidade, regra de negócio ou DOM: este arquivo
 * é o engine puro, reutilizável pela aplicação pública e pelo painel.
 *
 * ── Sistema de coordenadas (§5) ───────────────────────────────
 *   X = distância da esquerda · Y = distância do TOPO · unidade = pt
 * A conversão para o sistema do pdf-lib (origem inferior esquerda) acontece em
 * UM único lugar: `converterY()`. Nenhum outro ponto do código converte Y.
 *
 * ── Perfil de fidelidade da aplicação (§8, extraído do código) ─
 * As páginas atuais desenham o valor assim (ficha_cadastral.html /
 * assistencia_medica.html, `escreverTextoCampoCoord`):   *   fonte Helvetica 9 · x = coordenada.x + 0,5 · truncamento com "…" em
   *   largura − 2 · baseline = y + min(altura × 0,78, 9 × 1,12) − (y > 120 ? 9 : 0)
   * (a última parcela vira `offsetY` positivo no espaço do topo).
 * Esses números NÃO foram inventados: estão em PERFIL_APP e são gravados
 * explicitamente em cada elemento no bootstrap, para o documento gerado bater
 * com o PDF atual.
 *
 * ── Estado da migração (§3/§36) ───────────────────────────────
 * `modoEfetivo()` implementa o modo híbrido: por documento, "external" (atual,
 * intocado) ou "native" (novo engine). Um documento só vale como "native"
 * quando está PUBLICADO e sem erro crítico — assim a aplicação pública não
 * muda de comportamento por acidente (§49, não regressão).
 *
 * ── O que ainda REQUER CALIBRAÇÃO (§52) ───────────────────────
 * O schema de campos dos formulários só conhece os CAMPOS dinâmicos. Textos
 * fixos, linhas, caixas, logotipos e assinaturas do formulário oficial não
 * estão descritos em lugar nenhum do repositório: o bootstrap cria os campos e
 * marca o documento como `pendenteCalibracao`. Reconstrua pelo editor visual
 * ou pela ferramenta "Importar PDF como referência". Nenhum valor é inventado.
 *
 * Sem dependência nova (§46): usa apenas pdf-lib (já no projeto, via CDN no
 * painel e em node_modules nos scripts). Fontes: as 14 padrão do PDF — fontes
 * externas exigiriam embutir arquivo licenciado (§15), decisão documentada em
 * Docs/documentos-nativos.md.
 */
(function (global) {
  "use strict";

  // ══════════════════════════════════════════════════════
  // CONSTANTES
  // ══════════════════════════════════════════════════════
  const SCHEMA_VERSION = "1.0";
  const STATUS_DOC = ["RASCUNHO", "VALIDACAO", "PUBLICADO", "ARQUIVADO"];
  const STATUS_PADRAO = "RASCUNHO";

  /** §7 — tipos mínimos de elemento. */
  const TIPOS = ["text", "field", "line", "rectangle", "circle", "ellipse", "image", "table", "checkbox", "signature", "group"];

  /** §15 — fontes padrão do PDF (não dependem da fonte instalada no computador). */
  const FONTES_PADRAO = {
    "Helvetica": "Helvetica",
    "Helvetica-Bold": "HelveticaBold",
    "Helvetica-Oblique": "HelveticaOblique",
    "Helvetica-BoldOblique": "HelveticaBoldOblique",
    "Times-Roman": "TimesRoman",
    "Times-Bold": "TimesRomanBold",
    "Times-Italic": "TimesRomanItalic",
    "Times-BoldItalic": "TimesRomanBoldItalic",
    "Courier": "Courier",
    "Courier-Bold": "CourierBold",
    "Courier-Oblique": "CourierOblique",
    "Courier-BoldOblique": "CourierBoldOblique"
  };

  /** §31 — tolerância (pt) ao comparar dimensões de página com o template oficial. */
  const TOLERANCIA_PT = 1;
  /** §30 — tolerância visual padrão (pt) usada na detecção de deslocamento. */
  const TOLERANCIA_VISUAL_PT = 1.0;

  /**
   * Perfil de fidelidade extraído do código ATUAL da aplicação (§8/§47).
   * Alterar aqui muda o desenho de todos os documentos criados a partir do
   * schema — por isso o bootstrap grava os valores no próprio elemento: o
   * documento antigo continua reproduzível mesmo se o perfil evoluir.
   */
  const PERFIL_APP = {
    fonte: { family: "Helvetica", weight: "normal", style: "normal" },
    fontSize: 9,
    offsetX: 0.5,
    limiteYsemOffset: 120, // y (pdf-lib) acima disso recebe o ajuste de uma linha
    offsetYLinha: 9,
    baselineAltura: 0.78,  // min(altura × 0,78, fonte × 1,12)
    baselineFonte: 1.12,
    truncarComReticencias: true,
    paddingTexto: 2       // largura útil = largura − 2
  };

  /** Estilos de linha (§10). */
  const DASH = { solid: null, dashed: [3, 3], dotted: [1, 2] };

  // ══════════════════════════════════════════════════════
  // UTILITÁRIOS
  // ══════════════════════════════════════════════════════
  function arredondar(n, casas) {
    const f = Math.pow(10, casas == null ? 2 : casas);
    return Math.round((Number(n) || 0) * f) / f;
  }

  /** Momento em que o engine foi carregado (só para relatório/diagnóstico). */
  const INICIADO_EM = new Date().toISOString();

  /** id estável a partir de texto livre: sem acentos, minúsculo, snake_case. */
  function slugId(texto) {
    return String(texto == null ? "" : texto)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "elemento";
  }

  /**
   * §15/§29 — as fontes padrão do PDF usam WinAnsiEncoding. Caracteres fora
   * dela (emoji, ✔, …) fariam o pdf-lib lançar na geração. Em vez de perder o
   * documento, normalizamos o que tem equivalente tipográfico e removemos o
   * resto — a alternativa (fonte TTF embutida) está documentada como decisão
   * pendente, não silenciada.
   */
  function sanitizarWinAnsi(texto) {
    return String(texto == null ? "" : texto)
      .replace(/[\u2018\u2019\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201F]/g, "\"")
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/\u00A0/g, " ")
      .replace(/\t/g, " ")
      .replace(/[^\u0000-\u00FF]/g, "");
  }

  /**
   * §43 — o JSON do documento é DECLARATIVO. Nada de eval/new Function.
   * Esta varredura é usada pela validação para barrar definição importada com
   * conteúdo executável (o engine nunca avalia nada: só lê propriedades).
   */
  function conteudoExecutavel(valor, caminho, achados) {
    achados = achados || [];
    if (valor == null) return achados;
    if (typeof valor === "string") {
      if (/(^|[^\w])(eval|Function)\s*\(/.test(valor) || /=>|\bjavascript:|\bimport\s*\(/.test(valor)) {
        achados.push((caminho || "raiz") + ": conteúdo executável");
      }
      return achados;
    }
    if (Array.isArray(valor)) {
      valor.forEach(function (v, i) { conteudoExecutavel(v, (caminho || "raiz") + "[" + i + "]", achados); });
      return achados;
    }
    if (typeof valor === "object") {
      for (const k of Object.keys(valor)) {
        if (/^on[a-z]+$/i.test(k)) achados.push((caminho ? caminho + "." : "") + k + ": manipulador de evento não é permitido");
        else conteudoExecutavel(valor[k], (caminho ? caminho + "." : "") + k, achados);
      }
    }
    return achados;
  }

  // ══════════════════════════════════════════════════════
  // §5 — SISTEMA DE COORDENADAS (única camada de conversão)
  // ══════════════════════════════════════════════════════
  /**
   * Y do topo (definição) → Y do pdf-lib (origem inferior esquerda).
   * `altura` é a altura do elemento: o resultado é o canto INFERIOR esquerdo.
   */
  function converterY(yTopo, alturaPagina, alturaElemento) {
    return arredondar(alturaPagina - (Number(yTopo) || 0) - (Number(alturaElemento) || 0), 4);
  }

  /** Caixa de um elemento (topo) → caixa no espaço do pdf-lib (inferior). */
  function caixaParaPdf(el, pagina) {
    const altura = Number(el.height) || 0;
    return {
      x: Number(el.x) || 0,
      y: converterY(el.y, pagina.height, altura),
      width: Number(el.width) || 0,
      height: altura
    };
  }

  /** Ponto (topo) → ponto no espaço do pdf-lib. */
  function pontoParaPdf(x, yTopo, pagina) {
    return { x: Number(x) || 0, y: converterY(yTopo, pagina.height, 0) };
  }

  // ══════════════════════════════════════════════════════
  // §4/§23 — DEFINIÇÃO DO DOCUMENTO
  // ══════════════════════════════════════════════════════
  /**
   * Nova definição. Nunca criada sem versão (§23) nem sem dimensão de página:
   * `page` vem sempre de medição real (pdf-lib/pdf.js), nunca de chute.
   */
  function novaDefinicao(opts) {
    const o = opts || {};
    if (!o.width || !o.height) throw new Error("novaDefinicao: informe page.width/page.height medidos (pt)");
    const agora = o.agora || new Date().toISOString();
    const autor = o.autor || "painel";
    return {
      schemaVersion: SCHEMA_VERSION,
      documentId: o.documentId || "documento",
      documentName: o.documentName || o.documentId || "Documento",
      documentVersion: o.documentVersion || "1.0.0",
      page: {
        width: arredondar(o.width, 2),
        height: arredondar(o.height, 2),
        unit: "pt",
        orientation: o.width > o.height ? "landscape" : "portrait",
        // §31 — dimensão esperada do template oficial (medida) para validação
        esperado: o.esperado || { width: arredondar(o.width, 2), height: arredondar(o.height, 2) },
        tolerancia: o.tolerancia == null ? TOLERANCIA_PT : o.tolerancia
      },
      metadados: {
        criadoEm: agora,
        criadoPor: autor,
        alteradoEm: agora,
        alteradoPor: autor,
        status: STATUS_PADRAO,
        origem: o.origem || "manual",
        pendenteCalibracao: o.pendenteCalibracao !== false,
        observacoes: o.observacoes || ""
      },
      assets: o.assets || [],
      componentes: o.componentes || [],
      elementos: o.elementos || []
    };
  }

  /** Perfil de página do documento (multi-página: `pages`, senão `page` para todas). */
  function paginasDaDefinicao(def) {
    if (def && Array.isArray(def.pages) && def.pages.length) return def.pages;
    return [def.page];
  }

  function paginaDe(def, indice) {
    const pgs = paginasDaDefinicao(def);
    const i = Math.max(1, Number(indice) || 1);
    return pgs[Math.min(i, pgs.length) - 1] || pgs[0];
  }

  /** Todos os elementos, abrindo grupos (§21) e anotando o grupo de origem. */
  function elementosTodos(def) {
    const out = [];
    const visitar = function (lista, grupoPai) {
      for (const el of (lista || [])) {
        if (!el || typeof el !== "object") continue;
        const copia = Object.assign({}, el);
        copia.grupo = grupoPai || null;
        out.push(copia);
        if (el.type === "group") visitar(el.elementos, el.id);
      }
    };
    visitar(def && def.elementos, null);
    // Ordem de desenho: zIndex crescente (§20); sem zIndex = 0 (fundo primeiro)
    return out.map(function (e, i) { return Object.assign({}, e, { __ordem: i }); })
      .sort(function (a, b) { return (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0) || a.__ordem - b.__ordem; });
  }

  function elementosDaPagina(def, indice) {
    return elementosTodos(def).filter(function (e) { return (Number(e.page) || 1) === (Number(indice) || 1); });
  }

  /** Elemento por id (inclui elementos dentro de grupos). */
  function elementoPorId(def, id) {
    return elementosTodos(def).find(function (e) { return e.id === id; }) || null;
  }

  function idsElementos(def) {
    return elementosTodos(def).map(function (e) { return e.id; });
  }

  /** id livre a partir de um rótulo, evitando colisão (§7 — ids determinísticos). */
  function proximoIdElemento(def, rotulo) {
    const base = slugId(rotulo || "elemento");
    const usados = idsElementos(def);
    if (usados.indexOf(base) === -1) return base;
    let n = 2;
    while (usados.indexOf(base + "_" + n) !== -1) n++;
    return base + "_" + n;
  }

  /** §19 — posicionamento com precisão decimal (nunca só arraste). */
  function moverElemento(def, id, dx, dy) {
    const alvo = localizar(def, id);
    if (!alvo) return false;
    moverRecursivo(alvo, dx, dy);
    return true;
  }

  /** Localiza o objeto REAL (não a cópia) dentro do documento, inclusive em grupos. */
  function localizar(def, id) {
    const achar = function (lista) {
      for (const el of (lista || [])) {
        if (!el) continue;
        if (el.id === id) return el;
        if (el.type === "group") { const r = achar(el.elementos); if (r) return r; }
      }
      return null;
    };
    return achar(def && def.elementos);
  }

  /** §21 — move o grupo inteiro: deslocamento aplicado a todos os filhos. */
  function moverGrupo(def, id, dx, dy) {
    const g = localizar(def, id);
    if (!g || g.type !== "group") return false;
    for (const filho of (g.elementos || [])) moverRecursivo(filho, dx, dy);
    return true;
  }

  function moverRecursivo(el, dx, dy) {
    el.x = arredondar((Number(el.x) || 0) + dx, 2);
    el.y = arredondar((Number(el.y) || 0) + dy, 2);
    if (el.type === "line") {
      el.x1 = arredondar((Number(el.x1) || 0) + dx, 2); el.y1 = arredondar((Number(el.y1) || 0) + dy, 2);
      el.x2 = arredondar((Number(el.x2) || 0) + dx, 2); el.y2 = arredondar((Number(el.y2) || 0) + dy, 2);
    }
    if (el.type === "group") for (const f of (el.elementos || [])) moverRecursivo(f, dx, dy);
  }

  /** §20 — camadas: "frente" | "tras" | "subir" | "descer". */
  function moverCamada(def, id, direcao) {
    const irmaos = def.elementos;
    const i = irmaos.findIndex(function (e) { return e.id === id; });
    if (i === -1) return false;
    if (direcao === "frente") irmaos.push(irmaos.splice(i, 1)[0]);
    else if (direcao === "tras") irmaos.unshift(irmaos.splice(i, 1)[0]);
    else if (direcao === "subir" && i < irmaos.length - 1) {
      const t = irmaos[i]; irmaos[i] = irmaos[i + 1]; irmaos[i + 1] = t;
    } else if (direcao === "descer" && i > 0) {
      const t = irmaos[i]; irmaos[i] = irmaos[i - 1]; irmaos[i - 1] = t;
    } else return false;
    // zIndex materializa a ordem visual (o array é a fonte da verdade da edição)
    irmaos.forEach(function (e, idx) { e.zIndex = idx; });
    return true;
  }

  /** §21 — agrupa elementos do MESMO documento em um grupo novo. */
  function agruparElementos(def, idsGrupo, idGrupo) {
    const ids = (idsGrupo || []).filter(Boolean);
    if (ids.length < 2) return null;
    const membros = ids.map(function (id) { return localizar(def, id); }).filter(Boolean);
    if (membros.length !== ids.length) return null;
    // não agrupar grupo dentro de grupo (evita ciclo)
    if (membros.some(function (m) { return m.type === "group"; })) return null;
    def.elementos = def.elementos.filter(function (e) { return ids.indexOf(e.id) === -1; });
    const xs = membros.map(function (m) { return Number(m.x) || 0; });
    const ys = membros.map(function (m) { return Number(m.y) || 0; });
    const maxX = Math.max.apply(null, membros.map(function (m) { return (Number(m.x) || 0) + (Number(m.width) || 0); }));
    const maxY = Math.max.apply(null, membros.map(function (m) { return (Number(m.y) || 0) + (Number(m.height) || 0); }));
    const grupo = {
      id: idGrupo || proximoIdElemento(def, "grupo"),
      type: "group", page: membros[0].page || 1,
      x: Math.min.apply(null, xs), y: Math.min.apply(null, ys),
      width: arredondar(maxX - Math.min.apply(null, xs), 2),
      height: arredondar(maxY - Math.min.apply(null, ys), 2),
      zIndex: membros[0].zIndex || 0,
      elementos: membros
    };
    def.elementos.push(grupo);
    return grupo;
  }

  function novaPagina(def, width, height) {
    if (!def.pages) def.pages = [Object.assign({}, def.page)];
    def.pages.push({ width: arredondar(width, 2), height: arredondar(height, 2) });
    return def.pages.length;
  }

  // ══════════════════════════════════════════════════════
  // §31 — VALIDAÇÃO
  // ══════════════════════════════════════════════════════
  const CAMPOS_OBRIGATORIOS = {
    text: ["content"], field: ["binding"], image: ["arquivo"],
    table: ["columns"], group: ["elementos"], checkbox: [], signature: [],
    line: ["x1", "y1", "x2", "y2"], rectangle: [], circle: [], ellipse: []
  };
  const CAMPOS_COM_CAIXA = ["text", "field", "image", "table", "rectangle", "circle", "ellipse", "signature", "checkbox"];

  /**
   * Validação estrutural da definição (§31). Nunca lança.
   * Regras que impedem a geração = `erros`; incoerências visuais = `avisos`.
   */
  function validarDefinicao(def, opts) {
    const o = opts || {};
    const erros = [], avisos = [];
    const agora = new Date().toISOString();
    const registrar = function (listas, msg) { listas.push(msg); };

    if (!def || typeof def !== "object") return { ok: false, erros: ["Definição ausente ou inválida."], avisos: [], quando: agora };

    if (!def.schemaVersion) registrar(erros, "Definição sem schemaVersion (§23 — nunca salvar sem versão).");
    if (def.schemaVersion && String(def.schemaVersion).split(".")[0] !== SCHEMA_VERSION.split(".")[0]) {
      registrar(avisos, "schemaVersion " + def.schemaVersion + " é de outra geração do formato (engine lê " + SCHEMA_VERSION + ").");
    }
    if (!def.documentId) registrar(erros, "Definição sem documentId.");
    if (!def.documentVersion) registrar(erros, "Definição sem documentVersion.");
    if (def.metadados && def.metadados.status && STATUS_DOC.indexOf(def.metadados.status) === -1) {
      registrar(erros, "Status inválido: " + def.metadados.status + " (use " + STATUS_DOC.join(", ") + ").");
    }

    // §6/§31 — dimensões da página: positivas, finitas e iguais às do template
    const pgs = paginasDaDefinicao(def);
    pgs.forEach(function (p, i) {
      const rot = pgs.length > 1 ? "Página " + (i + 1) + ": " : "";
      if (!p || !isFinite(p.width) || !isFinite(p.height) || p.width <= 0 || p.height <= 0) {
        registrar(erros, rot + "dimensões de página ausentes ou inválidas (informe pt medidos).");
        return;
      }
      if (p.unit && p.unit !== "pt") registrar(avisos, rot + "unidade \"" + p.unit + "\" — o engine trabalha em pt (§4).");
      if (p.orientation && p.orientation !== (p.width > p.height ? "landscape" : "portrait")) {
        registrar(avisos, rot + "orientation \"" + p.orientation + "\" contradiz as dimensões.");
      }
      const esp = p.esperado || (def.page && def.page.esperado);
      if (esp && isFinite(esp.width) && isFinite(esp.height)) {
        const tol = p.tolerancia == null ? (def.page.tolerancia == null ? TOLERANCIA_PT : def.page.tolerancia) : p.tolerancia;
        const dw = Math.abs(p.width - esp.width), dh = Math.abs(p.height - esp.height);
        if (dw > tol || dh > tol) {
          registrar(erros, rot + "dimensões divergem do template oficial: " + arredondar(p.width, 2) + "×" + arredondar(p.height, 2) +
            " pt (esperado " + arredondar(esp.width, 2) + "×" + arredondar(esp.height, 2) + " pt, tolerância " + tol + " pt).");
        }
      }
    });

    // ids duplicados / ausentes
    const vistos = {};
    for (const el of elementosTodos(def)) {
      if (!el.id) { registrar(erros, "Elemento " + (el.type || "?") + " sem id."); continue; }
      if (vistos[el.id]) { registrar(erros, "ID duplicado: " + el.id + "."); continue; }
      vistos[el.id] = true;
    }

    // por elemento
    for (const el of elementosTodos(def)) {
      const rot = "Elemento \"" + (el.id || "(sem id)") + "\"";
      if (TIPOS.indexOf(el.type) === -1) { registrar(erros, rot + ": tipo desconhecido \"" + el.type + "\"."); continue; }
      const obrig = CAMPOS_OBRIGATORIOS[el.type] || [];
      for (const c of obrig) {
        const v = el[c];
        if (v == null || v === "" || (Array.isArray(v) && !v.length)) registrar(erros, rot + " (" + el.type + "): falta \"" + c + "\".");
      }
      // posição
      const temCoords = isFinite(el.x) && isFinite(el.y);
      if (el.type === "line") {
        if (![el.x1, el.y1, el.x2, el.y2].every(function (n) { return isFinite(n); })) {
          registrar(erros, rot + " (line): x1/y1/x2/y2 precisam ser numéricos.");
        }
      } else if (!temCoords) {
        registrar(erros, rot + ": sem posição (x/y).");
      }
      if (CAMPOS_COM_CAIXA.indexOf(el.type) !== -1) {
        const w = el.width;
        if (w != null && !isFinite(w)) registrar(erros, rot + ": width não numérico.");
        if (el.height != null && !isFinite(el.height)) registrar(erros, rot + ": height não numérico.");
        if (["image", "table", "rectangle", "circle", "ellipse"].indexOf(el.type) !== -1) {
          if (!(Number(el.width) > 0) || !(Number(el.height) > 0)) {
            registrar(erros, rot + " (" + el.type + "): precisa de width/height maiores que zero.");
          }
        }
        if (el.type === "image" && Number(el.width) > 0 && Number(el.height) > 0 && /^\s*$/.test(String(el.arquivo))) {
          registrar(erros, rot + ": imagem sem arquivo.");
        }
      }
      // fonte declarada existe? (§31 — fontes inexistentes)
      const fonte = nomeFonte(el);
      if (fonte && !FONTES_PADRAO[fonte]) {
        registrar(erros, rot + ": fonte \"" + fonte + "\" não é uma das fontes padrão suportadas (" + Object.keys(FONTES_PADRAO).join(", ") + ").");
      }
      const familia = (el.font && el.font.family) || el.fontFamily;
      if (familia && !familiaSuportada(familia)) {
        registrar(erros, rot + ": família de fonte \"" + familia + "\" não é suportada (Helvetica/Arial, Times, Courier) — o renderer não substitui em silêncio (§15).");
      }
      // field: binding declarado e sem espaços
      if (el.type === "field" && typeof el.binding === "string" && /\s/.test(el.binding.trim())) {
        registrar(erros, rot + ": binding inválido (\"" + el.binding + "\" contém espaços).");
      }
      // §31 — fora da página / parcialmente cortado
      if (temCoords) {
        const p = paginaDe(def, el.page);
        if (p && isFinite(p.width) && isFinite(p.height)) {
          const w = Number(el.width) || (el.type === "line" ? Math.max(Number(el.x1) || 0, Number(el.x2) || 0) - (Number(el.x) || 0) : 0);
          const h = Number(el.height) || 0;
          const margem = o.margemFora == null ? 40 : o.margemFora;
          if (el.x < -margem || el.y < -margem || el.x > p.width + margem || el.y > p.height + margem) {
            registrar(avisos, rot + ": fora da página (x " + arredondar(el.x, 2) + ", y " + arredondar(el.y, 2) + " em " + arredondar(p.width, 2) + "×" + arredondar(p.height, 2) + " pt).");
          } else if (el.x + w > p.width + 2 || el.y + h > p.height + 2 || el.x < -2 || el.y < -2) {
            registrar(avisos, rot + ": parcialmente cortado pela borda da página.");
          }
        }
      }
      // table
      if (el.type === "table") {
        if (!Array.isArray(el.columns) || !el.columns.length) registrar(erros, rot + " (table): sem colunas.");
        else {
          const soma = el.columns.reduce(function (a, c) { return a + (Number(c.width) || 0); }, 0);
          if (el.width && Math.abs(soma - el.width) > TOLERANCIA_PT) {
            registrar(avisos, rot + " (table): soma das colunas (" + arredondar(soma, 2) + " pt) difere da largura da tabela (" + arredondar(el.width, 2) + " pt).");
          }
          (el.rows || []).forEach(function (linha, i) {
            if (linha.length !== el.columns.length) registrar(avisos, rot + " (table): linha " + (i + 1) + " tem " + linha.length + " célula(s) para " + el.columns.length + " coluna(s).");
          });
        }
      }
      // assets referenciados existem na definição
      if (el.type === "image" && Array.isArray(def.assets)) {
        const conhecido = def.assets.some(function (a) { return a.arquivo === el.arquivo || a.id === el.arquivo; });
        if (!conhecido) registrar(avisos, rot + ": imagem \"" + el.arquivo + "\" não está declarada em assets (o renderer precisa dos bytes em tempo de geração).");
      }
      if (el.origem === "importado" && el.confirmado !== true) {
        registrar(avisos, rot + ": importado de referência e não confirmado (REQUER CALIBRAÇÃO).");
      }
      if (el.origem === "manual" && el.confirmado !== true) {
        registrar(avisos, rot + ": reconstruído manualmente e ainda não confirmado (REQUER CALIBRAÇÃO).");
      }
    }

    // §43 — JSON declarativo
    for (const achado of conteudoExecutavel(def)) registrar(erros, achado);

    // §52 — pendência de calibração honesta
    if (def.metadados && def.metadados.pendenteCalibracao) {
      registrar(avisos, "Documento marcado como REQUER CALIBRAÇÃO: o formulário oficial tem textos, linhas e caixas que não constam no schema de campos.");
    }

    return { ok: erros.length === 0, erros: erros, avisos: avisos, quando: agora, nElementos: idsElementos(def).length };
  }

  /**
   * §15 — famílias aceitas. Fora delas não se substitui em silêncio: a
   * validação acusa e o administrador decide (o renderer mantém o fallback
   * documentado Helvetica, mas o documento nunca é aprovado escondendo isso).
   * Arial é equivalente métrico de Helvetica (substituição documentada).
   */
  const FAMILIAS_SUPORTADAS = ["helvetica", "arial", "arialnarrow", "times", "timesnewroman", "courier", "couriernew", "wingdings"];
  function familiaSuportada(family) {
    const f = String(family == null ? "" : family).trim();
    if (!f) return true; // ausente = padrão do perfil
    const base = f.split("-")[0].replace(/\s+/g, "").toLowerCase();
    return FAMILIAS_SUPORTADAS.indexOf(base) !== -1;
  }

  /**
   * §15.1 — TIPOGRAFIA OFICIAL POR RUN.
   *
   * O documento editável do formulário (o .docx que a área de formulários
   * mantém) declara a fonte RUN A RUN: Arial, Arial Narrow, Wingdings, com
   * tamanho e negrito próprios. O schema de campos não guarda nada disso, então
   * a tipografia entra na definição como `fonteOficial` — e o renderer tem que
   * decidir, com honestidade, o que consegue reproduzir:
   *
   *  - `padrao`  = fonte das 14 padrão do PDF usada quando o arquivo licenciado
   *                não está disponível como asset (`assets.fontes`);
   *  - `desvio`  = diferença de largura MEDIDA entre a oficial e o substituto
   *                (0 = equivalente métrico). Serve para o comparador e para o
   *                aviso de validação — substituição nunca é silenciosa;
   *  - `simbolica` = fonte de símbolos (Wingdings): os glifos oficiais viram um
   *                elemento `checkbox` desenhado, porque nenhuma das 14 padrão
   *                tem o glifo.
   */
  const FONTES_OFICIAIS = {
    "arial": {
      familia: "Arial", padrao: "Helvetica", padraoNegrito: "Helvetica-Bold", desvio: 0,
      equivalencia: "métrica: Arial e Helvetica têm as MESMAS larguras de avanço (medido: 99,5% no F-075)"
    },
    "helvetica": { familia: "Helvetica", padrao: "Helvetica", padraoNegrito: "Helvetica-Bold", desvio: 0, equivalencia: "idêntica" },
    "arial narrow": {
      familia: "Arial Narrow", padrao: "Helvetica", padraoNegrito: "Helvetica-Bold", desvio: 0.18,
      equivalencia: "NÃO métrica: medido 18% mais estreita que Helvetica/Arial — sem o arquivo licenciado o texto sai mais largo que o original"
    },
    "times new roman": { familia: "Times New Roman", padrao: "Times-Roman", padraoNegrito: "Times-Bold", desvio: 0, equivalencia: "métrica" },
    "times": { familia: "Times", padrao: "Times-Roman", padraoNegrito: "Times-Bold", desvio: 0, equivalencia: "idêntica" },
    "courier new": { familia: "Courier New", padrao: "Courier", padraoNegrito: "Courier-Bold", desvio: 0, equivalencia: "métrica" },
    "courier": { familia: "Courier", padrao: "Courier", padraoNegrito: "Courier-Bold", desvio: 0, equivalencia: "idêntica" },
    "wingdings": {
      familia: "Wingdings", padrao: null, padraoNegrito: null, desvio: null, simbolica: true,
      equivalencia: "fonte de símbolos: o glifo oficial (q = ❑) vira elemento checkbox desenhado"
    }
  };

  /** Chave de busca em FONTES_OFICIAIS a partir de um nome de fonte de PDF/DOCX. */
  function chaveOficial(nome) {
    const n = String(nome == null ? "" : nome)
      .replace(/^[A-Z]{6}\+/, "")            // subconjunto do PDF: AAAAAA+Arial-BoldMT
      .replace(/[-,]?(Bold|BoldMT|Italic|ItalicMT|BoldItalic|Regular|MT|PSMT|NovaPro|Pro|Roman)$/i, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")     // ArialNarrow -> Arial Narrow
      .replace(/[_-]+/g, " ")
      .replace(/\.(ttf|otf|ttc)$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!n) return null;
    if (FONTES_OFICIAIS[n]) return n;
    // alias usuais (inclui o que o pdf.js devolve para o F-075)
    const ALIAS = {
      "sans serif": "helvetica", "sansserif": "helvetica", "liberation sans": "arial",
      "helvetica lt pro": "helvetica", "helveticaneue": "helvetica",
      "liberation serif": "times new roman", "freeserif": "times new roman", "free serif": "times new roman",
      "serif": "times new roman", "arial mt": "arial", "arialnarrowmt": "arial narrow",
      "arialn": "arial narrow", "arial narrow bold": "arial narrow", "wingding": "wingdings"
    };
    if (ALIAS[n]) return ALIAS[n];
    for (const chave of Object.keys(FONTES_OFICIAIS)) {
      if (n.indexOf(chave) === 0 || chave.indexOf(n) === 0) return chave;
    }
    return null;
  }

  /**
   * Tipografia oficial declarada no elemento: `fonteOficial` (nome do documento
   * editável) ou a fonte real medida no PDF (`fonteReal`). Devolve null quando o
   * elemento não declara nada — aí vale o perfil da aplicação.
   */
  function fonteOficialDe(el) {
    if (!el) return null;
    const bruto = el.fonteOficial || (el.font && (el.font.oficial || el.font.family)) || el.fonteReal;
    const chave = chaveOficial(bruto);
    if (!chave) return null;
    const f = FONTES_OFICIAIS[chave];
    const peso = String((el.font && el.font.weight) || el.peso || "normal").toLowerCase();
    return {
      chave: chave,
      nome: bruto || f.familia,
      familia: f.familia,
      padrao: f.padrao,
      padraoNegrito: f.padraoNegrito,
      desvio: f.desvio,
      simbolica: !!f.simbolica,
      equivalencia: f.equivalencia,
      negrito: peso === "bold" || peso === "700" || peso === "600",
      tamanho: Number((el.font && el.font.size) || el.fontSize) || null
    };
  }

  /**
   * §15.1 — resolve a fonte de um elemento para o que o PDF VAI usar.
   * `disponiveis` é o mapa de fontes licenciadas fornecidas como asset
   * (`assets.fontes`); quando a oficial está lá, ela é usada de verdade.
   * Sem ela, cai na fonte padrão equivalente e a substituição é REGISTRADA.
   */
  function resolverFonte(el, disponiveis) {
    const oficial = fonteOficialDe(el);
    const disp = disponiveis || {};
    const sufixo = (f) => (f.negrito ? "-Bold" : "");
    if (oficial && !oficial.simbolica) {
      for (const nome of [oficial.familia + sufixo(oficial), oficial.familia]) {
        if (disp[nome]) {
          return { chave: nome, oficial: oficial, embutida: true, substituida: false };
        }
      }
    }
    const padrao = oficial
      ? (oficial.negrito ? oficial.padraoNegrito : oficial.padrao)
      : null;
    const chave = padrao && FONTES_PADRAO[padrao] ? padrao : (nomeFonte(el) || "Helvetica");
    return {
      chave: chave,
      oficial: oficial,
      embutida: false,
      substituida: !!(oficial && !oficial.simbolica && oficial.familia.replace(/\s/g, "") !== chave.replace(/-.*$/, "")),
      aviso: oficial && oficial.desvio > 0.02
        ? "fonte oficial \"" + oficial.familia + "\" não está em assets.fontes: substituída por " + chave + " (" + oficial.equivalencia + ")"
        : null
    };
  }

  /** Nome de fonte declarado no elemento (family + weight + style) ou null. */
  function nomeFonte(el) {
    const f = el && el.font;
    if (!f) return (el && el.fontFamily) || null;
    const family = f.family || "Helvetica";
    const peso = (f.weight || "normal").toLowerCase();
    const estilo = (f.style || "normal").toLowerCase();
    const neg = peso === "bold" || peso === "700" || peso === "600";
    const ita = estilo === "italic" || estilo === "oblique";
    if (/^Times/i.test(family)) {
      return "Times-" + (neg && ita ? "BoldItalic" : neg ? "Bold" : ita ? "Italic" : "Roman");
    }
    if (/^Courier/i.test(family)) {
      return "Courier" + (neg && ita ? "-BoldOblique" : neg ? "-Bold" : ita ? "-Oblique" : "");
    }
    return "Helvetica" + (neg && ita ? "-BoldOblique" : neg ? "-Bold" : ita ? "-Oblique" : "");
  }

  // ══════════════════════════════════════════════════════
  // §33 — DADOS (nunca duplicar a lógica de negócio)
  // ══════════════════════════════════════════════════════
  /**
   * Resolve "candidato.nome" em `dados`. Aceita também a chave literal (a
   * aplicação atual usa mapas planos: { nomecompleto: "..." }).
   */
  function resolverValor(dados, binding) {
    if (!dados || !binding) return null;
    if (Object.prototype.hasOwnProperty.call(dados, binding)) return dados[binding];
    let atual = dados;
    for (const parte of String(binding).split(".")) {
      if (atual == null || typeof atual !== "object") return null;
      atual = atual[parte];
    }
    return atual == null ? null : atual;
  }

  // ══════════════════════════════════════════════════════
  // §8 — TEXTO: quebra de linha, truncamento, alinhamento
  // ══════════════════════════════════════════════════════
  /**
   * Quebra em linhas por palavra. `medir(texto)` devolve a largura em pt —
   * é injetado para o cálculo ser testável sem fonte embutida.
   */
  function quebrarLinhas(texto, larguraMax, medir) {
    const t = sanitizarWinAnsi(texto).replace(/\s+/g, " ").trim();
    if (!t) return [];
    if (!(larguraMax > 0)) return [t];
    const palavras = t.split(" ");
    const linhas = [];
    let atual = "";
    for (const p of palavras) {
      const teste = atual ? atual + " " + p : p;
      if (medir(teste) <= larguraMax || !atual) atual = teste;
      else { linhas.push(atual); atual = p; }
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  /** Truncamento com "..." — mesma parábola da aplicação (busca binária). */
  function truncarTexto(texto, larguraMax, medir) {
    const t = sanitizarWinAnsi(texto).trim();
    if (!t || !(larguraMax > 0)) return t;
    if (medir(t) <= larguraMax) return t;
    let baixo = 0, alto = t.length;
    while (baixo < alto) {
      const meio = Math.ceil((baixo + alto) / 2);
      if (medir(t.slice(0, meio) + "...") <= larguraMax) baixo = meio;
      else alto = meio - 1;
    }
    return t.slice(0, alto) + "...";
  }

  /** X do texto dentro da caixa conforme alinhamento (§8). */
  function xAlinhado(x, larguraCaixa, larguraTexto, alinhamento) {
    const a = String(alinhamento || "left").toLowerCase();
    if (a === "center" || a === "centro") return arredondar(x + (larguraCaixa - larguraTexto) / 2, 4);
    if (a === "right" || a === "direita") return arredondar(x + larguraCaixa - larguraTexto, 4);
    return arredondar(x, 4);
  }

  /**
   * §8 — altura da baseline medida a partir do TOPO, segundo a âncora declarada:
   *  - "campo" (perfil da aplicação): a baseline fica a `min(altura × 0,78,
   *    fonte × 1,12)` acima da BASE da caixa, mais `offsetY` para baixo.
   *  - "base": baseline no fundo da caixa (usado por texto importado).
   *  - "topo"/"meio": alinhamento geométrico simples.
   * `offsetY` é expresso no espaço da definição: positivo = desce na página.
   */
  function baselineTopo(el) {
    const size = Number((el.font && el.font.size) || el.fontSize) || 10;
    const altura = Number(el.height) || 0;
    const ancora = (el.ancoraV || "campo").toLowerCase();
    const base = Number(el.y) || 0;
    if (ancora === "base" || ancora === "baseline") return base + altura;
    if (ancora === "topo") return base + size * 0.72;
    if (ancora === "meio") return base + (altura + size * 0.72) / 2;
    // "campo" = regra da aplicação (§8/PERFIL_APP): reproduz o PDF atual
    const p = el.perfil || PERFIL_APP;
    return base + altura - Math.min(altura * (p.baselineAltura || 0.78), size * (p.baselineFonte || 1.12)) + (Number(el.offsetY) || 0);
  }

  // ══════════════════════════════════════════════════════
  // §44 — GERENCIADORES (fontes/imagens cacheadas por documento)
  // ══════════════════════════════════════════════════════
  function criarGerenciadorFontes(pdfLib, pdfDoc, assets) {
    const cache = new Map();
    const substituicoes = [];
    const licenciadas = (assets && assets.fontes) || {};
    return {
      substituicoes: substituicoes,
      licenciadas: licenciadas,
      disponiveis: function () { return Object.keys(licenciadas); },
      /**
       * Ordem de preferência: (1) fonte licenciada do asset — pode vir já
       * embutida (PDFFont) ou em bytes, quando o chamador registrou o fontkit no
       * pdf-lib; (2) fonte padrão do PDF equivalente; (3) Helvetica.
       * Cada queda é registrada: o painel mostra a substituição, não a esconde.
       */
      async obter(nome, oficial) {
        const pedida = nome || "Helvetica";
        if (licenciadas[pedida]) {
          if (cache.has(pedida)) return cache.get(pedida);
          const bruta = licenciadas[pedida];
          const embutida = bruta && typeof bruta.widthOfTextAtSize === "function"
            ? bruta
            : await pdfDoc.embedFont(bruta);
          cache.set(pedida, embutida);
          return embutida;
        }
        const chave = FONTES_PADRAO[pedida] ? pedida : "Helvetica";
        if (chave !== pedida) {
          substituicoes.push({ pedida: pedida, usada: chave, oficial: (oficial && oficial.familia) || null, motivo: "fonte não embutida em assets.fontes" });
        }
        if (cache.has(chave)) return cache.get(chave);
        const embutida = await pdfDoc.embedFont(pdfLib.StandardFonts[FONTES_PADRAO[chave]]);
        cache.set(chave, embutida);
        return embutida;
      },
      get tamanho() { return cache.size; }
    };
  }

  /** Bytes → tipo de imagem pela assinatura do arquivo (PNG/JPEG). */
  function tipoImagem(bytes) {
    if (!bytes || !bytes.length) return null;
    const b = bytes;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return "png";
    if (b[0] === 0xFF && b[1] === 0xD8) return "jpg";
    return null;
  }

  function criarGerenciadorImagens(pdfLib, pdfDoc, assets) {
    const disponiveis = (assets && assets.imagens) || assets || {};
    const cache = new Map();
    const faltando = [];
    return {
      faltando: faltando,
      disponiveis: disponiveis,
      async obter(arquivo) {
        if (cache.has(arquivo)) return cache.get(arquivo);
        const bytes = disponiveis[arquivo];
        if (!bytes) { faltando.push(arquivo); cache.set(arquivo, null); return null; }
        const tipo = tipoImagem(bytes);
        if (!tipo) { faltando.push(arquivo + " (formato não suportado: apenas PNG/JPEG)"); cache.set(arquivo, null); return null; }
        const img = tipo === "png" ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
        cache.set(arquivo, img);
        return img;
      }
    };
  }

  // ══════════════════════════════════════════════════════
  // §11/§12 — CORES E FORMAS
  // ══════════════════════════════════════════════════════
  function corParaRgb(pdfLib, valor) {
    if (valor == null) return undefined;
    const v = String(valor).trim();
    if (!v || v === "transparent" || v === "none" || v === "null") return undefined;
    const hex = v.replace("#", "");
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return pdfLib.rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
    }
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return pdfLib.rgb(parseInt(hex[0] + hex[0], 16) / 255, parseInt(hex[1] + hex[1], 16) / 255, parseInt(hex[2] + hex[2], 16) / 255);
    }
    const rgb = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (rgb) return pdfLib.rgb(Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255);
    return undefined; // valor desconhecido → sem cor (nunca inventar preto silencioso)
  }

  // ══════════════════════════════════════════════════════
  // §28/§32 — RENDERER (sempre vetorial; nunca rasterizar a página)
  // ══════════════════════════════════════════════════════
  /**
   * Gera o PDF da definição. `assets.imagens` = { "arquivo.png": Uint8Array }.
   * Retorna { bytes, paginas, desenhados, ignorados[], avisos[] } — bytes é um
   * PDF real e independente do template externo (§1).
   */
  async function renderizarPdf(definicao, dados, pdfLib, assets, opts) {
    const o = opts || {};
    if (!pdfLib) throw new Error("renderizarPdf: pdf-lib não disponível.");
    const def = definicao;
    const v = validarDefinicao(def, { margemFora: o.margemFora });
    const bloqueantes = v.erros.filter(function (e) { return !/REQUER CALIBRAÇÃO/.test(e); });
    if (bloqueantes.length && !o.forcar) {
      throw new Error("Definição inválida — geração bloqueada: " + bloqueantes[0]);
    }
    const paginas = paginasDaDefinicao(def);
    const pdfDoc = await pdfLib.PDFDocument.create();
    pdfDoc.setTitle(sanitizarWinAnsi(def.documentName || def.documentId || "Documento"));
    pdfDoc.setProducer("Formulários de Admissão — gerador nativo");
    pdfDoc.setCreator("Formulários de Admissão");
    // Determinismo (§ determinismo > conveniência): a data do PDF vem da própria
    // definição (ou de opts.data), não do relógio — mesma entrada gera os MESMOS
    // bytes, o que torna o teste de regressão visual comparável entre execuções.
    const dataDoc = o.data || (def.metadados && (def.metadados.criadoEm || def.metadados.alteradoEm));
    if (dataDoc) {
      const quando = new Date(dataDoc);
      if (!isNaN(quando.getTime())) {
        pdfDoc.setCreationDate(quando);
        pdfDoc.setModificationDate(quando);
      }
    }
    const fontes = criarGerenciadorFontes(pdfLib, pdfDoc, assets);
    const imagens = criarGerenciadorImagens(pdfLib, pdfDoc, assets);
    // Página criada e dimensionada com setSize (e não com addPage([w, h])):
    // o overload de array do pdf-lib valida o tipo com `Array` do PRÓPRIO realm,
    // o que falha quando o engine roda dentro de outro contexto (node:vm nos
    // testes, iframe/worker na aplicação). setSize recebe só números — sempre ok.
    const folhas = paginas.map(function (p) {
      const folha = pdfDoc.addPage();
      folha.setSize(p.width, p.height);
      return folha;
    });
    const ignorados = [];
    let desenhados = 0;

    for (let i = 1; i <= paginas.length; i++) {
      for (const el of elementosDaPagina(def, i)) {
        if (el.visible === false) { ignorados.push({ id: el.id, motivo: "oculto (visible=false)" }); continue; }
        try {
          const ok = await desenharElemento(folhas[i - 1], el, paginaDe(def, i), dados, { pdfLib: pdfLib, fontes: fontes, imagens: imagens, ignorados: ignorados, opcoes: o });
          if (ok) desenhados++; else ignorados.push({ id: el.id, motivo: "sem conteúdo a desenhar (valor/binding vazio)" });
        } catch (e) {
          ignorados.push({ id: el.id, motivo: "falha ao desenhar: " + e.message });
        }
      }
    }
    const bytes = await pdfDoc.save();
    // Tipografia: o que foi pedido, o que foi usado e por quê (§15.1).
    const unicas = [];
    for (const s of fontes.substituicoes) {
      if (!unicas.some((u) => u.pedida === s.pedida && u.usada === s.usada)) unicas.push(s);
    }
    const avisosFontes = unicas.map((s) =>
      "fonte \"" + s.pedida + "\" não está em assets.fontes: usada \"" + s.usada + "\" (" + s.motivo + ")."
    );
    return {
      bytes: bytes,
      paginas: paginas.length,
      desenhados: desenhados,
      ignorados: ignorados,
      fontesEmbutidas: fontes.disponiveis(),
      fontesSubstituidas: unicas,
      avisos: v.avisos.concat(
        imagens.faltando.length ? ["Imagem ausente em assets: " + imagens.faltando.join(", ") + " (REQUER CALIBRAÇÃO)."] : [],
        avisosFontes
      )
    };
  }

  /** Despacha por tipo. Devolve true se algo foi desenhado. */
  async function desenharElemento(folha, el, pagina, dados, ctx) {
    switch (el.type) {
      case "group": {
        let n = 0;
        for (const filho of (el.elementos || [])) {
          if (await desenharElemento(folha, Object.assign({ page: el.page }, filho), pagina, dados, ctx)) n++;
        }
        return n > 0;
      }
      case "text": return desenharTexto(folha, el, pagina, dados, ctx);
      case "field": {
        const valor = resolverValor(dados, el.binding);
        return desenharTexto(folha, el, pagina, dados, ctx, valor == null ? null : String(valor));
      }
      case "line": return desenharLinha(folha, el, pagina, ctx);
      case "rectangle": return desenharRetangulo(folha, el, pagina, ctx);
      case "circle":
      case "ellipse": return desenharElipse(folha, el, pagina, ctx);
      case "image": return await desenharImagem(folha, el, pagina, ctx);
      case "signature": return await desenharAssinatura(folha, el, pagina, dados, ctx);
      case "checkbox": return desenharCheckbox(folha, el, pagina, dados, ctx);
      case "table": return await desenharTabela(folha, el, pagina, dados, ctx);
      default: return false;
    }
  }

  async function desenharTexto(folha, el, pagina, dados, ctx, valorForcado) {
    const bruto = valorForcado == null ? (el.content == null ? "" : String(el.content)) : valorForcado;
    if (!bruto) return false;
    const size = Number(el.font && el.font.size) || Number(el.fontSize) || 10;
    const cor = corParaRgb(ctx.pdfLib, el.color == null ? "#000000" : el.color) || ctx.pdfLib.rgb(0, 0, 0);
    const resolvida = resolverFonte(el, ctx.fontes.licenciadas || {});
    // Fonte simbólica (Wingdings): nenhuma das 14 padrão tem o glifo. Desenhar o
    // caractere cru imprimiria a letra "q" no lugar da caixa de marcação — o
    // importador já converte esses itens em elemento `checkbox`; aqui a
    // conversão ausente é REPORTADA, não improvisada.
    if (resolvida.oficial && resolvida.oficial.simbolica) {
      if (ctx.ignorados) ctx.ignorados.push({ id: el.id, motivo: "glifo de fonte simbólica (" + resolvida.oficial.nome + ") sem elemento checkbox equivalente" });
      return false;
    }
    const fonte = await ctx.fontes.obter(resolvida.chave, resolvida.oficial);
    if (resolvida.aviso && ctx.fontes.substituicoes && !ctx.fontes.substituicoes.some((s) => s.pedida === resolvida.oficial.familia)) {
      ctx.fontes.substituicoes.push({ pedida: resolvida.oficial.familia, usada: resolvida.chave, oficial: resolvida.oficial.familia, motivo: resolvida.aviso, aviso: resolvida.aviso });
    }
    const medir = function (t) { return fonte.widthOfTextAtSize(sanitizarWinAnsi(t), size); };
    const larguraTexto = Number(el.width) > 0 ? Number(el.width) - (el.padding == null ? PERFIL_APP.paddingTexto : Number(el.padding)) : null;
    let texto = el.uppercase ? String(bruto).toUpperCase() : String(bruto);
    if (larguraTexto > 0 && el.truncar !== false) texto = truncarTexto(texto, larguraTexto, medir);
    if (!texto) return false;
    const lineHeight = (Number(el.lineHeight) || 1.2) * size;
    const linhas = el.multilinha || Number(el.height) > size * 2.2
      ? quebrarLinhas(texto, larguraTexto > 0 ? larguraTexto : 1e6, medir)
      : [texto];
    const xBase = Number(el.x) || 0;
    const opacidade = el.opacity == null ? undefined : Number(el.opacity);
    let desenhou = false;
    linhas.forEach(function (linha, i) {
      const wLinha = medir(linha);
      const x = xAlinhado(xBase, Number(el.width) || 0, wLinha, el.alignment) + (Number(el.offsetX) || 0);
      const yTopoBase = baselineTopo(el) + i * lineHeight;
      const y = converterY(yTopoBase, pagina.height, 0);
      const comum = {
        x: x, y: y, size: size, font: fonte, color: cor,
        opacity: opacidade,
        rotate: el.rotation ? ctx.pdfLib.degrees(Number(el.rotation)) : undefined,
        maxWidth: larguraTexto > 0 ? larguraTexto : undefined
      };
      const espacamento = Number(el.letterSpacing) || 0;
      if (espacamento) {
        let cx = x;
        for (const ch of sanitizarWinAnsi(linha)) {
          folha.drawText(ch, Object.assign({}, comum, { x: cx }));
          cx += fonte.widthOfTextAtSize(ch, size) + espacamento;
        }
      } else {
        folha.drawText(sanitizarWinAnsi(linha), comum);
      }
      if (el.sublinhado) {
        const yLinha = y - size * 0.15;
        folha.drawLine({
          start: { x: x, y: yLinha }, end: { x: x + wLinha, y: yLinha },
          thickness: Math.max(0.4, size * 0.05), color: cor, opacity: opacidade
        });
      }
      desenhou = true;
    });
    return desenhou;
  }

  function desenharLinha(folha, el, pagina, ctx) {
    const a = pontoParaPdf(el.x1, el.y1, pagina);
    const b = pontoParaPdf(el.x2, el.y2, pagina);
    const dash = DASH[el.lineStyle || "solid"];
    folha.drawLine({
      start: a, end: b,
      thickness: Number(el.strokeWidth) || 0.75,
      color: corParaRgb(ctx.pdfLib, el.stroke == null ? "#000000" : el.stroke) || ctx.pdfLib.rgb(0, 0, 0),
      opacity: el.opacity == null ? undefined : Number(el.opacity),
      dashArray: dash || undefined,
      lineCap: el.lineCap ? ctx.pdfLib.LineCapStyle[String(el.lineCap).toUpperCase()] : undefined
    });
    return true;
  }

  function desenharRetangulo(folha, el, pagina, ctx) {
    const caixa = caixaParaPdf(el, pagina);
    // Contorno: só quando o elemento DECLARA contorno. Um retângulo preenchido
    // sem `stroke` (as caixas brancas extraídas do PDF oficial, por exemplo) não
    // ganha contorno preto inventado — isso pintava tinta que não existe no
    // original (medido: 4.312 px por página no F-075).
    const temFill = el.fill != null && String(el.fill).trim() !== "";
    // Sem contorno declarado: o pdf-lib continua emitindo `B` (traçado) só
    // porque borderWidth foi passado — e o traço usa a cor padrão do PDF (preto),
    // mesmo sem `RG`. Por isso a espessura também fica indefinida.
    const comContorno = el.stroke != null || !temFill;
    folha.drawRectangle({
      x: caixa.x, y: caixa.y, width: caixa.width, height: caixa.height,
      color: corParaRgb(ctx.pdfLib, el.fill),
      borderColor: comContorno ? corParaRgb(ctx.pdfLib, el.stroke == null ? "#000000" : el.stroke) : undefined,
      borderWidth: comContorno ? (el.strokeWidth == null ? 0.5 : Number(el.strokeWidth)) : undefined,
      opacity: el.opacity == null ? undefined : Number(el.opacity),
      borderOpacity: el.borderOpacity == null ? undefined : Number(el.borderOpacity),
      rotate: el.rotation ? ctx.pdfLib.degrees(Number(el.rotation)) : undefined
    });
    return true;
  }

  function desenharElipse(folha, el, pagina, ctx) {
    const caixa = caixaParaPdf(el, pagina);
    folha.drawEllipse({
      x: caixa.x + caixa.width / 2,
      y: caixa.y + caixa.height / 2,
      xScale: caixa.width / 2, yScale: caixa.height / 2,
      color: corParaRgb(ctx.pdfLib, el.fill),
      borderColor: corParaRgb(ctx.pdfLib, el.stroke == null ? (el.fill ? null : "#000000") : el.stroke),
      borderWidth: el.strokeWidth == null ? 0.5 : Number(el.strokeWidth),
      opacity: el.opacity == null ? undefined : Number(el.opacity)
    });
    return true;
  }

  async function desenharImagem(folha, el, pagina, ctx, caixaForcada) {
    const img = await ctx.imagens.obter(el.arquivo);
    if (!img) return false;
    const caixa = caixaForcada || caixaParaPdf(el, pagina);
    let w = caixa.width, h = caixa.height;
    if (el.fit === "contain") {
      const escala = Math.min(w / img.width, h / img.height);
      const nw = img.width * escala, nh = img.height * escala;
      const dx = (w - nw) / 2, dy = (h - nh) / 2;
      folha.drawImage(img, { x: caixa.x + dx, y: caixa.y + dy, width: nw, height: nh, opacity: el.opacity == null ? undefined : Number(el.opacity) });
      return true;
    }
    folha.drawImage(img, { x: caixa.x, y: caixa.y, width: w, height: h, opacity: el.opacity == null ? undefined : Number(el.opacity) });
    return true;
  }

  /** Assinatura: imagem quando há bytes em assets, senão o nome digitado (§33). */
  async function desenharAssinatura(folha, el, pagina, dados, ctx) {
    const valor = resolverValor(dados, el.binding);
    if (el.arquivo && ctx.imagens && ctx.imagens.disponiveis[el.arquivo]) {
      const desenhou = await desenharImagem(folha, el, pagina, ctx);
      if (desenhou) return true; // rubrica gráfica tem precedência sobre o nome
    }
    if (valor == null || valor === "") return false;
    return await desenharTexto(folha, Object.assign({}, el, { type: "field" }), pagina, dados, ctx, String(valor));
  }

  function desenharCheckbox(folha, el, pagina, dados, ctx) {
    // Marcado vem de `el.marcado` (definição) ou dos DADOS: por `binding` ou,
    // para caixas sem binding (importadas do formulário, que o Preencher endereça
    // por id), por `marcacao.<id>` — a chave que o catálogo do Preencher usa.
    const chave = el.binding || (el.id ? "marcacao." + el.id : null);
    const valor = chave ? resolverValor(dados, chave) : null;
    const marcado = el.marcado === true || valor === true || String(valor) === "sim";
    const caixa = caixaParaPdf(el, pagina);
    if (caixa.width > 0) {
      folha.drawRectangle({
        x: caixa.x, y: caixa.y, width: caixa.width, height: caixa.height,
        borderColor: corParaRgb(ctx.pdfLib, el.stroke == null ? "#000000" : el.stroke),
        borderWidth: el.strokeWidth == null ? 0.5 : Number(el.strokeWidth)
      });
    }
    if (!marcado) return caixa.width > 0;
    return Promise.resolve(ctx.fontes.obter("Helvetica-Bold")).then(function (fonte) {
      const size = Number(el.fontSize) || Math.max(6, Math.min(caixa.width || 8, caixa.height || 8) * 0.85);
      const texto = el.simbolo || "X";
      const w = fonte.widthOfTextAtSize(texto, size);
      folha.drawText(texto, {
        x: caixa.x + ((caixa.width || w) - w) / 2,
        y: caixa.y + ((caixa.height || size) - size * 0.72) / 2,
        size: size, font: fonte,
        color: corParaRgb(ctx.pdfLib, el.color == null ? "#000000" : el.color) || ctx.pdfLib.rgb(0, 0, 0)
      });
      return true;
    });
  }

  /** §16 — tabela: colunas com largura, cabeçalho, bordas, células e campos. */
  async function desenharTabela(folha, el, pagina, dados, ctx) {
    const cols = el.columns || [];
    if (!cols.length) return false;
    const caixa = caixaParaPdf(el, pagina);
    const size = Number(el.fontSize) || 9;
    const alturaCabecalho = el.alturaCabecalho == null ? (Number(el.alturaLinha) || 16) : Number(el.alturaCabecalho);
    const alturaLinha = Number(el.alturaLinha) || 16;
    const bordas = Object.assign({ top: true, right: true, bottom: true, left: true, innerHorizontal: true, innerVertical: true }, el.borders || {});
    const stroke = corParaRgb(ctx.pdfLib, el.stroke == null ? "#000000" : el.stroke) || ctx.pdfLib.rgb(0, 0, 0);
    const espessura = el.strokeWidth == null ? 0.5 : Number(el.strokeWidth);
    const fonte = await ctx.fontes.obter(resolverFonte(el, ctx.fontes.licenciadas || {}).chave, null);
    const fonteCab = await ctx.fontes.obter("Helvetica-Bold");
    const totalLinhas = (el.rows || []).length + (el.cabecalho === false ? 0 : 1);

    // fundo (opcional) e linhas horizontais
    for (let i = 0; i < totalLinhas; i++) {
      const yTopo = el.y + i * alturaLinha + (el.cabecalho === false ? 0 : (alturaCabecalho - alturaLinha));
      const h = (el.cabecalho !== false && i === 0) ? alturaCabecalho : alturaLinha;
      const y = converterY(yTopo, pagina.height, h);
      const pintar = el.fillCabecalho && el.cabecalho !== false && i === 0;
      if (pintar) {
        folha.drawRectangle({ x: caixa.x, y: y, width: caixa.width, height: h, color: corParaRgb(ctx.pdfLib, el.fillCabecalho) });
      }
      if (bordas.innerHorizontal || i === 0) {
        folha.drawLine({ start: { x: caixa.x, y: y + h }, end: { x: caixa.x + caixa.width, y: y + h }, thickness: espessura, color: stroke });
      }
      if (bordas.bottom && i === totalLinhas - 1) {
        folha.drawLine({ start: { x: caixa.x, y: y }, end: { x: caixa.x + caixa.width, y: y }, thickness: espessura, color: stroke });
      }
    }
    // verticais por coluna
    let xCursor = caixa.x;
    for (let c = 0; c <= cols.length; c++) {
      if (bordas.left || bordas.innerVertical || bordas.right) {
        const desenhar = (c === 0 && bordas.left) || (c === cols.length && bordas.right) || (c > 0 && c < cols.length && bordas.innerVertical);
        if (desenhar) {
          folha.drawLine({ start: { x: xCursor, y: caixa.y }, end: { x: xCursor, y: caixa.y + caixa.height }, thickness: espessura, color: stroke });
        }
      }
      xCursor += Number(cols[c] && cols[c].width) || 0;
    }
    // conteúdo
    let n = 0;
    const linhas = (el.rows || []);
    for (let i = 0; i < linhas.length; i++) {
      const yTopo = el.y + (el.cabecalho === false ? 0 : alturaCabecalho) + i * alturaLinha;
      let x = Number(el.x) || 0;
      for (let c = 0; c < cols.length; c++) {
        const col = cols[c];
        const celula = linhas[i][c];
        const texto = celulaTextoTabela(celula, dados);
        if (texto) {
          const alvo = { x: x, y: yTopo, width: Number(col.width) || 0, height: alturaLinha, font: { size: size, family: (el.font && el.font.family) || "Helvetica" }, alignment: (celula && celula.alinhamento) || col.alinhamento || "left", ancoraV: "meio", padding: 4 };
          await desenharTexto(folha, alvo, pagina, dados, ctx, texto);
          n++;
        }
        x += Number(col.width) || 0;
      }
    }
    // cabeçalho
    if (el.cabecalho !== false) {
      let x = Number(el.x) || 0;
      for (let c = 0; c < cols.length; c++) {
        const col = cols[c];
        const titulo = col.titulo == null ? "" : String(col.titulo);
        if (titulo) {
          await desenharTexto(folha, {
            x: x, y: el.y, width: Number(col.width) || 0, height: alturaCabecalho,
            font: { size: size, family: "Helvetica", weight: "bold" }, alignment: col.alinhamento || "left", ancoraV: "meio", padding: 4
          }, pagina, dados, Object.assign({}, ctx, { fontes: { obter: function () { return fonteCab; } } }), titulo);
          n++;
        }
        x += Number(col.width) || 0;
      }
    }
    return n > 0;
  }

  function celulaTextoTabela(celula, dados) {
    if (celula == null) return "";
    if (typeof celula === "string") return celula;
    if (celula.campo) { const v = resolverValor(dados, celula.campo); return v == null ? "" : String(v); }
    return celula.texto == null ? "" : String(celula.texto);
  }

  // ══════════════════════════════════════════════════════
  // §24/§41/§42 — VERSIONAMENTO, LOG E INTEGRIDADE
  // ══════════════════════════════════════════════════════
  /** Hash determinístico do documento (§42). SHA-256 quando há WebCrypto. */
  async function hashDefinicao(def) {
    const json = JSON.stringify(ordemEstavel(def));
    if (global.crypto && global.crypto.subtle && global.crypto.subtle.digest) {
      const buf = await global.crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
      return "sha256:" + Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    }
    // Fallback determinístico quando não há WebCrypto (documentado: não é hash criptográfico)
    let h = 0x811c9dc5;
    for (let i = 0; i < json.length; i++) { h ^= json.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return "fnv1a:" + h.toString(16).padStart(8, "0") + ":" + json.length;
  }

  /** Serialização com chaves ordenadas — hash não pode depender da ordem de escrita. */
  function ordemEstavel(valor) {
    if (Array.isArray(valor)) return valor.map(ordemEstavel);
    if (valor && typeof valor === "object") {
      const out = {};
      Object.keys(valor).sort().forEach(function (k) { if (valor[k] !== undefined) out[k] = ordemEstavel(valor[k]); });
      return out;
    }
    return valor;
  }

  /** Próxima versão semântica (patch) do documento. */
  function proximaVersao(versao) {
    const m = String(versao || "1.0.0").split(".").map(function (n) { return parseInt(n, 10) || 0; });
    while (m.length < 3) m.push(0);
    return m[0] + "." + m[1] + "." + (m[2] + 1);
  }

  /** §24 — só documento PUBLICADO pode ser usado oficialmente na geração. */
  function podePublicar(def) {
    const v = validarDefinicao(def);
    return { ok: v.ok, erros: v.erros, avisos: v.avisos };
  }

  /**
   * §3/§49 — modo efetivo do documento. "native" só com status PUBLICADO e
   * sem erro crítico; qualquer outra combinação permanece "external" (o
   * comportamento atual da aplicação não muda por acidente).
   */
  function modoEfetivo(registro) {
    const def = registro && (registro.definicao || registro);
    if (!def || !def.documentId) return { modo: "external", motivo: "documento nativo inexistente" };
    const preferido = (registro && registro.meta && registro.meta.modo) || "external";
    if (preferido !== "native") return { modo: "external", motivo: "modo declarado: " + preferido };
    const status = (def.metadados && def.metadados.status) || STATUS_PADRAO;
    if (status !== "PUBLICADO") return { modo: "external", motivo: "status " + status + " (só PUBLICADO gera oficialmente)" };
    const v = validarDefinicao(def);
    if (!v.ok) return { modo: "external", motivo: "validação com " + v.erros.length + " erro(s) crítico(s)" };
    return { modo: "native", motivo: "documento publicado e válido" };
  }

  /** Registro novo no overlay: definição + metadados + trilha de versões e log.
   *  É o que o painel grava em `overlay.docs_nativos[documentId]`. */
  function novoRegistro(definicao, opts) {
    const o = opts || {};
    const registro = {
      meta: {
        modo: o.modo || "external",
        status: (definicao.metadados && definicao.metadados.status) || STATUS_PADRAO,
        criadoEm: o.agora || new Date().toISOString(),
        criadoPor: o.autor || "painel",
        atualizadoEm: o.agora || new Date().toISOString(),
        atualizadoPor: o.autor || "painel"
      },
      definicao: definicao,
      versoes: [],
      log: []
    };
    if (o.motivoInicial) registro.log.push(entradaLog(o.motivoInicial, o.autor, o.agora));
    return registro;
  }

  function entradaLog(alteracao, autor, quando) {
    return { quando: quando || new Date().toISOString(), autor: autor || "painel", alteracao: alteracao };
  }

  /** Teto do log por documento (o Histórico do painel continua sendo a trilha longa). */
  const LOG_MAX = 200;
  function registrarLog(registro, alteracao, autor, quando) {
    if (!registro.log) registro.log = [];
    registro.log.unshift(entradaLog(alteracao, autor, quando));
    if (registro.log.length > LOG_MAX) registro.log.length = LOG_MAX;
    return registro.log[0];
  }

  /** Congela a versão corrente na trilha (§24/§39) — append-only. */
  async function congelarVersao(registro, opts) {
    const o = opts || {};
    const def = registro.definicao;
    def.documentVersion = o.versao || proximaVersao(def.documentVersion);
    def.metadados = Object.assign({}, def.metadados, {
      alteradoEm: o.agora || new Date().toISOString(),
      alteradoPor: o.autor || "painel"
    });
    if (o.status && STATUS_DOC.indexOf(o.status) !== -1) def.metadados.status = o.status;
    const hash = await hashDefinicao(def);
    const entrada = {
      versao: def.documentVersion,
      hash: hash,
      status: def.metadados.status,
      quando: def.metadados.alteradoEm,
      autor: def.metadados.alteradoPor,
      motivo: o.motivo || "",
      nElementos: idsElementos(def).length,
      page: { width: def.page.width, height: def.page.height },
      // §39 — pacote da versão: a definição COMPLETA, para restaurar sem
      // depender do estado atual (a trilha é append-only; nada é sobrescrito).
      definicao: JSON.parse(JSON.stringify(def))
    };
    registro.versoes = [entrada].concat(registro.versoes || []);
    registro.meta.status = def.metadados.status;
    registro.meta.atualizadoEm = entrada.quando;
    registro.meta.atualizadoPor = entrada.autor;
    registrarLog(registro, "v" + entrada.versao + " (" + entrada.status + "): " + (o.motivo || "alteração"), entrada.autor, entrada.quando);
    return entrada;
  }

  /** §41 — diff legível entre duas definições (para o log e o comparador). */
  function compararDefinicoes(antes, depois, opcoes) {
    const o = opcoes || {};
    const tol = o.tolerancia == null ? 0.01 : o.tolerancia;
    const mapa = function (def) {
      const m = {};
      for (const el of elementosTodos(def || { elementos: [] })) m[el.id] = el;
      return m;
    };
    const A = mapa(antes), B = mapa(depois);
    const adicionados = [], removidos = [], alterados = [];
    for (const id of Object.keys(B)) if (!A[id]) adicionados.push({ id: id, type: B[id].type });
    for (const id of Object.keys(A)) if (!B[id]) removidos.push({ id: id, type: A[id].type });
    for (const id of Object.keys(A)) {
      if (!B[id]) continue;
      const campos = [];
      const chaves = new Set(Object.keys(A[id]).concat(Object.keys(B[id])));
      for (const k of chaves) {
        if (k === "zIndex" || k === "__ordem" || k === "grupo") continue;
        if (k === "elementos") continue; // grupos: comparados pelos filhos (ids próprios)
        const va = A[id][k], vb = B[id][k];
        const num = typeof va === "number" || typeof vb === "number";
        const iguais = num && isFinite(va) && isFinite(vb) ? Math.abs(va - vb) <= tol : JSON.stringify(va) === JSON.stringify(vb);
        if (!iguais) campos.push({ campo: k, de: va, para: vb });
      }
      if (campos.length) alterados.push({ id: id, type: B[id].type, campos: campos });
    }
    const texto = function (d) {
      const partes = [];
      for (const a of adicionados.slice(0, 10)) partes.push("+" + a.id);
      for (const r of removidos.slice(0, 10)) partes.push("-" + r.id);
      for (const c of alterados.slice(0, 10)) partes.push(c.id + ": " + c.campos.map(function (x) { return x.campo + " " + Math.round((Number(x.de) || 0) * 100) / 100 + " → " + Math.round((Number(x.para) || 0) * 100) / 100; }).join(", "));
      return partes.join(" · ");
    };
    return { adicionados: adicionados, removidos: removidos, alterados: alterados, total: adicionados.length + removidos.length + alterados.length, resumo: texto(depois) };
  }

  // ══════════════════════════════════════════════════════
  // §27 — IMPORTAÇÃO DE PDF COMO REFERÊNCIA
  // ══════════════════════════════════════════════════════
  /** Multiplicação de matrizes 2×3 no formato do pdf.js ([a,b,c,d,e,f]). */
  function transformarMatriz(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }

  /**
   * Normaliza um item de `getTextContent()` para o espaço da definição
   * (X da esquerda, Y do topo) usando a matriz de viewport escala 1 — a MESMA
   * conta que o pdf.js usa na camada de texto. Nada aqui depende de suposição:
   * se a matriz de viewport for diferente, o resultado acompanha.
   */
  function normalizarItemTexto(item, matrixViewport, opts) {
    const m = transformarMatriz(matrixViewport, item.transform);
    const tamanho = Math.hypot(m[2], m[3]) || Math.abs(m[3]) || 10;
    const o = opts || {};
    // A fonte REAL do item (nome embutido no PDF) só existe em `opts.fontes`,
    // montado por quem tem o pdf.js: as 14 fontes padrão do gerador não
    // reproduzem a família licenciada — a mais próxima é registrada no relatório.
    const info = (o.fontes && item.fontName && o.fontes[item.fontName]) || null;
    return {
      texto: String(item.str == null ? "" : item.str),
      x: arredondar(m[4], 2),
      // m[5] é a baseline medida a partir do TOPO (viewport já inverte o eixo Y)
      yBase: arredondar(m[5], 2),
      tamanho: arredondar(tamanho, 2),
      largura: arredondar(item.width || 0, 2),
      larguraReal: arredondar(item.width || 0, 2),
      direcao: item.dir || "ltr",
      fonte: item.fontName || null,
      fonteReal: info ? info.nome : null,
      familia: info ? info.family : null,
      peso: info ? info.weight : null,
      estiloFonte: info ? info.style : null
    };
  }

  /**
   * Família do PDF → uma das 14 fontes padrão do formato (§15).
   * CUIDADO MEDIDO: "sans-serif" CONTÉM "serif" — testar serif primeiro manda
   * todo texto sem serifa para Times (erro que só aparece no comparador).
   */
  function familiaPadrao(nome) {
    const n = String(nome || "").toLowerCase();
    if (/mono|courier|consol|menlo/.test(n)) return "Courier";
    if (/sans|arial|helvetica|verdana|tahoma|calibri|segoe|roboto|noto sans|lato|open sans|dejavu sans|freesans|symbol|zapf|dingbat|wingding/.test(n)) return "Helvetica";
    if (/serif|times|georgia|garamond|cambria|book|roman|dejavuserif|freeserif/.test(n)) return "Times";
    return "Helvetica";
  }

  /**
   * §27.2 — símbolo de caixa de marcação (❑ □ ☐ ☑ ✓ ✗ em fonte de símbolos).
   * O PDF desenha a caixinha como GLIFO: nas 14 fontes padrão não existe
   * equivalente, então o símbolo vira um elemento `checkbox` de verdade —
   * melhor que perder a caixa (ou imprimir um "?").
   */
  function ehCaixaDeMarcacao(texto) {
    const t = String(texto == null ? "" : texto).trim();
    if (!t) return false;
    if (/^[\u25A0-\u25FF\u2610-\u2612\u2700-\u27BF\u2B1A-\u2B1C]+$/.test(t)) return true;
    // Glifos fora do WinAnsi vindos de fonte simbólica (ex.: Private Use Area)
    if (/[\uE000-\uF8FF]/.test(t)) return true;
    return false;
  }

  /**
   * §27 — converte itens normalizados em elementos `text` da definição.
   * Agrupa itens da mesma linha (mesma baseline ± tolerância) e mesma fonte,
   * porque um PDF costuma quebrar um rótulo em vários fragmentos.
   * Tudo sai com `origem: "importado"` e `confirmado: false` (REQUER CALIBRAÇÃO).
   */
  /**
   * §27 — agrupa fragmentos da MESMA linha (um rótulo costuma vir em vários
   * pedaços no PDF). Devolve os blocos, não os pedaços: é o que vira elemento.
   */
  function agruparItensDeTexto(itens, opts) {
    const o = opts || {};
    const tolLinha = o.toleranciaLinha == null ? 1.2 : o.toleranciaLinha;
    const tolEspaco = o.toleranciaEspaco == null ? 1.5 : o.toleranciaEspaco;
    const usados = {};
    const out = [];
    const ordenados = (itens || [])
      .map(function (it, i) { return Object.assign({ idx: i }, it); })
      .sort(function (a, b) { return a.yBase - b.yBase || a.x - b.x; });
    for (const it of ordenados) {
      if (!it.texto || !it.texto.trim()) continue;
      if (usados[it.idx]) continue;
      const partes = [it];
      let texto = it.texto;
      let largura = it.largura;
      let fim = it.x + (it.largura || 0);
      for (const outro of ordenados) {
        if (outro === it || usados[outro.idx]) continue;
        if (!outro.texto || !outro.texto.trim()) continue;
        if (Math.abs(outro.yBase - it.yBase) > tolLinha) continue;
        if (Math.abs(outro.tamanho - it.tamanho) > 0.5) continue;
        if (outro.x - fim > tolEspaco || outro.x < it.x) continue;
        texto += (outro.x - fim > 0.4 ? " " : "") + outro.texto;
        largura = outro.x + (outro.largura || 0) - it.x;
        fim = outro.x + (outro.largura || 0);
        usados[outro.idx] = true;
        partes.push(outro);
      }
      out.push(Object.assign({}, it, { texto: texto, largura: largura, partes: partes.length, larguraReal: it.larguraReal || it.largura }));
    }
    return out.map(function (bloco, i) { return Object.assign({}, bloco, { indice: i }); });
  }

  /** Blocos → elementos `text` da definição. */
  function elementosDeItensDeTexto(itens, pagina, opts) {
    const o = opts || {};
    const pagina_info = pagina || {};
    const blocos = o.jaAgrupado ? (itens || []) : agruparItensDeTexto(itens, o);
    const out = [];
    for (const it of blocos) {
      if (!it.texto || !it.texto.trim()) continue;
      const largura = it.largura;
      if (ehCaixaDeMarcacao(it.texto)) {
        const lado = arredondar(Math.max(4, Number(it.tamanho) * 0.8), 2);
        out.push({
          id: o.prefixoId ? o.prefixoId + "_cx_" + Math.round(it.x) + "_" + Math.round(it.yBase) : "cx_" + Math.round(it.x) + "_" + Math.round(it.yBase),
          type: "checkbox",
          page: o.page || 1,
          x: arredondar(it.x, 2),
          y: arredondar(Math.max(0, it.yBase - lado), 2),
          width: arredondar(Math.max(largura, lado), 2),
          height: lado,
          checked: false,
          color: "#000000",
          strokeWidth: 0.5,
          ancoraV: "base",
          zIndex: o.zIndexBase == null ? zMobiliario("texto", out.length) : o.zIndexBase + out.length,
          origem: "importado",
          confirmado: o.confirmar === true,
          glifoRef: it.texto.trim(),
          paginaRef: o.page || (pagina_info.pageIndex || 1)
        });
        continue;
      }
      out.push({
        id: o.prefixoId ? o.prefixoId + "_" + Math.round(it.x) + "_" + Math.round(it.yBase) : "texto_" + Math.round(it.x) + "_" + Math.round(it.yBase),
        type: "text",
        page: o.page || 1,
        content: String(it.texto).replace(/\s+/g, " ").trim(),
        // caixa com a BASE na baseline medida (ancoraV "base" reproduz o original)
        x: arredondar(it.x, 2),
        y: arredondar(Math.max(0, it.yBase - it.tamanho * 1.15), 2),
        width: arredondar(Math.max(largura, it.tamanho * 0.5), 2),
        height: arredondar(it.tamanho * 1.15, 2),
        font: {
          family: familiaPadrao(it.familia || it.fonteReal),
          size: it.tamanho,
          weight: it.peso === "bold" ? "bold" : "normal",
          style: it.estiloFonte === "italic" ? "italic" : "normal"
        },
        color: it.cor || "#000000",
        alignment: "left",
        ancoraV: "base",
        // Texto fixo do formulário é o texto ORIGINAL: não é cortado com
        // reticências (isso é regra para valor dinâmico que não cabe na célula),
        // e a folga é zero — a caixa já é a extensão medida no PDF.
        truncar: false,
        padding: 0,
        zIndex: o.zIndexBase == null ? zMobiliario("texto", out.length) : o.zIndexBase + out.length,
        origem: "importado",
        confirmado: o.confirmar === true,
        fonteReal: it.fonteReal || null,
        larguraMedida: arredondar(it.larguraReal || largura, 2),
        paginaRef: o.page || (pagina_info.pageIndex || 1)
      });
    }
    return out;
  }

  // ══════════════════════════════════════════════════════
  // §27.2 — MOBILIÁRIO DA REFERÊNCIA: LINHAS, CAIXAS E IMAGENS
  //
  // Extrair só o TEXTO do PDF deixa de fora justamente o mobiliário: réguas,
  // caixas, logotipos e faixas. Um PDF descreve isso em OPERADORES de desenho,
  // não em texto — então aqui eles são lidos direto da lista de operadores do
  // pdf.js (o mesmo formato que o painel já usa para o preview).
  //
  // Regra de honestidade: só entra o que é PINTADO. Caminhos usados apenas como
  // RECORTE (`W n`, que no pdf.js vira `eoClip ... endPath`) não desenham nada e
  // não viram elemento — são contados no relatório.
  // ══════════════════════════════════════════════════════
  /** Limite (pt) para um retângulo preenchido ser tratado como linha/regra. */
  const LIMITE_ESPESSURA_PT = 1.6;
  /**
   * Bandas de camada do mobiliário — SEMPRE abaixo dos campos (100+).
   * Dentro da banda o incremento é fracionário (0,001 por elemento) porque um
   * formulário real tem centenas de itens: somar 1 por item estouraria a banda e
   * jogaria texto importado por cima dos campos dinâmicos.
   */
  const Z_MOBILIARIO = { regra: 10, imagem: 20, texto: 30 };
  const Z_INCREMENTO = 0.001;
  /** zIndex do mobiliário: banda + ordem (nunca alcança a banda dos campos). */
  function zMobiliario(tipo, ordem) {
    return arredondar(Z_MOBILIARIO[tipo] + (Number(ordem) || 0) * Z_INCREMENTO, 3);
  }

  /** Mapa valor→nome dos operadores (o inverso de OPS não é exposto). */
  function nomesDeOperadores(OPS) {
    const mapa = {};
    for (const k of Object.keys(OPS || {})) {
      const v = OPS[k];
      if (typeof v === "number" && mapa[v] === undefined) mapa[v] = k;
    }
    return mapa;
  }

  /**
   * Cor vinda de um operador do pdf.js em `#rrggbb`.
   * OBSERVAÇÃO MEDIDA: nesta versão do pdf.js as cores chegam em 0–255 (array
   * tipado), não em 0–1 — as duas escalas são aceitas, nunca adivinhadas em
   * silêncio: se os três canais couberem em 0–1, a escala é a normalizada.
   */
  function corDoOperador(args) {
    if (!args || args.length < 3) return null;
    const c = [Number(args[0]), Number(args[1]), Number(args[2])];
    for (const v of c) if (!isFinite(v) || v < 0) return null;
    const escala = maximo(c) <= 1 ? 255 : 1;
    return "#" + c.map(function (v) {
      const n = Math.max(0, Math.min(255, Math.round(v * escala)));
      return n.toString(16).padStart(2, "0");
    }).join("");
  }

  function maximo(lista) {
    let m = -Infinity;
    for (const v of lista) if (v > m) m = v;
    return m;
  }

  /**
   * §27.2 — lê a lista de operadores e devolve o que é DESENHADO na página:
   * `{ regras, imagens, recortes, naoSuportado, porPagina }`.
   *
   * As coordenadas saem no espaço da definição (X da esquerda, Y do topo),
   * usando a MESMA matriz de viewport do texto — nenhuma conversão paralela.
   */
  function extrairGraficos(ops, OPS, matrizViewport, opts) {
    const o = opts || {};
    const espessuraLimite = o.limiteEspessura == null ? LIMITE_ESPESSURA_PT : Number(o.limiteEspessura);
    const ladoMinimo = o.ladoMinimo == null ? 0.02 : Number(o.ladoMinimo);
    const nomes = nomesDeOperadores(OPS);
    const simbolicos = {
      moveTo: OPS.moveTo, lineTo: OPS.lineTo, curveTo: OPS.curveTo,
      curveTo2: OPS.curveTo2, curveTo3: OPS.curveTo3, closePath: OPS.closePath,
      rectangle: OPS.rectangle
    };
    // Depois de um `constructPath` vem o operador que PINTA (ou só recorta).
    const pintura = {
      fill: "preenchido", eoFill: "preenchido",
      fillStroke: "ambos", eoFillStroke: "ambos", closeFillStroke: "ambos",
      stroke: "contorno", closeStroke: "contorno"
    };
    const recorte = { clip: true, eoClip: true };
    let ctm = (matrizViewport || [1, 0, 0, -1, 0, 0]).slice();
    const pilha = [];
    let preenchimento = "#000000", contorno = "#000000", larguraTraco = 1, tracejado = null;
    let alfa = 1, alfaContorno = 1;
    // Região de recorte corrente (parte do estado gráfico: `save`/`restore` a
    // guardam e devolvem). Sem isso, um preenchimento enorme desenhado dentro de
    // um recorte viraria um retângulo preto por cima da página.
    let recorteAtual = null;
    let caminhoAtual = null;
    let caixaAtual = null;
    const regras = [];
    const imagens = [];
    const resultado = { regras: regras, imagens: imagens, recortes: 0, recortadas: 0, naoSuportado: [], nOperadores: 0 };
    const registrarNaoSuportado = function (oQue) { if (resultado.naoSuportado.indexOf(oQue) === -1) resultado.naoSuportado.push(oQue); };
    // A folga evita falso "fora do recorte" quando a régua está exatamente na
    // borda da região recortada (o caso mais comum neste formulário).
    const folga = o.folgaRecorte == null ? 0.5 : Number(o.folgaRecorte);
    const visivelDe = function (caixa) {
      if (!caixa) return 1;
      const alvo = recorteAtual ? inflar(recorteAtual, folga) : null;
      if (!alvo) return 1;
      const inter = intersecao(caixa, alvo);
      if (!inter) return 0;
      const area = Math.max(caixa.width * caixa.height, 1e-6);
      return Math.min(1, (inter.width * inter.height) / area);
    };

    for (let i = 0; i < ops.fnArray.length; i++) {
      const nome = nomes[ops.fnArray[i]];
      const args = ops.argsArray[i];
      resultado.nOperadores++;
      if (nome === "save" || nome === "paintFormXObjectBegin" || nome === "beginGroup") {
        pilha.push({ ctm: ctm.slice(), preenchimento: preenchimento, contorno: contorno, larguraTraco: larguraTraco, tracejado: tracejado, recorte: recorteAtual, alfa: alfa, alfaContorno: alfaContorno });
        if (nome !== "save" && args && args[nome === "beginGroup" ? 2 : 0]) ctm = transformarMatriz(ctm, args[nome === "beginGroup" ? 2 : 0]);
        continue;
      }
      if (nome === "restore" || nome === "paintFormXObjectEnd" || nome === "endGroup") {
        const anterior = pilha.pop();
        if (anterior) ({ ctm, preenchimento, contorno, larguraTraco, tracejado, recorte: recorteAtual, alfa: alfa, alfaContorno: alfaContorno } = anterior);
        continue;
      }
      if (nome === "transform") { ctm = transformarMatriz(ctm, args); continue; }
      if (nome === "setFillRGBColor") { const c = corDoOperador(args); if (c) preenchimento = c; continue; }
      if (nome === "setStrokeRGBColor") { const c = corDoOperador(args); if (c) contorno = c; continue; }
      // OBSERVAÇÃO MEDIDA: o `setGState` do pdf.js chega como LISTA DE PARES
      // (`[[["ca",0]]]`, `[[["lw",0.75]]]`), não como objeto — ler como objeto
      // deixava `ca`/`lw` passarem batido.
      if (nome === "setGState" || nome === "setLineWidth" || nome === "setDash") {
        const pares = nome === "setGState" && args && args[0]
          ? (Array.isArray(args[0]) ? args[0] : Object.keys(args[0]).map(function (k) { return [k, args[0][k]]; }))
          : [[nome === "setLineWidth" ? "lw" : "d", args && args[0]]];
        for (const par of pares) {
          if (!par) continue;
          const chave = par[0], valor = par[1];
          if (chave === "lw") larguraTraco = Number(valor);
          else if (chave === "d") tracejado = (valor && valor.length) ? Array.prototype.slice.call(valor).map(Number) : null;
          // Transparência faz parte do estado gráfico: `ca`/`CA` = 0 é a convenção
          // de MÁSCARA (forma invisível). Isso não é mobiliário desenhado.
          else if (chave === "ca") alfa = Number(valor);
          else if (chave === "CA") alfaContorno = Number(valor);
        }
        continue;
      }
      if (nome === "paintImageXObject" || nome === "paintImageMaskXObject" || nome === "paintInlineImage") {
        const cx = caixaDaImagem(ctm);
        imagens.push({
          ref: nome === "paintInlineImage" ? null : (args && args[0]) || null,
          op: nome,
          x: cx.x, y: cx.y, width: cx.width, height: cx.height,
          rotacionada: cx.rotacionada,
          ordem: i
        });
        continue;
      }
      if (nome === "constructPath") {
        caminhoAtual = decodificarCaminho(args, OPS, ctm, simbolicos, registrarNaoSuportado);
        caixaAtual = caixaDeCaminhos(caminhoAtual);
        continue;
      }
      // `W n` (no pdf.js: `eoClip`/`clip` + `endPath`) — o caminho só RECORTA.
      if (recorte[nome]) {
        if (caixaAtual) {
          recorteAtual = intersecao(recorteAtual, caixaAtual);
          resultado.recortes++;
        }
        continue;
      }
      if (nome === "endPath") { caminhoAtual = null; caixaAtual = null; continue; }
      if (!pintura[nome]) continue;
      if (!caminhoAtual || !caminhoAtual.length) continue;
      const modo = pintura[nome];
      // Invisível por transparência (ca/CA = 0) = máscara, não mobiliário.
      const opacidade = modo === "contorno" ? alfaContorno : alfa;
      if (opacidade <= 0.01) { resultado.transparentes = (resultado.transparentes || 0) + 1; caminhoAtual = null; caixaAtual = null; continue; }
      const visivel = visivelDe(caixaAtual);
      // O que está (quase) todo fora do recorte não aparece na página: não vira
      // elemento — mas fica contado, para o relatório não mentir.
      if (visivel < (o.minimoVisivel == null ? 0.35 : Number(o.minimoVisivel))) {
        resultado.recortadas++;
        caminhoAtual = null; caixaAtual = null;
        continue;
      }
      const estado = { cor: modo === "contorno" ? contorno : preenchimento, corContorno: contorno, largura: larguraTraco, tracejado: tracejado, modo: modo, op: i, visivel: arredondar(visivel, 3), opacidade: arredondar(opacidade, 3) };
      for (const caminho of caminhoAtual) {
        if (caminho.tipo === "caixa" || caminho.tipo === "poligonoFechado") {
          regras.push(Object.assign({ tipo: "caixa", x: caminho.x, y: caminho.y, width: caminho.width, height: caminho.height }, estado));
        } else if (caminho.tipo === "pontos" && caminho.pontos.length === 2) {
          regras.push(Object.assign({
            tipo: "segmento",
            x1: caminho.pontos[0].x, y1: caminho.pontos[0].y,
            x2: caminho.pontos[1].x, y2: caminho.pontos[1].y
          }, estado));
        } else if (caminho.tipo === "pontos") {
          registrarNaoSuportado("polilinha aberta com " + caminho.pontos.length + " pontos (reconstrua como line/table)");
        }
      }
      caminhoAtual = null;
      caixaAtual = null;
    }
    // Espessura de um preenchimento fino = espessura real da régua (§27.2).
    for (const r of regras) {
      if (r.tipo === "caixa" && r.modo === "preenchido") {
        const fino = Math.min(r.width, r.height) <= espessuraLimite;
        if (fino && Math.max(r.width, r.height) > ladoMinimo * 2) {
          const horizontal = r.width >= r.height;
          r.tipo = "segmento";
          r.x1 = r.x;
          r.y1 = r.y + (horizontal ? r.height / 2 : 0);
          r.x2 = r.x + (horizontal ? r.width : 0);
          r.y2 = r.y + (horizontal ? r.height / 2 : r.height);
        }
      }
    }
    const uteis = regras.filter(function (r) {
      if (r.tipo === "segmento") return Math.hypot(r.x2 - r.x1, r.y2 - r.y1) > ladoMinimo;
      return r.width > ladoMinimo && r.height > ladoMinimo;
    });
    resultado.regras = uteis;
    resultado.descartadas = regras.length - uteis.length;
    return resultado;
  }

  /** Caixa inflada em `d` pt para cada lado. */
  function inflar(caixa, d) {
    if (!caixa || !d) return caixa;
    return { x: caixa.x - d, y: caixa.y - d, width: caixa.width + 2 * d, height: caixa.height + 2 * d };
  }

  /** Interseção de duas caixas (null = sem recorte / recorte vazio). */
  function intersecao(a, b) {
    if (!a) return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
    if (!b) return { x: a.x, y: a.y, width: a.width, height: a.height };
    const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.width, b.x + b.width), y1 = Math.min(a.y + a.height, b.y + b.height);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: arredondar(x0, 2), y: arredondar(y0, 2), width: arredondar(x1 - x0, 2), height: arredondar(y1 - y0, 2) };
  }

  /** Caixa que envolve todos os caminhos de um `constructPath`. */
  function caixaDeCaminhos(caminhos) {
    const caixas = [];
    for (const c of (caminhos || [])) {
      if (c.tipo === "caixa") caixas.push({ x: c.x, y: c.y, width: c.width, height: c.height });
      else for (const p of (c.pontos || [])) caixas.push({ x: p.x, y: p.y, width: 0, height: 0 });
    }
    if (!caixas.length) return null;
    const xs = caixas.map(function (c) { return c.x; }).concat(caixas.map(function (c) { return c.x + c.width; }));
    const ys = caixas.map(function (c) { return c.y; }).concat(caixas.map(function (c) { return c.y + c.height; }));
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    // Caixa de espessura zero (um segmento) recebe o mínimo da página: a
    // visibilidade dele é medida contra o recorte, não contra a própria área.
    return { x: x0, y: y0, width: Math.max(x1 - x0, 0.4), height: Math.max(y1 - y0, 0.4) };
  }

  /** Caixa de colocação de uma imagem a partir da matriz corrente (unidade = 1×1). */
  function caixaDaImagem(ctm) {
    const cantos = [
      transformarMatriz(ctm, [1, 0, 0, 1, 0, 0]),
      transformarMatriz(ctm, [1, 0, 0, 1, 1, 0]),
      transformarMatriz(ctm, [1, 0, 0, 1, 1, 1]),
      transformarMatriz(ctm, [1, 0, 0, 1, 0, 1])
    ].map(function (m) { return { x: m[4], y: m[5] }; });
    const xs = cantos.map(function (p) { return p.x; }), ys = cantos.map(function (p) { return p.y; });
    const x = Math.min.apply(null, xs), y = Math.min.apply(null, ys);
    const width = Math.max.apply(null, xs) - x, height = Math.max.apply(null, ys) - y;
    // Rotação/espelhamento: as coordenadas da definição têm Y do TOPO, então uma
    // imagem colocada com Y invertido aparece na orientação correta — a caixa
    // acima já é a aparência final (min/max dos quatro cantos).
    const rotacionada = Math.abs(ctm[1]) > 0.0001 || Math.abs(ctm[2]) > 0.0001;
    return {
      x: arredondar(x, 2), y: arredondar(y, 2),
      width: arredondar(width, 2), height: arredondar(height, 2),
      rotacionada: rotacionada
    };
  }

  /**
   * Decodifica os comandos de um `constructPath` em caminhos já no espaço da
   * definição. Curvas são aproximadas pelo ponto final (documentado no relatório:
   * o gerador não desenha bézier).
   */
  function decodificarCaminho(args, OPS, ctm, simbolicos, reportar) {
    const comandos = Array.prototype.slice.call((args && args[0]) || []);
    const coords = Array.prototype.slice.call((args && args[1]) || []);
    const para = function (x, y) {
      const m = transformarMatriz(ctm, [1, 0, 0, 1, x, y]);
      return { x: arredondar(m[4], 2), y: arredondar(m[5], 2) };
    };
    const ponto = function (k) { return para(coords[k], coords[k + 1]); };
    const saida = [];
    let atual = null;
    let p = 0;
    const fechar = function (fechado) { if (atual && atual.length) saida.push({ tipo: "pontos", pontos: atual, fechado: !!fechado }); atual = null; };
    let ultimoFechado = false;
    for (const cmd of comandos) {
      if (cmd === simbolicos.rectangle) {
        // ATENÇÃO (medido): no operador `re` os dois últimos argumentos são
        // LARGURA e ALTURA, não um segundo ponto — ler como ponto gerava caixas
        // com o tamanho de outra coordenada (só não aparecia quando x=y=0).
        const x = coords[p], y = coords[p + 1], w = coords[p + 2], h = coords[p + 3];
        p += 4;
        const a = para(x, y), b = para(x + w, y + h);
        saida.push({ tipo: "caixa", x: arredondar(Math.min(a.x, b.x), 2), y: arredondar(Math.min(a.y, b.y), 2), width: arredondar(Math.abs(b.x - a.x), 2), height: arredondar(Math.abs(b.y - a.y), 2) });
      } else if (cmd === simbolicos.moveTo) { fechar(false); atual = [ponto(p)]; p += 2; ultimoFechado = false; }
      else if (cmd === simbolicos.lineTo) { if (atual) atual.push(ponto(p)); p += 2; ultimoFechado = false; }
      else if (cmd === simbolicos.curveTo) { if (atual) atual.push(ponto(p + 4)); p += 6; if (reportar) reportar("curva (bézier) aproximada pelo ponto final"); }
      else if (cmd === simbolicos.curveTo2 || cmd === simbolicos.curveTo3) { if (atual) atual.push(ponto(p + 2)); p += 4; if (reportar) reportar("curva (bézier) aproximada pelo ponto final"); }
      else if (cmd === simbolicos.closePath) { fechar(true); ultimoFechado = true; }
      else { p += 0; if (reportar) reportar("comando de caminho desconhecido (" + cmd + ")"); }
    }
    fechar(ultimoFechado);
    // Polígono de 4 pontos alinhado aos eixos = caixa (o PDF desenha muitos
    // retângulos assim, sem usar o comando `re`).
    return saida.map(function (c) {
      if (c.tipo !== "pontos" || !c.fechado || c.pontos.length !== 4) return c;
      const xs = c.pontos.map(function (q) { return q.x; }), ys = c.pontos.map(function (q) { return q.y; });
      const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      const alinhado = c.pontos.every(function (q) { return (Math.abs(q.x - x0) < 0.02 || Math.abs(q.x - x1) < 0.02) && (Math.abs(q.y - y0) < 0.02 || Math.abs(q.y - y1) < 0.02); });
      if (!alinhado) return c;
      return { tipo: "caixa", x: x0, y: y0, width: arredondar(x1 - x0, 2), height: arredondar(y1 - y0, 2) };
    });
  }

  /**
   * §27.2 — contraste do texto sobre tarja: um texto dentro de um retângulo
   * PREENCHIDO escuro do próprio PDF só pode ser claro (branco) para ser lido.
   * A decisão vem da geometria extraída (sobreposição medida), não de palpite.
   */
  function aplicarContrasteDeTarja(itens, regras, opts) {
    const o = opts || {};
    const cobertura = o.cobertura == null ? 0.7 : Number(o.cobertura);
    const escuras = (regras || []).filter(function (r) {
      if (r.tipo !== "caixa" || r.modo !== "preenchido") return false;
      return luminanciaDaCor(r.cor) < (o.limiteEscuro == null ? 0.45 : Number(o.limiteEscuro));
    });
    if (!escuras.length) return (itens || []).map(function (i) { return i.cor ? i : Object.assign({}, i, { cor: "#000000" }); });
    return (itens || []).map(function (it) {
      if (!it.texto || !it.texto.trim()) return it;
      const altura = Math.max(2, Number(it.tamanho) || 8);
      const caixa = {
        x: Number(it.x) || 0,
        y: Math.max(0, (Number(it.yBase) || 0) - altura * 1.15),
        width: Math.max(Number(it.largura) || 0, altura * 0.5),
        height: altura * 1.15
      };
      for (const r of escuras) {
        const inter = intersecao(caixa, { x: r.x, y: r.y, width: r.width, height: r.height });
        if (!inter) continue;
        const area = Math.max(caixa.width * caixa.height, 1e-6);
        if ((inter.width * inter.height) / area >= cobertura) return Object.assign({}, it, { cor: "#ffffff", tarja: r.cor });
      }
      return Object.assign({}, it, { cor: "#000000" });
    });
  }

  /** Luminância relativa (0–1) de um `#rrggbb` — para saber se a tarja é escura. */
  function luminanciaDaCor(cor) {
    const hex = String(cor || "#000000").replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return 0;
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return arredondar((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, 4);
  }

  /** §27.2 — transforma o mobiliário extraído em elementos da definição. */
  function elementosDeGraficos(graficos, opts) {
    const o = opts || {};
    const pagina = o.page || 1;
    const nomeImagem = o.nomeDeImagem || function (ref, i) { return (o.prefixoImagem || "ref") + "_" + String(i + 1).padStart(2, "0") + ".png"; };
    const elementos = [];
    const assets = [];
    const incluirRegras = o.incluirRegras !== false;
    const incluirImagens = o.incluirImagens !== false;
    const usados = {};
    const idUnico = function (base) {
      let id = base, n = 1;
      while (usados[id]) { id = base + "_" + (++n); }
      usados[id] = true;
      return id;
    };
    // Espessura da régua: num segmento que veio de um retângulo fino, a
    // espessura é o lado CURTO medido no PDF — nunca um valor estimado.
    const espessuraDe = function (r) {
      if (r.modo === "preenchido") {
        const curto = Math.min(Math.abs(r.width || 0), Math.abs(r.height || 0));
        return arredondar(Math.max(0.2, curto || 0.5), 2);
      }
      return arredondar(Math.max(0.2, Number(r.largura) || 0.75), 2);
    };
    if (incluirRegras) {
      for (const r of ((graficos && graficos.regras) || [])) {
        if (r.tipo === "segmento") {
          const el = {
            id: idUnico("regra_" + Math.round(r.x1) + "_" + Math.round(r.y1)),
            type: "line", page: pagina,
            x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2,
            x: arredondar(Math.min(r.x1, r.x2), 2), y: arredondar(Math.min(r.y1, r.y2), 2),
            width: arredondar(Math.abs(r.x2 - r.x1), 2), height: arredondar(Math.abs(r.y2 - r.y1), 2),
            stroke: r.cor || "#000000",
            strokeWidth: espessuraDe(r),
            lineStyle: r.tracejado && r.tracejado.length ? (r.tracejado[0] <= 1.5 ? "dotted" : "dashed") : "solid",
            zIndex: zMobiliario("regra", elementos.length),
            origem: "importado", confirmado: o.confirmar === true
          };
          if (Math.abs(r.y2 - r.y1) > 0.01 && Math.abs(r.x2 - r.x1) > 0.01) el.inclinada = true;
          elementos.push(el);
        } else {
          elementos.push({
            id: idUnico("caixa_" + Math.round(r.x) + "_" + Math.round(r.y)),
            type: "rectangle", page: pagina,
            x: r.x, y: r.y, width: r.width, height: r.height,
            fill: r.modo === "contorno" ? null : (r.cor || null),
            stroke: r.modo === "preenchido" ? null : (r.corContorno || "#000000"),
            strokeWidth: arredondar(Math.max(0.2, r.largura || 0.5), 2),
            opacity: 1,
            zIndex: zMobiliario("regra", elementos.length),
            origem: "importado", confirmado: o.confirmar === true
          });
        }
      }
    }
    if (incluirImagens && graficos && graficos.imagens) {
      graficos.imagens.forEach(function (img, i) {
        const arquivo = (o.nomeDeArquivo && o.nomeDeArquivo(img, i)) || nomeImagem(img.ref, i);
        elementos.push({
          id: idUnico("imagem_" + (img.ref || i + 1)),
          type: "image", page: pagina,
          arquivo: arquivo,
          x: img.x, y: img.y, width: img.width, height: img.height,
          zIndex: zMobiliario("imagem", i),
          origem: "importado", confirmado: o.confirmar === true,
          refOrigem: img.ref || null
        });
        assets.push({ id: slugId(arquivo), tipo: "imagem", arquivo: arquivo, nota: "extraída da referência: " + (img.ref || "imagem inline") });
      });
    }
    return { elementos: elementos, assets: assets };
  }

  /**
   * §27 — cópia de referência: congela em um único objeto TUDO o que a extração
   * conseguiu ler (texto + mobiliário + imagens). É este objeto que o painel
   * guarda/exporta e que o gerador do documento consome — assim a reconstrução
   * é sempre a mesma conta, com ou sem navegador.
   */
  function snapshotDeReferencia(partes) {
    const p = partes || {};
    const graficos = p.graficos || {};
    return {
      formato: "referencia-pdf/1",
      arquivo: p.arquivo || null,
      pageIndex: p.pageIndex || 1,
      page: { width: arredondar((p.page || {}).width, 2), height: arredondar((p.page || {}).height, 2) },
      textos: (p.itens || []).filter(function (t) { return t.texto && t.texto.trim(); }).map(function (t) {
        return {
          conteudo: t.texto.replace(/\s+/g, " ").trim(),
          x: t.x, yBase: t.yBase, tamanho: t.tamanho, largura: t.largura,
          familia: t.familia || null, fonteReal: t.fonteReal || null,
          peso: t.peso || null, estilo: t.estiloFonte || null,
          cor: t.cor || "#000000"
        };
      }),
      regras: (graficos.regras || []).map(function (r) {
        const base = { cor: r.cor || "#000000", modo: r.modo || "preenchido", largura: r.largura == null ? null : r.largura, tracejado: r.tracejado || null, corContorno: r.corContorno || null };
        if (r.tipo === "segmento") return Object.assign({ tipo: "segmento", x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 }, base);
        return Object.assign({ tipo: "caixa", x: r.x, y: r.y, width: r.width, height: r.height }, base);
      }),
      imagens: (graficos.imagens || []).map(function (i) {
        return { ref: i.ref || null, x: i.x, y: i.y, width: i.width, height: i.height };
      }),
      recortes: graficos.recortes || 0,
      naoSuportado: graficos.naoSuportado || []
    };
  }

  /**
   * §27 — volta do snapshot para o formato do extrator, para o painel (e o
   * gerador do repositório) reconstruírem o mesmo mobiliário a partir de uma
   * referência já congelada, sem reabrir o PDF.
   */
  function graficosDeSnapshot(snap) {
    const s = snap || {};
    const comum = function (r) {
      return {
        modo: r.modo || "preenchido",
        largura: r.largura == null ? null : Number(r.largura),
        tracejado: r.tracejado || null,
        cor: r.cor || "#000000",
        corContorno: r.corContorno || null
      };
    };
    return {
      regras: (s.regras || []).map(function (r) {
        if (r.tipo === "segmento") return Object.assign({ tipo: "segmento", x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 }, comum(r));
        return Object.assign({ tipo: "caixa", x: r.x, y: r.y, width: r.width, height: r.height }, comum(r));
      }),
      imagens: (s.imagens || []).map(function (i, k) {
        return { ref: i.ref || null, x: i.x, y: i.y, width: i.width, height: i.height, ordem: k };
      }),
      recortes: s.recortes || 0,
      recortadas: s.recortadas || 0,
      transparentes: s.transparentes || 0,
      naoSuportado: s.naoSuportado || []
    };
  }

  /** Relatório honesto do que a importação NÃO conseguiu identificar (§27). */
  function relatorioImportacao(itens, elementos, graficos) {
    const semTexto = (itens || []).filter(function (i) { return !i.texto || !i.texto.trim(); }).length;
    const g = graficos || {};
    const fontes = {};
    for (const it of (itens || [])) if (it.fonteReal) fontes[it.fonteReal] = true;
    const naoIdentificado = [
      "tabelas vinculadas a dados (reconstrua com o elemento table para manter colunas)",
      "assinaturas gráficas, carimbos e fotos",
      "fontes licenciadas da referência (o gerador usa as 14 fontes padrão do PDF)"
    ];
    for (const t of (g.naoSuportado || [])) naoIdentificado.push(t);
    return {
      nItens: (itens || []).length,
      nElementos: elementos.length,
      nVazios: semTexto,
      nRegras: (g.regras || []).length,
      nImagens: (g.imagens || []).length,
      nRecortes: g.recortes || 0,
      nDescartadas: g.descartadas || 0,
      fontes: Object.keys(fontes),
      naoIdentificado: naoIdentificado,
      nota: "Elementos importados entram como \"REQUER CALIBRAÇÃO\" (confirmado=false) — compare com o original e confirme um a um. Textos, linhas, caixas e imagens vêm da geometria REAL do PDF (operadores de desenho), não de estimativa."
    };
  }

  // ══════════════════════════════════════════════════════
  // §27.3 — COMPARAÇÃO GEOMÉTRICA COM A REFERÊNCIA
  //
  // O comparador visual do painel mede PIXELS dos dois PDFs. Esta é a outra
  // metade: pega cada item da referência, encontra o elemento equivalente na
  // definição e mede o deslocamento em pontos. É determinística, roda sem
  // navegador e é o critério de aceite da reconstrução.
  // ══════════════════════════════════════════════════════
  function normalizarConteudo(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase();
  }

  /** Mede um grupo de itens da referência contra os elementos casados. */
  function medirItens(itens, casar, medir, detalhes) {
    const piores = [];
    let casados = 0, semPar = 0, maxDx = 0, maxDy = 0;
    for (const item of itens) {
      const el = casar(item);
      if (!el) {
        semPar++;
        if (piores.length < 12) piores.push({ rotulo: String(item.conteudo || item.tipo || "item").slice(0, 60), dx: null, dy: null, id: null });
        continue;
      }
      const m = medir(item, el);
      casados++;
      if (detalhes) detalhes[m.id] = { dx: m.dx, dy: m.dy };
      if (Math.abs(m.dx) > maxDx) maxDx = Math.abs(m.dx);
      if (Math.abs(m.dy) > maxDy) maxDy = Math.abs(m.dy);
      if (Math.abs(m.dx) > 0.005 || Math.abs(m.dy) > 0.005) piores.push(m);
    }
    piores.sort(function (a, b) {
      return Math.max(Math.abs(b.dx) || 0, Math.abs(b.dy) || 0) - Math.max(Math.abs(a.dx) || 0, Math.abs(a.dy) || 0);
    });
    return { n: itens.length, casados: casados, semPar: semPar, maxDx: arredondar(maxDx, 2), maxDy: arredondar(maxDy, 2), piores: piores.slice(0, 12) };
  }

  function compararComReferencia(def, referencia, opts) {
    const o = opts || {};
    const tol = o.tolerancia == null ? TOLERANCIA_PT : Number(o.tolerancia);
    const elementos = elementosTodos(def);
    const textos = elementos.filter(function (e) { return e.type === "text" || e.type === "field"; });
    const porConteudo = {};
    for (const e of textos) {
      const chave = normalizarConteudo(e.content || e.label || "");
      if (!chave) continue;
      (porConteudo[chave] = porConteudo[chave] || []).push(e);
    }
    const linhas = elementos.filter(function (e) { return e.type === "line"; });
    const caixas = elementos.filter(function (e) { return e.type === "rectangle"; });
    const imagens = elementos.filter(function (e) { return e.type === "image"; });
    const caixasSelecao = elementos.filter(function (e) { return e.type === "checkbox"; });
    const ref = referencia || {};
    const detalhes = o.detalhar ? {} : null;
    const rel = {
      tolerancia: tol,
      formato: ref.formato || null,
      desviosPorElemento: detalhes,
      textos: medirItens(ref.textos || [], function (t) {
        // Símbolo de caixa de marcação casa com o `checkbox`, não com texto.
        if (ehCaixaDeMarcacao(t.conteudo)) {
          let melhorCx = null, custoCx = Infinity;
          for (const c of caixasSelecao) {
            const d = Math.abs((Number(c.x) || 0) - t.x) + Math.abs(baselineTopo(c) - t.yBase);
            if (d < custoCx) { custoCx = d; melhorCx = c; }
          }
          return custoCx <= 3 ? melhorCx : null;
        }
        const candidatos = porConteudo[normalizarConteudo(t.conteudo)] || [];
        let melhor = null, melhorCusto = Infinity;
        for (const c of candidatos) {
          const custo = Math.abs((Number(c.x) || 0) - t.x) + Math.abs(baselineTopo(c) - t.yBase);
          if (custo < melhorCusto) { melhorCusto = custo; melhor = c; }
        }
        return melhor;
      }, function (t, el) {
        return {
          rotulo: t.conteudo.slice(0, 60),
          dx: arredondar((Number(el.x) || 0) - t.x, 2),
          dy: arredondar(baselineTopo(el) - t.yBase, 2),
          id: el.id
        };
      }, detalhes),
      regras: medirItens(ref.regras || [], function (r) {
        if (r.tipo === "segmento") {
          const meio = { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 };
          let melhor = null, custo = Infinity;
          for (const l of linhas) {
            const d = Math.abs((Number(l.x1) + Number(l.x2)) / 2 - meio.x) + Math.abs((Number(l.y1) + Number(l.y2)) / 2 - meio.y);
            if (d < custo) { custo = d; melhor = l; }
          }
          return custo <= (o.raioRegra == null ? 6 : Number(o.raioRegra)) ? melhor : null;
        }
        let melhor = null, custo = Infinity;
        for (const c of caixas) {
          const d = Math.abs((Number(c.x) || 0) - r.x) + Math.abs((Number(c.y) || 0) - r.y) + Math.abs((Number(c.width) || 0) - r.width) + Math.abs((Number(c.height) || 0) - r.height);
          if (d < custo) { custo = d; melhor = c; }
        }
        return custo <= (o.raioCaixa == null ? 8 : Number(o.raioCaixa)) ? melhor : null;
      }, function (r, el) {
        if (r.tipo === "segmento") {
          return {
            rotulo: "segmento " + arredondar(r.x1, 1) + "," + arredondar(r.y1, 1) + " → " + arredondar(r.x2, 1) + "," + arredondar(r.y2, 1),
            dx: arredondar((Number(el.x1) + Number(el.x2)) / 2 - (r.x1 + r.x2) / 2, 2),
            dy: arredondar((Number(el.y1) + Number(el.y2)) / 2 - (r.y1 + r.y2) / 2, 2),
            id: el.id
          };
        }
        return {
          rotulo: "caixa " + arredondar(r.width, 1) + "×" + arredondar(r.height, 1) + " em " + arredondar(r.x, 1) + "," + arredondar(r.y, 1),
          dx: arredondar((Number(el.x) || 0) - r.x, 2),
          dy: arredondar((Number(el.y) || 0) - r.y, 2),
          id: el.id
        };
      }, detalhes),
      imagens: medirItens(ref.imagens || [], function (i) {
        let melhor = null, custo = Infinity;
        for (const el of imagens) {
          const d = Math.abs((Number(el.x) || 0) - i.x) + Math.abs((Number(el.y) || 0) - i.y) + Math.abs((Number(el.width) || 0) - i.width) + Math.abs((Number(el.height) || 0) - i.height);
          if (d < custo) { custo = d; melhor = el; }
        }
        return custo <= (o.raioImagem == null ? 3 : Number(o.raioImagem)) ? melhor : null;
      }, function (i, el) {
        return {
          rotulo: "imagem " + (i.ref || "") + " " + arredondar(i.width, 1) + "×" + arredondar(i.height, 1),
          dx: arredondar((Number(el.x) || 0) - i.x, 2),
          dy: arredondar((Number(el.y) || 0) - i.y, 2),
          id: el.id
        };
      }, detalhes)
    };
    const grupos = [rel.textos, rel.regras, rel.imagens];
    const maxDx = Math.max.apply(null, grupos.map(function (g) { return g.maxDx; }).concat([0]));
    const maxDy = Math.max.apply(null, grupos.map(function (g) { return g.maxDy; }).concat([0]));
    rel.maxDx = maxDx;
    rel.maxDy = maxDy;
    rel.casados = rel.textos.casados + rel.regras.casados + rel.imagens.casados;
    rel.semPar = rel.textos.semPar + rel.regras.semPar + rel.imagens.semPar;
    rel.dentro = maxDx <= tol && maxDy <= tol && rel.semPar === 0;
    rel.resumo = "texto " + rel.textos.casados + "/" + (rel.textos.casados + rel.textos.semPar) +
      " · réguas " + rel.regras.casados + "/" + (rel.regras.casados + rel.regras.semPar) +
      " · imagens " + rel.imagens.casados + "/" + (rel.imagens.casados + rel.imagens.semPar) +
      " · deslocamento máximo dx " + (isFinite(maxDx) ? maxDx : "—") + " pt, dy " + (isFinite(maxDy) ? maxDy : "—") + " pt (tolerância " + tol + " pt)";
    return rel;
  }

  // ══════════════════════════════════════════════════════
  // §36/§37 — BOOTSTRAP: schema de campos real → documento nativo
  // ══════════════════════════════════════════════════════
  /** Nós do schema que possuem `coordenadas` (folhas desenháveis). */
  function folhasComCoordenadas(node, caminho, out) {
    out = out || [];
    caminho = caminho || "";
    if (!node || typeof node !== "object") return out;
    for (const chave of Object.keys(node)) {
      const filho = node[chave];
      if (!filho || typeof filho !== "object") continue;
      const path = caminho ? caminho + "." + chave : chave;
      if (filho.coordenadas) out.push({ path: path, chave: chave, no: filho });
      for (const container of ["campos", "itens", "grupos"]) {
        if (filho[container]) folhasComCoordenadas(filho[container], path, out);
      }
    }
    return out;
  }

  /** Mapeia o `tipo` do schema para o tipo de elemento nativo (§9). */
  function tipoNativoDeSchema(tipo, chave) {
    const t = String(tipo || "").toLowerCase();
    if (t === "imagem" || t === "assinatura") return "signature";
    if (t === "grupo_radio" || t === "grupo_checkbox" || t === "selecao") return "field";
    if (/checkbox/.test(String(chave || ""))) return "checkbox";
    return "field";
  }

  /**
   * §37 — primeiro documento (F-075). Constrói a definição a partir do schema
   * real do repositório, PRESERVANDO a geometria existente: y (pdf-lib, origem
   * inferior) → y do topo, e o perfil de texto da aplicação gravado no próprio
   * elemento (fonte, offset, baseline). O que o schema não descreve fica
   * marcado como REQUER CALIBRAÇÃO — nunca inventado.
   */
  function definicaoDeSchema(schema, opts) {
    const o = opts || {};
    if (!schema || !schema.campos) throw new Error("definicaoDeSchema: schema de campos inválido.");
    const pagina = { width: o.width, height: o.height };
    if (!pagina.width || !pagina.height) throw new Error("definicaoDeSchema: informe width/height medidos do template (pt).");
    const perfil = Object.assign({}, PERFIL_APP, o.perfil || {});
    const def = novaDefinicao({
      documentId: o.documentId || "f075",
      documentName: o.documentName || "Ficha Cadastral (F-075)",
      width: pagina.width,
      height: pagina.height,
      autor: o.autor,
      agora: o.agora,
      origem: "schema:" + (o.schemaArquivo || "campos.json"),
      pendenteCalibracao: true,
      observacoes: "Gerado do schema de campos; textos fixos, linhas e caixas do formulário oficial precisam de calibração (§52)."
    });
    const folhas = folhasComCoordenadas(schema.campos, o.prefixo || "");
    def.assets = (o.assets || []).slice();
    def.elementos = folhas.map(function (f) {
      const c = f.no.coordenadas;
      const largura = Number(c.largura) || 0;
      const altura = Number(c.altura) || 0;
      const yPdf = Number(c.y) || 0;
      // `offsetY` positivo = desce na página (mesmo sentido do ajuste da
      // aplicação, que reduz o y do pdf-lib nas linhas do corpo do formulário)
      const offsetY = yPdf > perfil.limiteYsemOffset ? perfil.offsetYLinha : 0;
      return {
        id: slugId(f.path),
        type: tipoNativoDeSchema(f.no.tipo, f.chave),
        page: Number(f.no.pagina) || 1,
        binding: (o.prefixoBinding ? o.prefixoBinding + "." : "") + f.path,
        chaveSchema: f.path,
        x: arredondar(Number(c.x) || 0, 2),
        y: arredondar(pagina.height - yPdf - altura, 2),
        width: arredondar(largura, 2),
        height: arredondar(altura, 2),
        font: { family: perfil.fonte.family, size: perfil.fontSize, weight: perfil.fonte.weight, style: perfil.fonte.style },
        color: "#000000",
        alignment: "left",
        ancoraV: "campo",
        offsetX: perfil.offsetX,
        offsetY: offsetY,
        perfil: {
          baselineAltura: perfil.baselineAltura,
          baselineFonte: perfil.baselineFonte
        },
        truncar: perfil.truncarComReticencias,
        origem: "schema",
        confirmado: true,
        zIndex: 100
      };
    });
    // ids únicos e determinísticos (mesmo schema ⇒ mesma definição)
    const vistos = {};
    def.elementos.forEach(function (el, i) {
      if (vistos[el.id]) el.id = el.id + "_" + (i + 1);
      vistos[el.id] = true;
      el.zIndex = 100 + i;
    });
    return def;
  }

  // ══════════════════════════════════════════════════════
  // §32/§38 — RELATÓRIO PARA O PAINEL
  // ══════════════════════════════════════════════════════
  /** Resumo legível (usado no cabeçalho do editor e no histórico do painel). */
  function resumoDefinicao(def) {
    const els = elementosTodos(def);
    const porTipo = {};
    for (const e of els) porTipo[e.type] = (porTipo[e.type] || 0) + 1;
    const v = validarDefinicao(def);
    return {
      id: def.documentId,
      nome: def.documentName,
      versao: def.documentVersion,
      status: (def.metadados && def.metadados.status) || STATUS_PADRAO,
      page: def.page,
      nElementos: els.length,
      porTipo: porTipo,
      nCampos: els.filter(function (e) { return e.type === "field"; }).length,
      nErros: v.erros.length,
      nAvisos: v.avisos.length,
      pendenteCalibracao: !!(def.metadados && def.metadados.pendenteCalibracao),
      importadosNaoConfirmados: els.filter(function (e) { return e.origem === "importado" && e.confirmado !== true; }).length
    };
  }

  const api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STATUS_DOC: STATUS_DOC,
    TIPOS: TIPOS,
    FONTES_PADRAO: FONTES_PADRAO,
    FAMILIAS_SUPORTADAS: FAMILIAS_SUPORTADAS,
    familiaSuportada: familiaSuportada,
    PERFIL_APP: PERFIL_APP,
    DASH: DASH,
    TOLERANCIA_PT: TOLERANCIA_PT,
    TOLERANCIA_VISUAL_PT: TOLERANCIA_VISUAL_PT,
    LOG_MAX: LOG_MAX,
    INICIADO_EM: INICIADO_EM,
    // utilidades / coordenadas
    arredondar: arredondar,
    slugId: slugId,
    sanitizarWinAnsi: sanitizarWinAnsi,
    conteudoExecutavel: conteudoExecutavel,
    converterY: converterY,
    caixaParaPdf: caixaParaPdf,
    pontoParaPdf: pontoParaPdf,
    // definição
    novaDefinicao: novaDefinicao,
    paginasDaDefinicao: paginasDaDefinicao,
    paginaDe: paginaDe,
    elementosTodos: elementosTodos,
    elementosDaPagina: elementosDaPagina,
    elementoPorId: elementoPorId,
    idsElementos: idsElementos,
    proximoIdElemento: proximoIdElemento,
    localizar: localizar,
    moverElemento: moverElemento,
    moverGrupo: moverGrupo,
    moverCamada: moverCamada,
    agruparElementos: agruparElementos,
    novaPagina: novaPagina,
    // validação
    validarDefinicao: validarDefinicao,
    nomeFonte: nomeFonte,
    podePublicar: podePublicar,
    // dados / texto
    resolverValor: resolverValor,
    quebrarLinhas: quebrarLinhas,
    truncarTexto: truncarTexto,
    xAlinhado: xAlinhado,
    baselineTopo: baselineTopo,
    // renderer
    tipoImagem: tipoImagem,
    corParaRgb: corParaRgb,
    renderizarPdf: renderizarPdf,
    // versionamento / log
    hashDefinicao: hashDefinicao,
    ordemEstavel: ordemEstavel,
    proximaVersao: proximaVersao,
    novoRegistro: novoRegistro,
    registrarLog: registrarLog,
    congelarVersao: congelarVersao,
    compararDefinicoes: compararDefinicoes,
    modoEfetivo: modoEfetivo,
    // importação / bootstrap
    transformarMatriz: transformarMatriz,
    normalizarItemTexto: normalizarItemTexto,
    elementosDeItensDeTexto: elementosDeItensDeTexto,
    agruparItensDeTexto: agruparItensDeTexto,
    relatorioImportacao: relatorioImportacao,
    nomesDeOperadores: nomesDeOperadores,
    corDoOperador: corDoOperador,
    caixaDaImagem: caixaDaImagem,
    caixaDeCaminhos: caixaDeCaminhos,
    intersecao: intersecao,
    inflar: inflar,
    decodificarCaminho: decodificarCaminho,
    extrairGraficos: extrairGraficos,
    elementosDeGraficos: elementosDeGraficos,
    familiaPadrao: familiaPadrao,
    FONTES_OFICIAIS: FONTES_OFICIAIS,
    chaveOficial: chaveOficial,
    fonteOficialDe: fonteOficialDe,
    resolverFonte: resolverFonte,
    FAMILIAS_SUPORTADAS: FAMILIAS_SUPORTADAS,
    ehCaixaDeMarcacao: ehCaixaDeMarcacao,
    aplicarContrasteDeTarja: aplicarContrasteDeTarja,
    luminanciaDaCor: luminanciaDaCor,
    snapshotDeReferencia: snapshotDeReferencia,
    graficosDeSnapshot: graficosDeSnapshot,
    compararComReferencia: compararComReferencia,
    normalizarConteudo: normalizarConteudo,
    LIMITE_ESPESSURA_PT: LIMITE_ESPESSURA_PT,
    Z_MOBILIARIO: Z_MOBILIARIO,
    zMobiliario: zMobiliario,
    Z_INCREMENTO: Z_INCREMENTO,
    folhasComCoordenadas: folhasComCoordenadas,
    tipoNativoDeSchema: tipoNativoDeSchema,
    definicaoDeSchema: definicaoDeSchema,
    // relatório
    resumoDefinicao: resumoDefinicao
  };

  // Nada aqui depende do DOM: o painel usa o mesmo objeto, e os testes
  // (scripts/run-test.mjs / audit-panel.mjs) carregam este arquivo em node:vm.
  global.NativeDocs = api;
})(typeof window !== "undefined" ? window : globalThis);
