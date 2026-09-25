/**
 * ============================================================
 * PREENCHER — só os campos do modelo (Documentos Nativos)
 * ============================================================
 *
 * Por que existe: o editor de documentos nativos é uma ferramenta de LAYOUT —
 * para quem só quer preencher o formulário, ele é "absurdamente difícil":
 * exige achar o elemento na lista, entender binding, coordenadas e calibração
 * para digitar um nome. Aqui o usuário vê APENAS os campos que o modelo tem,
 * com o rótulo de cada um, digita os valores e gera o PDF. Zero geometria.
 *
 * Como funciona:
 *  1. `catalogoDaDefinicao` extrai da definição nativa tudo que é PREENCHÍVEL:
 *     elementos `field` (texto do candidato) e `checkbox` (marcas), agrupados
 *     por SEÇÃO (o prefixo do binding/schema: dados_pessoais, endereco…);
 *  2. os rótulos vêm do `ficha_cadastral_campos.json` (schema) — a MESMA fonte
 *     de labels da aplicação pública, não texto inventado;
 *  3. `valoresDaTela` lê o formulário e devolve o mapa de dados no MESMO formato
 *     que o engine já consome (`resolverValor`): binding → valor, com os grupos
 *     de marcação resolvidos para a caixa certa (`true` na escolhida);
 *  4. o PDF é gerado pelo MESMO engine do editor (`NativeDocs.renderizarPdf`) —
 *     nenhuma lógica de desenho duplicada.
 *
 * Este arquivo é carregado pelo painel; funções puras ficam em
 * `AdminPreencher.__teste` para a suíte.
 */
(function (global) {
  "use strict";

  /** Ícones/termos: nenhum texto de interface é inventado aqui sem vir do schema. */

  /** Rótulo humano de uma chave final do binding ("bradesco_agencia" → "Agência (Bradesco)"...). */
  function rotuloDe(el, schemaLabels) {
    if (!el) return "";
    const chave = String(el.chaveSchema || el.binding || el.id || "");
    if (schemaLabels && schemaLabels[chave]) return schemaLabels[chave];
    // fallback: a última parte do caminho, com separação legível
    const fim = chave.split(".").pop() || el.id || "";
    return fim
      .replace(/_/g, " ")
      .replace(/\b(\w)/g, function (m, c) { return c.toUpperCase(); });
  }

  /** Seção de um elemento: primeira parte do caminho do schema (dados_pessoais, endereco…). */
  function secaoDe(el) {
    const chave = String((el && (el.chaveSchema || el.binding)) || "");
    const partes = chave.split(".");
    return partes.length > 1 ? partes[0] : "(geral)";
  }

  /**
   * Agrupa opções de marcação que pertencem ao MESMO grupo visual.
   * O rótulo do grupo não é o texto mais à esquerda da linha (isso pega "SIM"/
   * "NÃO" da própria linha), e sim a linha de CABEÇALHO acima do conjunto:
   * o texto mais próximo ACIMA da linha das caixas, com sobreposição horizontal
   * com elas ("Possui Deficiência?", "Banco:", "Primeiro emprego:"). Linhas que
   * continuam o mesmo grupo (2ª linha do banco) herdam o rótulo anterior.
   */
  function gruposDeMarcacao(caixas, elementos) {
    const textos = elementos.filter(function (e) { return e.type === "text"; });
    const ord = caixas.slice().sort(function (a, b) {
      const ya = (Number(a.y) || 0), yb = (Number(b.y) || 0);
      return ya - yb || (Number(a.x) || 0) - (Number(b.x) || 0);
    });
    const grupos = [];
    let atual = null;
    let ultimoTitulo = ""; // última tarja de cabeçalho vista (linha acima)
    for (const c of ord) {
      const cy = (Number(c.y) || 0) + (Number(c.height) || 0) / 2;
      if (atual && Math.abs(cy - atual.cy) <= 7) {
        // Mesma linha só continua o grupo se a caixa for vizinha (até 90 pt do
        // fim da anterior). Vazio maior = outro conjunto na mesma linha: o
        // formulário alinha conjuntos lado a lado ("❑SIM ❑NÃO" e "❑FÍSICA
        // ❑AUDITIVA ❑VISUAL…" na mesma faixa; as opções do VA têm vazio de 150+).
        const ant = atual.caixas[atual.caixas.length - 1];
        const vazio = (Number(c.x) || 0) - ((Number(ant.x) || 0) + (Number(ant.width) || 0));
        if (vazio <= 90) { atual.caixas.push(c); atual.cy = (atual.cy * (atual.caixas.length - 1) + cy) / atual.caixas.length; continue; }
        // Linhas com UMA tarja de cabeçalho comum ("VALE REFEIÇÃO/ALIMENTAÇÃO"
        // sobre 3 opções espaçadas em células): o vazio grande separa as opções
        // do MESMO grupo quando o rótulo de linha anterior não termina em ":".
        if (ultimoTitulo && !/:\s*$/.test(ultimoTitulo)) { atual.caixas.push(c); atual.cy = (atual.cy * (atual.caixas.length - 1) + cy) / atual.caixas.length; continue; }
      }
      atual = { cy: cy, caixas: [c] };
      grupos.push(atual);
    }
    // Rótulo do grupo = linha de CABEÇALHO acima das caixas. Dois níveis:
    //  1. MESMA LINHA (sobreposição vertical com o topo das caixas): é o caso
    //     "Possui Deficiência?  ❑SIM ❑NÃO   TIPO DEFICIÊNCIA ❑FÍSICA …" — o
    //     rótulo mora na própria linha, à esquerda do subconjunto que titula;
    //  2. LINHA ACIMA (até 26 pt): "Banco:" sobre "❑Corrente ❑Conta Salário…".
    // Termina em ":" (rótulo de formulário), não é rótulo de opção ("SIM",
    // "Corrente"…), e o mais próximo das caixas vence. Sem candidato, herda o
    // rótulo anterior (continuação do mesmo conjunto).
    const ehRotuloDeOpcao = function (s) { return /^(sim|não|nao)\b/i.test(s) || /^corrente$|^conta salário$|^poupança$|^física$|^auditiva$|^visual$|^intelectual$|^múltipla$|^100% vale alimen|^100% vale refei|^flexibilizado/i.test(s); };
    let ultimoRotulo = "";
    for (let gi = 0; gi < grupos.length; gi++) {
      const g = grupos[gi];
      const xIni = Math.min.apply(null, g.caixas.map(function (c) { return Number(c.x) || 0; }));
      const xFim = Math.max.apply(null, g.caixas.map(function (c) { return (Number(c.x) || 0) + (Number(c.width) || 0); }));
      const yTopo = Math.min.apply(null, g.caixas.map(function (c) { return Number(c.y) || 0; }));
      const candidatos = textos.filter(function (t) {
        const txt = String(t.content || "").trim();
        if (!txt || ehRotuloDeOpcao(txt)) return false;
        const tBase = (Number(t.y) || 0) + (Number(t.height) || 0);
        const dy = yTopo - tBase;
        // O rótulo pode estar NA linha das caixas ("Santander: ❑Corrente…",
        // base 4 pt abaixo do centro) ou acima (até 26 pt). Fora disso, não é
        // rótulo do conjunto.
        if (dy < -9 || dy > 26) return false;
        // Titula o subconjunto de uma das três formas: COMEÇA junto da 1ª caixa
        // ("Possui Deficiência? ❑SIM"), TERMINA perto dela ("Santander:") ou
        // está NO MEIO das caixas do conjunto E PERTO delas (tarja "TIPO
        // DEFICIÊNCIA" entre ❑FÍSICA e ❑AUDITIVA, 8 pt acima). Rótulo de outra
        // linha de formulário ("Cidade:", 23 pt acima, longe do conjunto) e
        // tarja de outra célula ("BANCÁRIA", 66 pt antes) não entram.
        const antes = xIni - ((Number(t.x) || 0) + (Number(t.width) || 0));
        const perto = Math.abs(dy) <= 14;
        const noMeio = (Number(t.x) || 0) >= xIni && (Number(t.x) || 0) <= xFim && perto;
        return ((antes >= -2 && antes <= 50) || noMeio) && dy > -9;
      }).sort(function (a, b) {
        // Rótulo na MESMA linha das caixas ("Santander: ❑Corrente…") vence o
        // cabeçalho de tarja mais distante; entre os da mesma linha, o mais
        // próximo da primeira caixa pela direita.
        const da = Math.abs(yTopo - ((Number(a.y) || 0) + (Number(a.height) || 0)));
        const db = Math.abs(yTopo - ((Number(b.y) || 0) + (Number(b.height) || 0)));
        if (Math.abs(da - db) > 2) return da - db;
        const fa = xIni - ((Number(a.x) || 0) + (Number(a.width) || 0));
        const fb = xIni - ((Number(b.x) || 0) + (Number(b.width) || 0));
        return fa - fb;
      });
      const rot = candidatos.length ? candidatos[0] : null;
      let rotTxt = rot ? String(rot.content).replace(/\s+/g, " ").trim().replace(/:\s*$/, "") : "";
      // Rótulo tem de ser ÚNICO na página (o radio da tela agrupa por rótulo):
      // duplicado vira "<rótulo> (2)". Sem candidato, o grupo É independente
      // (caixa solta com rótulo na própria opção) — nunca herda de longe.
      if (rotTxt) {
        const base = rotTxt.replace(/\s*\(\d+\)$/, "");
        let n = 2;
        while (grupos.some(function (x, j) { return j < gi && x.rotuloGrupo === rotTxt; })) rotTxt = base + " (" + (n++) + ")";
        g.rotuloGrupo = rotTxt;
      } else {
        g.semCabecalho = true; // título decidido após g.opcoes (usa o rótulo da opção)
      }
      if (g.caixas.length && (Number(g.caixas[0].y) || 0) > 600) ultimoTitulo = g.rotuloGrupo;
      g.opcoes = g.caixas.map(function (c) {
        const cy = (Number(c.y) || 0) + (Number(c.height) || 0) / 2;
        const dir = textos.filter(function (t) {
          const ty = (Number(t.y) || 0) + (Number(t.height) || 0) * 0.55;
          return Math.abs(ty - cy) < 7 && (Number(t.x) || 0) >= (Number(c.x) || 0) + (Number(c.width) || 0) - 2 && (Number(t.x) || 0) < (Number(c.x) || 0) + 40;
        }).sort(function (a, b) { return (Number(a.x) || 0) - (Number(b.x) || 0); })[0];
        const esq = textos.filter(function (t) {
          const ty = (Number(t.y) || 0) + (Number(t.height) || 0) * 0.55;
          return Math.abs(ty - cy) < 8 && ((Number(t.x) || 0) + (Number(t.width) || 0)) <= (Number(c.x) || 0) + 3;
        }).sort(function (a, b) { return (Number(b.x) || 0) - (Number(a.x) || 0); })[0];
        const rotulo = (dir ? String(dir.content) : (esq ? String(esq.content) : rotuloDe(c, null))).replace(/\s+/g, " ").trim();
        return { caixa: c, rotulo: rotulo };
      });
      // Grupo sem cabeçalho próprio: o rótulo da OPÇÃO vira o título (único,
      // para o radio da tela não colidir com outro grupo).
      if (g.semCabecalho) {
        const op0 = String((g.opcoes[0] && g.opcoes[0].rotulo) || "").replace(/\s+/g, " ").trim();
        let nome = op0 ? "Opção: " + op0 : "Marcações";
        const baseNome = nome;
        let n2 = 2;
        while (grupos.some(function (x) { return x !== g && x.rotuloGrupo === nome; })) nome = baseNome + " (" + (n2++) + ")";
        g.rotuloGrupo = nome;
      }
    }
    return grupos;
  }

  /**
   * Catálogo preenchível de uma definição: seções → campos (field) e grupos de
   * marcação (checkbox). É a ÚNICA fonte da tela: nada é perguntado que não
   * exista no modelo, e nada do modelo preenchível fica de fora.
   */
  function catalogoDaDefinicao(def, schemaLabels) {
    const out = { secoes: [], totais: { campos: 0, grupos: 0, caixas: 0 } };
    if (!def || !Array.isArray(def.elementos)) return out;
    const els = def.elementos.slice().sort(function (a, b) {
      return (Number(a.y) || 0) - (Number(b.y) || 0) || (Number(a.x) || 0) - (Number(b.x) || 0);
    });
    const fields = els.filter(function (e) { return e.type === "field" && e.binding; });
    const caixas = els.filter(function (e) { return e.type === "checkbox"; });

    const secoesMapa = {};
    const secao = function (nome, ordem) {
      if (!secoesMapa[nome]) { secoesMapa[nome] = { nome: nome, ordem: ordem, campos: [], grupos: [] }; out.secoes.push(secoesMapa[nome]); }
      return secoesMapa[nome];
    };
    // ordem das seções = ordem em que aparecem na página (topo → base)
    let ordem = 0;
    for (const f of fields) {
      const s = secao(secaoDe(f), ordem++);
      s.campos.push({
        el: f,
        id: f.id,
        binding: f.binding,
        rotulo: rotuloDe(f, schemaLabels),
        largo: (Number(f.width) || 0) > 300
      });
      out.totais.campos++;
    }
    for (const g of gruposDeMarcacao(caixas, els)) {
      const s = secao(secaoDe(g.caixas[0]), ordem++);
      s.grupos.push({
        rotulo: g.rotuloGrupo.replace(/[:\s]+$/, ""),
        opcoes: g.opcoes.map(function (o) { return { id: o.caixa.id, rotulo: o.rotulo, el: o.caixa }; })
      });
      out.totais.grupos++;
      out.totais.caixas += g.opcoes.length;
    }
    out.secoes.sort(function (a, b) { return a.ordem - b.ordem; });
    return out;
  }

  /**
   * Lê o estado da tela (função `ler` recebe o id do controle e devolve o valor)
   * e monta o mapa de dados do engine. Grupos de marcação: exatamente UMA caixa
   * marcada por grupo (radio); a escolhida vira `true`, as demais `false`.
   */
  function valoresDaTela(catalogo, ler, marcos) {
    const dados = {};
    const escolhidos = marcos || {};
    for (const s of catalogo.secoes) {
      for (const c of s.campos) {
        const v = ler(c.id);
        if (v != null && String(v).trim() !== "") dados[c.binding] = String(v);
      }
      for (const g of s.grupos) {
        const marcada = escolhidos[g.rotulo];
        for (const o of g.opcoes) {
          const chave = bindingDaCaixa(o.el, o.id);
          dados[chave] = (marcada === o.id);
        }
      }
    }
    return dados;
  }

  /** Chave estável de uma caixa de marcação no mapa de dados do engine. */
  function bindingDaCaixa(el, id) {
    if (el && el.binding) return el.binding;
    return "marcacao." + id;
  }

  /** Contagem para a barra de resumo da tela. */
  function resumoPreenchimento(catalogo, ler, marcado) {
    let campos = 0, total = 0, grupos = 0;
    for (const s of catalogo.secoes) {
      for (const c of s.campos) {
        total++;
        const v = ler(c.id);
        if (v != null && String(v).trim() !== "") campos++;
      }
      for (const g of s.grupos) {
        grupos++;
        if (marcado[g.rotulo]) campos++;
      }
    }
    return { preenchidos: campos, campos: total, grupos: grupos };
  }

  global.AdminPreencher = {
    catalogoDaDefinicao: catalogoDaDefinicao,
    valoresDaTela: valoresDaTela,
    bindingDaCaixa: bindingDaCaixa,
    resumoPreenchimento: resumoPreenchimento,
    rotuloDe: rotuloDe,
    secaoDe: secaoDe,
    gruposDeMarcacao: gruposDeMarcacao,
    __teste: {
      rotuloDe: rotuloDe,
      secaoDe: secaoDe,
      gruposDeMarcacao: gruposDeMarcacao,
      catalogoDaDefinicao: catalogoDaDefinicao,
      valoresDaTela: valoresDaTela,
      bindingDaCaixa: bindingDaCaixa,
      resumoPreenchimento: resumoPreenchimento
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
