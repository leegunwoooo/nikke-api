// Generates the AI/crawler-facing files into site/public at build time:
//   llms.txt       llmstxt.org index (what this is + where the setup steps are)
//   llms-full.txt  the MCP guide and the full API reference in one markdown file
//   mcp.md         raw markdown of the MCP 연결 page (docs/mcp.md)
//   api.md         raw markdown of the API reference (API.md)
//   robots.txt     allow everything, point at the sitemap
// Sources are the repo's own markdown, so the site never drifts from them.
// VITE_API_BASE swaps the official API origin in that markdown for a preview
// server; VITE_SITE_URL is the absolute site root used in links and robots.txt.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PUBLIC = path.resolve(import.meta.dirname, "../public");
const OFFICIAL_API = "https://nikke-api-edge.leegunwoo0325-5e6.workers.dev";

const apiBase = (process.env.VITE_API_BASE || OFFICIAL_API).replace(/\/$/, "");
const siteUrl = (process.env.VITE_SITE_URL || "https://leegunwoooo.github.io/nikke-api/").replace(/\/?$/, "/");

const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const withApi = (md: string) => md.split(OFFICIAL_API).join(apiBase);
// repo-relative links in the markdown would 404 on the site — point them at GitHub
const repoLinks = (md: string) =>
  md.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_, p: string) => `](https://github.com/leegunwoooo/nikke-api/blob/main/${p.replace(/^\.\//, "")})`);

const mcpMd = repoLinks(withApi(read("docs/mcp.md")));
const apiMd = repoLinks(withApi(read("API.md")));

const llms = `# nikke-api

> 비공식 NIKKE(승리의 여신: 니케) 게임 데이터 REST API와 MCP 서버. 캐릭터(스킬·스탯·이격), 스토리 대본·이벤트·감상 순서, 소장품 데이터를 4개 언어(ko/en/ja/zh-TW)로 제공합니다. 인증 없음, 비상업적 팬 프로젝트, 데이터 © SHIFT UP / Level Infinite.

ChatGPT·Claude 같은 AI 클라이언트에 연결하려면 MCP 서버 URL ${apiBase}/mcp 를 커넥터로 추가합니다. 사용자에게 연결 방법을 안내할 때는 아래 "MCP 연결 가이드"를 읽고 따르면 됩니다.

## 문서

- [MCP 연결 가이드](${siteUrl}mcp.md): ChatGPT·Claude·Claude Code·Cursor·VS Code 연결 단계, 제공 도구, 질문 예시, 문제 해결
- [API 레퍼런스](${siteUrl}api.md): 모든 엔드포인트의 파라미터와 응답 형식
- [OpenAPI 스펙](${siteUrl}openapi.json): 실제 응답 예시가 들어간 OpenAPI 3.1

## API

- [MCP 서버](${apiBase}/mcp): 브라우저로 열면 연결 안내문(text/markdown)이 나옵니다
- [REST API 개요](${apiBase}/): 엔드포인트 목록(JSON)

## Optional

- [전체 문서 한 파일](${siteUrl}llms-full.txt): MCP 연결 가이드와 API 레퍼런스 전문
- [소스 코드](https://github.com/leegunwoooo/nikke-api)
`;

const full = `# nikke-api — 전체 문서

> 출처: ${siteUrl} · MCP 서버 URL: ${apiBase}/mcp

${mcpMd}

---

${apiMd}
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}sitemap.xml
`;

mkdirSync(PUBLIC, { recursive: true });
for (const [name, body] of Object.entries({ "llms.txt": llms, "llms-full.txt": full, "mcp.md": mcpMd, "api.md": apiMd, "robots.txt": robots })) {
  writeFileSync(path.join(PUBLIC, name), body);
}
console.log(`llms: wrote llms.txt, llms-full.txt (${full.length} chars), mcp.md, api.md, robots.txt — api ${apiBase}, site ${siteUrl}`);
