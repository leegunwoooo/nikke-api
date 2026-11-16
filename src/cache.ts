import crypto from "node:crypto";
import type { MiddlewareHandler } from "hono";

const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";

// live-upstream paths outside the /api/user prefix — shared with worker/index.ts.
// the segment may be a numeric id or a "44-36" style stage number
export const LINEUP_PATH = /^\/api\/stages\/[^/]+\/lineups$/;

// every live-upstream GET that should take the short edge TTL — lineups and
// /api/codes (public live feed, no session) plus /api/user/* handled inline
export const LIVE_PATH = (pathname: string) =>
  LINEUP_PATH.test(pathname) || pathname === "/api/codes";

/**
 * Responses only change on a data or code deploy, so a weak ETag derived from
 * the version (syncedAt, plus the build id when bundled) + request URL is
 * enough — no need to hash response bodies.
 */
export function cacheHeaders(version: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    const url = new URL(c.req.url);
    // /api/user/* and stage lineups serve live upstream data — never edge-cache
    // them against the build version or a changed profile/leaderboard would
    // return stale 304s. /mcp's plain GET is a setup guide while an MCP
    // client's GET to the same URL needs the transport's answer — an URL-keyed
    // edge cache must not mix them
    if (url.pathname.startsWith("/api/user") || url.pathname === "/mcp" || LIVE_PATH(url.pathname)) {
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
