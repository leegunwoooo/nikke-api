import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { cacheHeaders } from "../src/cache.js";
import { createBurstViewer } from "../src/burst-viewer.js";
import { getBurstCutscene } from "../src/burst.js";

const burst = getBurstCutscene(63)!;
const asset = `/burst-assets/${burst.source.revision}/${burst.id}/c063_00_skillcut.skel`;

test("viewer serves one complete scene with local asset URLs and escapes the title", async () => {
  const voice = { burst: { text: "대사", audio: "https://sg-tools-cdn.blablalink.com/a/v.mp3" }, ready: null, full: null };
  const app = createBurstViewer(() => '<img src=x onerror="bad()">', fetch, async () => voice);
  const response = await app.request(`/burst-viewer?id=${burst.id}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes('<img src=x'));
  const config = JSON.parse(html.match(/<script id="burst-data" type="application\/json">([^<]*)<\/script>/)![1]);
  assert.equal(config.skeleton, asset);
  assert.deepEqual(config.playback, burst.playback);
  assert.deepEqual(config.voice, voice);
  assert.ok(config.textures.every((t: any) => t.url.startsWith("/burst-assets/")));
  assert.equal((await app.request("/burst-viewer?id=missing")).status, 404);
  const player = await app.request("/burst-player.js");
  assert.match(player.headers.get("content-type")!, /javascript/);
  assert.match(await player.text(), /Spine Runtimes License/);
});

test("asset relay is limited to catalog files and forwards no client headers or query URLs", async () => {
  const calls: { input: string; init?: RequestInit }[] = [];
  const app = createBurstViewer(undefined, (async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(new Uint8Array([1, 2, 3]));
  }) as typeof fetch);
  const response = await app.request(`${asset}?url=https://invalid.example/private`, { headers: { Cookie: "private=test", Authorization: "Bearer secret" } });
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.equal(calls[0].input, burst.skeleton);
  assert.equal(calls[0].init?.headers, undefined);
  assert.equal(calls[0].init?.redirect, "manual");
  assert.equal((await app.request(asset.replace(".skel", ".unknown"))).status, 404);
  assert.equal((await app.request(asset.replace(burst.source.revision, "other"))).status, 404);
  assert.equal((await app.request(asset.replace(burst.id, "unknown"))).status, 404);
  assert.equal(calls.length, 1);
  assert.equal((await app.request(asset, { method: "HEAD" })).status, 200);
  assert.equal(calls[1].init?.method, "HEAD");
});

test("successful assets use existing cache headers; upstream failures are not cached", async () => {
  let fail = false;
  const app = new Hono();
  app.use("*", cacheHeaders("test"));
  app.route("/", createBurstViewer(undefined, (async () => new Response("asset", { status: fail ? 503 : 200 })) as typeof fetch));
  const ok = await app.request(asset);
  assert.match(ok.headers.get("cache-control")!, /s-maxage=86400/);
  const etag = ok.headers.get("etag")!;
  assert.equal((await app.request(asset, { headers: { "If-None-Match": etag } })).status, 304);
  fail = true;
  const failed = await app.request(asset, { headers: { "If-None-Match": etag } });
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get("cache-control"), "no-store");
  assert.equal(failed.headers.get("etag"), null);
});
