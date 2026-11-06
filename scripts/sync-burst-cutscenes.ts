import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TextureAtlas, FakeTexture, SkeletonBinary, AtlasAttachmentLoader, Skeleton, AnimationState, AnimationStateData, type SkeletonData } from "@esotericsoftware/spine-core";
import { burstPlayback } from "../src/burst-playback.js";
import { BURST_REPO, BURST_COMMIT, BURST_ASSET_BASE, BURST_VIEWER, atlasPages, burstAnimation, selectBursts, spineVersion, BURST_OVERRIDES, type BurstEntry, type CatalogEntry } from "./burst-cutscenes.js";

// Manual, reviewed refresh. No dependency on ArtHub at API request time or
// during the daily BlablaLink sync. Only URL metadata is checked into Git.
const commit = process.argv[2] ?? BURST_COMMIT;
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Expected a full ArtHub commit SHA");
const source = `https://raw.githubusercontent.com/${BURST_REPO}/${commit}/nikki/nikki_chars.json`;

// Some "burst" tracks hide every slot (e.g. c105's skillcut_1); names alone
// cannot tell them apart. Sample the whole track — a short blackout is fine
// (e.g. c074), but a pick must be visible for most of its duration.
const visibleAt = (data: SkeletonData, skeleton: Skeleton, animation: string, t: number) => {
  skeleton.setToSetupPose();
  const state = new AnimationState(new AnimationStateData(data));
  state.setAnimation(0, animation, false).trackTime = t;
  state.apply(skeleton);
  let count = 0;
  for (const slot of skeleton.drawOrder) if (slot.attachment && slot.color.a > 0.01) count++;
  return count;
};

const coverage = (data: SkeletonData, animation: string, duration: number, samples = 8) => {
  const skeleton = new Skeleton(data);
  // Named skins (e.g. "00") hold every attachment on some files.
  if (skeleton.drawOrder.every(slot => !slot.attachment)) for (const skin of data.skins) skeleton.setSkin(skin);
  let hit = 0;
  for (let i = 1; i <= samples; i++) if (visibleAt(data, skeleton, animation, duration * i / (samples + 1)) > 0) hit++;
  return hit / samples;
};

const visibleBurst = (data: SkeletonData, animations: { name: string; duration: number }[]): string | null => {
  const first = burstAnimation(animations.map(a => a.name));
  const candidates = [first, ...animations.map(a => a.name).filter(n => /^skill[_-]?cut(?:_|\d|$)/i.test(n) && n !== first && !/(?:^|_)bg(?:_|$)/i.test(n))];
  let best: { name: string; cov: number } | null = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    const cov = coverage(data, candidate, animations.find(a => a.name === candidate)!.duration);
    if (cov >= 0.5) return candidate;
    if (!best || cov > best.cov) best = { name: candidate, cov };
  }
  return best && best.cov > 0 ? best.name : null;
};

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (response.ok) return response;
      await response.body?.cancel();
      if (response.status === 404) throw new Error(`Missing asset: ${url}`);
      throw new Error(`HTTP ${response.status}: ${url}`);
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

async function main() {
  const raw = await (await request(source)).json() as { characters: CatalogEntry[] };
  if (!Array.isArray(raw.characters)) throw new Error("Invalid ArtHub catalog");
  const selected = selectBursts(raw.characters);
  if (!selected.length) throw new Error("No burst entries — refusing to overwrite catalog");
  const entries: BurstEntry[] = [];
  for (let i = 0; i < selected.length; i += 4) {
    const batch = await Promise.all(selected.slice(i, i + 4).map(async entry => {
      const base = `${BURST_ASSET_BASE}${entry.directory}/`;
      const atlas = await (await request(base + entry.atlas)).text();
      const textures = atlasPages(atlas);
      const bytes = new Uint8Array(await (await request(base + entry.skeleton)).arrayBuffer());
      const version = spineVersion(bytes);
      const parsedAtlas = new TextureAtlas(atlas);
      for (const page of parsedAtlas.pages) {
        // Headless metadata parsing needs dimensions, not a WebGL texture.
        page.setTexture(new FakeTexture({ width: page.width, height: page.height } as HTMLImageElement));
      }
      const skeleton = new SkeletonBinary(new AtlasAttachmentLoader(parsedAtlas)).readSkeletonData(bytes);
      const animations = skeleton.animations.map(a => ({ name: a.name, duration: Number(a.duration.toFixed(4)) }));
      const override = BURST_OVERRIDES[entry.id];
      let animation = visibleBurst(skeleton, animations);
      if (!animation) throw new Error(`No visible burst animation track: ${entry.id} ${JSON.stringify(animations)}`);
      if (override?.animation && !animations.some(a => a.name === override.animation)) throw new Error(`Override missing: ${entry.id} ${override.animation}`);
      if (override?.animation) animation = override.animation;
      const extraLayers = override?.extraLayers;
      burstPlayback(animations, animation, extraLayers); // Includes background timing validation.
      for (const page of textures) await request(base + page, { method: "HEAD" });
      return { ...entry, textures, spineVersion: version, animation, animations, ...(extraLayers ? { extraLayers } : {}) };
    }));
    entries.push(...batch);
    console.log(`Verified ${entries.length}/${selected.length} bursts`);
  }
  const output = path.resolve("content/burst-cutscenes/catalog.json");
  await mkdir(path.dirname(output), { recursive: true });
  // Do not replace a working manifest until every referenced file passes.
  await writeFile(output, JSON.stringify({ source, commit, assetBase: BURST_ASSET_BASE, viewer: BURST_VIEWER, entries }, null, 2) + "\n");
  console.log(`${entries.length} verified bursts written to ${output}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
