// Renders the lobby (stand) idle animation of every nikke skin to an
// animated image. Spine 4.1 canvas renderer + @napi-rs/canvas — no
// browser needed. Output goes to the sibling nikke-api-media repo clone
// (served through jsDelivr), while a small size manifest is written into
// data/dist so the API can attach gif URLs to spine data.
//
//   npx tsx scripts/render-spine-gifs.ts                      # all nikkes/skins
//   npx tsx scripts/render-spine-gifs.ts --rid c010           # one character
//   npx tsx scripts/render-spine-gifs.ts --shard 0/4          # quarter of jobs
//   npx tsx scripts/render-spine-gifs.ts --size 384 --fps 20
//
// Prefers the `idle` track; falls back to idle_02/idle_half, then the
// first animation in the skeleton.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as spine from "@esotericsoftware/spine-canvas";
import gifenc from "gifenc";
import nodeWebpmux from "node-webpmux";
const { Image } = nodeWebpmux;
const { GIFEncoder, quantize, applyPalette } = gifenc;

const arg = (name: string, dflt?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const SIZE = Number(arg("size", "384"));
const FPS = Number(arg("fps", "20"));
const PAD = 0.92; // bounds fill this fraction of the canvas
const RID = arg("rid")?.replace(/^c/i, "");
const ONLY = arg("only")?.split(",");
const FORMAT = arg("format", "gif") === "webp" ? "webp" : "gif";
const OUT_DIR = arg("out", join("..", "nikke-api-media", `spine-${FORMAT}`))!;
const MANIFEST = join("data", "dist", `spine-${FORMAT}-manifest.json`);
const SHARD = (() => {
  const s = arg("shard");
  if (!s) return [0, 1] as const;
  const [k, n] = s.split("/").map(Number);
  return [k, n] as const;
})();

const fetchBuf = async (url: string): Promise<Uint8Array> => {
  for (let i = 0; ; i++) {
    const r = await fetch(url);
    if (r.ok) return new Uint8Array(await r.arrayBuffer());
    if (i === 2 || r.status === 404) throw new Error(`${url}: HTTP ${r.status}`);
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
};

const pickIdle = (data: spine.SkeletonData) => {
  const anims = data.animations;
  return (
    anims.find((a) => a.name === "idle") ??
    anims.find((a) => a.name === "idle_02") ??
    anims.find((a) => a.name === "idle_half") ??
    anims[0]
  );
};

async function renderAnim(stand: { atlas: string; skeleton: string; texture: string }): Promise<Uint8Array> {
  const [atlasBuf, skelBuf] = await Promise.all([
    fetchBuf(stand.atlas),
    fetchBuf(stand.skeleton),
  ]);
  const atlas = new spine.TextureAtlas(new TextDecoder().decode(atlasBuf));
  // an atlas may span several PNG pages (e.g. Snow White's bag) — fetch each
  // page's own file next to `texture`, whose basename is the first page's
  const pngs = await Promise.all(
    atlas.pages.map((page) => fetchBuf(new URL(page.name, stand.texture).href)),
  );
  for (const [i, page] of atlas.pages.entries())
    page.setTexture(new spine.CanvasTexture(await loadImage(Buffer.from(pngs[i])) as any));
  const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(skelBuf);
  const anim = pickIdle(data);
  if (!anim) throw new Error("no animations in skeleton");

  const skeleton = new spine.Skeleton(data);
  const skinName = data.skins.find((s) => s.name === "default")?.name ?? data.skins[0]?.name;
  if (skinName) skeleton.setSkinByName(skinName);
  skeleton.setSlotsToSetupPose();
  const stateData = new spine.AnimationStateData(data);
  const state = new spine.AnimationState(stateData);
  state.setAnimation(0, anim.name, true);

  // pose once and measure the visual AABB — SkeletonBounds only sees
  // BoundingBoxAttachment (hitboxes), which these skeletons don't have
  state.update(1 / FPS);
  state.apply(skeleton);
  skeleton.updateWorldTransform();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const slot of skeleton.slots) {
    const att: any = slot.getAttachment();
    if (!att) continue;
    const kind = att.constructor.name;
    if (kind !== "MeshAttachment" && kind !== "RegionAttachment") continue;
    const len = kind === "MeshAttachment" ? (att.worldVerticesLength ?? 8) : 8;
    const verts = new Float32Array(len);
    if (kind === "MeshAttachment") att.computeWorldVertices(slot, 0, len, verts, 0, 2);
    else att.computeWorldVertices(slot, verts, 0, 2);
    for (let i = 0; i < len; i += 2) {
      minX = Math.min(minX, verts[i]); maxX = Math.max(maxX, verts[i]);
      minY = Math.min(minY, verts[i + 1]); maxY = Math.max(maxY, verts[i + 1]);
    }
  }
  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);
  const scale = (Math.min(SIZE / bw, SIZE / bh) * PAD) || 1;
  const cx = minX + bw / 2;
  const cy = minY + bh / 2;

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  const renderer = new spine.SkeletonRenderer(ctx as unknown as CanvasRenderingContext2D);
  // canvas renderer defaults to quad-only draws — mesh attachments need this
  renderer.triangleRendering = true;
  const frameCount = Math.max(1, Math.round(anim.duration * FPS));
  const delay = 1000 / FPS;
  const gif = FORMAT === "gif" ? GIFEncoder() : undefined;
  const webpFrames: { img: Buffer; delay: number }[] = [];
  for (let f = 0; f < frameCount; f++) {
    state.update(0);
    state.apply(skeleton);
    skeleton.updateWorldTransform();
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.scale(scale, -scale); // spine y-up → canvas y-down
    ctx.translate(-cx, -cy);
    renderer.draw(skeleton);
    ctx.restore();
    if (gif) {
      const { data: rgba } = ctx.getImageData(0, 0, SIZE, SIZE);
      const palette = quantize(rgba, 256, { format: "rgba4444" });
      const index = applyPalette(rgba, palette, "rgba4444");
      gif.writeFrame(index, SIZE, SIZE, { palette, delay, transparent: true, transparentIndex: 0 });
    } else {
      const frameBuf = canvas.toBuffer("image/webp", { quality: 80 } as any);
      webpFrames.push(await Image.generateFrame({ buffer: frameBuf, delay }));
    }
    state.update(1 / FPS);
  }
  if (gif) {
    gif.finish();
    return gif.bytes();
  }
  const webp = await Image.save(null, { frames: webpFrames, width: SIZE, height: SIZE, loops: 0 });
  return new Uint8Array(webp);
}

// `--merge N`: merge part manifests written by `--shard k/N` runs, then exit
if (arg("merge")) {
  const parts = Number(arg("merge"));
  const merged: Record<string, { bytes: number }> = {};
  for (let k = 0; k < parts; k++)
    Object.assign(merged, JSON.parse(readFileSync(`${MANIFEST}.part${k}`, "utf8")));
  mkdirSync(join("data", "dist"), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(merged));
  console.log(`merged ${parts} parts → ${MANIFEST} (${Object.keys(merged).length} entries)`);
  process.exit(0);
}

const charDoc = JSON.parse(readFileSync(join("data", "dist", "characters.json"), "utf8"));
const chars: any[] = Array.isArray(charDoc) ? charDoc : charDoc.characters;
const jobs: { rid: string; skin: number; stand: any }[] = [];
for (const c of chars) {
  const rid = c.resourceId ?? c.resource_id;
  if (!rid || !c.spine?.stand) continue;
  if (RID && Number(rid) !== Number(RID)) continue;
  jobs.push({ rid: String(rid), skin: 0, stand: c.spine.stand });
  for (const cos of c.costumes ?? [])
    if (cos.spine?.stand) jobs.push({ rid: String(rid), skin: cos.skinIndex, stand: cos.spine.stand });
}
const picked = ONLY ? jobs.filter((j) => ONLY.includes(`${j.rid}_${j.skin}`)) : jobs;
const shardJobs = picked.filter((_, i) => i % SHARD[1] === SHARD[0]);

mkdirSync(OUT_DIR, { recursive: true });
const manifestPath = SHARD[1] === 1 ? MANIFEST : `${MANIFEST}.part${SHARD[0]}`;
// a partial (--only/--rid) run updates the shared manifest instead of
// replacing it, so unrelated entries survive a re-render
const loadManifest = (): Record<string, { bytes: number }> => {
  try { return JSON.parse(readFileSync(MANIFEST, "utf8")); }
  catch { return {}; }
};
const manifest: Record<string, { bytes: number }> =
  (ONLY || RID) && SHARD[1] === 1 ? loadManifest() : {};
let done = 0, failed = 0;
for (const j of shardJobs) {
  const key = `${j.rid}_${j.skin}`;
  const out = join(OUT_DIR, `${key}.${FORMAT}`);
  try {
    const buf = await renderAnim(j.stand);
    writeFileSync(out, Buffer.from(buf));
    manifest[key] = { bytes: buf.length };
    done++;
    if (done % 10 === 0 || shardJobs.length < 20) console.log(`${done}/${shardJobs.length} ${key} (${(buf.length / 1024).toFixed(0)}KB)`);
  } catch (e: any) {
    failed++;
    console.warn(`FAIL ${key}: ${e.message}`);
  }
}
mkdirSync(join("data", "dist"), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(`done ${done} ok / ${failed} failed → ${OUT_DIR}`);
if (SHARD[1] !== 1) console.log(`manifest part → ${manifestPath} (merge with other shards before use)`);
