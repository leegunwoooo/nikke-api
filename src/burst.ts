import catalog from "../content/burst-cutscenes/catalog.json" with { type: "json" };
import type { BurstCutscene, BurstVoiceRef, Nikke } from "./types.js";
import { burstPlayback } from "./burst-playback.js";

const bySkin = new Map<string, BurstCutscene>(catalog.entries.map(entry => {
  const base = `${catalog.assetBase}${entry.directory}/`;
  // content-hashed bursts/ entries carry an absolute URL per logical filename
  const files = (entry as { files?: Record<string, string> }).files;
  const url = (name: string) => files?.[name] ?? base + name;
  return [`${entry.resourceId}:${entry.skinIndex}`, {
    id: entry.id,
    format: "spine",
    spineVersion: entry.spineVersion,
    animation: entry.animation,
    animations: entry.animations,
    playback: burstPlayback(entry.animations, entry.animation, entry.extraLayers, entry.bgLayers, (entry as { composite?: { animation: string; role: "background" | "overlay"; transform?: [number, number, number] }[] }).composite),
    atlas: url(entry.atlas),
    skeleton: url(entry.skeleton),
    textures: entry.textures.map(name => ({ name, url: url(name) })),
    viewerUrl: `https://nikke-api.pages.dev/burst-viewer?id=${encodeURIComponent(entry.id)}`,
    source: { name: "ArtHub", url: catalog.source, revision: catalog.commit,
      viewerUrl: `${catalog.viewer}?id=${encodeURIComponent(entry.id)}&anim=${encodeURIComponent(entry.animation)}` },
  }];
}));

export const burstsById = new Map([...bySkin.values()].map(burst => [burst.id, burst]));

/** Exact skin only: an absent costume cutscene must not pretend to be the base. */
export function getBurstCutscene(resourceId: number, skinIndex = 0): BurstCutscene | null {
  return bySkin.get(`${resourceId}:${skinIndex}`) ?? null;
}

// Added at load time so old data bundles work without waiting for a refresh.
// A costume with no dedicated cutscene falls back to the base appearance's.
export function withBurstCutscenes(nikke: Nikke): Nikke {
  const base = getBurstCutscene(nikke.resourceId);
  return {
    ...nikke,
    burstCutscene: base,
    costumes: nikke.costumes.map(costume => ({
      ...costume,
      burstCutscene: getBurstCutscene(nikke.resourceId, costume.skinIndex) ?? base,
    })),
  };
}

export interface DetailVoice {
  costumeIndex?: number;
  speechId?: string;
  text?: Record<string, string>;
  voice?: { ko?: string; en?: string; ja?: string };
}

const pickVoice = (voices: DetailVoice[] | undefined, skinIndex: number, re: RegExp): BurstVoiceRef | null => {
  const v = voices?.find(x => (x.costumeIndex ?? 0) === skinIndex && re.test(x.speechId ?? ""));
  return v ? { text: v.text?.ko, audio: v.voice?.ko } : null;
};

/** Burst voice lines (Ult_Skill / Ult_Skill_Ready / FullBurst) for one skin. */
export const burstVoiceFor = (voices: DetailVoice[] | undefined, skinIndex: number) => ({
  burst: pickVoice(voices, skinIndex, /_Ult_Skill_\d+$/),
  ready: pickVoice(voices, skinIndex, /_Ult_Skill_Ready_\d+$/),
  full: pickVoice(voices, skinIndex, /_FullBurst_\d+$/),
});

/** Attach burst voice lines per skin from the detail file. Each slot falls
 * back to the base appearance's line when the skin has none. */
export function withBurstVoices(nikke: Nikke, detail: { voices?: DetailVoice[] } | null): Nikke {
  const voices = detail?.voices;
  const base = burstVoiceFor(voices, 0);
  const attach = (b: BurstCutscene | null | undefined, skinIndex: number) => {
    if (!b) return null;
    const own = burstVoiceFor(voices, skinIndex);
    return { ...b, voice: { burst: own.burst ?? base.burst, ready: own.ready ?? base.ready, full: own.full ?? base.full } };
  };
  return {
    ...nikke,
    burstCutscene: attach(nikke.burstCutscene, 0) ?? null,
    costumes: nikke.costumes.map(co => ({ ...co, burstCutscene: attach(co.burstCutscene, co.skinIndex) })),
  };
}
