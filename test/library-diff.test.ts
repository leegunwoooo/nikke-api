import assert from "node:assert/strict";
import { test } from "node:test";
import { diffLibrary, renderIssue } from "../scripts/library-diff.js";
import type { LibraryScene } from "../scripts/library-stories.js";

const scene = (groupId: string, texts: string[], extra: Partial<LibraryScene> = {}): LibraryScene => ({
  groupId,
  type: "library",
  name: "이름",
  collection: "묶음",
  libraryCategory: "event_stories",
  lines: texts.map((text, i) => ({ id: `${groupId}_${i}`, text, window: "Narration", voice: null })),
  ...extra,
});

test("diff finds added, removed and changed scenes", () => {
  const d = diffLibrary(
    [scene("same", ["가", "나"]), scene("edit", ["가", "나", "다"]), scene("gone", ["가"]), scene("meta", ["가"])],
    [scene("same", ["가", "나"]), scene("edit", ["가", "고침", "다", "추가"]), scene("new", ["가"]), scene("meta", ["가"], { name: "새 이름" })],
  );
  assert.deepEqual(d.added.map((s) => s.groupId), ["new"]);
  assert.deepEqual(d.removed.map((s) => s.groupId), ["gone"]);
  assert.deepEqual(d.changed.map((c) => [c.scene.groupId, c.lines]), [["edit", 2], ["meta", 0]]);
});

test("moved lines and renumbered ids aren't changes", () => {
  const d = diffLibrary([scene("a", ["가", "나"])], [scene("a", ["나", "가"])]);
  assert.deepEqual(d.changed, []);
});

test("an id filed under two categories is compared within its category", () => {
  const both = [scene("a", ["가"]), scene("a", ["다른 내용"], { libraryCategory: "special_stories" })];
  assert.deepEqual(diffLibrary(both, both).changed, []);
});

const render = (diff: ReturnType<typeof diffLibrary>, warnings: string[] = []) =>
  renderIssue({ repo: "o/r", base: "a".repeat(40), head: "b".repeat(40), diff, warnings, baseWarnings: 0 });

test("issue says what changed and how to apply it, carrying the head marker", () => {
  const body = render(diffLibrary([], [scene("x", ["가"]), scene("y", ["나"])]));
  assert.ok(body.startsWith(`<!-- library-watch:${"b".repeat(40)} -->`));
  assert.match(body, /`event_stories` `묶음`: 2개/);
  assert.match(body, /LIBRARY_COMMIT/);
  assert.match(body, /compare\/a+\.\.\.b+/);
});

test("issue text from the archive can't ping or link", () => {
  const body = render(diffLibrary([], [scene("x", ["가"], { collection: "@someone `[x](http://e)`" })]));
  assert.match(body, /`@someone '\[x\]\(http:\/\/e\)'`/);
});

test("code-only commits say so, and new parser warnings are listed", () => {
  const empty = { added: [], removed: [], changed: [] };
  assert.match(render(empty), /대본은 바뀌지 않았습니다/);
  assert.doesNotMatch(render(empty), /## 파서 경고/);
  assert.match(render(empty, ["x: stray"]), /## 파서 경고\n- `x: stray`/);
});

test("long lists are capped", () => {
  const many = Array.from({ length: 60 }, (_, i) => scene(`s${i}`, ["가"], { collection: `묶음${i}` }));
  const body = render(diffLibrary([], many));
  assert.match(body, /- 외 10개/);
});
