// Plain-text guides for people and AI assistants that open the API's URLs
// directly. An assistant handed ".../mcp" fetches it with a normal GET; the
// stateless MCP transport would answer 405, so a non-SSE GET gets setup
// instructions instead. /llms.txt (llmstxt.org) indexes the same material.

export interface ToolInfo {
  name: string;
  title?: string;
  description?: string;
}

const DEFAULT_DOCS = "https://leegunwoooo.github.io/nikke-api/";

export const docsUrl = () => (process.env.NIKKE_DOCS_URL || DEFAULT_DOCS).replace(/\/?$/, "/");

const firstSentence = (s = "") => s.split(/(?<=[.!?。])\s/)[0].slice(0, 160);

export function mcpGuide(origin: string, tools: ToolInfo[]) {
  const url = `${origin}/mcp`;
  const docs = docsUrl();
  return `# nikke-api MCP 서버 연결 안내

이 주소(${url})는 비공식 NIKKE(승리의 여신: 니케) 게임 데이터를 제공하는 MCP(Model Context Protocol) 서버입니다.
브라우저로 열면 이 안내문이 보이고, MCP 클라이언트는 같은 주소로 POST 요청을 보냅니다.
인증 없이 URL만 넣으면 됩니다. 응답은 기본 한국어이고, 데이터는 © SHIFT UP / Level Infinite 소유입니다(비상업적 팬 프로젝트).

## 연결 방법

MCP 서버 URL: ${url}

### ChatGPT
1. 설정 → 앱 및 커넥터 → 고급 설정에서 "개발자 모드"를 켭니다. (무료 플랜 불가)
2. 커넥터 화면에서 "만들기"를 누르고 URL에 ${url} 를 넣습니다.
3. 인증은 "없음", 신뢰 확인에 체크하고 만든 뒤, 새 대화의 + → 더보기 → 개발자 모드에서 켭니다.

### Claude (웹·데스크톱)
1. 설정 → 커넥터에서 "커스텀 커넥터 추가"를 누릅니다.
2. 이름(예: NIKKE)을 정하고 URL에 ${url} 를 넣습니다. OAuth 설정은 비워 두고 "추가"를 누릅니다.
3. 대화 입력창의 + 메뉴에서 커넥터를 켜고 질문합니다.
(Free 플랜은 커스텀 커넥터 1개까지. Team·Enterprise는 관리자가 조직 설정 → 커넥터에서 먼저 추가)

### Claude Code
claude mcp add --transport http nikke ${url}
(모든 프로젝트에서 쓰려면 --scope user)

### Cursor (~/.cursor/mcp.json)
{ "mcpServers": { "nikke": { "url": "${url}" } } }

### VS Code (GitHub Copilot, .vscode/mcp.json)
{ "servers": { "nikke": { "type": "http", "url": "${url}" } } }

- 전송 방식: Streamable HTTP(무상태). SSE 전용 주소는 없습니다.
- URL은 /mcp 로 끝나야 하고 끝에 / 를 붙이지 않습니다.
- 메뉴 이름은 클라이언트 업데이트로 바뀔 수 있습니다. "커넥터", "MCP", "개발자 모드" 메뉴를 찾으세요.

## 제공 도구 (${tools.length}개)

${tools.map((t) => `- ${t.name}: ${firstSentence(t.description)}`).join("\n")}

## 더 보기

- 자세한 연결 가이드: ${docs}mcp
- 문서 사이트: ${docs}
- REST API 레퍼런스: ${origin}/docs (OpenAPI: ${origin}/openapi.json)
- 소스: https://github.com/leegunwoooo/nikke-api
`;
}

export function llmsTxt(origin: string) {
  const docs = docsUrl();
  return `# nikke-api

> 비공식 NIKKE(승리의 여신: 니케) 게임 데이터 REST API와 MCP 서버. 캐릭터(스킬·스탯·이격), 스토리 대본·이벤트·감상 순서, 소장품 데이터를 4개 언어(ko/en/ja/zh-TW)로 제공합니다. 인증 없음, 비상업적 팬 프로젝트, 데이터 © SHIFT UP / Level Infinite.

AI 어시스턴트가 사용자에게 연결 방법을 안내할 때는 아래 "MCP 연결 안내"를 읽고 그대로 따르면 됩니다. MCP 서버 URL은 ${origin}/mcp 입니다.

## MCP

- [MCP 연결 안내](${origin}/mcp): ChatGPT·Claude·Claude Code·Cursor·VS Code 연결 단계와 제공 도구 목록 (브라우저 GET 시 평문 안내)
- [MCP 연결 가이드 (문서 사이트)](${docs}mcp.md): 클라이언트별 자세한 설정과 문제 해결

## REST API

- [API 개요](${origin}/): 엔드포인트 목록(JSON)
- [OpenAPI 스펙](${origin}/openapi.json): 모든 엔드포인트의 파라미터와 응답 예시
- [API 상세 문서](https://github.com/leegunwoooo/nikke-api/blob/main/API.md): 필터·페이지네이션·필드 선택·언어 선택 규칙

## Optional

- [문서 사이트](${docs}): 사람용 안내와 인터랙티브 API 레퍼런스
- [소스 코드](https://github.com/leegunwoooo/nikke-api)
`;
}
