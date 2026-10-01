import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

// data/dist may come from the data-latest release artifact built earlier by a
// different commit — restamp the package version so /?version and /openapi.json
// report the version of the code being deployed, not the data build's.
try {
  const file = "data/dist/characters.json";
  const data = JSON.parse(await readFile(file, "utf8"));
  const version = JSON.parse(await readFile("package.json", "utf8")).version;
  if (data.version !== version) {
    data.version = version;
    await writeFile(file, JSON.stringify(data));
    console.log(`emit:server — stamped version ${version}`);
  }
} catch {
  console.warn("emit:server — characters.json not found, version stamp skipped");
}

await build({
  entryPoints: ["src/*.ts"],
  outdir: "server",
  format: "esm",
  platform: "node",
  target: "es2022",
  logLevel: "info",
});
