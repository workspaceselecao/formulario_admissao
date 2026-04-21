# Formulários de admissão – HTML para PDF

A **home** (`index.html`) permite escolher entre a Ficha Cadastral e a Assistência Médica. Cada fluxo gera o PDF preenchido sobre o modelo oficial correspondente, usando coordenadas em pontos PDF (origem: canto inferior esquerdo, igual ao pdf-lib).

## Arquivos na raiz

- `index.html` — página inicial (escolha do formulário)
- `ficha_cadastral.html` — F-075 (PR-011) e geração do PDF
- `ficha_cadastral_campos.json` — coordenadas dos campos da ficha (pt)
- `F-075_37 (PR-011) Ficha Cadastral para Admissão.pdf` — template da ficha
- `assistencia_medica.html` — F-089 (PR-090) e geração do PDF
- `assistencia_medica_campos.json` — coordenadas dos campos da assistência médica (pt)
- `F-089_17 (PR-090) (Adesão de Assistência Médica).pdf` — template da assistência médica
- `vercel.json` — redireciona `/` para `index.html`
- `Carta Abertura de Conta Modelo Padrão_Bradesco.docx` — download opcional (conta Bradesco, só na ficha)

## Publicar na Vercel

1. Envie o repositório para o GitHub.
2. Em [vercel.com/new](https://vercel.com/new), importe o projeto.
3. Preset: **Other** (ou automático).
4. **Deploy**.

O template PDF não é alterado no disco; os dados são desenhados por cima na exportação. Após gerar o PDF, o formulário é limpo (fluxo LGPD).
