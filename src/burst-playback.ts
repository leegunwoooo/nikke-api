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

export function burstPlayback(animations: { name: string; duration: number }[]): BurstPlayback {
  const main = burstAnimation(animations.map(a => a.name));
  if (!main) throw new Error("No burst animation");
  const duration = animations.find(a => a.name === main)!.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid duration: ${main}`);
  const background = /(?:^|_)all(?:_|$)/i.test(main) ? undefined : animations.find(a =>
    a.name === `bg_${main}` || a.name === `${main}_bg`);
  if (background && Math.abs(background.duration - duration) > 0.02) {
    throw new Error(`Background timing needs review: ${main}, ${background.name}`);
  }
  return {
    mode: background ? "composite" : "single",
    duration,
    layers: [
      ...(background ? [{ role: "background" as const, animation: background.name }] : []),
      { role: "main", animation: main },
    ],
  };
}
