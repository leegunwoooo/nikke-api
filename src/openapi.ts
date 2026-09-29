// OpenAPI 3.1 spec — served at /openapi.json, rendered by /docs (Scalar)
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
      properties: { head: equipSlot, torso: equipSlot, arm: equipSlot, leg: equipSlot },
    },
  },
};

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "nikke-api",
    version: "0.1.0",
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
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "캐릭터 목록" } },
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
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "씬 목록" } },
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
    "/api/favorites": {
      get: {
        tags: ["favorites"],
        summary: "소장품 목록",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "rare", in: "query", schema: { type: "string", enum: ["R", "SR", "SSR"] } },
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
        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
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
        description: "BlablaLink 공유 링크로 조회. 보유 니케는 /api/user/nikke에서 조회.",
        parameters: [
          {
            name: "openid",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "공유 링크의 base64 openid 또는 URL 전체",
          },
        ],
        responses: {
          "200": { description: "프로필+전진기지" },
          "400": { description: "openid 형식 오류" },
          "503": { description: "서버 조회 계정 미설정" },
          "502": { description: "업스트림 실패" },
        },
      },
    },
    "/api/user/nikke": {
      get: {
        tags: ["user"],
        summary: "유저 보유 니케 목록 / 개별 상세",
        description:
          "q 생략 시 경량 목록(상세 호출 생략). q 지정 시 매칭 니케의 스킬·장비·큐브·소장품 상세 반환. " +
          "정확히 1명 매칭되면 `nikke` 단일 객체도 포함.",
        parameters: [
          {
            name: "openid",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "공유 링크의 base64 openid 또는 URL 전체",
          },
          {
            name: "q",
            in: "query",
            schema: { type: "string" },
            description: "니케 이름(전 언어 부분 일치)·id·resourceId·nameCode",
            example: "아니스",
          },
        ],
        responses: {
          "200": {
            description: "보유 니케",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    count: { type: "integer" },
                    nikke: {
                      ...ownedNikkeDetail,
                      description: "정확히 1명 매칭(q 지정) 시에만 존재하는 단일 객체",
                    },
                    nikkes: { type: "array", items: ownedNikkeDetail },
                  },
                },
              },
            },
          },
          "400": { description: "openid 형식 오류" },
          "503": { description: "서버 조회 계정 미설정" },
          "502": { description: "업스트림 실패" },
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
};
