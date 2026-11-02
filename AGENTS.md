# nikke-api 작업 규칙

## 변경 시 함께 갱신할 것

- **API를 수정하면 `src/mcp.ts`도 같은 변경 범위로 작업한다** — 새 필드/엔드포인트는
  `NIKKE_EXTRA`·전용 tool·`api_get` 허용 목록 중 적절한 곳에 매핑하고, `docs/mcp.md`의
  도구 표도 갱신한다. API만 바뀌고 MCP가 뒤처지는 상태를 남기지 않는다.
- `README.md`·`API.md`도 동작이 바뀌면 함께 갱신한다.

## 작업 순서

1. 코드 수정
2. `npm test` + `npx tsc -p tsconfig.check.json --noEmit`
3. 문서(`README.md`·`API.md`·필요 시 `docs/mcp.md`)
4. 표로 정리해 보고
5. 커밋 — **요청 항목마다 별도 커밋** (여러 항목을 한 커밋에 묶지 않는다)

## 배포

- `worker/index.ts`를 바꾸면 `npm run emit:pages-worker`로 `pages-proxy/_worker.js`를
  재생성하고 `wrangler pages deploy . --project-name=nikke-api`로 배포한다 (생성물이지만 git 추적).
- `data/dist`가 바뀌면(빌드 파이프라인/스키마 변경) **데이터 먼저**
  `wrangler pages deploy data/dist --project-name=nikke-api-data`로 배포한 뒤 워커를 배포한다 —
  워커가 아직 없는 파일을 참조하는 시간을 만들지 않기 위해.
