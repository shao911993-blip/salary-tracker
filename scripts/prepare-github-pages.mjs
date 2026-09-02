import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectoryUrl = new URL("../dist/client/", import.meta.url);
const outputDirectory = fileURLToPath(outputDirectoryUrl);
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const usesProjectPath = repositoryName && !repositoryName.endsWith(".github.io");
const prefix = usesProjectPath ? `/${repositoryName}` : "";
const textExtensions = new Set([".html", ".rsc", ".js", ".css", ".json", ".webmanifest"]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else files.push(path);
  }
  return files;
}

if (prefix) {
  for (const file of await collectFiles(outputDirectory)) {
    if (!textExtensions.has(extname(file))) continue;
    const source = await readFile(file, "utf8");
    const updated = source
      .replaceAll("/assets/", `${prefix}/assets/`)
      .replaceAll("/favicon.svg", `${prefix}/favicon.svg`);
    if (updated !== source) await writeFile(file, updated);
  }
}

await writeFile(new URL(".nojekyll", outputDirectoryUrl), "");
