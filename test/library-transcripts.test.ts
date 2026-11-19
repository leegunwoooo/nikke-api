import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupKeys, libraryEventId, readTranscribedStories, selectLibraryScenes, selectNewScripts } from "../scripts/library-stories.js";

const all = await readTranscribedStories();
const scenes = all.filter((s) => s.collection === "MARIA-n");
const sky = all.filter((s) => s.collection === "SKY ON THE ROCK");

test("MARIA-n parts 1 and 2 and the epilogue have their 28 scenes, ready for the API", () => {
  assert.equal(scenes.length, 28);
  assert.equal(libraryEventId(scenes[0].collection), "lib_maria_n");
  for (const s of scenes) {
    assert.match(s.groupId, /^lib_maria_n_([12]|ep)_\d\d$/);
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

test("the epilogue cutscene keeps its silent line and ends on the promise", () => {
  const ep = scenes.find((s) => s.groupId === "lib_maria_n_ep_00")!;
  assert.equal(ep.name, "검은 달 안에서");
  assert.equal(ep.lines.length, 34);
  assert.deepEqual([ep.lines[6].text, ep.lines[6].speakerName], ["…….", "마리안"]);
  assert.equal(ep.lines.at(-1)!.text, "약속이에요.");
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

test("SKY ON THE ROCK has its 14 album scenes in order, ready for the API", () => {
  assert.equal(sky.length, 14);
  assert.equal(libraryEventId(sky[0].collection), "lib_sky_on_the_rock");
  assert.deepEqual(sky.map((s) => s.groupId), sky.map((_, i) => `lib_sky_on_the_rock_${String(i).padStart(2, "0")}`));
  assert.deepEqual([sky[0].name, sky[7].name, sky[13].name], ["액자 속 추억", "하루만 빌릴 수 있다면", "하늘과 산들바람의 여행 : B"]);
  for (const s of sky) {
    assert.equal(s.libraryCategory, "event_stories");
    assert.equal(s.sourceVideo, "https://youtu.be/GnHGyrMNGoc");
    s.lines.forEach((l, i) => {
      assert.equal(l.id, `${s.groupId}_${i + 1}`);
      assert.ok(l.text);
      assert.ok(["Speech", "Self", "Narration"].includes(l.window));
      assert.equal(Boolean(l.speakerName), l.window === "Speech");
    });
  }
  assert.equal(sky[0].lines[0].text, "아아, 캡틴.");
  assert.equal(sky.at(-1)!.lines.at(-1)!.text, "SKY ON THE ROCK : END");
});

test("SKY ON THE ROCK keeps the short lines OCR missed and both voices of the duet", () => {
  const lines = sky.flatMap((s) => s.lines);
  const last = sky[12].lines; // the flight ends on the duet
  const inLast = (text: string, speaker: string) => last.findIndex((l) => l.text === text && l.speakerName === speaker);
  const at = (text: string, speaker: string) => lines.findIndex((l) => l.text === text && l.speakerName === speaker);
  // read from the frames: one- or two-frame lines with no letters
  assert.ok(lines.filter((l) => l.text === "……." && l.window === "Speech").length >= 30);
  assert.equal(lines[at("비행과 관련된 모든 것들은 제 손으로 해결할 수 있어요.", "스카이") + 1].text, "비행이든, 정비든.");
  const scream = "내가 하고 싶으면 해! 누가 뭐라 떠들어도 이 발은 멈추지 않아!";
  assert.equal(inLast(scream, "세피"), inLast(scream, "스카이") + 1);
  assert.equal(inLast("I DO WHAT I WANT!", "세피"), inLast("I DO WHAT I WANT!", "스카이") + 1);
  // two shouts in the dark, the second one closer
  assert.deepEqual(sky[6].lines.filter((l) => l.speakerName === "???").map((l) => l.text), ["…틴!", "…ㅋ틴!"]);
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
  assert.deepEqual(selectLibraryScenes([], scenes, copy), scenes.filter((s) => !part(1).includes(s)));
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
  selectNewScripts(all, published);
  assert.deepEqual(selectNewScripts(all, published), []);
});
