# 애장품 스토리 대본

니케 21명의 애장품 스토리 대본입니다. `/api/scenes/:groupId` 응답과 같은 모양의 JSON이고, 빌드할 때 데이터에 합쳐져 API(`/api/scenes?category=favorite`)와 MCP로 제공됩니다.

`d_favorite_<화자 코드>.json` 파일 하나가 한 편입니다. 폴더에 파일을 넣으면 빌드에 포함됩니다.

## 출처와 저작권

게임 데이터에 없는 대본이라, 공개 유튜브 영상([재생목록](https://www.youtube.com/playlist?list=PLje7-3SsSpR139NptQ-bmMRLwYOy2Q6Mt))의 화면을 OCR로 읽어 옮겼습니다. 편별 영상 주소는 `sourceVideo`에 있습니다.

대본의 저작권은 **© SHIFT UP / Level Infinite**에 있습니다. 비상업적 팬 프로젝트의 자료이며, 권리자가 요청하면 즉시 삭제합니다.

## 형식

| 필드 | 설명 |
|------|------|
| `groupId` | `d_favorite_<화자 코드>` |
| `type` | 항상 `"favorite"` |
| `name` | 영상 첫 화면 챕터 목록의 마지막 이름 (공식 제목이 아닐 수 있음) |
| `nikke` | 니케 이름 |
| `sourceVideo` | 원본 영상 주소 |
| `lines[].window` | `Speech`, `Self`(지휘관 대사), `Narration`, `Choice` |
| `lines[].speaker` | 화자 코드. 호감도 씬으로 확인한 화자만 있음 |
| `lines[].speakerName` | 화자 이름. 지휘관 대사와 지문에는 없음 |
| `lines[].voice` | 항상 `null` |
| `lines[].chosen` | 영상에서 고른 선택지에만 `true` (API에 없는 추가 필드) |

## API 응답과 다른 점

- 지문은 `Monologue`와 `Narration`을 구분할 수 없어 모두 `Narration`입니다.
- 선택지는 전부 들어 있지만, 그 뒤의 대사는 영상에서 고른 분기만 있습니다.
- 챕터 경계가 없어 한 편이 씬 하나이고, `background`와 `bgm`은 없습니다.

## 정확도

- OCR 기반이라 오탈자가 있을 수 있습니다. 선택지는 영상 프레임으로 확인했지만, 나머지 대사는 전부 대조하지 않았습니다.
- 지휘관 이름은 API 대본과 같이 `@UserName`으로 표기합니다.
- 오류를 발견하면 이슈로 알려주세요.

## 수정 방법

이 폴더의 JSON이 원본이니 직접 고칩니다. `speakerIcon`은 빌드할 때 화자 코드로 만들어 붙이므로 적지 않습니다. `nikke`는 `/api/nikkes`의 한국어 이름과 정확히 같아야 하며, 다르면 빌드가 실패합니다.
