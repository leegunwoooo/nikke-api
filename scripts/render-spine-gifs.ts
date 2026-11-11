// Renders the lobby (stand) idle animation of every nikke skin to an
// animated image. Spine 4.1 canvas renderer + @napi-rs/canvas ??no
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

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as spine from "@esotericsoftware/spine-canvas";
import gifenc from "gifenc";
import nodeWebpmux from "node-webpmux";
const { Image } = nodeWebpmux;

// game atlases are premultiplied-alpha but the canvas renderer blends
// straight-alpha ??un-multiply or translucent edges render twice as dark
async function loadTextureImage(buf: Buffer, pma: boolean) {
  const img = (await loadImage(buf)) as any;
  if (!pma) return img;
  const c = createCanvas(img.width, img.height);
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, img.width, img.height);
  const px = id.data;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (!a || a === 255) continue;
    px[i] = Math.min(255, Math.round((px[i] * 255) / a));
    px[i + 1] = Math.min(255, Math.round((px[i + 1] * 255) / a));
    px[i + 2] = Math.min(255, Math.round((px[i + 2] * 255) / a));
  }
  x.putImageData(id, 0, 0);
  return c;
}
// spine-canvas tracks slot.data.blendMode but never applies it ??additive /
// multiply / screen slots render as source-over, so glow parts draw dark.
// Reapply each blend run as a canvas composite operation.
const BLEND_OPS: Record<number, GlobalCompositeOperation> = {
  [spine.BlendMode.Normal]: "source-over",
  [spine.BlendMode.Additive]: "lighter",
  [spine.BlendMode.Multiply]: "multiply",
  [spine.BlendMode.Screen]: "screen",
};

// drawTriangles is private in the typings (public at runtime) ??patch the
// instance so draw() picks up the blend-aware version.
function blendRenderer(ctx: CanvasRenderingContext2D): spine.SkeletonRenderer {
  const renderer = new spine.SkeletonRenderer(ctx);
  const r = renderer as any;
  r.drawTriangles = (skeleton: spine.Skeleton) => {
    const c = r.ctx as CanvasRenderingContext2D;
    const color = r.tempColor as spine.Color;
    const skeletonColor = skeleton.color;
    const drawOrder = skeleton.drawOrder;
    let blendMode: spine.BlendMode | null = null;
    let vertices = r.vertices as Float32Array;
    let triangles: number[] = [];
    for (let i = 0, n = drawOrder.length; i < n; i++) {
      const slot = drawOrder[i];
      const attachment = slot.getAttachment();
      let texture: any;
      if (attachment instanceof spine.RegionAttachment) {
        vertices = r.computeRegionVertices(slot, attachment, false);
        triangles = spine.SkeletonRenderer.QUAD_TRIANGLES;
        texture = (attachment.region as any).texture.getImage();
      } else if (attachment instanceof spine.MeshAttachment) {
        vertices = r.computeMeshVertices(slot, attachment, false);
        triangles = attachment.triangles;
        texture = (attachment.region as any).texture.getImage();
      } else continue;
      if (!texture) continue;
      if (slot.data.blendMode !== blendMode) {
        blendMode = slot.data.blendMode;
        c.globalCompositeOperation = BLEND_OPS[blendMode] ?? "source-over";
      }
      const slotColor = slot.color;
      const attachmentColor = attachment.color;
      color.set(
        skeletonColor.r * slotColor.r * attachmentColor.r,
        skeletonColor.g * slotColor.g * attachmentColor.g,
        skeletonColor.b * slotColor.b * attachmentColor.b,
        skeletonColor.a * slotColor.a * attachmentColor.a);
      c.globalAlpha = color.a;
      for (let j = 0; j < triangles.length; j += 3) {
        const t1 = triangles[j] * 8, t2 = triangles[j + 1] * 8, t3 = triangles[j + 2] * 8;
        r.drawTriangle(texture,
          vertices[t1], vertices[t1 + 1], vertices[t1 + 6], vertices[t1 + 7],
          vertices[t2], vertices[t2 + 1], vertices[t2 + 6], vertices[t2 + 7],
          vertices[t3], vertices[t3 + 1], vertices[t3 + 6], vertices[t3 + 7]);
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
  };
  return renderer;
}

const { GIFEncoder, quantize, applyPalette } = gifenc;
type GifManifest = Record<string, { bytes: number; ref?: string }>;

const arg = (name: string, dflt?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? "1" : v;
};
const SIZE = Number(arg("size", "384"));
const FPS = Number(arg("fps", "20"));
const PAD = 0.92; // bounds fill this fraction of the canvas
const RID = arg("rid")?.replace(/^c/i, "");
const ONLY = arg("only")?.split(",");
const ANIMS = arg("anims", "idle")!.split(","); // idle | action | delight | ...
const gifName = (key: string, anim: string) => (anim === "idle" ? key : `${key}_${anim}`);
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

const pickAnim = (data: spine.SkeletonData, name: string) => {
  const anims = data.animations;
  if (name !== "idle") return anims.find((a) => a.name === name);
  return (
    anims.find((a) => a.name === "idle") ??
    anims.find((a) => a.name === "idle_02") ??
    anims.find((a) => a.name === "idle_half") ??
    anims[0]
  );
};

async function loadStand(stand: { atlas: string; skeleton: string; texture: string }): Promise<spine.SkeletonData> {
  const [atlasBuf, skelBuf] = await Promise.all([
    fetchBuf(stand.atlas),
    fetchBuf(stand.skeleton),
  ]);
  const atlas = new spine.TextureAtlas(new TextDecoder().decode(atlasBuf));
  // a few upstream skeletons reference regions that aren't in the atlas ??  // give them a flagged degenerate region so the loader doesn't die; the
  // slots that end up with it get hidden before rendering
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
  // an atlas may span several PNG pages (e.g. Snow White's bag) ??fetch each
  // page's own file next to `texture`, whose basename is the first page's
  const pngs = await Promise.all(
    atlas.pages.map((page) => fetchBuf(new URL(page.name, stand.texture).href)),
  );
  for (const [i, page] of atlas.pages.entries())
    page.setTexture(new spine.CanvasTexture(await loadTextureImage(Buffer.from(pngs[i]), (page as any).pma) as any));
  const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(skelBuf);
  if (missing.length) {
    console.warn(`  missing atlas regions tolerated: ${[...new Set(missing)].join(", ")}`);
    (data as any)._missingRegionDummy = dummy;
  }
  return data;
}

async function renderAnim(data: spine.SkeletonData, animName: string): Promise<Uint8Array> {
  const anim = pickAnim(data, animName);
  if (!anim) throw new Error(`animation '${animName}' not in skeleton`);

  const skeleton = new spine.Skeleton(data);
  const skinName = data.skins.find((s) => s.name === "default")?.name ?? data.skins[0]?.name;
  if (skinName) skeleton.setSkinByName(skinName);
  skeleton.setSlotsToSetupPose();
  // attachments that fell back to the missing-region dummy are hidden by
  // region identity ??animations can slot them back in at any point, so the
  // check re-runs after every state.apply below
  const isMissing = (att: any) => att?.region?._missing === true;
  const stateData = new spine.AnimationStateData(data);
  const state = new spine.AnimationState(stateData);
  state.setAnimation(0, anim.name, true);

  // pose once and measure the visual AABB ??SkeletonBounds only sees
  // BoundingBoxAttachment (hitboxes), which these skeletons don't have
  state.update(1 / FPS);
  state.apply(skeleton);
  for (const slot of skeleton.slots) if (isMissing(slot.getAttachment())) slot.setAttachment(null);
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
  const renderer = blendRenderer(ctx as unknown as CanvasRenderingContext2D);
  // canvas renderer defaults to quad-only draws ??mesh attachments need this
  renderer.triangleRendering = true;
  const frameCount = Math.max(1, Math.round(anim.duration * FPS));
  const delay = 1000 / FPS;
  const gif = FORMAT === "gif" ? GIFEncoder() : undefined;
  const webpFrames: { img: Buffer; delay: number }[] = [];
  for (let f = 0; f < frameCount; f++) {
    state.update(0);
    state.apply(skeleton);
    // attachment timelines can resurrect a missing-region attachment mid-anim
    for (const slot of skeleton.slots) if (isMissing(slot.getAttachment())) slot.setAttachment(null);
    skeleton.updateWorldTransform();
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.scale(scale, -scale); // spine y-up ??canvas y-down
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

// stamp the media repo's HEAD commit so the API can pin gif urls to an
// immutable @<sha> ??@main urls get 7-day browser caching and serve stale
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
  console.log(`merged ${parts} parts ??${MANIFEST} (${Object.keys(merged).length} entries)`);
  process.exit(0);
}

// `--resync`: rebuild the manifest from the files actually in OUT_DIR (fixes
// drift after manual pushes) and stamp the media repo commit, then exit
if (arg("resync")) {
  const m: GifManifest = {};
  for (const f of readdirSync(OUT_DIR))
    if (f.endsWith(`.${FORMAT}`))
      m[f.slice(0, -(FORMAT.length + 1))] = { bytes: statSync(join(OUT_DIR, f)).size };
  mkdirSync(join("data", "dist"), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(stampVersion(m)));
  console.log(`resynced ??${MANIFEST} (${Object.keys(m).length} entries)`);
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
const loadManifest = (): GifManifest => {
  try { return JSON.parse(readFileSync(MANIFEST, "utf8")); }
  catch { return {}; }
};
const manifest: GifManifest =
  (ONLY || RID) && SHARD[1] === 1 ? loadManifest() : {};
let done = 0, failed = 0;
for (const j of shardJobs) {
  const key = `${j.rid}_${j.skin}`;
  let data: spine.SkeletonData;
  try {
    data = await loadStand(j.stand);
  } catch (e: any) {
    failed++;
    console.warn(`FAIL ${key}: ${e.message}`);
    continue;
  }
  for (const anim of ANIMS) {
    const name = gifName(key, anim);
    try {
      const buf = await renderAnim(data, anim);
      writeFileSync(join(OUT_DIR, `${name}.${FORMAT}`), Buffer.from(buf));
      manifest[name] = { bytes: buf.length };
      done++;
      if (done % 10 === 0 || shardJobs.length * ANIMS.length < 20) console.log(`${done}/${shardJobs.length * ANIMS.length} ${name} (${(buf.length / 1024).toFixed(0)}KB)`);
    } catch (e: any) {
      failed++;
      console.warn(`FAIL ${name}: ${e.message}`);
    }
  }
}
mkdirSync(join("data", "dist"), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(SHARD[1] === 1 ? stampVersion(manifest) : manifest));
console.log(`done ${done} ok / ${failed} failed ??${OUT_DIR}`);
if (SHARD[1] !== 1) console.log(`manifest part ??${manifestPath} (merge with other shards before use)`);
