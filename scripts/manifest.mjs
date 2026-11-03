// writes data/dist/_manifest.json — flat sorted list of every dist file,
// used by the worker/fetch-dist fallback to enumerate deploys. Run after
// `npm run build` (or the refresh-data workflow does it for you).
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p) : out.push(p.replace(/\\/g, "/").replace(/^data.dist./, ""));
  }
};
walk("data/dist");
writeFileSync("data/dist/_manifest.json", JSON.stringify(out.sort()));
console.log(`_manifest.json: ${out.length} files`);
