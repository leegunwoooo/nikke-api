import crypto from "node:crypto";
import type { MiddlewareHandler } from "hono";

const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";

/**
 * Data only changes on redeploy, so a weak ETag derived from the build's
 * syncedAt + request URL is enough — no need to hash response bodies.
 */
export function cacheHeaders(version: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    const url = new URL(c.req.url);
    // /api/user/* serves live upstream data — never edge-cache it against
    // the build version or a changed profile would return stale 304s
    if (url.pathname.startsWith("/api/user")) {
      await next();
      c.header("Cache-Control", "no-store");
      return;
    }
    const tag = crypto.createHash("sha1").update(`${version}|${url.pathname}${url.search}`).digest("hex");
    const etag = `W/"${tag.slice(0, 27)}"`;
    await next();
    // Conditional handling must happen after the route runs — a matching
    // URL-derived tag only means "fresh" if the resource actually exists
    if (c.res.status === 200) {
      c.header("ETag", etag);
      c.header("Cache-Control", CACHE_CONTROL);
      if (c.req.header("If-None-Match") === etag) {
        c.res = c.body(null, 304, { ETag: etag, "Cache-Control": CACHE_CONTROL });
      }
    }
  };
}
