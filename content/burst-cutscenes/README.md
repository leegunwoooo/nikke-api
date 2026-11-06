# 버스트 컷신 URL 목록

[ArtHub](https://github.com/Talors1225/arthub-viewer-web)의 공개 니케 리소스에서 버스트 컷신 URL 메타데이터를 가져옵니다. 원본 Spine·이미지·음성 파일은 이 저장소에 보관하지 않습니다. 합성 뷰어가 요청하면 목록에 등록된 리소스만 중계하고 기존 엣지 캐시를 사용합니다. 원본 게임 콘텐츠의 권리는 © SHIFT UP / Level Infinite에 있습니다.

- 원본 목록: [`nikki/nikki_chars.json`](https://github.com/Talors1225/arthub-viewer-web/blob/dba1ebc764ffd74722afe6ef2acf411931abf47c/nikki/nikki_chars.json)
- 고정 revision: `dba1ebc764ffd74722afe6ef2acf411931abf47c`
- 실제 호스트: `https://pub-bdd986c6ec274f53b01df62ac49e02e2.r2.dev/nikki/spine_carved/`
- 검증: 2026-11-06, 230개 리소스의 atlas·Spine 스켈레톤 전체 파싱·버스트 트랙·전체 texture 페이지 HTTP 응답 확인

## 수록 범위

2026-11-06의 니케 API SSR 177명 중 174명의 기본 버스트가 수록되어 있습니다. 벨로타 : 펌킨 위치(`c063_00_skillcut`, [2026-10-08 출시](https://nikke.gg/characters/belorta-pumpkin-witch/))와 신데렐라의 글라스 커트시(`c511_03_skillcut`)도 있습니다.

| 캐릭터 | 현재 버스트 목록 |
|---|---|
| 마리안 : 퀸 (`19`) | 미수록 |
| 홍련 : 신살 (`472`) | 미수록 — 원본에는 스탠딩만 있음 |
| 라푼젤 : 생츄어리 (`473`) | 미수록 — 원본에는 스탠딩만 있음 |

`null`은 **이 목록에 해당 외형의 컷신이 없다는 뜻**입니다. 게임에 컷신이 없거나 기본 외형을 재사용한다는 판정이 아닙니다. 업데이트는 BlablaLink의 일일 데이터 동기화와 별개입니다. ArtHub 목록의 마지막 수정은 2026-10-17이며, 저장소 전체의 수정일과 다릅니다.

## 갱신

```sh
npm run sync:burst -- <검토한-ArtHub-40자리-commit-SHA>
npm test
npm run typecheck
npm run emit:pages-worker
```

인자 생략 시 스크립트에 고정된 revision을 검증합니다. 원본의 `resourceType: skill` 중 알려진 버스트 파일명만 선택하고, 리소스 ID와 코스튬 인덱스로 연결합니다. 코드 번호가 같아도 스탠딩·전투 모델을 버스트로 취급하지 않습니다. 오타가 있는 실제 파일명, 스킨 번호가 생략되거나 뒤에 붙는 파일명, 기존·catalog 중복을 처리합니다. 알 수 없는 이름은 제외하며, 동일 우선순위 중복과 합성 레이어는 수동 검토가 필요해 실패합니다.

모든 atlas 페이지와 skeleton을 읽어 Spine 4.1 런타임으로 파싱하고, 버스트 애니메이션 트랙과 각 파일의 존재를 확인한 뒤에만 `catalog.json`을 교체합니다. 파일명이 특이한 레드 후드 기본 외형과 에밀리아 클럼지 메이드는 개별 검증한 매핑을 사용합니다. 실패한 갱신은 기존 목록을 덮어쓰지 않습니다. 변경된 URL 목록과 누락 항목을 검토하고 이 문서의 수록 범위를 함께 갱신합니다. 원본 호스트가 바뀌면 스크립트의 `BURST_ASSET_BASE`도 확인해야 합니다.

`@esotericsoftware/spine-core`와 `spine-webgl`은 개발 의존성이며 [Spine Runtimes 라이선스](../../viewer/SPINE-LICENSE.txt)를 따릅니다. 검증은 Node에서 실행하고, 재생 런타임은 `npm run build:burst-player`로 브라우저용 파일에 번들링합니다. 워커는 생성한 플레이어 코드를 전달하며 Spine 파싱·렌더링은 브라우저에서 수행합니다. 플레이어 소스 변경 시 생성물도 커밋하며 CI에서 일치 여부를 검사합니다.

목록은 워커 번들에 포함됩니다. 기존 `data/dist`를 그대로 사용하며, `content/burst-cutscenes/` 변경은 워커 배포 대상입니다. API 요청 중에 ArtHub를 호출하지 않습니다. 외부 파일 자체의 가용성은 해당 호스트에 의존합니다.

2026-11-06에 Range GET으로 확인한 R2 CORS는 `https://talors1225.github.io`를 허용하고 `https://nikke-api.pages.dev`는 허용하지 않았습니다. `viewerUrl`은 자체 합성 뷰어를 열며, `/burst-assets/<revision>/<id>/<파일명>`으로 정확히 등록된 리소스만 읽습니다. 이 경로는 임의 URL이나 다른 파일을 중계하지 않습니다. 원본 URL과 원본 뷰어는 계속 `atlas`·`skeleton`·`textures`·`source.viewerUrl`에 남습니다.

## 배경 합성

`playback`은 하나의 컷신에 필요한 재생 구성을 제공합니다. 원본에 `all_skillcut`·`skillcut_1_all` 같은 통합 애니메이션이 있으면 우선 선택합니다. 아래 6개는 같은 스켈레톤 안에서 배경과 본체의 애니메이션이 나뉘므로 함께 재생합니다.

| 리소스 | 배경 | 본체 |
|---|---|---|
| `c063_00_skillcut` | `bg_skillcut_1` | `skillcut_1` |
| `c103_00_skillcut` | `bg_skillcut_1` | `skillcut_1` |
| `c170_04_skillcut` | `bg_skillcut_1` | `skillcut_1` |
| `c513_01_skillcut` | `skill_cut_bg` | `skill_cut` |
| `catalog-c852_00_skillcut` | `skillcut_bg` | `skillcut` |
| `c872_skillcut_00` | `bg_skillcut_1` | `skillcut_1` |

배경 애니메이션에는 캐릭터 슬롯을 숨기는 키가 있으므로 한 Skeleton의 트랙에 중첩하지 않습니다. atlas·텍스처·SkeletonData를 공유하는 독립 Skeleton을 같은 시간·카메라로 그려 하나의 화면을 만듭니다. 플레이어의 재생·정지·탐색은 모두 함께 동작합니다. 화면은 내보낸 스켈레톤 영역을 기준으로 고정하며, 영역 밖의 이동 효과 때문에 화면 전체가 축소되지 않도록 자릅니다. 게임의 카메라·후처리·음성까지 복원한 영상은 아닙니다.

## 재생 트랙 수동 교정

`animation` 이름만으로는 빈 트랙과 본체를 구분할 수 없습니다. 일부 파일은 `skillcut_1`이 전 슬롯을 숨기는 더미이고 `skillcut_2`가 본체이며, 어떤 파일은 본체와 별도 슬롯의 후반 오버레이로 나뉩니다. 전수 슬롯 가시성 검증으로 교정한 5개는 `scripts/burst-cutscenes.ts`의 `BURST_OVERRIDES`에 있고, 갱신 시에도 유지됩니다. `extraLayers`는 본체 위에 같은 시간축으로 덧그리는 트랙입니다.

| 리소스 | 문제 | 재생 구성 |
|---|---|---|
| `c105_00_skillcut` | `skillcut_1` 전체 빈 트랙 | `skillcut_2` |
| `c234_00_skillcut` | `skillcut_1` 사실상 빈 트랙(1슬롯) | `skillcut_2` |
| `c315_00_skillcut` | `skillcut_2`가 후반 이펙트 레이어인데 미반영 | `skillcut_1` + `skillcut_2` 오버레이 |
| `c580_01_skillcut` | `skillcut_1` 빈 트랙, `skillcut_3` 오버레이 미반영 | `skillcut_2` + `skillcut_3` 오버레이 |
| `c871_00_skillcut` | `skillcut_1`이 전반 빈 후반 날개/이펙트 레이어 | `skillcut_0` + `skillcut_1` 오버레이 |

또한 일부 스켈레톤(`c102`·`c210`·`c231`)은 attachment가 `default`가 아닌 명명 스킨(`00` 등)에 있어 `setSkin` 없이는 모든 슬롯이 비어 있습니다. 뷰어와 동기화 검증은 attachment가 없으면 스킨을 적용합니다.
