import assert from "node:assert/strict";
import { test } from "node:test";
import { libraryEventId, readTranscribedStories, selectNewScripts } from "../scripts/library-stories.js";

const scenes = await readTranscribedStories();

test("MARIA-n part 1 has its 14 scenes, ready for the API", () => {
  assert.equal(scenes.length, 14);
  assert.equal(libraryEventId(scenes[0].collection), "lib_maria_n");
  for (const s of scenes) {
    assert.match(s.groupId, /^lib_maria_n_1_\d\d$/);
    assert.ok(s.name && s.lines.length);
    assert.equal(s.libraryCategory, "event_stories");
    assert.match(s.sourceVideo ?? "", /^https:\/\/youtu\.be\//);
    s.lines.forEach((l, i) => {
      assert.equal(l.id, `${s.groupId}_${i + 1}`);
      assert.ok(l.text);
      assert.ok(["Speech", "Self", "Narration"].includes(l.window));
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

test("no uploader's game nickname is left in the script", () => {
  const all = scenes.flatMap((s) => s.lines.map((l) => l.text)).join("\n");
  assert.equal((all.match(/@UserName/g) ?? []).length, 3);
  assert.doesNotMatch(all, /에르데|자동포탑/);
});

test("a transcript drops out once the same story is published elsewhere", () => {
  const published = new Set<string>();
  selectNewScripts(scenes, published);
  assert.deepEqual(selectNewScripts(scenes, published), []);
});
