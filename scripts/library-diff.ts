import type { LibraryScene } from "./library-stories.js";

export interface LibraryDiff {
  added: LibraryScene[];
  removed: LibraryScene[];
  changed: { scene: LibraryScene; lines: number }[];
}

const lineKey = (l: LibraryScene["lines"][number]) => JSON.stringify([l.speakerName, l.window, l.text, l.branch]);

// lines that exist on one side only; moved lines don't count
function changedLines(a: LibraryScene, b: LibraryScene): number {
  const count = new Map<string, number>();
  for (const l of a.lines) count.set(lineKey(l), (count.get(lineKey(l)) ?? 0) + 1);
  let extra = 0;
  for (const l of b.lines) {
    const n = count.get(lineKey(l)) ?? 0;
    if (n) count.set(lineKey(l), n - 1);
    else extra++;
  }
  const missing = [...count.values()].reduce((x, y) => x + y, 0);
  return Math.max(extra, missing);
}

const sameMeta = (a: LibraryScene, b: LibraryScene) =>
  a.name === b.name && a.collection === b.collection && JSON.stringify(a.next) === JSON.stringify(b.next);

// the archive repeats some ids across categories (a story filed twice)
const sceneKey = (s: LibraryScene) => `${s.libraryCategory}/${s.groupId}`;

export function diffLibrary(base: LibraryScene[], head: LibraryScene[]): LibraryDiff {
  const before = new Map(base.map((s) => [sceneKey(s), s]));
  const after = new Map(head.map((s) => [sceneKey(s), s]));
  const changed: LibraryDiff["changed"] = [];
  for (const s of head) {
    const old = before.get(sceneKey(s));
    if (!old) continue;
    const lines = changedLines(old, s);
    if (lines || !sameMeta(old, s)) changed.push({ scene: s, lines });
  }
  return {
    added: head.filter((s) => !before.has(sceneKey(s))),
    removed: base.filter((s) => !after.has(sceneKey(s))),
    changed: changed.sort((a, b) => b.lines - a.lines),
  };
}

// archive text goes into a public issue: a code span keeps @mentions and links inert
const code = (s: string) => `\`${s.replace(/`/g, "'").replace(/\s+/g, " ")}\``;

function byCollection(scenes: LibraryScene[]) {
  const groups = new Map<string, { scene: LibraryScene; n: number }>();
  for (const s of scenes) {
    const k = `${s.libraryCategory}\0${s.collection}`;
    const g = groups.get(k);
    if (g) g.n++;
    else groups.set(k, { scene: s, n: 1 });
  }
  return [...groups.values()].sort((a, b) => b.n - a.n);
}

const MAX_ROWS = 50;
const capped = (rows: string[]) =>
  rows.length > MAX_ROWS ? [...rows.slice(0, MAX_ROWS), `- 외 ${rows.length - MAX_ROWS}개`] : rows;

export function renderIssue(o: {
  repo: string;
  base: string;
  head: string;
  diff: LibraryDiff;
  warnings: string[];
  baseWarnings: number;
}) {
  const { repo, base, head, diff } = o;
  const groups = (scenes: LibraryScene[]) =>
    capped(byCollection(scenes).map(({ scene, n }) => `- ${code(scene.libraryCategory)} ${code(scene.collection)}: ${n}개`));
  const out = [
    `<!-- library-watch:${head} -->`,
    `[금서고](https://github.com/${repo}) 원본이 바뀌었습니다: \`${base.slice(0, 7)}\` → \`${head.slice(0, 7)}\` ([비교](https://github.com/${repo}/compare/${base}...${head}))`,
    "",
    `| 새 장면 | 수정된 장면 | 삭제된 장면 | 파서 경고 |`,
    `|---:|---:|---:|---:|`,
    `| ${diff.added.length} | ${diff.changed.length} | ${diff.removed.length} | ${o.baseWarnings} → ${o.warnings.length} |`,
    "",
  ];
  const nothing = !diff.added.length && !diff.changed.length && !diff.removed.length;
  if (nothing) out.push("대본은 바뀌지 않았습니다. 앱 코드 같은 다른 파일만 수정된 커밋입니다.", "");
  if (diff.added.length) out.push("## 새 장면", ...groups(diff.added), "");
  if (diff.changed.length) {
    out.push(
      "## 수정된 장면",
      ...capped(diff.changed.map(({ scene, lines }) => `- ${code(scene.groupId)} ${code(scene.collection)} ${code(scene.name)}: ${lines ? `${lines}줄` : "제목·분기만"}`)),
      "",
    );
  }
  if (diff.removed.length) out.push("## 삭제된 장면", ...groups(diff.removed), "");
  if (o.warnings.length > o.baseWarnings) out.push("## 파서 경고", ...capped(o.warnings.map(code).map((w) => `- ${w}`)), "");
  out.push(
    "## 반영하려면",
    "",
    `\`scripts/library-stories.ts\`의 \`LIBRARY_COMMIT\`을 \`${head}\`로 바꿔 PR을 올리세요. 머지 후 다음 데이터 갱신 때 배포됩니다.`,
    "",
    "게임 데이터에 이미 있는 장면은 빌드할 때 빠지므로, 위 숫자가 API에 그대로 추가되는 건 아닙니다.",
  );
  return out.join("\n");
}
