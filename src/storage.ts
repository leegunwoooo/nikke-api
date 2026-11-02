// Data file access behind a small interface — locally and on Vercel the files
// live under NIKKE_DATA_DIR, on the Cloudflare Worker they live in R2. All
// reads are async either way, so callers never notice the difference.

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

interface R2Like {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  list(opts?: { prefix?: string }): Promise<{ objects: { key: string }[] }>;
}

export function r2Storage(bucket: R2Like): Storage {
  return {
    async readText(rel) {
      const obj = await bucket.get(rel);
      if (!obj) throw new Error(`not found: ${rel}`);
      return obj.text();
    },
    async readJson<T>(rel: string) {
      return JSON.parse(await this.readText(rel)) as T;
    },
    async list(dir) {
      const prefix = dir.replace(/\/?$/, "/");
      const names: string[] = [];
      const res = await bucket.list({ prefix });
      for (const o of res.objects) names.push(o.key.slice(prefix.length));
      return names.filter((n) => n && !n.includes("/"));
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
      const r = await fetch(`${root}/${rel}`);
      if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
      return r.text();
    },
    async readJson<T>(rel: string) {
      return JSON.parse(await this.readText(rel)) as T;
    },
    async list(dir) {
      const files = await (manifest ??= this.readJson<string[]>("_manifest.json").catch(() => []));
      const prefix = dir.replace(/\/?$/, "/");
      return files
        .filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/"))
        .map((f) => f.slice(prefix.length));
    },
  };
}
