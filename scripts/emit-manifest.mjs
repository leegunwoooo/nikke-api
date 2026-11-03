// _manifest.json lists every file in dist: static hosts can't list a directory,
// and storage.list() needs that. Lives here rather than inline in the workflow,
// where shell and YAML quoting already broke its regex once.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export function emitManifest(root = "data/dist") {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(path.relative(root, p).split(path.sep).join("/"));
    }
  };
  walk(root);
  const files = out.filter((f) => f !== "_manifest.json").sort();
  writeFileSync(path.join(root, "_manifest.json"), JSON.stringify(files));
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`_manifest.json: ${emitManifest(process.argv[2]).length} files`);
}
