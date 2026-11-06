import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { getBurstCutscene, withBurstCutscenes } from "../src/burst.js";
import { createApp } from "../src/factory.js";
import { fsStorage } from "../src/storage.js";
import { atlasPages, burstAnimation, resourceKey, selectBursts, spineVersion, type CatalogEntry } from "../scripts/burst-cutscenes.js";
import catalog from "../content/burst-cutscenes/catalog.json" with { type: "json" };
import fixtures from "./fixtures/dist/characters.json" with { type: "json" };
import type { Nikke } from "../src/types.js";
import { burstPlayback } from "../src/burst-playback.js";

test("catalog maps exact resource IDs and skins, including real filename exceptions", () => {
  assert.deepEqual(resourceKey("c017_00_slillcut.skel"), { resourceId: 17, skinIndex: 0 });
  assert.deepEqual(resourceKey("c851_00_skillut.skel"), { resourceId: 851, skinIndex: 0 });
  assert.deepEqual(resourceKey("c840_skillcut_00.skel"), { resourceId: 840, skinIndex: 0 });
  assert.deepEqual(resourceKey("c093_skillcut.skel"), { resourceId: 93, skinIndex: 0 });
  assert.equal(resourceKey("c821_01.skel"), null);
  assert.equal(resourceKey("c511_aim_03.skel"), null);
  assert.equal(resourceKey("c511_01_skillcut_02.skel"), null);
  assert.equal(getBurstCutscene(10)?.id, "catalog-c010_00_skillcut");
  assert.equal(getBurstCutscene(511, 3)?.id, "c511_03_skillcut");
  assert.equal(getBurstCutscene(470)?.id, "catalog-c470_00_z_f");
  assert.equal(getBurstCutscene(821, 1)?.id, "c821_01");
  assert.equal(getBurstCutscene(511, 2), null); // no pretending the costume has its own burst
  assert.equal(getBurstCutscene(19), null); // newer character not in the pinned source
  assert.equal(getBurstCutscene(999999), null);
});

test("atlas preserves multiple pages and rejects empty or unsafe resource names", () => {
  assert.deepEqual(atlasPages("one.png\r\nsize:2048,2048\r\nregion\r\nbounds:0,0,20,20\r\n\r\ntwo.png\r\nsize:1024,1024\r\n"), ["one.png", "two.png"]);
  assert.throws(() => atlasPages(""));
  assert.throws(() => atlasPages("../escape.png\nsize:1,1"));
  assert.throws(() => atlasPages("one.png\nsize:1,1\n\none.png\nsize:1,1"));
  const header = new Uint8Array(32);
  header[8] = 7;
  header.set(new TextEncoder().encode("4.1.20"), 9);
  assert.equal(spineVersion(header), "4.1.20");
  assert.throws(() => spineVersion(new Uint8Array(4)));
  header[11] = "2".charCodeAt(0);
  assert.throws(() => spineVersion(header));
});

test("viewer selects the burst track, not idle or a background-only track", () => {
  assert.equal(burstAnimation(["bg_skillcut_1", "idle", "skillcut_1"]), "skillcut_1");
  assert.equal(burstAnimation(["skill_cut_bg", "idle", "skill_cut"]), "skill_cut");
  assert.equal(burstAnimation(["idle", "skill_01"]), "skill_01");
  assert.equal(burstAnimation(["idle_1", "skillcut_1_OFF", "skillcut_2_OFF_MOVE_BIG"]), "skillcut_1_OFF");
  assert.equal(burstAnimation(["idle", "skilcut_1"]), "skilcut_1");
  assert.equal(burstAnimation(["idle", "skillcut1"]), "skillcut1");
  assert.equal(burstAnimation(["skillcut_1", "skillcut_2", "all_skillcut"]), "all_skillcut");
  assert.equal(burstAnimation(["skillcut_1", "skillcut_1_bg", "skillcut_1_all"]), "skillcut_1_all");
  assert.equal(burstAnimation(["idle", "bg_skillcut_1", "skill_cut_bg"]), null);
});

test("importer resolves known duplicates deterministically and refuses ambiguous/composite entries", () => {
  const entry = (id: string, skel = "c090_00_skillcut.skel"): CatalogEntry => ({
    id, resourceType: "skill", cutscenes: [{ dir: `spine/${id}/`, atlas: "c090_00_skillcut.atlas", skel }],
  });
  const entries = [entry("c090_00_skillcut"), entry("catalog-c090_00_skillcut")];
  assert.deepEqual(selectBursts(entries), selectBursts([...entries].reverse()));
  assert.equal(selectBursts(entries)[0].id, "catalog-c090_00_skillcut");
  assert.throws(() => selectBursts([entry("a"), entry("b")]));
  const composite = entry("composite");
  composite.cutscenes![0].compositeLayers = [{}];
  assert.throws(() => selectBursts([composite]));
  assert.equal(selectBursts([entry("not-burst", "c821_01.skel")]).length, 0);
  assert.equal(selectBursts([entry("c821_01", "c821_01.skel")])[0].skinIndex, 1);
});

test("every checked-in burst has unique keys and complete texture URLs", () => {
  assert.equal(new Set(catalog.entries.map(e => `${e.resourceId}:${e.skinIndex}`)).size, catalog.entries.length);
  for (const entry of catalog.entries) {
    const burst = getBurstCutscene(entry.resourceId, entry.skinIndex)!;
    assert.ok(burst.textures.length > 0);
    assert.ok(burst.textures.every(t => new URL(t.url).protocol === "https:" && t.url.endsWith(`/${t.name}`)));
    assert.equal(new URL(burst.viewerUrl).searchParams.get("id"), entry.id);
    assert.equal(new URL(burst.viewerUrl).pathname, "/burst-viewer");
    assert.equal(new URL(burst.source.viewerUrl).searchParams.get("anim"), burst.animation);
    assert.ok(burst.playback.layers.some(l => l.role === "main" && l.animation === burst.animation));
    assert.ok(burst.animations.some(a => a.name === burst.animation && a.duration > 0));
    assert.equal(burst.source.revision, catalog.commit);
  }
});

test("backgrounds are included in the playback plan, authored combined animations stay single", () => {
  const composite = catalog.entries.map(e => getBurstCutscene(e.resourceId, e.skinIndex)!).filter(b => b.playback.mode === "composite");
  assert.deepEqual(composite.map(b => b.id), ["c063_00_skillcut", "c103_00_skillcut", "c170_04_skillcut", "c315_00_skillcut", "c513_01_skillcut", "c580_01_skillcut", "catalog-c852_00_skillcut", "c871_00_skillcut", "c872_skillcut_00"]);
  assert.deepEqual(getBurstCutscene(871)!.playback.layers, [
    { role: "main", animation: "skillcut_0" }, { role: "overlay", animation: "skillcut_1" },
  ]);
  assert.deepEqual(getBurstCutscene(63)!.playback, { mode: "composite", duration: 4.7, layers: [
    { role: "background", animation: "bg_skillcut_1" }, { role: "main", animation: "skillcut_1" },
  ] });
  assert.equal(getBurstCutscene(532)!.playback.mode, "single");
  assert.equal(getBurstCutscene(860)!.playback.layers[0].animation, "all_skillcut");
  assert.throws(() => burstPlayback([{ name: "skillcut_1", duration: 4 }, { name: "bg_skillcut_1", duration: 8 }]), /timing/);
});

test("enrichment preserves all existing character/costume data without mutating old bundles", () => {
  for (const character of fixtures.characters) {
    const n = character as Nikke;
    const before = structuredClone(n);
    const enriched = withBurstCutscenes(n);
    assert.deepEqual(n, before);
    const { burstCutscene, costumes, ...rest } = enriched;
    assert.deepEqual(rest, (({ costumes, ...rest }) => rest)(n));
    assert.deepEqual(costumes.map(({ burstCutscene, ...c }) => c), n.costumes);
  }
});

const app = await createApp(fsStorage(path.join(import.meta.dirname, "fixtures/dist")));
const json = async (url: string) => (await app.request(url)).json() as Promise<any>;

test("burst REST endpoint resolves names/IDs, nullable costumes, fields and localization", async () => {
  const rapi = await json("/api/nikkes/rapi/burst?lang=ko");
  assert.equal(rapi.name, "라피");
  assert.equal(rapi.burstCutscene.id, "catalog-c010_00_skillcut");
  assert.equal(rapi.costumes[0].skinIndex, 2); // fixture deliberately not sorted by skin
  assert.ok(rapi.costumes.every((c: any) => c.burstCutscene === null));
  assert.deepEqual((await json("/api/nikkes/10/burst?lang=ko")).burstCutscene, rapi.burstCutscene);
  assert.equal((await json("/api/nikkes/anchor/burst")).id, 2); // exact name wins
  assert.equal((await json("/api/nikkes/anch/burst")).count, 2);
  assert.equal((await app.request("/api/nikkes/unknown/burst")).status, 404);
  assert.equal((await app.request("/api/nikkes/%20/burst")).status, 404);
  assert.deepEqual(await json("/api/nikkes/1/burst?fields=id,burstCutscene.id"), { id: 1, burstCutscene: { id: "catalog-c010_00_skillcut" } });
  assert.equal((await json("/api/nikkes/1/spine")).burstCutscene.id, rapi.burstCutscene.id);
  assert.equal((await json("/api/nikkes/1")).burstCutscene.id, rapi.burstCutscene.id);
  assert.equal((await json("/api/costumes/10012")).burstCutscene, null);
  const spec = await json("/openapi.json");
  assert.ok(spec.paths["/api/nikkes/{id}/burst"].get.responses["200"]);
  assert.deepEqual(rapi.burstCutscene.playback, getBurstCutscene(10)!.playback);
});

test("burst voices attach per skin from the detail file", async () => {
  const rapi = await json("/api/nikkes/1/burst");
  const voice = rapi.burstCutscene.voice;
  assert.equal(voice.burst.text, "화력 집중!");
  assert.equal(voice.burst.audio, "https://sg-tools-cdn.blablalink.com/a/burst_ko.mp3");
  assert.equal(voice.ready.text, "레디.");
  assert.equal(voice.full.audio, "https://sg-tools-cdn.blablalink.com/a/full_ko.mp3");
  // same voice data on spine and character detail responses
  assert.equal((await json("/api/nikkes/1/spine")).burstCutscene.voice.burst.audio, voice.burst.audio);
  assert.equal((await json("/api/nikkes/1")).burstCutscene.voice.burst.audio, voice.burst.audio);
  // a costume-indexed line never leaks into the base appearance's voice
  assert.notEqual(voice.burst.audio, "https://sg-tools-cdn.blablalink.com/a/costume_burst_ko.mp3");
});
