/** ArtHub's reviewed catalog is an index, not a filename template. */
export { burstAnimation } from "../src/burst-playback.js";
export const BURST_REPO = "Talors1225/arthub-viewer-web";
export const BURST_COMMIT = "dba1ebc764ffd74722afe6ef2acf411931abf47c";
export const BURST_ASSET_BASE = "https://pub-bdd986c6ec274f53b01df62ac49e02e2.r2.dev/nikki/spine_carved/";
// newer catalog entries point at content-hashed objects under nikki/bursts/
export const BURST_ORIGIN = "https://pub-bdd986c6ec274f53b01df62ac49e02e2.r2.dev/";
export const BURST_VIEWER = "https://talors1225.github.io/arthub-viewer-web/nikki/viewer/cutscene.html";

export interface CatalogEntry {
  id: string;
  resourceType: string;
  cutscenes?: {
    dir: string;
    skel: string;
    atlas: string;
    compositeLayers?: { activeWhen?: string[]; animationMap?: Record<string, string>; drawOrder?: number; previewTransform?: [number, number, number] }[];
    // "bursts/" entries: logical names map to content-hashed object paths
    nativeBurst?: { atlas: string; skeleton: string; pages: Record<string, string>; skin?: string };
  }[];
}

export interface BurstEntry {
  resourceId: number;
  skinIndex: number;
  id: string;
  directory: string;
  skeleton: string;
  atlas: string;
  textures: string[];
  spineVersion: string;
  animation: string;
  animations: { name: string; duration: number }[];
  /** Extra disjoint-slot tracks played on top of the main one (verified manually). */
  extraLayers?: string[];
  /** Disjoint background planes drawn behind the main one. */
  bgLayers?: string[];
  /** Logical filename → absolute URL, for content-hashed bursts/ entries. */
  files?: Record<string, string>;
  /** ArtHub compositeLayers — the game's own layer plan (track + z-order + transform). */
  composite?: { animation: string; role: "background" | "overlay"; transform?: [number, number, number] }[];
  /** The skillcut track the composite layers pair with — wins over name guesses. */
  compositeMain?: string;
}

// Reviewed manual composition fixes — the name-based picker cannot detect
// empty tracks or disjoint overlay layers. Sync must preserve these.
export const BURST_OVERRIDES: Record<string, { animation?: string; extraLayers?: string[]; bgLayers?: string[] }> = {
  // Full-scan verified: slot-disjoint tracks are parallel scene layers, not
  // variants. main = the largest track; the rest play on top.
  c105_00_skillcut: { animation: "skillcut_2" },                    // skillcut_1 hides all slots
  c234_00_skillcut: { animation: "skillcut_2" },                    // skillcut_1 hides all but 1 slot
  c315_00_skillcut: { extraLayers: ["skillcut_2"] },                // 12-slot late effect layer
  c871_00_skillcut: { animation: "skillcut_0", extraLayers: ["skillcut_1"] }, // body + mid-scene wings/fx
  c016_00_skillcut: { animation: "skillcut_2", extraLayers: ["skillcut_1", "skillcut_3"] }, // RH body parts
  c017_01_skillcut: { animation: "skillcut_2", extraLayers: ["skillcut_1"] },
  c073_00_skillcut: { animation: "skillcut_2", bgLayers: ["skillcut_1"] },  // _1 = train interior planes
  c093_skillcut:    { animation: "skillcut_0", bgLayers: ["skillcut_1"] },  // _1 = bg plane
  c191_02_skillcut: { animation: "skillcut_2", bgLayers: ["skillcut_1"] },  // _1 = s1/s2 bg planes
  c200_00_skillcut: { extraLayers: ["skillcut_2"] },
  c223_01_skillcut: { animation: "skillcut_2", extraLayers: ["skillcut_3"], bgLayers: ["skillcut_1"] },
  c225_00_skillcut: { extraLayers: ["skillcut_3"] },                // all + 15-slot disjoint layer
  c262_00_skillcut: { animation: "skillcut_0", bgLayers: ["skillcut_1"] },  // _1 = beach/wave scene
  c262_01_skillcut: { extraLayers: ["skillcut_2"] },
  c281_02_skillcut: { animation: "skillcut_2", bgLayers: ["skillcut_1"] },  // _1 = bg plane
  c331_00_skillcut: { animation: "skillcut_2", bgLayers: ["skillcut_1"] },  // _1 = s2_bg plane
  c355_00_skillcut: { extraLayers: ["skillcut_2"] },
  c411_00_skillcut: { animation: "skillcut_2", extraLayers: ["skillcut_3"], bgLayers: ["skillcut_1"] },
  c470_02_skillcut: { extraLayers: ["skillcut_2"] },
  c582_00_skillcut: { animation: "skillcut_0", bgLayers: ["skillcut_1"] },  // _1 = bg plane
  c620_00_skillcut: { bgLayers: ["skillcut_2"] },                   // _2 = desk/object scene under char
  c833_00_skillcut: { animation: "skillcut_2", bgLayers: ["skillcut_1"] },  // _1 = s1_bg0 plane
  c094_00_skillcut: { animation: "skillcut_2_OFF_MOVE_BIG" },       // OFF variants: _2 is the real scene
  c580_01_skillcut: { animation: "skillcut_2", bgLayers: ["skillcut_3"] },  // _3 = building planes
};

// The source really uses slillcut/skillut, and sometimes puts the skin last.
// Unrecognized "skill" entries (e.g. c821_01) must not become guessed bursts.
export function resourceKey(file: string): { resourceId: number; skinIndex: number } | null {
  const match = /^c(\d+)(?:_(\d+))?_(?:skillcut|slillcut|skillut)(?:_(\d+))?\.skel$/.exec(file);
  if (!match || (match[2] && match[3])) return null;
  return { resourceId: Number(match[1]), skinIndex: Number(match[2] ?? match[3] ?? 0) };
}

export function assetName(name: string): string {
  if (!/^[\w.-]+$/.test(name) || name === "." || name === "..") throw new Error(`Invalid asset name: ${name}`);
  return name;
}

export function atlasPages(atlas: string): string[] {
  const pages: string[] = [];
  let nextPage = true;
  for (const line of atlas.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const text = line.trim();
    if (!text) { nextPage = true; continue; }
    if (nextPage) {
      if (!/\.(png|webp)$/i.test(text)) throw new Error(`Invalid atlas page: ${text}`);
      pages.push(assetName(text));
      nextPage = false;
    }
  }
  if (!pages.length || new Set(pages).size !== pages.length) throw new Error("Empty or duplicate atlas pages");
  return pages;
}

/** Spine 4.1 binary header: 8-byte hash, varint length, UTF-8 version. */
export function spineVersion(bytes: Uint8Array): string {
  const length = bytes[8];
  if (!length || length > 32 || bytes.length < 9 + length - 1) throw new Error("Invalid Spine header");
  const version = new TextDecoder().decode(bytes.subarray(9, 9 + length - 1));
  if (!/^4\.1\.\d+$/.test(version)) throw new Error(`Unsupported Spine version: ${version}`);
  return version;
}

export function selectBursts(entries: CatalogEntry[]) {
  const selected = new Map<string, Omit<BurstEntry, "textures" | "spineVersion" | "animation" | "animations">>();
  for (const entry of entries) {
    if (entry.resourceType !== "skill" || entry.cutscenes?.length !== 1) continue;
    const variant = entry.cutscenes[0];
    // These two names were reviewed in ArtHub and verified to contain
    // skillcut_1. Never infer a burst from an arbitrary lobby-like filename.
    const reviewed: Record<string, { file: string; resourceId: number; skinIndex: number }> = {
      "catalog-c470_00_z_f": { file: "c470_00_z_f.skel", resourceId: 470, skinIndex: 0 },
      "c821_01": { file: "c821_01.skel", resourceId: 821, skinIndex: 1 },
    };
    const alias = reviewed[entry.id];
    const key = resourceKey(variant.skel) ?? (alias?.file === variant.skel ? { resourceId: alias.resourceId, skinIndex: alias.skinIndex } : null);
    if (!key) continue;
    // Layers that only attach to non-skillcut tracks (e.g. an idle backdrop)
    // never overlap the burst itself. Skillcut-active compositeLayers are the
    // game's own composition data — derive the layer plan instead of guessing.
    const active = (variant.compositeLayers ?? []).filter((l) => !l.activeWhen?.length || l.activeWhen.some((a) => /skill[_-]?cut/i.test(a)));
    let composite: BurstEntry["composite"];
    let compositeMain: string | undefined;
    if (active.length) {
      const mapped = active.map((l) => ({
        ...l,
        pairs: Object.entries(l.animationMap ?? {}).filter(([base]) => /skill[_-]?cut/i.test(base)),
      }));
      const mains = [...new Set(mapped.flatMap((l) => l.pairs.map(([b]) => b)))];
      if (mains.length !== 1 || mapped.some((l) => !l.pairs.length)) throw new Error(`Composite burst needs explicit support: ${entry.id}`);
      compositeMain = mains[0];
      composite = mapped.map((l) => ({
        animation: l.pairs.find(([b]) => b === compositeMain)![1],
        role: ((l.drawOrder ?? 0) < 0 ? "background" : "overlay") as "background" | "overlay",
        ...(l.previewTransform ? { transform: l.previewTransform } : {}),
      }));
    }
    const native = variant.nativeBurst;
    let directory: string;
    let files: Record<string, string> | undefined;
    if (variant.dir === "bursts/") {
      if (!native) throw new Error(`bursts/ entry without nativeBurst: ${entry.id}`);
      const paths = { [variant.atlas]: native.atlas, [variant.skel]: native.skeleton, ...native.pages };
      files = Object.fromEntries(Object.entries(paths).map(([name, p]) => {
        if (!/^[\w./-]+$/.test(p)) throw new Error(`Invalid nativeBurst path: ${p}`);
        return [name, BURST_ORIGIN + p];
      }));
      directory = "bursts";
    } else {
      directory = /^spine\/([\w.-]+)\/$/.exec(variant.dir)?.[1] ?? (() => { throw new Error(`Invalid directory: ${variant.dir}`); })();
    }
    const candidate = { ...key, id: assetName(entry.id), directory: assetName(directory), skeleton: assetName(variant.skel), atlas: assetName(variant.atlas), ...(files ? { files } : {}), ...(composite ? { composite, compositeMain } : {}) };
    const k = `${key.resourceId}:${key.skinIndex}`;
    const old = selected.get(k);
    // Explicit skin numbers beat old unsuffixed variants; reconstructed
    // catalog entries beat legacy duplicates, and spine/ paths beat the
    // content-hashed bursts/ mirror of the same cutscene. Ties must be reviewed.
    const rank = (x: typeof candidate) =>
      Number(/_\d+_/.test(x.skeleton)) * 2 + Number(x.id.startsWith("catalog-")) + Number(x.directory !== "bursts");
    if (old && rank(old) === rank(candidate)) throw new Error(`Ambiguous burst ${k}: ${old.id}, ${candidate.id}`);
    if (!old || rank(candidate) > rank(old)) selected.set(k, candidate);
  }
  return [...selected.values()].sort((a, b) => a.resourceId - b.resourceId || a.skinIndex - b.skinIndex);
}
