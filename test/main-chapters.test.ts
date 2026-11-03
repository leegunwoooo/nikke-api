import assert from "node:assert/strict";
import { test } from "node:test";
import { mainChaptersFromList } from "../scripts/main-chapters.js";

const chapter = (value: number, ids: string[]) => ({
  sub_category_id: { value, scenes: { value: ids.map((scenario_group_id) => ({ value: { scenario_group_id } })) } },
});

test("chapters come from the scene list, not the numbers in the ids", () => {
  const m = mainChaptersFromList([
    chapter(0, ["d_main_01_01_s", "d_main_01_01_e"]),
    chapter(1, ["d_main_01_04_s", "d_main_01af_01"]),
    chapter(25, ["d_main_24af_04", "d_main_25_01"]),
    chapter(50, ["d_main_50_01"]),
  ]);
  assert.deepEqual(m.get("d_main_01_01_e"), { chapter: 0, chapterStep: 1 }); // _s plays before _e
  assert.equal(m.get("d_main_01af_01")?.chapter, 1);
  assert.equal(m.get("d_main_24af_04")?.chapter, 25);
  assert.equal(m.get("d_main_50_01")?.chapter, 50);
});
