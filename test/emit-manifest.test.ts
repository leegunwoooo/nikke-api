import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { emitManifest } from "../scripts/emit-manifest.js";

test("manifest lists dist files relative to the root, sorted, without itself", () => {
  const root = mkdtempSync(path.join(tmpdir(), "manifest-"));
  try {
    mkdirSync(path.join(root, "scenes"));
    writeFileSync(path.join(root, "scenes/b.json"), "{}");
    writeFileSync(path.join(root, "a.json"), "{}");
    writeFileSync(path.join(root, "_manifest.json"), "[]"); // from an earlier run
    emitManifest(root);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, "_manifest.json"), "utf8")), ["a.json", "scenes/b.json"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
