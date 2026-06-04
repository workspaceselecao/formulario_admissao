import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "Docs", "docs-revision.json");

function git(fmt) {
  return execSync(`git log -1 --format=${fmt}`, { encoding: "utf8", cwd: root }).trim();
}

let gitBranch = "main";
try {
  gitBranch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", cwd: root }).trim();
} catch {
  /* detached HEAD */
}

const payload = {
  ultimaValidacaoIso: git("%cI"),
  gitCommit: git("%h"),
  gitSubject: git("%s"),
  gitBranch,
  gitRemote: "origin"
};

fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log("docs-revision.json atualizado:", payload.ultimaValidacaoIso, payload.gitCommit);
