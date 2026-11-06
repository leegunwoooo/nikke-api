import { Hono } from "hono";
import { burstsById } from "./burst.js";
import { BURST_PLAYER } from "./burst-player.generated.js";
import type { BurstCutscene } from "./types.js";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const filename = (url: string) => new URL(url).pathname.split("/").at(-1)!;
const assets = new Map([...burstsById.values()].map(b => [b.id, new Map([
  [filename(b.atlas), b.atlas], [filename(b.skeleton), b.skeleton], ...b.textures.map(t => [t.name, t.url] as [string, string]),
])]));

export function createBurstViewer(titleOf: (burst: BurstCutscene) => string = () => "버스트 컷씬", fetcher: typeof fetch = fetch) {
  const app = new Hono();
  app.get("/burst-player.js", c => c.body(BURST_PLAYER, 200, { "Content-Type": "text/javascript; charset=utf-8" }));

  app.get("/burst-viewer", c => {
    const burst = burstsById.get(c.req.query("id") ?? "");
    if (!burst) return c.text("컷씬을 찾을 수 없어요.", 404);
    const asset = (name: string) => `/burst-assets/${burst.source.revision}/${encodeURIComponent(burst.id)}/${encodeURIComponent(name)}`;
    const config = { ...burst, atlas: asset(filename(burst.atlas)), skeleton: asset(filename(burst.skeleton)),
      textures: burst.textures.map(t => ({ name: t.name, url: asset(t.name) })) };
    const title = escapeHtml(titleOf(burst));
    c.header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'");
    return c.html(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 버스트 컷씬</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#11131a;color:#e9eaf1;font:15px system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:20px}h1{font-size:20px;font-weight:600;margin:0 0 14px}canvas{display:block;width:100%;height:min(66vh,660px);background:#090b10;border-radius:12px}.controls{display:flex;align-items:center;gap:12px;margin:14px 0}button{background:#282e43;border:1px solid #46506d;border-radius:7px;color:inherit;padding:9px 14px;cursor:pointer}button:disabled{opacity:.5}input{flex:1;min-width:60px;accent-color:#95abff}output{font-variant-numeric:tabular-nums;white-space:nowrap}#status{min-height:1.5em;color:#c2c9df}footer{color:#929caf;font-size:12px}a{color:#b7c6ff}@media(max-width:560px){main{padding:12px}.controls{flex-wrap:wrap}input{order:4;flex-basis:100%}canvas{height:60vh}}
</style></head><body><main><h1>${title}</h1><canvas id="stage" aria-label="버스트 컷씬"></canvas>
<div class="controls"><button id="play" disabled>일시정지</button><button id="restart" disabled>처음부터</button><input id="seek" type="range" min="0" max="1" step="0.001" value="0" aria-label="재생 위치" disabled><output id="clock"></output></div>
<p id="status" role="status">컷씬을 불러오는 중이에요…</p><footer>원본 콘텐츠 © SHIFT UP / Level Infinite · 리소스 출처 <a href="${escapeHtml(burst.source.viewerUrl)}" target="_blank" rel="noopener">ArtHub</a></footer>
<script id="burst-data" type="application/json">${JSON.stringify(config).replaceAll("<", "\\u003c")}</script><script src="/burst-player.js" defer></script></main></body></html>`);
  });

  // Only files in the reviewed catalog can be fetched. The browser needs this
  // relay because the source permits CORS for ArtHub's origin alone. Successful
  // responses use the app/worker's existing streaming edge cache.
  app.get("/burst-assets/:revision/:id/:file", async c => {
    const burst = burstsById.get(c.req.param("id"));
    const url = assets.get(c.req.param("id"))?.get(c.req.param("file"));
    if (!burst || burst.source.revision !== c.req.param("revision") || !url) return c.text("Unknown burst asset", 404);
    let detail = "fetch error";
    try {
      // "manual" because the edge rejects redirect:"error"; a 3xx is not ok.
      const response = await fetcher(url, { method: c.req.method === "HEAD" ? "HEAD" : "GET", redirect: "manual", signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        detail = `upstream ${response.status}`;
        await response.body?.cancel();
        throw new Error(detail);
      }
      if (Number(response.headers.get("content-length")) > 64 * 1024 * 1024) {
        detail = "asset too large";
        await response.body?.cancel();
        throw new Error(detail);
      }
      const file = c.req.param("file");
      const type = file.endsWith(".atlas") ? "text/plain; charset=utf-8" : file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "application/octet-stream";
      return new Response(response.body, { headers: { "Content-Type": type, "X-Content-Type-Options": "nosniff" } });
    } catch (e) {
      if (e instanceof Error && !detail.startsWith("upstream")) detail = e.message;
      c.header("Cache-Control", "no-store");
      return c.text(`Burst asset temporarily unavailable: ${detail}`, 502);
    }
  });
  return app;
}
