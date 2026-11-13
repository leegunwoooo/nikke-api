# nikke-api 작업 규칙

## 시작 전
- `main`, 열린 PR, 이슈 상태 확인 후 이슈 어사인. 동시 작업이 많아 수정이 겹치기 쉬움.
- PR 직전 재확인. `main`이 바뀌었으면 그 위에서 재검증.

## 변경 시 함께 갱신
- API 수정 시 `src/mcp.ts`도 같은 범위로 작업. 새 필드/엔드포인트는 `NIKKE_EXTRA`, 전용 tool,
  `api_get` 허용 목록 중 맞는 곳에 매핑하고 `docs/mcp.md` 도구 표도 갱신. MCP만 뒤처진 상태 금지.
- 동작이 바뀌면 `README.md`, `API.md`, `nikke-api.postman_collection.json`도 갱신.
  `src/factory.ts`·`src/mcp.ts`·`src/openapi.ts`가 바뀌었는데 문서 3개가 그대로면 `Stop` 훅(`scripts/check-docs-sync.mjs`)이 차단함.
- `worker/`나 `src/` 변경 시 `npm run emit:pages-worker` 실행. 번들에 `src/`도 포함되고, 생성물이지만 git 추적.

## 작업 순서
1. 코드 수정
2. `npm test`, `npm run typecheck`
3. 문서 갱신
4. 표로 정리해 보고
5. 커밋. 요청 항목마다 별도 커밋.

## 데이터 규칙
- 대사가 아닌 행도 씬 파일과 검색 인덱스에서 삭제 금지. `/api/lines`의 `line`이 `lines[]` 위치라 밀림.
  숨길 행은 읽기 출력에서만 제외.
- `scripts/`나 데이터 형식 변경 시 이전 빌드와 전체 대조 후 달라진 줄 수 보고.

## 배포
- 워커: `src/`, `worker/` 등이 바뀌어 `main`에 push되면 자동 배포. CI를 기다리지 않음.
- 데이터: `Refresh data`가 매일 실행. 내용이나 fingerprint 입력이 바뀐 날 배포. 바로 반영하려면 `force`로 수동 실행.
  fingerprint에 없는 빌드 스크립트만 바꿨다면 `force` 필요.
- 워커와 데이터는 따로 배포됨. `data/dist` 형식 변경은 추가 전용으로, 옛 워커와 새 데이터,
  새 워커와 옛 데이터 양쪽에서 깨지지 않게 작성.

## 금서고
- `library` 씬은 `scripts/library-stories.ts`의 `LIBRARY_COMMIT`에 고정.
  원본이 바뀌면 `Watch story archive`가 이슈로 알림. 값을 올린 PR을 머지하면 다음 데이터 갱신 때 배포.

## 이슈와 PR
- 이슈를 닫는 변경에는 `Closes #N` 사용. `(#N)`만으로는 안 닫힘.
- AI 작업자의 보고는 그대로 믿지 말고 결과를 직접 확인.
