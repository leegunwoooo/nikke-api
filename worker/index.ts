// Cloudflare Worker front for the Vercel deployment — caches cacheable GET
// responses at the edge so hobby-plan Vercel request usage stays low.
// The origin already marks responses: data endpoints get s-maxage=86400.
// /api/user/* is live upstream data on a shared BlablaLink account, so it
// gets a short USER_TTL edge cache instead of pass-through — repeat reads
// of the same profile absorb at the edge instead of burning the shared
// account's rate limit. ?refresh on any GET bypasses the cache once.
// ANALYTICS records one point per request (path group + HIT/MISS/PASS) —
// Vercel hobby keeps no request history, this is the traffic breakdown.

import { createApp } from "../src/factory.js";
import { httpStorage } from "../src/storage.js";

const USER_TTL = 300;
const USER_SWR = 86400;
const AREA_KV_TTL = 30 * 86400;

const CREDS_KEY = "bla:creds";
const HDR_CREDS = "x-bla-creds"; // edge->origin: current upstream session creds (b64 json)
const HDR_BLABLAID = "x-registered-blablaid"; // edge->origin: bound profile for /mcp/u/<key>

interface Env {
  ADMIN_TOKEN?: string;
  DIST_HOST?: string;
  ANALYTICS: {
    writeDataPoint(p: { blobs: string[]; doubles: number[]; indexes: string[] }): void;
  };
  RATE_LIMITER: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  AREA_KV?: { get(k: string): Promise<string | null>; put(k: string, v: string, o?: object): Promise<void> };
}

// the whole API app runs here — built once per isolate, data reads go to R2
let appPromise: Promise<ReturnType<typeof createApp>> | undefined;
const DATA_HOST = "https://nikke-api-data.pages.dev";
const getApp = (env: Env) => (appPromise ??= createApp(httpStorage(env.DIST_HOST ?? DATA_HOST)));

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
  return json({ ok: true, open_id: c.open_id, expires: c.expires });
};

// POST /mcp/register {url|blablaid} — verify the profile is reachable through
// the origin, then issue a personal connector key stored in KV
const registerUser = async (request: Request, env: Env) => {
  if (!env.AREA_KV) return json({ error: "KV not configured" }, 500);
  const app = await getApp(env);
  const body = (await request.json().catch(() => null)) as { url?: string; blablaid?: string } | null;
  const raw = body?.url ?? body?.blablaid;
  const openid = typeof raw === "string" ? intlOpenIdOf(raw) : null;
  if (!openid) return json({ error: "a BlablaLink share URL or openid is required" }, 400);
  const denied = await throttled(env, request);
  if (denied) return denied;
  const creds = await env.AREA_KV.get(CREDS_KEY);
  const probe = await app.fetch(
    new Request(`https://internal/api/user/${openid}?fields=intlOpenId`, {
      headers: creds ? { [HDR_CREDS]: creds } : {},
    }),
  );
  if (!probe.ok) return json({ error: `profile lookup failed (${probe.status})` }, 502);
  const key = `u_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await env.AREA_KV.put(`user:${key}`, JSON.stringify({ openid, created: new Date().toISOString() }));
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

// only origin-bound requests consume the limit — cache hits cost us nothing,
// but bypass tricks (junk params, ?refresh) can't drain Vercel's quota
const throttled = async (env: Env, request: Request) => {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.RATE_LIMITER.limit({ key: ip });
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
      return registerUser(request, env);
    }

    // /mcp/u/<key> — bound connector: resolve the key, inject the profile,
    // rewrite to plain /mcp. MCP is stateless POST; skip the GET cache path.
    const um = url.pathname.match(/^\/mcp\/u\/([A-Za-z0-9_-]+)$/);
    if (um) {
      const raw = await env.AREA_KV?.get(`user:${um[1]}`);
      if (!raw) return json({ error: "unknown connector key" }, 404);
      const { success } = await env.RATE_LIMITER.limit({ key: `u:${um[1]}` });
      if (!success) return json({ error: "rate limited — retry shortly" }, 429);
      const openid = (JSON.parse(raw) as { openid: string }).openid;
      url.pathname = "/mcp";
      h.set(HDR_BLABLAID, openid);
      const creds = await env.AREA_KV?.get(CREDS_KEY);
      if (creds) h.set(HDR_CREDS, creds);
      const app = await getApp(env);
      const res = await app.fetch(new Request(url.toString(), new Request(request, { headers: h })));
      track("PASS");
      return new Response(res.body, res);
    }

    // routes that can call the upstream game API get the latest creds injected
    if (url.pathname.startsWith("/api/user") || url.pathname.startsWith("/mcp")) {
      const creds = await env.AREA_KV?.get(CREDS_KEY);
      if (creds) h.set(HDR_CREDS, creds);
    }
    request = new Request(request, { headers: h });

    const userPath = url.pathname.startsWith("/api/user");
    const target = userPath ? userTargetOf(url) : null;

    const app = await getApp(env);
    if (request.method !== "GET" && request.method !== "HEAD") {
      const denied = await throttled(env, request);
      if (denied) return denied;
      const res = await app.fetch(request);
      track("PASS");
      const out = new Response(res.body, res);
      out.headers.set("Cache-Control", "no-store");
      return out;
    }

    const refresh = url.searchParams.has("refresh");
    url.searchParams.delete("refresh");
    // a remembered nikke_area_id lets the origin skip one upstream call
    if (target && !url.searchParams.has("area")) {
      const area = await env.AREA_KV?.get(target);
      if (area) url.searchParams.set("area", area);
    }
    url.searchParams.sort(); // param order shouldn't split the cache
    const key = new Request(url.toString());

    if (!refresh) {
      const hit = await caches.default.match(key);
      if (hit) {
        track("HIT");
        return outgoing(hit, "HIT", userPath);
      }
    }

    // a stale If-None-Match can't match the origin's version-derived ETag
    const denied = await throttled(env, request);
    if (denied) return denied;
    const oh = new Headers(h);
    oh.set("if-none-match", "");
    const res = await app.fetch(new Request(url.toString(), { headers: oh, method: "GET" }));
    if (res.ok) {
      const stored = new Response(res.clone().body, res);
      // user responses arrive no-store — rewrite TTL for edge storage only;
      // past USER_TTL the edge serves stale while it revalidates in the
      // background, so repeat lookups stay fast for up to SWR seconds
      if (userPath)
        stored.headers.set(
          "Cache-Control",
          `public, max-age=${USER_TTL}, s-maxage=${USER_TTL}, stale-while-revalidate=${USER_SWR}`,
        );
      ctx.waitUntil(caches.default.put(key, stored));
      // profile responses carry intlOpenId + areaId — remember the mapping
      if (target && env.AREA_KV) {
        ctx.waitUntil(
          (async () => {
            try {
              const j = (await res.clone().json()) as { intlOpenId?: string; areaId?: number };
              const openid = j.intlOpenId ?? target;
              if (typeof j.areaId === "number")
                await env.AREA_KV!.put(openid, String(j.areaId), { expirationTtl: AREA_KV_TTL });
            } catch { /* not json */ }
          })(),
        );
      }
    }
    track("MISS");
    return outgoing(res, "MISS", userPath);
  },
};
