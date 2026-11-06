import catalog from "../content/burst-cutscenes/catalog.json" with { type: "json" };
import type { BurstCutscene, Nikke } from "./types.js";

const bySkin = new Map<string, BurstCutscene>(catalog.entries.map(entry => {
  const base = `${catalog.assetBase}${entry.directory}/`;
  return [`${entry.resourceId}:${entry.skinIndex}`, {
    id: entry.id,
    format: "spine",
    spineVersion: entry.spineVersion,
    animation: entry.animation,
    animations: entry.animations,
    atlas: base + entry.atlas,
    skeleton: base + entry.skeleton,
    textures: entry.textures.map(name => ({ name, url: base + name })),
    viewerUrl: `${catalog.viewer}?id=${encodeURIComponent(entry.id)}&anim=${encodeURIComponent(entry.animation)}`,
    source: { name: "ArtHub", url: catalog.source, revision: catalog.commit },
  }];
}));

/** Exact skin only: an absent costume cutscene must not pretend to be the base. */
export function getBurstCutscene(resourceId: number, skinIndex = 0): BurstCutscene | null {
  return bySkin.get(`${resourceId}:${skinIndex}`) ?? null;
}

// Added at load time so old data bundles work without waiting for a refresh.
export function withBurstCutscenes(nikke: Nikke): Nikke {
  return {
    ...nikke,
    burstCutscene: getBurstCutscene(nikke.resourceId),
    costumes: nikke.costumes.map(costume => ({
      ...costume,
      burstCutscene: getBurstCutscene(nikke.resourceId, costume.skinIndex),
    })),
  };
}
