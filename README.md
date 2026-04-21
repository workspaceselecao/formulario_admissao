# Ficha Cadastral – HTML para PDF

Gera o PDF preenchido sobre o modelo oficial `F-075_37 (PR-011) Ficha Cadastral para Admissão.pdf`, usando as coordenadas em pontos PDF definidas em `ficha_cadastral_campos.json` (origem: canto inferior esquerdo, igual ao pdf-lib).

## Arquivos na raiz

- `ficha_cadastral.html` — formulário e geração do PDF
- `ficha_cadastral_campos.json` — coordenadas dos campos (pt)
- `F-075_37 (PR-011) Ficha Cadastral para Admissão.pdf` — template
- `vercel.json` — redireciona `/` para `ficha_cadastral.html`
- `Carta Abertura de Conta Modelo Padrão_Bradesco.docx` — download opcional (conta Bradesco)

## Publicar na Vercel

1. Envie o repositório para o GitHub.
2. Em [vercel.com/new](https://vercel.com/new), importe o projeto.
3. Preset: **Other** (ou automático).
4. **Deploy**.

O template PDF não é alterado no disco; os dados são desenhados por cima na exportação. Após gerar o PDF, o formulário é limpo (fluxo LGPD).
