import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertDistinctIds,
  dedupKeys,
  libraryEventId,
  libraryGroupId,
  parseLibraryCatalog,
  parseLibraryScript,
  selectNewScripts,
} from "../scripts/library-stories.js";

test("speech, commander and narration lines, with CRLF", () => {
  const [s] = parseLibraryScript(
    '@@@SCRIPT_ID: a_00\r\n@@@SUB_TITLE: 제목\r\n[SCENE START]\r\n라피: 문제없습니까?\r\n지휘관: 문제없어.\r\n짜악-!\r\n- 접수: 전화\r\n[SCENE END]\r\n[NEXT_SUBCHAPTER_BUTTON TEXT="다음"]\r\n',
  );
  assert.equal(s.subTitle, "제목");
  assert.deepEqual(
    s.lines.map((l) => [l.window, l.speakerName, l.text]),
    [
      ["Speech", "라피", "문제없습니까?"],
      ["Self", undefined, "문제없어."],
      ["Narration", undefined, "짜악-!"],
      ["Narration", undefined, "- 접수: 전화"],
    ],
  );
});

test("choices keep every branch, nested ones included", () => {
  const warnings: string[] = [];
  const [s] = parseLibraryScript(
    `@@@SCRIPT_ID: a_00
[CHOICE_START]
  [OPTION TEXT="오늘의 날씨 \\"맑음\\""]
    라피: 첫째
    [CHOICE_START]
      [OPTION TEXT="안쪽"]
        라피: 둘째
      [OPTION_END]
    [CHOICE_END]
    라피: 셋째
  [OPTION_END]
  [OPTION TEXT="다른 쪽"]
  [OPTION_END]
[CHOICE_END]
라피: 공통`,
    (m) => warnings.push(m),
  );
  assert.deepEqual(warnings, []);
  assert.deepEqual(
    s.lines.map((l) => [l.text, l.branch]),
    [
      ['오늘의 날씨 "맑음"', "1.1"],
      ["첫째", "1.1"],
      ["안쪽", "1.1.2.1"],
      ["둘째", "1.1.2.1"],
      ["셋째", "1.1"],
      ["다른 쪽", "1.2"],
      ["공통", undefined],
    ],
  );
});

test("messenger: multi-line messages, system lines, choices inside a commander message", () => {
  const warnings: string[] = [];
  const [s] = parseLibraryScript(
    `@@@SCRIPT_ID: blabla_x_001
[MESSENGER_START TITLE="방" PARTICIPANTS="아니스,지휘관"]
  [MSG SENDER="아니스"]
    첫 줄
    둘째 줄
  [MSG_END]
  [MSG SENDER="시스템" IS_SYSTEM="true"]
    대답하고 싶지 않다.
  [MSG_END]
  [MSG SENDER="지휘관" IS_SENDER="true"]
    직접 쓴 말
  [MSG_END]
  [MSG SENDER="지휘관" IS_SENDER="true"]
    [CHOICE_START]
      [OPTION TEXT="골랐다"]
        [MSG SENDER="아니스"]
          답장
        [MSG_END]
      [OPTION_END]
    [CHOICE_END]
  [MSG_END]
[MESSENGER_END]`,
    (m) => warnings.push(m),
  );
  assert.deepEqual(warnings, []);
  assert.deepEqual(
    s.lines.map((l) => [l.window, l.speakerName, l.text, l.branch]),
    [
      ["Speech", "아니스", "첫 줄\n둘째 줄", undefined],
      ["Narration", undefined, "대답하고 싶지 않다.", undefined],
      ["Self", undefined, "직접 쓴 말", undefined],
      ["Choice", undefined, "골랐다", "1.1"],
      ["Speech", "아니스", "답장", "1.1"],
    ],
  );
});

test("speaker names are trimmed; an all-whitespace name is omitted", () => {
  const [s] = parseLibraryScript(`@@@SCRIPT_ID: a_00
라피 : 공백이 붙은 이름
[MSG SENDER=" 네온 "]
  메신저도 마찬가지
[MSG_END]
[MSG SENDER="  "]
  이름이 통째로 공백
[MSG_END]`);
  assert.deepEqual(
    s.lines.map((l) => [l.window, l.speakerName]),
    [
      ["Speech", "라피"],
      ["Speech", "네온"],
      ["Speech", undefined],
    ],
  );
});

test("export artifacts in dialogue are cleaned", () => {
  const [s] = parseLibraryScript("@@@SCRIPT_ID: a_00\n라피: 괜찮아._x000D_\n다음 줄");
  assert.equal(s.lines[0].text, "괜찮아.");
  assert.equal(s.lines[1].text, "다음 줄");
});

test("routes between scenes survive parsing", () => {
  const [s] = parseLibraryScript(`@@@SCRIPT_ID: love_02
[CHOICE_START ID="route_s1"]
  [OPTION TEXT="옥상." VALUE="s1_a"]
  [OPTION_END]
[CHOICE_END]
[NEXT_ROUTE IF_CHOICE="route_s1" OPTION="s1_a" TARGET="love_03"]
[NEXT_ROUTE DEFAULT TARGET="love_04"]`);
  assert.deepEqual(
    [s.lines[0].choiceId, s.lines[0].optionValue],
    ["route_s1", "s1_a"],
  );
  assert.deepEqual(s.next, [
    { ifChoice: "route_s1", option: "s1_a", target: "love_03" },
    { ifChoice: undefined, option: undefined, target: "love_04" },
  ]);
});

test("broken markup warns instead of failing the build", () => {
  const warnings: string[] = [];
  parseLibraryScript(`@@@SCRIPT_ID: a_00\n[OPTION_END]\n[CHOICE_END]\n[OPTION TEXT="x"]\n[CHOICE_START]`, (m) => warnings.push(m));
  assert.equal(warnings.length, 4);
});

test("scene ids are URL safe and stable", () => {
  assert.equal(libraryGroupId("ark_ranger_00"), "lib_ark_ranger_00");
  assert.match(libraryGroupId("UFO챈.zip_00"), /^lib_[0-9a-f]{12}$/);
  assert.equal(libraryGroupId("UFO챈.zip_00"), libraryGroupId("UFO챈.zip_00"));
  assert.throws(() => assertDistinctIds([{ groupId: "lib_A" }, { groupId: "lib_a" }]), /id clash/);
});

test("event ids are readable when the title is ASCII", () => {
  assert.equal(libraryEventId("BOOM! THE GHOST!"), "lib_boom_the_ghost");
  assert.match(libraryEventId("2X2 LOVE 1부"), /^lib_[0-9a-f]{12}$/);
  assert.notEqual(libraryEventId("2X2 LOVE 1부"), libraryEventId("2X2 LOVE 2부"));
});

test("catalog reads titles and sections from the archive's index", () => {
  const c = parseLibraryCatalog(
    `{ id: 'blabla_x_001', categoryKey: 'blabla', section: '개인', title: '그레이브', subTitle: '001' },
     { id: "q", title: 'Queen\\'s Order' },`,
  );
  assert.deepEqual(c.get("blabla_x_001"), { title: "그레이브", section: "개인" });
  assert.equal(c.get("q")?.title, "Queen's Order");
});

test("dedup drops scenes we already have and copies inside the archive", () => {
  const line = (text: string) => ({ text });
  const inGame = { id: "game", lines: [line("이미 게임에 있는 긴 대사"), line("이것도 게임에 있는 대사")] };
  const fresh = { id: "new", lines: [line("처음 보는 새로운 대사"), line("이것도 처음 보는 대사")] };
  const copy = { id: "copy", lines: fresh.lines };
  const short = { id: "short", lines: [line("응.")] };
  const known = new Set(dedupKeys(inGame.lines));
  assert.deepEqual(selectNewScripts([inGame, fresh, copy, short], known).map((s) => s.id), ["new", "short"]);
});
