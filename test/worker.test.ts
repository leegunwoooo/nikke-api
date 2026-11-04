import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

// worker/index.ts grabs caches.default at import time — stub it first
const edge = new Map<string, Response>();
(globalThis as any).caches = {
  default: {
    match: async (k: Request) => edge.get(k.url)?.clone(),
    put: async (k: Request, r: Response) => void edge.set(k.url, r.clone()),
  },
};
const { default: worker } = await import("../worker/index.js");
const { resetBlaSession } = await import("../src/blabla.js");

const DIST = path.join(import.meta.dirname, "fixtures/dist");
const DIST_HOST = "https://dist.test";
const CREDS = JSON.stringify({ open_id: "test-openid", token: "test-token", uid: "", channel_id: 6, expires: "" });

// DIST_HOST reads come from the fixtures, BlablaLink is scripted per area.
// areaCalls records which servers GetUserCharacters was asked for.
function stubFetch(perArea: (area: number) => { code: number; characters?: unknown[]; msg?: string } = () => ({ code: 0 })) {
  const orig = globalThis.fetch;
  resetBlaSession();
  const areaCalls: number[] = [];
  const paths: string[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url ?? input);
    if (url.startsWith(DIST_HOST)) {
      const rel = url.slice(DIST_HOST.length + 1);
      return readFile(path.join(DIST, rel)).then(
        (b) => new Response(b),
        () => new Response("not found", { status: 404 }),
      );
    }
    paths.push(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (url.endsWith("/api/user/Login"))
      return new Response(JSON.stringify({ code: 0 }), { headers: { "set-cookie": "game_token=t; Path=/" } });
    if (url.includes("GetUserGamePlayerInfo")) return Response.json({ code: 0, data: { area_id: 83 } });
    if (url.includes("GetUserProfileBasicInfo"))
      return Response.json({ code: 0, data: { basic_info: { nickname: "t", lv: 1, character_count: 1 } } });
    if (url.includes("GetUserCharacters")) {
      areaCalls.push(body.nikke_area_id);
      const r = perArea(body.nikke_area_id);
      return Response.json({ code: r.code, msg: r.msg ?? "", data: { characters: r.characters } });
    }
    if (url.includes("GetUserCharacterDetails"))
      return Response.json({ code: 0, data: { character_details: [], state_effects: [] } });
    if (url.includes("GetUserProfileOutpostInfo")) return Response.json({ code: 0, data: { outpost_info: null } });
    return Response.json({ code: -1, msg: "unmocked" });
  }) as typeof fetch;
  return {
    areaCalls,
    paths,
    restore: () => {
      globalThis.fetch = orig;
    },
  };
}

function envOf(seed: Record<string, string> = {}) {
  const kv = new Map<string, string>([["bla:creds", CREDS], ...Object.entries(seed)]);
  return {
    kv,
    env: {
      DIST_HOST,
      AREA_KV: {
        get: async (k: string) => kv.get(k) ?? null,
        put: async (k: string, v: string) => void kv.set(k, v),
      },
    } as any,
  };
}

// runs one request and waits for its waitUntil work (edge put, KV write)
async function send(env: any, pathAndQuery: string) {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) } as any;
  const res: Response = await worker.fetch(new Request(`https://api.test${pathAndQuery}`), env, ctx);
  await Promise.all(pending);
  return res;
}

const ALL_AREAS = [83, 81, 84, 82, 85];
const has = (stub: { paths: string[] }, method: string) => stub.paths.some((u) => u.includes(method));

// every test uses its own id — the worker memoizes areas per isolate. Ids are
// 19 digits like real ones: a short id fails atob and takes another code path.
test("roster sweeps every server after a profile lookup remembered the area", async () => {
  const id = "1000000000000000001";
  const stub = stubFetch((a) => ({ code: 0, characters: [{ name_code: a }] }));
  try {
    const { env, kv } = envOf();
    const profile = await send(env, `/api/user/${id}`);
    assert.equal(profile.status, 200);
    assert.equal(kv.get(id), "83"); // the area really was remembered

    const res = await send(env, `/api/user/${id}/roster`);
    assert.equal(res.status, 200);
    assert.deepEqual(stub.areaCalls, ALL_AREAS);
    assert.deepEqual(((await res.json()) as any).areas.map((a: any) => a.area), ALL_AREAS);
  } finally {
    stub.restore();
  }
});

test("roster ignores a remembered area of 0 instead of answering 400", async () => {
  const id = "1000000000000000002";
  const stub = stubFetch((a) => (a === 81 ? { code: 0, characters: [{ name_code: 1 }] } : { code: 0 }));
  try {
    const { env } = envOf({ [id]: "0" });
    const res = await send(env, `/api/user/${id}/roster`);
    assert.equal(res.status, 200);
    assert.deepEqual(((await res.json()) as any).areas.map((a: any) => a.area), [81]);
    assert.deepEqual(stub.areaCalls, ALL_AREAS);
  } finally {
    stub.restore();
  }
});

test("roster keeps a caller's own ?area=", async () => {
  const id = "1000000000000000003";
  const stub = stubFetch((a) => ({ code: 0, characters: [{ name_code: a }] }));
  try {
    const { env } = envOf({ [id]: "83" });
    const res = await send(env, `/api/user/${id}/roster?area=81`);
    assert.equal(res.status, 200);
    assert.deepEqual(stub.areaCalls, [81]);
  } finally {
    stub.restore();
  }
});

test("legacy /api/user/roster?blablaid= also sweeps every server", async () => {
  const id = "1000000000000000004";
  const stub = stubFetch((a) => ({ code: 0, characters: [{ name_code: a }] }));
  try {
    const { env } = envOf({ [id]: "83" });
    const res = await send(env, `/api/user/roster?blablaid=${id}`);
    assert.equal(res.status, 200);
    assert.deepEqual(stub.areaCalls, ALL_AREAS);
  } finally {
    stub.restore();
  }
});

test("profile, nikke and nikke-builds still use the remembered area", async () => {
  const id = "1000000000000000005";
  const stub = stubFetch((a) => ({ code: 0, characters: [{ name_code: 3003, lv: a }] }));
  try {
    const { env } = envOf({ [id]: "81" });
    const profile = await send(env, `/api/user/${id}`);
    assert.equal(((await profile.json()) as any).areaId, 81);
    for (const p of ["/nikke", "/nikke-builds?names=%EC%95%B5%EC%BB%A4"]) {
      stub.areaCalls.length = 0;
      const res = await send(env, `/api/user/${id}${p}`);
      assert.equal(res.status, 200, p);
      assert.deepEqual(stub.areaCalls, [81], p);
    }
    assert.equal(has(stub, "GetUserGamePlayerInfo"), false); // the call the area saves
  } finally {
    stub.restore();
  }
});

test("a rate-limited empty server still returns the account's roster", async () => {
  const id = "1000000000000000006";
  const stub = stubFetch((a) =>
    a === 84 ? { code: 212000, msg: "too frequently" } : a === 83 ? { code: 0, characters: [{ name_code: 1 }] } : { code: 0 },
  );
  try {
    const { env } = envOf();
    const res = await send(env, `/api/user/${id}/roster`);
    assert.equal(res.status, 200);
    assert.deepEqual(((await res.json()) as any).areas.map((a: any) => a.area), [83]);
  } finally {
    stub.restore();
  }
});

test("a caller's ?area= is never remembered", async () => {
  const id = "1000000000000000007";
  const stub = stubFetch();
  try {
    const { env, kv } = envOf();
    const first = await send(env, `/api/user/${id}?area=84`);
    assert.equal(((await first.json()) as any).areaId, 84);
    assert.equal(kv.get(id), undefined);

    // the server's own answer is remembered, and a later ?area= can't move it
    await (await send(env, `/api/user/${id}`)).text();
    assert.equal(kv.get(id), "83");
    await (await send(env, `/api/user/${id}?area=81`)).text();
    assert.equal(kv.get(id), "83");
    const next = await send(env, `/api/user/${id}`);
    assert.equal(((await next.json()) as any).areaId, 83);
  } finally {
    stub.restore();
  }
});
