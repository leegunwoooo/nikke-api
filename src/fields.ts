import type { Context } from "hono";

/** `?fields=a,b.c` -> ["a", "b.c"], or undefined when absent */
export function fieldsOf(c: Context): string[] | undefined {
  const raw = c.req.query("fields");
  if (!raw) return undefined;
  const fields = raw.split(",").map((f) => f.trim()).filter(Boolean);
  return fields.length ? fields : undefined;
}

function pickOne(obj: unknown, fields: string[]): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const keys = f.split(".");
    let src: unknown = obj;
    for (const k of keys) src = src && typeof src === "object" ? (src as Record<string, unknown>)[k] : undefined;
    if (src === undefined) continue;
    let dst = out;
    for (const k of keys.slice(0, -1)) dst = (dst[k] ??= {}) as Record<string, unknown>;
    dst[keys[keys.length - 1]] = src;
  }
  return out;
}

/** trim an object (or each object of an array) to the given dot paths */
export function pickFields<T>(value: T, fields?: string[]): T {
  if (!fields) return value;
  return (Array.isArray(value) ? value.map((v) => pickOne(v, fields)) : pickOne(value, fields)) as T;
}

export const LOCALES = new Set(["ko", "en", "ja", "zh-TW"]);

const isLocalized = (o: Record<string, unknown>) => {
  const keys = Object.keys(o);
  return keys.length > 0 && keys.every((k) => LOCALES.has(k));
};

/** flatten {ko,en,ja,zh-TW} objects to a single string for `?lang=` */
export function localize(value: unknown, lang: string): unknown {
  if (Array.isArray(value)) return value.map((v) => localize(v, lang));
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (isLocalized(o)) return o[lang] ?? o.ko ?? o.en ?? Object.values(o)[0];
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = localize(v, lang);
    return out;
  }
  return value;
}
