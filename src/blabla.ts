// Blablalink authenticated API client.
// Uses the owner's Level Infinite credentials (env: BLA_OPEN_ID, BLA_TOKEN,
// BLA_UID, BLA_CHANNEL_ID, BLA_EXPIRES — the values from localStorage
// `__ss_storage_ls_cache_login_meta__` after logging into blablalink) to
// obtain a `game_*` cookie session via /api/user/Login, then calls the
// game-proxy endpoints used by the ShiftyPad profile pages.

const BASE = "https://api.blablalink.com";

let cookieJar: string | null = null;
let loggingIn: Promise<string> | null = null;

async function doLogin(): Promise<string> {
  const openId = process.env.BLA_OPEN_ID;
  const token = process.env.BLA_TOKEN;
  if (!openId || !token) throw new Error("blabla credentials not configured");
  const res = await fetch(`${BASE}/api/user/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "manual",
    body: JSON.stringify({
      game_openid: openId,
      game_channelid: Number(process.env.BLA_CHANNEL_ID ?? 6),
      game_token: token,
      game_id: "29080",
      game_expire_time: process.env.BLA_EXPIRES ?? "",
      game_uid: process.env.BLA_UID ?? "",
    }),
  });
  const cookies = res.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .filter(Boolean);
  const j = (await res.json()) as { code?: number; msg?: string };
  if (j.code !== 0 || !cookies.length)
    throw new Error(`blabla login failed: ${j.msg ?? res.status}`);
  cookieJar = cookies.join("; ");
  return cookieJar;
}

function login(): Promise<string> {
  if (cookieJar) return Promise.resolve(cookieJar);
  return (loggingIn ??= doLogin().finally(() => (loggingIn = null)));
}

export interface GameResponse<T = unknown> {
  code: number;
  code_type?: number;
  msg?: string;
  data: T;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<GameResponse<T>> {
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
    return j;
  }
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
