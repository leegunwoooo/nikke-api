import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cdnUrl } from "../src/cdn.js";
import { compareEventScenes, eventIdOf } from "../src/events.js";
import { readFavoriteStories } from "./favorite-stories.js";
import { mainChaptersFromList } from "./main-chapters.js";
import type {
  Burst,
  Locale,
  Localized,
  Nikke,
  NikkeDetail,
  RawNikke,
  RawRoleData,
  RawSkillDetail,
  Skill,
  SkillIconMap,
} from "../src/types.js";

const RAW = path.resolve("data/raw");
const OUT = path.resolve("data/dist");
// package.json is only guaranteed present at build time — bake the version
// into characters.json so the deployed function can read it from dist
const PKG_VERSION: string = JSON.parse(
  await readFile(path.resolve("package.json"), "utf8"),
).version;
const LOCALES: Locale[] = ["ko", "en", "ja", "zh-TW"];

const pad = (n: number, len: number) => String(n).padStart(len, "0");

const BURST_MAP: Record<string, Burst> = {
  Step1: "I",
  Step2: "II",
  Step3: "III",
  AllStep: "All",
};

function images(resourceId: number, skinIndex: number) {
  const rid = pad(resourceId, 3);
  const skin = pad(skinIndex, 2);
  return {
    icon: cdnUrl(`character/si/si_c${rid}_${skin}_s.webp`),
    medium: cdnUrl(`character/mi/mi_c${rid}_${skin}_s.webp`),
    full: cdnUrl(`character/full/c${rid}_${skin}.webp`),
  };
}

const icon = (iconPath: string, name: string) => cdnUrl(`icon/${iconPath}/${name}.webp`);

const GRADE_ICON: Record<string, string> = { SSR: "003", SR: "002", R: "001" };

const skillIcon = (name?: string) =>
  name ? icon("skill/char_skill", name) : undefined;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(RAW, file), "utf8")) as T;
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(path.join(OUT, "tables"), { recursive: true });

  // --- merge character lists across locales ---
  const byId = new Map<number, Nikke>();
  for (const locale of LOCALES) {
    const list = await readJson<RawNikke[]>(`nikke_list_${locale}_v2.json`);
    if (!list) continue;
    for (const r of list) {
      let n = byId.get(r.id);
      if (!n) {
        n = {
          id: r.id,
          resourceId: r.resource_id,
          name: {},
          rarity: r.original_rare,
          class: r.class,
          burst: BURST_MAP[r.use_burst_skill] ?? "I",
          corporation: r.corporation,
          element: r.element_id?.element?.element ?? null,
          weapon: {
            type: r.shot_id?.element?.weapon_type ?? null,
            attackType: r.shot_id?.element?.attack_type ?? null,
            ammo: r.shot_id?.element?.ammo ?? null,
          },
          costumes: (r.costumes ?? []).map((c) => ({
            id: c.id,
            skinIndex: c.costume_index,
            images: images(r.resource_id, c.costume_index),
          })),
          images: images(r.resource_id, 0),
          icons: {
            grade: icon("atlas_common_grade", `ele_grade_icon_${GRADE_ICON[r.original_rare]}`),
            class: icon("atlas_common_class", `icn_class_${r.class.toLowerCase()}`),
            element: r.element_id?.element?.element_icon
              ? icon("atlas_common_class", r.element_id.element.element_icon)
              : undefined,
          },
          skillIcons: {},
        };
        byId.set(r.id, n);
      }
      const name = r.name_localkey?.name;
      if (name) n.name[locale] = name;
      // merge costumes as union — some locales ship empty/partial lists
      for (const c of r.costumes ?? []) {
        if (!n.costumes.some((x) => x.id === c.id)) {
          n.costumes.push({
            id: c.id,
            skinIndex: c.costume_index,
            images: images(r.resource_id, c.costume_index),
          });
        }
      }
    }
  }

  // --- attach skill icons ---
  const skillMap = (await readJson<SkillIconMap[]>("character_skill_map.json")) ?? [];
  const skillByRes = new Map(skillMap.map((s) => [s.resource_id, s]));
  for (const n of byId.values()) {
    const s = skillByRes.get(n.resourceId);
    if (s) {
      n.skillIcons = {
        skill1: skillIcon(s.skill1_icon),
        skill2: skillIcon(s.skill2_icon),
        burst: skillIcon(s.ulti_skill_icon),
      };
    }
  }

  const characters = [...byId.values()].sort((a, b) => a.id - b.id);
  const byRes = new Map(characters.map((c) => [c.resourceId, c]));

  // --- costume names/descriptions from roledata character_costume_list ---
  // nikke_list costumes[] only carry {id, costume_index}; names live in roledata
  const rawFiles = await readdir(RAW);
  const costumeInfo = new Map<
    number,
    {
      resourceId: number;
      costumeIndex: number;
      name: Localized<string>;
      description: Localized<string>;
      grade?: string;
      shopType?: string;
    }
  >();
  for (const f of rawFiles) {
    const m = f.match(/^roledata_(\d+)_(.+)\.json$/);
    if (!m) continue;
    const role = await readJson<RawRoleData>(f);
    for (const cs of role?.character_costume_list ?? []) {
      let e = costumeInfo.get(cs.id);
      if (!e) {
        e = {
          resourceId: Number(m[1]),
          costumeIndex: cs.costume_index,
          name: {},
          description: {},
        };
        costumeInfo.set(cs.id, e);
      }
      const l = m[2] as Locale;
      if (cs.costume_name_locale) e.name[l] = cs.costume_name_locale;
      if (cs.costume_description_locale) e.description[l] = cs.costume_description_locale;
      e.grade ??= cs.costume_grade_id;
      e.shopType ??= cs.costume_shop_type;
    }
  }
  for (const n of characters) {
    for (const c of n.costumes) {
      const info = costumeInfo.get(c.id);
      if (info) {
        c.name = info.name;
        c.description = info.description;
        c.grade = info.grade;
        c.shopType = info.shopType;
      }
    }
  }
  const costumeMap = Object.fromEntries(
    [...costumeInfo.entries()].map(([id, e]) => [
      id,
      {
        resourceId: e.resourceId,
        costumeIndex: e.costumeIndex,
        name: e.name,
        description: e.description,
        grade: e.grade,
      },
    ]),
  );
  await writeFile(path.join(OUT, "costume_map.json"), JSON.stringify(costumeMap));
  console.log(`costume_map.json: ${costumeInfo.size} costumes`);

  const charRef = (resourceId?: number) => {
    const n = resourceId != null ? byRes.get(resourceId) : undefined;
    return n
      ? { id: n.id, resourceId: n.resourceId, name: n.name, rarity: n.rarity, image: n.images.icon }
      : null;
  };
  await writeFile(
    path.join(OUT, "characters.json"),
    JSON.stringify({ count: characters.length, syncedAt: new Date().toISOString(), version: PKG_VERSION, characters }),
  );
  console.log(`characters.json: ${characters.length} nikkes`);

  // --- per-character detail files from roledata ---
  const DETAILS = path.join(OUT, "details");
  await mkdir(DETAILS, { recursive: true });
  let detailCount = 0;
  const favoriteStories = await readFavoriteStories();
  const favoriteStoryOf = new Map(favoriteStories.map((s) => [s.nikke, s]));
  let linkedFavorites = 0;
  for (const n of characters) {
    const detail = await buildDetail(n.resourceId);
    if (detail) {
      const fav = favoriteStoryOf.get(n.name.ko ?? "");
      if (fav) {
        detail.favoriteStory = { sceneGroupId: fav.groupId, name: fav.name, sourceVideo: fav.sourceVideo };
        linkedFavorites++;
      }
      // raw teammate entries -> character refs
      if (Array.isArray(detail.teammateList)) {
        detail.teammateList = (detail.teammateList as any[]).map((t) => ({
          nameCode: t.name_code,
          ...(charRef(t.resource_id) ?? {
            id: t.id,
            resourceId: t.resource_id,
            name: { ko: t.name_localkey },
            rarity: t.original_rare,
          }),
        }));
      }
      await writeFile(path.join(DETAILS, `${n.id}.json`), JSON.stringify(detail));
      detailCount++;
    }
  }
  console.log(`details/: ${detailCount} character detail files`);
  // a renamed character would otherwise silently lose its story link
  if (linkedFavorites !== favoriteStories.length) {
    const names = new Set(characters.map((n) => n.name.ko));
    const missing = favoriteStories.filter((s) => !names.has(s.nikke)).map((s) => s.nikke);
    throw new Error(`favorite stories without a character: ${missing.join(", ")}`);
  }

  // --- name_code / avatar-id → character maps (for shared-profile lookups) ---
  const idMap: { name_code: number; id: number; resource_id: number }[] = JSON.parse(
    await readFile(path.join(RAW, "character_id_map.json"), "utf8"),
  );
  const nameCodeMap: Record<number, number> = {};
  for (const e of idMap) nameCodeMap[e.name_code] ??= e.resource_id;
  await writeFile(path.join(OUT, "name_code_map.json"), JSON.stringify(nameCodeMap));
  const avatarMap: Record<number, { resourceId: number; costumeIndex: number }> = {};
  const avatars: { id: number; resource_id: number; costume_index: number }[] = JSON.parse(
    await readFile(path.join(RAW, "character_avatar_map.json"), "utf8"),
  );
  for (const a of avatars) avatarMap[a.id] = { resourceId: a.resource_id, costumeIndex: a.costume_index };
  await writeFile(path.join(OUT, "avatar_map.json"), JSON.stringify(avatarMap));

  // --- equipment item map (tid → localized name/icon), for profile lookups ---
  const equipTables = await Promise.all(
    LOCALES.map((l) => readJson<any>(`ItemEquipTable_${l}.json`)),
  );
  const equipItemMap: Record<number, {
    name: Partial<Record<Locale, string>>;
    class?: string; rare?: string; slot?: string; icon?: string;
  }> = {};
  // chest gear resource ids use "body" (not "torso")
  const slotOf = (rid?: string) =>
    rid?.match(/icn_equipment_(head|body|arm|leg)_/)?.[1];
  for (const [li, tbl] of equipTables.entries()) {
    for (const r of tbl?.records ?? []) {
      const e = (equipItemMap[r.id] ??= { name: {} });
      if (r.name_localkey) e.name[LOCALES[li]] = r.name_localkey;
      e.class ??= r.class;
      e.rare ??= r.item_rare;
      e.slot ??= slotOf(r.resource_id);
      e.icon ??= r.resource_id ? icon("equip", r.resource_id) : undefined;
    }
  }
  await writeFile(path.join(OUT, "equip_item_map.json"), JSON.stringify(equipItemMap));

  // --- equipment option map (option id → group name + rank) ---
  const optTables = await Promise.all(
    LOCALES.map((l) => readJson<any>(`equip_option_table_${l}.json`)),
  );
  // one option kind spans 3 group rows (15 ids); rank is 1-15 across the
  // whole state_effect_group_id family, not 1-5 within a single group
  const optFamilies = new Map<number, number[]>();
  for (const g of optTables.find(Boolean) ?? []) {
    const fam = g.state_effect_group_id ?? g.id;
    const arr = optFamilies.get(fam) ?? [];
    for (const oid of g.state_effect_id_list ?? []) arr.push(oid);
    optFamilies.set(fam, arr);
  }
  const optRank = new Map<number, { groupId: number; rank: number }>();
  for (const [fam, ids] of optFamilies) {
    ids.forEach((oid, i) => optRank.set(oid, { groupId: fam, rank: i + 1 }));
  }
  const equipOptionMap: Record<number, {
    groupId: number; rank: number; name: Partial<Record<Locale, string>>;
  }> = {};
  for (const [li, tbl] of optTables.entries()) {
    for (const g of tbl ?? []) {
      for (const oid of g.state_effect_id_list ?? []) {
        const r = optRank.get(oid);
        const e = (equipOptionMap[oid] ??= {
          groupId: r?.groupId ?? g.id, rank: r?.rank ?? 0, name: {},
        });
        if (g.description_localkey) e.name[LOCALES[li]] = g.description_localkey;
      }
    }
  }
  await writeFile(path.join(OUT, "equip_option_map.json"), JSON.stringify(equipOptionMap));

  // --- copy remaining tables verbatim ---
  const skip = (f: string) =>
    f.startsWith("nikke_list_") ||
    f.startsWith("roledata_") ||
    /^scene_(d_|event_)/.test(f) ||
    f.startsWith("attract_") ||
    f.startsWith("voice_map_") ||
    /^favorite_\d+_/.test(f) ||
    /^cube_\d+_/.test(f);
  let copied = 0;
  for (const f of rawFiles) {
    if (skip(f)) continue;
    await copyFile(path.join(RAW, f), path.join(OUT, "tables", f));
    copied++;
  }
  console.log(`tables: ${copied} files -> data/dist/tables/`);

  // --- normalize ko scene dialogue files ---
  const SCENES = path.join(OUT, "scenes");
  await mkdir(SCENES, { recursive: true });
  // attractive scenario metadata: gid -> { title, level, nikke }
  const attractMeta = new Map<string, { title?: string; level?: number; nikke?: string }>();
  for (const f of rawFiles.filter((f) => f.startsWith("roledata_") && f.endsWith("_ko.json"))) {
    const r = JSON.parse(await readFile(path.join(RAW, f), "utf8"));
    for (const s of r.attractive_scenario_list ?? []) {
      const gid: string | undefined = s.attractive_scenario_group_id;
      if (gid) {
        attractMeta.set(gid, {
          title: s.scenario_title_locale,
          level: s.attractive_level,
          nikke: r.name_localkey,
        });
      }
    }
  }

  // speaker code -> resource_id (covers NPCs too, e.g. marian -> 13)
  const speakerResources = new Map<string, number>();
  try {
    const list = JSON.parse(await readFile(path.join(RAW, "scene_characeter_list_v2.json"), "utf8")) as {
      id: string;
      resource_id: number;
    }[];
    for (const s of list) speakerResources.set(s.id, s.resource_id);
  } catch { /* missing map */ }
  const speakerIcon = (code: string | undefined, rid: number | undefined) => {
    const r = rid ?? (code ? speakerResources.get(code) : undefined);
    return r ? images(r, 0).icon : undefined;
  };
  // per-chapter voice maps: d_main_NN -> set of speech ids that have voice audio
  const voiceMaps = new Map<string, Set<string>>();
  for (const f of rawFiles.filter((f) => f.startsWith("voice_map_"))) {
    const key = f.replace(/^voice_map_|\.json$/g, "");
    voiceMaps.set(key, new Set(JSON.parse(await readFile(path.join(RAW, f), "utf8"))));
  }
  const voiceUrl = (gid: string, id: string | undefined) =>
    id && voiceMaps.get(gid.match(/d_main_\d+/)?.[0] ?? gid)?.has(id)
      ? cdnUrl(`voice/ko/${id}.mp3`)
      : null;

  // scene-group provenance — same union of ko list files sync.ts scans to
  // discover scene_detail downloads. First match wins, so scene_archive_list
  // only labels groups exclusive to it (collab events like event_ce004).
  const sceneSource = new Map<string, string>();
  for (const f of [
    "scene_list_ko.json",
    "sudden_list_ko.json",
    "archive_list_ko.json",
    "scene_archive_list_ko.json",
  ]) {
    try {
      const raw = await readFile(path.join(RAW, f), "utf8");
      for (const m of raw.matchAll(/"scenario_group_id"\s*:\s*"([^"]+)"/g)) {
        if (!sceneSource.has(m[1])) sceneSource.set(m[1], f.replace(/_ko\.json$/, ""));
      }
    } catch { /* list file missing */ }
  }

  const sceneIndex: {
    groupId: string;
    name?: string;
    lines: number;
    category: string;
    type?: string;
    nikke?: string;
    level?: number;
    chapter?: number;
    chapterStep?: number;
    source?: string;
    sourceVideo?: string;
  }[] = [];
  const mainChapter = mainChaptersFromList((await readJson<any[]>("scene_list_ko.json")) ?? []);
  const sceneCategory = (gid: string) =>
    gid.startsWith("d_main") ? "main"
    : gid.startsWith("event_") ? "event"
    : gid.startsWith("d_nikke") ? "attractive"
    : gid.startsWith("d_ex") ? "sudden"
    : "etc";

  // aggregated line index — /api/lines and appearances load one shard file
  // per category instead of one fetch per scene. [speakerIdx, text] tuples
  // with per-scene speaker dedup keep shards ~90% smaller than the full
  // scene files (which carry ids/icons/voice per line)
  const lineIndex = new Map<string, Record<string, { sp: string[]; l: [number, string][] }>>();
  const addLines = (
    gid: string,
    cat: string,
    lines: { speakerName?: string; speaker?: string; text?: string }[],
  ) => {
    const bucket = lineIndex.get(cat) ?? {};
    const sp: string[] = [];
    const spIdx = new Map<string, number>();
    bucket[gid] = {
      sp,
      l: lines.map((r): [number, string] => {
        const s = r.speakerName ?? r.speaker ?? "";
        let i = spIdx.get(s);
        if (i === undefined) {
          i = sp.length;
          sp.push(s);
          spIdx.set(s, i);
        }
        return [i, r.text ?? ""];
      }),
    };
    lineIndex.set(cat, bucket);
  };

  for (const f of rawFiles.filter((f) => /^scene_(d_|event_)/.test(f))) {
    const d = JSON.parse(await readFile(path.join(RAW, f), "utf8"));
    const gid = d.scenario_group_id?.value ?? f.replace(/^scene_|\.json$/g, "");
    const records = d.scenario_group_id?.records?.value ?? [];
    const lines = records.map((r: any) => ({
      id: r.value?.id,
      speaker: r.value?.speaker,
      speakerName: r.speaker?.name_localkey?.character_name ?? r.value?.speaker,
      text: r.quest_name,
      window: r.value?.speech_window,
      speakerIcon: speakerIcon(r.value?.speaker, undefined),
      voice: voiceUrl(gid, r.value?.id),
    }));
    await writeFile(
      path.join(SCENES, `${gid}.json`),
      JSON.stringify({ id: d.id, groupId: gid, name: d.scene_name, lines }),
    );
    sceneIndex.push({ groupId: gid, name: d.scene_name, lines: lines.length, category: sceneCategory(gid), source: sceneSource.get(gid), ...mainChapter.get(gid) });
    addLines(gid, sceneCategory(gid), lines);
  }

  // --- normalize ko attractive (호감도) dialogue files ---
  for (const f of rawFiles.filter((f) => f.startsWith("attract_") && f.endsWith(".json"))) {
    const d = JSON.parse(await readFile(path.join(RAW, f), "utf8"));
    const gid = f.replace(/^attract_|\.json$/g, "");
    const meta = attractMeta.get(gid);
    const records = Array.isArray(d.records) ? d.records : [];
    const lines = records.map((r: any) => ({
      id: r.id,
      speaker: r.speaker,
      speakerName: r.speaker_detail?.name_localkey ?? r.speaker,
      text: r.scenario_localkey,
      window: r.speech_window,
      background: r.set_background,
      bgm: r.play_bgm,
      speakerIcon: speakerIcon(r.speaker, r.speaker_detail?.resource_id),
      voice: voiceUrl(gid, r.id),
    }));
    await writeFile(
      path.join(SCENES, `${gid}.json`),
      JSON.stringify({
        groupId: gid,
        type: "attractive",
        name: meta?.title,
        nikke: meta?.nikke,
        attractiveLevel: meta?.level,
        lines,
      }),
    );
    sceneIndex.push({
      groupId: gid,
      name: meta?.title,
      lines: lines.length,
      category: "attractive",
      type: "attractive",
      nikke: meta?.nikke,
      level: meta?.level,
    });
    addLines(gid, "attractive", lines);
  }

  // --- 애장품 scripts kept in the repo (not in the game data) ---
  for (const scene of favoriteStories) {
    const lines = scene.lines.map((l) => ({ ...l, speakerIcon: speakerIcon(l.speaker, undefined) }));
    await writeFile(path.join(SCENES, `${scene.groupId}.json`), JSON.stringify({ ...scene, lines }));
    sceneIndex.push({
      groupId: scene.groupId,
      name: scene.name,
      lines: lines.length,
      category: "favorite",
      type: "favorite",
      nikke: scene.nikke,
      sourceVideo: scene.sourceVideo,
    });
    addLines(scene.groupId, "favorite", lines);
  }
  // the story route only sees main scenes with a chapter
  const unfiled = sceneIndex.filter((s) => s.category === "main" && s.chapter == null).map((s) => s.groupId);
  if (unfiled.length) console.log(`warn: main scenes not in scene_list: ${unfiled.join(", ")}`);
  await writeFile(path.join(OUT, "scenes.json"), JSON.stringify(sceneIndex));
  console.log(`scenes/: ${sceneIndex.length} dialogue files (ko)`);

  const LINES = path.join(OUT, "lines");
  await mkdir(LINES, { recursive: true });
  for (const [cat, bucket] of lineIndex) {
    await writeFile(path.join(LINES, `${cat}.json`), JSON.stringify(bucket));
  }
  console.log(`lines/: ${[...lineIndex.keys()].join(", ")} shards`);

  // --- events.json — event_* scenes grouped per story event, with titles ---
  // Titles aren't in the upstream data (only Locale_Event localkeys), so they
  // come from the curated scripts/event-titles.json with a slug fallback.
  let eventOverrides: Record<string, string> = {};
  try {
    eventOverrides = JSON.parse(
      await readFile(path.resolve("scripts/event-titles.json"), "utf8"),
    );
  } catch { /* no overrides file */ }
  const ROMAN = ["I", "II", "III", "IV", "V"];
  const prettify = (id: string) => {
    const s = id.replace(/^event_/, "");
    const m = s.match(/^(.*?)(\d+)$/);
    const base = (m ? m[1] : s).replace(/_/g, " ").toUpperCase();
    return m ? `${base} ${ROMAN[Number(m[2]) - 1] ?? m[2]}` : base;
  };
  const eventTitle = (id: string) => eventOverrides[id] ?? prettify(id);
  const eventMap = new Map<
    string,
    { id: string; title: string; episodes: number; totalLines: number; scenes: string[]; source?: string }
  >();
  for (const s of sceneIndex.filter((x) => x.category === "event")) {
    const id = eventIdOf(s.groupId);
    let e = eventMap.get(id);
    if (!e) {
      e = { id, title: eventTitle(id), episodes: 0, totalLines: 0, scenes: [] };
      eventMap.set(id, e);
    }
    e.episodes++;
    e.totalLines += s.lines;
    e.scenes.push(s.groupId);
    if (s.source) e.source = s.source;
  }
  const events = [...eventMap.values()].map((e) => ({
    ...e,
    scenes: e.scenes.sort(compareEventScenes),
  }));
  await writeFile(path.join(OUT, "events.json"), JSON.stringify(events));
  console.log(`events.json: ${events.length} events`);

  // --- normalize favorite (소장품) item files ---
  const FAVS = path.join(OUT, "favorites");
  await mkdir(FAVS, { recursive: true });
  const favIds = [
    ...new Set(
      rawFiles
        .filter((f) => /^favorite_\d+_ko\.json$/.test(f))
        .map((f) => f.replace(/^favorite_(\d+)_ko\.json$/, "$1")),
    ),
  ];
  const favIndex: {
    id: number;
    rare?: string;
    name: Partial<Record<Locale, string>>;
    weaponType?: string;
  }[] = [];

  // description_value_list -> per-locale skill render, same placeholder scheme as nikke skills
  const favSkill = (kind: string, entry: any, localeFiles: any[]) => {
    const info = kind === "item" ? entry?.info : entry;
    if (!info) return null;
    const name: Partial<Record<Locale, string>> = {};
    const descriptionTemplate: Partial<Record<Locale, string>> = {};
    const descriptions: Partial<Record<Locale, string>> = {};
    const infoLabel: Partial<Record<Locale, string>> = {};
    let values: (string[] | null)[] = [];
    localeFiles.forEach((r, i) => {
      const l = LOCALES[i];
      const list = (kind === "item" ? r?.favoriteitem_skill_group_data : r?.collection_skill_group_data) ?? [];
      const e = list.find((x: any) => (kind === "item" ? x.info?.id : x.id) === info.id);
      const ei = kind === "item" ? e?.info : e;
      if (!ei) return;
      const v = (ei.description_value_list ?? []).map((x: any) => x.description_value ?? null);
      if (v.length > values.length) values = v;
      if (ei.name_localkey) name[l] = ei.name_localkey;
      if (ei.info_description_localkey) infoLabel[l] = ei.info_description_localkey;
      if (ei.description_localkey) {
        descriptionTemplate[l] = ei.description_localkey;
        const maxLv = Math.max(Math.max(...v.map((x: any) => x?.length ?? 0)) - 1, 0);
        descriptions[l] = renderDescription(ei.description_localkey, v, maxLv);
      }
    });
    return {
      kind,
      slot: kind === "item" ? entry.skill_change_slot : undefined,
      unlocksAt: kind === "item" ? entry.skill_change_slot : undefined,
      id: info.id,
      groupId: info.group_id,
      icon: skillIcon(info.icon),
      infoLabel,
      name,
      descriptionTemplate,
      descriptions,
      values,
    };
  };

  for (const idStr of favIds) {
    const files = await Promise.all(
      LOCALES.map((l) => readJson<any>(`favorite_${idStr}_${l}.json`)),
    );
    const first = files.find(Boolean);
    if (!first) continue;
    const id = Number(idStr);
    const name: Partial<Record<Locale, string>> = {};
    const description: Partial<Record<Locale, string>> = {};
    files.forEach((r, i) => {
      if (!r) return;
      const l = LOCALES[i];
      if (r.name_localkey) name[l] = r.name_localkey;
      if (r.description_localkey) description[l] = r.description_localkey;
    });
    const stats = first.atk.map((_: number, i: number) => ({
      level: i + 1,
      atk: first.atk[i],
      def: first.def[i],
      hp: first.hp[i],
      power: first.powers?.[i],
      grade: first.grade?.[i],
      collectionSkillLevel: first.level1?.[i],
      itemSkillLevel: first.level2?.[i],
    }));
    const skills = [
      ...(first.collection_skill_group_data ?? []).map((e: any) => favSkill("collection", e, files)),
      ...(first.favoriteitem_skill_group_data ?? []).map((e: any) => favSkill("item", e, files)),
    ]
      .filter(Boolean)
      .sort((a: any, b: any) => (a.unlocksAt ?? 0) - (b.unlocksAt ?? 0));
    const item = {
      id,
      nameCode: first.name_code,
      character: charRef(nameCodeMap[first.name_code]) ?? undefined,
      rare: first.favorite_rare,
      type: first.favorite_type,
      weaponType: first.weapon_type,
      maxLevel: first.max_level,
      name,
      description,
      images: {
        icon: first.icon_resource_id
          ? cdnUrl(`icon/favoriteitem/${first.icon_resource_id}.webp`)
          : undefined,
        prop: first.prop_resource_id
          ? cdnUrl(`icon/favoriteitem/${first.prop_resource_id}.webp`)
          : undefined,
      },
      stats,
      skills,
    };
    await writeFile(path.join(FAVS, `${id}.json`), JSON.stringify(item));
    favIndex.push({
      id,
      rare: first.favorite_rare,
      name,
      weaponType: first.weapon_type,
    });
  }
  favIndex.sort((a, b) => a.id - b.id);
  await writeFile(path.join(OUT, "favorites.json"), JSON.stringify(favIndex));
  console.log(`favorites/: ${favIndex.length} items`);

  // --- normalize harmony cube files ---
  const CUBES = path.join(OUT, "cubes");
  await mkdir(CUBES, { recursive: true });
  const cubeIds = [
    ...new Set(
      rawFiles
        .filter((f) => /^cube_\d+_ko\.json$/.test(f))
        .map((f) => f.replace(/^cube_(\d+)_ko\.json$/, "$1")),
    ),
  ];
  const cubeIndex: { id: number; name: Partial<Record<Locale, string>>; rare?: string }[] = [];
  for (const idStr of cubeIds) {
    const files = await Promise.all(LOCALES.map((l) => readJson<any>(`cube_${idStr}_${l}.json`)));
    const first = files.find(Boolean);
    if (!first) continue;
    const id = Number(idStr);
    const name: Partial<Record<Locale, string>> = {};
    const description: Partial<Record<Locale, string>> = {};
    const location: Partial<Record<Locale, string>> = {};
    files.forEach((r, i) => {
      if (!r) return;
      const l = LOCALES[i];
      if (r.name_localkey) name[l] = r.name_localkey;
      if (r.description_localkey) description[l] = r.description_localkey;
      if (r.location_localkey) location[l] = r.location_localkey;
    });
    // group per-level skill entries by group_id, merge locales
    const skillGroups = new Map<number, any[]>();
    for (const r of files) {
      for (const e of (r?.harmonycube_skill_group ?? []).filter(Boolean)) {
        const arr = skillGroups.get(e.group_id) ?? [];
        if (!arr.some((x) => x.skill_level === e.skill_level)) arr.push(e);
        skillGroups.set(e.group_id, arr);
      }
    }
    const skills = [...skillGroups.entries()].map(([groupId, entries]) => {
      const sName: Partial<Record<Locale, string>> = {};
      const descTemplate: Partial<Record<Locale, string>> = {};
      const descs: Partial<Record<Locale, string>> = {};
      let values: (string[] | null)[] = [];
      entries.sort((a, b) => a.skill_level - b.skill_level);
      for (const e of entries) {
        const v = (e.description_value_list ?? []).map((x: any) => x.description_value ?? null);
        if (v.length > values.length) values = v;
      }
      files.forEach((r, i) => {
        const l = LOCALES[i];
        const top = (r?.harmonycube_skill_group ?? [])
          .filter((e: any) => e && e.group_id === groupId)
          .sort((a: any, b: any) => b.skill_level - a.skill_level)[0];
        if (!top) return;
        if (top.name_localkey) sName[l] = top.name_localkey;
        if (top.description_localkey) {
          descTemplate[l] = top.description_localkey;
          const v = (top.description_value_list ?? []).map((x: any) => x.description_value ?? null);
          const maxLv = Math.max(Math.max(...v.map((x: any) => x?.length ?? 0)) - 1, 0);
          descs[l] = renderDescription(top.description_localkey, v, maxLv);
        }
      });
      const anyEntry = entries[entries.length - 1];
      return {
        id: groupId,
        maxLevel: entries.length,
        icon: anyEntry?.icon ? skillIcon(anyEntry.icon) : undefined,
        name: sName,
        descriptionTemplate: descTemplate,
        descriptions: descs,
        values,
      };
    });
    const stats = (first.atk ?? []).map((_: number, i: number) => ({
      level: i + 1,
      atk: first.atk[i],
      def: first.def?.[i],
      hp: first.hp?.[i],
      power: first.powers?.[i],
      skillLevels: [first.level1?.[i], first.level2?.[i], first.level3?.[i]],
    }));
    await writeFile(
      path.join(CUBES, `${id}.json`),
      JSON.stringify({
        id,
        name,
        description,
        location,
        rare: first.item_rare,
        class: first.class,
        order: first.order,
        bg: first.bg,
        bgColor: first.bg_color,
        stats,
        skills,
      }),
    );
    cubeIndex.push({ id, name, rare: first.item_rare });
  }
  cubeIndex.sort((a, b) => a.id - b.id);
  await writeFile(path.join(OUT, "cubes.json"), JSON.stringify(cubeIndex));
  console.log(`cubes/: ${cubeIndex.length} items`);
}

// strip <color=#...>, <word_group=NNN>..</..> etc, keep inner text
const stripMarkup = (s: string) => s.replace(/<\/?[a-z_]+[^>]*>/gi, "");

function renderDescription(template: string, values: Skill["values"], level: number): string {
  const rendered = template.replace(/\{description_value_(\d+)\}/g, (_, n) => {
    const slot = values[Number(n) - 1];
    return slot?.[level] ?? "";
  });
  return stripMarkup(rendered).trim();
}

function mergeSkill(
  slot: Skill["slot"],
  details: (RawRoleData | null)[],
  pick: (r: RawRoleData) => RawSkillDetail | undefined,
): Skill | null {
  const name: Skill["name"] = {};
  const descriptionTemplate: Skill["descriptionTemplate"] = {};
  const descriptions: Skill["descriptions"] = {};
  let id: number | undefined;
  let iconName: string | undefined;
  let cooltime: number[] | undefined;
  let values: Skill["values"] = [];
  LOCALES.forEach((locale, i) => {
    const r = details[i];
    const s = r ? pick(r) : undefined;
    if (!s) return;
    id ??= s.id;
    iconName ??= s.icon;
    const raw = s.skill_cooltime_list ?? (s.skill_cooltime != null ? [s.skill_cooltime] : undefined);
    cooltime ??= raw?.map((v) => v / 100);
    if (s.name_localkey) name[locale] = s.name_localkey;
    const v = s.description_value_list ?? [];
    if (v.length > values.length) {
      values = v.map((x) => x.description_value ?? null);
    }
    if (s.description_localkey) {
      descriptionTemplate[locale] = s.description_localkey;
      const vals = v.map((x) => x.description_value ?? null);
      const maxLv = Math.max(Math.max(...vals.map((x) => x?.length ?? 0)) - 1, 0);
      descriptions[locale] = renderDescription(s.description_localkey, vals, maxLv);
    }
  });
  if (!Object.keys(name).length && !id) return null;
  return { slot, id, icon: iconName ? skillIcon(iconName) : undefined, name, descriptionTemplate, descriptions, cooltime, values };
}

function mergeAttractiveScenarios(
  roles: (RawRoleData | null)[],
): NikkeDetail["attractiveScenarios"] {
  const byId = new Map<number, NonNullable<NikkeDetail["attractiveScenarios"]>[number]>();
  roles.forEach((r, i) => {
    if (!r) return;
    const l = LOCALES[i];
    for (const s of r.attractive_scenario_list ?? []) {
      let e = byId.get(s.id);
      if (!e) {
        e = {
          id: s.id,
          sceneGroupId: s.attractive_scenario_group_id,
          level: s.attractive_level,
          title: {},
          costumeTid: s.costume || null,
          rewardId: s.reward_id,
        };
        byId.set(s.id, e);
      }
      if (s.scenario_title_locale) e.title[l] = s.scenario_title_locale;
    }
  });
  return [...byId.values()].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
}

// per-character weapon spec — shot ids are unique per character except a
// few shared weapons. Times come in /100 s and damage-type values /100 %,
// so they're normalized like the combat block; burst energies stay raw
// (gauge units, ÷10000 → %).
function buildShot(roles: (RawRoleData | null)[]): NikkeDetail["shot"] {
  const name: Partial<Record<Locale, string>> = {};
  const descriptionTemplate: Partial<Record<Locale, string>> = {};
  let first: RawRoleData["shot_detail"] | undefined;
  roles.forEach((r, i) => {
    const s = r?.shot_detail;
    if (!s) return;
    first ??= s;
    const l = LOCALES[i];
    if (s.name_localkey) name[l] = s.name_localkey;
    if (s.description_localkey) descriptionTemplate[l] = s.description_localkey;
  });
  if (!first) return undefined;
  const s = first;
  const sec = (v?: number) => (v != null ? v / 100 : undefined);
  const pct = (v?: number) => (v != null ? v / 100 : undefined);
  return {
    id: s.id,
    weaponType: s.weapon_type,
    attackType: s.attack_type,
    counterElement: s.counter_enermy,
    name,
    descriptionTemplate,
    damage: pct(s.damage),
    shotCount: s.shot_count,
    muzzleCount: s.muzzle_count,
    multiTargetCount: s.multi_target_count,
    centerShotCount: s.center_shot_count,
    maxAmmo: s.max_ammo,
    reloadTime: sec(s.reload_time),
    reloadBullet: s.reload_bullet,
    reloadStartAmmo: s.reload_start_ammo,
    rateOfFire: s.rate_of_fire,
    endRateOfFire: s.end_rate_of_fire,
    rateOfFireChangePershot: s.rate_of_fire_change_pershot,
    rateOfFireResetTime: sec(s.rate_of_fire_reset_time),
    burstEnergyPershot: s.burst_energy_pershot,
    targetBurstEnergyPershot: s.target_burst_energy_pershot,
    chargeTime: sec(s.charge_time),
    fullChargeDamage: pct(s.full_charge_damage),
    fullChargeBurstEnergy: s.full_charge_burst_energy,
    coreDamageRate: pct(s.core_damage_rate),
    penetration: s.penetration,
    preferTarget: s.prefer_target,
    preferTargetCondition: s.prefer_target_condition,
    shotTiming: s.shot_timing,
    fireType: s.fire_type,
    inputType: s.input_type,
    maintainFireStance: s.maintain_fire_stance,
    fireTiming: s.fire_timing,
    accuracyCircle: {
      start: s.start_accuracy_circle_scale,
      end: s.end_accuracy_circle_scale,
      changePershot: s.accuracy_change_pershot,
      changeSpeed: s.accuracy_change_speed,
      autoStart: s.auto_start_accuracy_circle_scale,
      autoEnd: s.auto_end_accuracy_circle_scale,
      autoChangePershot: s.auto_accuracy_change_pershot,
      autoChangeSpeed: s.auto_accuracy_change_speed,
    },
    zoomRate: s.zoom_rate,
    multiAimRange: s.multi_aim_range,
    spotFirstDelay: sec(s.spot_first_delay),
    spotLastDelay: sec(s.spot_last_delay),
    spotProjectileSpeed: s.spot_projectile_speed,
    spotRadius: s.spot_radius,
    spotRadiusObject: s.spot_radius_object,
    spotExplosionRange: s.spot_explosion_range,
  };
}

async function buildDetail(resourceId: number): Promise<NikkeDetail | null> {
  const roles = await Promise.all(
    LOCALES.map((l) => readJson<RawRoleData>(`roledata_${resourceId}_${l}.json`)),
  );
  const first = roles.find(Boolean);
  if (!first) return null;

  const backstory: NikkeDetail["backstory"] = {};
  const squadName: Partial<Record<Locale, string>> = {};
  const squadDesc: Partial<Record<Locale, string>> = {};
  roles.forEach((r, i) => {
    if (!r) return;
    const l = LOCALES[i];
    if (r.description_localkey) backstory[l] = r.description_localkey;
    if (r.squad_detail?.squad_name) squadName[l] = r.squad_detail.squad_name;
    if (r.squad_detail?.squad_description) squadDesc[l] = r.squad_detail.squad_description;
  });

  const skills = [
    mergeSkill("skill1", roles, (r) => r.skill1_detail),
    mergeSkill("skill2", roles, (r) => r.skill2_detail),
    mergeSkill("burst", roles, (r) => r.ulti_skill_detail),
  ].filter((s): s is Skill => s !== null);

  // character voice lines — audio exists for ko/en/ja only. Speech groups
  // are bound to costumes via dialog_group_list (0 = base appearance).
  const groupCostume = new Map<number, number>();
  for (const r of roles) {
    for (const g of r?.dialog_group_list ?? []) {
      if (g.id != null) groupCostume.set(g.id, g.costume_index ?? 0);
    }
  }
  const voiceById = new Map<number, NonNullable<NikkeDetail["voices"]>[number]>();
  roles.forEach((r, i) => {
    if (!r) return;
    const l = LOCALES[i];
    for (const v of r.character_dialog_group_list ?? []) {
      let e = voiceById.get(v.id);
      if (!e) {
        e = {
          id: v.id,
          costumeIndex: v.speech_group_id != null ? groupCostume.get(v.speech_group_id) : undefined,
          categoryGroup: v.category_group,
          order: v.order,
          isTeaser: v.is_teaser,
          conditionAttractiveLevel: v.condition_attractive_level,
          speechId: v.speech_id,
          label: {},
          text: {},
          voice: v.speech_id
            ? Object.fromEntries(
                (["ko", "en", "ja"] as const).map((lang) => [
                  lang,
                  cdnUrl(`voice/${lang}/${v.speech_id}.mp3`),
                ]),
              )
            : {},
        };
        voiceById.set(v.id, e);
      }
      if (v.voice_description) e.label[l] = v.voice_description;
      if (v.speech_localkey) e.text[l] = v.speech_localkey;
    }
  });
  const voices = [...voiceById.values()].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  return {
    backstory,
    squad: first.squad_detail
      ? {
          id: first.squad_detail.id,
          key: first.squad_detail.squad,
          iconResource: first.squad_detail.resource_id,
          name: squadName,
          description: squadDesc,
        }
      : undefined,
    cv: {
      ko: first.cv_localkey_ko || first.cv_localkey || undefined,
      ja: first.cv_localkey_ja || undefined,
      en: first.cv_localkey_en || undefined,
    },
    combat: {
      criticalRatio: first.critical_ratio != null ? `${first.critical_ratio / 100}%` : undefined,
      criticalDamage: first.critical_damage != null ? `${first.critical_damage / 100}%` : undefined,
      bonusRangeMin: first.bonusrange_min,
      bonusRangeMax: first.bonusrange_max,
      burstApplyDelay: first.burst_apply_delay != null ? first.burst_apply_delay / 100 : undefined,
      burstDuration: first.burst_duration != null ? first.burst_duration / 100 : undefined,
      changeBurstStep: first.change_burst_step,
    },
    skills,
    statsPerLevel: {
      attack: first.character_level_attack_list,
      defence: first.character_level_defence_list,
      hp: first.character_level_hp_list,
    },
    teammateList: first.teammate_list,
    // merged across locales; attractive_scenario_group_id IS the scene
    // groupId — files live at scenes/<gid>.json served by /api/scenes/:groupId
    attractiveScenarios: mergeAttractiveScenarios(roles),
    voices: voices.length ? voices : undefined,
    shot: buildShot(roles),
  };
}

main();
