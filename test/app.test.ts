import assert from "node:assert/strict";
import crypto from "node:crypto";
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

test("/api/stages list + filters + detail", async () => {
  const all = await json("/api/stages");
  assert.equal(all.count, 4);
  assert.equal(all.stages[0].id, 6000001);
  assert.equal(all.stages[0].battlePower, 110);
  assert.equal(all.stages[0].scenarios.enter, "d_main_01_01_s");
  assert.equal((await json("/api/stages?chapter=2")).count, 1);
  assert.equal((await json("/api/stages?mode=hard")).count, 1);
  assert.equal((await json("/api/stages?q=0-2")).count, 1);
  assert.equal((await json("/api/stages?limit=1&offset=1")).stages[0].id, 6000002);
  const d = await json("/api/stages/7000001");
  assert.equal(d.mode, "Hard");
  assert.equal(d.scenarios.exit, null);
  assert.equal((await get("/api/stages/999")).status, 404);
  assert.equal((await get("/api/stages/abc")).status, 400);
  assert.equal((await get("/api/stages?chapter=x")).status, 400);
});

test("/api/costumes list + filters + detail", async () => {
  const all = await json("/api/costumes");
  assert.equal(all.count, 3);
  const rapi = all.costumes.find((x: any) => x.id === 10012);
  assert.equal(rapi.character.id, 1);
  assert.equal(rapi.images.icon, "cos-i"); // resolved via character costumes
  // orphan costume (resourceId without a character) → character: null
  assert.equal(all.costumes.find((x: any) => x.id === 99999).character, null);

  assert.equal((await json("/api/costumes?q=test costume")).count, 1);
  assert.equal((await json("/api/costumes?grade=event")).count, 1);
  assert.equal((await json("/api/costumes?nikke=앵커")).count, 1);
  assert.equal((await json("/api/costumes?nikke=10")).count, 1); // resourceId
  assert.equal((await json("/api/costumes?limit=1&offset=1")).costumes.length, 1);

  const d = await json("/api/costumes/10012");
  assert.equal(d.name.ko, "테스트 코스튬");
  assert.equal((await get("/api/costumes/777")).status, 404);
  assert.equal((await get("/api/costumes/abc")).status, 400);
  // ?lang flattens localized fields
  assert.equal((await json("/api/costumes/10012?lang=ko")).name, "테스트 코스튬");
});

test("favorites + tables", async () => {
  assert.equal((await json("/api/favorites?q=tele")).count, 1);
  assert.equal((await get("/api/favorites/999")).status, 404);
  assert.deepEqual((await json("/api/tables")).files.sort(), ["stage_list.json", "tower_list.json"]);
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

test("user-nikke matchers: ?id vs ?name vs unified :key", async () => {
  const { makeNikkeMatchers } = await import("../src/app.js");
  // N102: name contains digits — the old unified matcher missed it on
  // numeric queries because it only compared ids
  const n102 = { name_code: 112001 };
  const charRef = (code?: number | null) =>
    code === 112001
      ? { nameCode: 112001, id: 112001, resourceId: 5001, name: { ko: "N102", en: "N102" } }
      : null;
  const m = makeNikkeMatchers(charRef);

  // ?id= matches only id/nameCode/resourceId — never names
  assert.equal(m.matchesNikkeId("112001", n102), true);
  assert.equal(m.matchesNikkeId("5001", n102), true);
  assert.equal(m.matchesNikkeId("102", n102), false);
  assert.equal(m.matchesNikkeId("n102", n102), false);

  // ?name= matches partial names even when they're digits
  assert.equal(m.matchesNikkeName("102", n102), true);
  assert.equal(m.matchesNikkeName("n10", n102), true);
  assert.equal(m.matchesNikkeName("xyz", n102), false);
  assert.equal(m.matchesNikkeName("", n102), true); // empty = no filter

  // unified :key match covers both (a numeric key also hits digit names)
  assert.equal(m.matchesNikke("102", n102), true);
  assert.equal(m.matchesNikke("112001", n102), true);
  assert.equal(m.matchesNikke("N102", n102), true);
  assert.equal(m.matchesNikke("7", n102), false);
  assert.equal(m.matchesNikke("", n102), true);
});

test("unknown routes return JSON 404", async () => {
  const res = await get("/api/nope");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not found" });
});

test("cache headers + conditional GET", async () => {
  const res = await get("/api/nikkes/1");
  const etag = res.headers.get("ETag");
  assert.ok(etag?.startsWith('W/"'));
  assert.match(res.headers.get("Cache-Control") ?? "", /s-maxage=/);
  assert.equal((await get("/api/nikkes/1", { "If-None-Match": etag! })).status, 304);
  assert.notEqual(etag, (await get("/api/nikkes/2")).headers.get("ETag"));
  assert.equal((await get("/api/nikkes/nobody")).headers.get("Cache-Control"), null);

  // the tag is URL-derived, so it's forgeable — a missing resource must
  // still 404 even when the client sends the "correct" If-None-Match
  const forged = `W/"${crypto
    .createHash("sha1")
    .update("9.9.9-test|/api/nikkes/nobody")
    .digest("hex")
    .slice(0, 27)}"`;
  const missing = await get("/api/nikkes/nobody", { "If-None-Match": forged });
  assert.equal(missing.status, 404);
});
