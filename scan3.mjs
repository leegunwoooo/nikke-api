import { TextureAtlas, FakeTexture, SkeletonBinary, AtlasAttachmentLoader, Skeleton, AnimationState, AnimationStateData } from "@esotericsoftware/spine-core";
import catalog from "./content/burst-cutscenes/catalog.json" with { type: "json" };
import { writeFileSync } from "node:fs";

const BASE = catalog.assetBase;
const req = async (url, as = "text") => {
  for (let i = 0; ; i++) {
    const r = await fetch(url);
    if (r.ok) return as === "text" ? r.text() : r.arrayBuffer();
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 800 * (i + 1))); if (i > 6) throw new Error(`HTTP ${r.status}`); continue; }
    throw new Error(`HTTP ${r.status}: ${url}`);
  }
};
const vis = (data, anim, t) => {
  const sk = new Skeleton(data); sk.setToSetupPose();
  const st = new AnimationState(new AnimationStateData(data));
  st.setAnimation(0, anim, false).trackTime = t;
  st.apply(sk);
  return new Set(sk.drawOrder.filter(s => s.attachment && s.color.a > 0.01).map(s => s.data.name));
};
const coverage = (data, anim, dur) => {
  let hit = 0, n = 8;
  for (let i = 1; i <= n; i++) if (vis(data, anim, dur * i / (n + 1)).size > 0) hit++;
  return hit / n;
};

const results = [];
for (const e of catalog.entries) {
  try {
    const base = `${BASE}${e.directory}/`;
    const atlas = new TextureAtlas(await req(base + e.atlas));
    for (const p of atlas.pages) p.setTexture(new FakeTexture({ width: p.width, height: p.height }));
    const data = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(await req(base + e.skeleton, "bin")));
    const anims = data.animations.map(a => ({ name: a.name, duration: a.duration, cov: coverage(data, a.name, a.duration) }));
    results.push({ id: e.id, chosen: e.animation, anims });
  } catch (err) { results.push({ id: e.id, error: err.message.slice(0, 80) }); }
  process.stdout.write(`\r${results.length}/${catalog.entries.length} ${e.id}`);
}
writeFileSync("/tmp/scan-results.json", JSON.stringify(results, null, 1));
console.log("\ndone");
// 요약: chosen 트랙 커버리지 낮은 것
for (const r of results) {
  if (r.error) { console.log("ERR", r.id, r.error); continue; }
  const a = r.anims.find(x => x.name === r.chosen);
  if (!a) { console.log("MISSING", r.id, "chosen:", r.chosen); continue; }
  if (a.cov < 0.7) console.log("LOWCOV", r.id, r.chosen, "cov=" + a.cov.toFixed(2), "|", r.anims.map(x => `${x.name}:${x.cov.toFixed(2)}`).join(" "));
}
