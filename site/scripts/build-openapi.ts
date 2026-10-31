// Generates site/public/openapi.json with real, trimmed response examples.
// Runs the actual Hono app (../src/app.ts) against the local data dir and
// stores each GET operation's live JSON as its 200 application/json example.
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SITE = path.resolve(import.meta.dirname, "..");

// pick a data dir before importing src — DIST is read at module load time
if (!process.env.NIKKE_DATA_DIR) {
  const candidates = ["data/dist", "test/fixtures/dist"];
  const found = candidates.find((d) => existsSync(path.join(ROOT, d, "characters.json")));
  if (!found) {
    console.error("no data dir found — run `npm run fetch:data` first");
    process.exit(1);
  }
  process.env.NIKKE_DATA_DIR = path.join(ROOT, found);
}
console.log(`data dir: ${process.env.NIKKE_DATA_DIR}`);

const { openapi } = await import(path.join(ROOT, "src/openapi.ts"));
const { default: app } = await import(path.join(ROOT, "src/app.ts"));

// endpoints that need credentials / upstream calls / raw CDN passthrough —
// same exclusions as the docs scope
const EXCLUDE = (p: string) =>
  p.startsWith("/api/user") ||
  p.startsWith("/api/tables") ||
  p === "/api/cdn" ||
  p === "/mcp";

const getJson = async (p: string) => {
  const res = await app.request(p);
  if (res.status !== 200) throw new Error(`${p} -> ${res.status}`);
  return res.json();
};

const firstItem = (json: any): any => {
  for (const v of Object.values(json)) if (Array.isArray(v) && v.length) return v[0];
  return undefined;
};

// one real word from a scene script, for /api/lines?q=
const pickLineWord = async () => {
  const scenes = await getJson("/api/scenes?limit=1");
  const g = firstItem(scenes)?.groupId;
  if (!g) return "님";
  const script = await getJson(`/api/scenes/${encodeURIComponent(g)}`);
  const line = script?.lines?.[0];
  const word = String(line?.text ?? line?.t ?? "").trim().split(/\s/)[0];
  return word && word.length >= 2 ? word : String(line?.text ?? "님").slice(0, 6);
};

const QUERY_OVERRIDES: Record<string, () => Promise<string> | string> = {
  "/api/lines": async () => `q=${encodeURIComponent(await pickLineWord())}`,
  "/api/story/next": () => "chapter=-1",
};

const resolvePathParam = async (tpl: string, param: string, example?: unknown) => {
  // a real id from the list endpoint beats the spec's static example
  const listPath = tpl.slice(0, tpl.indexOf("{")).replace(/\/$/, "");
  try {
    const item = firstItem(await getJson(`${listPath}?limit=1`));
    const v = item?.[param] ?? item?.id ?? item?.character?.id;
    if (v != null) return encodeURIComponent(String(v));
  } catch {}
  if (example != null) return encodeURIComponent(String(example));
  throw new Error(`no ${param} candidate from ${listPath}`);
};

const trim = (v: any): any => {
  if (typeof v === "string") return v.length > 300 ? v.slice(0, 300) + "…" : v;
  if (Array.isArray(v)) return v.slice(0, 2).map(trim);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x)]));
  return v;
};

const spec: any = JSON.parse(JSON.stringify(openapi));
if (process.env.VITE_API_BASE) {
  spec.servers = [{ url: process.env.VITE_API_BASE.replace(/\/$/, "") }];
}
let ok = 0;
const skipped: string[] = [];

for (const [tpl, pathItem] of Object.entries(spec.paths) as [string, any][]) {
  const op = pathItem?.get;
  if (!op) continue;
  if (EXCLUDE(tpl)) {
    skipped.push(`${tpl} (excluded)`);
    continue;
  }
  try {
    let p = tpl;
    for (const m of tpl.matchAll(/\{(\w+)\}/g)) {
      const param = (op.parameters ?? []).find(
        (x: any) => x.in === "path" && x.name === m[1],
      );
      p = p.replace(m[0], await resolvePathParam(tpl, m[1], param?.example));
    }
    const qs: string[] = [];
    if (QUERY_OVERRIDES[tpl]) qs.push(await QUERY_OVERRIDES[tpl]());
    else if ((op.parameters ?? []).some((x: any) => x.in === "query" && x.name === "limit"))
      qs.push("limit=1");
    const url = qs.length ? `${p}?${qs.join("&")}` : p;
    const res = await app.request(url);
    if (res.status !== 200) {
      skipped.push(`${tpl} (${url} -> ${res.status})`);
      continue;
    }
    const body = await res.json();
    op.responses["200"].content = {
      "application/json": { example: trim(body) },
    };
    ok++;
  } catch (e) {
    skipped.push(`${tpl} (${(e as Error).message})`);
  }
}

mkdirSync(path.join(SITE, "public"), { recursive: true });
const out = path.join(SITE, "public/openapi.json");
writeFileSync(out, JSON.stringify(spec));
console.log(`examples: ${ok} operations`);
for (const s of skipped) console.log(`skipped: ${s}`);

// Scalar standalone bundle → static asset (kept out of the Vite bundle)
const scalar = path.join(
  SITE,
  "node_modules/@scalar/api-reference/dist/browser/standalone.js",
);
copyFileSync(scalar, path.join(SITE, "public/scalar.js"));
console.log(`wrote ${out}`);
