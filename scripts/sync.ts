import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cdnUrl } from "../src/cdn.js";

const OUT_DIR = path.resolve("data/raw");

// path templates -> output filename. {l} is replaced with each locale.
const STATIC_RESOURCES: [string, string][] = [
  ["character/character_id_map.json", "character_id_map.json"],
  ["character/character_avatar_map.json", "character_avatar_map.json"],
  ["character/character_skill_map.json", "character_skill_map.json"],
  ["character/CharacterLevelTable.json", "CharacterLevelTable.json"],
  ["character/AttractiveLevelTable.json", "AttractiveLevelTable.json"],
  ["character/RecycleResearchStatTable.json", "RecycleResearchStatTable.json"],
  ["character/scene_characeter_list_v2.json", "scene_characeter_list_v2.json"],
  ["equip/favorite_rare_map.json", "favorite_rare_map.json"],
  ["tower/tower_list.json", "tower_list.json"],
  ["stage/stage_list.json", "stage_list.json"],
  ["spine/spine-layers.json", "spine_layers.json"],
  // nikke lists — filenames differ per locale; ko's complete list has NO suffix
  // (nikke_list_ko_v2.json is a stale 154-entry subset)
  ["character/ko/nikke_list_v2.json", "nikke_list_ko_v2.json"],
  ["character/en/nikke_list_en_v2.json", "nikke_list_en_v2.json"],
  ["character/ja/nikke_list_ja_v2.json", "nikke_list_ja_v2.json"],
  ["character/zh-TW/nikke_list_zh-TW_v2.json", "nikke_list_zh-TW_v2.json"],
  // ko scene/archive lists live at the unsuffixed path (same convention as nikke_list ko)
  ["scene/ko/scene_list.json", "scene_list_ko.json"],
  ["archive/ko/archive_list.json", "archive_list_ko.json"],
  ["scene/ko/sudden_list.json", "sudden_list_ko.json"],
];

const LANG_RESOURCES: [string, string][] = [
  ["character/{l}/character_face_list.json", "character_face_list_{l}.json"],
  ["equip/ItemEquipTable-{l}.json", "ItemEquipTable_{l}.json"],
  ["equip/equip_option_table_v2-{l}.json", "equip_option_table_{l}.json"],
  ["archive/{l}/archive_list_{l}.json", "archive_list_{l}.json"],
  ["scene/{l}/scene_list_{l}.json", "scene_list_{l}.json"],
  ["scene/{l}/sudden_list_{l}.json", "sudden_list_{l}.json"],
];

const LOCALES = ["ko", "en", "ja", "zh-TW"];

// per-character detail data, keyed by resource_id
async function syncRoleData(): Promise<number> {
  // read a synced nikke list to get resource ids
  let ids: number[] = [];
  try {
    const raw = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(OUT_DIR, "nikke_list_en_v2.json"), "utf8"),
    );
    const list = JSON.parse(raw) as { resource_id: number }[];
    ids = [...new Set(list.map((x) => x.resource_id))];
  } catch {
    console.log("roledata: nikke_list_en_v2.json missing, skipped");
    return 0;
  }

  let done = 0;
  const queue: [string, string][] = [];
  for (const rid of ids) {
    for (const l of LOCALES) {
      // roledata uses lowercase locale (zh-tw), nikke_list uses zh-TW
      queue.push([`roledata/${rid}-v2-${l.toLowerCase()}.json`, `roledata_${rid}_${l}.json`]);
    }
  }
  const CONCURRENCY = 8;
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const results = await Promise.all(
      queue.slice(i, i + CONCURRENCY).map(([p, out]) => download(p, out)),
    );
    done += results.filter(Boolean).length;
  }
  return done;
}

// ko-only scene detail (dialogue) files, keyed by scenario_group_id
async function syncScenes(): Promise<number> {
  const fs = await import("node:fs/promises");
  const queue: [string, string][] = [];
  try {
    const blob = await Promise.all(
      ["scene_list_ko.json", "sudden_list_ko.json", "archive_list_ko.json"].map((f) =>
        fs.readFile(path.join(OUT_DIR, f), "utf8"),
      ),
    );
    const groupIds = [
      ...new Set(blob.join("").matchAll(/"scenario_group_id"\s*:\s*"([^"]+)"/g)),
    ].map((m) => m[1]);
    for (const gid of groupIds) {
      queue.push([`scene/ko/scene_detail_${gid}.json`, `scene_${gid}.json`]);
    }
    // voice maps — same key rule as the SPA: d_main_NN for main, whole gid for events
    // (fully-voiced events have a map per group; others 404 harmlessly)
    const voiceKeys = new Set(
      groupIds
        .map((g) => g.match(/d_main_\d+/)?.[0] ?? (g.startsWith("event_") ? g : null))
        .filter(Boolean) as string[],
    );
    for (const p of voiceKeys) {
      queue.push([`scene/voice_map/${p}.json`, `voice_map_${p}.json`]);
    }
  } catch {
    console.log("scenes: ko list files missing, skipped");
  }

  // attractive (호감도) scenario groups live in roledata, on a different CDN path
  for (const f of await fs.readdir(OUT_DIR)) {
    if (!(f.startsWith("roledata_") && f.endsWith("_ko.json"))) continue;
    const r = JSON.parse(await fs.readFile(path.join(OUT_DIR, f), "utf8"));
    for (const s of r.attractive_scenario_list ?? []) {
      const gid: string | undefined = s.attractive_scenario_group_id;
      if (gid && !queue.some(([, o]) => o === `attract_${gid}.json`)) {
        queue.push([`attractscene/${gid}-ko.json`, `attract_${gid}.json`]);
      }
    }
  }

  let done = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const results = await Promise.all(
      queue.slice(i, i + CONCURRENCY).map(([p, out]) => download(p, out)),
    );
    done += results.filter(Boolean).length;
  }
  return done;
}

// favorite (소장품) item details, ids come from favorite_rare_map.json
async function syncFavorites(): Promise<number> {
  const fs = await import("node:fs/promises");
  let ids: number[] = [];
  try {
    const map = JSON.parse(
      await fs.readFile(path.join(OUT_DIR, "favorite_rare_map.json"), "utf8"),
    );
    for (const v of Object.values(map)) if (Array.isArray(v)) ids.push(...(v as number[]));
    ids = [...new Set(ids)];
  } catch {
    console.log("favorites: favorite_rare_map.json missing, skipped");
    return 0;
  }

  const queue: [string, string][] = [];
  for (const id of ids) {
    for (const l of LOCALES) {
      // equip files use lowercase zh-tw
      queue.push([`equip/${l.toLowerCase()}/favorite_${id}.json`, `favorite_${id}_${l}.json`]);
    }
  }
  let done = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const results = await Promise.all(
      queue.slice(i, i + CONCURRENCY).map(([p, out]) => download(p, out)),
    );
    done += results.filter(Boolean).length;
  }
  return done;
}

// harmony cubes — no index file exists, so probe the known tid range
async function syncCubes(): Promise<number> {
  const tids: number[] = [];
  for (let tid = 1000300; tid <= 1000399; tid++) {
    try {
      const res = await fetchWithRetry(cdnUrl(`equip/ko/cube_${tid}.json`), { method: "HEAD" });
      if (res.ok) tids.push(tid);
    } catch { /* skip unreachable tid */ }
  }
  const queue: [string, string][] = [];
  for (const tid of tids) {
    for (const l of LOCALES) {
      queue.push([`equip/${l.toLowerCase()}/cube_${tid}.json`, `cube_${tid}_${l}.json`]);
    }
  }
  let done = 0;
  const CONCURRENCY = 8;
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const results = await Promise.all(
      queue.slice(i, i + CONCURRENCY).map(([p, out]) => download(p, out)),
    );
    done += results.filter(Boolean).length;
  }
  return done;
}

async function fetchWithRetry(url: string, init?: RequestInit, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

async function download(pathTemplate: string, outName: string): Promise<boolean> {
  const url = cdnUrl(pathTemplate);
  try {
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      console.log(`${res.status}  ${pathTemplate}`);
      return false;
    }
    const body = await res.text();
    JSON.parse(body); // sanity check
    await writeFile(path.join(OUT_DIR, outName), body);
    console.log(`ok  ${outName.padEnd(40)} ${(body.length / 1024).toFixed(1).padStart(8)} KB`);
    return true;
  } catch (e) {
    console.log(`err ${pathTemplate}: ${(e as Error).message}`);
    return false;
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let ok = 0;
  for (const [p, out] of STATIC_RESOURCES) {
    if (await download(p, out)) ok++;
  }
  for (const locale of LOCALES) {
    for (const [tpl, outTpl] of LANG_RESOURCES) {
      const p = tpl.replace(/\{l\}/g, locale);
      const out = outTpl.replace(/\{l\}/g, locale);
      if (await download(p, out)) ok++;
    }
  }
  console.log(`\n${ok} resources synced -> ${OUT_DIR}`);

  const n = await syncRoleData();
  console.log(`${n} roledata files synced`);

  const s = await syncScenes();
  console.log(`${s} scene detail files synced (ko)`);

  const fv = await syncFavorites();
  console.log(`${fv} favorite item files synced`);

  const cb = await syncCubes();
  console.log(`${cb} harmony cube files synced`);
}

main();
