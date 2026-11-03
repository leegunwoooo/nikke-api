import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { diffLibrary, renderIssue } from "./library-diff.js";
import { LIBRARY_COMMIT, LIBRARY_REPO, readLibraryStories, syncLibrary } from "./library-stories.js";

// Compares the archive's main branch with the pinned commit and writes an issue
// body to the path in argv[2]. Outputs head=<sha> and changed=true|false for the
// workflow. argv[3] overrides the base commit, for trying it out by hand.
async function latestCommit(): Promise<string> {
  const token = process.env.GH_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${LIBRARY_REPO}/commits/main`, {
    headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  // a renamed or deleted archive has to fail the run: nothing else would say so
  if (!res.ok) throw new Error(`${LIBRARY_REPO}: HTTP ${res.status}`);
  return ((await res.json()) as { sha: string }).sha;
}

async function main() {
  const [outFile, baseArg] = process.argv.slice(2);
  if (!outFile) throw new Error("usage: library-watch <issue-body-file> [base-commit]");
  const base = baseArg ?? LIBRARY_COMMIT;
  const head = await latestCommit();
  const output = async (changed: boolean) => {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `head=${head}\nchanged=${changed}\n`);
  };
  if (head === base) {
    console.log(`archive unchanged at ${head}`);
    await output(false);
    return;
  }
  const dir = await mkdtemp(path.join(tmpdir(), "library-watch-"));
  try {
    const read = async (commit: string, name: string) => {
      const root = path.join(dir, name);
      await syncLibrary(fetch, root, commit);
      return readLibraryStories(root, commit);
    };
    const before = await read(base, "base");
    const after = await read(head, "head");
    const diff = diffLibrary(before.scenes, after.scenes);
    await writeFile(
      outFile,
      renderIssue({ repo: LIBRARY_REPO, base, head, diff, warnings: after.warnings, baseWarnings: before.warnings.length }),
    );
    console.log(`archive ${base.slice(0, 7)} -> ${head.slice(0, 7)}: +${diff.added.length} ~${diff.changed.length} -${diff.removed.length}`);
    await output(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
