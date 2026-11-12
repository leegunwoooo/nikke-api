# MCP 연결 가이드

nikke-api는 `/mcp`에서 [MCP(Model Context Protocol)](https://modelcontextprotocol.io) 서버를 제공합니다. ChatGPT, Claude 같은 AI 클라이언트에 연결하면 니케 캐릭터·스토리·소장품·유저 데이터를 대화 중에 바로 조회할 수 있습니다.

```
https://nikke-api.pages.dev/mcp
```

- 인증이 없습니다. URL만 넣으면 됩니다.
- 세션을 저장하지 않는 Streamable HTTP 방식입니다. SSE 전용 주소는 따로 없습니다.
- 2025년 프로토콜(`initialize` 방식)과 2026-07-28 프로토콜(요청마다 `_meta` 봉투를 붙이는 방식)을 같은 주소에서 모두 받습니다.
- URL은 반드시 `/mcp`로 끝나야 합니다. 끝에 `/`를 붙이지 마세요.

> 각 서비스의 메뉴 이름과 위치는 자주 바뀝니다. 아래 경로가 화면과 다르면 "커넥터", "MCP", "개발자 모드" 같은 이름의 메뉴를 찾아보세요.

## 목차

- [개인 커넥터](#개인-커넥터--자기-프로필-바인딩)
- [Claude (웹·데스크톱 앱)](#claude-웹데스크톱-앱)
- [Claude Code](#claude-code)
- [ChatGPT](#chatgpt)
- [Cursor](#cursor)
- [VS Code (GitHub Copilot)](#vs-code-github-copilot)
- [원격 MCP를 지원하지 않는 클라이언트](#원격-mcp를-지원하지-않는-클라이언트)
- [연결 확인](#연결-확인)
- [제공 도구](#제공-도구)
- [문제 해결](#문제-해결)

## 개인 커넥터 — 자기 프로필 바인딩

BlablaLink 공유 링크를 한 번 등록하면, `get_user_*` 도구에서 링크 입력을 생략할 수 있는 개인 URL을 받습니다.

```
POST https://nikke-api.pages.dev/mcp/register
Content-Type: application/json

{"url": "https://www.blablalink.com/user?openid=<공유 링크의 openid>"}
→ {"key": "u_…", "url": "https://nikke-api.pages.dev/mcp/u/u_…"}
```

반환된 URL을 아래 가이드의 공용 `/mcp` 주소 대신 커넥터에 넣으면 됩니다. 등록되는 건 공개 프로필의 openid뿐이고 게임 토큰은 저장되지 않습니다. 링크가 실제 프로필로 조회되는지 확인한 뒤 발급되며, 키당 분당 60회 제한이 적용됩니다.

## Claude (웹·데스크톱 앱)

개인 계정(Free·Pro·Max)은 이렇게 추가합니다.

1. **설정 → 커넥터**에서 **커스텀 커넥터 추가**를 누릅니다.
2. 이름(예: `NIKKE`)을 정하고, URL에 `https://nikke-api.pages.dev/mcp`를 넣습니다.
3. OAuth 설정은 비워 두고 **추가**를 누릅니다.
4. 대화 입력창의 **+** 메뉴에서 커넥터를 켜고 질문합니다.

- Free 플랜은 커스텀 커넥터를 하나만 추가할 수 있습니다.
- Team·Enterprise는 조직 관리자가 **조직 설정 → 커넥터**에서 먼저 추가해야 하고, 그다음 멤버가 각자 연결합니다.
- Claude는 내 PC가 아니라 Anthropic 서버에서 이 주소로 접속합니다. 그래서 로컬 주소(`localhost`)는 쓸 수 없습니다.

공식 문서: [Custom connectors](https://claude.com/docs/connectors/custom)

## Claude Code

```bash
claude mcp add --transport http nikke https://nikke-api.pages.dev/mcp
```

- 기본은 현재 프로젝트에만 추가됩니다. 모든 프로젝트에서 쓰려면 `--scope user`를 붙입니다.
- `claude mcp list`로 연결 상태를 확인하고, 세션 안에서는 `/mcp`로 도구 목록을 볼 수 있습니다.

## ChatGPT

ChatGPT는 개발자 모드에서 커스텀 MCP 서버를 연결합니다. 무료 플랜에서는 쓸 수 없고, Business·Enterprise는 관리자가 커스텀 커넥터를 허용해야 할 수 있습니다.

1. **설정 → 앱 및 커넥터 → 고급 설정**에서 **개발자 모드**를 켭니다.
2. 커넥터 화면에서 **만들기**를 누릅니다.
3. 이름(예: `NIKKE`)과 설명을 적고, URL에 `https://nikke-api.pages.dev/mcp`를 넣습니다.
4. 인증은 **없음**을 고르고, 신뢰 확인에 체크한 뒤 만듭니다.
5. 새 대화에서 **+ → 더보기 → 개발자 모드**를 고르고 이 커넥터를 켭니다.

이 서버의 도구는 모두 조회 전용이라 데이터를 바꾸지 않습니다.

## Cursor

`~/.cursor/mcp.json`(모든 프로젝트) 또는 프로젝트의 `.cursor/mcp.json`에 추가합니다.

```json
{
  "mcpServers": {
    "nikke": {
      "url": "https://nikke-api.pages.dev/mcp"
    }
  }
}
```

## VS Code (GitHub Copilot)

프로젝트의 `.vscode/mcp.json`에 추가한 뒤, Copilot Chat을 에이전트 모드로 바꿔서 씁니다.

```json
{
  "servers": {
    "nikke": {
      "type": "http",
      "url": "https://nikke-api.pages.dev/mcp"
    }
  }
}
```

## 원격 MCP를 지원하지 않는 클라이언트

로컬(stdio) MCP 서버만 받는 클라이언트는 [`mcp-remote`](https://www.npmjs.com/package/mcp-remote)로 원격 주소를 감싸서 연결합니다. Node.js가 필요합니다.

```json
{
  "mcpServers": {
    "nikke": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://nikke-api.pages.dev/mcp"]
    }
  }
}
```

## 연결 확인

**MCP Inspector**로 브라우저에서 도구를 직접 호출해 볼 수 있습니다.

```bash
npx @modelcontextprotocol/inspector
```

Transport를 `Streamable HTTP`로 고르고 URL을 넣은 뒤 **Connect → Tools → List Tools**를 누릅니다.

**curl**로는 이렇게 확인합니다. 응답은 SSE 형식(`event: message` / `data: {...}`)으로 옵니다.

```bash
curl -X POST https://nikke-api.pages.dev/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 제공 도구

| 도구 | 하는 일 |
|------|---------|
| `search_nikkes` | 캐릭터 검색 (이름·속성·클래스·버스트·기업·무기·레어) |
| `get_nikke` | 캐릭터 상세: 스킬(Lv10 기준), 배경, 스쿼드, CV, 호감도 씬, 애장품 스토리. 레벨별 스탯·음성·코스튬·스킬 강화 비용(`skillCosts`) 등은 `include`로 추가 (예: `["statsPerLevel"]`). 이름이 정확히(공백·대소문자 무시, 전 언어) 일치하는 캐릭터가 있으면 그 캐릭터를 반환하고 나머지 후보는 `alsoMatched`로 알려줍니다. 부분 일치만 있으면 후보 목록이 옵니다 |
| `get_nikke_burst` | 외형별 버스트 리소스, `playback.layers`와 배경·캐릭터를 함께 재생하는 `viewerUrl`, 미리 렌더된 컷신 `gif` URL (jsDelivr, 없는 스킨은 생략). 통합 애니메이션 우선, 분리형은 독립 Skeleton을 같은 시간·좌표로 합성. `voice.burst`/`ready`/`full`에 외형별 버스트 대사와 한국어 음성 URL (뷰어가 컷신과 함께 재생). 미수록은 `null`. `get_nikke`의 `include: ["burstCutscene"]`로도 기본 컷신 조회 가능 |
| `get_nikke_spine` | 기본 외형·코스튬별 스탠딩·사격·엄폐 Spine 리소스와 `burstCutscene`. 각 `stand.gif`(idle)와 `stand.gifs`(idle·action 터치 리액션 등 렌더된 전체 맵)에 미리 렌더된 로비 애니메이션 GIF URL (없는 스킨은 생략) |
| `search_scenes` / `get_scene` | 스토리 씬 검색 / 대본 읽기 (한국어, 호감도·애장품·`library` 스토리 포함. 기본은 화자·대사만, 선택지에는 `window`·`chosen`·`branch` 표시 — 음성·아이콘 URL은 `includeMedia`. `window:"SubScenario"`는 컷신 연출 마커로 `text`가 null이며 읽기 출력에서는 빠지고 `includeMedia`로만 보임. `/api/lines`의 `line`은 이 마커를 포함한 씬 `lines[]` 위치 그대로. 대사의 `@UserName`은 지휘관 이름 자리표시자) |
| `list_events` / `get_event` | 스토리 이벤트 목록 / 에피소드 씬 목록 |
| `search_favorites` / `get_favorite` | 애장품·소장품 목록(애장품 주인 포함, 니케 이름으로 필터) / 레벨별 스탯·스킬 |
| `get_user_profile` | 유저 프로필 (BlablaLink 공유 링크로 조회) |
| `get_user_nikkes` / `get_user_nikke` | 유저 보유 니케 목록(레벨·전투력·돌파·코어, 전투력순) / 한 캐릭터의 육성 상태. 이름이 정확히 일치하면 그 니케를 반환하고 나머지 버전은 `alsoMatched`로 알려줍니다 |
| `get_user_nikke_builds` | 유저 보유 니케 여러 명의 육성 상태를 한 번에. `nikkes`를 생략하면 보유 전원을 전투력순으로 줍니다. 1명씩 여러 번 호출하면 조회 제한에 걸리므로 이쪽을 씁니다. 찾지 못한 이름은 `notFound`, 후보가 여럿이면 `ambiguous`로 알려줍니다. 일부 항목만 필요하면 `fields`(예: `character.name,favoriteItem`)로 응답을 줄일 수 있습니다 |
| `get_user_roster` | 유저 보유 니케 **전원** (서버별 name_code·레벨·전투력·돌파·코어로 축약 — 5개 서버 순회, `area`로 한 곳만 지정 가능). 장비·옵션 등 원시 필드 전체는 REST `/api/user/:id/roster`에서 |
| `api_get` | 전용 도구가 없는 조회: 스테이지, 코스튬, 장비, 큐브, 아바타, 필터 값, 기록실(archives), 원본 테이블, `/api/nikkes/:id/spine.gif`·`/api/nikkes/:id/burst.gif`(리다이렉트는 `{redirect}`로 반환) (`/api/user`는 막혀 있음) |
| `search` / `fetch` | 캐릭터·이벤트·씬·소장품 통합 검색 / id로 문서 가져오기 (ChatGPT 커넥터 규격, id 형식 `nikke:201601`·`event:event_claymore`) |
| `read_event` | 이벤트 하나의 대본 전체를 에피소드 순서대로 (`화자: 대사`). 요약·다시 들려주기용. 긴 이벤트는 여러 페이지로 오니 `truncated.nextOffset`으로 이어 받습니다 |
| `search_lines` | 대사 본문·화자로 전체 스토리 검색. 결과마다 씬·이벤트 표시 |
| `nikke_appearances` | 캐릭터가 나오는 씬과 이벤트를 대사 수 순으로 |
| `compare_nikkes` | 2–4명의 프로필·스킬을 한 번에 (이름이 정확히 맞는 캐릭터 우선) |
| `story_route` / `next_story` | 스토리 감상 순서 (커뮤니티 가이드 기준, 50챕터까지. 가이드에 없는 애장품 스토리는 맨 끝) / 지금 진행 위치에서 다음에 볼 스토리 |

- 모든 도구는 기본으로 한국어(`lang=ko`)로 응답합니다. 다른 언어는 `lang`에 `en`·`ja`·`zh-TW`를 넣습니다.
- 리소스도 제공합니다: `nikke://filters`(필터 값 전체), `nikke://nikke/{id}`(캐릭터 상세, id 자동완성 지원). Claude에서 컨텍스트로 첨부할 때 씁니다.
- 이격은 원본과 묶여서 검색됩니다. `홍련`을 찾으면 `홍련 : 흑영`·`홍련 : 신살`도 나오고, 호감도 씬·대사 검색·등장 씬도 같은 묶음으로 찾습니다. 끄려면 `family: false`.
- 필터는 영문 값만 받습니다. 한글 대응은 각 파라미터 설명에 있습니다 (예: 철갑 = `Iron`, 화력형 = `Attacker`).
- 응답이 60,000자(`read_event`는 페이지당 20,000자)를 넘으면 목록 뒤쪽을 덜어내고 `truncated`(`returned`·`omitted`·`nextOffset`)를 붙여 돌려줍니다. 나머지는 `offset`으로 이어서 받습니다.
- 유저 도구는 공유 계정으로 게임 API를 실시간 호출하므로 서버 인스턴스당 분당 30회로 제한됩니다. 전체 로스터 조회(`/api/user/:blablaid/roster`)는 너무 무거워 MCP 도구로 제공하지 않습니다.
- 유저 도구에는 BlablaLink 공유 ID나 공유 URL 전체(`https://www.blablalink.com/user?openid=...`)를 넣습니다.

질문 예시:

- "라피 : 레드 후드 스킬 정리해줘"
- "에반게리온 콜라보 이벤트 스토리 순서대로 알려줘"
- "철갑 속성 버스트 3 공격형 니케 목록"
- "BUNNY X 777 이벤트 스토리 요약해줘"
- "라피가 '방주의 영웅'이라는 말 나온 장면 찾아줘"
- "아니스가 제일 많이 나오는 이벤트 뭐야?"
- "메인 24챕터까지 깼는데 다음에 뭐 봐?"
- "이 공유 링크 유저가 가진 SSR 니케 보여줘: https://www.blablalink.com/user?openid=..."

## 문제 해결

| 증상 | 원인과 해결 |
|------|-------------|
| 연결 실패 | URL 끝이 `/mcp`인지, 끝에 `/`가 붙지 않았는지 확인합니다. |
| 브라우저로 열면 405 | 정상입니다. 세션을 저장하지 않는 방식이라 `GET`을 받지 않습니다. |
| 유저 도구가 503 `blabla credentials not configured` | 서버에 BlablaLink 조회 계정이 설정돼 있지 않습니다. 직접 배포했다면 `BLA_*` 환경변수를 설정합니다. |
| 유저 도구가 502 | 업스트림(BlablaLink) 오류이거나 조회 계정의 토큰이 만료된 경우입니다. |
| 응답에 `truncated`가 있음 | 목록이 커서 일부만 왔습니다. `truncated.nextOffset`을 `offset`으로 넣어 이어서 받습니다. |
| 유저 도구가 `rate limited — retry in Ns` | 분당 호출 한도에 걸렸습니다. 안내된 초만큼 기다린 뒤 다시 호출합니다. |

직접 배포한 서버를 쓴다면 위 URL의 도메인만 자기 주소로 바꾸면 됩니다. 로컬에서는 `npm run dev` 후 `http://localhost:3000/mcp`로 MCP Inspector에서 확인할 수 있습니다.
