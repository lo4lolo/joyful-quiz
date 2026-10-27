# 무료로 배포해서 실제로 쓰기 (GitHub Pages + Render 무료)

## 구조 — 왜 둘로 나눴나
| 맡은 일 | 어디 | 비용 |
|---|---|---|
| 화면·그림·글꼴 (학생·선생님·분석실·사용법) | **GitHub Pages** (전 세계 CDN) | 무료 |
| 실시간 게임 연결 (방·문제·채점) | **Render 무료 웹 서비스** | 무료 |

화면 파일을 GitHub이 보내 주니 무료 서버는 게임 연결만 맡아 가볍고, 분석실은 서버가 잠들어 있어도 열려요.
학생 기록은 어느 쪽에도 저장되지 않아요. 방은 서버 메모리에만 있다가 결과를 저장하면 응답 기록을 바로 지우고, 방을 닫으면 모두 지워요.

## 6학년 250명, 무료로 될까? (2026-10-27 기준, 직접 잰 값)
**Render 무료(Hobby) 한도** ([공식 문서](https://render.com/docs/free), [네트워크](https://render.com/docs/outbound-bandwidth)):
무료 서버 512 MB · 0.1 CPU · 월 750시간(한 대를 한 달 내내 켜도 744시간) · **보내는 데이터 월 5 GB** (2026년 8월부터, 예전 100 GB에서 줄어듦) · 15분 동안 아무도 안 쓰면 잠들고 깨는 데 약 1분.
카드를 등록하지 않으면 5 GB를 넘어도 요금이 나가지 않고, 그달 남은 기간 서버가 잠들어요. 카드를 등록하면 넘친 만큼 1 GB에 0.15달러.

화면·그림은 GitHub Pages가 보내므로 이 5 GB에는 **실시간 게임 데이터만** 들어가요.

한 반(28명)이 게임할 때 실제로 나가는 데이터 (KB/s, 압축 후):
| 골든벨 | 땅따먹기 | 보물 상자 | 보스전 | 카트 레이스 | 무궁화 | 낚시 | 퀴즈 부자 | 윷놀이 | 줄다리기 |
|---|---|---|---|---|---|---|---|---|---|
| 1.4 | 4 | 5.7 | 11 | 14 | 15 | 18 | 21 | 32 | 32 |

→ 한 반이 **20분** 게임하면 보통 약 20 MB (골든벨 2 MB ~ 줄다리기·윷놀이 38 MB).
→ 월 5 GB면 **20분짜리 게임 약 250번**. 9개 반이면 반마다 한 달에 약 28번(주 6~7번)까지 무료예요.
→ 학년 전체(9반)가 동시에 20분 하면 약 0.2 GB.

CPU (`node tools/loadtest.mjs grade 90`, 252명·9반 동시): i7 한 코어의 약 8%, 메모리 174 MB, 응답 p95 4 ms.
- **한 반씩 / 2~3반 동시**: 무료로 넉넉해요.
- **학년 전체가 동시에 각자 다른 게임**: 무료 서버 CPU(0.1)의 한계 근처라 느려질 수 있어요. 학년 행사는 **골든벨 한 방에 300명**(설정 → 최대 인원 300명)이 가장 가볍고 안전해요.

이미 해 둔 최적화: 화면은 GitHub CDN, 바뀐 것만 보내는 순위표, 학생용 가벼운 순위, 카트 위치 7Hz, 윷판 0.5초 묶음, 256바이트 넘는 메시지 압축(카트 85→14 KB/s), 그림 WebP(9.5→1.5 MB), 저장 후 서버 기록 즉시 삭제.

## 처음 한 번만 하는 배포 (약 15분)
계정 만들기·로그인은 선생님이 직접 해 주세요.

### 1. GitHub에 올리기
1. https://github.com 로그인 → 오른쪽 위 **+ → New repository** → 이름 `joyful-quiz` → **Public** (무료 Pages는 공개 저장소에서 돼요. 저장소에는 학생 정보가 없어요) → Create.
2. 이 폴더에서 (이미 git 저장소예요):
   ```
   git remote add origin https://github.com/<아이디>/joyful-quiz.git
   git push -u origin main
   ```
   처음이면 로그인 창이 떠요.
3. 저장소 **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### 2. Render에 실시간 서버 만들기
1. https://render.com → GitHub 계정으로 로그인 → **New → Blueprint** → `joyful-quiz` 저장소 선택 → `render.yaml` 대로 만들어져요 (Free).
2. 환경 변수 입력 칸에서
   - `TEACHER_PIN`: 선생님만 아는 숫자 (모르는 사람이 방을 못 만들게)
   - `ALLOWED_ORIGINS`: `https://<아이디>.github.io`
3. 몇 분 뒤 서버 주소가 생겨요. 예: `https://joyful-quiz-xxxx.onrender.com` (브라우저에서 `/api/info` 를 열어 글자가 나오면 성공)

### 3. 화면과 서버 잇기
1. GitHub 저장소 **Settings → Secrets and variables → Actions → Variables → New repository variable**
   - `SERVER_URL` = 2-3의 Render 주소
   - (선택) `KEEP_WARM` = `true` → 평일 08~16시에 10분마다 서버를 깨워 둬요 (.github/workflows/wake.yml)
2. **Actions** 탭 → "화면 배포 (GitHub Pages)" → **Run workflow** (한 번 다시 배포)
3. 선생님 화면: `https://<아이디>.github.io/joyful-quiz/teacher.html` · 학생: `https://<아이디>.github.io/joyful-quiz/` (대기실 QR도 이 주소)

## 수업 날
- 수업 5분 전에 선생님 화면을 열어 왼쪽 아래가 **🟢 서버 준비 완료** 인지 봐요. 🟡 이면 30초~1분 기다리면 깨어나요 (무료 서버는 15분 동안 아무도 안 쓰면 잠들어요. KEEP_WARM을 켜면 수업 시간엔 깨어 있어요).
- 퀴즈 세트는 선생님 브라우저에 저장돼요. 다른 PC에서 쓰려면 엑셀로 옮기세요.
- 💾 기록 폴더를 연결해 두면 결과가 그 폴더에 자동으로 모여요.

## 교실 PC로만 쓰기 (인터넷 없이)
`시작하기.cmd` → 같은 와이파이 학생이 대기실 주소·QR로 들어와요. 학교망이 기기끼리 연결을 막으면 위 배포 방식이나 `인터넷으로_열기.cmd`(cloudflared 임시 주소)를 쓰세요.

## 업데이트
코드를 고친 뒤 `git push` 하면 GitHub Pages(화면)와 Render(서버)가 각각 자동으로 다시 배포돼요.
