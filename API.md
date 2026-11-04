# API 문서

베이스 URL: `https://nikke-api.pages.dev`

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
- [GET /api/events](#get-apievents) — 스토리 이벤트 목록
- [GET /api/events/:id](#get-apieventsid) — 이벤트 상세 (에피소드 씬 목록)
- [GET /api/events/:id/script](#get-apieventsidscript) — 이벤트 전체 대본 (에피소드별)
- [GET /api/lines](#get-apilines) — 대사 검색 (본문·화자)
- [GET /api/nikkes/:id/appearances](#get-apinikkesidappearances) — 캐릭터 등장 씬·이벤트
- [GET /api/story/route](#get-apistoryroute) — 스토리 감상 순서
- [GET /api/story/next](#get-apistorynext) — 다음에 볼 스토리 추천
- [GET /api/stages](#get-apistages) — 캠페인 스테이지 목록
- [GET /api/stages/:id](#get-apistagesid) — 스테이지 상세
- [GET /api/costumes](#get-apicostumes) — 코스튬 목록
- [GET /api/costumes/:id](#get-apicostumesid) — 코스튬 상세
- [GET /api/equips](#get-apiequips) — 장비 아이템 목록
- [GET /api/equips/options](#get-apiequipsoptions) — 장비 옵션 목록
- [GET /api/equips/options/:id](#get-apiequipsoptionsid) — 장비 옵션 상세
- [GET /api/equips/:id](#get-apiequipsid) — 장비 아이템 상세
- [GET /api/avatars](#get-apiavatars) — 아바타 아이콘 목록
- [GET /api/avatars/:iconId](#get-apiavatarsiconid) — 아바타 상세
- [GET /api/favorites](#get-apifavorites) — 소장품 목록
- [GET /api/favorites/:id](#get-apifavoritesid) — 소장품 상세 (레벨별 스탯·스킬)
- [GET /api/cubes](#get-apicubes) — 하모니 큐브 목록
- [GET /api/cubes/:id](#get-apicubesid) — 큐브 상세 (레벨별 스탯·스킬)
- [GET /api/user](#get-apiuser) — 유저 프로필 조회 (공유 링크)
- [GET /api/user/:blablaid/nikke](#get-apiuserblablaidnikke) — 유저 보유 니케 목록 (경량)
- [GET /api/user/:blablaid/nikke/:nameOrId](#get-apiuserblablaidnikkenameorid) — 유저 보유 니케 상세 (이름 부분 일치/id)
- [GET /api/user/:blablaid/nikke-builds](#get-apiuserblablaidnikke-builds) — 유저 보유 니케 여러 명의 상세 일괄 조회
- [GET /api/user/:blablaid/roster](#get-apiuserblablaidroster) — 유저 보유 니케 전체 로스터 (업스트림 원시 형태)
- [GET /api/cdn](#get-apicdn) — CDN 경로 → URL 변환
- [MCP `/mcp`](#mcp-mcp) — ChatGPT/Claude 커넥터용 MCP 서버
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
| `family` | `1`이면 검색된 캐릭터의 다른 버전(원본·이격)까지 함께 반환 — 아래 [이격 연결](#이격-연결) | `?q=레드 후드&family=1` |
| `element` | 속성 | `Electronic`, `Iron`, `Fire`, `Wind`, `Water` |
| `class` | 클래스 | `Attacker`, `Defender`, `Supporter` |
| `burst` | 버스트 스텝 | `I`, `II`, `III`, `All` |
| `corporation` | 소속 | `MISSILIS`, `ELYSION`, `TETRA`, `PILGRIM`, `ABNORMAL` |
| `weapon` | 무기 종류 | `RL`, `SMG`, `SG`, `SR`, `AR`, `MG` |
| `rarity` | 레어도 | `SSR`, `SR`, `R` |
| `limit` | 반환 개수 제한 (최대 500, 미지정 시 전체) | `?limit=50` |
| `page` | 페이지 번호 (1부터, `offset` 대신 사용 — page와 offset 동시 지정 시 page 우선) | `?page=2` |
| `offset` | 시작 위치 (페이지네이션) | `?offset=50` |
| `fields` | 응답 필드 선택 (각 항목에 적용) | `?fields=id,name.ko` |

모든 필터는 AND로 결합되며 대소문자를 구분하지 않습니다.

**페이지네이션**: 필터가 먼저 적용된 뒤 `offset`/`limit`으로 잘립니다. `count`는 잘라내기 전 필터링된 전체 개수이고, `offset`은 실제 적용된 시작 위치가 응답에 포함됩니다. `offset`이 범위를 넘으면 빈 배열이 반환됩니다.

`?page=N`(1부터)으로도 페이지를 넘길 수 있습니다 — `offset` 대신 `(page-1) * limit`이 적용되고 응답에 `page`·`totalPages`가 추가됩니다. `limit` 없이 `page`만 주면 페이지 크기 50이 기본 적용됩니다. 페이지네이션 지원 목록(`/api/nikkes`, `/api/scenes`, `/api/events`, `/api/stages`, `/api/costumes`, `/api/equips`, `/api/equips/options`, `/api/avatars`, `/api/favorites`, `/api/cubes`)에서 동일하게 동작합니다.

`page`·`limit`·`offset`이 정수가 아니거나 음수이면(`page`는 0 포함) `400 invalid <param>`이 반환됩니다.

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
    "attractiveScenarios": [
      { "id": 871, "sceneGroupId": "d_nikke_neon_visioneye_01", "level": 1,
        "title": { "ko": "다시 아우터림으로", "...": "..." },
        "costumeTid": null, "rewardId": 50 }
    ],
    "favoriteStory": { "sceneGroupId": "d_favorite_sugar", "name": "파트너", "sourceVideo": "https://youtu.be/cQoTpjl3XjI" },
    "voices": [
      {
        "id": 120001,
        "costumeIndex": 0,
        "categoryGroup": 1,
        "order": 101,
        "isTeaser": true,
        "conditionAttractiveLevel": 1,
        "speechId": "c012_Lobby_Touch_1",
        "label": { "ko": "로비 터치 I", ... },
        "text": { "ko": "믿는 버릇을 들이라고? 하하. 농담도.", ... },
        "voice": { "ko": ".../c012_Lobby_Touch_1.mp3", "en": "...", "ja": "..." }
      }
    ],
    "shot": {
      "id": 1010001,
      "weaponType": "RL",
      "attackType": "Metal",
      "name": { "ko": "런처", "en": "Rocket Launcher", ... },
      "descriptionTemplate": { "ko": "■ 대상에게\n[공격력 {damage}% 대미지] ...", ... },
      "damage": 63.11,
      "shotCount": 1, "maxAmmo": 6,
      "reloadTime": 2.33,
      "rateOfFire": 60, "endRateOfFire": 60,
      "burstEnergyPershot": 14500,
      "targetBurstEnergyPershot": 29000,
      "chargeTime": 1,
      "fullChargeDamage": 250,
      "fullChargeBurstEnergy": 25000,
      "coreDamageRate": 200,
      "accuracyCircle": { "start": 10, "end": 10, "changePershot": 0, "changeSpeed": 0,
        "autoStart": 10, "autoEnd": 10, "autoChangePershot": 0, "autoChangeSpeed": 0 },
      "preferTarget": "TargetGL", "shotTiming": "Concurrence",
      "fireType": "ProjectileDirect", "inputType": "UP",
      "spotFirstDelay": 0.2, "spotLastDelay": 0.2, "spotProjectileSpeed": 300,
      "spotRadius": 50, "spotRadiusObject": 2, "spotExplosionRange": 500
    },
    "statEnhance": {
      "id": 5105,
      "limitBreak": { "ratio": 200, "hp": 3000, "attack": 20, "defence": 100,
        "energyResist": 0, "metalResist": 0, "bioResist": 0 },
      "core": { "hp": 200, "attack": 200, "defence": 200,
        "energyResist": 0, "metalResist": 0, "bioResist": 0 }
    }
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

### `attractiveScenarios[]` 필드

호감도 시나리오 목록 — `sceneGroupId`가 `/api/scenes/:groupId`의 대본 파일과 1:1 대응합니다. `level`은 해금에 필요한 호감도 레벨, `costumeTid`는 시나리오에서 착용하는 코스튬(`/api/costumes/:id`로 조회, 없으면 `null`).

```
GET /api/nikkes/101801?fields=details.attractiveScenarios
→ sceneGroupId로 GET /api/scenes/d_nikke_neon_visioneye_01 → 대사
```

### `favoriteStory` 필드

애장품 스토리가 있는 니케(21명)에만 있습니다. `sceneGroupId`로 `/api/scenes/:groupId`에서 대본을 읽습니다. 이름이 정확히 같은 니케에만 연결되어, 이격 버전에는 붙지 않습니다.

### `voices[]` 필드

캐릭터 대사/보이스 목록 (로비 터치, 전투 진입·승리, 호감도 구간 대사 등). `label`은 대사 종류(언어별), `text`는 대사 텍스트(언어별), `voice`는 ko/en/ja 음성 mp3 URL (zh-TW 보이스는 존재하지 않음). `conditionAttractiveLevel`은 대사 해금에 필요한 호감도 레벨. `costumeIndex`는 대사가 속한 코스튬 (`0`=기본 외형, `1`이상은 `costumes[].skinIndex`와 대응 — 코스튬별 별도 대사가 있는 캐릭터가 66명 있습니다).

### `shot` 필드

캐릭터별 무기 스펙 (roledata `shot_detail`). 시간 계열은 초, 대미지 계열은 %로 정규화되어 있고, 버스트 게이지 값들은 **게이지 유닛 원시값**입니다 (÷10000 → 게이지 %; 풀 게이지 = 1,000,000 유닛).

| 필드 | 설명 |
|------|------|
| `damage` | 샷당 공격력 % |
| `burstEnergyPershot` / `targetBurstEnergyPershot` | 샷당 버스트 게이지 — «대상» 기준은 `target*` 쪽 (÷10000 → %) |
| `chargeTime` / `fullChargeDamage` / `fullChargeBurstEnergy` | 풀차지 시간(초)·배율·게이지 |
| `rateOfFire` / `endRateOfFire` | 분당 발사 수 |
| `reloadTime` / `reloadBullet` / `reloadStartAmmo` | 재장전 |
| `accuracyCircle` | 명중률 서클 (수동/자동 각각) |
| `coreDamageRate` / `penetration` | 코어 대미지 %·관통 |
| `preferTarget` / `preferTargetCondition` / `shotTiming` / `fireType` / `inputType` | 사격·타겟팅 메타 |
| `spot*` | 발사 지연·탄속·범위 |

### `statEnhance` 필드

돌파(grade)와 코어 강화 보너스 — roledata `stat_enhance_detail`. 값은 **원시 게임 유닛**입니다 (÷100 → 표시값). `limitBreak`는 돌파 1단계당 보너스, `core`는 코어 강화 1단계당 보너스. id는 레어도 대역으로 공유됩니다 (1xxx=R, 3xxx=SR, 5xxx=SSR — 같은 대역 내 값 동일).

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

`/api/nikkes` 필터에 사용 가능한 값 목록을 반환합니다. 스테이지·코스튬·장비 엔드포인트의 필터 값도 함께 포함됩니다.

```json
{
  "elements": ["Electronic","Iron","Fire","Wind","Water"],
  "classes": ["Attacker","Defender","Supporter"],
  "bursts": ["III","II","I","All"],
  "corporations": ["MISSILIS","ELYSION","TETRA","PILGRIM","ABNORMAL"],
  "weapons": ["RL","SMG","SG","SR","AR","MG"],
  "rarities": ["SSR","SR","R"],
  "stageModes": ["Normal","Hard","Story"],
  "stageChapters": [1, 2, ..., 40],
  "costumeGrades": ["Special","Normal","Event"],
  "equipClasses": ["Attacker","Defender","Supporter","All"],
  "equipRares": ["T7","T8","T9","T10"],
  "equipSlots": ["head","body","arm","leg"],
  "equipOptionRanks": [1, 2, 3]
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

스토리 씬 목록을 반환합니다 (한국어). 메인/이벤트/돌발 스토리 + **호감도(Attractive) 시나리오** + **애장품 스토리 21편** + **게임 데이터에 없는 스토리(`library`) 약 2000편** 포함 — 약 5300개 그룹.

### 쿼리 파라미터

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 그룹 ID·씬 이름 부분 일치 | `?q=발신자` |
| `category` | 카테고리 필터 | `main` / `event` / `sudden` / `attractive` / `favorite` / `library` |
| `nikke` | 호감도·애장품 씬과 `library`의 캐릭터 에피소드·개인 메신저 대상 니케 이름 부분 일치 | `?nikke=아니스` |
| `family` | `1`이면 `nikke`를 그 캐릭터의 모든 버전(원본·이격) 이름과 정확히 매칭 | `?nikke=라피 : 레드 후드&family=1` |
| `limit` | 반환 개수 제한 (최대 500) | `?limit=50` |
| `page` | 페이지 번호 (1부터, `offset` 대신 사용 — page와 offset 동시 지정 시 page 우선) | `?page=2` |
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
| `groupId` | 시나리오 그룹 ID (`d_main_*` 메인, `event_*` 이벤트, `d_ex_*` 돌발, `d_nikke_*` 호감도, `d_favorite_*` 애장품, `lib_*` 게임 데이터에 없는 스토리) |
| `name` | 씬 이름 (한국어) |
| `lines` | 대사 수 |
| `category` | `main` / `event` / `sudden` / `attractive` / `favorite` / `library` / `etc` |
| `type` | `"attractive"`이면 호감도 시나리오, `"favorite"`이면 애장품 스토리, `"library"`이면 게임 데이터에 없는 스토리 (일반 스토리는 없음) |
| `nikke` | 대상 니케 (호감도·애장품, `library`의 캐릭터 에피소드·개인 메신저) |
| `level` | 필요 호감도 레벨 (호감도만) |
| `sourceVideo` | 대본을 옮긴 원본 영상 주소 (애장품만) |
| `collection` | 묶음 이름, 예: `ARK RANGER` (`library`만) |
| `libraryCategory` | `blabla`(메신저) / `lost_relics` / `event_lost_relics` / `side_stories` / `sub_quests` / `event_stories` / `special_stories` / `character_episodes` / `main_story` (`library`만) |
| `chapter` / `chapterStep` | 게임 챕터 번호와 챕터 안 순서 (메인만) |

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
| `lines[].text` | 대사 텍스트 — `window`가 `SubScenario`인 연출 마커에서는 `null`. `@UserName`은 지휘관 이름 자리표시자(전체 218줄)이며 `@UserName님`처럼 조사가 붙은 형태도 있음 |
| `lines[].window` | 말풍선 타입 (`Speech`, `Choice`, `Narration` 등) — `SubScenario`는 컷신·영상 등 서브씬 연출 마커 (대사 아님, `id`가 에셋 이름) |
| `lines[].speakerIcon` | 화자 아이콘 이미지 URL (화자가 캐릭터로 매핑될 때 존재, NPC 포함) |
| `lines[].voice` | 해당 대사의 한국어 보이스 mp3 URL. 보이스가 없는 씬에서는 `null` |
| `lines[].background` / `lines[].bgm` | 배경·BGM 리소스 코드 (호감도 씬에만 존재) |

호감도 씬(`groupId`가 `d_nikke_*`)은 상단에 `type: "attractive"`, `nikke`, `attractiveLevel` 필드가 추가로 붙습니다.

캐릭터별 호감도 씬은 `/api/nikkes/:id` 상세의 `details.attractiveScenarios[].sceneGroupId`로 연결됩니다. 스킨 캐릭터(예: `아니스 : 스타`)는 자기 전용 그룹(`d_nikke_anis_star_*`)을 가지며, `?nikke=` 필터는 부분 일치라 `아니스`로 검색하면 모든 스킨 버전이 함께 나옵니다.

애장품 스토리(`d_favorite_*`, `GET /api/scenes/d_favorite_sugar`)는 게임 데이터에 없어 공개 영상 화면을 OCR로 옮긴 대본입니다. 오탈자가 있을 수 있고, 상단에 `type: "favorite"`, `nikke`, `sourceVideo`가 붙습니다. `window`는 `Speech`·`Self`·`Narration`·`Choice`뿐이고, 고른 선택지에만 `chosen: true`가 있으며 그 뒤 대사는 고른 분기만 있습니다. 자세한 내용은 [`content/favorite-stories/README.md`](content/favorite-stories/README.md)에 있습니다.

`library` 스토리(`lib_*`, `GET /api/scenes/lib_ark_ranger_00`)는 게임 데이터에 없는 메신저·유실물·사이드 스토리·서브 퀘스트·이벤트로, 커뮤니티 기록에서 가져옵니다. 기록에 아직 없는 `MARIA-n`(`lib_maria_n_*`)은 공개 영상 화면을 OCR로 옮겨 상단에 `sourceVideo`가 있고, 고르는 선택지가 없는 1부까지 있습니다. 이미 게임 데이터에 있는 장면은 빌드할 때 대사를 비교해 제외합니다. `speakerName`만 있고 `speaker`·`speakerIcon`·음성은 없으며, `window`는 `Speech`·`Self`·`Narration`·`Choice`입니다. 선택지 안의 줄에는 `branch`(`"<블록>.<옵션>"`, 중첩되면 이어 붙임)가 있으니 한 분기만 따라 읽습니다. `event_stories`·`side_stories`·`special_stories` 묶음은 `/api/events`에도 `source: "library"`로 나오고, `/api/events/:id/script`에서는 분기 줄 앞에 `[1.1]`, 선택지 앞에 `[선택지 1.1]`이 붙습니다. 다음 장면이 선택에 따라 갈리면 상단 `next`(`ifChoice`·`option`·`groupId`)에, 그 선택지 줄에는 `choiceId`·`optionValue`가 있습니다.

## GET /api/events

스토리 이벤트 카탈로그 — `event_*` 씬 그룹을 이벤트 단위로 묶은 목록입니다 (약 100개). groupId의 에피소드 접미사(`_01`/`_01_e`/`_prologue`/`_intermission` 등)를 제거해 이벤트 id를 만듭니다. 각 이벤트에는 `title`이 붙습니다 — 소스 데이터에 이벤트 이름이 없어 큐레이션 맵(`scripts/event-titles.json`)으로 제공합니다.

### 쿼리 파라미터

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 이벤트 id **또는 title** 부분 일치 | `?q=brandnewyear`, `?q=coin rush` |
| `limit` / `offset` / `page` / `fields` / `lang` | 목록 공통 | |

### 응답 예시

```json
{
  "count": 100,
  "events": [
    {
      "id": "event_firstaffection",
      "title": "FIRST AFFECTION",
      "episodes": 8,
      "totalLines": 412,
      "source": "archive_list",
      "scenes": ["event_firstaffection_01", "..."]
    }
  ]
}
```

`source`는 이벤트 씬 그룹을 발견한 ko 목록 파일입니다 — `scene_list` / `sudden_list` / `archive_list` / `scene_archive_list` 중 하나 (scene/ 쪽 archive_list는 `event_ce004` 같은 신규 콜라보 이벤트만 담고 있습니다). 구 dist 데이터나 목록에 없는 그룹에는 필드가 없습니다.

## GET /api/events/:id

이벤트 상세 — 타이틀과 에피소드별 씬 목록(`groupId`·`name`·`lines`)을 반환합니다.

```
GET /api/events/event_nonsensered
```

```json
{
  "id": "event_nonsensered",
  "title": "NONSENSE RED",
  "episodes": 7,
  "totalLines": 389,
  "source": "archive_list",
  "scenes": [
    { "groupId": "event_nonsensered_1", "name": "추억은 흐르는 음악처럼", "lines": 55 }
  ]
}
```

## GET /api/events/:id/script

이벤트 하나의 대본 전체를 에피소드 순서대로 반환합니다. 대사는 `"화자: 대사"` 문자열이고 내레이션은 대사만 들어갑니다. `SubScenario` 연출 마커 줄은 대사가 아니라 응답에서 빠집니다. 에피소드 단위로 `offset`/`limit`/`page`를 받습니다.

```
GET /api/events/event_BunnyX777/script?limit=1
```

```json
{
  "id": "event_BunnyX777",
  "title": "BUNNY X 777",
  "count": 15,
  "offset": 0,
  "episodes": [
    {
      "groupId": "event_BunnyX777_01_e",
      "name": "토끼들의 부탁 : B",
      "lines": ["쌍둥이들의 부탁을 받고 코인 러시의 게임 마스터, 루주를 찾아갔다.", "루주: 어서 오세요, 플레이어님."]
    }
  ]
}
```

## GET /api/lines

모든 씬(메인·이벤트·돌발·호감도·애장품·`library`)의 대사를 검색합니다. `q`와 `speaker` 중 하나는 필요합니다. 처음 호출할 때 대본 전체를 한 번 읽어 메모리에 올립니다.

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 대사 본문 부분 일치 (문장부호·공백 무시) | `?q=방주의 영웅` |
| `speaker` | 화자 이름 부분 일치 (한국어, `라피`는 `라피 : 레드 후드`도 잡음) | `?speaker=라피` |
| `family` | `1`이면 `speaker`를 그 캐릭터의 모든 버전 이름으로 확장 | `?speaker=라피&family=1` |
| `category` | 씬 카테고리 | `main` / `event` / `sudden` / `attractive` / `favorite` / `library` |
| `limit` / `page` / `offset` | 페이지네이션 | `?limit=20` |

```json
{
  "count": 5,
  "offset": 0,
  "lines": [
    {
      "groupId": "d_main_34_05",
      "line": 93,
      "speaker": "네온",
      "text": "스승님은 지금 방주의 희망, 방주의 영웅, 방주 최강의 지휘관으로 불리고 있잖아요?",
      "scene": { "name": "계승의 의미", "category": "main" }
    }
  ]
}
```

이벤트 씬이면 `scene.event`(`id`·`title`)가 붙습니다. `line`은 씬 `lines[]` 안의 줄 번호(0부터)입니다 — `/api/events/:id/script`와 MCP 읽기 출력에서 빠지는 `SubScenario` 마커도 자리를 차지하므로 씬 파일의 위치 그대로 가리킵니다.

## GET /api/nikkes/:id/appearances

캐릭터가 대사를 하는 모든 씬을 대사 수가 많은 순으로 반환합니다. 원본과 이격을 한 캐릭터로 묶어 셉니다. `events`는 씬을 이벤트 단위로 합친 순위입니다. `:id`는 `/api/nikkes/:id`처럼 id·resourceId·이름을 받습니다.

| 파라미터 | 설명 |
|----------|------|
| `category` | 씬 카테고리 필터 |
| `limit` / `page` / `offset` | `scenes`의 페이지네이션 (`events`는 항상 전체) |

```json
{
  "family": { "base": "아니스", "members": [{ "id": 301201, "name": { "ko": "아니스" } }] },
  "count": 752,
  "offset": 0,
  "events": [{ "id": "event_staranis1", "title": "STAR ANIS I", "scenes": 13, "lines": 522 }],
  "scenes": [
    { "groupId": "event_staranis1_05_e", "lines": 107, "name": "플라스틱 별 : B", "category": "event", "event": { "id": "event_staranis1", "title": "STAR ANIS I" } }
  ]
}
```

## GET /api/story/route

메인 챕터 사이에 이벤트·사이드 스토리·호감도 스토리를 끼워 넣은 감상 순서입니다. 순서와 필수/선택 구분은 아카라이브 니케 채널에서 쓰이는 커뮤니티 가이드([ssissun.github.io/nikke-storyline](https://ssissun.github.io/nikke-storyline/))를 따르고, 다른 가이드와 배치가 갈리는 곳은 `note`에 적었습니다. 큐레이션 데이터는 [`src/story-route.ts`](src/story-route.ts)에 있습니다.

- 챕터 번호는 게임 기준(0부터)입니다. 씬은 게임의 씬 목록으로 챕터에 연결합니다. `d_main_NN`은 대체로 NN챕터이지만, 0·1챕터는 모두 `d_main_01_*`이고 24·26·28챕터의 후일담 일부는 다음 챕터에 속합니다. 메인 씬의 `chapter`·`chapterStep`이 그 결과입니다.
- 항목 하나가 여러 이벤트 id를 묶을 수 있습니다 (예: `OVER ZONE` → `event_overzone1`, `event_overzone2`).
- `inData: false`인 항목은 이 API에 대본이 없습니다 (사이드 스토리, 아카이브에 없는 최신 이벤트).
- `unplaced`는 가이드가 배치하지 않은 이벤트(주로 시즌 이벤트)입니다.
- 게임 데이터에 없던 이벤트·사이드 스토리는 `library`에 같은 제목이 있으면 `ids`에 그 이벤트(`lib_*`)가 들어가고 `inData: true`입니다. 게임 데이터에 일부만 있는 이벤트(`LAST KINGDOM`)는 양쪽 id가 함께 들어갑니다.
- 애장품 스토리(`kind: "favorite"`, `firstScene`이 대본)는 가이드에 없어 모든 챕터 뒤에 선택 항목으로 붙습니다. 줄거리상 위치를 뜻하지 않습니다.

```json
{
  "sources": { "S": { "title": "NIKKE 스토리 감상 순서 가이드", "url": "https://ssissun.github.io/nikke-storyline/" } },
  "coverageChapter": 50,
  "count": 87,
  "entries": [
    { "step": 0, "kind": "main", "key": "chapter:0", "chapter": 0, "title": "메인 0챕터", "required": true, "scenes": 12, "firstScene": "d_main_01_01_e", "inData": true },
    { "step": 21, "kind": "event", "key": "event_overzone1", "ids": ["event_overzone1", "event_overzone2"], "title": "OVER ZONE", "required": true, "episodes": 27, "inData": true, "note": "0.5주년. ..." }
  ],
  "unplaced": [{ "id": "event_BunnyX777", "title": "BUNNY X 777", "episodes": 15 }]
}
```

## GET /api/story/next

감상 순서에서 다음에 볼 스토리를 돌려줍니다. `chapter`나 `after` 중 하나가 필요합니다.

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `chapter` | 마지막으로 끝낸 메인 챕터 (게임 기준, `-1`은 처음부터) | `?chapter=24` |
| `after` | 방금 끝낸 항목 — 제목·이벤트 id·챕터 번호 | `?after=LAST KINGDOM` |
| `done` | 이미 본 것 (콤마 구분, 제목·이벤트 id·챕터 번호) | `?done=RED ASH,event_overzone1` |
| `required` | `1`이면 선택 스토리 제외 | `?required=1` |
| `limit` | 개수 (기본 5, 최대 20) | `?limit=10` |

`next`는 순서대로 다음 항목들이고, `missed`는 `done`을 줬을 때만 채워지는 "현재 위치보다 앞에 있는데 안 본 필수 스토리"입니다.

## GET /api/stages

캠페인 스테이지 목록을 반환합니다 (약 4,400개 — 메인 Normal/Hard + Story 스테이지).

### 쿼리 파라미터

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 스테이지 이름 부분 일치 | `?q=0-1` |
| `chapter` | 챕터 번호 필터 | `?chapter=12` |
| `mode` | 난이도 필터 | `Normal` / `Hard` / `Story` |
| `limit` | 반환 개수 제한 (최대 500) | `?limit=100` |
| `page` | 페이지 번호 (1부터) | `?page=3` |
| `offset` | 시작 위치 (페이지네이션) | `?offset=100` |
| `fields` | 응답 필드 선택 (각 항목에 적용) | `?fields=id,name,battlePower` |

```
GET /api/stages?chapter=1&mode=Normal
GET /api/stages?mode=Hard&limit=50
```

```json
{
  "count": 82,
  "offset": 0,
  "stages": [
    {
      "id": 6000001,
      "chapter": 1,
      "mode": "Normal",
      "battlePower": 110,
      "name": "0-1 STAGE",
      "scenarios": { "enter": "d_main_01_01_s", "exit": "d_main_01_01_e" }
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `id` | 스테이지 ID |
| `chapter` | 챕터 번호 |
| `mode` | `Normal` / `Hard` / `Story` |
| `battlePower` | 권장 전투력 |
| `name` | 스테이지 표시 이름 (`"0-1 STAGE"` 등) |
| `scenarios.enter` / `scenarios.exit` | 입장·클리어 시나리오 그룹 ID — `/api/scenes/:groupId`로 대본 조회 가능. 없으면 `null` |

**에러**

| 상황 | 상태 |
|------|------|
| `chapter`가 숫자가 아님 | 400 `{"error": "invalid chapter"}` |

## GET /api/stages/:id

스테이지 ID로 단건 조회합니다. 응답 형태는 목록의 `stages[]` 항목과 동일합니다.

```
GET /api/stages/6000001
GET /api/stages/6000001?fields=id,name,battlePower
```

**에러**

| 상황 | 상태 |
|------|------|
| `id`가 숫자가 아님 | 400 `{"error": "invalid id"}` |
| 해당 스테이지 없음 | 404 `{"error": "not found"}` |

## GET /api/costumes

코스튬 목록을 반환합니다 (costume_map 기준 — 182종). 각 항목에 소유 니케 정보와 이미지가 붙습니다.

### 쿼리 파라미터

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 코스튬 이름 부분 일치 (전 언어) | `?q=ocean` |
| `grade` | 등급 필터 | `Special` / `Event` / `Normal` 등 |
| `nikke` | 소유 니케 필터 — 이름 부분 일치 또는 id/resourceId | `?nikke=라피`, `?nikke=80` |
| `limit` | 반환 개수 제한 (최대 500) | `?limit=50` |
| `page` | 페이지 번호 (1부터, `offset` 대신 사용 — page와 offset 동시 지정 시 page 우선) | `?page=2` |
| `offset` | 시작 위치 (페이지네이션) | `?offset=50` |
| `fields` | 응답 필드 선택 (각 항목에 적용) | `?fields=id,name.ko,grade` |
| `lang` | 다국어 필드 평탄화 | `?lang=ko` |

```
GET /api/costumes?nikke=센티
GET /api/costumes?grade=Special&limit=20
```

```json
{
  "count": 182,
  "offset": 0,
  "costumes": [
    {
      "id": 10012,
      "name": { "ko": "오션 리페어", "en": "Ocean Repair", "ja": "...", "zh-TW": "..." },
      "description": { "ko": "센티의 코스튬\n미션 패스에서 획득", "...": "..." },
      "grade": "Special",
      "costumeIndex": 2,
      "images": { "icon": "https://...", "medium": "https://...", "full": "https://..." },
      "character": { "id": 108001, "resourceId": 80, "name": { "ko": "센티", "...": "..." }, "rarity": "SSR" },
      "storyScenes": ["event_firstaffection_01", "..."]
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `id` | 코스튬 tid — `/api/user/...`의 `costume.id`·`costume_tid`와 같은 값 |
| `costumeIndex` | 아바타/스킨 인덱스 — `/api/avatars`의 `costumeIndex`와 대응 |
| `images` | 코스튬 아이콘/중간/전신 이미지 (캐릭터 데이터에 없으면 `null`) |
| `character` | 소유 니케 요약 — `id`/`resourceId`/`name`/`rarity`. 매칭되는 캐릭터가 없으면 `null` |
| `storyScenes` | 코스튬 사이드 스토리의 씬 `groupId` 배열 — `/api/scenes/:groupId`로 대사 조회. 코스튬 스토리가 없으면 `[]`. 현재 `퍼스트 어펙션`(30018)·`넌센스 레드`(50012)만 매핑됨 — 이벤트 씬 목록에 코스튬 연결 정보가 없어 수동 매핑 |

## GET /api/costumes/:id

코스튬 tid 또는 **이름**으로 조회합니다 (`/api/nikkes/:id`와 동일한 규칙). 응답 형태는 목록의 `costumes[]` 항목과 동일합니다.

- 숫자: 코스튬 tid 조회
- 그 외: 코스튬 이름 부분 일치 (전 언어, 대소문자·공백 무시) — 1건만 매칭되면 상세, 복수 매칭이면 `{count, costumes[]}` 목록

단일 코스튬 응답에는 `voices` 필드가 붙습니다 — 그 코스튬을 입었을 때 나오는 **전용 대사+음성** (`details.voices`에서 `costumeIndex`가 이 코스튬의 `skinIndex`인 항목만). 각 항목은 `label`/`text` 4개 언어 + `voice` ko/en/ja mp3 URL. 코스튬 전용 대사가 없으면 `voices: []`입니다. 기본 외형 대사(`costumeIndex: 0`)는 `/api/nikkes/:id`의 `details.voices`에서 조회하세요.

```
GET /api/costumes/10012
GET /api/costumes/수영복
GET /api/costumes/10012?lang=ko
```

**에러**

| 상황 | 상태 |
|------|------|
| 해당 id·이름의 코스튬 없음 | 404 `{"error": "not found"}` |

## GET /api/equips

장비(기어) 아이템 목록을 반환합니다 — 124종.

### 쿼리 파라미터

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 장비 이름 부분 일치 (전 언어) | `?q=바이저` |
| `class` | 장착 클래스 | `All` / `Attacker` / `Defender` / `Supporter` |
| `rare` | 등급 | `T1` ~ `T10` |
| `slot` | 부위 | `head` / `body` / `arm` / `leg` (몸통은 `body`) |
| `limit` | 반환 개수 제한 (최대 500) | `?limit=50` |
| `offset` | 시작 위치 | `?offset=50` |
| `page` | 페이지 번호 (1부터) | `?page=2` |
| `fields` | 응답 필드 선택 | `?fields=id,name.ko,icon` |
| `lang` | 다국어 필드 평탄화 | `?lang=ko` |

```json
{
  "count": 124,
  "offset": 0,
  "equips": [
    {
      "id": 3111001, "name": { "ko": "ν 매터 바이저", "...": "..." },
      "class": "Attacker", "rare": "T10", "slot": "head", "icon": "https://...",
      "stats": { "Atk": 6014, "Hp": 49181 },
      "optionSlots": [ { "slot": 1, "success": 1 }, { "slot": 2, "success": 0.5 }, { "slot": 3, "success": 0.3 } ],
      "costs": { "open": 10, "change": 200, "lock": 100 },
      "description": { "ko": "...", "en": "...", "ja": "..." }
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `stats` | 장비 기본 스탯 (`Atk`/`Hp`/`Def` 등, 없으면 `null`) |
| `optionSlots` | 옵션 슬롯별 부여 확률 — `success`는 0~1 (1=100%). 커스텀 모듈로 1슬롯은 100%, 2슬롯 50%, 3슬롯 30% |
| `costs` | 재련 비용 — `open`(슬롯 개방), `change`(옵션 변경), `lock`(옵션 잠금) 커스텀 모듈 수 |
| `description` | 장비 플레이버 텍스트 (ko/en/ja) |

`stats`·`optionSlots`·`costs`·`description`은 `ItemEquipTable`에서 조인되며, 테이블에 없는 항목은 `null`입니다. **옵션 효과 수치**(공격력 +X% 등)는 정적 데이터에 없어 포함되지 않습니다 — 라이브 유저 장비 조회 응답의 `options[].value`에서만 확인 가능합니다.

`id`는 `/api/user/...` 보유 니케의 `equipment.*.tid`와 같은 값입니다.

## GET /api/equips/options

장비 옵션(재련 옵션) 목록 — 150종, 12개 그룹.

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 옵션 이름 부분 일치 | `?q=우월코드` |
| `groupId` | 옵션 그룹 ID | `?groupId=100100` |
| `rank` | 옵션 등급 (1~15) | `?rank=3` |
| `page` / `limit` / `offset` / `fields` / `lang` | 목록 공통 | |

**에러**: `groupId`·`rank`가 숫자가 아니면 400.

## GET /api/equips/options/:id

옵션 ID로 단건 조회합니다.

```
GET /api/equips/options/7000501?lang=ko
```

## GET /api/equips/:id

장비 tid로 단건 조회합니다. 응답은 목록 `equips[]` 항목과 동일합니다.

**에러**: `id`가 숫자가 아니면 400, 없으면 404.

## GET /api/avatars

프로필 아바타 아이콘 목록을 반환합니다 (character_avatar_map 기준 — 388종). 유저 프로필의 `profile.icon.iconId`를 여기서 해석할 수 있습니다.

### 쿼리 파라미터

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 소유 캐릭터 이름 부분 일치 (전 언어) | `?q=라피` |
| `resourceId` | 캐릭터 resourceId 필터 | `?resourceId=102` |
| `orphans` | `true`면 캐릭터 미매칭 아이콘만 (NPC/미출시) | `?orphans=true` |
| `page` / `limit` / `offset` / `fields` / `lang` | 목록 공통 | |

```json
{
  "count": 388,
  "offset": 0,
  "avatars": [
    {
      "iconId": 50100,
      "resourceId": 102,
      "costumeIndex": 0,
      "image": "https://...",
      "character": { "id": 110201, "resourceId": 102, "name": { "ko": "...", "...": "..." }, "rarity": "SSR" }
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `iconId` | 아바타 아이콘 ID — 유저 프로필 `icon_id`와 같은 값 |
| `resourceId` | 캐릭터 리소스 ID |
| `costumeIndex` | 코스튬 인덱스 — `0`이면 기본 스킨, `/api/costumes`의 `costumeIndex`와 대응 |
| `image` | 해석된 아이콘 URL (코스튬 인덱스가 가리키는 아이콘, 캐릭터 없으면 `null`) |
| `character` | 소유 캐릭터 요약 — NPC/미출시 아이콘은 `null` |

## GET /api/avatars/:iconId

아이콘 ID로 단건 조회합니다. 응답은 목록 `avatars[]` 항목과 동일합니다.

```
GET /api/avatars/50100
```

**에러**: `iconId`가 숫자가 아니면 400, 없으면 404.

## GET /api/favorites

소장품과 애장품 목록을 반환합니다 — 33종 (R/SR/SSR).

### 쿼리 파라미터

| 파라미터 | 설명 | 예시 |
|----------|------|------|
| `q` | 이름 부분 일치 (전 언어) | `?q=기차` |
| `rare` | 레어 필터 | `R` / `SR` / `SSR` |
| `limit` | 반환 개수 제한 (최대 500) | `?limit=20` |
| `page` | 페이지 번호 (1부터) | `?page=2` |
| `offset` | 시작 위치 | `?offset=20` |
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
| `limit` | 반환 개수 제한 (최대 500) | `?limit=10` |
| `page` | 페이지 번호 (1부터) | `?page=2` |
| `offset` | 시작 위치 | `?offset=10` |
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
| `id` | 선택. 숫자 정확 매칭 — 캐릭터 id·resourceId·nameCode |
| `name` | 선택. 이름 부분 일치 (전 언어, 대소문자·공백 무시 — `102`는 N102도 매칭) |
| `q` | 선택(deprecated). `name`과 동일 — 하위 호환 별칭 |
| `element` `class` `burst` `corporation` `weapon` `rarity` | 선택. [GET /api/nikkes](#get-apinikkes)와 동일한 필터 — AND 결합. 상세가 필요하면 [GET /api/user/:blablaid/nikke/:nameOrId](#get-apiuserblablaidnikkenameorid) 사용 |
| `fields` | 선택. 응답 필드 선택 (`nikkes[]` 각 항목에 적용) |

```
GET /api/user/<blablaid>/nikke              # 보유 전체 목록
GET /api/user/<blablaid>/nikke?name=아니스   # 아니스 계열만 필터 (목록 형태 유지)
GET /api/user/<blablaid>/nikke?id=201601    # id/nameCode로 필터
GET /api/user/<blablaid>/nikke?name=102     # N102처럼 숫자 이름도 매칭
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

## GET /api/user/:blablaid/nikke-builds

보유 니케 **여러 명**의 상세를 한 번에 조회합니다. 항목 형태는 [단일 상세](#get-apiuserblablaidnikkenameorid)와 같습니다. 1명씩 조회하면 니케마다 업스트림 호출이 2번씩 들어가 조회 제한에 걸리기 쉬운데, 이 경로는 페이지마다 호출이 2번으로 고정됩니다.

| 파라미터 | 설명 |
|----------|------|
| `names` | 필수. 쉼표로 구분한 이름이나 id, 최대 50개. 이름이 정확히 같은 니케를 우선합니다(`exact=1`과 같음) |
| `offset` `limit` `page` | 찾은 니케 기준 페이지네이션 |
| `fields` `lang` | 각 항목에 적용 |

```
GET /api/user/<blablaid>/nikke-builds?names=라피,앵커,3017
```

```json
{
  "count": 2,
  "offset": 0,
  "nikkes": [ { "character": { "id": 1, "name": { "ko": "라피" } }, "level": 200, "alsoMatched": [ { "id": 201601, "name": { "ko": "라피 : 레드 후드" } } ] } ],
  "notFound": ["없는이름"],
  "ambiguous": [ { "query": "라", "candidates": [ { "id": 1, "name": { "ko": "라피" } } ] } ]
}
```

`count`는 찾은 니케 수입니다. `notFound`와 `ambiguous`는 해당 이름이 있을 때만 붙습니다.

## GET /api/user/:blablaid/nikke/:nameOrId

보유 니케 **한 명**의 상세를 조회합니다 — 장비·옵션·큐브·소장품·스킬 레벨까지 포함. 매칭 방식은 [GET /api/nikkes/:id](#get-apinikkesid)와 동일합니다.

| `:nameOrId` | 매칭 방식 |
|--------|----------|
| 니케 이름 | 부분 일치(전 언어, 대소문자·공백·`:` 무시) — `아니스`로 조회하면 보유한 아니스 계열 전부 매칭 |
| 숫자 | 캐릭터 id · resourceId · nameCode 중 일치 **또는** 이름에 그 숫자가 포함 — `102`는 N102도 매칭 |

매칭이 정확히 1명이면 상세 객체를, 복수면 목록(`{count, nikkes[]}`)을 반환합니다. `?fields=`로 상세 객체(또는 목록 항목)를 선택적으로 잘라낼 수 있습니다.

`?exact=1`을 붙이면 복수 매칭 중 이름이 정확히 같은 니케(전 언어, 대소문자·공백·`:` 무시)가 1명일 때 그 니케의 상세를 반환하고, 나머지는 `alsoMatched: [{ id, name }]`에 담습니다. 예를 들어 `드레이크`는 `드레이크 : 그레이트 빌런`이 함께 있어도 `드레이크` 상세가 옵니다. 정확히 같은 이름이 없으면 기본 동작과 같습니다.

```
GET /api/user/<blablaid>/nikke/아니스%20%3A%20스타   # 이름 (URL 인코딩)
GET /api/user/<blablaid>/nikke/3017                # 캐릭터 id
```

구형 쿼리 형태 `GET /api/user/nikke/:nameOrId?blablaid=...`·`?openid=`도 동일하게 동작합니다.

`favoriteItem`은 슬롯에 낀 아이템으로, `type`이 `Favorite`이면 애장품, `Collection`이면 지휘관 인형입니다. `ownFavoriteItem`은 그 니케의 애장품이고, 게임에 아직 없으면 `null`입니다. 인형을 낀 니케가 애장품을 안 낀 것인지, 애장품이 없는 것인지는 이 값으로 구분합니다.

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
  "favoriteItem": { "id": 201701, "level": 2, "name": { "ko": "...", ... }, "type": "Favorite" },
  "ownFavoriteItem": { "id": 201701, "name": { "ko": "...", ... } },
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
    "body":  { "...": "..." },
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

## GET /api/user/:blablaid/roster

공유 프로필의 보유 니케 **전원**을 한 번에 조회합니다 — 업스트림 원시 형태(`characters`·`character_details`·`state_effects`·`outpost_info`)를 서버별로 그대로 묶어 반환합니다. 정규화된 이름/이미지가 필요 없고 원시 필드를 직접 해석하는 소비자(예: 데미지 계산기)용입니다.

```
GET /api/user/<blablaid>/roster            # 5개 서버 전부 순회
GET /api/user/<blablaid>/roster?area=83    # 한국 서버만
GET /api/user/roster?blablaid=...          # 구형 쿼리 형태도 동일
```

### 응답 예시

```json
{
  "intlOpenId": "1234567890",
  "areas": [
    {
      "area": 83,
      "characters": [{ "name_code": 1021, "lv": 200, "grade": 2, "core": 0, "combat": 65721 }],
      "details": [{ "name_code": 1021, "skill1_lv": 7, "head_equip_tid": 3121001, "..." : "업스트림 원시 필드" }],
      "stateEffects": [{ "id": 7000514, "function_details": [{ "function_type": "StatAtk", "function_value": 1052 }] }],
      "outpost": { "synchro_level": 400, "recycle_room_researches": [] }
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `areas[].characters` | `GetUserCharacters` 원시 행 — `name_code`·`lv`·`grade`·`core`·`combat` 등 |
| `areas[].details` | `GetUserCharacterDetails` 원시 행 (60개씩 배치로 수집) — 스킬 레벨·장비 `*_equip_*` 필드·큐브·소장품 |
| `areas[].stateEffects` | 같은 응답의 `state_effects` — 장비 옵션 id → `function_details` 실제 수치 |
| `areas[].outpost` | `GetUserProfileOutpostInfo`의 `outpost_info` — 전진기지가 비공개면 `null` (실패가 아님) |

에러 정책은 다른 `/api/user/*`와 다릅니다:

| 상황 | 응답 |
|------|------|
| `blablaid` 형식 오류 / 지원하지 않는 `area` | 400 |
| 모든 서버 조회 실패 + 비공개 코드(1301002/1303002) 포함 | 404 `{"error": ..., "reason": "private"}` |
| 모든 서버 조회 실패 (기타) | 502 `{"error": ..., "code": <업스트림 코드>}` |
| 상세 배치 호출 하나라도 실패 | 502 — 해당 서버를 조용히 버리지 않고 요청 전체를 실패시킴 |
| 서버 조회 계정 미설정 | 503 |

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

## MCP `/mcp`

`/mcp`는 [Model Context Protocol](https://modelcontextprotocol.io) 서버입니다. ChatGPT나 Claude에 연결하면 이 API를 도구처럼 쓸 수 있습니다. 세션을 저장하지 않는 Streamable HTTP 방식이라 인증 없이 URL만 넣으면 됩니다.

```
https://nikke-api.pages.dev/mcp
```

- **Claude**: 커스텀 커넥터를 추가하면서 위 URL을 넣습니다. Claude Code는 `claude mcp add --transport http nikke https://nikke-api.pages.dev/mcp`로 추가합니다.
- **ChatGPT**: 개발자 모드를 켠 뒤 커넥터를 추가하면서 위 URL을 넣고, 인증은 '없음'으로 둡니다.

| 도구 | 감싸는 엔드포인트 |
|------|-------------------|
| `search_nikkes` / `get_nikke` | `/api/nikkes`, `/api/nikkes/:id` (상세는 기본으로 음성·레벨별 스탯을 뺌 — `include`로 추가) |
| `search_scenes` / `get_scene` | `/api/scenes`, `/api/scenes/:groupId` (기본은 화자·대사만) |
| `list_events` / `get_event` | `/api/events`, `/api/events/:id` |
| `search_favorites` / `get_favorite` | `/api/favorites`, `/api/favorites/:id` |
| `get_user_profile` / `get_user_nikkes` / `get_user_nikke` | `/api/user/*` (서버에 BlablaLink 계정 필요, 인스턴스당 분당 30회) |
| `read_event` | `/api/events/:id/script` |
| `search_lines` | `/api/lines` |
| `nikke_appearances` | `/api/nikkes/:id/appearances` |
| `compare_nikkes` | `/api/nikkes/:id`를 2–4명에 대해 호출해 한 응답으로 묶음 |
| `story_route` / `next_story` | `/api/story/route`, `/api/story/next` |
| `api_get` | 전용 도구가 없는 조회 (스테이지·코스튬·장비·큐브·아바타·필터 값). `/api/user`·`/api/tables`는 막혀 있음 |
| `search` / `fetch` | 통합 검색 / id로 문서 가져오기 (ChatGPT 커넥터 규격) |

모든 도구는 기본 `lang=ko`로 응답합니다. 이름 검색·호감도 씬·대사 검색은 기본으로 이격까지 묶어서 찾습니다(`family`, 끄려면 `false`). 60,000자를 넘는 응답은 목록 뒤쪽을 덜어내고 `truncated`(`nextOffset` 포함)를 붙여 돌려줍니다. 클라이언트별 연결 방법은 [docs/mcp.md](docs/mcp.md)를 보세요.

### 개인 커넥터 등록 `/mcp/u/<key>`

BlablaLink 공유 링크를 한 번 등록하면 개인 커넥터 URL을 발급받습니다. 이 URL로 연결한 세션에서는 `get_user_*` 도구의 `blablaid` 인자를 생략할 수 있습니다 — 등록한 프로필이 자동으로 쓰입니다.

```
POST /mcp/register
Content-Type: application/json

{"url": "https://www.blablalink.com/user?openid=<base64>"}
```

응답: `{"key": "u_…", "url": "https://nikke-api.pages.dev/mcp/u_…"}` — 링크가 실제 프로필로 해석되는지 서버가 한 번 조회해 검증한 뒤 발급합니다. 등록 정보만 저장되며 게임 토큰은 받지 않습니다(조회는 서버 계정으로 수행). 키별로 분당 60회 제한이 따로 적용됩니다.

## 운영자 엔드포인트 `/admin/token`

엣지(Cloudflare Worker)에만 있는 관리자용 엔드포인트입니다. `x-admin-token` 헤더로 인증합니다.

- `GET /admin/token` — 저장된 조회 계정 상태(설정 여부·open_id·만료 시각, 토큰 값은 비노출)
- `POST /admin/token` — BlablaLink `__ss_storage_ls_cache_login_meta__` JSON(또는 `{open_id, token, uid, channel_id, expires}`)을 받아 업스트림 `/api/user/Login`으로 **검증 성공 시에만** 저장. 이후 `/api/user/*`·MCP 조회에 즉시 반영(재배포 불필요)

엣지는 저장된 자격증명을 내부 헤더(`x-bla-creds`)로 오리진에만 주입하고, 클라이언트가 보낸 동명 헤더는 항상 제거합니다.

## 이격 연결

데이터에는 이격(같은 캐릭터의 다른 버전)과 원본을 잇는 필드가 없어서, 모든 언어에서 지키는 이름 규칙 `<원본> : <수식어>`(예: `라피 : 레드 후드`, `Rapi: Red Hood`)로 묶습니다. 규칙에서 벗어나는 경우는 [`src/family.ts`](src/family.ts)의 표에 둡니다 (현재 `모더니아` → `마리안`).

- `/api/nikkes/:id` 상세에 `family`(`base`, `members[]`)가 붙습니다.
- `/api/nikkes`·`/api/scenes`·`/api/lines`는 `family=1`일 때 이 묶음으로 검색합니다. 기본 동작은 그대로입니다.
- `레드 후드`처럼 이름이 비슷해도 별개 캐릭터는 묶지 않습니다.

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
| `/api/user/:blablaid/nikke/:nameOrId` | 상세 객체 (복수 매칭 시 `nikkes[]` 각 항목) |
| `/api/user/:blablaid/nikke-builds` | `nikkes[]` 각 항목 |

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
- 조건부(304) 처리는 리소스가 실제로 존재하는 **200 응답에만** 적용됩니다 — 유효하지 않은 경로는 올바른 태그를내도 `404`를 반환합니다.

`/api/user/*` 엔드포인트는 라이브 데이터(BlablaLink 업스트림 조회)라 캐시하지 않습니다 — 항상 `Cache-Control: no-store`가 붙고 ETag도 발급되지 않습니다.

---

## 에러 응답

| 상황 | 상태 | 본문 |
|------|------|------|
| 리소스 없음 | 404 | `{"error": "not found"}` |
| 없는 경로 (라우트 미스매치) | 404 | `{"error": "not found"}` — 모든 404는 JSON |
| 잘못된 파일명/파라미터 | 400 | `{"error": "invalid file"}` / `{"error": "path required"}` |
