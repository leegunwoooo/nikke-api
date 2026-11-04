// Cloudflare Worker — serves the whole API app directly. GET responses are
// edge-cached (data endpoints mark s-maxage=86400) so repeat reads never
// touch the app or the data host. /api/user/* is live upstream data on a
// shared BlablaLink account, so it gets a short USER_TTL edge cache instead —
// repeat reads absorb at the edge instead of burning the shared account's
// rate limit. ?refresh on any GET bypasses once.
// ANALYTICS records one point per request (path group + HIT/MISS/PASS).

import { createApp } from "../src/factory.js";
import { httpStorage } from "../src/storage.js";

const USER_TTL = 300;
const AREA_KV_TTL = 30 * 86400;

const CREDS_KEY = "bla:creds";
const HDR_CREDS = "x-bla-creds"; // edge->origin: current upstream session creds (b64 json)
const HDR_BLABLAID = "x-registered-blablaid"; // edge->origin: bound profile for /mcp/u/<key>

// CF cache API isn't in the DOM types — one typed handle for the default store
const edgeCache = (caches as unknown as {
  default: { match(k: Request): Promise<Response | undefined>; put(k: Request, r: Response): Promise<void> };
}).default;

interface Env {
  ADMIN_TOKEN?: string;
  DIST_HOST?: string;
  ANALYTICS: {
    writeDataPoint(p: { blobs: string[]; doubles: number[]; indexes: string[] }): void;
  };
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  AREA_KV?: { get(k: string): Promise<string | null>; put(k: string, v: string, o?: object): Promise<void> };
}

// content hash of this bundle, injected by scripts/emit-pages-worker.ts.
// Undefined when the worker runs unbundled — caching then ignores it.
const BUILD_ID = typeof __BUILD_ID__ === "undefined" ? undefined : __BUILD_ID__;

// the whole API app runs here — built once per isolate, data reads go to
// the Pages data host. Re-check the bundle version every few minutes so a
// data refresh reaches long-lived isolates without a redeploy.
type App = Awaited<ReturnType<typeof createApp>>;
const DATA_HOST = "https://nikke-api-data.pages.dev";
const REVALIDATE_MS = 300_000;
let appPromise: Promise<App> | undefined;
let appBuiltAt = 0;
let dataStamp = "";
const stampOf = (host: string) =>
  fetch(`${host}/characters.json`)
    .then((r) => r.json() as Promise<{ syncedAt?: string; version?: string }>)
    .then((j) => `${j.syncedAt}|${j.version}`)
    .catch(() => null);
// the stamp namespaces edge-cache keys — without it a cold isolate can serve
// a pre-deploy cached body for up to the TTL. Learned once per isolate (shared
// in-flight promise, failures retry next request); after that it's free.
let stampPromise: Promise<string | null> | undefined;
const dataVersionOf = (env: Env): Promise<string | null> => {
  if (dataStamp) return Promise.resolve(dataStamp);
  const host = env.DIST_HOST ?? DATA_HOST;
  return (stampPromise ??= stampOf(host).then((s) => {
    stampPromise = undefined;
    if (s !== null) dataStamp = s;
    return s;
  }));
};
// revalidation runs in the background — requests never wait on the stamp
// fetch, and a data refresh still reaches long-lived isolates within
// REVALIDATE_MS + one request
const getApp = async (env: Env, ctx?: ExecutionContext): Promise<App> => {
  const host = env.DIST_HOST ?? DATA_HOST;
  const now = Date.now();
  if (appPromise && now - appBuiltAt < REVALIDATE_MS) return appPromise;
  if (appPromise) {
    // warm isolate past the revalidation window — serve the current app
    // and refresh the stamp (and the app, if it changed) in the background
    const check = stampOf(host).then(async (stamp) => {
      appBuiltAt = Date.now();
      if (stamp !== null && stamp !== dataStamp) {
        dataStamp = stamp;
        appPromise = createApp(httpStorage(host), { buildId: BUILD_ID });
        // keep the rebuild inside waitUntil — ending the request earlier
        // would let the isolate die mid-rebuild and leave a pending appPromise
        await appPromise.catch(() => {});
      }
    });
    if (ctx) ctx.waitUntil(check);
    else check.catch(() => {});
    return appPromise;
  }
  // cold isolate — build now; learn the current stamp in the background so
  // revalidation has a baseline without a second request-path fetch
  appBuiltAt = now;
  appPromise = createApp(httpStorage(host), { buildId: BUILD_ID });
  const learn = dataVersionOf(env).catch(() => {});
  if (ctx) ctx.waitUntil(learn);
  return appPromise;
};

const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// canonical creds — accepts the raw __ss_storage_ls_cache_login_meta__ JSON
// (game_* keys) or our own field names
const credsOf = (raw: any) => {
  if (!raw || typeof raw !== "object") return null;
  const c = {
    open_id: String(raw.game_openid ?? raw.open_id ?? ""),
    token: String(raw.game_token ?? raw.token ?? ""),
    uid: String(raw.game_uid ?? raw.uid ?? ""),
    channel_id: Number(raw.game_channelid ?? raw.channel_id ?? 6),
    expires: String(raw.game_expire_time ?? raw.expires ?? ""),
  };
  return c.open_id && c.token ? c : null;
};

// prove the creds work by running the same login the origin does
const validateCreds = async (c: NonNullable<ReturnType<typeof credsOf>>) => {
  const res = await fetch("https://api.blablalink.com/api/user/Login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      game_openid: c.open_id,
      game_channelid: c.channel_id,
      game_token: c.token,
      game_id: "29080",
      game_expire_time: c.expires,
      game_uid: c.uid,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { code?: number; msg?: string };
  return { ok: j.code === 0, msg: j.msg };
};

// POST /admin/token {creds} — validate upstream, then KV. GET = masked status.
const adminToken = async (request: Request, env: Env) => {
  if (!env.ADMIN_TOKEN || request.headers.get("x-admin-token") !== env.ADMIN_TOKEN)
    return json({ error: "unauthorized" }, 401);
  if (!env.AREA_KV) return json({ error: "KV not configured" }, 500);
  if (request.method === "GET") {
    const raw = await env.AREA_KV.get(CREDS_KEY);
    const c = raw ? credsOf(JSON.parse(raw)) : null;
    return json({ configured: !!c, open_id: c?.open_id ?? null, expires: c?.expires ?? null });
  }
  const c = credsOf(await request.json().catch(() => null));
  if (!c) return json({ error: "credentials must include game_openid and game_token" }, 400);
  const v = await validateCreds(c);
  if (!v.ok) return json({ error: `upstream login failed — credentials expired or invalid${v.msg ? `: ${v.msg}` : ""}` }, 400);
  await env.AREA_KV.put(CREDS_KEY, JSON.stringify(c));
  credsMemo = { v: JSON.stringify(c), at: Date.now() };
  return json({ ok: true, open_id: c.open_id, expires: c.expires });
};

// POST /mcp/register {url|blablaid} — verify the profile is reachable through
// the origin, then issue a personal connector key stored in KV
const registerUser = async (request: Request, env: Env, ctx?: ExecutionContext) => {
  if (!env.AREA_KV) return json({ error: "KV not configured" }, 500);
  const app = await getApp(env, ctx);
  const body = (await request.json().catch(() => null)) as { url?: string; blablaid?: string } | null;
  const raw = body?.url ?? body?.blablaid;
  const openid = typeof raw === "string" ? intlOpenIdOf(raw) : null;
  if (!openid) return json({ error: "a BlablaLink share URL or openid is required" }, 400);
  const denied = await throttled(env, request);
  if (denied) return denied;
  const creds = await getCreds(env);
  const probe = await app.fetch(
    new Request(`https://internal/api/user/${openid}?fields=intlOpenId`, {
      headers: creds ? { [HDR_CREDS]: btoa(creds) } : {},
    }),
  );
  if (!probe.ok) return json({ error: `profile lookup failed (${probe.status})` }, 502);
  const key = `u_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const stored = JSON.stringify({ openid, created: new Date().toISOString() });
  await env.AREA_KV.put(`user:${key}`, stored);
  keyMemo.set(key, { v: stored, at: Date.now() });
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? new URL(request.url).host;
  return json({ key, url: `${proto}://${host}/mcp/u/${key}` });
};

// intl_open_id from any blablaid form (path segment, base64 openid, share URL)
const intlOpenIdOf = (input: string): string | null => {
  let oid = input.trim();
  const m = oid.match(/openid=([^&\s]+)/);
  try {
    if (m) oid = decodeURIComponent(m[1]);
    const parts = atob(oid).split("-"); // "<game_id>-<intl_open_id>" or raw id
    const id = parts.length === 2 ? parts[1] : oid;
    return /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
};

const userTargetOf = (url: URL) => {
  const raw =
    url.pathname.match(/^\/api\/user\/([^/?]+)/)?.[1] ??
    url.searchParams.get("blablaid") ??
    url.searchParams.get("openid") ??
    url.searchParams.get("url");
  return raw ? intlOpenIdOf(raw) : null;
};

// KV reads are the scarcest free-tier quota after requests (100k/day) and
// all three values below change rarely — creds only on manual admin reseed,
// connector keys never, area ids only once per profile. Isolate-memory
// memoization turns repeat reads free; worst-case staleness is TTL seconds.
const CREDS_MEMO_MS = 60_000;
const KEY_MEMO_MS = 3600_000;
const AREA_MEMO_MS = 3600_000;
let credsMemo: { v: string | null; at: number } | undefined;
const keyMemo = new Map<string, { v: string; at: number }>();
const areaMemo = new Map<string, { v: string; at: number }>();

const getCreds = async (env: Env) => {
  const now = Date.now();
  if (credsMemo && now - credsMemo.at < CREDS_MEMO_MS) return credsMemo.v;
  const v = (await env.AREA_KV?.get(CREDS_KEY)) ?? null;
  credsMemo = { v, at: now };
  return v;
};

// misses aren't memoized — a newly registered key must work on any isolate
// immediately, while known keys are immutable and safe to remember
const getConnector = async (env: Env, key: string) => {
  const m = keyMemo.get(key);
  const now = Date.now();
  if (m && now - m.at < KEY_MEMO_MS) return m.v;
  const v = await env.AREA_KV?.get(`user:${key}`);
  if (v != null) keyMemo.set(key, { v, at: now });
  return v ?? null;
};

const getArea = async (env: Env, openid: string) => {
  const m = areaMemo.get(openid);
  const now = Date.now();
  if (m && now - m.at < AREA_MEMO_MS) return m.v;
  const v = await env.AREA_KV?.get(openid);
  if (v != null) areaMemo.set(openid, { v, at: now });
  return v ?? null;
};

// per-isolate sliding window — fallback when no RATE_LIMITER binding exists
// (Pages Functions don't support it). Per-isolate is still bounded, and the
// real binding takes precedence when present.
const windows = new Map<string, number[]>();
const inMemoryLimited = (key: string, limit = 60) => {
  const now = Date.now();
  // bound memory under IP-scan bursts — sweep dead windows only when large
  if (windows.size > 5000)
    for (const [k, ts] of windows) if (now - ts[ts.length - 1] > 60_000) windows.delete(k);
  const w = (windows.get(key) ?? []).filter((t) => now - t < 60_000);
  if (w.length >= limit) return true;
  w.push(now);
  windows.set(key, w);
  return false;
};

// only origin-bound requests consume the limit — cache hits cost us nothing,
// but bypass tricks (junk params, ?refresh) can't drain upstream quota
const throttled = async (env: Env, request: Request) => {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limited = env.RATE_LIMITER
    ? !(await env.RATE_LIMITER.limit({ key: ip })).success
    : inMemoryLimited(ip);
  const success = !limited;
  return success
    ? null
    : new Response(JSON.stringify({ error: "rate limited — retry shortly" }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "60" },
      });
};

// group by route family — /api/user/<openid>/nikke -> /api/user
const pathGroup = (pathname: string) => pathname.split("/").slice(0, 3).join("/") || "/";

const outgoing = (
  res: Response,
  edge: "HIT" | "MISS" | "PASS",
  userPath: boolean,
) => {
  const out = new Response(res.body, res);
  out.headers.set("x-edge-cache", edge);
  // clients keep the origin's live-data contract; only the edge caches
  if (userPath) out.headers.set("Cache-Control", "no-store");
  return out;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    const group = pathGroup(url.pathname);
    const track = (edge: string) =>
      env.ANALYTICS?.writeDataPoint({
        blobs: [group, edge],
        doubles: [1],
        indexes: [group],
      });

    // clients can never set these — only the worker injects them
    const h = new Headers(request.headers);
    h.delete(HDR_CREDS);
    h.delete(HDR_BLABLAID);

    if (url.pathname === "/admin/token") {
      if (request.method === "GET" || request.method === "POST") return adminToken(request, env);
      return json({ error: "method not allowed" }, 405);
    }
    if (url.pathname === "/mcp/register") {
      if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
      return registerUser(request, env, ctx);
    }

    // /mcp/u/<key> — bound connector: resolve the key, inject the profile,
    // rewrite to plain /mcp. MCP is stateless POST; skip the GET cache path.
    const um = url.pathname.match(/^\/mcp\/u\/([A-Za-z0-9_-]+)$/);
    if (um) {
      const raw = await getConnector(env, um[1]);
      if (!raw) return json({ error: "unknown connector key" }, 404);
      const limited = env.RATE_LIMITER
        ? !(await env.RATE_LIMITER.limit({ key: `u:${um[1]}` })).success
        : inMemoryLimited(`u:${um[1]}`);
      if (limited) return json({ error: "rate limited — retry shortly" }, 429);
      const openid = (JSON.parse(raw) as { openid: string }).openid;
      url.pathname = "/mcp";
      h.set(HDR_BLABLAID, openid);
      const creds = await getCreds(env);
      if (creds) h.set(HDR_CREDS, btoa(creds));
      const app = await getApp(env, ctx);
      const res = await app.fetch(new Request(url.toString(), new Request(request, { headers: h })));
      track("PASS");
      return new Response(res.body, res);
    }

    const userPath = url.pathname.startsWith("/api/user");
    const target = userPath ? userTargetOf(url) : null;
    const isGet = request.method === "GET" || request.method === "HEAD";
    let key: Request | undefined;
    let callerArea = false; // ?area= came from the request, not the remembered value

    // GET: serve from edge cache BEFORE touching the app or KV — a hit
    // shouldn't spend an app init (characters.json read) or creds lookup.
    // ?refresh bypasses the cache — keep it admin-only so anonymous callers
    // can't burn function invocations + data fetches on repeat
    const refresh =
      url.searchParams.has("refresh") &&
      !!env.ADMIN_TOKEN &&
      request.headers.get("x-admin-token") === env.ADMIN_TOKEN;
    if (isGet) {
      url.searchParams.delete("refresh");
      callerArea = url.searchParams.has("area");
      // a remembered nikke_area_id lets the origin skip one upstream call —
      // not on /roster, where ?area= narrows the five-server sweep to one
      if (target && !url.searchParams.has("area") && !/^\/api\/user\/[^/]+\/roster$/.test(url.pathname)) {
        const area = await getArea(env, target);
        if (area) url.searchParams.set("area", area);
      }
      url.searchParams.sort(); // param order shouldn't split the cache
      // fields order shouldn't either — ?fields=a,b and ?fields=b,a are the
      // same response, so canonicalize before they fork the cache key
      const f = url.searchParams.getAll("fields");
      if (f.length) {
        const v = [...new Set(f.flatMap((s) => s.split(",").map((x) => x.trim())).filter(Boolean))]
          .sort()
          .join(",");
        url.searchParams.delete("fields");
        if (v) url.searchParams.set("fields", v);
      }
      // version-scope the cache key — a data or code deploy must not let this
      // isolate keep serving pre-deploy bodies for the rest of their TTL
      const dv = await dataVersionOf(env);
      const v = [dv, BUILD_ID].filter(Boolean).join("|");
      const keyUrl = new URL(url);
      if (v) keyUrl.searchParams.set("__v", v);
      key = new Request(keyUrl.toString());
      if (!refresh) {
        const hit = await edgeCache.match(key);
        if (hit) {
          track("HIT");
          // honor If-None-Match against the stored ETag — a matching tag
          // means 304 instead of resending the whole body
          const etag = hit.headers.get("etag");
          const inm = request.headers.get("if-none-match");
          if (etag && inm && inm.split(",").map((t) => t.trim()).includes(etag)) {
            return new Response(null, { status: 304, headers: { etag, "x-edge-cache": "HIT" } });
          }
          return outgoing(hit, "HIT", userPath);
        }
      }
    }

    // MISS/pass-through from here on — now the app and creds are needed
    if (userPath || url.pathname.startsWith("/mcp")) {
      const creds = await getCreds(env);
      if (creds) h.set(HDR_CREDS, btoa(creds));
    }
    request = new Request(request, { headers: h });
    const app = await getApp(env, ctx);

    if (!isGet) {
      const denied = await throttled(env, request);
      if (denied) return denied;
      const res = await app.fetch(request);
      track("PASS");
      const out = new Response(res.body, res);
      out.headers.set("Cache-Control", "no-store");
      return out;
    }

    // a stale If-None-Match can't match the origin's version-derived ETag
    const denied = await throttled(env, request);
    if (denied) return denied;
    const oh = new Headers(h);
    oh.set("if-none-match", "");
    const res = await app.fetch(new Request(url.toString(), { headers: oh, method: "GET" }));
    // userPath responses are rewritten to edge-cacheable below; other
    // no-store responses (mcp guide etc.) must not be stored at all
    const cacheable = res.ok && (userPath || !res.headers.get("cache-control")?.includes("no-store"));
    if (cacheable) {
      const stored = new Response(res.clone().body, res);
      // user responses arrive no-store — rewrite TTL for edge storage only;
      // the Cache API has no stale-while-revalidate, so past USER_TTL the next
      // lookup is a plain miss that goes upstream
      if (userPath) stored.headers.set("Cache-Control", `public, max-age=${USER_TTL}, s-maxage=${USER_TTL}`);
      ctx.waitUntil(edgeCache.put(key!, stored));
      // profile responses carry intlOpenId + areaId — remember the mapping,
      // but never one the caller chose: anyone could pin someone else's server
      if (target && env.AREA_KV && !callerArea) {
        ctx.waitUntil(
          (async () => {
            try {
              const j = (await res.clone().json()) as { intlOpenId?: string; areaId?: number };
              const openid = j.intlOpenId ?? target;
              // KV writes are the scarce quota (1k/day free) — skip the put
              // when the memoized mapping already agrees, since a profile
              // MISS fires this path on every uncached lookup
              if (typeof j.areaId === "number") {
                const v = String(j.areaId);
                const m = areaMemo.get(openid);
                if (!m || m.v !== v || Date.now() - m.at > AREA_KV_TTL) {
                  await env.AREA_KV!.put(openid, v, { expirationTtl: AREA_KV_TTL });
                  areaMemo.set(openid, { v, at: Date.now() });
                }
              }
            } catch { /* not json */ }
          })(),
        );
      }
    }
    track("MISS");
    return outgoing(res, "MISS", userPath);
  },
};
