import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

process.env.NIKKE_DATA_DIR = path.join(import.meta.dirname, "fixtures/dist");
const { default: app } = await import("../src/app.js");

const get = (url: string, headers?: Record<string, string>) =>
  app.request(url, headers ? { headers } : undefined);
const json = async (url: string) => {
  const res = await get(url);
  assert.equal(res.status, 200, url);
  return res.json() as Promise<any>;
};

test("nikkes list + filters", async () => {
  assert.equal((await json("/api/nikkes")).count, 3);
  assert.equal((await json("/api/nikkes?element=fire")).characters[0].id, 1);
  assert.equal((await json("/api/nikkes?class=defender")).count, 2);
});

test("nikke detail by id / resourceId / name", async () => {
  const byId = await json("/api/nikkes/1");
  assert.equal(byId.details.background, "bg");
  assert.equal((await json("/api/nikkes/20")).id, 2);
  assert.equal((await json("/api/nikkes/rapi")).id, 1);
  assert.equal((await json("/api/nikkes/anchor")).count, 2);
  assert.equal((await get("/api/nikkes/nobody")).status, 404);
});

test("?fields trims objects, including dot paths", async () => {
  const list = await json("/api/nikkes?fields=id,name.en");
  assert.deepEqual(list.characters[0], { id: 1, name: { en: "Rapi" } });
  const one = await json("/api/nikkes/1?fields=id,details.background");
  assert.deepEqual(one, { id: 1, details: { background: "bg" } });
  const fav = await json("/api/favorites/100?fields=stats");
  assert.deepEqual(fav, { stats: [1, 2] });
});

test("scenes index, nikke filter is case/space-insensitive", async () => {
  assert.equal((await json("/api/scenes")).count, 2);
  assert.equal((await json("/api/scenes?category=main")).count, 1);
  assert.equal((await json("/api/scenes?nikke=innocentmaid")).count, 1);
  assert.equal((await json("/api/scenes?limit=1&offset=1")).scenes[0].groupId, "attract_1_1");
  assert.equal((await json("/api/scenes/d_main_01_01")).lines.length, 1);
  assert.equal((await get("/api/scenes/nope")).status, 404);
});

test("favorites + tables", async () => {
  assert.equal((await json("/api/favorites?q=tele")).count, 1);
  assert.equal((await get("/api/favorites/999")).status, 404);
  assert.deepEqual((await json("/api/tables")).files, ["tower_list.json"]);
  assert.equal((await get("/api/tables/..%2Fcharacters.json")).status, 400);
});

test("/api/nikkes pagination", async () => {
  const all = await json("/api/nikkes");
  assert.equal(all.count, 3);
  assert.equal(all.characters.length, 3);
  assert.equal(all.offset, 0);

  const page = await json("/api/nikkes?limit=2&offset=2");
  assert.equal(page.count, 3); // count is the filtered total, not the page size
  assert.equal(page.offset, 2);
  assert.equal(page.characters.length, 1);

  const beyond = await json("/api/nikkes?offset=99");
  assert.equal(beyond.count, 3);
  assert.equal(beyond.characters.length, 0);

  // filters apply before slicing
  const filtered = await json("/api/nikkes?class=defender&limit=1");
  assert.equal(filtered.count, 2);
  assert.equal(filtered.characters.length, 1);

  // junk values fall back safely
  assert.equal((await json("/api/nikkes?limit=abc&offset=-5")).characters.length, 3);
});

test("?fields on cubes list/detail and scene detail", async () => {
  const cubes = await json("/api/cubes?fields=id,name.ko");
  assert.equal(cubes.count, 2);
  assert.deepEqual(cubes.cubes[0], { id: 1, name: { ko: "테스트 큐브" } });

  const cube = await json("/api/cubes/1?fields=id,stats");
  assert.equal(cube.id, 1);
  assert.equal(cube.stats.length, 1);
  assert.equal(cube.name, undefined);

  const scene = await json("/api/scenes/d_main_01_01?fields=groupId");
  assert.equal(scene.groupId, "d_main_01_01");
  assert.equal(scene.lines, undefined);
  // without fields the raw file is streamed as-is
  const full = await json("/api/scenes/d_main_01_01");
  assert.equal(full.lines.length, 1);
});

test("?lang flattens localized objects", async () => {
  const one = await json("/api/nikkes/1?lang=ko");
  assert.equal(one.name, "라피");
  const en = await json("/api/nikkes/1?lang=en");
  assert.equal(en.name, "Rapi");
  // unsupported/unknown lang values pass through untouched
  const none = await json("/api/nikkes/1?lang=fr");
  assert.equal(none.name.ko, "라피");
});

test("?lang applies to file-streamed endpoints too", async () => {
  assert.equal((await json("/api/favorites/100?lang=en")).name, "Telescope");
  assert.equal((await json("/api/cubes/1?lang=ko")).name, "테스트 큐브");
  // invalid lang on a streamed file still streams raw
  const raw = await json("/api/cubes/1?lang=fr");
  assert.equal(raw.name.ko, "테스트 큐브");
});

test("root + openapi report the built data version", async () => {
  // build.ts bakes package.json's version into characters.json; the
  // fixture pins it at 9.9.9-test — both endpoints must serve that
  assert.equal((await json("/")).version, "9.9.9-test");
  assert.equal((await json("/openapi.json")).info.version, "9.9.9-test");
});

test("/api/user responses are never edge-cached", async () => {
  const res = await get("/api/user?blablaid=not-valid");
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("ETag"), null);
});

test("cache headers + conditional GET", async () => {
  const res = await get("/api/nikkes/1");
  const etag = res.headers.get("ETag");
  assert.ok(etag?.startsWith('W/"'));
  assert.match(res.headers.get("Cache-Control") ?? "", /s-maxage=/);
  assert.equal((await get("/api/nikkes/1", { "If-None-Match": etag! })).status, 304);
  assert.notEqual(etag, (await get("/api/nikkes/2")).headers.get("ETag"));
  assert.equal((await get("/api/nikkes/nobody")).headers.get("Cache-Control"), null);
});
