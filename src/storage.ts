// Data file access behind a small interface — locally the files live under
// NIKKE_DATA_DIR, in production the worker reads them over HTTP from the
// nikke-api-data Pages host. All reads are async either way, so callers
// never notice the difference.

export interface Storage {
  readText(rel: string): Promise<string>;
  readJson<T>(rel: string): Promise<T>;
  /** file names directly inside `dir` (empty when the dir is missing) */
  list(dir: string): Promise<string[]>;
}

export function fsStorage(root: string): Storage {
  return {
    async readText(rel) {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      return readFile(join(root, rel), "utf8");
    },
    async readJson<T>(rel: string) {
      return JSON.parse(await this.readText(rel)) as T;
    },
    async list(dir) {
      const { readdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      try {
        return await readdir(join(root, dir));
      } catch {
        return [];
      }
    },
  };
}

// Static-host storage — dist files served from a Pages project (or any static
// host). list() needs a generated _manifest.json since static hosts have no
// directory listing.
export function httpStorage(base: string): Storage {
  const root = base.replace(/\/$/, "");
  let manifest: Promise<string[]> | undefined;
  return {
    async readText(rel) {
      // cf.cacheTtl lets CF's edge cache dedupe these fetches across
      // isolates — a fresh isolate still pays one fetch per file, but a
      // burst of cold isolates only costs the data host once. 60s is well
      // under the worker's 5min data-version revalidation, so a deploy's
      // staleness window is bounded. (the stamp check itself stays uncached)
      const r = await fetch(`${root}/${rel}`, { cf: { cacheTtl: 60 } } as RequestInit);
      if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
      return r.text();
    },
    async readJson<T>(rel: string) {
      return JSON.parse(await this.readText(rel)) as T;
    },
    async list(dir) {
      // a failed manifest read must not be cached for the isolate's lifetime —
      // and it must not read as "no files": an empty list is a 200 the edge
      // would then cache for a day. Drop the cache and let the error through
      // so the route can answer a non-cacheable error.
      manifest ??= this.readJson<string[]>("_manifest.json").catch((e) => {
        manifest = undefined;
        throw e;
      });
      const files = await manifest;
      const prefix = dir.replace(/\/?$/, "/");
      return files
        .filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/"))
        .map((f) => f.slice(prefix.length));
    },
  };
}
