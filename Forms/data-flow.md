# Fluxo de dados (descrição técnica)

**Objetivo:** descrever entradas, processamento, saídas e descarte de dados na aplicação web de formulários.

**Audiência:** Privacidade, Segurança da Informação, TI e revisão de RIPD/DPIA.

---

## 1. Entrada

- O utilizador introduz dados manualmente nos formulários HTML servidos estaticamente.

---

## 2. Processamento no navegador

- Validações, máscaras e lógica de UI executam-se **no cliente**.
- Geração do PDF utiliza bibliotecas JavaScript no próprio navegador.

---

## 3. Armazenamento temporário / rascunho

- Pode existir **persistência local de rascunho** (por exemplo `localStorage`) para permitir retomar o preenchimento no mesmo dispositivo/navegador.
- Escopo limitado ao utilizador e ao terminal utilizado; não constitui armazenamento centralizado corporativo desta aplicação.

---

## 4. Saída

- O PDF gerado é disponibilizado ao utilizador via transferência para o dispositivo (`download`), ficando sob sua custódia.

---

## 5. Descarte / minimização após conclusão

- Após a geração do PDF, a aplicação pode eliminar dados da sessão conforme implementação e fluxos de LGPD apresentados ao utilizador (por exemplo modal de confirmação).
- O utilizador pode **descartar o rascunho** através da ação dedicada no menu.

---

## 6. O que não está incluído neste fluxo (por desenho da solução)

- Backend aplicacional obrigatório para guardar formulários completos;
- Base de dados central nesta app para os quadros preenchidos pelo utilizador;
- Transmissão obrigatória dos dados do formulário para conclusão local do PDF.

*Nota:* métricas da plataforma de hospedagem (ex.: CDN, logs de infraestrutura sem payload do formulário) devem ser tratadas em inventário separado e bases legais próprias.

---

## 7. Diagrama (texto)

```
[Utilizador] → [Formulário browser] → [PDF gerado localmente] → [Dispositivo]
                      ↓ opcional
              [Rascunho local no browser]
```
