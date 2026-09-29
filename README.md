# nikke-api

> [!WARNING]
> **저작권 고지 — 반드시 읽어주세요**
>
> 본 프로젝트는 **비공식·비상업적 팬 프로젝트**입니다. 이 API를 통해 제공되는 모든 게임 데이터, 캐릭터 정보, 이미지, 텍스트 등 콘텐츠의 저작권 및 지적재산권은 **© SHIFT UP / Level Infinite**에 있습니다.
>
> 본 프로젝트는 SHIFT UP 및 Level Infinite와 아무런 관련이 없으며, 공인·후원·승인받은 서비스가 아닙니다. 데이터는 공개된 [BlablaLink](https://www.blablalink.com) CDN 리소스를 그대로 참조하여 제공하며, 재호스팅·수정하지 않습니다.
>
> 상업적 이용을 금지하며, 권리자의 요청이 있을 경우 즉시 서비스를 중단합니다.

---

## 소개

승리의 여신: 니케(GODDESS OF VICTORY: NIKKE) 게임 데이터를 제공하는 REST API입니다.

BlablaLink(공식 위키 도구)의 CDN 데이터를 매일 동기화합니다. 데이터 변경이 감지될 때만 자동 재배포되어 항상 최신 상태를 유지합니다.

**라이브 주소**: https://nikke-api-gunwoos-projects.vercel.app

- **4개 언어** 지원: 한국어 `ko` / 영어 `en` / 일본어 `ja` / 중국어 번체 `zh-TW`
- 이미지·음성은 BlablaLink CDN URL로 제공 (직접 재호스팅하지 않음)
- 스킬 설명은 **최대 레벨 기준**으로 렌더링된 텍스트 제공 (원본 템플릿·레벨별 수치도 포함)

## 제공 데이터

### 캐릭터 — 202종

| 항목 | 내용 |
|------|------|
| 기본 정보 | ID, 이름(4개 언어), 레어도, 클래스, 버스트 스텝, 기업, 속성, 무기/공격 타입 |
| 이미지 | 아이콘 / 미디엄 / 전신 일러스트 (CDN URL), 등급·클래스·속성 아이콘, 스킬 아이콘 |
| 코스튬 | 스킨 캐릭터별 코스튬 목록 + 각 코스튬 이미지 세트 |
| 스킬 | 슬롯별(`skill1`/`skill2`/`burst`) 이름·설명(최대 레벨 렌더링) + 원본 템플릿·레벨별 수치, 버스트 쿨타임 |
| 스탯 | 레벨별 공격력/방어력/HP 배열 (Lv1~최대) |
| 전투 정보 | 치명타 확률·피해, 사거리 보정, 버스트 지연·지속시간 등 |
| 스토리 정보 | 배경 스토리(4개 언어), 소속 스쿼드, 성우(CV), 호감도 씬 연결, 팀원 목록(캐릭터 이름·이미지로 해석) |
| **보이스** | 캐릭터 대사 목록 (`details.voices`) — 로비 터치, 전투 진입·승리, 호감도 대사 등 캐릭터당 ~40여 라인. 대사별 `label`(종류)·`text`(대사) 4개 언어 + `voice` 음성 mp3 **ko/en/ja 3종**. `conditionAttractiveLevel`로 해금 조건 포함 |

### 스토리 씬 — 3,079개 (한국어)

메인/이벤트/돌발 스토리 + 호감도(Attractive) 시나리오의 전체 대본.

| 항목 | 내용 |
|------|------|
| 분류 | `main` / `event` / `sudden` / `attractive` 카테고리 + 니케별·이름 검색, 페이지네이션 |
| 대본 | 대사별 화자 코드·이름·텍스트·말풍선 타입 |
| 화자 정보 | 화자 아이콘 이미지 URL (NPC 포함) + 플레이어블 니케면 `speakerNikke`(이름·이미지로 해석된 캐릭터 정보) |
| **씬 보이스** | 풀보이스 챕터·이벤트는 대사별 한국어 음성 mp3 URL 제공, 보이스 없는 라인은 `voice: null` |
| 호감도 씬 | 대상 니케·필요 호감도 레벨 + 배경/BGM 리소스 코드 |

### 소장품 — 33종

| 항목 | 내용 |
|------|------|
| 기본 정보 | 이름·설명(4개 언어), 레어(R/SR/SSR), 무기 타입, 아이콘·프롭 이미지, 소유 니케(`character`) |
| 레벨별 스탯 | `atk`/`def`/`hp`/`power`/`grade` + 해당 레벨의 컬렉션·소장품 스킬 레벨 |
| 스킬 | 수집 효과 스킬(`collection`) + 돌파 슬롯별 전용 스킬(`item`) — 최대 레벨 렌더링 설명 + 원본 수치 |

### 하모니 큐브 — 17종

| 항목 | 내용 |
|------|------|
| 기본 정보 | 이름·설명·획득처(4개 언어), 클래스 |
| 레벨별 스탯 | `atk`/`def`/`hp`/`power` + 해당 레벨의 스킬 레벨 |
| 스킬 | 큐브 스킬 이름·설명(최대 레벨 렌더링) + 원본 수치 |

### 유저 프로필

BlablaLink 공유 링크(`https://www.blablalink.com/user?openid=...`)로 유저의 프로필을 조회합니다. API 사용자는 링크만 붙이면 되고, 조회는 서버의 계정으로 이뤄집니다.

| 항목 | 내용 |
|------|------|
| 프로필 (`/api/user`) | 닉네임, 레벨, 대표 아이콘(캐릭터 이름·이미지로 해석), 팀 전투력, 캠페인/타워 진행도(스테이지명으로 해석), 기업별 보유 수, 오버클럭 기록, 대표 스쿼드 |
| 전진기지 (`/api/user`) | 인프라 코어, 싱크로 레벨, 리사이클 룸 연구, 메모리얼 수집 수 |
| 보유 니케 (`/api/user/nikke`) | 전투력순 목록 — 니케 이름/이미지, 레벨, 코어·돌파. `?q=` 지정 시 스킬 레벨, 호감도, 착용 코스튬, 장비(부위별 이름·티어·옵션 수치), 큐브·소장품까지 상세 조회 |

```
GET /api/user?openid=<공유 링크 또는 openid>        # 프로필·전진기지
GET /api/user/nikke?openid=<openid>               # 보유 목록 (경량)
GET /api/user/nikke?openid=<openid>&q=아니스       # 아니스 계열만 상세
```

### 원본 테이블 — 81종

레벨 테이블, 스테이지/타워 목록, 장비 옵션, 아카이브 등 동기화된 게임 데이터 JSON을 가공 없이 그대로 제공.

## 엔드포인트

| 엔드포인트 | 설명 |
|------------|------|
| `GET /api/nikkes` | 캐릭터 목록 — `?q=` 이름 검색(전 언어 부분 일치), `?element=` `?class=` `?burst=` `?corporation=` `?weapon=` `?rarity=` 필터 (AND 결합) |
| `GET /api/nikkes/:id` | 캐릭터 상세 — 스킬/스탯/배경/CV/보이스 등 `details` 포함. `:id`는 캐릭터 ID·resourceId·이름(부분 일치) 모두 가능 |
| `GET /api/scenes` | 씬 목록 — `?category=` `?nikke=` `?q=` `?limit=` `?offset=` |
| `GET /api/scenes/:groupId` | 씬 대본 — 대사별 화자/아이콘/보이스 |
| `GET /api/favorites` | 소장품 목록 — `?q=` `?rare=` |
| `GET /api/favorites/:id` | 소장품 상세 — 레벨별 스탯, 컬렉션·전용 스킬 |
| `GET /api/cubes` | 하모니 큐브 목록 — `?q=` |
| `GET /api/cubes/:id` | 큐브 상세 — 레벨별 스탯, 큐브 스킬 |
| `GET /api/user?openid=` | 유저 프로필·전진기지 조회 — BlablaLink 공유 링크 또는 openid |
| `GET /api/user/nikke?openid=&q=` | 유저 보유 니케 목록/개별 상세 — `q` 생략 시 경량 목록 |
| `GET /api/tables` / `GET /api/tables/:file` | 원본 테이블 목록/조회 |
| `GET /api/meta/filters` | 사용 가능한 필터 값 목록 |
| `GET /api/cdn?path=` | CDN 리소스 경로 → URL 변환 |

## API 문서

- **인터랙티브 문서 (브라우저에서 바로 테스트) → [/docs](https://nikke-api-gunwoos-projects.vercel.app/docs)**
- 요청/응답 형식 전체 문서 → [API.md](API.md)

## 문의

문의나 요청사항은 **leegunwoo0325@gmail.com**으로 보내주시거나 **[Issues](https://github.com/leegunwoooo/nikke-api/issues)** 기능을 활용해주시면 감사하겠습니다.
