import type { BurstPlayback } from "./types.js";

/** Prefer an authored complete cutscene over its separate character/bg tracks. */
export function burstAnimation(names: string[]): string | null {
  const combined = names.find(name => /(?:^|_)all(?:_|$)/i.test(name) && /skill[_-]?cut/i.test(name) && !/(?:^|_)bg(?:_|$)/i.test(name));
  if (combined) return combined;
  for (const preferred of ["skillcut_1", "skill_cut", "skill_01", "skilcut_1"]) {
    if (names.includes(preferred)) return preferred;
  }
  return names.find(name => /^skill[_-]?cut(?:_|\d|$)/i.test(name) && !/(?:^|_)bg(?:_|$)/i.test(name)) ?? null;
}

export function burstPlayback(animations: { name: string; duration: number }[], preferred?: string, overlay?: string[]): BurstPlayback {
  // A catalog-verified pick wins — some tracks (e.g. c105's skillcut_1) hide
  // every slot, and names alone cannot tell a burst track from an empty one.
  const names = animations.map(a => a.name);
  const main = preferred && names.includes(preferred) ? preferred : burstAnimation(names);
  if (!main) throw new Error("No burst animation");
  const duration = animations.find(a => a.name === main)!.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid duration: ${main}`);
  const background = /(?:^|_)all(?:_|$)/i.test(main) ? undefined : animations.find(a =>
    a.name === `bg_${main}` || a.name === `${main}_bg`);
  const layers: BurstPlayback["layers"] = [
    ...(background ? [{ role: "background" as const, animation: background.name }] : []),
    { role: "main" as const, animation: main },
  ];
  // Disjoint-slot overlay tracks that join mid-scene (e.g. c871's skillcut_1)
  // share the timeline and draw on top of the main layer. They may be shorter
  // or longer than the main track — their slots just go dark when they end.
  for (const name of overlay ?? []) {
    if (!animations.some(a => a.name === name)) throw new Error(`Missing overlay animation: ${name}`);
    layers.push({ role: "overlay" as const, animation: name });
  }
  if (background && Math.abs(background.duration - duration) > 0.02) {
    throw new Error(`Background timing needs review: ${main}, ${background.name}`);
  }
  return {
    mode: layers.length > 1 ? "composite" : "single",
    duration,
    layers,
  };
}
