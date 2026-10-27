# 참고한 사이트·공개 저장소와 적용
확인: 2026-10-26. 코드를 복사하지 않고 구조·흐름만 참고한 것과, 라이브러리로 그대로 쓰는 것을 나눠 적었습니다.

## 참고 웹앱: 퀴즈 카트 (lab.ches.es.kr/kart, 옆 반 선생님의 작은 연구실)
| 본 것 | 즐거운 퀴즈에 적용 |
|---|---|
| 교사 3단계: 문제 넣기 → 맵·규칙 → 방 만들기·출발 | 같은 순서. 아래 고정 바에 "방 만들기 🚦" |
| 표 입력: 문제·정답·오답1~3, 정답만 쓰면 단답형, `/`로 여러 정답, 엑셀 여러 줄 붙여넣기 | 같은 규칙 + 해설 칸, OX 자동 인식. 퀴즈 카트 엑셀(5열)도 그대로 올라감 |
| 🤖 생성형 AI 프롬프트 모달: 학년·과목·문제 수·종류를 고르면 프롬프트 완성 → 복사 | 같은 흐름 + 난이도·해설 옵션, 6열 형식. 분석실에도 수업 설계·보충 문제 프롬프트 |
| 태블릿에서는 단답형을 보기 4개로 | 서버가 다른 문제 정답으로 보기를 만들어 줌 |
| 퀴즈 도장(문제를 풀어야 결승), 문제 박스·게이트 | 카트 레이스 모드에 적용 (docs/RACE.md) |
| 결과: 순위 + 문제별 정답률, CSV 저장 | 결과 + 많이 고른 오답, JSON 기록 + 엑셀 자동 저장, 분석실 |
| 사용법 페이지: 소개/선생님/학생 탭, 주소 복사 | guide.html 같은 구성 + 분석실·개인정보 탭 |
| 서버 구조: socket.io 방(4자리 번호) | 같은 방식. 단 기록은 서버에 남기지 않음 |

## 공개 저장소 (구조 참고, 코드 복사 없음)
| 저장소 | 참고한 점 |
|---|---|
| [Ralex91/Rahoot](https://github.com/Ralex91/Rahoot) (MIT, 자체 호스팅 Kahoot형) | 관리자(교사)·참가자 이벤트 흐름, 방 번호 입장, 답 시간 제한 → 골든벨 라이브의 문제→공개→순위 단계 |
| [mawoka-myblock/ClassQuiz](https://github.com/mawoka-myblock/ClassQuiz) (MPL-2.0) | 문제 제작과 실시간 진행을 분리하는 구성 |
| [khrj/kuizzy](https://github.com/khrj/kuizzy) (GPL-3.0) | WebSocket 퀴즈의 최소 구성 확인 (코드 사용 안 함) |
| [Lunakepio/Mario-Kart-3.js](https://github.com/Lunakepio) (MIT, 미완성) | three.js 카트의 드리프트·미니 터보 느낌 (설계만 참고, IP 관련 요소 없음) |
| [pmndrs/racing-game](https://github.com/pmndrs/racing-game) | 브라우저 레이싱의 카메라·성능 조절 아이디어 |
| Blooket "Gold Quest", Gimkit (상용) | 보물 상자 3개 중 고르기·뺏기·바꾸기, 게임 안 경제 → 보물 상자 모드. 착한 모드(뺏기 끄기) 추가 |
| 같은 폴더의 HADA퀴즈 docs/GITHUB_RESEARCH.md | 엑셀 가져오기 열 이름 규칙, 교사 단계형 UI 결정 |

## 그대로 쓰는 라이브러리 (THIRD_PARTY_NOTICES.md)
socket.io 4.8.1 (MIT) · three.js r170 (MIT) · SheetJS CE 0.20.3 (Apache-2.0) · qrcode-generator 1.4.4 (MIT) · Jua 글꼴 (OFL-1.1, 한글 2,350자로 줄임)
