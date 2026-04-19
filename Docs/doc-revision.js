(function () {
  const el = document.getElementById("docRevisaoUltimaValidacao");
  if (!el) return;

  fetch("/Docs/docs-revision.json", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data?.ultimaValidacaoIso) {
        el.textContent = "—";
        return;
      }
      const quando = new Date(data.ultimaValidacaoIso);
      const dataHora = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "America/Sao_Paulo"
      }).format(quando);
      const commit = data.gitCommit ? ` — commit ${data.gitCommit}` : "";
      const push =
        data.gitRemote && data.gitBranch
          ? ` (push ${data.gitRemote}/${data.gitBranch})`
          : "";
      el.textContent = `${dataHora}${commit}${push}`;
    })
    .catch(() => {
      el.textContent = "—";
    });
})();
