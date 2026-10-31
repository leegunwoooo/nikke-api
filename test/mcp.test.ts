import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

process.env.NIKKE_DATA_DIR = path.join(import.meta.dirname, "fixtures/dist");
const { default: app } = await import("../src/app.js");
const { fitJson, requestOrigin } = await import("../src/mcp.js");

// stateless 2025-era Streamable HTTP: every call is a standalone POST and the
// JSON-RPC reply comes back as a single SSE message
const rpc = async (method: string, params: unknown = {}) => {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  assert.equal(res.status, 200);
  const data = (await res.text()).split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(data!.slice(6));
};
const tool = async (name: string, args: Record<string, unknown> = {}) => {
  const { result } = await rpc("tools/call", { name, arguments: args });
  let json: any;
  try {
    json = JSON.parse(result.content[0].text);
  } catch { /* schema errors are plain text */ }
  return { ...result, json };
};

test("mcp initialize + tools/list", async () => {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  assert.equal(init.result.serverInfo.name, "nikke-api");
  assert.match(init.result.instructions, /Korean only/);
  const tools = (await rpc("tools/list")).result.tools;
  const names = tools.map((t: any) => t.name);
  for (const n of ["search_nikkes", "get_nikke", "get_scene", "list_events", "api_get", "get_user_nikkes"]) {
    assert.ok(names.includes(n), n);
  }
  // the multi-server roster sweep is too heavy for a tool call
  assert.ok(!names.includes("get_user_roster"));
  const search = tools.find((t: any) => t.name === "search_nikkes");
  assert.deepEqual(search.inputSchema.properties.element.enum, ["Fire", "Water", "Wind", "Electronic", "Iron"]);
});

test("mcp tools wrap the REST routes", async () => {
  const list = await tool("search_nikkes", { element: "Fire" });
  assert.equal(list.json.characters[0].name, "라피"); // lang defaults to ko
  assert.equal(list.json.characters[0].costumes, undefined); // list is trimmed
  assert.equal((await tool("list_events", { q: "first" })).json.count, 2); // FIRST AFFECTION + its bonus episode
  assert.ok((await tool("api_get", { path: "/api/meta/filters" })).json.classes.length > 0);
});

test("get_nikke trims by default and include adds to it", async () => {
  const base = (await tool("get_nikke", { nameOrId: "1" })).json;
  assert.ok(base.details.skills);
  assert.equal(base.costumes, undefined);
  const more = (await tool("get_nikke", { nameOrId: "1", include: ["costumes"] })).json;
  assert.ok(more.costumes.length > 0);
  assert.equal(more.name, "라피"); // include adds, it doesn't replace the defaults
});

test("get_scene returns speaker/text lines unless media is asked for", async () => {
  const lean = (await tool("get_scene", { groupId: "d_main_01_01" })).json;
  assert.deepEqual(lean.lines[0], { speaker: "라피", text: "..." });
  const full = (await tool("get_scene", { groupId: "d_main_01_01", includeMedia: true })).json;
  assert.equal(full.lines[0].speakerName, "라피");
});

test("filters reject values outside the enum", async () => {
  assert.equal((await tool("search_nikkes", { element: "불" })).isError, true);
});

test("api_get stays inside its allowlist", async () => {
  for (const p of ["/api/user/roster?blablaid=x", "/api/tables/CharacterLevelTable.json", "/api/../etc", "/api/nikkes"]) {
    assert.equal((await tool("api_get", { path: p })).isError, true, p);
  }
  assert.equal((await tool("api_get", { path: "/openapi.json" })).isError, true); // schema: must start with /api/
});

test("mcp errors surface as isError", async () => {
  assert.equal((await tool("get_nikke", { nameOrId: "nope-nope" })).isError, true);
});

test("fitJson cuts the largest array and keeps valid JSON", () => {
  const body = JSON.stringify({ count: 500, offset: 40, scenes: Array.from({ length: 500 }, (_, i) => ({ i, pad: "x".repeat(200) })) });
  const out = fitJson(body, 10_000);
  assert.ok(out.text.length <= 10_000);
  const j = JSON.parse(out.text);
  assert.equal(j.truncated.field, "scenes");
  assert.equal(j.scenes.length, j.truncated.returned);
  assert.equal(j.truncated.nextOffset, 40 + j.truncated.returned);
  assert.equal(j.truncated.returned + j.truncated.omitted, 500);

  const flat = fitJson(JSON.stringify({ blob: "y".repeat(20_000) }), 10_000);
  assert.equal(flat.isError, true);
  assert.match(JSON.parse(flat.text).error, /too large/);
});

test("search + fetch follow ChatGPT's connector contract", async () => {
  const { results } = (await tool("search", { query: "라피" })).json;
  const hit = results.find((r: any) => r.id === "nikke:1");
  assert.equal(hit.title, "라피");
  assert.equal(hit.url, "http://localhost/api/nikkes/1");
  const doc = (await tool("fetch", { id: "nikke:1" })).json;
  assert.equal(doc.id, "nikke:1");
  assert.equal(doc.title, "라피");
  assert.ok(JSON.parse(doc.text).details.skills);
  assert.equal((await tool("fetch", { id: "scene:d_main_01_01" })).json.title, "d_main_01_01");
  assert.equal((await tool("fetch", { id: "bogus" })).isError, true);
});

test("links follow X-Forwarded-Proto behind a TLS proxy", () => {
  const req = (h: Record<string, string>) => new Request("http://nikke-mcp.justn.me/mcp", { headers: h });
  assert.equal(requestOrigin(req({})), "http://nikke-mcp.justn.me");
  assert.equal(requestOrigin(req({ "x-forwarded-proto": "https" })), "https://nikke-mcp.justn.me");
  assert.equal(requestOrigin(req({ "x-forwarded-proto": "https, http" })), "https://nikke-mcp.justn.me");
  assert.equal(requestOrigin(req({ "x-forwarded-proto": "javascript" })), "http://nikke-mcp.justn.me");
});

test("JSON results also carry structuredContent", async () => {
  const { result } = await rpc("tools/call", { name: "list_events", arguments: { q: "first" } });
  assert.equal(result.structuredContent.count, 2);
});

test("resources: filters, nikke template, id completion", async () => {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  assert.ok(init.result.serverInfo.icons[0].src.startsWith("data:image/svg+xml"));
  const list = (await rpc("resources/list")).result.resources.map((r: any) => r.uri);
  assert.ok(list.includes("nikke://filters"));
  const templates = (await rpc("resources/templates/list")).result.resourceTemplates.map((t: any) => t.uriTemplate);
  assert.ok(templates.includes("nikke://nikke/{id}"));
  const filters = JSON.parse((await rpc("resources/read", { uri: "nikke://filters" })).result.contents[0].text);
  assert.ok(filters.classes.length > 0);
  const nikke = JSON.parse((await rpc("resources/read", { uri: "nikke://nikke/1" })).result.contents[0].text);
  assert.equal(nikke.name, "라피");
  const done = await rpc("completion/complete", {
    ref: { type: "ref/resource", uri: "nikke://nikke/{id}" },
    argument: { name: "id", value: "라피" },
  });
  assert.deepEqual(done.result.completion.values, ["1"]);
});

test("search/fetch declare an outputSchema", async () => {
  const tools = (await rpc("tools/list")).result.tools;
  for (const n of ["search", "fetch"]) {
    assert.equal(tools.find((t: any) => t.name === n).outputSchema.type, "object", n);
  }
});

// 2026-07-28 clients skip initialize and put the protocol envelope on every
// request; the same factory has to answer them
test("mcp serves the 2026-07-28 envelope path", async () => {
  const modern = async (method: string, params: Record<string, unknown> = {}, name?: string) => {
    const res = await app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": method,
        ...(name && { "mcp-name": name }),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: {
          ...params,
          _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} },
        },
      }),
    });
    assert.equal(res.status, 200);
    return (await res.json()).result;
  };
  const discover = await modern("server/discover");
  assert.ok(discover.supportedVersions.includes("2026-07-28"));
  assert.match(discover.instructions, /Korean only/);
  assert.ok((await modern("tools/list")).tools.some((t: any) => t.name === "get_nikke"));
  const found = await modern("tools/call", { name: "search", arguments: { query: "라피" } }, "search");
  assert.equal(found.structuredContent.results[0].id, "nikke:1");
  const filters = await modern("resources/read", { uri: "nikke://filters" }, "nikke://filters");
  assert.ok(JSON.parse(filters.contents[0].text).classes.length > 0);
});

test("mcp GET from an MCP client is 405 in stateless mode", async () => {
  assert.equal((await app.request("/mcp", { headers: { accept: "text/event-stream" } })).status, 405);
});

test("plain GET /mcp explains how to connect, with this server's URL", async () => {
  const res = await app.request("http://api.example/mcp", { headers: { "x-forwarded-proto": "https" } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type")!, /text\/markdown/);
  assert.equal(res.headers.get("cache-control"), "no-store"); // the edge must not cache it
  const t = await res.text();
  assert.match(t, /MCP 서버 URL: https:\/\/api\.example\/mcp/);
  assert.match(t, /claude mcp add --transport http nikke https:\/\/api\.example\/mcp/);
  assert.match(t, /- search_nikkes: /); // tool list comes from the server itself
  assert.ok(!t.includes("get_user_roster"));
});

test("llms.txt indexes the MCP guide and API docs", async () => {
  const res = await app.request("http://api.example/llms.txt");
  assert.equal(res.status, 200);
  const t = await res.text();
  assert.match(t, /^# nikke-api\n\n> /);
  assert.match(t, /\[MCP 연결 안내\]\(http:\/\/api\.example\/mcp\)/);
  assert.match(t, /openapi\.json/);
});

// keep last: the burst guard is process-wide state
test("live user tools are rate limited per instance", async () => {
  let limited;
  for (let i = 0; i < 31; i++) limited = await tool("get_user_profile", { blablaid: "x" });
  assert.match(limited!.json.error, /rate limited/);
});

test("이격 versions are linked to their original", async () => {
  const anchor = (await tool("search_nikkes", { q: "이노센트" })).json;
  assert.deepEqual(anchor.characters.map((c: any) => c.id), [2, 3]); // original + variant
  assert.deepEqual((await tool("search_nikkes", { q: "이노센트", family: false })).json.characters.map((c: any) => c.id), [3]);
  const detail = (await tool("get_nikke", { nameOrId: "3" })).json;
  assert.equal(detail.family.base, "앵커");
  assert.deepEqual(detail.family.members.map((m: any) => m.id), [2, 3]);
  // affection scenes of the variant are found from the original's name
  assert.equal((await tool("search_scenes", { nikke: "앵커" })).json.count, 1);
});

test("read_event returns the whole script as speaker lines", async () => {
  const ev = (await tool("read_event", { id: "event_firstaffection" })).json;
  assert.equal(ev.count, 2);
  assert.deepEqual(ev.episodes[0].lines, ["비 오는 밤.", "앵커: 지휘관님, 우산 가져왔어요!"]);
  assert.deepEqual(ev.episodes[1].lines, []); // listed scene without a file
  assert.equal((await tool("read_event", { id: "nope" })).isError, true);
});

test("search_lines finds dialogue and labels its event", async () => {
  const hit = (await tool("search_lines", { q: "우산!" })).json; // punctuation ignored
  assert.equal(hit.count, 1);
  assert.equal(hit.lines[0].speaker, "앵커");
  assert.deepEqual(hit.lines[0].scene.event, { id: "event_firstaffection", title: "FIRST AFFECTION" });
  // speaker by a variant's name reaches the original's lines
  assert.equal((await tool("search_lines", { speaker: "앵커: 이노센트 메이드" })).json.count, 1);
  assert.equal((await tool("search_lines", { speaker: "앵커: 이노센트 메이드", family: false })).json.count, 0);
  assert.equal((await tool("search_lines", {})).isError, true);
});

test("nikke_appearances rolls scenes up per event", async () => {
  const ap = (await tool("nikke_appearances", { nameOrId: "Anchor: Innocent Maid" })).json;
  assert.equal(ap.family.base, "앵커");
  assert.deepEqual(ap.events, [{ id: "event_firstaffection", title: "FIRST AFFECTION", scenes: 1, lines: 1 }]);
  assert.equal((await tool("nikke_appearances", { nameOrId: "라피", category: "main" })).json.scenes[0].groupId, "d_main_01_01");
});

test("compare_nikkes prefers an exact name and flags ambiguity", async () => {
  const cmp = (await tool("compare_nikkes", { nikkes: ["앵커", "라피"] })).json;
  assert.deepEqual(cmp.nikkes.map((n: any) => n.id), [2, 1]); // 앵커 also matches its 이격
  const amb = (await tool("compare_nikkes", { nikkes: ["앵", "라피"] })).json;
  assert.equal(amb.nikkes[0].ambiguous.length, 2);
});

test("story_route resolves the curated order against the data", async () => {
  const r = (await tool("story_route")).json;
  assert.equal(r.entries[0].key, "chapter:0");
  assert.equal(r.entries[0].firstScene, "d_main_01_01"); // Chapter 0 = d_main_01
  const lk = r.entries.find((e: any) => e.title === "LAST KINGDOM");
  assert.equal(lk.key, "event_lastkingdom1");
  assert.equal(lk.inData, false); // fixtures have no Last Kingdom scenes
  assert.match(lk.note, /스크립트가 없음/);
  const fa = r.entries.find((e: any) => e.title === "FIRST AFFECTION");
  assert.deepEqual([fa.inData, fa.required, fa.importance, fa.episodes], [true, false, "low", 3]); // + bonus episode
  assert.ok(!r.unplaced.some((e: any) => e.id === "event_firstaffection")); // placed now
  assert.ok(r.unplaced.some((e: any) => e.id === "event_claymore"));
  // a bonus episode event joins its parent's entry instead of "unplaced"
  assert.ok(!r.unplaced.some((e: any) => e.id === "event_firstaffection_b01"));
  assert.deepEqual(fa.ids, ["event_firstaffection", "event_firstaffection_b01"]);
  assert.ok(r.sources.S.url.startsWith("https://ssissun.github.io/"));
});

test("next_story walks the route from a chapter or an entry", async () => {
  const n = (await tool("next_story", { chapter: 26, limit: 3 })).json;
  assert.deepEqual(n.next.map((e: any) => e.title), ["NEW YEAR, NEW SWORD", "SECOND AFFECTION", "FIRST AFFECTION"]);
  assert.deepEqual(n.missed, []); // nothing reported as read
  const req = (await tool("next_story", { chapter: 26, limit: 3, requiredOnly: true })).json;
  assert.deepEqual(req.next.map((e: any) => e.title), ["NEW YEAR, NEW SWORD", "SECOND AFFECTION", "LAST KINGDOM"]);
  // titles, event ids and chapter numbers all name an entry
  const after = (await tool("next_story", { after: "last kingdom", done: ["event_dirtybackyard"], limit: 1 })).json;
  assert.equal(after.next[0].title, "BOOM'S DAY");
  // FIRST AFFECTION is optional, so it's never "missed"; the fixtures hold no
  // required story before chapter 30
  assert.deepEqual((await tool("next_story", { chapter: 30, done: ["x"] })).json.missed, []);
  assert.equal((await tool("next_story", {})).isError, true);
  assert.equal((await tool("next_story", { after: "nope" })).isError, true);
});
