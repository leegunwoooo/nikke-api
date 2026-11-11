import assert from "node:assert/strict";
import { rename } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

process.env.NIKKE_DATA_DIR = path.join(import.meta.dirname, "fixtures/dist");
const { default: app } = await import("../src/app.js");

const get = (url: string) => app.request(url);
const json = async (url: string) => {
  const res = await get(url);
  assert.equal(res.status, 200, url);
  return res.json() as Promise<any>;
};

// the fixture manifest pins @deadbeef — urls must follow the recorded media
// commit, not @main, so jsDelivr's 7-day cache can't serve stale renders
const GIF_BASE = "https://cdn.jsdelivr.net/gh/leegunwoooo/nikke-api-media@deadbeef/spine-gif";

// must run before any successful manifest read: a missing manifest is an
// unavailable dependency, not "no gif for this skin" (deploy-order gap)
test("spine.gif answers 503 while the gif manifest can't be read", async () => {
  const dir = path.join(import.meta.dirname, "fixtures/dist");
  const f = path.join(dir, "spine-gif-manifest.json");
  await rename(f, `${f}.bak`);
  try {
    const res = await get("/api/nikkes/1/spine.gif");
    assert.equal(res.status, 503);
    // the JSON spine route degrades instead of failing
    const spine = await get("/api/nikkes/1/spine");
    assert.equal(spine.status, 200);
    assert.equal((await spine.json()).spine.stand.gif, undefined);
  } finally {
    await rename(`${f}.bak`, f);
  }
});

test("spine response attaches gif urls where the manifest has a render", async () => {
  const r = await json("/api/nikkes/1/spine");
  assert.equal(r.spine.stand.gif.url, `${GIF_BASE}/10_0.gif`);
  assert.equal(r.spine.stand.gif.bytes, 1331238);
  // gifs maps every rendered animation of that skin
  assert.equal(r.spine.stand.gifs.idle.url, `${GIF_BASE}/10_0.gif`);
  assert.equal(r.spine.stand.gifs.action.url, `${GIF_BASE}/10_0_action.gif`);
  // manifest has 10_1 but no 10_2 — unrendered skins simply omit gif
  const bySkin = Object.fromEntries(r.costumes.map((c: any) => [c.skinIndex, c]));
  assert.equal(bySkin[1].spine.stand.gif.url, `${GIF_BASE}/10_1.gif`);
  assert.equal(bySkin[1].spine.stand.gifs.action.url, `${GIF_BASE}/10_1_action.gif`);
  assert.equal(bySkin[2].spine.stand.gif, undefined);
});

test("/api/nikkes/:id/spine.gif redirects to jsDelivr by skin", async () => {
  const base = await get("/api/nikkes/rapi/spine.gif");
  assert.equal(base.status, 302);
  assert.equal(base.headers.get("location"), `${GIF_BASE}/10_0.gif`);
  const skin1 = await get("/api/nikkes/10/spine.gif?skin=1");
  assert.equal(skin1.headers.get("location"), `${GIF_BASE}/10_1.gif`);
  assert.equal((await get("/api/nikkes/1/spine.gif?skin=2")).status, 404);
  assert.equal((await get("/api/nikkes/1/spine.gif?skin=abc")).status, 400);
  assert.equal((await get("/api/nikkes/nobody/spine.gif")).status, 404);
});

test("spine.gif?anim= picks another rendered animation", async () => {
  const action = await get("/api/nikkes/rapi/spine.gif?anim=action");
  assert.equal(action.status, 302);
  assert.equal(action.headers.get("location"), `${GIF_BASE}/10_0_action.gif`);
  const combo = await get("/api/nikkes/1/spine.gif?skin=1&anim=action");
  assert.equal(combo.headers.get("location"), `${GIF_BASE}/10_1_action.gif`);
  assert.equal((await get("/api/nikkes/1/spine.gif?anim=delight")).status, 404);
  assert.equal((await get("/api/nikkes/1/spine.gif?anim=../../x")).status, 400);
});

const BURST_GIF_BASE = `${GIF_BASE}`.replace("spine-gif", "burst-gif");

test("burst gif links attach to burstCutscene and redirect by skin", async () => {
  const r = await json("/api/nikkes/1/burst");
  assert.equal(r.burstCutscene.gif.url, `${BURST_GIF_BASE}/10_0.gif`);
  // a costume without its own cutscene gets the base gif under its own skin key —
  // none rendered for 10_1, so it is simply omitted
  const bySkin = Object.fromEntries((r.costumes ?? []).map((c: any) => [c.skinIndex, c]));
  if (bySkin[1]?.burstCutscene) assert.equal(bySkin[1].burstCutscene.gif, undefined);
  const redir = await get("/api/nikkes/rapi/burst.gif");
  assert.equal(redir.status, 302);
  assert.equal(redir.headers.get("location"), `${BURST_GIF_BASE}/10_0.gif`);
  assert.equal((await get("/api/nikkes/1/burst.gif?skin=1")).status, 404);
  assert.equal((await get("/api/nikkes/1/burst.gif?skin=abc")).status, 400);
  assert.equal((await get("/api/nikkes/nobody/burst.gif")).status, 404);
});
