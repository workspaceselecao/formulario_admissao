# Ficha Cadastral - HTML para PDF

Este projeto gera um PDF preenchido usando o template oficial `F-075_37 (PR-011) Ficha Cadastral para Admissão.pdf`.

## Estrutura esperada

Mantenha estes arquivos na raiz do repositório:

- `index.html`
- `F-075_37 (PR-011) Ficha Cadastral para Admissão.pdf`
- `vercel.json`

## Publicar na Vercel (sem servidor local)

1. Suba os arquivos para um repositório no GitHub.
2. Acesse [https://vercel.com/new](https://vercel.com/new).
3. Importe o repositório.
4. Framework Preset: **Other** (ou deixe automático).
5. Clique em **Deploy**.

Após o deploy, a Vercel gera uma URL pública. Esse link já pode ser enviado ao usuário.

## Observações

- O template PDF não é alterado; os dados são escritos por cima no momento da exportação.
- O botão de geração cria e baixa o arquivo `Ficha_Cadastral_preenchida.pdf`.
- Se o template não carregar automaticamente, a tela permite selecionar o PDF manualmente.
