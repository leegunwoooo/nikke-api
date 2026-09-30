# API 문서

베이스 URL: `https://nikke-api-gunwoos-projects.vercel.app`

모든 응답은 `application/json`. 캐릭터 이름은 4개 언어(`ko`, `en`, `ja`, `zh-TW`)로 제공되며, 검색은 모든 언어에 대해 부분 일치로 동작합니다.

> [!WARNING]
> 본 문서의 모든 데이터는 **© SHIFT UP / Level Infinite** 소유이며, 비공식·비상업적 용도로만 제공됩니다.

---

## 목차

- [GET /api/nikkes](#get-apinikkes) — 캐릭터 목록
- [GET /api/nikkes/:id](#get-apinikkesid) — 캐릭터 상세
- [GET /api/meta/filters](#get-apimetafilters) — 필터 값 목록
- [GET /api/tables](#get-apitables) — 원본 테이블 목록
- [GET /api/tables/:file](#get-apitablesfile) — 원본 테이블 조회
- [GET /api/scenes](#get-apiscenes) — 스토리 씬 목록 (한국어)
- [GET /api/scenes/:groupId](#get-apiscenesgroupid) — 씬 대본 (한국어)
- [GET /api/favorites](#get-apifavorites) — 소장품 목록
- [GET /api/favorites/:id](#get-apifavoritesid) — 소장품 상세 (레벨별 스탯·스킬)
- [GET /api/cubes](#get-apicubes) — 하모니 큐브 목록
- [GET /api/cubes/:id](#get-apicubesid) — 큐브 상세 (레벨별 스탯·스킬)
- [GET /api/user](#get-apiuser) — 유저 프로필 조회 (공유 링크)
- [GET /api/user/:blablaid/nikke](#get-apiuserblablaidnikke) — 유저 보유 니케 목록 (경량)
- [GET /api/user/:blablaid/nikke/:key](#get-apiuserblablaidnikkekey) — 유저 보유 니케 상세 (이름 부분 일치/id)
- [GET /api/cdn](#get-apicdn) — CDN 경로 → URL 변환
- [공통: 필드 선택 `?fields=`](#공통-필드-선택-fields)
- [공통: 언어 선택 `?lang=`](#공통-언어-선택-lang)
- [공통: 캐시 헤더](#공통-캐시-헤더)
- [에러 응답](#에러-응답)

---

## GET /api/nikkes

캐릭터 목록을 반환합니다. 응답은 경량이며 `details` 필드는 포함되지 않습니다.

### 쿼리 파라미터

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 이름 부분 일치 검색 (전 언어 대상) | `?q=아니스` |
| `element` | 속성 | `Electronic`, `Iron`, `Fire`, `Wind`, `Water` |
| `class` | 클래스 | `Attacker`, `Defender`, `Supporter` |
| `burst` | 버스트 스텝 | `I`, `II`, `III`, `All` |
| `corporation` | 소속 | `MISSILIS`, `ELYSION`, `TETRA`, `PILGRIM`, `ABNORMAL` |
| `weapon` | 무기 종류 | `RL`, `SMG`, `SG`, `SR`, `AR`, `MG` |
| `rarity` | 레어도 | `SSR`, `SR`, `R` |
| `limit` | 반환 개수 제한 (최대 500, 미지정 시 전체) | `?limit=50` |
| `offset` | 시작 위치 (페이지네이션) | `?offset=50` |
| `fields` | 응답 필드 선택 (각 항목에 적용) | `?fields=id,name.ko` |

모든 필터는 AND로 결합되며 대소문자를 구분하지 않습니다.

**페이지네이션**: 필터가 먼저 적용된 뒤 `offset`/`limit`으로 잘립니다. `count`는 잘라내기 전 필터링된 전체 개수이고, `offset`은 실제 적용된 시작 위치가 응답에 포함됩니다. `offset`이 범위를 넘으면 빈 배열이 반환됩니다.

### 요청 예시

```
GET /api/nikkes?q=아니스
GET /api/nikkes?element=Electronic&rarity=SSR
GET /api/nikkes?limit=20&offset=40
```

### 응답

```json
{
  "count": 3,
  "offset": 0,
  "characters": [
    {
      "id": 301201,
      "resourceId": 12,
      "name": { "ko": "아니스", "en": "Anis", "ja": "アニス", "zh-TW": "阿妮斯" },
      "rarity": "SR",
      "class": "Defender",
      "burst": "II",
      "corporation": "TETRA",
      "element": "Iron",
      "weapon": { "type": "RL", "attackType": "Metal", "ammo": 6 },
      "costumes": [],
      "images": {
        "icon": "https://sg-tools-cdn.blablalink.com/.../xxx.webp",
        "medium": "https://sg-tools-cdn.blablalink.com/.../xxx.webp",
        "full": "https://sg-tools-cdn.blablalink.com/.../xxx.webp"
      },
      "icons": {
        "grade": "...",
        "class": "...",
        "element": "..."
      },
      "skillIcons": {
        "skill1": "...",
        "skill2": "...",
        "burst": "..."
      }
    }
  ]
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | number | 캐릭터 ID |
| `resourceId` | number | 내부 리소스 ID (CDN roledata 파일명에 사용) |
| `name` | object | `{ko, en, ja, zh-TW}` 로컬라이즈된 이름 |
| `weapon.attackType` | string | 내부 공격 타입 (`Metal`, `Energy`, `Bio`) — 공식 UI 미표시 값 |
| `images` | object | `icon` / `medium` / `full` 이미지 (BlablaLink CDN URL) |
| `skillIcons` | object | 스킬별 아이콘 URL |

---

## GET /api/nikkes/:id

캐릭터 상세 정보를 반환합니다. 목록 필드 전체 + `details` 포함.

`:id`에는 세 가지 형식이 가능합니다:

- 캐릭터 ID: `/api/nikkes/301201`
- resourceId: `/api/nikkes/12`
- 이름 (부분 일치): `/api/nikkes/아니스` — 복수 매칭 시 목록 형태로 반환 (단일 매칭 시에만 상세 반환)

### 응답 (상세 부분)

```json
{
  "id": 301201,
  "name": { "ko": "아니스", ... },
  "...": "목록 필드와 동일",
  "details": {
    "backstory": { "ko": "...", "en": "...", "ja": "...", "zh-TW": "..." },
    "squad": { ... },
    "cv": { "ko": "김성연", ... },
    "combat": {
      "criticalRatio": "15%",
      "criticalDamage": "150%",
      "bonusRangeMin": 0,
      "bonusRangeMax": 0,
      "burstApplyDelay": 0.01,
      "burstDuration": 10,
      "changeBurstStep": "Step3"
    },
    "skills": [
      {
        "slot": "skill1",
        "id": 1201,
        "icon": "https://...",
        "name": { "ko": "...", ... },
        "descriptionTemplate": { "ko": "{description_value_01} ... 원본 템플릿", ... },
        "descriptions": { "ko": "■ 40회 피격 시 자신에게\n[방어력 120% ▲] [10초 유지]", ... },
        "values": [ ["1레벨 값", ...], ..., ["10레벨 값", ...] ]
      }
    ],
    "statsPerLevel": {
      "attack": [360, 378, ..., "레벨1~최대"],
      "defence": [...],
      "hp": [...]
    },
    "teammateList": [
      { "nameCode": 5071, "id": 201401, "resourceId": 14,
        "name": { "ko": "네온 : 블루 오션", ... }, "rarity": "SSR", "image": "https://..." }
    ],
    "attractiveScenarios": [ ... ],
    "voices": [
      {
        "id": 120001,
        "categoryGroup": 1,
        "order": 101,
        "isTeaser": true,
        "conditionAttractiveLevel": 1,
        "speechId": "c012_Lobby_Touch_1",
        "label": { "ko": "로비 터치 I", ... },
        "text": { "ko": "믿는 버릇을 들이라고? 하하. 농담도.", ... },
        "voice": { "ko": ".../c012_Lobby_Touch_1.mp3", "en": "...", "ja": "..." }
      }
    ]
  }
}
```

### `skills[]` 필드

| 필드 | 설명 |
|------|------|
| `slot` | `skill1` / `skill2` / `burst` |
| `descriptions` | **Lv10(최대 레벨) 기준 렌더링된 설명** — `{description_value_XX}` 플레이스홀더 치환 + 마크업 제거 완료 |
| `descriptionTemplate` | 원본 템플릿 (플레이스홀더 포함) |
| `values` | 레벨별 원본 수치 배열 (Lv1~Lv10) |
| `cooltime` | 버스트 쿨타임, 초 단위 |

### `voices[]` 필드

캐릭터 대사/보이스 목록 (로비 터치, 전투 진입·승리, 호감도 구간 대사 등). `label`은 대사 종류(언어별), `text`는 대사 텍스트(언어별), `voice`는 ko/en/ja 음성 mp3 URL (zh-TW 보이스는 존재하지 않음). `conditionAttractiveLevel`은 대사 해금에 필요한 호감도 레벨.

### 복수 매칭 시

이름으로 조회 시 여러 캐릭터가 매칭되면 상세 없이 목록으로 반환됩니다:

```
GET /api/nikkes/아니스
```

```json
{ "count": 3, "characters": [ {"id":301201,...}, {"id":301501,...}, {"id":301701,...} ] }
```

---

## GET /api/meta/filters

`/api/nikkes` 필터에 사용 가능한 값 목록을 반환합니다.

```json
{
  "elements": ["Electronic","Iron","Fire","Wind","Water"],
  "classes": ["Attacker","Defender","Supporter"],
  "bursts": ["III","II","I","All"],
  "corporations": ["MISSILIS","ELYSION","TETRA","PILGRIM","ABNORMAL"],
  "weapons": ["RL","SMG","SG","SR","AR","MG"],
  "rarities": ["SSR","SR","R"]
}
```

---

## GET /api/tables

동기화된 원본 게임 테이블 JSON 파일 목록을 반환합니다 (레벨 테이블, 장비 옵션, 아카이브, 스토리 목록 등 30종).

```json
{ "files": ["CharacterLevelTable.json", "ItemEquipTable_ko.json", ...] }
```

## GET /api/tables/:file

원본 테이블 JSON을 그대로 반환합니다. 파일명은 `[A-Za-z0-9._-]+\.json` 형식만 허용됩니다.

```
GET /api/tables/CharacterLevelTable.json
```

## GET /api/scenes

스토리 씬 목록을 반환합니다 (한국어). 메인/이벤트/돌발 스토리 + **호감도(Attractive) 시나리오** 포함 — 약 3000개 그룹.

### 쿼리 파라미터

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 그룹 ID·씬 이름 부분 일치 | `?q=발신자` |
| `category` | 카테고리 필터 | `main` / `event` / `sudden` / `attractive` |
| `nikke` | 호감도 씬 대상 니케 이름 부분 일치 | `?nikke=아니스` |
| `limit` | 반환 개수 제한 (최대 500) | `?limit=50` |
| `offset` | 시작 위치 (페이지네이션) | `?offset=50` |
| `fields` | 응답 필드 선택 (각 항목에 적용) | `?fields=groupId,name` |

```
GET /api/scenes?category=attractive&nikke=아니스
GET /api/scenes?category=main&limit=20&offset=0
```

```json
{
  "count": 5,
  "offset": 0,
  "scenes": [
    {
      "groupId": "d_nikke_anis_01",
      "name": "방주 나들이",
      "lines": 128,
      "category": "attractive",
      "type": "attractive",
      "nikke": "아니스",
      "level": 1
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `groupId` | 시나리오 그룹 ID (`d_main_*` 메인, `event_*` 이벤트, `d_ex_*` 돌발, `d_nikke_*` 호감도) |
| `name` | 씬 이름 (한국어) |
| `lines` | 대사 수 |
| `category` | `main` / `event` / `sudden` / `attractive` / `etc` |
| `type` | `"attractive"`이면 호감도 시나리오 (일반 스토리는 없음) |
| `nikke` | 호감도 시나리오 대상 니케 (호감도만) |
| `level` | 필요 호감도 레벨 (호감도만) |

## GET /api/scenes/:groupId

해당 씬의 대본을 반환합니다 (한국어). `?fields=`로 씬 객체를 잘라낼 수 있습니다 (예: `?fields=groupId,name`).

```
GET /api/scenes/d_main_01_01_s
GET /api/scenes/d_main_01_01_s?fields=name,lines
```

```json
{
  "id": 1,
  "groupId": "d_main_01_01_s",
  "name": "첫 번째 접촉 : A",
  "lines": [
    {
      "id": "d_main_01_01_s_1",
      "speaker": "marian",
      "speakerName": "마리안",
      "text": "BA-01다운!\nBA-01다운!",
      "window": "Speech",
      "speakerIcon": "https://sg-tools-cdn.blablalink.com/.../....webp",
      "voice": "https://sg-tools-cdn.blablalink.com/.../....mp3"
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `lines[].speaker` | 화자 코드 (내부 식별자) |
| `lines[].speakerName` | 화자 이름 (한국어, 내레이션 등은 코드 그대로일 수 있음) |
| `lines[].text` | 대사 텍스트 |
| `lines[].window` | 말풍선 타입 (`Speech`, `Choice`, `Narration` 등) |
| `lines[].speakerIcon` | 화자 아이콘 이미지 URL (화자가 캐릭터로 매핑될 때 존재, NPC 포함) |
| `lines[].voice` | 해당 대사의 한국어 보이스 mp3 URL. 보이스가 없는 씬에서는 `null` |
| `lines[].background` / `lines[].bgm` | 배경·BGM 리소스 코드 (호감도 씬에만 존재) |

호감도 씬(`groupId`가 `d_nikke_*`)은 상단에 `type: "attractive"`, `nikke`, `attractiveLevel` 필드가 추가로 붙습니다.

캐릭터별 호감도 씬은 `/api/nikkes/:id` 상세의 `details.attractiveScenarios`에 들어있는 `attractive_scenario_group_id`로 연결됩니다. 스킨 캐릭터(예: `아니스 : 스타`)는 자기 전용 그룹(`d_nikke_anis_star_*`)을 가지며, `?nikke=` 필터는 부분 일치라 `아니스`로 검색하면 모든 스킨 버전이 함께 나옵니다.

## GET /api/favorites

소장품과 애장품 목록을 반환합니다 — 33종 (R/SR/SSR).

### 쿼리 파라미터

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 이름 부분 일치 (전 언어) | `?q=기차` |
| `rare` | 레어 필터 | `R` / `SR` / `SSR` |
| `fields` | 응답 필드 선택 (각 항목에 적용) | `?fields=id,name.ko` |

```json
{
  "count": 33,
  "favorites": [
    { "id": 200101, "rare": "SSR", "name": { "ko": "장난감 기차 세트", ... }, "weaponType": "MG" }
  ]
}
```

## GET /api/favorites/:id

소장품 상세를 반환합니다.

```json
{
  "id": 200101,
  "nameCode": 5020,
  "character": { "id": 207201, "resourceId": 72,
    "name": { "ko": "디젤", ... }, "rarity": "SSR", "image": "https://..." },
  "rare": "SSR",
  "weaponType": "MG",
  "maxLevel": 2,
  "name": { "ko": "장난감 기차 세트", "en": "Toy Train Set", ... },
  "description": { "ko": "추억에 갇혀있던 장난감 기차는...", ... },
  "images": { "icon": "...", "prop": "..." },
  "stats": [
    { "level": 1, "atk": 9688, "def": 2058, "hp": 301800, "power": 1288,
      "grade": 1, "collectionSkillLevel": 4, "itemSkillLevel": 4 }
  ],
  "skills": [ ... ]
}
```

| 필드 | 설명 |
|------|------|
| `stats[]` | 레벨별 스탯 — `level`, `atk`, `def`, `hp`, `power`, `grade`, `collectionSkillLevel`(컬렉션 스킬 레벨), `itemSkillLevel`(소장품 스킬 레벨) |
| `skills[].kind` | `collection` = 수집 효과 스킬, `item` = 소장품 전용 스킬 (`slot`/`unlocksAt` = 강화 단계 — SSR 전용품 1·2·3단계에서 각각 해금) |
| `skills[].descriptions` | 최대 레벨 기준 렌더링된 설명 (언어별) |
| `skills[].descriptionTemplate` / `skills[].values` | 원본 템플릿 + 레벨별 수치 배열 |
| `skills[].infoLabel` | 연계 스킬 종류 표기 (예: "버스트 스킬", "스킬2") |

## GET /api/cubes

하모니 큐브 목록을 반환합니다 — 17종 (전부 SSR).

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 이름 부분 일치 (전 언어) | `?q=어설트` |
| `fields` | 응답 필드 선택 (각 항목에 적용) | `?fields=id,name.ko` |

```json
{
  "count": 17,
  "cubes": [
    { "id": 1000301, "rare": "SSR", "name": { "ko": "렐릭 어설트 큐브", "en": "Assault Cube", ... } }
  ]
}
```

## GET /api/cubes/:id

큐브 상세를 반환합니다. `?fields=` 지원 (예: `?fields=id,name,stats`).

```json
{
  "id": 1000303,
  "name": { "ko": "렐릭 베어 큐브", ... },
  "description": { "ko": "...", ... },
  "location": { "ko": "로스트 섹터 4에서 획득 가능", ... },
  "rare": "SSR",
  "class": "All",
  "stats": [
    { "level": 1, "atk": 390, "def": 78, "hp": 11800, "power": 184,
      "skillLevels": [1, 0, 0] }
  ],
  "skills": [
    {
      "id": 40091,
      "maxLevel": 7,
      "icon": "https://...",
      "name": { "ko": "퀵 리로드 HC", ... },
      "descriptionTemplate": { "ko": "...{description_value_01}% ...", ... },
      "descriptions": { "ko": "■ 전투 시작 시\n[재장전 속도 11.25% ▲]", ... },
      "values": [ ... ]
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `stats[]` | 큐브 레벨별 스탯 — `atk`, `def`, `hp`, `power`, `skillLevels` (스킬 그룹별 레벨) |
| `skills[]` | 큐브 스킬 — `descriptions`는 최대 레벨 기준 렌더링, `values`는 레벨별 수치 |

## GET /api/user

BlablaLink 공유 프로필 링크로 유저 프로필을 조회합니다. 서버에 설정된 조회용 계정이 대신 호출하므로, API 사용자는 자격증명 없이 공유 링크만 붙이면 됩니다.

### 쿼리 파라미터

| 파라미터 | 설명 |
|----------|------|
| `blablaid` | BlablaLink 공유 ID (base64 openid), 또는 공유 URL 전체 (`https://www.blablalink.com/user?openid=...` 통째로 넣어도 됨) |
| `url` | `blablaid`와 동일 — 전체 URL. 구형 `openid`도 동작 |

```
GET /api/user?blablaid=<base64 openid>
GET /api/user?url=<공유 URL 전체>
GET /api/user/<blablaid>                          # 경로로도 가능
```

보유 니케 목록·개별 상세는 [GET /api/user/:blablaid/nikke](#get-apiuserblablaidnikke)를 사용하세요.

### 응답

```json
{
  "intlOpenId": "6955112070733725602",
  "areaId": 83,
  "profile": {
    "nickname": "둔R",
    "level": 333,
    "icon": { "nameCode": 512201, "id": 110501, "name": { "ko": "볼륨", ... }, "image": "https://.../si_cxxx.webp" },
    "teamCombat": 355847,
    "nikkeCount": 111,
    "costumeCount": 6,
    "campaign": {
      "normal": { "stageId": 6040043, "chapter": 41, "mode": "Normal", "stage": "40-35 STAGE" },
      "hard":   { "stageId": 7019014, "chapter": 20, "mode": "Hard", "stage": "19-14 STAGE" },
      "easy":   { "stageId": 8048043, "...": "..." }
    },
    "towers": { "tribe": 289, "tetra": 168, "elysion": 168, "missilis": 146, "pilgrim": 111 },
    "corporations": { "ELYSION": 35, "MISSILIS": 24, "TETRA": 35, "PILGRIM": 13, "ABNORMAL": 4 },
    "currencies": [ { "type": 98, "value": "23" }, ... ],
    "overclock": {
      "currentSubSeasonHighScore": 25,
      "latestSeasonHighScore": 25,
      "history": [ { "season": 10, "optionLevel": 15, "options": [901, ...] } ]
    },
    "profileTeam": [ { "slot": 1, "character": { "nameCode": 5065, "name": {...}, "image": "..." } } ],
    "createdAt": 1777221536,
    "lastActionAt": 1790633032
  },
  "outpost": {
    "infraCoreLevel": 19,
    "outpostBattleLevel": 384,
    "synchroLevel": 248,
    "synchroSlotsUsed": 54,
    "tacticAcademy": { "class": 13000, "lesson": 13003 },
    "recycleRoom": [ { "tid": 1001, "type": "Personal", "subType": "Personal", "level": 91, "exp": 0 }, ... ],
    "memorials": [ { "category": "HandWriting", "count": 88 }, ... ]
  }
}
```

| 필드 | 설명 |
|------|------|
| `profile.icon` | 대표 아이콘 — `iconId`가 캐릭터/코스튬으로 해석되면 이름·이미지 포함 |
| `profile.campaign.*` | 캠페인 진행도 — `stageId`를 stage_list로 해석해 `chapter`/`mode`/`stage`("40-35 STAGE" 등) 제공 |

**참고**

- 대상이 BlablaLink에서 프로필 공유 링크를 만들 수 있는 상태여야 조회됩니다.
- 대상의 공개 설정에 따라 일부 섹션이 비어 있거나 거부될 수 있습니다.

**에러**

| 상황 | 상태 |
|------|------|
| `blablaid` 형식 오류 | 400 `{"error": "invalid blablaid"}` |
| 서버 조회 계정 미설정 | 503 `{"error": "blabla credentials not configured"}` |
| 업스트림 실패 (토큰 만료, 권한 없음 등) | 502 `{"error": "...", "code": ...}` |

## GET /api/user/:blablaid/nikke

공유 프로필의 보유 니케 **목록**을 조회합니다 — `/api/user`보다 가볍고 상세 호출도 하지 않습니다.

| 파라미터 | 설명 |
|----------|------|
| `:blablaid` (path) | BlablaLink 공유 ID(base64 openid) 또는 URL 전체 |
| `q` | 선택. 이름(전 언어 부분 일치)·캐릭터 id·resourceId·nameCode |
| `element` `class` `burst` `corporation` `weapon` `rarity` | 선택. [GET /api/nikkes](#get-apinikkes)와 동일한 필터 — AND 결합. 상세가 필요하면 [GET /api/user/:blablaid/nikke/:key](#get-apiuserblablaidnikkekey) 사용 |
| `fields` | 선택. 응답 필드 선택 (`nikkes[]` 각 항목에 적용) |

```
GET /api/user/<blablaid>/nikke              # 보유 전체 목록
GET /api/user/<blablaid>/nikke?q=아니스      # 아니스 계열만 필터 (목록 형태 유지)
GET /api/user/<blablaid>/nikke?q=201601     # id/nameCode로 필터
GET /api/user/<blablaid>/nikke?element=Iron&burst=III  # 도감과 동일한 속성 필터
```

구형 쿼리 형태 `GET /api/user/nikke?blablaid=...`·`?openid=`도 동일하게 동작합니다.

응답 항목 (전투력 내림차순):

```json
{
  "count": 3,
  "nikkes": [
    {
      "character": { "nameCode": 5169, "id": 3017, "name": { "ko": "아니스 : 스타", ... }, "image": "..." },
      "level": 248,
      "combat": 71153,
      "grade": 0,
      "core": 0
    }
  ]
}
```

## GET /api/user/:blablaid/nikke/:key

보유 니케 **한 명**의 상세를 조회합니다 — 장비·옵션·큐브·소장품·스킬 레벨까지 포함. 매칭 방식은 [GET /api/nikkes/:id](#get-apinikkesid)와 동일합니다.

| `:key` | 매칭 방식 |
|--------|----------|
| 니케 이름 | 부분 일치(전 언어, 대소문자·공백·`:` 무시) — `아니스`로 조회하면 보유한 아니스 계열 전부 매칭 |
| 숫자 | 캐릭터 id · resourceId · nameCode 중 일치 |

매칭이 정확히 1명이면 상세 객체를, 복수면 목록(`{count, nikkes[]}`)을 반환합니다. `?fields=`로 상세 객체(또는 목록 항목)를 선택적으로 잘라낼 수 있습니다.

```
GET /api/user/<blablaid>/nikke/아니스%20%3A%20스타   # 이름 (URL 인코딩)
GET /api/user/<blablaid>/nikke/3017                # 캐릭터 id
```

구형 쿼리 형태 `GET /api/user/nikke/:key?blablaid=...`·`?openid=`도 동일하게 동작합니다.

응답 항목 형태:

```json
{
  "character": { "nameCode": 1021, "id": 220401, "name": { "ko": "...", ... }, "image": "..." },
  "level": 1,
  "combat": 65721,
  "arenaCombat": 67169,
  "grade": 2,
  "core": 0,
  "costume": null,
  "skills": { "skill1": 7, "skill2": 10, "burst": 10 },
  "attractiveLevel": 30,
  "favoriteItem": { "id": 201701, "level": 2, "name": { "ko": "...", ... } },
  "cube": { "id": 1000311, "level": 3, "name": { "ko": "...", ... } },
  "arenaCube": null,
  "equipment": {
    "head": {
      "tid": 3121001,
      "name": { "ko": "ν 매터 바이저", "en": "V Matter Visor", ... },
      "class": "Attacker",
      "rare": "T10",
      "icon": "https://.../icn_equipment_head_attacker_t9_3.webp",
      "tier": 10,
      "level": 5,
      "corporation": null,
      "options": [
        {
          "id": 7000514,
          "name": { "ko": "[우월코드 대미지 증가]", ... },
          "rank": 4,
          "value": { "type": "StatAtk", "value": 10.52, "unit": "%" }
        }
      ]
    },
    "torso": { "...": "..." },
    "arm":   { "...": "..." },
    "leg":   { "...": "..." }
  }
}
```

| 필드 | 설명 |
|------|------|
| `costume` | 착용 코스튬 — `id`, `skinIndex`, `name`(4개 언어), 해당 코스튬 아이콘 포함 캐릭터 정보. 미착용 시 `null` |
| `equipment.*` | 부위별 장비 — `name`(4개 언어)·`class`·`rare`·`icon`은 `ItemEquipTable`에서 해석 |
| `equipment.*.corporation` | 기업 장비 여부 (`ELYSION` 등, 비기업 장비는 `null`) |
| `equipment.*.options[]` | 장비 옵션 — `id`, 옵션 종류 `name`(4개 언어), `rank`(같은 종류 내 등급), `value`({type, value, unit}) — 실제 수치는 업스트림 `state_effects`에서 해석 |

- `key`가 매칭되지 않으면 404 `{"error": "not found"}`.
- 이름은 부분 일치가 아닌 **정확 일치**입니다 — `라피`는 base 캐릭터만, 스킨 캐릭터는 `라피 : 레드 후드`로 지정.
- 장비 `tid`/옵션 `id`는 내부 아이템 코드입니다 (원본 테이블은 `/api/tables/ItemEquipTable_ko.json` 참고).

## GET /api/cdn

BlablaLink CDN 리소스 경로를 실제 URL로 변환합니다.

```
GET /api/cdn?path=character/ko/nikke_list_v2.json
```

```json
{
  "path": "character/ko/nikke_list_v2.json",
  "url": "https://sg-tools-cdn.blablalink.com/wi-97/ni-77/ffc69c4074f27bc772acbe869127e616.json"
}
```

`path`에 `..`가 포함되면 400.

---

## 공통: 필드 선택 `?fields=`

다음 엔드포인트는 `?fields=`로 응답 객체를 필요한 필드만 남길 수 있습니다. 콤마로 구분하며, 점(`.`)으로 중첩 필드를 지정합니다. 목록 응답은 각 항목에 적용되고 `count` 등 래퍼 필드는 유지됩니다.

| 엔드포인트 | 적용 대상 |
|-----------|----------|
| `/api/nikkes` | `characters[]` 각 항목 |
| `/api/nikkes/:id` | 상세 객체 (복수 매칭 시 `characters[]` 각 항목) |
| `/api/scenes` | `scenes[]` 각 항목 |
| `/api/scenes/:groupId` | 씬 객체 (`groupId`·`lines` 등) |
| `/api/favorites` | `favorites[]` 각 항목 |
| `/api/favorites/:id` | 상세 객체 |
| `/api/cubes` | `cubes[]` 각 항목 |
| `/api/cubes/:id` | 상세 객체 |
| `/api/user/:blablaid/nikke` | `nikkes[]` 각 항목 (구형 `?blablaid=` 경로도 동일) |
| `/api/user/:blablaid/nikke/:key` | 상세 객체 (복수 매칭 시 `nikkes[]` 각 항목) |

```
GET /api/nikkes?fields=id,name.ko,element
GET /api/nikkes/라피?fields=id,details.skills
GET /api/scenes/d_ex_armory_01?fields=groupId,lines
GET /api/cubes?fields=id,name.ko
GET /api/user/<blablaid>/nikke/라피?fields=character,level,equipment
```

```json
{ "count": 202, "characters": [{ "id": 1, "name": { "ko": "..." }, "element": "Fire" }] }
```

---

## 공통: 언어 선택 `?lang=`

모든 JSON 응답에 적용됩니다 — `/api/favorites/:id`·`/api/cubes/:id`·`/api/scenes/:groupId`·`/api/tables/:file`처럼 파일을 그대로 내려주는 엔드포인트도 포함입니다. `name`·`description`·`descriptions` 등 `{ko,en,ja,zh-TW}` 형태의 다국어 객체가 지정 언어 문자열 하나로 평탄화됩니다.

| 값 | 결과 |
|----|------|
| `ko` / `en` / `ja` / `zh-TW` | `"name": {ko:"라피",en:"Rapi",...}` → `"name": "라피"` |
| 미지정 또는 지원 외 값 | 4개 언어 객체 그대로 |

해당 언어 값이 없는 필드는 `ko`→`en`→첫 번째 값 순으로 폴백합니다. `?fields=`와 함께 사용하면 먼저 필드를 자른 뒤 평탄화됩니다.

```
GET /api/nikkes?q=라피&lang=ko
GET /api/favorites/200101?lang=en
```

---

## 공통: 캐시 헤더

데이터는 재배포 시에만 바뀌므로 성공(200) 응답에 다음 헤더가 붙습니다.

- `Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400`
- `ETag: W/"..."` — 데이터 버전(`syncedAt`) + 요청 URL 기준. `If-None-Match`로 요청하면 변경이 없을 때 `304 Not Modified`를 반환합니다.

`/api/user/*` 엔드포인트는 라이브 데이터(BlablaLink 업스트림 조회)라 캐시하지 않습니다 — 항상 `Cache-Control: no-store`가 붙고 ETag도 발급되지 않습니다.

---

## 에러 응답

| 상황 | 상태 | 본문 |
|------|------|------|
| 캐릭터 없음 | 404 | `{"error": "not found"}` |
| 잘못된 파일명/파라미터 | 400 | `{"error": "invalid file"}` / `{"error": "path required"}` |
