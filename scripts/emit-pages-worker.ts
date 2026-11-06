import crypto from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import "./build-burst-player.js";

// Bundles worker/index.ts into pages-proxy/_worker.js with a build id derived
// from the bundle's own bytes, so same source = same output (a commit SHA would
// change the tracked bundle on every commit). argv[2] overrides the output path.
const ROOT = path.resolve(import.meta.dirname, "..");
const PLACEHOLDER = "__NIKKE_BUILD_ID_PLACEHOLDER__";

async function main() {
  // write: false so the output path can't affect the bytes; absWorkingDir so
  // neither can the cwd (esbuild's path comments are relative to it)
  const { outputFiles } = await build({
    absWorkingDir: ROOT,
    entryPoints: ["worker/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    external: ["node:*"],
    define: { __BUILD_ID__: JSON.stringify(PLACEHOLDER) },
    write: false,
  });
  const code = outputFiles[0].text;
  // a bundle without the placeholder would deploy with no build id and quietly
  // bring back the stale-cache bug, so it has to fail the deploy
  if (!code.includes(PLACEHOLDER)) throw new Error("build id placeholder missing from the bundle");
  const buildId = crypto.createHash("sha256").update(code).digest("hex").slice(0, 12);
  const outfile = path.resolve(process.argv[2] ?? path.join(ROOT, "pages-proxy/_worker.js"));
  mkdirSync(path.dirname(outfile), { recursive: true });
  writeFileSync(outfile, code.replaceAll(PLACEHOLDER, buildId));
  console.log(buildId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
