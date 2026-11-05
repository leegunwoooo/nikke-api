import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupKeys, libraryEventId, readTranscribedStories, selectLibraryScenes, selectNewScripts } from "../scripts/library-stories.js";

const scenes = await readTranscribedStories();

test("MARIA-n parts 1 and 2 have their 27 scenes, ready for the API", () => {
  assert.equal(scenes.length, 27);
  assert.equal(libraryEventId(scenes[0].collection), "lib_maria_n");
  for (const s of scenes) {
    assert.match(s.groupId, /^lib_maria_n_[12]_\d\d$/);
    assert.ok(s.name && s.lines.length);
    assert.equal(s.libraryCategory, "event_stories");
    assert.match(s.sourceVideo ?? "", /^https:\/\/youtu\.be\//);
    s.lines.forEach((l, i) => {
      assert.equal(l.id, `${s.groupId}_${i + 1}`);
      assert.ok(l.text);
      assert.ok(["Speech", "Self", "Narration", "Choice"].includes(l.window));
      assert.equal(Boolean(l.speakerName), l.window === "Speech");
    });
  }
});

test("silent lines and one-button replies stay in the script", () => {
  const texts = (groupId: string) => scenes.find((s) => s.groupId === groupId)!.lines.map((l) => l.text);
  const enic = texts("lib_maria_n_1_05");
  assert.equal(enic[enic.indexOf("여기까지 맞습니까?") + 1], "…….");
  const seven = scenes.find((s) => s.groupId === "lib_maria_n_1_13")!.lines;
  const flee = seven.findIndex((l) => l.text === "튀자고요?");
  assert.equal(seven[flee - 1].text, "튀자.");
  assert.equal(seven[flee - 1].window, "Self");
});

test("short lines OCR can't read stay in the script", () => {
  const lines = (groupId: string) => scenes.find((s) => s.groupId === groupId)!.lines;
  const part2 = lines("lib_maria_n_2_01");
  const why = part2.findIndex((l) => l.text === "왜… 요?");
  assert.deepEqual([part2[why - 1].text, part2[why - 1].window], ["응.", "Self"]);
  const last = lines("lib_maria_n_2_12");
  assert.equal(last.at(-1)!.text, "PROJECT SILVER GUN : END");
  assert.ok(last.some((l) => l.text === "제발… 제발…!" && l.window === "Narration"));
  assert.ok(lines("lib_maria_n_1_13").some((l) => l.text === "하하하하하하…."));
});

test("no uploader's game nickname is left in the script", () => {
  const all = scenes.flatMap((s) => s.lines.map((l) => l.text)).join("\n");
  assert.equal((all.match(/@UserName/g) ?? []).length, 5);
  assert.doesNotMatch(all, /에르데|자동포탑|MIKHAIL|저는 케이|^케이\.$/m);
});

test("part 2's one real choice keeps both options", () => {
  const lines = scenes.find((s) => s.groupId === "lib_maria_n_2_01")!.lines;
  const options = lines.filter((l) => l.window === "Choice");
  assert.deepEqual(options.map((l) => l.branch), ["1.1", "1.2"]);
  assert.deepEqual(scenes.flatMap((s) => s.lines).filter((l) => l.window === "Choice"), options);
  assert.equal(lines[lines.indexOf(options[1]) + 1].text, "…!!");
});

test("a transcript replaying main-story lines stays until nearly all of it is published", () => {
  const scene = scenes.find((s) => s.groupId === "lib_maria_n_2_12")!;
  const keys = dedupKeys(scene.lines);
  const kept = selectLibraryScenes([], scenes, new Set(keys.slice(0, Math.floor(keys.length * 0.6))));
  assert.equal(kept.length, scenes.length);
  assert.ok(!selectLibraryScenes([], scenes, new Set(keys)).includes(scene));
});

test("a published copy removes the whole transcript file, even where its lines differ", () => {
  const part = (n: number) => scenes.filter((s) => s.groupId.startsWith(`lib_maria_n_${n}_`));
  const keys = dedupKeys(part(1).flatMap((s) => s.lines));
  // every scene falls under the per-scene cutoff: only 3 in 4 lines match
  const copy = new Set(keys.filter((_, i) => i % 4));
  assert.deepEqual(selectLibraryScenes([], scenes, copy), part(2));
});

test("archive scenes win over a transcript of the same story", () => {
  const part1 = scenes.filter((s) => s.groupId.startsWith("lib_maria_n_1_"));
  const archive = part1.map((s) => ({ ...s, groupId: s.groupId.replace("maria_n", "archived"), sourceVideo: undefined }));
  const kept = selectLibraryScenes(archive, scenes, new Set());
  assert.ok(!kept.some((s) => part1.includes(s)));
  assert.equal(kept.length, scenes.length);
});

test("a transcript drops out once the same story is published elsewhere", () => {
  const published = new Set<string>();
  selectNewScripts(scenes, published);
  assert.deepEqual(selectNewScripts(scenes, published), []);
});
