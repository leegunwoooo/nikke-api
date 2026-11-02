import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { readFavoriteStories } from "../scripts/favorite-stories.js";

const dir = path.resolve(import.meta.dirname, "../content/favorite-stories");

test("favorite story files keep the shape the build expects", async () => {
  const scenes = await readFavoriteStories(dir);
  assert.equal(scenes.length, 21);
  assert.equal(new Set(scenes.map((s) => s.groupId)).size, 21);
  for (const s of scenes) {
    assert.match(s.groupId, /^d_favorite_[a-z]+$/);
    assert.equal(s.type, "favorite");
    assert.ok(s.name && s.nikke);
    assert.match(s.sourceVideo, /^https:\/\/youtu\.be\//);
    s.lines.forEach((l, i) => {
      assert.equal(l.id, `${s.groupId}_${i + 1}`);
      assert.ok(["Speech", "Self", "Narration", "Choice"].includes(l.window), l.id);
      assert.ok(l.text, l.id);
      assert.ok(!("speakerIcon" in l), `${l.id}: icons are added by the build`);
    });
  }
});

test("every favorite story choice block has exactly one chosen option", async () => {
  let blocks = 0;
  for (const s of await readFavoriteStories(dir)) {
    let run: boolean[] = [];
    for (const l of [...s.lines, { window: "" } as (typeof s.lines)[number]]) {
      if (l.window === "Choice") run.push(!!l.chosen);
      else if (run.length) {
        assert.equal(run.filter(Boolean).length, 1, s.groupId);
        blocks++;
        run = [];
      }
    }
  }
  assert.equal(blocks, 53);
});
