import crypto from "node:crypto";
import { cdnUrl } from "../src/cdn.js";

// Representative files whose content changes when game data updates.
// Per-character ko roledata is added below so skill/stat-only patches are caught too.
// scene_detail-only changes are covered by the weekly forced redeploy.
const PATHS = [
  "character/ko/nikke_list_v2.json",
  "character/en/nikke_list_en_v2.json",
  "character/ja/nikke_list_ja_v2.json",
  "character/zh-TW/nikke_list_zh-TW_v2.json",
  "character/character_id_map.json",
  "character/character_skill_map.json",
  "character/CharacterLevelTable.json",
  "character/AttractiveLevelTable.json",
  "scene/ko/scene_list.json",
  "archive/ko/archive_list.json",
  "scene/ko/sudden_list.json",
  "equip/ItemEquipTable-ko.json",
  "equip/equip_option_table_v2-ko.json",
  "equip/favorite_rare_map.json",
  "tower/tower_list.json",
  "stage/stage_list.json",
];

async function fetchText(p: string): Promise<string | null> {
  const res = await fetch(cdnUrl(p));
  if (!res.ok) {
    console.log(`warn: ${res.status} ${p}`);
    return null;
  }
  return res.text();
}

async function main() {
  const hash = crypto.createHash("sha256");
  const bodies = new Map<string, string>();
  for (const p of PATHS) {
    const body = await fetchText(p);
    // a missing base file means the CDN is unhealthy — fail instead of
    // producing a bogus fingerprint that would trigger (and store) a bad deploy
    if (body === null) process.exit(1);
    bodies.set(p, body);
    hash.update(body);
  }

  const list = JSON.parse(bodies.get("character/ko/nikke_list_v2.json")!) as { resource_id: number }[];
  const rids = [...new Set(list.map((x) => x.resource_id))].sort((a, b) => a - b);
  const CONCURRENCY = 8;
  let ok = 0;
  for (let i = 0; i < rids.length; i += CONCURRENCY) {
    const batch = rids.slice(i, i + CONCURRENCY);
    const texts = await Promise.all(batch.map((rid) => fetchText(`roledata/${rid}-v2-ko.json`)));
    batch.forEach((rid, j) => {
      hash.update(`${rid}:${texts[j] ?? "missing"}`);
      if (texts[j] !== null) ok++;
    });
  }

  console.log(`fingerprint over ${PATHS.length} base + ${ok}/${rids.length} roledata files:`);
  console.log(hash.digest("hex"));
}

main();
