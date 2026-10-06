import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cacheHeaders } from "./cache.js";
import { cdnUrl } from "./cdn.js";
import { fieldsOf, LOCALES, localize, pickFields } from "./fields.js";
import { decodeOpenid, gameApi, playerInfo } from "./blabla.js";
import { openapi } from "./openapi.js";
import type { Nikke } from "./types.js";

const DIST = path.resolve(process.env.NIKKE_DATA_DIR ?? "data/dist");

interface CharacterData {
  count: number;
  syncedAt: string;
  version?: string;
  characters: Nikke[];
}

const characterData: CharacterData = JSON.parse(
  await readFile(path.join(DIST, "characters.json"), "utf8"),
);
const characters = characterData.characters;
const byId = new Map(characters.map((c) => [c.id, c]));
const byResourceId = new Map(characters.map((c) => [c.resourceId, c]));
const detailCache = new Map<number, unknown>();

async function getDetail(id: number): Promise<unknown | null> {
  if (detailCache.has(id)) return detailCache.get(id);
  try {
    const d = JSON.parse(await readFile(path.join(DIST, "details", `${id}.json`), "utf8"));
    detailCache.set(id, d);
    return d;
  } catch {
    detailCache.set(id, null);
    return null;
  }
}

async function withDetail(n: Nikke): Promise<unknown> {
  const details = await getDetail(n.id);
  return details ? { ...n, details } : n;
}

interface SceneIndexEntry {
  groupId: string;
  name?: string;
  lines: number;
  category?: string;
  nikke?: string;
}

interface FavoriteIndexEntry {
  id: number;
  rare?: string;
  name: Record<string, string>;
  weaponType?: string;
}

// index files are immutable per deployment — parse once, reuse across requests
function lazyIndex<T>(file: string): () => Promise<T[]> {
  let cached: Promise<T[]> | undefined;
  return () =>
    (cached ??= readFile(path.join(DIST, file), "utf8")
      .then((raw) => JSON.parse(raw) as T[])
      .catch(() => []));
}

const getScenes = lazyIndex<SceneIndexEntry>("scenes.json");
const getFavorites = lazyIndex<FavoriteIndexEntry>("favorites.json");
const getCubes = lazyIndex<{ id: number; rare?: string; name: Record<string, string> }>(
  "cubes.json",
);

const norm = (s: string) => s.toLowerCase().replace(/[\s:_\-·]/g, "");

// ?page=N (1-based) or ?offset=N paging — page wins when both are given.
// page without limit defaults to a 50-item page size; the 500 cap applies
// only to an explicit ?limit= — no params at all returns the full list.
// Non-integer or out-of-range values are rejected so typos don't silently
// widen results. Exported for tests.
export function resolvePaging(
  qs: { page?: string; limit?: string; offset?: string },
  total: number,
) {
  const num = (v?: string) => (v == null || v === "" ? undefined : Number(v));
  const page = num(qs.page);
  const limit = num(qs.limit);
  const offset = num(qs.offset);
  for (const [k, v] of Object.entries({ page, limit, offset })) {
    if (v !== undefined && (!Number.isInteger(v) || v < 0 || (k === "page" && v < 1))) {
      return { error: `invalid ${k}` } as const;
    }
  }
  const lim = limit ? Math.min(limit, 500) : page ? 50 : total;
  const off = page ? (page - 1) * lim : (offset ?? 0);
  return { off, lim, page: page ?? 0 };
}

function pageQuery(c: Context, total: number) {
  return resolvePaging(
    { page: c.req.query("page"), limit: c.req.query("limit"), offset: c.req.query("offset") },
    total,
  );
}

// --- profile normalization helpers ---
let nameCodeMap: Record<string, number> | null = null;
let avatarMap: Record<string, { resourceId: number; costumeIndex: number }> | null = null;
let favNameMap: Map<number, Record<string, string>> | null = null;
let cubeNameMap: Map<number, { name: Record<string, string>; rare?: string }> | null = null;
let equipItemMap: Record<string, {
  name: Record<string, string>; class?: string; rare?: string; slot?: string; icon?: string;
}> | null = null;
let equipOptionMap: Record<string, {
  groupId: number; rank: number; name: Record<string, string>;
}> | null = null;
let stageMap: Map<number, { chapter: number; mode: string; name: string }> | null = null;
let recycleMap: Map<number, { type?: string; subType?: string }> | null = null;

// costume id → character + costume (built from the character list)
const costumeOwner = new Map<number, { nikke: Nikke; costume: Nikke["costumes"][number] }>();
for (const n of characters) {
  for (const co of n.costumes) costumeOwner.set(co.id, { nikke: n, costume: co });
}

async function loadDistJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(DIST, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function loadNameCodeMap() {
  nameCodeMap ??= await loadDistJson("name_code_map.json", {});
  avatarMap ??= await loadDistJson("avatar_map.json", {});
  return nameCodeMap;
}

async function loadFavNames() {
  if (!favNameMap) {
    favNameMap = new Map();
    try {
      const list = JSON.parse(await readFile(path.join(DIST, "favorites.json"), "utf8"));
      for (const f of list) favNameMap.set(f.id, f.name);
    } catch { /* empty */ }
  }
  return favNameMap;
}

async function loadCubeNames() {
  if (!cubeNameMap) {
    cubeNameMap = new Map();
    for (const cu of await getCubes()) cubeNameMap.set(cu.id, cu);
  }
  return cubeNameMap;
}

async function loadEquipMaps() {
  equipItemMap ??= await loadDistJson("equip_item_map.json", {});
  equipOptionMap ??= await loadDistJson("equip_option_map.json", {});
  return { equipItemMap, equipOptionMap };
}

let costumeMapData: Record<string, any> | null = null;
async function getCostumeMap(): Promise<Record<string, any>> {
  costumeMapData ??= await loadDistJson("costume_map.json", {});
  return costumeMapData;
}

// Unique-grade costume side-stories ship as event_* scene groups named
// after the costume; the scene index has no costume link, so this map is
// maintained manually — add new costume tids as their events surface.
const COSTUME_SCENE_PREFIX: Record<number, string> = {
  30018: "event_firstaffection", // 모더니아 — 퍼스트 어펙션
  50012: "event_nonsensered", // 레드후드 — 넌센스 레드
};

const storyScenesOf = (tid: number, scenes: SceneIndexEntry[]) => {
  const prefix = COSTUME_SCENE_PREFIX[tid];
  return prefix
    ? scenes.filter((s) => s.groupId.startsWith(prefix)).map((s) => s.groupId)
    : [];
};

// normalized shape served by /api/costumes — costume_map tid -> costume meta
// joined with the character list for images + owner
const costumeRow = (tid: number, co: any, scenes: SceneIndexEntry[] = []) => {
  const n = byResourceId.get(co.resourceId);
  const owned = costumeOwner.get(tid);
  return {
    id: tid,
    name: co.name ?? null,
    description: co.description ?? null,
    grade: co.grade ?? null,
    costumeIndex: co.costumeIndex ?? 0,
    images: owned?.costume.images ?? null,
    character: n ? { id: n.id, resourceId: n.resourceId, name: n.name, rarity: n.rarity } : null,
    storyScenes: storyScenesOf(tid, scenes),
  };
};

let stageRows: any[] | null = null;
async function getStages(): Promise<any[]> {
  if (!stageRows) {
    stageRows = await loadDistJson<any[]>(path.join("tables", "stage_list.json"), []);
  }
  return stageRows;
}

// normalized shape served by /api/stages
const stageRow = (s: any) => ({
  id: s.id,
  chapter: s.chapter_id,
  mode: s.chapter_mod,
  battlePower: s.standard_battle_power ?? 0,
  name: s.name_localkey?.name ?? "",
  scenarios: { enter: s.enter_scenario ?? null, exit: s.exit_scenario ?? null },
});

// the raw table is ~4.4k rows — normalize once, not per request
let stageRowsNorm: ReturnType<typeof stageRow>[] | null = null;
async function getStageRows() {
  stageRowsNorm ??= (await getStages()).map(stageRow);
  return stageRowsNorm;
}

async function loadStageMap() {
  if (!stageMap) {
    stageMap = new Map();
    for (const s of await getStages()) {
      stageMap.set(s.id, {
        chapter: s.chapter_id,
        mode: s.chapter_mod,
        name: s.name_localkey?.name ?? "",
      });
    }
  }
  return stageMap;
}

async function loadRecycleMap() {
  if (!recycleMap) {
    recycleMap = new Map();
    try {
      const tbl: { records?: { id: number; recycle_type?: string; recycle_sub_type?: string }[] } =
        JSON.parse(await readFile(path.join(DIST, "tables", "RecycleResearchStatTable.json"), "utf8"));
      for (const r of tbl.records ?? []) {
        recycleMap.set(r.id, { type: r.recycle_type, subType: r.recycle_sub_type });
      }
    } catch { /* empty */ }
  }
  return recycleMap;
}

const CORP_NAMES: Record<number, string> = {
  1: "ELYSION",
  2: "MISSILIS",
  3: "TETRA",
  4: "PILGRIM",
  7: "ABNORMAL",
};

// owned-nikke matchers, split so ?id=/?name= (and the unified :nameOrId) can pick
// the right comparison — exported for tests
export function makeNikkeMatchers(charRef: (nameCode?: number | null) => any) {
  // digits only: name_code / character id / resourceId — never names
  const matchesNikkeId = (query: string, ch: any) => {
    if (!/^\d+$/.test(query)) return false;
    const ref = charRef(ch.name_code) as any;
    const n = Number(query);
    return ch.name_code === n || ref?.id === n || ref?.resourceId === n;
  };
  // free text: partial name match across all locales — works for digit
  // names too ("102" -> N102), which the old unified matcher missed
  const matchesNikkeName = (query: string, ch: any) => {
    if (!query) return true;
    const ref = charRef(ch.name_code) as any;
    const nq = norm(query);
    return !!ref?.name && Object.values(ref.name as object).some((nm) => norm(nm).includes(nq));
  };
  // unified match for the :nameOrId path param — id OR name
  const matchesNikke = (query: string, ch: any) =>
    !query ? true : matchesNikkeId(query, ch) || matchesNikkeName(query, ch);
  return { matchesNikkeId, matchesNikkeName, matchesNikke };
}

// shared lookup context for user-profile normalization
async function loadProfileLookups() {
  const [ncMap, favNames, cubeNames, { equipItemMap, equipOptionMap }, stages, recycles] =
    await Promise.all([
      loadNameCodeMap(),
      loadFavNames(),
      loadCubeNames(),
      loadEquipMaps(),
      loadStageMap(),
      loadRecycleMap(),
    ]);
  const charInfo = (n: Nikke, image?: string) => ({
    id: n.id,
    resourceId: n.resourceId,
    name: n.name,
    rarity: n.rarity,
    class: n.class,
    burst: n.burst,
    corporation: n.corporation,
    element: n.element,
    image: image ?? n.images.icon,
  });
  const charRef = (nameCode?: number | null) => {
    if (!nameCode) return null;
    const rid = ncMap?.[String(nameCode)];
    const n = rid != null ? byResourceId.get(rid) : undefined;
    return n ? { nameCode, ...charInfo(n) } : { nameCode };
  };
  // avatar/icon ids are a different namespace (character_avatar_map: id -> resource+costume)
  const avatarRef = (iconId?: number | null) => {
    if (!iconId) return null;
    const a = avatarMap?.[String(iconId)];
    const n = a ? byResourceId.get(a.resourceId) : undefined;
    if (!n || !a) return { nameCode: iconId };
    const costume = a.costumeIndex > 0 ? n.costumes[a.costumeIndex - 1] : undefined;
    return { iconId, costumeIndex: a.costumeIndex, ...charInfo(n, costume?.images.icon) };
  };
  const cubeRef = (tid?: number, lv?: number) =>
    !tid ? null : { id: tid, level: lv ?? 0, name: cubeNames.get(tid)?.name ?? null };
  const favRef = (tid?: number, lv?: number) =>
    !tid ? null : { id: tid, level: lv ?? 0, name: favNames.get(tid) ?? null };
  const costumeRef = (tid?: number | null) => {
    if (!tid) return null;
    const hit = costumeOwner.get(tid);
    if (!hit) return { id: tid };
    return {
      id: tid,
      skinIndex: hit.costume.skinIndex,
      name: hit.costume.name ?? null,
      character: charInfo(hit.nikke, hit.costume.images.icon),
    };
  };
  const stageRef = (stageId?: number) => {
    if (!stageId) return null;
    const s = stages.get(stageId);
    return s ? { stageId, chapter: s.chapter, mode: s.mode, stage: s.name } : { stageId };
  };
  const optionRef = (effectById: Map<string, any>) => (oid?: number) => {
    if (!oid) return null;
    const o = equipOptionMap?.[String(oid)];
    const fd = effectById.get(String(oid))?.function_details?.[0];
    const value =
      fd?.function_value != null
        ? {
            type: fd.function_type ?? null,
            value: fd.function_value_type === "Percent" ? fd.function_value / 100 : fd.function_value,
            unit: fd.function_value_type === "Percent" ? "%" : null,
          }
        : null;
    return o ? { id: oid, name: o.name, rank: o.rank, value } : { id: oid, value };
  };
  const equipRef = (effectById: Map<string, any>) => {
    const opt = optionRef(effectById);
    return (d: Record<string, any>, slot: string) => {
      const tid = d[`${slot}_equip_tid`];
      if (!tid) return null;
      const item = equipItemMap?.[String(tid)];
      return {
        tid,
        name: item?.name ?? null,
        class: item?.class ?? null,
        rare: item?.rare ?? null,
        icon: item?.icon ?? null,
        tier: d[`${slot}_equip_tier`] ?? 0,
        level: d[`${slot}_equip_lv`] ?? 0,
        corporation: CORP_NAMES[d[`${slot}_equip_corporation_type`]] ?? null,
        options: [1, 2, 3].map((i) => opt(d[`${slot}_equip_option${i}_id`])).filter(Boolean),
      };
    };
  };
  const normalizeNikke = (ch: any, d: any, effectById: Map<string, any>) => {
    const eq = equipRef(effectById);
    return {
      character: charRef(ch.name_code),
      level: ch.lv ?? d.lv ?? 0,
      combat: ch.combat ?? d.combat ?? 0,
      arenaCombat: d.arena_combat ?? 0,
      grade: ch.grade ?? d.grade ?? 0,
      core: ch.core ?? d.core ?? 0,
      costume: costumeRef(d.costume_tid || ch.costume_id),
      skills: { skill1: d.skill1_lv ?? 0, skill2: d.skill2_lv ?? 0, burst: d.ulti_skill_lv ?? 0 },
      attractiveLevel: d.attractive_lv ?? 0,
      favoriteItem: favRef(d.favorite_item_tid, d.favorite_item_lv),
      cube: cubeRef(d.harmony_cube_tid, d.harmony_cube_lv),
      arenaCube: cubeRef(d.arena_harmony_cube_tid, d.arena_harmony_cube_lv),
      // output key is "body" to match /api/equips slot naming; upstream
      // fields are still torso_equip_* so eq() keeps the "torso" prefix
      equipment: {
        head: eq(d, "head"),
        body: eq(d, "torso"),
        arm: eq(d, "arm"),
        leg: eq(d, "leg"),
      },
    };
  };
  return {
    charRef,
    avatarRef,
    cubeRef,
    favRef,
    costumeRef,
    stageRef,
    normalizeNikke,
    ...makeNikkeMatchers(charRef),
    recycles,
  };
}

function findByName(q: string): Nikke[] {
  const nq = norm(q);
  const matches = characters.filter((c) => Object.values(c.name).some((n) => norm(n).includes(nq)));
  // exact matches first, then the rest
  return matches.sort((a, b) => {
    const ae = Object.values(a.name).some((n) => norm(n) === nq) ? 0 : 1;
    const be = Object.values(b.name).some((n) => norm(n) === nq) ? 0 : 1;
    return ae - be;
  });
}

// endpoints that stream raw files via c.body skip the lang middleware —
// when a valid ?lang= is present they must go through c.json instead
const wantsLang = (c: Context) => {
  const l = c.req.query("lang");
  return l != null && LOCALES.has(l);
};

const app = new Hono();
app.use("*", cors());
app.use("*", cacheHeaders(characterData.syncedAt));

// ?lang=ko|en|ja|zh-TW flattens {ko,en,ja,zh-TW} objects into single strings
// on every JSON response
app.use("*", async (c, next) => {
  const lang = c.req.query("lang");
  if (!lang || !LOCALES.has(lang)) return next();
  const orig = c.json.bind(c);
  c.json = ((obj: unknown, ...rest: unknown[]) =>
    orig(localize(obj, lang), ...(rest as []))) as typeof c.json;
  await next();
});

app.get("/", (c) =>
  c.json({
    name: "nikke-data-api",
    version: characterData.version ?? "0.0.0",
    source: "Unofficial — data © SHIFT UP / Level Infinite",
    syncedAt: characterData.syncedAt,
    endpoints: {
      "GET /api/nikkes":
        "list; filters: q, element, class, burst, corporation, weapon, rarity; limit/offset pagination",
      "GET /api/nikkes/:id": "detail by id / resourceId / name (fuzzy)",
      "GET /api/meta/filters": "available filter values",
      "GET /api/scenes": "story scene index (ko)",
      "GET /api/scenes/:groupId": "scene dialogue lines (ko)",
      "GET /api/events": "story event list — event_* scene groups; filter: q",
      "GET /api/events/:id": "event detail — episode scene list",
      "GET /api/stages": "campaign stage list; filters: q, chapter, mode; limit/offset",
      "GET /api/stages/:id": "stage detail (id)",
      "GET /api/costumes": "costume list; filters: q, grade, nikke; limit/offset",
      "GET /api/costumes/:id": "costume detail (costume tid)",
      "GET /api/equips": "equipment item list; filters: q, class, rare, slot; limit/offset",
      "GET /api/equips/options": "equipment option list; filters: q, groupId, rank",
      "GET /api/equips/options/:id": "equipment option detail",
      "GET /api/equips/:id": "equipment item detail (equip tid)",
      "GET /api/avatars": "avatar icon list; filters: q, resourceId; limit/offset",
      "GET /api/avatars/:iconId": "avatar detail (icon id)",
      "GET /api/favorites": "소장품(favorite item) list; filters: q, rare",
      "GET /api/favorites/:id": "소장품 detail — per-level stats, skills",
      "GET /api/cubes": "하모니 큐브 list; filter: q",
      "GET /api/cubes/:id": "큐브 detail — per-level stats, skills",
      "GET /api/tables": "list raw table files",
      "GET /api/tables/:file": "raw synced table JSON",
      "GET /api/cdn?path=": "resolve a Blablalink CDN resource path to its URL",
      "GET /api/user/:blablaid":
        "shared-profile lookup (blablaid = blablalink openid, or ?blablaid=/?url=)",
      "GET /api/user/:blablaid/nikke?q=":
        "owned-nikke list (same filters as /api/nikkes)",
      "GET /api/user/:blablaid/nikke/:nameOrId":
        "single owned-nikke detail (nameOrId = name/id/nameCode)",
      "GET /api/user/:blablaid/roster?area=":
        "full owned roster, upstream-shaped (characters+details+stateEffects+outpost per area)",
    },
    fields:
      "?fields=a,b.c on nikkes, favorites, cubes, scene detail and user-nikke routes trims each object to those (dot) paths",
    lang: "?lang=ko|en|ja|zh-TW flattens localized objects to a single string",
  }),
);

app.get("/api/nikkes", (c) => {
  const { q, element, class: cls, burst, corporation, weapon, rarity, limit, offset } = c.req.query();
  let list = characters;
  if (q) list = findByName(q);
  const n = (v?: string) => v?.toLowerCase();
  if (element) list = list.filter((x) => n(x.element ?? undefined) === n(element));
  if (cls) list = list.filter((x) => n(x.class) === n(cls));
  if (burst) list = list.filter((x) => n(x.burst) === n(burst));
  if (corporation) list = list.filter((x) => n(x.corporation) === n(corporation));
  if (weapon) list = list.filter((x) => n(x.weapon.type ?? undefined) === n(weapon));
  if (rarity) list = list.filter((x) => n(x.rarity) === n(rarity));
  const total = list.length;
  const pg = pageQuery(c, total);
  if ("error" in pg) return c.json({ error: pg.error }, 400);
  return c.json({
    count: total,
    offset: pg.off,
    ...(pg.page ? { page: pg.page, totalPages: Math.ceil(total / pg.lim) } : {}),
    characters: pickFields(list.slice(pg.off, pg.off + pg.lim), fieldsOf(c)),
  });
});

app.get("/api/nikkes/:id", async (c) => {
  const key = c.req.param("id");
  const fields = fieldsOf(c);
  if (/^\d+$/.test(key)) {
    const n = Number(key);
    const hit = byId.get(n) ?? byResourceId.get(n);
    if (hit) return c.json(pickFields(await withDetail(hit), fields));
  }
  const hits = findByName(key);
  if (hits.length === 1) return c.json(pickFields(await withDetail(hits[0]), fields));
  if (hits.length > 1) return c.json({ count: hits.length, characters: pickFields(hits, fields) });
  return c.json({ error: "not found" }, 404);
});

app.get("/api/meta/filters", async (c) => {
  const uniq = <T>(arr: (T | null | undefined)[]) => [...new Set(arr.filter(Boolean))] as T[];
  const [stages, costumes, { equipItemMap: items, equipOptionMap: options }] = await Promise.all([
    getStages(),
    getCostumeMap(),
    loadEquipMaps(),
  ]);
  return c.json({
    elements: uniq(characters.map((x) => x.element)),
    classes: uniq(characters.map((x) => x.class)),
    bursts: uniq(characters.map((x) => x.burst)),
    corporations: uniq(characters.map((x) => x.corporation)),
    weapons: uniq(characters.map((x) => x.weapon.type)),
    rarities: uniq(characters.map((x) => x.rarity)),
    stageModes: uniq(stages.map((s: any) => s.chapter_mod)),
    stageChapters: uniq(stages.map((s: any) => s.chapter_id as number)).sort((a, b) => a - b),
    costumeGrades: uniq(Object.values(costumes).map((x: any) => x.grade)),
    equipClasses: uniq(Object.values(items ?? {}).map((x: any) => x.class)),
    equipRares: uniq(Object.values(items ?? {}).map((x: any) => x.rare)),
    equipSlots: uniq(Object.values(items ?? {}).map((x: any) => x.slot)),
    equipOptionRanks: uniq(Object.values(options ?? {}).map((x: any) => x.rank as number)).sort(
      (a, b) => a - b,
    ),
  });
});

app.get("/api/scenes", async (c) => {
  const { q, category, nikke, limit, offset } = c.req.query();
  let list = await getScenes();
  if (category) list = list.filter((s) => s.category === category);
  if (nikke) {
    const nn = norm(nikke);
    list = list.filter((s) => s.nikke != null && norm(s.nikke).includes(nn));
  }
  if (q) {
    const nq = norm(q);
    list = list.filter((s) => norm(s.groupId).includes(nq) || norm(s.name ?? "").includes(nq));
  }
  const total = list.length;
  const pg = pageQuery(c, total);
  if ("error" in pg) return c.json({ error: pg.error }, 400);
  return c.json({
    count: total,
    offset: pg.off,
    ...(pg.page ? { page: pg.page, totalPages: Math.ceil(total / pg.lim) } : {}),
    scenes: pickFields(list.slice(pg.off, pg.off + pg.lim), fieldsOf(c)),
  });
});

// event_* scenes grouped per story event — episode/prologue/epilogue/
// intermission/_e/_s suffixes are stripped to get the event id. Event
// names aren't in the source data, so the id is the identifier.
const eventIdOf = (gid: string) => {
  // strip repeatedly — ids like event_ce006_1_01_e nest two suffixes
  let prev = gid;
  for (;;) {
    const next = prev.replace(/(_\d+(_[es])?|_[es]|_(prologue|epilogue|intermission|end))$/, "");
    if (next === prev) return prev;
    prev = next;
  }
};

const eventGroups = async () => {
  const groups = new Map<string, SceneIndexEntry[]>();
  for (const s of (await getScenes()).filter((x) => x.category === "event")) {
    const id = eventIdOf(s.groupId);
    const arr = groups.get(id) ?? [];
    arr.push(s);
    groups.set(id, arr);
  }
  return groups;
};

app.get("/api/events", async (c) => {
  const { q } = c.req.query();
  let list = [...(await eventGroups()).entries()].map(([id, ss]) => ({
    id,
    episodes: ss.length,
    totalLines: ss.reduce((n, s) => n + s.lines, 0),
    scenes: ss.map((s) => s.groupId),
  }));
  if (q) {
    const nq = norm(q);
    list = list.filter((e) => norm(e.id).includes(nq));
  }
  const total = list.length;
  const pg = pageQuery(c, total);
  if ("error" in pg) return c.json({ error: pg.error }, 400);
  return c.json({
    count: total,
    offset: pg.off,
    ...(pg.page ? { page: pg.page, totalPages: Math.ceil(total / pg.lim) } : {}),
    events: pickFields(list.slice(pg.off, pg.off + pg.lim), fieldsOf(c)),
  });
});

app.get("/api/events/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[\w-]+$/.test(id)) return c.json({ error: "invalid id" }, 400);
  const ss = (await eventGroups()).get(id);
  if (!ss) return c.json({ error: "not found" }, 404);
  return c.json(
    pickFields(
      {
        id,
        episodes: ss.length,
        totalLines: ss.reduce((n, s) => n + s.lines, 0),
        scenes: ss.map((s) => ({ groupId: s.groupId, name: s.name ?? null, lines: s.lines })),
      },
      fieldsOf(c),
    ),
  );
});

app.get("/api/scenes/:groupId", async (c) => {
  const gid = c.req.param("groupId");
  if (!/^[\w-]+$/.test(gid)) return c.json({ error: "invalid groupId" }, 400);
  let body: string;
  try {
    body = await readFile(path.join(DIST, "scenes", `${gid}.json`), "utf8");
  } catch {
    return c.json({ error: "not found" }, 404);
  }
  const fields = fieldsOf(c);
  if (fields || wantsLang(c)) return c.json(pickFields(JSON.parse(body), fields));
  return c.body(body, 200, { "Content-Type": "application/json" });
});

app.get("/api/stages", async (c) => {
  const { q, chapter, mode, limit, offset } = c.req.query();
  let list = await getStageRows();
  if (chapter) {
    const ch = Number(chapter);
    if (Number.isNaN(ch)) return c.json({ error: "invalid chapter" }, 400);
    list = list.filter((s) => s.chapter === ch);
  }
  if (mode) list = list.filter((s) => norm(s.mode) === norm(mode));
  if (q) {
    const nq = norm(q);
    list = list.filter((s) => norm(s.name).includes(nq));
  }
  const total = list.length;
  const pg = pageQuery(c, total);
  if ("error" in pg) return c.json({ error: pg.error }, 400);
  return c.json({
    count: total,
    offset: pg.off,
    ...(pg.page ? { page: pg.page, totalPages: Math.ceil(total / pg.lim) } : {}),
    stages: pickFields(list.slice(pg.off, pg.off + pg.lim), fieldsOf(c)),
  });
});

app.get("/api/stages/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^\d+$/.test(id)) return c.json({ error: "invalid id" }, 400);
  const s = (await getStageRows()).find((x) => x.id === Number(id));
  if (!s) return c.json({ error: "not found" }, 404);
  return c.json(pickFields(s, fieldsOf(c)));
});

app.get("/api/costumes", async (c) => {
  const { q, grade, nikke, limit, offset } = c.req.query();
  const scenes = await getScenes();
  let list = Object.entries(await getCostumeMap()).map(([tid, co]) =>
    costumeRow(Number(tid), co, scenes),
  );
  if (grade) list = list.filter((x) => norm(x.grade ?? "") === norm(grade));
  if (nikke) {
    const nq = norm(nikke);
    list = list.filter((x) => {
      const ch = x.character;
      if (!ch) return false;
      if (/^\d+$/.test(nikke)) {
        const nId = Number(nikke);
        if (ch.id === nId || ch.resourceId === nId) return true;
      }
      return Object.values(ch.name as object).some((n) => norm(n).includes(nq));
    });
  }
  if (q) {
    const nq = norm(q);
    list = list.filter((x) => Object.values(x.name ?? {}).some((n) => norm(String(n)).includes(nq)));
  }
  const total = list.length;
  const pg = pageQuery(c, total);
  if ("error" in pg) return c.json({ error: pg.error }, 400);
  return c.json({
    count: total,
    offset: pg.off,
    ...(pg.page ? { page: pg.page, totalPages: Math.ceil(total / pg.lim) } : {}),
    costumes: pickFields(list.slice(pg.off, pg.off + pg.lim), fieldsOf(c)),
  });
});

app.get("/api/costumes/:id", async (c) => {
  const id = c.req.param("id");
  const fields = fieldsOf(c);
  const scenes = await getScenes();
  // numeric: costume tid lookup; otherwise name match like /api/nikkes/:id
  if (/^\d+$/.test(id)) {
    const co = (await getCostumeMap())[id];
    if (!co) return c.json({ error: "not found" }, 404);
    return c.json(pickFields(costumeRow(Number(id), co, scenes), fields));
  }
  const nq = norm(id);
  const hits = Object.entries(await getCostumeMap())
    .map(([tid, co]) => costumeRow(Number(tid), co, scenes))
    .filter((x) => Object.values(x.name ?? {}).some((n) => norm(String(n)).includes(nq)));
  if (hits.length === 1) return c.json(pickFields(hits[0], fields));
  if (hits.length > 1) return c.json({ count: hits.length, costumes: pickFields(hits, fields) });
  return c.json({ error: "not found" }, 404);
});

// ItemEquipTable_{locale}.json — equip stats, option-slot rates, reroll
// costs and the (localized) flavor text; equip_item_map only has names
interface EquipTableRecord {
  id: number;
  name_localkey?: string;
  description_localkey?: string;
  stat?: { stat_type?: string; stat_value?: number }[];
  option_slot?: { option_slot?: number; option_slot_success_ratio?: number }[];
  option_cost?: number;
  option_change_cost?: number;
  option_lock_cost?: number;
}
let equipTables: {
  byId: Map<number, EquipTableRecord>;
  desc: Map<number, Record<string, string>>;
} | null = null;
async function loadEquipTables() {
  if (!equipTables) {
    const byId = new Map<number, EquipTableRecord>();
    const desc = new Map<number, Record<string, string>>();
    const [ko, en, ja] = await Promise.all(
      ["ko", "en", "ja"].map(async (l) => {
        const t = await loadDistJson<EquipTableRecord[] | { records?: EquipTableRecord[] }>(
          `tables/ItemEquipTable_${l}.json`,
          [],
        );
        return Array.isArray(t) ? t : (t.records ?? []);
      }),
    );
    for (const r of ko) byId.set(r.id, r);
    for (const [i, tbl] of [ko, en, ja].entries()) {
      const l = ["ko", "en", "ja"][i];
      for (const r of tbl) {
        if (r.description_localkey) {
          const d = desc.get(r.id) ?? {};
          d[l] = r.description_localkey.replace(/_x000D_/g, "").trim();
          desc.set(r.id, d);
        }
      }
    }
    equipTables = { byId, desc };
  }
  return equipTables;
}

// normalized rows served by /api/equips
const equipRow = (tid: number, item: any, tbl?: Awaited<ReturnType<typeof loadEquipTables>>) => {
  const r = tbl?.byId.get(tid);
  const stats = Object.fromEntries(
    (r?.stat ?? []).filter((s) => s.stat_type && s.stat_type !== "None").map((s) => [s.stat_type, s.stat_value ?? 0]),
  );
  const optionSlots = (r?.option_slot ?? [])
    .map((s, i) => ({ slot: i + 1, success: (s.option_slot_success_ratio ?? 0) / 10000 }))
    .filter((s) => s.success > 0);
  return {
    id: tid,
    name: item.name ?? null,
    class: item.class ?? null,
    rare: item.rare ?? null,
    slot: item.slot ?? null,
    icon: item.icon ?? null,
    stats: Object.keys(stats).length ? stats : null,
    optionSlots: optionSlots.length ? optionSlots : null,
    costs:
      r && (r.option_cost || r.option_change_cost || r.option_lock_cost)
        ? { open: r.option_cost ?? 0, change: r.option_change_cost ?? 0, lock: r.option_lock_cost ?? 0 }
        : null,
    description: tbl?.desc.get(tid) ?? null,
  };
};
const optionRow = (oid: number, o: any) => ({
  id: oid,
  groupId: o.groupId ?? null,
  rank: o.rank ?? null,
  name: o.name ?? null,
});
const matchName = (list: any[], q: string) => {
  const nq = norm(q);
  return list.filter((x) => Object.values(x.name ?? {}).some((n) => norm(String(n)).includes(nq)));
};

// static /options must be registered before /:id — the param route would
// otherwise swallow it as id="options"
app.get("/api/equips/options", async (c) => {
  const { q, groupId, rank, limit, offset } = c.req.query();
  await loadEquipMaps();
  let list = Object.entries(equipOptionMap ?? {}).map(([oid, o]) => optionRow(Number(oid), o));
  if (groupId) {
    const g = Number(groupId);
    if (Number.isNaN(g)) return c.json({ error: "invalid groupId" }, 400);
    list = list.filter((x) => x.groupId === g);
  }
  if (rank) {
    const r = Number(rank);
    if (Number.isNaN(r)) return c.json({ error: "invalid rank" }, 400);
    list = list.filter((x) => x.rank === r);
  }
  if (q) list = matchName(list, q);
  const total = list.length;
  const pg = pageQuery(c, total);
  if ("error" in pg) return c.json({ error: pg.error }, 400);
  return c.json({
    count: total,
    offset: pg.off,
    ...(pg.page ? { page: pg.page, totalPages: Math.ceil(total / pg.lim) } : {}),
    options: pickFields(list.slice(pg.off, pg.off + pg.lim), fieldsOf(c)),
  });
});

app.get("/api/equips/options/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^\d+$/.test(id)) return c.json({ error: "invalid id" }, 400);
  await loadEquipMaps();
  const o = equipOptionMap?.[id];
  if (!o) return c.json({ error: "not found" }, 404);
  return c.json(pickFields(optionRow(Number(id), o), fieldsOf(c)));
});

app.get("/api/equips", async (c) => {
  const { q, class: cls, rare, slot, limit, offset } = c.req.query();
  const [tbl] = await Promise.all([loadEquipTables(), loadEquipMaps()]);
  let list = Object.entries(equipItemMap ?? {}).map(([tid, item]) => equipRow(Number(tid), item, tbl));
  if (cls) list = list.filter((x) => norm(x.class ?? "") === norm(cls));
  if (rare) list = list.filter((x) => norm(x.rare ?? "") === norm(rare));
  if (slot) list = list.filter((x) => norm(x.slot ?? "") === norm(slot));
  if (q) list = matchName(list, q);
  const total = list.length;
  const pg = pageQuery(c, total);
  if ("error" in pg) return c.json({ error: pg.error }, 400);
  return c.json({
    count: total,
    offset: pg.off,
    ...(pg.page ? { page: pg.page, totalPages: Math.ceil(total / pg.lim) } : {}),
    equips: pickFields(list.slice(pg.off, pg.off + pg.lim), fieldsOf(c)),
  });
});

app.get("/api/equips/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^\d+$/.test(id)) return c.json({ error: "invalid id" }, 400);
  const [tbl] = await Promise.all([loadEquipTables(), loadEquipMaps()]);
  const item = equipItemMap?.[id];
  if (!item) return c.json({ error: "not found" }, 404);
  return c.json(pickFields(equipRow(Number(id), item, tbl), fieldsOf(c)));
});

// normalized row served by /api/avatars — avatar_map iconId -> resource+costume
// joined with the character list for owner + resolved icon image
const avatarRow = (iconId: number, a: { resourceId: number; costumeIndex: number }) => {
  const n = byResourceId.get(a.resourceId);
  const costume = n && a.costumeIndex > 0 ? n.costumes[a.costumeIndex - 1] : undefined;
  return {
    iconId,
    resourceId: a.resourceId,
    costumeIndex: a.costumeIndex,
    image: costume?.images.icon ?? n?.images.icon ?? null,
    character: n ? { id: n.id, resourceId: n.resourceId, name: n.name, rarity: n.rarity } : null,
  };
};

app.get("/api/avatars", async (c) => {
  const { q, resourceId, orphans, limit, offset } = c.req.query();
  await loadNameCodeMap();
  let list = Object.entries(avatarMap ?? {}).map(([k, a]) => avatarRow(Number(k), a));
  if (resourceId) {
    const r = Number(resourceId);
    if (Number.isNaN(r)) return c.json({ error: "invalid resourceId" }, 400);
    list = list.filter((x) => x.resourceId === r);
  }
  if (orphans === "true") list = list.filter((x) => x.character === null);
  if (q) {
    const nq = norm(q);
    list = list.filter(
      (x) => x.character && Object.values(x.character.name).some((n) => norm(String(n)).includes(nq)),
    );
  }
  const total = list.length;
  const pg = pageQuery(c, total);
  if ("error" in pg) return c.json({ error: pg.error }, 400);
  return c.json({
    count: total,
    offset: pg.off,
    ...(pg.page ? { page: pg.page, totalPages: Math.ceil(total / pg.lim) } : {}),
    avatars: pickFields(list.slice(pg.off, pg.off + pg.lim), fieldsOf(c)),
  });
});

app.get("/api/avatars/:iconId", async (c) => {
  const id = c.req.param("iconId");
  if (!/^\d+$/.test(id)) return c.json({ error: "invalid iconId" }, 400);
  await loadNameCodeMap();
  const a = avatarMap?.[id];
  if (!a) return c.json({ error: "not found" }, 404);
  return c.json(pickFields(avatarRow(Number(id), a), fieldsOf(c)));
});

app.get("/api/favorites", async (c) => {
  const { q, rare } = c.req.query();
  let list = await getFavorites();
  if (rare) list = list.filter((x) => x.rare?.toLowerCase() === rare.toLowerCase());
  if (q) {
    const nq = norm(q);
    list = list.filter((x) => Object.values(x.name).some((n) => norm(n).includes(nq)));
  }
  const total = list.length;
  const pg = pageQuery(c, total);
  if ("error" in pg) return c.json({ error: pg.error }, 400);
  return c.json({
    count: total,
    offset: pg.off,
    ...(pg.page ? { page: pg.page, totalPages: Math.ceil(total / pg.lim) } : {}),
    favorites: pickFields(list.slice(pg.off, pg.off + pg.lim), fieldsOf(c)),
  });
});

app.get("/api/favorites/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^\d+$/.test(id)) return c.json({ error: "invalid id" }, 400);
  let body: string;
  try {
    body = await readFile(path.join(DIST, "favorites", `${id}.json`), "utf8");
  } catch {
    return c.json({ error: "not found" }, 404);
  }
  const fields = fieldsOf(c);
  if (fields || wantsLang(c)) return c.json(pickFields(JSON.parse(body), fields));
  return c.body(body, 200, { "Content-Type": "application/json" });
});

app.get("/api/cubes", async (c) => {
  const { q } = c.req.query();
  let list = await getCubes();
  if (q) {
    const nq = norm(q);
    list = list.filter((x) => Object.values(x.name).some((n) => norm(n).includes(nq)));
  }
  const total = list.length;
  const pg = pageQuery(c, total);
  if ("error" in pg) return c.json({ error: pg.error }, 400);
  return c.json({
    count: total,
    offset: pg.off,
    ...(pg.page ? { page: pg.page, totalPages: Math.ceil(total / pg.lim) } : {}),
    cubes: pickFields(list.slice(pg.off, pg.off + pg.lim), fieldsOf(c)),
  });
});

app.get("/api/cubes/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^\d+$/.test(id)) return c.json({ error: "invalid id" }, 400);
  let body: string;
  try {
    body = await readFile(path.join(DIST, "cubes", `${id}.json`), "utf8");
  } catch {
    return c.json({ error: "not found" }, 404);
  }
  const fields = fieldsOf(c);
  if (fields || wantsLang(c)) return c.json(pickFields(JSON.parse(body), fields));
  return c.body(body, 200, { "Content-Type": "application/json" });
});

app.get("/api/tables", async (c) => {
  try {
    const files = await readdir(path.join(DIST, "tables"));
    return c.json({ files });
  } catch {
    return c.json({ files: [] });
  }
});

app.get("/api/tables/:file", async (c) => {
  const file = c.req.param("file");
  if (!/^[\w.-]+\.json$/.test(file)) return c.json({ error: "invalid file" }, 400);
  try {
    const body = await readFile(path.join(DIST, "tables", file), "utf8");
    if (wantsLang(c)) return c.json(JSON.parse(body));
    return c.body(body, 200, { "Content-Type": "application/json" });
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});

// static /api/user/nikke must be registered before /api/user/:blablaid — the
// param route would otherwise swallow it as blablaid="nikke"
app.get("/api/user", userProfile);
app.get("/api/user/nikke", userNikkeList);
app.get("/api/user/nikke/:nameOrId", userNikkeDetail);
app.get("/api/user/roster", userRoster);
app.get("/api/user/:blablaid", userProfile);
app.get("/api/user/:blablaid/nikke", userNikkeList);
app.get("/api/user/:blablaid/nikke/:nameOrId", userNikkeDetail);
app.get("/api/user/:blablaid/roster", userRoster);

async function userProfile(c: Context) {
  const q = openidInput(c);
  const target = decodeOpenid(q);
  if (!target) return c.json({ error: "invalid blablaid" }, 400);
  try {
    const info = await playerInfo<{ area_id?: string }>(target.intlOpenId);
    if (info.code !== 0 || !info.data)
      return c.json({ error: info.msg ?? "lookup failed", code: info.code }, 502);
    const areaId = Number(info.data.area_id ?? 0);
    const body = { intl_open_id: target.intlOpenId, nikke_area_id: areaId };
    const [basic, outpost, { charRef, avatarRef, stageRef, recycles }] = await Promise.all([
      gameApi("Game", "GetUserProfileBasicInfo", body),
      gameApi("Game", "GetUserProfileOutpostInfo", body),
      loadProfileLookups(),
    ]);

    const bi = (basic.data as any)?.basic_info ?? {};
    const op = (outpost.data as any)?.outpost_info ?? {};

    const corporations: Record<string, number> = {};
    for (const x of bi.corporation_character_counts ?? []) {
      corporations[CORP_NAMES[x.corporation_type] ?? `TYPE_${x.corporation_type}`] = x.count;
    }

    return c.json({
      intlOpenId: target.intlOpenId,
      areaId,
      profile: {
        nickname: bi.nickname ?? bi.role_name,
        level: bi.lv,
        icon: avatarRef(bi.icon_id),
        iconIsPrism: !!bi.is_icon_prism,
        avatarFrame: bi.avatar_frame ?? 0,
        teamCombat: bi.team_combat,
        gsn: bi.gsn,
        nikkeCount: bi.character_count,
        costumeCount: bi.character_costume_count,
        campaign: {
          normal: stageRef(bi.progress_normal_campaign),
          hard: stageRef(bi.progress_hard_campaign),
          easy: stageRef(bi.progress_easy_campaign),
        },
        towers: {
          tribe: bi.progress_tribe_tower,
          tetra: bi.progress_tetra_tower,
          elysion: bi.progress_elysion_tower,
          missilis: bi.progress_missilis_tower,
          pilgrim: bi.progress_pilgrim_tower,
        },
        corporations,
        currencies: bi.currencies ?? [],
        overclock: {
          currentSubSeasonHighScore: bi.sim_room_overclock_current_sub_season_high_score,
          latestSeasonHighScore: bi.sim_room_overclock_latest_season_high_score,
          history: (bi.sim_room_overclock_high_score_history ?? []).map((h: any) => ({
            season: h.season,
            optionLevel: h.option_level,
            options: h.option_list ?? [],
          })),
        },
        profileTeam: (bi.profile_team ?? [])
          .map((t: any) => ({ slot: t.slot, character: charRef(t.name_code) }))
          .sort((a: any, b: any) => a.slot - b.slot),
        isBanned: !!bi.is_banned,
        createdAt: Number(bi.created_at) || null,
        lastActionAt: Number(bi.last_action_at) || null,
      },
      outpost: {
        infraCoreLevel: op.infra_core_level,
        outpostBattleLevel: op.outpost_battle_level,
        synchroLevel: op.synchro_level,
        synchroSlotsUsed: op.synchro_nonempty_slot_count,
        jukeboxCount: op.jukebox_count,
        tacticAcademy: { class: op.tactic_academy_class, lesson: op.tactic_academy_lesson },
        recycleRoom: (op.recycle_room_researches ?? []).map((r: any) => ({
          tid: r.tid,
          type: recycles.get(r.tid)?.type ?? null,
          subType: recycles.get(r.tid)?.subType ?? null,
          level: r.lv,
          exp: r.exp,
        })),
        memorials: op.memorial_counts ?? [],
        isHidden: !!op.is_hide,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("not configured") ? 503 : 502;
    return c.json({ error: msg }, status);
  }
}

// the target's blablalink openid may come from the path
// (/api/user/:blablaid/...) or ?blablaid= — ?openid=/?url= kept for compat
const openidInput = (c: Context) =>
  c.req.param("blablaid") ??
  c.req.query("blablaid") ??
  c.req.query("openid") ??
  c.req.query("url") ??
  "";

// shared helper for the user-nikke routes: resolve the profile target
// and fetch the owned-character list (never the per-character details)
async function loadOwnedNikkes(c: Context) {
  const q = openidInput(c);
  const target = decodeOpenid(q);
  if (!target) return { error: c.json({ error: "invalid blablaid" }, 400) };
  const info = await playerInfo<{ area_id?: string }>(target.intlOpenId);
  if (info.code !== 0 || !info.data)
    return { error: c.json({ error: info.msg ?? "lookup failed", code: info.code }, 502) };
  const body = { intl_open_id: target.intlOpenId, nikke_area_id: Number(info.data.area_id ?? 0) };
  const chars = await gameApi("Game", "GetUserCharacters", body);
  const owned = ((chars.data as any)?.characters ?? []) as any[];
  return { body, owned };
}

const ownedNikkeSummary = (charRef: any) => (ch: any) => ({
  character: charRef(ch.name_code),
  level: ch.lv ?? 0,
  combat: ch.combat ?? 0,
  grade: ch.grade ?? 0,
  core: ch.core ?? 0,
});

// lightweight per-nikke list on a shared profile — same filters as
// /api/nikkes (q + element/class/burst/corporation/weapon/rarity), never
// triggers the detail call
async function userNikkeList(c: Context) {
  try {
    const res = await loadOwnedNikkes(c);
    if ("error" in res) return res.error;
    const { q, id, name, element, class: cls, burst, corporation, weapon, rarity } = c.req.query();
    const { charRef, matchesNikkeId, matchesNikkeName } = await loadProfileLookups();
    const n = (v?: string | null) => v?.toLowerCase();
    const nikkes = res.owned
      .filter((ch) => (!id || matchesNikkeId(id, ch)) && matchesNikkeName(name ?? q ?? "", ch))
      .map(ownedNikkeSummary(charRef))
      .filter((x) => {
        const ch = x.character;
        return (
          (!element || n(ch?.element) === n(element)) &&
          (!cls || n(ch?.class) === n(cls)) &&
          (!burst || n(ch?.burst) === n(burst)) &&
          (!corporation || n(ch?.corporation) === n(corporation)) &&
          (!rarity || n(ch?.rarity) === n(rarity))
        );
      })
      .filter((x) => !weapon || n(byId.get(x.character?.id ?? 0)?.weapon?.type) === n(weapon))
      .sort((a, b) => b.combat - a.combat);
    return c.json({ count: nikkes.length, nikkes: pickFields(nikkes, fieldsOf(c)) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("not configured") ? 503 : 502;
    return c.json({ error: msg }, status);
  }
}

// single owned nikke detail — nameOrId is name / id / resourceId / nameCode,
// matched like /api/nikkes/:id (fuzzy name); multiple hits return the list
async function userNikkeDetail(c: Context) {
  try {
    const res = await loadOwnedNikkes(c);
    if ("error" in res) return res.error;
    const key = c.req.param("nameOrId") ?? "";
    const { charRef, normalizeNikke, matchesNikke } = await loadProfileLookups();
    const fields = fieldsOf(c);
    const hits = res.owned.filter((ch) => matchesNikke(key, ch));
    if (hits.length === 0) return c.json({ error: "not found" }, 404);
    if (hits.length > 1)
      return c.json({
        count: hits.length,
        nikkes: pickFields(
          hits.map(ownedNikkeSummary(charRef)).sort((a, b) => b.combat - a.combat),
          fields,
        ),
      });
    const ch = hits[0];
    const details = await gameApi("Game", "GetUserCharacterDetails", {
      ...res.body,
      name_codes: [ch.name_code],
    });
    const detailByCode = new Map<number, any>(
      ((details.data as any)?.character_details ?? []).map((x: any) => [x.name_code, x]),
    );
    const effectById = new Map<string, any>(
      (((details.data as any)?.state_effects ?? []) as any[]).map((e: any) => [String(e.id), e]),
    );
    return c.json(
      pickFields(normalizeNikke(ch, detailByCode.get(ch.name_code) ?? {}, effectById), fields),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("not configured") ? 503 : 502;
    return c.json({ error: msg }, status);
  }
}

// ── bulk roster (upstream-shaped) ─────────────────────────────────────────
// Same payload the calculator's blablalink proxy worker returns: raw
// GetUserCharacters + GetUserCharacterDetails rows so downstream consumers
// (e.g. the damage calculator) can apply their own interpretation without
// losing fields the normalized endpoints drop. A detail-call failure aborts
// the whole request (502) like the worker — silently dropping an area that
// has characters would hide real data.
const ROSTER_AREAS = [83, 81, 84, 82, 85]; // KR, JP, Global, NA, SEA
const ROSTER_DETAIL_BATCH = 60; // upstream truncates larger name_codes lists
// upstream codes meaning "the owner hid their nikke list" — not a failure
const ROSTER_PRIVATE_CODES = new Set([1301002, 1303002]);

interface RosterArea {
  area: number;
  characters: unknown[];
  details: unknown[];
  stateEffects: unknown[];
  outpost: unknown;
}
interface RosterFail {
  failedCode: number;
  failedMsg: string;
}

async function collectRosterArea(openid: string, area: number): Promise<RosterArea | RosterFail> {
  const body = { intl_open_id: openid, nikke_area_id: area };
  const roster = await gameApi("Game", "GetUserCharacters", body);
  const characters =
    roster.code === 0 ? ((roster.data as any)?.characters ?? null) : null;
  if (!characters?.length)
    return { failedCode: roster.code ?? 0, failedMsg: roster.msg ?? "" };

  const codes = characters.map((x: any) => x.name_code);
  const details: unknown[] = [];
  const stateEffects: unknown[] = [];
  for (let i = 0; i < codes.length; i += ROSTER_DETAIL_BATCH) {
    const chunk = await gameApi("Game", "GetUserCharacterDetails", {
      ...body,
      name_codes: codes.slice(i, i + ROSTER_DETAIL_BATCH),
    });
    if (chunk.code !== 0)
      throw new Error(
        `GetUserCharacterDetails failed: ${chunk.code} ${chunk.msg ?? ""}`,
      );
    details.push(...((chunk.data as any)?.character_details ?? []));
    stateEffects.push(...((chunk.data as any)?.state_effects ?? []));
  }

  // outpost needs a separate privacy toggle upstream — absence is normal
  let outpost = null;
  try {
    const info = await gameApi("Game", "GetUserProfileOutpostInfo", body);
    if (info.code === 0) outpost = (info.data as any)?.outpost_info ?? null;
  } catch {
    /* optional disclosure */
  }
  return { area, characters, details, stateEffects, outpost };
}

async function userRoster(c: Context) {
  const q = openidInput(c);
  const target = decodeOpenid(q);
  if (!target) return c.json({ error: "invalid blablaid" }, 400);
  const areaParam = c.req.query("area");
  const area = areaParam == null || areaParam === "" ? null : Number(areaParam);
  if (area !== null && (!Number.isInteger(area) || !ROSTER_AREAS.includes(area)))
    return c.json({ error: "unsupported area" }, 400);
  try {
    const results = await Promise.all(
      (area === null ? ROSTER_AREAS : [area]).map((a) =>
        collectRosterArea(target.intlOpenId, a),
      ),
    );
    const areas = results.filter((r): r is RosterArea => !("failedCode" in r));
    if (areas.length === 0) {
      const failures = results as RosterFail[];
      if (failures.some((f) => ROSTER_PRIVATE_CODES.has(f.failedCode)))
        return c.json({ error: "nikke list is private", reason: "private" }, 404);
      const first = failures[0]!;
      return c.json(
        {
          error: `upstream lookup failed (${first.failedCode} ${first.failedMsg})`,
          code: first.failedCode,
        },
        502,
      );
    }
    return c.json(
      pickFields({ intlOpenId: target.intlOpenId, areas }, fieldsOf(c)),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("not configured") ? 503 : 502;
    return c.json({ error: msg }, status);
  }
}

app.get("/api/cdn", (c) => {
  const p = c.req.query("path");
  if (!p || p.includes("..")) return c.json({ error: "path required" }, 400);
  return c.json({ path: p, url: cdnUrl(p) });
});

app.get("/openapi.json", (c) => c.json(openapi));

app.notFound((c) => c.json({ error: "not found" }, 404));

app.get("/docs", (c) =>
  c.html(`<!doctype html>
<html><head><title>nikke-api docs</title><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body>
<script id="api-reference" data-url="/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body></html>`),
);

export default app;
