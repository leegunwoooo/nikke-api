import { AtlasAttachmentLoader, GLTexture, ManagedWebGLRenderingContext, SceneRenderer, SkeletonBinary, TextureAtlas } from "@esotericsoftware/spine-webgl";
import { BurstScene } from "./burst-scene.js";
import type { BurstCutscene } from "../src/types.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $("status");
const canvas = $<HTMLCanvasElement>("stage");
const play = $<HTMLButtonElement>("play");
const seek = $<HTMLInputElement>("seek");
const clock = $("clock");

async function main() {
  const burst = JSON.parse($("burst-data").textContent!) as BurstCutscene;
  const request = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`리소스를 불러오지 못했어요 (${response.status}).`);
    return response;
  };
  const context = new ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: false });
  GLTexture.DISABLE_UNPACK_PREMULTIPLIED_ALPHA_WEBGL = true;
  const renderer = new SceneRenderer(canvas, context);
  const [atlasText, bytes] = await Promise.all([
    request(burst.atlas).then(r => r.text()), request(burst.skeleton).then(r => r.arrayBuffer()),
  ]);
  const atlas = new TextureAtlas(atlasText);
  const textures = new Map(burst.textures.map(t => [t.name, t.url]));
  await Promise.all(atlas.pages.map(async page => {
    const url = textures.get(page.name);
    if (!url) throw new Error(`텍스처를 찾지 못했어요: ${page.name}`);
    const response = await request(url);
    const blobUrl = URL.createObjectURL(await response.blob());
    try {
      const image = new Image();
      image.src = blobUrl;
      await image.decode();
      page.setTexture(new GLTexture(context, image));
    } finally { URL.revokeObjectURL(blobUrl); }
  }));
  const data = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(bytes));
  const scene = new BurstScene(data, burst.playback);
  // Off-screen particles/transition art can extend far beyond the composition.
  // Keep the exported frame fixed instead of zooming out to include those parts.
  let minX = data.x, minY = data.y, maxX = data.x + data.width, maxY = data.y + data.height;
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || data.width <= 0 || data.height <= 0) {
    minX = minY = Infinity; maxX = maxY = -Infinity;
    for (let i = 0; i <= 20; i++) {
      scene.seek(scene.duration * i / 20);
      const b = scene.bounds();
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) throw new Error("컷씬의 화면 영역을 확인하지 못했어요.");
  const width = maxX - minX, height = maxY - minY;
  let time = 0, playing = true, last = performance.now();
  const draw = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const scale = Math.min(w / width, h / height);
    const vw = Math.max(1, Math.round(width * scale)), vh = Math.max(1, Math.round(height * scale));
    const vx = Math.floor((w - vw) / 2), vy = Math.floor((h - vh) / 2);
    context.gl.viewport(vx, vy, vw, vh);
    renderer.camera.setViewport(width, height);
    renderer.camera.position.set((minX + maxX) / 2, (minY + maxY) / 2, 0);
    renderer.camera.update();
    scene.seek(time);
    context.gl.disable(context.gl.SCISSOR_TEST);
    context.gl.clearColor(0, 0, 0, 0);
    context.gl.clear(context.gl.COLOR_BUFFER_BIT);
    context.gl.enable(context.gl.SCISSOR_TEST);
    context.gl.scissor(vx, vy, vw, vh);
    renderer.begin();
    // Every layer uses this same camera and clock. Atlas/GPU textures are shared.
    for (const layer of scene.layers) renderer.drawSkeleton(layer.skeleton, !!atlas.pages[0]?.pma);
    renderer.end();
    context.gl.disable(context.gl.SCISSOR_TEST);
    seek.value = String(time);
    clock.textContent = `${time.toFixed(1)} / ${scene.duration.toFixed(1)}초`;
  };
  play.disabled = false; seek.disabled = false; $("restart").removeAttribute("disabled");
  seek.max = String(scene.duration);
  play.onclick = () => { playing = !playing; play.textContent = playing ? "일시정지" : "재생"; last = performance.now(); };
  seek.oninput = () => { time = Number(seek.value); playing = false; play.textContent = "재생"; draw(); };
  $("restart").onclick = () => { time = 0; playing = true; play.textContent = "일시정지"; last = performance.now(); draw(); };
  const frame = (now: number) => {
    if (playing && !document.hidden) {
      time = (time + Math.min((now - last) / 1000, 0.1)) % scene.duration;
      draw();
    }
    last = now;
    requestAnimationFrame(frame);
  };
  new ResizeObserver(draw).observe(canvas);
  canvas.addEventListener("webglcontextlost", () => { playing = false; status.textContent = "화면 연결이 끊겼어요. 페이지를 새로고침해 주세요."; });
  status.textContent = "";
  canvas.dataset.ready = "true";
  requestAnimationFrame(frame);
}

main().catch(error => { status.textContent = error instanceof Error ? error.message : "컷씬을 불러오지 못했어요."; });
