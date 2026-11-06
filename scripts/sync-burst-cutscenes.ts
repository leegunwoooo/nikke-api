import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TextureAtlas, FakeTexture, SkeletonBinary, AtlasAttachmentLoader } from "@esotericsoftware/spine-core";
import { BURST_REPO, BURST_COMMIT, BURST_ASSET_BASE, BURST_VIEWER, atlasPages, burstAnimation, selectBursts, spineVersion, type BurstEntry, type CatalogEntry } from "./burst-cutscenes.js";

// Manual, reviewed refresh. No dependency on ArtHub at API request time or
// during the daily BlablaLink sync. Only URL metadata is checked into Git.
const commit = process.argv[2] ?? BURST_COMMIT;
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Expected a full ArtHub commit SHA");
const source = `https://raw.githubusercontent.com/${BURST_REPO}/${commit}/nikki/nikki_chars.json`;

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
      const animation = burstAnimation(animations.map(a => a.name));
      if (!animation) throw new Error(`No burst animation track: ${entry.id} ${JSON.stringify(animations)}`);
      for (const page of textures) await request(base + page, { method: "HEAD" });
      return { ...entry, textures, spineVersion: version, animation, animations };
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
