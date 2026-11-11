// Renders every burst cutscene in content/burst-cutscenes/catalog.json to an
// animated GIF — same headless approach as render-spine-gifs.ts (spine-canvas
// + @napi-rs/canvas), but cutscenes are multi-layer: the viewer plays one
// Skeleton per playback layer on a shared timeline, so we do the same and
// composite the layers in order (backgrounds → main → overlays).
//
//   npx tsx scripts/render-burst-gifs.ts                      # all cutscenes
//   npx tsx scripts/render-burst-gifs.ts --rid 10             # one character
//   npx tsx scripts/render-burst-gifs.ts --only 10_0,352_2    # specific skins
//   npx tsx scripts/render-burst-gifs.ts --shard 0/4          # quarter of jobs
//   npx tsx scripts/render-burst-gifs.ts --resync             # rebuild manifest
//   npx tsx scripts/render-burst-gifs.ts --merge 4            # merge shard parts
//
// Output: ../nikke-api-media/burst-gif/<resourceId>_<skinIndex>.gif plus
// data/dist/burst-gif-manifest.json (sizes + media repo commit for pinning).

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as spine from "@esotericsoftware/spine-canvas";
import gifenc from "gifenc";
import { burstPlayback } from "../src/burst-playback.js";
import catalog from "../content/burst-cutscenes/catalog.json" with { type: "json" };

const { GIFEncoder, quantize, applyPalette } = gifenc;
type GifManifest = Record<string, { bytes: number; ref?: string }>;

const arg = (name: string, dflt?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? "1" : v;
};
const SIZE = Number(arg("size", "512"));
const SS = Number(arg("ss", "4")); // supersample factor — hides mesh seams
const FPS = Number(arg("fps", "20"));
const PAD = 0.94; // bounds fill this fraction of the canvas
const RID = arg("rid")?.replace(/^c/i, "");
const ONLY = arg("only")?.split(",");
const OUT_DIR = arg("out", join("..", "nikke-api-media", "burst-gif"))!;
const MANIFEST = join("data", "dist", "burst-gif-manifest.json");
const SHARD = (() => {
  const s = arg("shard", "0/1")!.split("/").map(Number);
  return [s[0] ?? 0, s[1] || 1] as const;
})();

const fetchBuf = async (url: string): Promise<ArrayBuffer> => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r.arrayBuffer();
      if (r.status === 404) throw new Error(`404 ${url}`);
    } catch (e: any) {
      if (i >= 3 || /404/.test(e.message)) throw e;
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
};

// stamp the media repo's HEAD commit so the API can pin gif urls to an
// immutable @<sha> — @main urls get 7-day browser caching and serve stale
// renders long after a fix is pushed
const mediaRef = () => {
  try {
    return execSync(`git -C "${join(OUT_DIR, "..")}" rev-parse HEAD`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
  } catch { return undefined; }
};
const stampVersion = (m: GifManifest) => {
  const ref = mediaRef();
  if (ref) m["version"] = { bytes: 0, ref };
  return m;
};

// `--merge N`: merge part manifests written by `--shard k/N` runs, then exit
if (arg("merge")) {
  const parts = Number(arg("merge"));
  const merged: GifManifest = {};
  for (let k = 0; k < parts; k++)
    Object.assign(merged, JSON.parse(readFileSync(`${MANIFEST}.part${k}`, "utf8")));
  mkdirSync(join("data", "dist"), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(stampVersion(merged)));
  console.log(`merged ${parts} parts → ${MANIFEST} (${Object.keys(merged).length} entries)`);
  process.exit(0);
}

// `--resync`: rebuild the manifest from the files actually in OUT_DIR and
// stamp the media repo commit, then exit
if (arg("resync")) {
  const m: GifManifest = {};
  for (const f of readdirSync(OUT_DIR))
    if (f.endsWith(".gif")) m[f.slice(0, -4)] = { bytes: statSync(join(OUT_DIR, f)).size };
  mkdirSync(join("data", "dist"), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(stampVersion(m)));
  console.log(`resynced → ${MANIFEST} (${Object.keys(m).length} entries)`);
  process.exit(0);
}

interface BurstEntry {
  resourceId: number;
  skinIndex: number;
  id: string;
  directory: string;
  skeleton: string;
  atlas: string;
  textures: string[];
  animation: string;
  animations: { name: string; duration: number }[];
  extraLayers?: string[];
  bgLayers?: string[];
  files?: Record<string, string>;
}

async function loadCutscene(entry: BurstEntry): Promise<spine.SkeletonData> {
  const base = `${catalog.assetBase}${entry.directory}/`;
  const urlOf = (name: string) => entry.files?.[name] ?? base + name;
  const [atlasBuf, skelBuf] = await Promise.all([
    fetchBuf(urlOf(entry.atlas)),
    fetchBuf(urlOf(entry.skeleton)),
  ]);
  const atlas = new spine.TextureAtlas(new TextDecoder().decode(atlasBuf));
  // tolerate upstream skeletons that reference regions missing from the atlas —
  // a flagged degenerate region keeps the loader alive and the affected
  // attachments get hidden at render time
  const missing: string[] = [];
  const dummy = new spine.TextureAtlasRegion(atlas.pages[0], "__missing__") as any;
  dummy.u = dummy.v = dummy.u2 = dummy.v2 = 0;
  dummy.width = dummy.height = dummy.originalWidth = dummy.originalHeight = 1;
  dummy.offsetX = dummy.offsetY = 0;
  dummy._missing = true;
  const origFind = atlas.findRegion.bind(atlas);
  (atlas as any).findRegion = (name: string) => {
    const r = origFind(name);
    if (r) return r;
    missing.push(name);
    return dummy;
  };
  // textures come from the catalog, but page names are authoritative —
  // an atlas may span several PNGs and each needs its own file
  const pngs = await Promise.all(
    atlas.pages.map((page) => fetchBuf(entry.files?.[page.name] ?? new URL(page.name, base + entry.textures[0]).href)),
  );
  for (const [i, page] of atlas.pages.entries())
    page.setTexture(new spine.CanvasTexture(await loadImage(Buffer.from(pngs[i])) as any));
  const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(skelBuf));
  if (missing.length)
    console.warn(`  missing atlas regions tolerated: ${[...new Set(missing)].join(", ")}`);
  return data;
}

// mirrors viewer/burst-scene.ts: one Skeleton per layer on a shared timeline
interface SceneLayer { skeleton: spine.Skeleton; state: spine.AnimationState; animation: string }

function makeScene(data: spine.SkeletonData, entry: BurstEntry): { layers: SceneLayer[]; duration: number } {
  const playback = burstPlayback(entry.animations, entry.animation, entry.extraLayers, entry.bgLayers);
  const layers = playback.layers.map((layer) => {
    const skeleton = new spine.Skeleton(data);
    if (skeleton.drawOrder.every((slot) => !slot.attachment) && data.skins.length)
      for (const skin of data.skins) skeleton.setSkin(skin);
    const state = new spine.AnimationState(new spine.AnimationStateData(data));
    return { skeleton, state, animation: layer.animation };
  });
  return { layers, duration: playback.duration };
}

const seek = (layers: SceneLayer[], t: number) => {
  for (const layer of layers) {
    layer.skeleton.setToSetupPose();
    layer.state.clearTracks();
    const track = layer.state.setAnimation(0, layer.animation, false);
    track.trackTime = t;
    layer.state.apply(layer.skeleton);
    layer.skeleton.updateWorldTransform();
  }
};

const isMissing = (att: any) => att?.region?._missing === true;

// visual bounds of one layer's skeleton — unioned across all layers so the
// background planes stay in frame instead of cropping to the character
function measureBounds(skeleton: spine.Skeleton) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const slot of skeleton.drawOrder) {
    const att: any = slot.attachment;
    if (!slot.bone.active || slot.color.a < 0.001 || isMissing(att) || !att) continue;
    const kind = att.constructor.name;
    if (kind !== "MeshAttachment" && kind !== "RegionAttachment") continue;
    if (att.color?.a < 0.001) continue;
    const len = kind === "MeshAttachment" ? (att.worldVerticesLength ?? 8) : 8;
    const verts = new Float32Array(len);
    if (kind === "MeshAttachment") att.computeWorldVertices(slot, 0, len, verts, 0, 2);
    else att.computeWorldVertices(slot, verts, 0, 2);
    for (let i = 0; i < len; i += 2) {
      minX = Math.min(minX, verts[i]); maxX = Math.max(maxX, verts[i]);
      minY = Math.min(minY, verts[i + 1]); maxY = Math.max(maxY, verts[i + 1]);
    }
  }
  return { minX, minY, maxX, maxY };
}

async function renderBurst(data: spine.SkeletonData, entry: BurstEntry): Promise<Uint8Array> {
  const { layers, duration } = makeScene(data, entry);
  // characters often enter mid-cutscene (the first seconds can be bg-only),
  // so a single-timestamp bound may be empty or miss the widest pose — union
  // the main layer's visible bounds across the whole timeline. Background
  // planes span tens of thousands of world units, so unioning them would
  // shrink the character to a dot; they still draw inside the frame
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let t = 0; t <= duration; t += 0.5) {
    seek(layers, t);
    const b = measureBounds(layers[layers.length - 1].skeleton);
    if (b.minX === Infinity) continue;
    minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX);
    minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY);
  }
  if (minX === Infinity) throw new Error("main layer never visible");
  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);
  const scale = (Math.min(SIZE / bw, SIZE / bh) * PAD) || 1;
  const cx = minX + bw / 2;
  const cy = minY + bh / 2;

  // render large then downscale — the canvas renderer leaves visible seams
  // along mesh triangle edges on big planes, and supersampling blurs them out
  const hi = createCanvas(SIZE * SS, SIZE * SS);
  const hctx = hi.getContext("2d");
  const renderer = new spine.SkeletonRenderer(hctx as unknown as CanvasRenderingContext2D);
  renderer.triangleRendering = true;
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";

  const frameCount = Math.max(1, Math.round(duration * FPS));
  const delay = 1000 / FPS;
  const gif = GIFEncoder();
  for (let f = 0; f < frameCount; f++) {
    seek(layers, f / FPS);
    // burst is a cinematic, not a sticker — keep the scene background and
    // letterbox what the cutscene itself doesn't cover (like the game does)
    hctx.fillStyle = "#000";
    hctx.fillRect(0, 0, SIZE * SS, SIZE * SS);
    hctx.save();
    hctx.translate((SIZE * SS) / 2, (SIZE * SS) / 2);
    hctx.scale(scale * SS, -scale * SS);
    hctx.translate(-cx, -cy);
    for (const layer of layers) {
      for (const slot of layer.skeleton.slots) if (isMissing(slot.getAttachment())) slot.setAttachment(null);
      renderer.draw(layer.skeleton);
    }
    hctx.restore();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(hi as any, 0, 0, SIZE, SIZE);
    const { data: rgba } = ctx.getImageData(0, 0, SIZE, SIZE);
    const palette = quantize(rgba, 256, { format: "rgb565" });
    const index = applyPalette(rgba, palette, "rgb565");
    gif.writeFrame(index, SIZE, SIZE, { palette, delay });
  }
  gif.finish();
  return gif.bytes();
}

const entries = (catalog.entries as BurstEntry[]).filter((e) => {
  if (RID && Number(e.resourceId) !== Number(RID)) return false;
  if (ONLY && !ONLY.includes(`${e.resourceId}_${e.skinIndex}`)) return false;
  return true;
});
const shardJobs = entries.filter((_, i) => i % SHARD[1] === SHARD[0]);

mkdirSync(OUT_DIR, { recursive: true });
const manifestPath = SHARD[1] === 1 ? MANIFEST : `${MANIFEST}.part${SHARD[0]}`;
const loadManifest = (): GifManifest => {
  try { return JSON.parse(readFileSync(MANIFEST, "utf8")); }
  catch { return {}; }
};
const manifest: GifManifest = (ONLY || RID) && SHARD[1] === 1 ? loadManifest() : {};
let done = 0, failed = 0;
for (const entry of shardJobs) {
  const key = `${entry.resourceId}_${entry.skinIndex}`;
  try {
    const data = await loadCutscene(entry);
    const buf = await renderBurst(data, entry);
    writeFileSync(join(OUT_DIR, `${key}.gif`), Buffer.from(buf));
    manifest[key] = { bytes: buf.length };
    done++;
    if (done % 10 === 0 || shardJobs.length < 20) console.log(`${done}/${shardJobs.length} ${key} (${(buf.length / 1024).toFixed(0)}KB)`);
  } catch (e: any) {
    failed++;
    console.warn(`FAIL ${key}: ${e.message}`);
  }
}
mkdirSync(join("data", "dist"), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(SHARD[1] === 1 ? stampVersion(manifest) : manifest));
console.log(`done ${done} ok / ${failed} failed → ${OUT_DIR}`);
if (SHARD[1] !== 1) console.log(`manifest part → ${manifestPath} (merge with other shards before use)`);
