import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

process.env.NIKKE_DATA_DIR = path.join(import.meta.dirname, "fixtures/dist");
const { default: app } = await import("../src/app.js");
const { fitJson, requestOrigin, resetUserRateLimit } = await import("../src/mcp.js");

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
  // the roster sweep is bounded (~7 upstream calls) and edge-cached, so
  // it's exposed as a live tool like the other get_user_* tools
  assert.ok(names.includes("get_user_roster"));
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

test("get_scene drops SubScenario markers unless media is asked for", async () => {
  const lean = (await tool("get_scene", { groupId: "event_firstaffection_01" })).json;
  assert.deepEqual(
    lean.lines.map((l: any) => l.text),
    ["비 오는 밤.", "지휘관님, 우산 가져왔어요!"],
  );
  const full = (await tool("get_scene", { groupId: "event_firstaffection_01", includeMedia: true })).json;
  assert.equal(full.lines.length, 3);
  assert.equal(full.lines[1].window, "SubScenario");
  assert.equal(full.lines[1].text, null);
});

test("favorite stories are reachable by category, nikke and line search", async () => {
  const list = (await tool("search_scenes", { category: "favorite" })).json;
  assert.equal(list.scenes[0].groupId, "d_favorite_test");
  assert.equal(list.scenes[0].sourceVideo, "https://youtu.be/test");
  assert.equal((await tool("search_scenes", { nikke: "테스트 니케", family: false })).json.count, 1);
  const hit = (await tool("search_lines", { q: "애장품 대사" })).json;
  assert.equal(hit.lines[0].groupId, "d_favorite_test");
  assert.equal(hit.lines[0].scene.category, "favorite");
  assert.equal((await tool("search_lines", { q: "애장품 대사", category: "favorite" })).json.count, 1);
});

test("get_nikke resolves an exact name over partial matches, in any language", async () => {
  const anchor = (await tool("get_nikke", { nameOrId: "앵커" })).json;
  assert.equal(anchor.id, 2);
  assert.deepEqual(anchor.alsoMatched, [{ id: 3, name: "앵커: 이노센트 메이드" }]);
  // an English name with the default lang=ko needs the unflattened list
  assert.equal((await tool("get_nikke", { nameOrId: "Anchor" })).json.id, 2);
  assert.equal((await tool("get_nikke", { nameOrId: " 앵 커 " })).json.id, 2);
  // a name that only partially matches still returns the candidate list
  const amb = (await tool("get_nikke", { nameOrId: "앵" })).json;
  assert.equal(amb.count, 2);
  assert.equal(amb.characters.length, 2);
});

test("get_nikke links the favorite story scene", async () => {
  const n = (await tool("get_nikke", { nameOrId: "1" })).json;
  assert.equal(n.details.favoriteStory.sceneGroupId, "d_favorite_test");
});

test("library collections are events, with branches marked in the script", async () => {
  const list = (await tool("list_events", { q: "ARK RANGER" })).json;
  assert.deepEqual(list.events[0], { id: "lib_ark_ranger", title: "ARK RANGER", episodes: 1, totalLines: 3, source: "library" });
  const s = (await tool("read_event", { id: "lib_ark_ranger" })).json;
  assert.deepEqual(s.episodes[0].lines, ["감독: 라이브러리 대사", "[선택지 1.1] 고른 말", "[1.1] 감독: 분기 대사"]);
});

test("search hits on library scenes name their collection", async () => {
  const hit = (await tool("search_lines", { q: "라이브러리 대사" })).json.lines[0];
  assert.deepEqual([hit.scene.collection, hit.scene.event.id], ["ARK RANGER", "lib_ark_ranger"]);
});

test("get_scene keeps branch markers on library scenes", async () => {
  const s = (await tool("get_scene", { groupId: "lib_test_00" })).json;
  assert.deepEqual(s.next, [{ groupId: "lib_test_01" }]);
  assert.deepEqual(s.lines[1], { text: "고른 말", window: "Choice", branch: "1.1" });
  assert.deepEqual(s.lines[2], { speaker: "감독", text: "분기 대사", branch: "1.1" });
});

test("favorite stories sit optional at the end of the route, after every chapter", async () => {
  const route = (await tool("story_route", {})).json;
  const last = route.entries.at(-1);
  assert.equal(last.kind, "favorite");
  assert.equal(last.firstScene, "d_favorite_test");
  assert.equal(last.required, false);
  assert.equal(last.step, route.entries.length - 1);
  assert.ok(route.entries.findLastIndex((e: any) => e.kind === "main") < route.entries.length - 1);
  assert.deepEqual((await tool("next_story", { after: last.title })).json.next, []);
  assert.ok((await tool("next_story", { chapter: 50, requiredOnly: true })).json.next.every((e: any) => e.kind !== "favorite"));
});

test("get_scene keeps which options were choices and which was taken", async () => {
  const { lines } = (await tool("get_scene", { groupId: "d_favorite_test" })).json;
  assert.deepEqual(lines[0], { speaker: "테스트 니케", text: "애장품 대사" });
  assert.deepEqual(lines[1], { text: "고른 항목", window: "Choice", chosen: true });
  assert.deepEqual(lines[2], { text: "안 고른 항목", window: "Choice" });
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
  assert.match(t, /- get_user_roster: /);
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

test("read_event pages over the 20,000-char cap and reaches every episode", async () => {
  // event_firstaffection_02 alone is ~19.8k chars — both episodes together
  // pass the page cap, so the first page must hand back a nextOffset
  const p1 = (await tool("read_event", { id: "event_firstaffection" })).json;
  assert.equal(p1.count, 2);
  assert.deepEqual(p1.episodes.map((e: any) => e.groupId), ["event_firstaffection_01"]);
  assert.deepEqual(p1.episodes[0].lines, ["비 오는 밤.", "앵커: 지휘관님, 우산 가져왔어요!"]);
  assert.equal(p1.truncated.field, "episodes");
  assert.equal(p1.truncated.nextOffset, 1);
  const p2 = (await tool("read_event", { id: "event_firstaffection", offset: p1.truncated.nextOffset })).json;
  assert.equal(p2.offset, 1);
  assert.deepEqual(p2.episodes.map((e: any) => e.groupId), ["event_firstaffection_02"]);
  assert.equal(p2.episodes[0].lines.length, 2); // a long 라피 line + "끝."
  assert.equal(p2.truncated, undefined);
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
  assert.equal(r.entries[0].firstScene, "d_main_01_01"); // Chapter 0 by the scene's chapter field
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
  // a guide entry the game data lacks resolves to the archive by title
  const ark = r.entries.find((e: any) => e.title === "ARK RANGER");
  assert.deepEqual([ark.inData, ark.firstScene, ark.episodes, ark.ids], [true, "lib_test_00", 1, ["lib_ark_ranger"]]);
  assert.ok(!r.unplaced.some((e: any) => e.id === "lib_ark_ranger"));
  assert.doesNotMatch(ark.note ?? "", /스크립트가 없음/);
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

// bound connector: /mcp/u/<key> arrives with x-registered-blablaid injected by
// the edge — get_user_* may then omit the link entirely
const boundRpc = async (method: string, params: unknown = {}, blablaid?: string) => {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(blablaid ? { "x-registered-blablaid": blablaid } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = (await res.text()).split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(data!.slice(6));
};

test("get_user_* without a link asks for one (unbound)", async () => {
  resetUserRateLimit();
  const { result } = await boundRpc("tools/call", { name: "get_user_profile", arguments: {} });
  assert.match(result.content[0].text, /share link is required|mcp\/register/);
});

test("x-registered-blablaid binds the profile (no link arg needed)", async () => {
  resetUserRateLimit();
  // reaches the upstream lookup instead of the missing-link error —
  // no creds in test env, so it fails at the upstream stage, which proves
  // the bound id flowed through
  const { result } = await boundRpc("tools/call", { name: "get_user_profile", arguments: {} }, "some-blablaid");
  assert.ok(!/share link is required/.test(result.content[0].text));
});
