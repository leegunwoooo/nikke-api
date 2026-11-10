import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

// Stories the game CDN doesn't serve (messenger chats, lost relics, side
// stories, older events) come from a community archive (credited in the README).
// The commit is pinned so an upstream edit can't change the API by itself —
// bump it deliberately; fingerprint.ts then triggers a redeploy.
export const LIBRARY_REPO = "VoMiRin/Nikke-Forbidden-Library";
export const LIBRARY_COMMIT = "ee51d4e97fdf39579ac1726d914de989f4bdec70";
// beside data/raw, not in it: build.ts copies whatever else is in raw into dist
export const LIBRARY_DIR = "data/library";
// stories neither the CDN nor the archive has yet, transcribed from public videos
export const TRANSCRIPT_DIR = "content/library-stories";

export interface LibraryLine {
  id: string;
  speakerName?: string;
  text: string;
  window: "Speech" | "Self" | "Narration" | "Choice";
  voice: null;
  /** "<block>.<option>" pairs, nested for nested choices; only lines inside a choice */
  branch?: string;
  /** on Choice lines that decide `next` */
  choiceId?: string;
  optionValue?: string;
}

/** one rule of what plays after this scene; no ifChoice = the default */
export interface LibraryNext {
  ifChoice?: string;
  option?: string;
  groupId: string;
}

export interface LibraryScene {
  groupId: string;
  type: "library";
  name: string;
  collection: string;
  libraryCategory: string;
  section?: string;
  sourceVideo?: string;
  next?: LibraryNext[];
  lines: LibraryLine[];
}

export const libraryGroupId = (sourceId: string) =>
  `lib_${/^[A-Za-z0-9_-]+$/.test(sourceId) ? sourceId : crypto.createHash("sha1").update(sourceId).digest("hex").slice(0, 12)}`;

// quoted values may hold \" and bare quotes, so a value ends only where the
// next attribute or the tag does
const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\b${name}="(.*?)"(?=\\s+[A-Z_]+=|\\s*\\]$)`))?.[1]?.replace(/\\"/g, '"');
const hasFlag = (tag: string, name: string) => attr(tag, name) === "true";

const IGNORED_TAG = /^\[(SCENE START|SCENE END|NEXT_SUBCHAPTER_BUTTON\b.*|MESSENGER_START\b.*|MESSENGER_END)\]$/;
const SPEECH = /^(?![-ㄴ])([^:\[\]]{1,20}): (.+)$/;
const COMMANDER = "지휘관";
// "label : value" rows with a space before the colon are document form
// fields/end cards, not a speaker — they render as "라벨: 값" narration.
// Real dialogue can also carry a space before the colon ("A : ..."), so an
// explicit label set plus the end-card value decides, not the space alone.
const FORM_LABEL = new Set(["결과", "FB", "이름", "성별", "나이", "특징", "성격", "비고", "사유", "제목", "서명자"]);
const END_CARD = /^(END|TO BE CONTINUED)$/;

export interface ParsedScript {
  sourceId: string;
  subTitle: string;
  next: { ifChoice?: string; option?: string; target: string }[];
  lines: Omit<LibraryLine, "id">[];
}

export function parseLibraryScript(text: string, warn: (msg: string) => void = () => {}): ParsedScript[] {
  const scripts: ParsedScript[] = [];
  let cur: ParsedScript | null = null;
  // open choice blocks, innermost last; `option` counts the block's options so far
  let blocks: { n: number; id?: string; option: number; inOption: boolean }[] = [];
  let blockCount = 0;
  let msg: { sender: string; self: boolean; system: boolean; body: string[] } | null = null;

  const branch = () => blocks.filter((b) => b.inOption).map((b) => `${b.n}.${b.option}`).join(".") || undefined;
  const push = (line: Omit<LibraryLine, "id" | "voice" | "branch">, at = branch()) => {
    cur!.lines.push({ ...line, voice: null, ...(at ? { branch: at } : {}) });
  };
  const flushMsg = () => {
    if (!msg) return;
    const body = msg.body.join("\n");
    if (body) {
      if (msg.system) push({ text: body, window: "Narration" });
      else if (msg.self || msg.sender === COMMANDER) push({ text: body, window: "Self" });
      else push({ speakerName: msg.sender?.trim(), text: body, window: "Speech" });
    }
    msg = null;
  };
  const closeScript = () => {
    flushMsg();
    if (cur && blocks.length) warn(`${cur.sourceId}: ${blocks.length} unclosed choice block(s)`);
    blocks = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    const id = t.match(/^@@@SCRIPT_ID:\s*(.+)$/);
    if (id) {
      closeScript();
      cur = { sourceId: id[1], subTitle: "", next: [], lines: [] };
      blockCount = 0;
      scripts.push(cur);
      continue;
    }
    if (!t || !cur) continue;
    const sub = t.match(/^@@@SUB_TITLE:\s*(.*)$/);
    if (sub) {
      cur.subTitle = sub[1];
    } else if (t === "[MSG_END]") {
      flushMsg();
    } else if (t.startsWith("[MSG SENDER=")) {
      flushMsg();
      msg = { sender: attr(t, "SENDER") ?? "", self: hasFlag(t, "IS_SENDER"), system: hasFlag(t, "IS_SYSTEM"), body: [] };
    } else if (t.startsWith("[CHOICE_START")) {
      // messenger choices sit inside a commander [MSG]; their options hold more [MSG]s
      flushMsg();
      blocks.push({ n: ++blockCount, id: attr(t, "ID"), option: 0, inOption: false });
    } else if (t.startsWith("[OPTION TEXT=")) {
      const block = blocks.at(-1);
      if (!block) {
        warn(`${cur.sourceId}: option outside a choice block`);
        continue;
      }
      block.option++;
      block.inOption = true;
      const value = attr(t, "VALUE");
      push({
        text: attr(t, "TEXT") ?? "",
        window: "Choice",
        ...(block.id ? { choiceId: block.id } : {}),
        ...(value ? { optionValue: value } : {}),
      });
    } else if (t === "[OPTION_END]") {
      if (blocks.at(-1)?.inOption) blocks.at(-1)!.inOption = false;
      else warn(`${cur.sourceId}: stray [OPTION_END]`);
    } else if (t === "[CHOICE_END]") {
      if (!blocks.pop()) warn(`${cur.sourceId}: stray [CHOICE_END]`);
    } else if (t.startsWith("[NEXT_ROUTE")) {
      const target = attr(t, "TARGET");
      if (target) cur.next.push({ ifChoice: attr(t, "IF_CHOICE"), option: attr(t, "OPTION"), target });
    } else if (msg) {
      msg.body.push(t);
    } else if (!IGNORED_TAG.test(t)) {
      const m = t.match(SPEECH);
      if (m?.[1] === COMMANDER) push({ text: m[2], window: "Self" });
      else if (m && /\s$/.test(m[1]) && (FORM_LABEL.has(m[1].trim()) || END_CARD.test(m[2])))
        push({ text: `${m[1].trim()}: ${m[2]}`, window: "Narration" });
      else if (m) push({ speakerName: m[1].trim(), text: m[2], window: "Speech" });
      else push({ text: t, window: "Narration" });
    }
  }
  closeScript();
  return scripts;
}

/** script id → title/section, from the archive's own TS index */
export function parseLibraryCatalog(source: string): Map<string, { title: string; section?: string }> {
  const out = new Map<string, { title: string; section?: string }>();
  const field = (line: string, name: string) => {
    const m = line.match(new RegExp(`\\b${name}:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`));
    return m?.[2].replace(/\\(.)/g, "$1");
  };
  for (const line of source.split("\n")) {
    const id = field(line, "id");
    const title = field(line, "title");
    if (id && title) out.set(id, { title, section: field(line, "section") });
  }
  return out;
}

// comparison ignores spacing/punctuation/tokens; short lines ("응.") say
// nothing about whether two scenes are the same
const dedupKey = (s: string) => s.replace(/@UserName/g, COMMANDER).replace(/[^0-9A-Za-z가-힣]/g, "");
const MIN_KEY = 8;
export const dedupKeys = (lines: { text?: string }[]) =>
  lines.map((l) => dedupKey(l.text ?? "")).filter((k) => k.length >= MIN_KEY);

// A transcript scene can replay main-story lines around new ones (MARIA-n part 2's
// last scene overlaps 59%), so alone it drops out only when nearly all of it is published.
export const TRANSCRIPT_DUP_CUTOFF = 0.9;
// A published copy can differ line by line, leaving single scenes under that cutoff.
// Whole stories in the archive sit under 10% or above 50%, so half a file means a copy.
export const TRANSCRIPT_FILE_DUP_CUTOFF = 0.5;

/**
 * Keep only scenes we don't already have. `known` holds the game data's lines
 * and grows with what's kept, so copies inside the archive drop out too. Most
 * archive scenes sit near 0% or 100% overlap, so the default cutoff is not sensitive.
 */
export function selectNewScripts<T extends { lines: { text?: string }[] }>(scripts: T[], known: Set<string>, cutoff = 0.5) {
  const kept: T[] = [];
  for (const s of scripts) {
    const keys = dedupKeys(s.lines);
    const hits = keys.filter((k) => known.has(k)).length;
    if (keys.length && hits / keys.length >= cutoff) continue;
    kept.push(s);
    for (const k of keys) known.add(k);
  }
  return kept;
}

/** Archive scenes first, so a transcript gives way to the same story published there. */
export function selectLibraryScenes<T extends { lines: { text?: string }[]; sourceVideo?: string }>(archive: T[], transcripts: T[], known: Set<string>) {
  const kept = selectNewScripts(archive, known);
  // each transcript file has its own source video
  const files = new Map<string | undefined, T[]>();
  for (const s of transcripts) files.set(s.sourceVideo, [...(files.get(s.sourceVideo) ?? []), s]);
  for (const scenes of files.values()) {
    const keys = dedupKeys(scenes.flatMap((s) => s.lines));
    const hits = keys.filter((k) => known.has(k)).length;
    if (keys.length && hits / keys.length >= TRANSCRIPT_FILE_DUP_CUTOFF) continue;
    kept.push(...selectNewScripts(scenes, known, TRANSCRIPT_DUP_CUTOFF));
  }
  return kept;
}

/** Collections that read as one story get an event entry, so they show up in /api/events. */
export const LIBRARY_EVENT_CATEGORIES = new Set(["event_stories", "side_stories", "special_stories"]);

export const libraryEventId = (collection: string) => {
  const slug = collection.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `lib_${/^[\x00-\x7f]+$/.test(collection) && slug ? slug : crypto.createHash("sha1").update(collection).digest("hex").slice(0, 12)}`;
};

/** Scene files are named by id, and case-insensitive checkouts would merge ids differing only in case. */
export function assertDistinctIds(scenes: { groupId: string }[]) {
  const seen = new Set<string>();
  for (const { groupId } of scenes) {
    const lower = groupId.toLowerCase();
    if (seen.has(lower)) throw new Error(`library id clash: ${groupId}`);
    seen.add(lower);
  }
}

async function walkTxt(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkTxt(p)));
    else if (e.name.endsWith(".txt")) out.push(p);
  }
  return out;
}

export async function readLibraryStories(root = path.resolve(LIBRARY_DIR), commit = LIBRARY_COMMIT) {
  const marker = await readFile(path.join(root, "COMMIT"), "utf8").catch(() => "");
  if (marker.trim() !== commit) {
    throw new Error(`${root} is not at ${commit} — run npm run sync`);
  }
  const catalog = new Map<string, { title: string; section?: string }>();
  for (const f of await readdir(path.join(root, "catalog"))) {
    for (const [k, v] of parseLibraryCatalog(await readFile(path.join(root, "catalog", f), "utf8"))) catalog.set(k, v);
  }

  const warnings: string[] = [];
  const scenes: LibraryScene[] = [];
  const scriptsDir = path.join(root, "scripts");
  for (const file of (await walkTxt(scriptsDir)).sort()) {
    const rel = path.relative(scriptsDir, file).split(path.sep).join("/");
    const dirs = rel.split("/");
    const stem = dirs.at(-1)!.replace(/\.txt$/, "");
    for (const p of parseLibraryScript(await readFile(file, "utf8"), (m) => warnings.push(m))) {
      const groupId = libraryGroupId(p.sourceId);
      const meta = catalog.get(p.sourceId);
      scenes.push({
        groupId,
        type: "library",
        name: p.subTitle || (meta?.title ?? stem),
        collection: meta?.title ?? stem,
        libraryCategory: dirs[0],
        ...(meta?.section ? { section: meta.section } : {}),
        ...(p.next.length
          ? {
              next: p.next.map((n) => ({
                ...(n.ifChoice ? { ifChoice: n.ifChoice } : {}),
                ...(n.option ? { option: n.option } : {}),
                groupId: libraryGroupId(n.target),
              })),
            }
          : {}),
        lines: p.lines.map((l, i) => ({ id: `${groupId}_${i + 1}`, ...l })),
      });
    }
  }
  return { scenes, warnings };
}

/**
 * Build them after the archive's scenes: selectNewScripts keeps the first copy, so a
 * transcript drops out on its own once the CDN or the archive publishes the same story.
 */
export async function readTranscribedStories(dir = path.resolve(TRANSCRIPT_DIR)): Promise<LibraryScene[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const docs = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8"))));
  return docs.flatMap(({ collection, libraryCategory, sourceVideo, scenes }) =>
    scenes.map((s: Pick<LibraryScene, "groupId" | "name" | "lines">) => ({ ...s, type: "library", collection, libraryCategory, sourceVideo })),
  );
}

/** Fetch the pinned archive, keeping only the scripts and their index. */
export async function syncLibrary(fetchFn: typeof fetch = fetch, root = path.resolve(LIBRARY_DIR), commit = LIBRARY_COMMIT): Promise<boolean> {
  const marker = await readFile(path.join(root, "COMMIT"), "utf8").catch(() => "");
  if (marker.trim() === commit && existsSync(path.join(root, "scripts"))) return false;
  const res = await fetchFn(`https://codeload.github.com/${LIBRARY_REPO}/tar.gz/${commit}`);
  if (!res.ok) throw new Error(`library download: HTTP ${res.status}`);
  const tmp = `${root}.tmp`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const archive = `${tmp}.tar.gz`;
  await writeFile(archive, Buffer.from(await res.arrayBuffer()));
  await promisify(execFile)("tar", ["-xzf", archive, "--strip-components=1", "-C", tmp]);
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await rename(path.join(tmp, "public/scripts"), path.join(root, "scripts"));
  await rename(path.join(tmp, "data/new_scripts"), path.join(root, "catalog"));
  // the main story's index sits outside new_scripts
  await rename(path.join(tmp, "data/mainStoryScripts.ts"), path.join(root, "catalog/mainStoryScripts.ts"));
  await writeFile(path.join(root, "COMMIT"), commit);
  await rm(tmp, { recursive: true, force: true });
  await rm(archive, { force: true });
  return true;
}
