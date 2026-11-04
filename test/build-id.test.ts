import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { createApp } from "../src/factory.js";
import { fsStorage } from "../src/storage.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures/dist");
const SCRIPT = path.join(import.meta.dirname, "../scripts/emit-pages-worker.ts");
const DATA_HOST = "https://data.test";
const { syncedAt, version } = JSON.parse(readFileSync(path.join(FIXTURES, "characters.json"), "utf8"));
const STAMP = `${syncedAt}|${version}`;

const etagOf = async (app: Awaited<ReturnType<typeof createApp>>, url: string) =>
  (await app.request(url)).headers.get("ETag");

test("a build id changes the ETag at the same syncedAt; no build id keeps the old one", async () => {
  const url = "/api/nikkes/1";
  const plain = await etagOf(await createApp(fsStorage(FIXTURES)), url);
  const a = await etagOf(await createApp(fsStorage(FIXTURES), { buildId: "aaaaaaaaaaaa" }), url);
  const b = await etagOf(await createApp(fsStorage(FIXTURES), { buildId: "bbbbbbbbbbbb" }), url);

  assert.notEqual(a, plain);
  assert.notEqual(a, b);
  assert.equal(a, await etagOf(await createApp(fsStorage(FIXTURES), { buildId: "aaaaaaaaaaaa" }), url));
  // pinned to the pre-build-id formula, so the Node entry's tags don't move
  const old = crypto.createHash("sha1").update(`${syncedAt}|${url}`).digest("hex").slice(0, 27);
  assert.equal(plain, `W/"${old}"`);
});

// runs the real script the way `npm run emit:pages-worker` does, from `cwd`
const emit = (outfile: string, cwd: string) =>
  execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), SCRIPT, outfile], {
    cwd,
    encoding: "utf8",
  }).trim();
const tmp = mkdtempSync(path.join(tmpdir(), "nikke-build-id-"));
const bundlePath = path.join(tmp, "a", "worker.mjs");
let builtId: string | undefined;
const bundled = () => (builtId ??= emit(bundlePath, import.meta.dirname));

test("the bundle script gives the same id and bytes for the same input", () => {
  const buildId = bundled();
  const other = path.join(tmp, "b", "elsewhere.mjs");
  assert.equal(emit(other, tmp), buildId);
  assert.match(buildId, /^[0-9a-f]{12}$/);
  const code = readFileSync(bundlePath, "utf8");
  assert.equal(readFileSync(other, "utf8"), code);
  assert.ok(!code.includes("__NIKKE_BUILD_ID_PLACEHOLDER__"));
  // the id is the hash of the bundle itself, not a constant that happens to repeat
  const unstamped = code.replaceAll(buildId, "__NIKKE_BUILD_ID_PLACEHOLDER__");
  assert.notEqual(unstamped, code);
  assert.equal(crypto.createHash("sha256").update(unstamped).digest("hex").slice(0, 12), buildId);
});

// ── the worker itself, against a stub edge cache and data host ─────────────

const store = new Map<string, Response>();
let refreshedSyncedAt: string | undefined; // what the data host reports after a data refresh
(globalThis as any).caches = {
  default: {
    match: async (k: Request) => store.get(k.url)?.clone(),
    put: async (k: Request, r: Response) => void store.set(k.url, r),
  },
};
process.env.BLA_OPEN_ID = "test-openid";
process.env.BLA_TOKEN = "test-token";
globalThis.fetch = (async (input: any) => {
  const url = String(input?.url ?? input);
  if (url.startsWith(DATA_HOST)) {
    try {
      const body = readFileSync(path.join(FIXTURES, url.slice(DATA_HOST.length)), "utf8");
      if (refreshedSyncedAt && url.endsWith("/characters.json"))
        return Response.json({ ...JSON.parse(body), syncedAt: refreshedSyncedAt });
      return new Response(body);
    } catch {
      return new Response("missing", { status: 404 });
    }
  }
  if (url.endsWith("/api/user/Login"))
    return new Response(JSON.stringify({ code: 0 }), { headers: { "set-cookie": "game_token=t; Path=/" } });
  if (url.includes("GetUserGamePlayerInfo")) return Response.json({ code: 0, data: { area_id: 83 } });
  if (url.includes("GetUserProfileBasicInfo"))
    return Response.json({ code: 0, data: { basic_info: { nickname: "t", lv: 1, character_count: 1 } } });
  if (url.includes("GetUserProfileOutpostInfo"))
    return Response.json({ code: 0, data: { outpost_info: { synchro_level: 400 } } });
  return Response.json({ code: -1, msg: "unmocked" });
}) as typeof fetch;

const call = async (worker: { fetch: Function }, url: string) => {
  const pending: Promise<unknown>[] = [];
  const res: Response = await worker.fetch(
    new Request(`https://api.test${url}`),
    { DIST_HOST: DATA_HOST },
    { waitUntil: (p: Promise<unknown>) => pending.push(p) },
  );
  await Promise.all(pending);
  return res;
};
const storedFor = (pathname: string) => {
  const hits = [...store.entries()].filter(([k]) => new URL(k).pathname === pathname);
  assert.equal(hits.length, 1, pathname);
  const [k, res] = hits[0];
  return { v: new URL(k).searchParams.get("__v"), res };
};

test("the bundled worker keys the edge cache and the ETag on its build id", async () => {
  const buildId = bundled();
  store.clear();
  const { default: worker } = await import(pathToFileURL(bundlePath).href);

  const miss = await call(worker, "/api/nikkes/1");
  assert.equal(miss.headers.get("x-edge-cache"), "MISS");
  assert.equal(storedFor("/api/nikkes/1").v, `${STAMP}|${buildId}`);
  const expected = await etagOf(await createApp(fsStorage(FIXTURES), { buildId }), "/api/nikkes/1");
  assert.equal(miss.headers.get("ETag"), expected);

  const hit = await call(worker, "/api/nikkes/1");
  assert.equal(hit.headers.get("x-edge-cache"), "HIT");
  assert.equal(hit.headers.get("ETag"), expected);
});

test("user responses are stored for USER_TTL with no stale-while-revalidate", async () => {
  bundled();
  store.clear();
  const { default: worker } = await import(pathToFileURL(bundlePath).href);

  const res = await call(worker, "/api/user/12345");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(storedFor("/api/user/12345").res.headers.get("Cache-Control"), "public, max-age=300, s-maxage=300");
});

test("the app rebuilt after a data refresh keeps the build id in its ETag", async () => {
  const buildId = bundled();
  store.clear();
  const { default: worker } = await import(pathToFileURL(bundlePath).href);
  await call(worker, "/api/nikkes/1");

  refreshedSyncedAt = "2026-02-02T00:00:00.000Z";
  const realNow = Date.now;
  Date.now = () => realNow() + 301_000; // past REVALIDATE_MS
  try {
    await call(worker, "/api/nikkes/2"); // a miss starts the background rebuild; call waits for it
    const res = await call(worker, "/api/nikkes/3");
    const tag = crypto
      .createHash("sha1")
      .update(`${refreshedSyncedAt}|${buildId}|/api/nikkes/3`)
      .digest("hex")
      .slice(0, 27);
    assert.equal(res.headers.get("ETag"), `W/"${tag}"`);
  } finally {
    Date.now = realNow;
    refreshedSyncedAt = undefined;
  }
});

test("the worker runs unbundled, with the same key and ETag as before build ids", async () => {
  store.clear();
  const { default: worker } = await import("../worker/index.js");

  const res = await call(worker, "/api/nikkes/1");
  assert.equal(res.status, 200);
  assert.equal(storedFor("/api/nikkes/1").v, STAMP);
  assert.equal(res.headers.get("ETag"), await etagOf(await createApp(fsStorage(FIXTURES)), "/api/nikkes/1"));
});
