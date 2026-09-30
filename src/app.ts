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

const norm = (s: string) => s.toLowerCase().replace(/[\s:_\-·]/g, "");

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
    try {
      const list = JSON.parse(await readFile(path.join(DIST, "cubes.json"), "utf8"));
      for (const cu of list) cubeNameMap.set(cu.id, cu);
    } catch { /* empty */ }
  }
  return cubeNameMap;
}

async function loadEquipMaps() {
  equipItemMap ??= await loadDistJson("equip_item_map.json", {});
  equipOptionMap ??= await loadDistJson("equip_option_map.json", {});
  return { equipItemMap, equipOptionMap };
}

async function loadStageMap() {
  if (!stageMap) {
    stageMap = new Map();
    try {
      const list: { id: number; chapter_id: number; chapter_mod: string; name_localkey?: { name?: string } }[] =
        JSON.parse(await readFile(path.join(DIST, "tables", "stage_list.json"), "utf8"));
      for (const s of list) {
        stageMap.set(s.id, {
          chapter: s.chapter_id,
          mode: s.chapter_mod,
          name: s.name_localkey?.name ?? "",
        });
      }
    } catch { /* empty */ }
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
      equipment: {
        head: eq(d, "head"),
        torso: eq(d, "torso"),
        arm: eq(d, "arm"),
        leg: eq(d, "leg"),
      },
    };
  };
  // does an owned-character row match a name/id/nameCode query?
  const matchesNikke = (query: string, ch: any) => {
    if (!query) return true;
    const ref = charRef(ch.name_code) as any;
    if (/^\d+$/.test(query)) {
      const n = Number(query);
      return ch.name_code === n || ref?.id === n || ref?.resourceId === n;
    }
    const nq = norm(query);
    return !!ref?.name && Object.values(ref.name as object).some((nm) => norm(nm).includes(nq));
  };
  return {
    charRef,
    avatarRef,
    cubeRef,
    favRef,
    costumeRef,
    stageRef,
    normalizeNikke,
    matchesNikke,
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
      "GET /api/user/:blablaid/nikke/:key":
        "single owned-nikke detail (key = name/id/nameCode)",
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
  const off = Math.max(0, Number(offset) || 0);
  const lim = Math.min(Math.max(0, Number(limit) || 0), 500) || total;
  return c.json({
    count: total,
    offset: off,
    characters: pickFields(list.slice(off, off + lim), fieldsOf(c)),
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

app.get("/api/meta/filters", (c) => {
  const uniq = <T>(arr: (T | null | undefined)[]) => [...new Set(arr.filter(Boolean))] as T[];
  return c.json({
    elements: uniq(characters.map((x) => x.element)),
    classes: uniq(characters.map((x) => x.class)),
    bursts: uniq(characters.map((x) => x.burst)),
    corporations: uniq(characters.map((x) => x.corporation)),
    weapons: uniq(characters.map((x) => x.weapon.type)),
    rarities: uniq(characters.map((x) => x.rarity)),
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
  if (q) list = list.filter((s) => s.groupId.includes(q) || s.name?.includes(q));
  const total = list.length;
  const off = Math.max(0, Number(offset) || 0);
  const lim = Math.min(Math.max(0, Number(limit) || 0), 500) || total;
  return c.json({
    count: total,
    offset: off,
    scenes: pickFields(list.slice(off, off + lim), fieldsOf(c)),
  });
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

app.get("/api/favorites", async (c) => {
  const { q, rare } = c.req.query();
  let list = await getFavorites();
  if (rare) list = list.filter((x) => x.rare?.toLowerCase() === rare.toLowerCase());
  if (q) {
    const nq = norm(q);
    list = list.filter((x) => Object.values(x.name).some((n) => norm(n).includes(nq)));
  }
  return c.json({ count: list.length, favorites: pickFields(list, fieldsOf(c)) });
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
  try {
    let list: { id: number; rare?: string; name: Record<string, string> }[] = JSON.parse(
      await readFile(path.join(DIST, "cubes.json"), "utf8"),
    );
    if (q) {
      const nq = norm(q);
      list = list.filter((x) => Object.values(x.name).some((n) => norm(n).includes(nq)));
    }
    return c.json({ count: list.length, cubes: pickFields(list, fieldsOf(c)) });
  } catch {
    return c.json({ count: 0, cubes: [] });
  }
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
app.get("/api/user/nikke/:key", userNikkeDetail);
app.get("/api/user/:blablaid", userProfile);
app.get("/api/user/:blablaid/nikke", userNikkeList);
app.get("/api/user/:blablaid/nikke/:key", userNikkeDetail);

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
    const { q, element, class: cls, burst, corporation, weapon, rarity } = c.req.query();
    const { charRef, matchesNikke } = await loadProfileLookups();
    const n = (v?: string | null) => v?.toLowerCase();
    const nikkes = res.owned
      .filter((ch) => matchesNikke(q ?? "", ch))
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

// single owned nikke detail — key is name / id / resourceId / nameCode,
// matched like /api/nikkes/:id (fuzzy name); multiple hits return the list
async function userNikkeDetail(c: Context) {
  try {
    const res = await loadOwnedNikkes(c);
    if ("error" in res) return res.error;
    const key = c.req.param("key") ?? "";
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

app.get("/api/cdn", (c) => {
  const p = c.req.query("path");
  if (!p || p.includes("..")) return c.json({ error: "path required" }, 400);
  return c.json({ path: p, url: cdnUrl(p) });
});

app.get("/openapi.json", (c) => c.json(openapi));

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
