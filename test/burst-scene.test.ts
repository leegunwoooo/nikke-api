import assert from "node:assert/strict";
import { test } from "node:test";
import { AnimationState, AnimationStateData, AtlasAttachmentLoader, FakeTexture, Skeleton, SkeletonJson, TextureAtlas } from "@esotericsoftware/spine-core";
import { BurstScene } from "../viewer/burst-scene.js";

const atlas = new TextureAtlas("page.png\nsize:16,16\nregion\nbounds:0,0,16,16\n");
for (const page of atlas.pages) page.setTexture(new FakeTexture({ width: 16, height: 16 } as HTMLImageElement));
const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData({
  skeleton: { spine: "4.1.20" }, bones: [{ name: "root" }, { name: "bg-bone", parent: "root" }, { name: "fg-bone", parent: "root" }],
  slots: [{ name: "bg", bone: "bg-bone", attachment: "region" }, { name: "fg", bone: "fg-bone", attachment: "region" }],
  skins: [{ name: "default", attachments: { bg: { region: { width: 16, height: 16 } }, fg: { region: { width: 16, height: 16 } } } }],
  animations: {
    skillcut_1: { slots: { bg: { attachment: [{ name: null }] } }, bones: { "fg-bone": { translate: [{ x: 0 }, { time: 1, x: 50 }] } } },
    bg_skillcut_1: { slots: { fg: { attachment: [{ name: null }] } }, bones: { "bg-bone": { translate: [{ x: 0 }, { time: 1, x: -30 }] } } },
  },
});

test("a shared timeline preserves character and background even when each animation hides the other", () => {
  const scene = new BurstScene(data, { mode: "composite", duration: 1, layers: [
    { role: "background", animation: "bg_skillcut_1" }, { role: "main", animation: "skillcut_1" },
  ] });
  // Scrub forwards and backwards; poses must not retain the previous frame.
  for (const time of [0, 0.75, 1, 0.25, 0]) {
    scene.seek(time);
    const [bg, fg] = scene.layers.map(l => l.skeleton);
    assert.ok(bg.findSlot("bg")!.attachment);
    assert.equal(bg.findSlot("fg")!.attachment, null);
    assert.ok(fg.findSlot("fg")!.attachment);
    assert.equal(fg.findSlot("bg")!.attachment, null);
    assert.ok(Math.abs(bg.findBone("bg-bone")!.worldX - time * -30) < 1e-4);
    assert.ok(Math.abs(fg.findBone("fg-bone")!.worldX - time * 50) < 1e-4);
    assert.equal(bg.data, fg.data); // only poses are duplicated; assets are shared
  }
  // Reproduce the original conflict: multiple tracks cannot provide both slots.
  const sk = new Skeleton(data);
  const state = new AnimationState(new AnimationStateData(data));
  state.setAnimation(0, "bg_skillcut_1", false);
  state.setAnimation(1, "skillcut_1", false);
  state.apply(sk);
  assert.ok(!sk.findSlot("bg")!.attachment || !sk.findSlot("fg")!.attachment);
});

test("authored combined/single animations create only one rendered layer", () => {
  const scene = new BurstScene(data, { mode: "single", duration: 1, layers: [{ role: "main", animation: "skillcut_1" }] });
  assert.equal(scene.layers.length, 1);
  assert.throws(() => new BurstScene(data, { mode: "single", duration: 1, layers: [{ role: "main", animation: "missing" }] }), /Missing animation/);
});
