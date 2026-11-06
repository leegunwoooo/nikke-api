# 버스트 컷신 URL 목록

[ArtHub](https://github.com/Talors1225/arthub-viewer-web)의 공개 니케 리소스에서 버스트 컷신 URL 메타데이터만 가져옵니다. Spine·이미지·음성 파일은 이 저장소에 보관하지 않습니다. 원본 게임 콘텐츠의 권리는 © SHIFT UP / Level Infinite에 있습니다.

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

검증용 `@esotericsoftware/spine-core`는 개발 의존성이며 [Spine Runtimes 라이선스](https://github.com/EsotericSoftware/spine-runtimes/blob/4.1/LICENSE)를 따릅니다. API 워커 번들에는 런타임을 포함하지 않습니다.

목록은 워커 번들에 포함됩니다. 기존 `data/dist`를 그대로 사용하며, `content/burst-cutscenes/` 변경은 워커 배포 대상입니다. API 요청 중에 ArtHub를 호출하지 않습니다. 외부 파일 자체의 가용성은 해당 호스트에 의존합니다.

2026-11-06에 Range GET으로 확인한 R2 CORS는 `https://talors1225.github.io`를 허용하고 `https://nikke-api.pages.dev`는 허용하지 않았습니다. 브라우저에서는 `viewerUrl`로 재생합니다. 원본 URL을 임의 웹사이트에서 직접 사용하는 플레이어는 별도의 호스팅 정책이 필요합니다.
