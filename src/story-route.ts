// A play order for the story: main chapters with the events, side stories and
// affection (호감도) stories slotted where the community recommends reading
// them. Curated, not derived from game data.
//
// Primary source: the community-maintained "NIKKE 스토리 감상 순서 가이드"
// (S, linked from the Arca Live NIKKE channel), which covers up to Chapter 50.
// The order, required/optional split and importance follow it; notes are
// short paraphrases, and placements other guides disagree on say so.
// Chapter numbers are the game's (0-based); scene groupIds are 1-based
// (Chapter 0 = d_main_01_*).

export const ROUTE_SOURCES = {
  S: {
    title: "NIKKE 스토리 감상 순서 가이드",
    author: "ssissun (아카라이브 니케 채널)",
    url: "https://ssissun.github.io/nikke-storyline/",
    post: "https://arca.live/b/nikketgv/177148223",
    date: "2026-10-30",
  },
  A: {
    title: "The NIKKE Storyline (History Order - Up to Chapter 42) — in-game Storyline mode",
    author: "justonegamr",
    url: "https://www.youtube.com/watch?v=tsJNzjSr1Qg",
    date: "2025-12-04",
  },
  C: {
    title: "신입 지휘관들을 위한 주관적인 스토리 순서 추천",
    author: "흐냠",
    url: "https://www.youtube.com/watch?v=dqPXnJkjpsQ",
    date: "2025-04-03",
  },
} as const;

export type RouteSource = keyof typeof ROUTE_SOURCES;

/** last game chapter the route places stories around */
export const ROUTE_COVERAGE_CHAPTER = 50;

type Importance = "high" | "medium" | "low";

export type RouteEntry =
  | { kind: "main"; chapter: number; note?: string }
  | {
      kind: "event" | "side" | "affection";
      title: string;
      /** local event ids (several when the data splits an event into parts); none = not in the data */
      ids: string[];
      /** affection entries: the character whose 호감도 scenes these are */
      nikke?: string;
      required: boolean;
      importance?: Importance;
      note?: string;
    }
  | { kind: "favorite"; title: string; sceneGroupId: string; nikke: string; note: string };

const ch = (from: number, to = from, note?: string): RouteEntry[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ kind: "main", chapter: from + i, ...(note && i === 0 ? { note } : {}) }));
const ev = (title: string, ids: string[], opt: { required?: boolean; importance?: Importance; note?: string } = {}): RouteEntry => ({
  kind: "event", title, ids, required: opt.required ?? true, ...(opt.importance ? { importance: opt.importance } : {}), ...(opt.note ? { note: opt.note } : {}),
});
const side = (title: string, note?: string): RouteEntry => ({ kind: "side", title, ids: [], required: true, ...(note ? { note } : {}) });
const affection = (nikke: string, importance: Importance, note?: string): RouteEntry => ({
  kind: "affection", title: `${nikke} 호감도 스토리`, ids: [], nikke, required: false, importance, ...(note ? { note } : {}),
});

export const STORY_ROUTE: RouteEntry[] = [
  ...ch(0, 1),
  ...ch(2, 6, "6챕터를 깨면 스토리 모드가 열림"),
  ...ch(7, 20),
  ev("OVER ZONE", ["event_overzone1", "event_overzone2"], { note: "0.5주년. 흐냠은 20챕터 전, 인게임 Storyline은 0챕터 이전(과거 이야기)" }),
  ev("CHERRY BLOSSOM", ["event_cherryblossom"], { required: false, importance: "low", note: "스토리라인 밖 이벤트라 건너뛰어도 됨" }),
  ...ch(21, 24),
  ev("RED ASH", ["event_redash", "event_redash1", "event_redash2"], { note: "1주년. 흐냠은 25챕터 뒤를 추천" }),
  ...ch(25, 26, "26챕터 전에 서브퀘스트 [랩칠리언] 스토리를 먼저 보는 걸 추천 (이 데이터에는 없음)"),
  ev("NEW YEAR, NEW SWORD", ["event_newyearnewsword"], { note: "24 신년" }),
  side("SECOND AFFECTION", "14챕터 뒤에 보라는 의견도 있음 (흐냠, 인게임 Storyline)"),
  ev("FIRST AFFECTION", ["event_firstaffection"], { required: false, importance: "low", note: "본다면 SECOND AFFECTION 다음에" }),
  affection("킬로", "medium", "여유가 있으면 LAST KINGDOM 전에"),
  ev("LAST KINGDOM", ["event_lastkingdom1", "event_lastkingdom2"], { note: "1.5주년. 공식 순서는 30챕터 뒤지만 29~32챕터와 이어져서 여기 배치" }),
  ev("DIRTY BACKYARD", ["event_dirtybackyard"], { required: false, importance: "high", note: "본다면 늦어도 43챕터 전에" }),
  ev("BOOM'S DAY", ["event_boomsday"], { required: false, importance: "medium", note: "D.ARK HERO로 이어짐" }),
  ev("D.ARK HERO", ["event_darkhero"], { required: false, importance: "high", note: "선택이지만 안 보면 이후 메인에서 빠진 연결고리가 많음" }),
  ...ch(27, 31),
  ev("OLD TALES", ["event_oldtales1", "event_oldtales2"], {
    note: "2주년. 순서 의견이 가장 갈리는 곳 — 가이드는 32챕터 마지막 보스(「되찾아 오길: A」) 직전에 끼워 보기를 가장 추천, 31챕터 직후도 무난. 32챕터를 다 본 뒤가 공식 출시 순서",
  }),
  ...ch(32, 34),
  ev("FOOTSTEP, WALK, RUN", ["event_footstepwalkrun1", "event_footstepwalkrun2"], { note: "25 신년" }),
  affection("에테르", "low"),
  ev("WISDOM SPRING", ["event_wisdomspring"]),
  ...ch(35, 36),
  side("WORDLESS", "26챕터 뒤를 추천하기도 함 (흐냠, 인게임 Storyline)"),
  side("MUDFISH"),
  affection("모리", "medium"),
  ev("UNBREAKABLE SPHERE", ["event_unbreakablesphere1", "event_unbreakablesphere2"], { note: "2.5주년" }),
  ...ch(37, 38, "헬름의 과거가 궁금하면 BRAND NEW YEAR, SEA, YOU, AGAIN을 먼저"),
  ev("ARCANE ARCHIVE", ["event_arcanearchive"]),
  ev("LORD, FOR JUSTICE", ["event_lordforjustice"], { required: false, importance: "medium", note: "LICENSE TO KILL → KILL THE LORD → LORD, FOR JUSTICE로 이어지는 이야기" }),
  ev("OVER THE HORIZON", ["event_overthehorizon"], { required: false, importance: "medium" }),
  ev("BOOM THE GHOST", [], { note: "메인과 이어지는 부분만 보려면 PART 1 마지막 화와 PART 2 「기억」 화부터" }),
  ...ch(39, 40, "WISDOM SPRING을 먼저 보는 걸 추천"),
  side("EDEN SPEAR"),
  ...ch(41, 42),
  ev("GODDESS FALL", ["event_goddessfall1", "event_goddessfall2"], { note: "3주년" }),
  ev("ARK GUARDIAN", ["event_arkguardian1", "event_arkguardian2"], { note: "26 신년" }),
  ...ch(43, 44, "DIRTY BACKYARD와 서브퀘스트 [세르반]을 먼저 보면 좋음"),
  ev("ENTER HEAVEN", [], { required: false, importance: "medium" }),
  ev("GOOD WORLD", []),
  side("PRETTY STAR", "ARCANE ARCHIVE를 먼저"),
  ...ch(45, 46, "BOOM THE GHOST를 먼저"),
  ev("STAR ANIS", ["event_staranis1", "event_staranis2"], { note: "3.5주년" }),
  ev("ARK RANGER", [], { note: "OVER THE HORIZON을 먼저" }),
  ev("WAVE TO YOU", [], { required: false, importance: "medium", note: "SCHOOL OF LOCK, COLORLESS, 나가 호감도 스토리 중 하나는 먼저 보는 걸 추천" }),
  ev("PROJECT MATIS", []),
  ...ch(47, 48, "ARK RANGER를 먼저"),
  ev("COIN RUSH SHOWDOWN", [], { required: false, importance: "low" }),
  side("GINGERBREAD HOUSE", "WAVE TO YOU 내용이 언급됨"),
  ...ch(49, 50),
  ev("MARIA-n", [], { note: "4주년" }),
];

// 애장품 stories aren't in the guide, so they go after everything else:
// existing steps stay put and they never displace a chapter from `next`
export const favoriteRouteEntries = (scenes: { groupId: string; name?: string; nikke?: string; category?: string }[]): RouteEntry[] =>
  scenes
    .filter((s) => s.category === "favorite")
    .map((s) => ({
      kind: "favorite",
      title: `${s.nikke} 애장품 스토리: ${s.name}`,
      sceneGroupId: s.groupId,
      nikke: s.nikke ?? "",
      note: "가이드에 없는 항목 — 줄거리상 위치를 확인하지 않아 순서 맨 끝에 둠",
    }));
