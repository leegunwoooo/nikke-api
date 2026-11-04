// Blablalink authenticated API client.
// Uses the owner's Level Infinite credentials (env: BLA_OPEN_ID, BLA_TOKEN,
// BLA_UID, BLA_CHANNEL_ID, BLA_EXPIRES — the values from localStorage
// `__ss_storage_ls_cache_login_meta__` after logging into blablalink) to
// obtain a `game_*` cookie session via /api/user/Login, then calls the
// game-proxy endpoints used by the ShiftyPad profile pages.

import { AsyncLocalStorage } from "node:async_hooks";

const BASE = "https://api.blablalink.com";

let cookieJar: string | null = null;
// creds that produced the jar — a runtime credential refresh (KV via edge)
// must not keep serving the old account's session cookies
let jarCredsKey: string | null = null;
let loggingIn: Promise<string> | null = null;

// The lookup-account credentials may be refreshed at runtime through the
// edge worker (KV -> x-bla-creds header, see worker/index.ts). They ride
// this request-scoped context instead of a module variable so one request's
// creds can never leak into another request. Env stays the fallback.
export interface BlaCreds {
  open_id: string;
  token: string;
  uid: string;
  channel_id: number;
  expires: string;
}
export const blaCredsContext = new AsyncLocalStorage<BlaCreds>();

// tests stub fetch per case — each stub needs a fresh upstream session
export function resetBlaSession() {
  cookieJar = null;
  jarCredsKey = null;
}

// x-bla-creds is base64 JSON set only by the edge — clients can set the same
// header but it only affects their own request, so no secret is needed
export function credsFromHeader(headerValue: string | null): BlaCreds | null {
  if (!headerValue) return null;
  try {
    const j = JSON.parse(Buffer.from(headerValue, "base64").toString("utf8"));
    if (!j.open_id || !j.token) return null;
    return {
      open_id: String(j.open_id),
      token: String(j.token),
      uid: String(j.uid ?? ""),
      channel_id: Number(j.channel_id ?? 6),
      expires: String(j.expires ?? ""),
    };
  } catch {
    return null;
  }
}

const envCreds = (): BlaCreds | null =>
  process.env.BLA_OPEN_ID && process.env.BLA_TOKEN
    ? {
        open_id: process.env.BLA_OPEN_ID,
        token: process.env.BLA_TOKEN,
        uid: process.env.BLA_UID ?? "",
        channel_id: Number(process.env.BLA_CHANNEL_ID ?? 6),
        expires: process.env.BLA_EXPIRES ?? "",
      }
    : null;

async function doLogin(): Promise<string> {
  const c = blaCredsContext.getStore() ?? envCreds();
  if (!c) throw new Error("blabla credentials not configured");
  const { open_id: openId, token } = c;
  const res = await fetch(`${BASE}/api/user/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "manual",
    body: JSON.stringify({
      game_openid: openId,
      game_channelid: c.channel_id,
      game_token: token,
      game_id: "29080",
      game_expire_time: c.expires,
      game_uid: c.uid,
    }),
  });
  const cookies = res.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .filter(Boolean);
  const j = (await res.json()) as { code?: number; msg?: string };
  if (j.code !== 0 || !cookies.length) {
    // ret=11002 "Inner token is invalid" = the stored Level Infinite token in
    // BLA_TOKEN expired — the fix is env vars, not this request path.
    const hint = /token|expire/i.test(j.msg ?? "")
      ? " (BLA_* credentials expired — refresh from blablalink localStorage)"
      : "";
    throw new Error(`blabla login failed: ${j.msg ?? res.status}${hint}`);
  }
  cookieJar = cookies.join("; ");
  jarCredsKey = `${c.open_id}:${c.token}`;
  return cookieJar;
}

function login(): Promise<string> {
  const c = blaCredsContext.getStore() ?? envCreds();
  const key = c ? `${c.open_id}:${c.token}` : null;
  if (cookieJar && jarCredsKey === key) return Promise.resolve(cookieJar);
  cookieJar = null;
  return (loggingIn ??= doLogin().finally(() => (loggingIn = null)));
}

export interface GameResponse<T = unknown> {
  code: number;
  code_type?: number;
  msg?: string;
  data: T;
}

// upstream "request too frequently" — bursts (e.g. the roster endpoint's
// multi-area sweep) trip this even on a healthy session. Retried with
// backoff below; returning the last response keeps the caller's error real.
export const RATE_LIMIT_CODES = new Set([212000]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post<T>(path: string, body: Record<string, unknown>): Promise<GameResponse<T>> {
  let limited: GameResponse<T> | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(400 * 2 ** (attempt - 1) + Math.random() * 200);
    for (let i = 0; i < 2; i++) {
      const cookie = await login();
      const r = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as GameResponse<T>;
      if (j.code === 300001 || j.code === 300004) {
        cookieJar = null; // session expired — retry once with fresh login
        continue;
      }
      if (RATE_LIMIT_CODES.has(j.code ?? -1)) {
        limited = j;
        break;
      }
      return j;
    }
    if (!limited) throw new Error("blabla auth failed"); // session rejected twice
    // rate limited — the outer loop backs off and retries
  }
  if (limited) return limited;
  throw new Error("blabla auth failed");
}

export const gameApi = <T = unknown>(
  service: "Game" | "Tools",
  method: string,
  body: Record<string, unknown>,
) => post<T>(`/api/game/proxy/${service}/${method}`, body);

export const playerInfo = <T = unknown>(intlOpenId: string) =>
  post<T>("/api/ugc/direct/standalonesite/User/GetUserGamePlayerInfo", {
    intl_open_id: intlOpenId,
  });

// shared-profile openid: base64 of "<game_id>-<intl_open_id>"
export function decodeOpenid(input: string): { intlOpenId: string } | null {
  let oid = input.trim();
  const m = oid.match(/openid=([^&\s]+)/); // accept full share URLs too
  try {
    if (m) oid = decodeURIComponent(m[1]);
  } catch {
    return null; // malformed percent-encoding — not a valid share URL
  }
  const decoded = Buffer.from(oid, "base64").toString("utf8");
  const parts = decoded.split("-");
  const id = parts.length === 2 ? parts[1] : oid;
  return /^\d+$/.test(id) ? { intlOpenId: id } : null;
}
