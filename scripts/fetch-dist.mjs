// Vercel 빌드용: GitHub Release "data-latest"의 dist.tar.gz를 받아 data/dist에 풀어놓는다.
// 실패 시 전체 파이프라인(sync+build)으로 폴백한다.
import { execFileSync, execSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { get } from "node:https";
import path from "node:path";

const ASSET_URL =
  "https://github.com/leegunwoooo/nikke-api/releases/download/data-latest/dist.tar.gz";
// tar 인자는 상대 경로로 — 절대 경로의 드라이브 문자(C:)를 원격 호스트로 오해하는
// Windows bsdtar 이슈 방지
const TARBALL = "data/dist.tar.gz";

const ok = () => existsSync(path.resolve("data/dist/characters.json"));

const download = (url) =>
  new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location));
      }
      if (res.statusCode !== 200)
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      res
        .pipe(createWriteStream(TARBALL))
        .on("finish", resolve)
        .on("error", reject);
    }).on("error", reject);
  });

const fallback = (err) => {
  console.warn(`fetch-dist: artifact fetch failed (${err.message}) — falling back to full sync+build`);
  execSync("npm run sync && npm run build", { stdio: "inherit" });
};

try {
  mkdirSync("data", { recursive: true });
  console.log("fetch-dist: downloading dist.tar.gz from data-latest release...");
  await download(ASSET_URL);
  rmSync(path.resolve("data/dist"), { recursive: true, force: true });
  execFileSync("tar", ["-xzf", TARBALL, "-C", "data"], { stdio: "inherit" });
  rmSync(TARBALL, { force: true });
  if (!ok()) throw new Error("data/dist/characters.json missing after extract");
  console.log("fetch-dist: done — data/dist restored from release artifact");
} catch (err) {
  fallback(err);
}
