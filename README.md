# Formulários de admissão – HTML para PDF

A **home** (`index.html`) permite escolher entre a Ficha Cadastral e a Assistência Médica. Cada fluxo gera o PDF preenchido sobre o modelo oficial correspondente, usando coordenadas em pontos PDF (origem: canto inferior esquerdo, igual ao pdf-lib).

**Manutenção e extensão:** veja o guia [MANUTENCAO.md](MANUTENCAO.md) (cidades, templates, coordenadas, APIs, deploy e checklists).

## Repositório e tipo de projeto

- **Repositório Git (GitHub):** [workspaceselecao/formulario_admissao](https://github.com/workspaceselecao/formulario_admissao) — clone HTTPS: `https://github.com/workspaceselecao/formulario_admissao.git`
- **Tipo:** site **estático** (HTML, CSS, JavaScript no cliente, [pdf-lib](https://github.com/Hopding/pdf-lib) em CDN), **sem** backend nem banco de dados; o PDF é gerado no navegador.
- **Deploy de referência:** [Vercel](https://vercel.com) (arquivo `vercel.json` na raiz).

## Arquivos na raiz

- `index.html` — página inicial (escolha do formulário)
- `ficha_cadastral.html` — F-075 (PR-011) e geração do PDF
- `ficha_cadastral_campos.json` — coordenadas dos campos da ficha (pt)
- `F-075_37 (PR-011) Ficha Cadastral para Admissão.pdf` — template da ficha
- `assistencia_medica.html` — F-089 (PR-090) e geração do PDF
- `assistencia_medica_campos.json` — coordenadas dos campos da assistência médica (pt)
- `cidades_brasil.json` — mapeia cidade → ficha PDF da assistência médica
- `FICHA BH.pdf`, `FICHA FSA.pdf`, `FICHA GNDI.pdf`, `FICHA GOIANIA.pdf`, `FICHA REEMBOLSO.pdf`, `FICHA SA_FO.pdf` — templates da assistência médica (conforme `cidades_brasil.json`)
- `vercel.json` — a raiz `/` serve internamente `index.html` (home)
- `Carta Abertura de Conta Modelo Padrão_Bradesco.docx` — download opcional (conta Bradesco, só na ficha)

## Publicar na Vercel

1. Envie o repositório para o GitHub.
2. Em [vercel.com/new](https://vercel.com/new), importe o projeto.
3. Preset: **Other** (ou automático).
4. **Deploy**.

O template PDF não é alterado no disco; os dados são desenhados por cima na exportação. Após gerar o PDF, o formulário é limpo (fluxo LGPD).
