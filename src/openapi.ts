// OpenAPI 3.1 spec — served at /openapi.json, rendered by /docs (Scalar)
import { readFileSync } from "node:fs";
import path from "node:path";

// package.json isn't guaranteed in the deployed bundle — the build bakes
// the version into characters.json (which is shipped via includeFiles)
const DIST = path.resolve(process.env.NIKKE_DATA_DIR ?? "data/dist");
const pkgVersion: string = JSON.parse(
  readFileSync(path.join(DIST, "characters.json"), "utf8"),
).version ?? "0.0.0";

const localized = {
  type: "object",
  properties: {
    ko: { type: "string" },
    en: { type: "string" },
    ja: { type: "string" },
    "zh-TW": { type: "string" },
  },
};

const charRef = {
  type: "object",
  properties: {
    nameCode: { type: "integer" },
    id: { type: "integer" },
    resourceId: { type: "integer" },
    name: localized,
    rarity: { type: "string", enum: ["R", "SR", "SSR"] },
    class: { type: "string" },
    burst: { type: "string" },
    corporation: { type: "string" },
    element: { type: "string" },
    image: { type: "string", format: "uri" },
  },
};

const ownedNikkeSummary = {
  type: "object",
  description: "목록 모드(q 없음) 항목 — 경량",
  properties: {
    character: charRef,
    level: { type: "integer" },
    combat: { type: "integer" },
    grade: { type: "integer" },
    core: { type: "integer" },
  },
};

const equipOption = {
  type: "object",
  properties: {
    id: { type: "integer" },
    name: localized,
    rank: { type: "integer", description: "같은 옵션 종류 내 등급 (1~15)" },
    value: {
      type: ["object", "null"],
      properties: {
        type: { type: "string" },
        value: { type: "number" },
        unit: { type: ["string", "null"], example: "%" },
      },
    },
  },
};

const equipSlot = {
  type: ["object", "null"],
  properties: {
    tid: { type: "integer" },
    name: localized,
    class: { type: ["string", "null"] },
    rare: { type: ["string", "null"], example: "T10" },
    icon: { type: ["string", "null"], format: "uri" },
    tier: { type: "integer" },
    level: { type: "integer" },
    corporation: { type: ["string", "null"] },
    options: { type: "array", items: equipOption },
  },
};

const ownedNikkeDetail = {
  type: "object",
  description: "상세 모드(q 지정) 항목",
  properties: {
    ...ownedNikkeSummary.properties,
    arenaCombat: { type: "integer" },
    costume: {
      type: ["object", "null"],
      properties: { id: { type: "integer" }, skinIndex: { type: "integer" }, character: charRef },
    },
    skills: {
      type: "object",
      properties: {
        skill1: { type: "integer" },
        skill2: { type: "integer" },
        burst: { type: "integer" },
      },
    },
    attractiveLevel: { type: "integer" },
    favoriteItem: {
      type: ["object", "null"],
      properties: { id: { type: "integer" }, level: { type: "integer" }, name: localized },
    },
    cube: {
      type: ["object", "null"],
      properties: { id: { type: "integer" }, level: { type: "integer" }, name: localized },
    },
    arenaCube: {
      type: ["object", "null"],
      properties: { id: { type: "integer" }, level: { type: "integer" }, name: localized },
    },
    equipment: {
      type: "object",
      properties: { head: equipSlot, body: equipSlot, arm: equipSlot, leg: equipSlot },
    },
  },
};

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "nikke-api",
    version: pkgVersion,
    description:
      "Unofficial GODDESS OF VICTORY: NIKKE data API. BlablaLink CDN 데이터를 매일 동기화합니다. " +
      "비공식·비상업적 팬 프로젝트 — 데이터 © SHIFT UP / Level Infinite.",
    license: { name: "Non-commercial fan project" },
    contact: { email: "leegunwoo0325@gmail.com" },
  },
  servers: [{ url: "https://nikke-api-gunwoos-projects.vercel.app" }],
  tags: [
    { name: "nikkes", description: "캐릭터 도감" },
    { name: "scenes", description: "스토리 씬 대본" },
    { name: "favorites", description: "소장품" },
    { name: "cubes", description: "하모니 큐브" },
    { name: "user", description: "유저 프로필 (BlablaLink 공유 링크 필요)" },
    { name: "misc" },
  ],
  paths: {
    "/api/nikkes": {
      get: {
        tags: ["nikkes"],
        summary: "캐릭터 목록",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "이름 검색 (전 언어 부분 일치)" },
          { name: "element", in: "query", schema: { type: "string" } },
          { name: "class", in: "query", schema: { type: "string" } },
          { name: "burst", in: "query", schema: { type: "string" } },
          { name: "corporation", in: "query", schema: { type: "string" } },
          { name: "weapon", in: "query", schema: { type: "string" } },
          { name: "rarity", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "페이지 번호 (1부터 — offset 대신 사용, 미지정 limit 시 페이지 크기 50)" },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 }, description: "최대 500, 미지정 시 전체" },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "캐릭터 목록 — count는 잘라내기 전 전체 개수" } },
      },
    },
    "/api/nikkes/{id}": {
      get: {
        tags: ["nikkes"],
        summary: "캐릭터 상세 — 스킬·스탯·스토리·보이스 포함",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "캐릭터 id / resourceId / 이름(부분 일치). 한글 이름은 URL 인코딩 필요",
          },
        ],
        responses: { "200": { description: "캐릭터 상세" }, "404": { description: "없음" } },
      },
    },
    "/api/scenes": {
      get: {
        tags: ["scenes"],
        summary: "씬 목록",
        parameters: [
          { name: "category", in: "query", schema: { type: "string", enum: ["main", "event", "sudden", "attractive"] } },
          { name: "nikke", in: "query", schema: { type: "string" }, description: "호감도 씬 대상 니케" },
          { name: "q", in: "query", schema: { type: "string" }, description: "씬 제목 검색" },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "페이지 번호 (1부터 — offset 대신 사용, 미지정 limit 시 페이지 크기 50)" },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 }, description: "최대 500, 미지정 시 전체" },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "씬 목록 — count는 잘라내기 전 전체 개수" } },
      },
    },
    "/api/events": {
      get: {
        tags: ["scenes"],
        summary: "스토리 이벤트 목록 — event_* 씬 그룹을 이벤트 단위로 묶은 카탈로그",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "이벤트 id 검색 (부분 일치)" },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "페이지 번호 (1부터 — offset 대신 사용, 미지정 limit 시 페이지 크기 50)" },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 }, description: "최대 500, 미지정 시 전체" },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "이벤트 목록 — id·episodes·totalLines·scenes(groupId 배열)" } },
      },
    },
    "/api/events/{id}": {
      get: {
        tags: ["scenes"],
        summary: "이벤트 상세 — 에피소드별 씬 목록 (groupId·제목·대사 수)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: "event_firstaffection" }],
        responses: { "200": { description: "이벤트 상세" }, "404": { description: "없음" } },
      },
    },
    "/api/scenes/{groupId}": {
      get: {
        tags: ["scenes"],
        summary: "씬 대본 — 대사별 화자/아이콘/보이스",
        parameters: [{ name: "groupId", in: "path", required: true, schema: { type: "string" }, example: "d_ex_armory_01" }],
        responses: { "200": { description: "씬 대본" }, "404": { description: "없음" } },
      },
    },
    "/api/stages": {
      get: {
        tags: ["stages"],
        summary: "캠페인 스테이지 목록",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "스테이지 이름 검색" },
          { name: "chapter", in: "query", schema: { type: "integer" }, description: "챕터 번호" },
          { name: "mode", in: "query", schema: { type: "string", enum: ["Normal", "Hard", "Story"] } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "페이지 번호 (1부터 — offset 대신 사용, 미지정 limit 시 페이지 크기 50)" },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 }, description: "최대 500, 미지정 시 전체" },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "스테이지 목록 — count는 잘라내기 전 전체 개수" } },
      },
    },
    "/api/stages/{id}": {
      get: {
        tags: ["stages"],
        summary: "스테이지 상세 — 권장 전투력·시나리오 키",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" }, example: 6000001 }],
        responses: { "200": { description: "스테이지 상세" }, "400": { description: "id 형식 오류" }, "404": { description: "없음" } },
      },
    },
    "/api/costumes": {
      get: {
        tags: ["costumes"],
        summary: "코스튬 목록",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "코스튬 이름 검색 (전 언어 부분 일치)" },
          { name: "grade", in: "query", schema: { type: "string" }, description: "코스튬 등급 (Special/Event/Normal 등)" },
          { name: "nikke", in: "query", schema: { type: "string" }, description: "소유 니케 — 이름 부분 일치 또는 id/resourceId" },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "페이지 번호 (1부터 — offset 대신 사용, 미지정 limit 시 페이지 크기 50)" },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 }, description: "최대 500, 미지정 시 전체" },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "코스튬 목록 — count는 잘라내기 전 전체 개수" } },
      },
    },
    "/api/costumes/{id}": {
      get: {
        tags: ["costumes"],
        summary: "코스튬 상세 — 이름·설명·등급·소유 니케·이미지·storyScenes(사이드 스토리 씬 groupId)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: 10012, description: "코스튬 tid 또는 이름 (부분 일치 — 복수 매칭 시 목록 반환)" }],
        responses: { "200": { description: "코스튬 상세 (이름 복수 매칭 시 목록)" }, "404": { description: "없음" } },
      },
    },
    "/api/equips": {
      get: {
        tags: ["equips"],
        summary: "장비 아이템 목록 — 기본 스탯·옵션슬롯 확률·재련비용·설명 포함",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "장비 이름 검색 (전 언어 부분 일치)" },
          { name: "class", in: "query", schema: { type: "string" }, description: "장착 클래스 (All/Attacker/Defender/Supporter)" },
          { name: "rare", in: "query", schema: { type: "string" }, description: "등급 (T7~T10 등)" },
          { name: "slot", in: "query", schema: { type: "string", enum: ["head", "body", "arm", "leg"] }, description: "부위 (몸통은 body — 리소스 id의 icn_equipment_body_*에 대응)" },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "페이지 번호 (1부터 — offset 대신 사용, 미지정 limit 시 페이지 크기 50)" },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 }, description: "최대 500, 미지정 시 전체" },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "장비 목록 — count는 잘라내기 전 전체 개수" } },
      },
    },
    "/api/equips/options": {
      get: {
        tags: ["equips"],
        summary: "장비 옵션 목록",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "옵션 이름 검색" },
          { name: "groupId", in: "query", schema: { type: "integer" }, description: "옵션 그룹 ID" },
          { name: "rank", in: "query", schema: { type: "integer" }, description: "옵션 등급" },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "페이지 번호 (1부터 — offset 대신 사용, 미지정 limit 시 페이지 크기 50)" },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "옵션 목록" }, "400": { description: "groupId/rank 형식 오류" } },
      },
    },
    "/api/equips/options/{id}": {
      get: {
        tags: ["equips"],
        summary: "장비 옵션 상세",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" }, example: 7000501 }],
        responses: { "200": { description: "옵션 상세" }, "400": { description: "id 형식 오류" }, "404": { description: "없음" } },
      },
    },
    "/api/equips/{id}": {
      get: {
        tags: ["equips"],
        summary: "장비 아이템 상세",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" }, example: 3110101, description: "장비 tid" }],
        responses: { "200": { description: "장비 상세" }, "400": { description: "id 형식 오류" }, "404": { description: "없음" } },
      },
    },
    "/api/avatars": {
      get: {
        tags: ["avatars"],
        summary: "아바타 아이콘 목록",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "캐릭터 이름 검색 (전 언어 부분 일치)" },
          { name: "resourceId", in: "query", schema: { type: "integer" }, description: "캐릭터 resourceId" },
          { name: "orphans", in: "query", schema: { type: "string", enum: ["true"] }, description: "true면 캐릭터 미매칭(NPC/미출시) 아이콘만" },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "페이지 번호 (1부터 — offset 대신 사용, 미지정 limit 시 페이지 크기 50)" },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 }, description: "최대 500, 미지정 시 전체" },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "아바타 목록 — count는 잘라내기 전 전체 개수" } },
      },
    },
    "/api/avatars/{iconId}": {
      get: {
        tags: ["avatars"],
        summary: "아바타 상세 — 소유 캐릭터·아이콘 이미지",
        parameters: [{ name: "iconId", in: "path", required: true, schema: { type: "integer" }, example: 30100, description: "아바타 아이콘 ID (profile.icon.iconId)" }],
        responses: { "200": { description: "아바타 상세" }, "400": { description: "iconId 형식 오류" }, "404": { description: "없음" } },
      },
    },
    "/api/favorites": {
      get: {
        tags: ["favorites"],
        summary: "소장품 목록",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "rare", in: "query", schema: { type: "string", enum: ["R", "SR", "SSR"] } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "페이지 번호 (1부터 — offset 대신 사용, 미지정 limit 시 페이지 크기 50)" },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 }, description: "최대 500, 미지정 시 전체" },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "소장품 목록" } },
      },
    },
    "/api/favorites/{id}": {
      get: {
        tags: ["favorites"],
        summary: "소장품 상세 — 레벨별 스탯·스킬",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" }, example: 100101 }],
        responses: { "200": { description: "소장품 상세" }, "404": { description: "없음" } },
      },
    },
    "/api/cubes": {
      get: {
        tags: ["cubes"],
        summary: "하모니 큐브 목록",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "페이지 번호 (1부터 — offset 대신 사용, 미지정 limit 시 페이지 크기 50)" },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 }, description: "최대 500, 미지정 시 전체" },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "큐브 목록" } },
      },
    },
    "/api/cubes/{id}": {
      get: {
        tags: ["cubes"],
        summary: "큐브 상세 — 레벨별 스탯·스킬",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" }, example: 1000301 }],
        responses: { "200": { description: "큐브 상세" }, "404": { description: "없음" } },
      },
    },
    "/api/user": {
      get: {
        tags: ["user"],
        summary: "유저 프로필 + 전진기지",
        description:
          "BlablaLink 공유 링크로 조회. 보유 니케는 /api/user/{blablaid}/nikke에서 조회. " +
          "blablaid는 쿼리 대신 경로로도 가능: /api/user/{blablaid}",
        parameters: [
          {
            name: "blablaid",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "BlablaLink 공유 ID(base64 openid) 또는 공유 URL 전체 — 구형 ?openid=/?url=도 동작",
          },
        ],
        responses: {
          "200": { description: "프로필+전진기지" },
          "400": { description: "blablaid 형식 오류" },
          "503": { description: "서버 조회 계정 미설정" },
          "502": { description: "업스트림 실패" },
        },
      },
    },
    "/api/user/{blablaid}/nikke": {
      get: {
        tags: ["user"],
        summary: "유저 보유 니케 목록",
        description:
          "항상 경량 목록(이름·레벨·전투력·돌파·코어만). /api/nikkes와 동일한 필터 지원 — 상세는 /api/user/{blablaid}/nikke/{nameOrId}에서 조회. " +
          "blablaid 대신 ?blablaid=도 가능 (/api/user/nikke?blablaid=...)",
        parameters: [
          {
            name: "blablaid",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "BlablaLink 공유 ID (base64 openid)",
          },
          {
            name: "id",
            in: "query",
            schema: { type: "string" },
            description: "숫자 정확 매칭 — 캐릭터 id·resourceId·nameCode",
            example: "3017",
          },
          {
            name: "name",
            in: "query",
            schema: { type: "string" },
            description: "니케 이름 부분 일치 (전 언어, 대소문자·공백 무시 — '102'는 N102도 매칭)",
            example: "아니스",
          },
          {
            name: "q",
            in: "query",
            schema: { type: "string" },
            description: "name과 동일 (하위 호환 별칭)",
            deprecated: true,
          },
          ...(["element", "class", "burst", "corporation", "weapon", "rarity"] as const).map(
            (name) => ({
              name,
              in: "query" as const,
              schema: { type: "string" },
              description: `/api/nikkes와 동일한 ${name} 필터 (AND 결합)`,
            }),
          ),
        ],
        responses: {
          "200": {
            description: "보유 니케 목록",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    count: { type: "integer" },
                    nikkes: { type: "array", items: ownedNikkeSummary },
                  },
                },
              },
            },
          },
          "400": { description: "blablaid 형식 오류" },
          "503": { description: "서버 조회 계정 미설정" },
          "502": { description: "업스트림 실패" },
        },
      },
    },
    "/api/user/{blablaid}/nikke/{nameOrId}": {
      get: {
        tags: ["user"],
        summary: "유저 보유 니케 단일 상세",
        description:
          "nameOrId = 니케 이름(전 언어 부분 일치)·id·resourceId·nameCode — /api/nikkes/{id}와 같은 방식. " +
          "단일 매칭 시 상세(스킬 레벨·장비+옵션 수치·큐브·소장품·코스튬·호감도), 복수 매칭 시 경량 목록 반환.",
        parameters: [
          {
            name: "blablaid",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "BlablaLink 공유 ID (base64 openid)",
          },
          {
            name: "nameOrId",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "이름(부분 일치) 또는 숫자 id·resourceId·nameCode",
            example: "아니스 : 스타",
          },
        ],
        responses: {
          "200": {
            description: "보유 니케 상세",
            content: { "application/json": { schema: ownedNikkeDetail } },
          },
          "404": { description: "해당 니케 미보유 또는 없음" },
          "400": { description: "blablaid 형식 오류" },
          "503": { description: "서버 조회 계정 미설정" },
          "502": { description: "업스트림 실패" },
        },
      },
    },
    "/api/user/{blablaid}/roster": {
      get: {
        tags: ["user"],
        summary: "유저 보유 니케 전체 로스터 (업스트림 원시 형태)",
        description:
          "보유 니케 전원의 업스트림 원시 묶음 — 서버별 {area, characters, details, stateEffects, outpost}. " +
          "GetUserCharacterDetails는 name_code 60개씩 배치 호출. 기본은 5개 서버(83·81·84·82·85) 전부 조회, ?area=로 특정 서버만 지정 가능. " +
          "모든 서버 조회가 실패하면 502(업스트림) 또는 404 reason=private(프로필 비공개). " +
          "blablaid 대신 ?blablaid=도 가능 (/api/user/roster?blablaid=...)",
        parameters: [
          {
            name: "blablaid",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "BlablaLink 공유 ID (base64 openid)",
          },
          {
            name: "area",
            in: "query",
            schema: { type: "integer", enum: [83, 81, 84, 82, 85] },
            description: "조회할 서버만 지정 — 생략 시 전체 순회",
          },
        ],
        responses: {
          "200": { description: "서버별 원시 로스터 묶음" },
          "400": { description: "blablaid 형식 오류 / 지원하지 않는 area" },
          "404": { description: "프로필 비공개 (reason=private)" },
          "503": { description: "서버 조회 계정 미설정" },
          "502": { description: "업스트림 실패 (상세 호출 오류 시 전체 실패)" },
        },
      },
    },
    "/api/tables": {
      get: { tags: ["misc"], summary: "원본 테이블 목록", responses: { "200": { description: "파일 목록" } } },
    },
    "/api/tables/{file}": {
      get: {
        tags: ["misc"],
        summary: "원본 테이블 JSON",
        parameters: [{ name: "file", in: "path", required: true, schema: { type: "string" }, example: "character_id_map.json" }],
        responses: { "200": { description: "원본 JSON" }, "404": { description: "없음" } },
      },
    },
    "/api/meta/filters": {
      get: { tags: ["misc"], summary: "사용 가능한 필터 값 목록", responses: { "200": { description: "필터 값" } } },
    },
    "/api/cdn": {
      get: {
        tags: ["misc"],
        summary: "CDN 리소스 경로 → URL 변환",
        parameters: [{ name: "path", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "변환된 URL" }, "400": { description: "path 누락" } },
      },
    },
  },
} as const;

// ?lang applies to every endpoint — inject it as a shared query param
const langParam = {
  name: "lang",
  in: "query" as const,
  schema: { type: "string", enum: ["ko", "en", "ja", "zh-TW"] },
  description: "다국어 객체({ko,en,ja,zh-TW})를 지정 언어 문자열 하나로 평탄화",
};
for (const p of Object.values(openapi.paths) as any[]) {
  for (const op of Object.values(p) as any[]) {
    (op.parameters ??= []).push(langParam);
  }
}

// ?fields is supported only on the endpoints that apply pickFields
const fieldsParam = {
  name: "fields",
  in: "query" as const,
  schema: { type: "string", example: "id,name.ko" },
  description: "응답 필드 선택 — 콤마 구분, 점(.)으로 중첩. 목록은 각 항목에 적용",
};
for (const p of [
  "/api/nikkes",
  "/api/nikkes/{id}",
  "/api/scenes",
  "/api/scenes/{groupId}",
  "/api/events",
  "/api/events/{id}",
  "/api/stages",
  "/api/stages/{id}",
  "/api/costumes",
  "/api/costumes/{id}",
  "/api/equips",
  "/api/equips/options",
  "/api/equips/options/{id}",
  "/api/equips/{id}",
  "/api/avatars",
  "/api/avatars/{iconId}",
  "/api/favorites",
  "/api/favorites/{id}",
  "/api/cubes",
  "/api/cubes/{id}",
  "/api/user/{blablaid}/nikke",
  "/api/user/{blablaid}/nikke/{nameOrId}",
  "/api/user/{blablaid}/roster",
]) {
  const op = (openapi.paths as Record<string, any>)[p]?.get;
  if (op) (op.parameters ??= []).push(fieldsParam);
}
