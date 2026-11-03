// The game's own chapter for each main scene, from its scene list. Numbers in the
// ids don't say: d_main_01 holds chapters 0 and 1, and some after-stories sit a
// number below their chapter (d_main_24af_04 is Chapter 25).
export function mainChaptersFromList(list: any[]) {
  const out = new Map<string, { chapter: number; chapterStep: number }>();
  for (const c of list) {
    (c.sub_category_id?.scenes?.value ?? []).forEach((s: any, chapterStep: number) => {
      const gid = s.value?.scenario_group_id;
      if (gid) out.set(gid, { chapter: c.sub_category_id.value, chapterStep });
    });
  }
  return out;
}
