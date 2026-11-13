import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

process.env.NIKKE_DATA_DIR = path.join(import.meta.dirname, "fixtures/dist");
const { default: app } = await import("../src/app.js");
const { resetBlaSession } = await import("../src/blabla.js");

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

test("/api/meta/filters covers the new endpoints' filter values", async () => {
  const meta = await json("/api/meta/filters");
  assert.deepEqual(meta.stageModes.sort(), ["Hard", "Normal", "Story"].sort());
  assert.ok(meta.stageChapters.includes(1));
  assert.ok(meta.costumeGrades.length > 0);
  assert.ok(meta.equipClasses.length > 0);
  assert.ok(meta.equipRares.length > 0);
  assert.ok(meta.equipSlots.length > 0);
  assert.ok(meta.equipOptionRanks.length > 0);
});

test("nikke detail by id / resourceId / name", async () => {
  const byId = await json("/api/nikkes/1");
  assert.equal(byId.details.background, "bg");
  // attractiveScenarios expose sceneGroupId -> /api/scenes/:groupId
  assert.equal(byId.details.attractiveScenarios[0].sceneGroupId, "d_nikke_test_01");
  assert.equal(byId.details.attractiveScenarios[0].title.ko, "테스트 에피소드");
  assert.equal((await json("/api/nikkes/20")).id, 2);
  assert.equal((await json("/api/nikkes/rapi")).id, 1);
  assert.equal((await json("/api/nikkes/anchor")).count, 2);
  assert.equal((await get("/api/nikkes/nobody")).status, 404);
});

test("?page=N pages alongside ?offset=", async () => {
  // page wins over offset; page 1 == offset 0
  const p1 = await json("/api/nikkes?limit=2&page=1");
  assert.equal(p1.page, 1);
  assert.equal(p1.totalPages, 2);
  assert.deepEqual(
    p1.characters.map((x: any) => x.id),
    (await json("/api/nikkes?limit=2")).characters.map((x: any) => x.id),
  );
  const p2 = await json("/api/nikkes?limit=2&page=2");
  assert.equal(p2.page, 2);
  assert.equal(p2.offset, 2); // (page-1) * limit
  assert.equal(p2.characters.length, 1);
  // page > totalPages → empty page, not an error
  const p9 = await json("/api/nikkes?limit=2&page=9");
  assert.equal(p9.count, 3);
  assert.equal(p9.characters.length, 0);
  // offset mode doesn't emit page fields
  const off = await json("/api/nikkes?limit=2&offset=1");
  assert.equal(off.page, undefined);
  // page works on the other list routes too
  assert.equal((await json("/api/stages?limit=2&page=2")).stages[0].id, 7000001);
  assert.equal((await json("/api/costumes?limit=2&page=2")).page, 2);
  assert.equal((await json("/api/equips?limit=2&page=2")).equips.length, 1);
  assert.equal((await json("/api/avatars?limit=2&page=2")).page, 2);
  assert.equal((await json("/api/favorites?limit=1&page=2")).page, 2);
  assert.equal((await json("/api/cubes?limit=1&page=2")).page, 2);
  // invalid paging params are rejected instead of silently widened
  assert.equal((await get("/api/nikkes?page=abc")).status, 400);
  assert.equal((await get("/api/nikkes?page=0")).status, 400);
  assert.equal((await get("/api/nikkes?limit=-1")).status, 400);
  assert.equal((await get("/api/stages?offset=1.5")).status, 400);
});

test("?fields trims objects, including dot paths", async () => {
  const list = await json("/api/nikkes?fields=id,name.en");
  assert.deepEqual(list.characters[0], { id: 1, name: { en: "Rapi" } });
  const one = await json("/api/nikkes/1?fields=id,details.background");
  assert.deepEqual(one, { id: 1, details: { background: "bg" } });
  const fav = await json("/api/favorites/100?fields=stats");
  assert.deepEqual(fav, { stats: [1, 2] });
});

test("scenes ?q is case/space-insensitive like other lists", async () => {
  const lower = await json("/api/scenes?q=main01");
  const sloppy = await json("/api/scenes?q=MAIN 01");
  assert.equal(lower.count, sloppy.count);
  assert.ok(lower.count > 0);
});

test("/api/events groups event_* scenes per event", async () => {
  const all = await json("/api/events");
  const ev = all.events.find((e: any) => e.id === "event_firstaffection");
  assert.equal(ev.episodes, 2);
  assert.deepEqual(ev.scenes, ["event_firstaffection_01", "event_firstaffection_02"]);
  assert.equal(ev.totalLines, 5);

  const d = await json("/api/events/event_firstaffection");
  assert.equal(d.scenes[0].name, "추억은 갑작스럽게");
  assert.equal((await get("/api/events/event_nope")).status, 404);
  assert.ok((await json("/api/events?q=first")).count >= 1);
});

test("/api/lines pages by default and rejects a query that normalizes to nothing", async () => {
  const all = await json("/api/lines?speaker=" + encodeURIComponent("라피") + "&limit=500");
  assert.ok(all.count > 0);
  for (const bad of ["speaker=%20", "speaker=%20%20", "speaker=_-", "q=%20&speaker=%20", "q=!!!"]) {
    const res = await get(`/api/lines?${bad}`);
    assert.equal(res.status, 400, bad);
    assert.deepEqual(await res.json(), { error: "q or speaker required" }, bad);
  }
});

test("/api/lines returns at most 50 lines without a limit", async () => {
  const { createApp } = await import("../src/factory.js");
  const big = await createApp({
    readText: async (rel: string) => {
      rel = rel.replaceAll("\\", "/");
      if (rel.startsWith("lines/main")) return JSON.stringify({ d_main_big: { sp: ["라피"], l: Array.from({ length: 120 }, (_, i) => [0, `같은 대사 ${i}`]) } });
      if (rel.startsWith("lines/")) return "{}";
      return (await import("node:fs/promises")).readFile(path.join(import.meta.dirname, "fixtures/dist", rel), "utf8");
    },
  } as any);
  const lines = async (qs: string) => (await (await big.request(`/api/lines?${qs}`)).json()) as any;
  const q = `q=${encodeURIComponent("같은 대사")}`;
  const first = await lines(q);
  assert.equal(first.count, 120); // the total stays visible for paging on
  assert.equal(first.lines.length, 50);
  assert.equal((await lines(`${q}&limit=100`)).lines.length, 100);
  assert.equal((await lines(`${q}&offset=100`)).lines.length, 20);
  assert.equal((await lines(`${q}&page=3`)).lines.length, 20);
});

test("the script route skips SubScenario markers but /api/lines keeps their index", async () => {
  // event_firstaffection_01 carries one mid-scene — a cutscene marker, not a
  // line of dialogue, so reading output drops it but positions don't shift
  const scene = await json("/api/scenes/event_firstaffection_01");
  assert.equal(scene.lines[1].window, "SubScenario");
  const script = await json("/api/events/event_firstaffection/script");
  assert.deepEqual(script.episodes[0].lines, ["비 오는 밤.", "앵커: 지휘관님, 우산 가져왔어요!"]);
  const hit = (await json("/api/lines?q=우산 가져왔어요")).lines[0];
  assert.equal(hit.groupId, "event_firstaffection_01");
  assert.equal(scene.lines[hit.line].text, hit.text);
});

test("event source records which scene list the group came from", async () => {
  const ev = (await json("/api/events")).events.find(
    (e: any) => e.id === "event_firstaffection",
  );
  assert.equal(ev.source, "scene_archive_list");
  const d = await json("/api/events/event_firstaffection");
  assert.equal(d.source, "scene_archive_list");
  // scenes.json entries carry the same provenance; groups outside the ko
  // list files (attractive scenes come from roledata) have no source
  const scenes = (await json("/api/scenes")).scenes;
  const byGid = new Map<string, any>(scenes.map((s: any) => [s.groupId, s]));
  assert.equal(byGid.get("event_firstaffection_01").source, "scene_archive_list");
  assert.equal(byGid.get("d_main_01_01").source, "scene_list");
  assert.equal(byGid.get("attract_1_1").source, undefined);
});

test("scenes index, nikke filter is case/space-insensitive", async () => {
  assert.equal((await json("/api/scenes")).count, 9);
  assert.equal((await json("/api/scenes?category=library")).count, 4);
  assert.equal((await json("/api/scenes?q=ARK RANGER")).scenes[0].groupId, "lib_test_00"); // q matches the collection
  assert.equal((await json("/api/scenes?q=event_stories")).count, 1);
  assert.equal((await json("/api/scenes?category=library&nikke=금서고")).count, 1);
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

test("/api/costumes/:id accepts names too (like /api/nikkes/:id)", async () => {
  const one = await json("/api/costumes/수영복");
  assert.equal(one.id, 20001);
  const many = await json("/api/costumes/코스튬");
  assert.equal(many.count, 2);
  assert.equal((await get("/api/costumes/없는이름")).status, 404);
});

test("/api/costumes list + filters + detail", async () => {
  const all = await json("/api/costumes");
  assert.equal(all.count, 4);
  // costume side-stories: manual tid -> event_* scene group prefix map
  assert.deepEqual(all.costumes.find((x: any) => x.id === 30018).storyScenes, [
    "event_firstaffection_01",
    "event_firstaffection_02",
  ]);
  assert.deepEqual(all.costumes.find((x: any) => x.id === 10012).storyScenes, []);
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
  assert.equal((await get("/api/costumes/abc")).status, 404); // name lookup, no match
  // ?lang flattens localized fields
  assert.equal((await json("/api/costumes/10012?lang=ko")).name, "테스트 코스튬");
});

test("/api/equips rows include stats, option slots, costs, description", async () => {
  const d = await json("/api/equips/3110101");
  assert.deepEqual(d.stats, { Atk: 5000, Hp: 40000 });
  assert.deepEqual(d.optionSlots, [
    { slot: 1, success: 1 },
    { slot: 2, success: 0.5 },
  ]);
  assert.deepEqual(d.costs, { open: 10, change: 200, lock: 100 });
  assert.equal(d.description.ko, "테스트 설명\n줄바꿈"); // _x000D_ stripped
  assert.equal(d.description.en, "Test desc\n줄바꿈");
  // item without table row data → nulls
  const d3 = await json("/api/equips/3110301");
  assert.equal(d3.stats, null);
  assert.equal(d3.optionSlots, null);
  assert.equal(d3.costs, null);
});

test("/api/equips + /options list, filters, detail", async () => {
  const all = await json("/api/equips");
  assert.equal(all.count, 3);
  assert.equal(all.equips[0].id, 3110101);
  assert.equal(all.equips[0].slot, "head");
  assert.equal((await json("/api/equips?class=attacker")).count, 1);
  assert.equal((await json("/api/equips?rare=T8")).count, 1);
  assert.equal((await json("/api/equips?slot=arm")).count, 1);
  assert.equal((await json("/api/equips?slot=body")).count, 1); // chest gear slot is "body"
  assert.equal((await json("/api/equips?q=visor")).count, 1);

  const opts = await json("/api/equips/options");
  assert.equal(opts.count, 3);
  assert.equal((await json("/api/equips/options?groupId=100100")).count, 2);
  assert.equal((await json("/api/equips/options?rank=2")).count, 1);
  assert.equal((await json("/api/equips/options?q=atk")).count, 1);
  assert.equal((await get("/api/equips/options?groupId=x")).status, 400);

  const item = await json("/api/equips/3110201");
  assert.equal(item.class, "Attacker");
  const opt = await json("/api/equips/options/7000501");
  assert.equal(opt.groupId, 100100);
  assert.equal((await json("/api/equips/options/7000501?lang=ko")).name, "[공격력 증가]");
  assert.equal((await get("/api/equips/999")).status, 404);
  assert.equal((await get("/api/equips/options/999")).status, 404);
  assert.equal((await get("/api/equips/abc")).status, 400);
});

test("/api/avatars list + filters + detail", async () => {
  const all = await json("/api/avatars");
  assert.equal(all.count, 4);
  const base = all.avatars.find((x: any) => x.iconId === 30100);
  assert.equal(base.character.id, 1);
  assert.equal(base.image, "i"); // base skin icon
  // costumeIndex resolves the costume's icon instead of the base
  assert.equal(all.avatars.find((x: any) => x.iconId === 30101).image, "cos-i");
  // orphan: character null, no fabricated nameCode
  const orphan = all.avatars.find((x: any) => x.iconId === 99999);
  assert.equal(orphan.character, null);
  assert.equal(orphan.image, null);

  assert.equal((await json("/api/avatars?orphans=true")).count, 1);
  assert.equal((await json("/api/avatars?resourceId=10")).count, 2);
  assert.equal((await json("/api/avatars?q=anchor")).count, 1);
  assert.equal((await get("/api/avatars?resourceId=x")).status, 400);

  const d = await json("/api/avatars/30101");
  assert.equal(d.costumeIndex, 1);
  assert.equal((await get("/api/avatars/555")).status, 404);
  assert.equal((await get("/api/avatars/abc")).status, 400);
});

test("avatars resolve a costume by skinIndex, not by its position in costumes[]", async () => {
  // fixture: rapi's costumes[] is [skin 2, skin 1], anchor's is [skin 2] only
  const { avatars } = await json("/api/avatars");
  const row = (id: number) => avatars.find((x: any) => x.iconId === id);
  assert.equal(row(30101).costumeIndex, 1);
  assert.equal(row(30101).image, "cos-i");
  // the avatar's skin isn't in costumes[] → base icon, not whatever sits at that position
  assert.equal(row(30200).costumeIndex, 1);
  assert.equal(row(30200).image, "i");
  assert.equal((await json("/api/avatars/30101")).image, "cos-i");
});

test("profile icon resolves a costume by skinIndex, not by its position in costumes[]", async () => {
  for (const [iconId, image] of [[30101, "cos-i"], [30200, "i"]] as const) {
    const stub = stubBlabla({ basicInfo: { icon_id: iconId } });
    try {
      assert.equal((await json(`/api/user/${iconId}`)).profile.icon.image, image);
    } finally {
      stub.restore();
    }
  }
});

test("favorites list names the owner and filters by nikke", async () => {
  const all = (await json("/api/favorites?lang=ko")).favorites;
  assert.deepEqual(all[0].character, { id: 1, name: "라피" });
  assert.equal(all[1].type, "Collection");
  assert.equal(all[1].character, undefined);
  for (const nikke of ["라피", "rapi", "1", "3001"]) {
    const r = await json(`/api/favorites?nikke=${encodeURIComponent(nikke)}`);
    assert.deepEqual(r.favorites.map((f: any) => f.id), [100], nikke);
  }
  // dolls have no owner, so no name can reach them
  assert.equal((await json(`/api/favorites?nikke=${encodeURIComponent("앵커")}`)).count, 0);
});

test("archives expose the record-room hierarchy with event links", async () => {
  const list = await app.request("/api/archives");
  const j = await list.json() as any;
  assert.equal(j.count, 2);
  const a = j.archives.find((x: any) => x.id === 100);
  assert.equal(a.type, "StoryEvent");
  assert.equal(a.startDate, "2022-11-10T06:30:00");
  const kid = a.children[0];
  assert.equal(kid.album.name, "STORY");
  assert.equal(kid.section.name, "이벤트 앨범");
  assert.equal(kid.event, "event_nocallerid"); // derived from scene groupIds
  assert.equal(kid.scenes[0].groupId, "event_nocallerid_prologue");
  const flat = await app.request("/api/archives/1000100");
  const b = await flat.json() as any;
  assert.equal(b.children[0].section.eventName, "Locale_Event:EVENT_QUEST_FIRSTAFFECTION");
  assert.equal(b.children[0].event, "event_firstaffection");
  assert.equal((await app.request("/api/archives?lang=fr")).status, 400);
  assert.equal((await app.request("/api/archives/nope")).status, 400);
});

test("/api/relics lists lost relic scenes rolled up by collection", async () => {
  const all = await json("/api/relics");
  assert.equal(all.count, 3);
  const col = all.collections.find((x: any) => x.name === "어느 남자의 수기");
  assert.deepEqual(col, { name: "어느 남자의 수기", libraryCategory: "lost_relics", scenes: 2, lines: 12 });
  assert.equal(all.relics[2].groupId, "lib_ev_relic_00");

  assert.equal((await json("/api/relics?category=lost_relics")).count, 2);
  assert.equal((await json("/api/relics?category=event_lost_relics")).count, 1);
  assert.equal((await get("/api/relics?category=event_stories")).status, 400);
  assert.equal((await json("/api/relics?collection=OLD TALES")).count, 1);
  assert.equal((await json("/api/relics?q=침식")).count, 1);
});

test("favorites + tables", async () => {
  assert.equal((await json("/api/favorites?q=tele")).count, 1);
  assert.equal((await get("/api/favorites/999")).status, 404);
  assert.deepEqual((await json("/api/tables")).files.sort(), [
    "ItemEquipTable_en.json",
    "ItemEquipTable_ja.json",
    "ItemEquipTable_ko.json",
    "archive_list_ko.json",
    "scene_archive_list_ko.json",
    "stage_list.json",
    "tower_list.json",
  ]);
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

  // junk values are rejected
  assert.equal((await get("/api/nikkes?limit=abc&offset=-5")).status, 400);
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

test("user-nikke matchers: ?id vs ?name vs unified :nameOrId", async () => {
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

  // unified :nameOrId match covers both (a numeric key also hits digit names)
  assert.equal(m.matchesNikke("102", n102), true);
  assert.equal(m.matchesNikke("112001", n102), true);
  assert.equal(m.matchesNikke("N102", n102), true);
  assert.equal(m.matchesNikke("7", n102), false);
  assert.equal(m.matchesNikke("", n102), true);
});

test("malformed percent-encoding in ?url returns 400, not 500", async () => {
  // a share URL whose openid param itself contains a bad % sequence
  const res = await get(`/api/user?url=${encodeURIComponent("https://x/?openid=%ZZ")}`);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid blablaid" });
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

test("HEAD gets the same cache headers as GET", async () => {
  const res = await app.request("/api/nikkes/1", { method: "HEAD" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("ETag") ?? "", /^W\//);
  assert.match(res.headers.get("Cache-Control") ?? "", /s-maxage=/);
});

// ── /api/user/:blablaid/roster ────────────────────────────────────────────
// the endpoint talks to the live BlablaLink proxy, so tests stub fetch.
// Login must hand back a game_* cookie or blabla.ts never reaches the API.
function stubBlabla(opts: {
  perArea?: (area: number) => { code: number; characters?: unknown[]; msg?: string };
  detailCode?: number;
  details?: unknown[];
  basicInfo?: Record<string, unknown>;
} = {}) {
  const orig = globalThis.fetch;
  const envBackup = { ...process.env };
  resetBlaSession();
  process.env.BLA_OPEN_ID ??= "test-openid";
  process.env.BLA_TOKEN ??= "test-token";
  const detailCalls: number[] = [];
  const loginBodies: any[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url ?? input);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (url.endsWith("/api/user/Login")) {
      loginBodies.push(body);
      return new Response(JSON.stringify({ code: 0 }), {
        headers: { "set-cookie": "game_token=t; Path=/" },
      });
    }
    if (url.includes("GetUserGamePlayerInfo"))
      return Response.json({ code: 0, data: { area_id: 83 } });
    if (url.includes("GetUserCharacters")) {
      const r = (
        opts.perArea ??
        ((a: number) =>
          a === 83 ? { code: 0, characters: [{ name_code: 1, lv: 200 }], msg: "" } : { code: 0, msg: "" })
      )(body.nikke_area_id);
      return Response.json({ code: r.code, msg: r.msg ?? "", data: { characters: r.characters } });
    }
    if (url.includes("GetUserCharacterDetails")) {
      detailCalls.push(body.name_codes.length);
      const code = opts.detailCode ?? 0;
      return Response.json({
        code,
        data: code === 0
          ? {
              character_details: opts.details ?? [{ name_code: 1, skill1_lv: 10 }],
              state_effects: [{ id: 5, function_details: [{ function_type: "StatAtk", function_value: 693 }] }],
            }
          : {},
      });
    }
    if (url.includes("GetUserProfileBasicInfo"))
      return Response.json({ code: 0, data: { basic_info: { nickname: "t", lv: 1, character_count: 1, ...opts.basicInfo } } });
    if (url.includes("GetUserProfileOutpostInfo"))
      return Response.json({ code: 0, data: { outpost_info: { synchro_level: 400 } } });
    return Response.json({ code: -1, msg: "unmocked" });
  }) as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = orig;
      process.env = envBackup;
    },
    detailCalls,
    loginBodies,
  };
}

test("owned nikke ?exact=1 prefers the exact name over other versions", async () => {
  // 3003 = 앵커, 5016 = 앵커: 이노센트 메이드 (fixtures/dist/name_code_map.json)
  const stub = stubBlabla({
    perArea: (a) =>
      a === 83
        ? { code: 0, characters: [{ name_code: 3003, lv: 100, combat: 1 }, { name_code: 5016, lv: 200, combat: 2 }] }
        : { code: 0 },
  });
  try {
    const u = (key: string, q = "") => `/api/user/12345/nikke/${encodeURIComponent(key)}?area=83${q}`;
    // the default contract is unchanged: several hits return the list
    const list = await json(u("앵커"));
    assert.equal(list.count, 2);
    assert.equal(stub.detailCalls.length, 0);

    const hit = await json(u("앵커", "&exact=1&lang=ko"));
    assert.equal(hit.character.id, 2);
    assert.deepEqual(hit.alsoMatched, [{ id: 3, name: "앵커: 이노센트 메이드" }]);
    assert.deepEqual(stub.detailCalls, [1]); // only the winner's detail is fetched

    // any locale, ignoring case and spacing
    for (const key of ["anchor", " 앵 커 "]) assert.equal((await json(u(key, "&exact=1"))).character.id, 2);
    // a name that only partly matches still returns the list
    assert.equal((await json(u("앵", "&exact=1"))).count, 2);
    // a lone hit has nothing else to report
    assert.equal((await json(u("이노센트", "&exact=1"))).alsoMatched, undefined);
  } finally {
    stub.restore();
  }
});

test("owned nikke says whether the slot holds its 애장품 or a doll", async () => {
  // 3001 = 라피 owns item 100; nothing in the fixtures belongs to 앵커 (3003)
  const stub = stubBlabla({
    perArea: (a) =>
      a === 83 ? { code: 0, characters: [{ name_code: 3001, lv: 50 }, { name_code: 3003, lv: 100 }] } : { code: 0 },
    details: [
      { name_code: 3001, favorite_item_tid: 100, favorite_item_lv: 2 },
      { name_code: 3003, favorite_item_tid: 101, favorite_item_lv: 1 },
    ],
  });
  try {
    const r = await json(`/api/user/12345/nikke-builds?area=83&lang=ko&names=${encodeURIComponent("라피,앵커")}`);
    const [rapi, anchor] = r.nikkes;
    // upstream levels are 0-based: 애장품 raw 2 is phase 3 in game, a doll's raw 1 is Lv 1
    assert.deepEqual(rapi.favoriteItem, { id: 100, level: 3, name: "망원경", type: "Favorite" });
    assert.deepEqual(rapi.ownFavoriteItem, { id: 100, name: "망원경" });
    assert.equal(anchor.favoriteItem.type, "Collection");
    assert.equal(anchor.favoriteItem.level, 1);
    assert.equal(anchor.ownFavoriteItem, null); // a doll, and no 애장품 exists yet
  } finally {
    stub.restore();
  }
});

test("nikke-builds all=1 covers every owned nikke, strongest first", async () => {
  // past one upstream batch, so the detail calls have to split
  const owned = Array.from({ length: 250 }, (_, i) => ({ name_code: 9000 + i, lv: 1, combat: i }));
  const stub = stubBlabla({
    perArea: (a) => (a === 83 ? { code: 0, characters: owned } : { code: 0 }),
    details: [{ name_code: 9249, skill1_lv: 10 }, { name_code: 9000, skill1_lv: 3 }],
  });
  try {
    const r = await json("/api/user/12345/nikke-builds?area=83&all=1");
    assert.equal(r.count, 250);
    assert.equal(r.nikkes[0].combat, 249);
    assert.equal(r.nikkes[249].combat, 0);
    assert.deepEqual(stub.detailCalls, [200, 50]);
    assert.equal(r.nikkes[0].skills.skill1, 10);
    assert.equal(r.nikkes[249].skills.skill1, 3); // details from every batch reach their nikke

    const page = await json("/api/user/12345/nikke-builds?area=83&all=1&limit=2&offset=1");
    assert.equal(page.count, 250);
    assert.deepEqual(page.nikkes.map((n: any) => n.combat), [248, 247]);
    assert.deepEqual(stub.detailCalls.at(-1), 2);

    assert.equal((await get("/api/user/12345/nikke-builds?all=1&names=a")).status, 400);
  } finally {
    stub.restore();
  }
});

test("nikke-builds resolves several names from one detail call", async () => {
  // 3001 = 라피, 3003 = 앵커, 5016 = 앵커: 이노센트 메이드
  const stub = stubBlabla({
    perArea: (a) =>
      a === 83
        ? { code: 0, characters: [{ name_code: 3001, lv: 50 }, { name_code: 3003, lv: 100 }, { name_code: 5016, lv: 200 }] }
        : { code: 0 },
    details: [
      { name_code: 3001, skill1_lv: 7 },
      { name_code: 3003, skill1_lv: 9 },
    ],
  });
  try {
    const u = (q: string) => `/api/user/12345/nikke-builds?area=83&lang=ko&${q}`;
    const names = encodeURIComponent("라피,앵커,없는이름,이노,앵");
    const r = await json(u(`names=${names}&limit=2`));
    assert.deepEqual(stub.detailCalls, [2]); // one upstream call, not one per nikke
    assert.equal(r.count, 3);
    assert.deepEqual(r.nikkes.map((n: any) => n.character.id), [1, 2]);
    assert.deepEqual(r.nikkes.map((n: any) => n.skills.skill1), [7, 9]);
    assert.deepEqual(r.nikkes[1].alsoMatched, [{ id: 3, name: "앵커: 이노센트 메이드" }]);
    assert.equal(r.nikkes[0].alsoMatched, undefined);
    assert.deepEqual(r.notFound, ["없는이름"]);
    assert.equal(r.ambiguous[0].query, "앵");
    assert.equal(r.ambiguous[0].candidates.length, 2);

    // the rest of the page costs one more call, for that page's nikkes only
    const next = await json(u(`names=${names}&limit=2&offset=2`));
    assert.deepEqual(next.nikkes.map((n: any) => n.character.id), [3]);
    assert.deepEqual(stub.detailCalls, [2, 1]);

    // repeating a name doesn't repeat the nikke
    const dup = await json(u(`names=${encodeURIComponent("라피,Rapi")}`));
    assert.equal(dup.count, 1);

    assert.equal((await get("/api/user/12345/nikke-builds")).status, 400);
    const many = Array.from({ length: 51 }, (_, i) => `n${i}`).join(",");
    assert.equal((await get(`/api/user/12345/nikke-builds?names=${many}`)).status, 400);
  } finally {
    stub.restore();
  }
});

test("roster: per-area upstream bundle with batching and no-store", async () => {
  const stub = stubBlabla();
  try {
    const res = await get("/api/user/12345/roster");
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.intlOpenId, "12345");
    assert.equal(j.areas.length, 1); // only area 83 has characters
    const a = j.areas[0];
    assert.equal(a.area, 83);
    assert.equal(a.characters[0].name_code, 1);
    assert.equal(a.details[0].skill1_lv, 10);
    assert.equal(a.stateEffects[0].function_details[0].function_value, 693);
    assert.equal(a.outpost.synchro_level, 400);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  } finally {
    stub.restore();
  }
});

test("roster: private profile → 404 reason=private; bad input → 400", async () => {
  const stub = stubBlabla({ perArea: () => ({ code: 1301002, msg: "hidden" }) });
  try {
    const res = await get("/api/user/12345/roster");
    assert.equal(res.status, 404);
    assert.equal((await res.json()).reason, "private");
  } finally {
    stub.restore();
  }
  assert.equal((await get("/api/user/not-an-id/roster")).status, 400);
  const stub2 = stubBlabla();
  try {
    assert.equal((await get("/api/user/12345/roster?area=99")).status, 400);
  } finally {
    stub2.restore();
  }
});

test("roster: detail-call failure aborts with 502 rather than dropping the area", async () => {
  const stub = stubBlabla({ detailCode: 500 });
  try {
    const res = await get("/api/user/12345/roster");
    assert.equal(res.status, 502);
  } finally {
    stub.restore();
  }
});

test("roster: a rate-limited empty server doesn't fail the account's own server", async () => {
  // a profile plays on one server, so another area's 212000 hides nothing
  const stub = stubBlabla({
    perArea: (a) =>
      a === 83 ? { code: 0, characters: [{ name_code: 1, lv: 200 }] } : a === 84 ? { code: 212000, msg: "too frequently" } : { code: 0 },
  });
  try {
    const res = await get("/api/user/12345/roster");
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).areas.map((a: any) => a.area), [83]);
  } finally {
    stub.restore();
  }
});

test("roster: a rate limit with no server answering is still a 502", async () => {
  const stub = stubBlabla({ perArea: () => ({ code: 212000, msg: "too frequently" }) });
  try {
    const res = await get("/api/user/12345/roster");
    assert.equal(res.status, 502);
    assert.equal((await res.json()).code, 212000);
  } finally {
    stub.restore();
  }
});

test("roster: an unknown code only fails its own area when another succeeds", async () => {
  const stub = stubBlabla({
    perArea: (a) =>
      a === 83 ? { code: 0, characters: [{ name_code: 1, lv: 200 }] } : a === 84 ? { code: 500, msg: "boom" } : { code: 0 },
  });
  try {
    const res = await get("/api/user/12345/roster");
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).areas.map((a: any) => a.area), [83]);
  } finally {
    stub.restore();
  }
});

test("roster: an unknown code on every area stays a 502 with that code", async () => {
  const stub = stubBlabla({ perArea: () => ({ code: 500, msg: "boom" }) });
  try {
    const res = await get("/api/user/12345/roster");
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "upstream lookup failed (500 boom)", code: 500 });
  } finally {
    stub.restore();
  }
});

test("roster: empty and private areas stay out of the bundle without failing it", async () => {
  const stub = stubBlabla({
    perArea: (a) =>
      a === 83 ? { code: 0, characters: [{ name_code: 1, lv: 200 }] } : a === 84 ? { code: 1303002 } : { code: 0 },
  });
  try {
    const res = await get("/api/user/12345/roster");
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).areas.map((a: any) => a.area), [83]);
  } finally {
    stub.restore();
  }
});

test("resolvePaging: no params returns the full list, cap only on explicit limit", async () => {
  const { resolvePaging } = await import("../src/app.js");
  // total > 500: no params → everything (the 500 cap must not apply)
  assert.deepEqual(resolvePaging({}, 945), { off: 0, lim: 945, page: 0 });
  // page without limit → default 50-page size
  assert.deepEqual(resolvePaging({ page: "2" }, 945), { off: 50, lim: 50, page: 2 });
  // explicit limit is still capped at 500
  assert.deepEqual(resolvePaging({ limit: "999" }, 945), { off: 0, lim: 500, page: 0 });
  assert.deepEqual(resolvePaging({ limit: "5", offset: "10" }, 945), {
    off: 10,
    lim: 5,
    page: 0,
  });
});

test("limit=0 is rejected instead of returning the full list", async () => {
  const { resolvePaging } = await import("../src/app.js");
  assert.deepEqual(resolvePaging({ limit: "0" }, 945), { error: "invalid limit" });
  assert.deepEqual(resolvePaging({ limit: "0", page: "1" }, 945), { error: "invalid limit" });
  assert.deepEqual(resolvePaging({ limit: "1" }, 945), { off: 0, lim: 1, page: 0 });
  // 0 stays valid for offset, and an empty limit still means "not given"
  assert.deepEqual(resolvePaging({ limit: "1", offset: "0" }, 945), { off: 0, lim: 1, page: 0 });
  assert.deepEqual(resolvePaging({ limit: "" }, 945), { off: 0, lim: 945, page: 0 });

  for (const url of ["/api/nikkes?limit=0", "/api/avatars?limit=0", "/api/lines?q=hello&limit=0", "/api/lines?speaker=x&limit=0"]) {
    const res = await get(url);
    assert.equal(res.status, 400, url);
    assert.deepEqual(await res.json(), { error: "invalid limit" }, url);
  }
  assert.equal((await json("/api/nikkes?limit=1")).characters.length, 1);
  assert.equal((await json("/api/lines?q=a&limit=1&offset=0")).offset, 0);
});

test("/api/story/next: limit must be a positive integer, default 5, cap 20", async () => {
  for (const bad of ["0", "-1", "1.5", "abc"]) {
    const res = await get(`/api/story/next?chapter=-1&limit=${bad}`);
    assert.equal(res.status, 400, bad);
    assert.deepEqual(await res.json(), { error: "invalid limit" }, bad);
  }
  const next = async (qs: string) => (await json(`/api/story/next?chapter=-1${qs}`)).next.length;
  assert.equal(await next(""), 5);
  assert.equal(await next("&limit="), 5);
  assert.equal(await next("&limit=1"), 1);
  assert.equal(await next("&limit=20"), 20);
  assert.equal(await next("&limit=21"), 20);
});

test("a name query that normalizes to nothing matches no one", async () => {
  // whitespace / separators only: no results, not every character
  for (const q of ["%20", "%20%20", "%3A", "_-"]) {
    const list = await json(`/api/nikkes?q=${q}`);
    assert.equal(list.count, 0, q);
    assert.deepEqual(list.characters, [], q);
    assert.equal((await json(`/api/nikkes?q=${q}&family=1`)).count, 0, q);
    assert.equal((await get(`/api/nikkes/${q}`)).status, 404, q);
    assert.equal((await get(`/api/nikkes/${q}/appearances`)).status, 404, q);
  }
  // an empty q is still no filter at all
  assert.equal((await json("/api/nikkes?q=")).count, 3);
});

test("fingerprint watches both archive lists that sync collects", () => {
  // importing the script would run it against the CDN, so read its PATHS as text
  const src = readFileSync(path.join(import.meta.dirname, "../scripts/fingerprint.ts"), "utf8");
  const paths = src.slice(src.indexOf("const PATHS"), src.indexOf("];"));
  assert.ok(paths.includes(`"archive/ko/archive_list.json"`));
  assert.ok(paths.includes(`"scene/ko/archive_list.json"`));
});

test("/api/events ?q ignores punctuation/whitespace on both sides", async () => {
  // titles in events.json carry punctuation norm() doesn't strip
  assert.equal((await json("/api/events?q=acpu freeze")).events[0].id, "event_freezeacpu");
  assert.equal((await json("/api/events?q=CLAY, MORE")).events[0].id, "event_claymore");
  assert.equal((await json("/api/events?q=clay more")).count, 1);
  // id search still works, with or without the underscore
  assert.equal((await json("/api/events?q=freezeacpu")).count, 1);
  assert.equal((await json("/api/events?q=event_freezeacpu")).count, 1);
});

// ── x-bla-creds (edge-injected upstream credentials) ──────────────────────
// the edge worker injects the KV-stored lookup creds as a base64 header;
// they must be request-scoped so a forged header can't poison other calls

const blaCredsHeader = (over: Record<string, string> = {}) =>
  Buffer.from(
    JSON.stringify({
      open_id: "injected-openid",
      token: "injected-token",
      uid: "123",
      channel_id: 6,
      expires: "2099-01-01",
      ...over,
    }),
  ).toString("base64");

test("x-bla-creds supplies the upstream login for its request only", async () => {
  const stub = stubBlabla();
  try {
    // request with the injected header uses injected creds
    const res = await get("/api/user/12345", { "x-bla-creds": blaCredsHeader() });
    assert.equal(res.status, 200);
    assert.equal(stub.loginBodies.at(-1).game_openid, "injected-openid");
    assert.equal(stub.loginBodies.at(-1).game_token, "injected-token");
    // a request without the header still uses env creds — no leakage
    await get("/api/user/12345");
    assert.equal(stub.loginBodies.at(-1).game_openid, "test-openid");
  } finally {
    stub.restore();
  }
});

test("a malformed x-bla-creds header falls back to env creds", async () => {
  const stub = stubBlabla();
  try {
    await get("/api/user/12345", { "x-bla-creds": "not-base64!!" });
    // env creds (set by stubBlabla) were used, not garbage
    assert.equal(stub.loginBodies.at(-1).game_openid, "test-openid");
  } finally {
    stub.restore();
  }
});
