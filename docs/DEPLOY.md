# 무료로 배포해서 실제로 쓰기 (GitHub Pages + Render 무료)

## 구조 — 왜 둘로 나눴나
| 맡은 일 | 어디 | 비용 |
|---|---|---|
| 화면·그림·글꼴 (학생·선생님·분석실·사용법) | **GitHub Pages** (전 세계 CDN) | 무료 |
| 실시간 게임 연결 (방·문제·채점) | **Render 무료 웹 서비스** | 무료 |

화면 파일을 GitHub이 보내 주니 무료 서버는 게임 연결만 맡아 가볍고, 분석실은 서버가 잠들어 있어도 열려요.
학생 기록은 어느 쪽에도 저장되지 않아요. 방은 서버 메모리에만 있다가 결과를 저장하면 응답 기록을 바로 지우고, 방을 닫으면 모두 지워요.

## 6학년 250명, 무료로 될까? (2026-10-26 직접 잰 값)
`node tools/loadtest.mjs grade 90` — 실제 수업처럼 9반 × 28명(252명)이 서로 다른 게임 9종을 **동시에** 90초 동안 했을 때:

| 항목 | 값 | 무료 한도 |
|---|---|---|
| 서버 CPU | i7-1260P 한 코어의 8.3% | Render 무료 0.1 CPU |
| 메모리 | 최대 174 MB | 512 MB |
| 응답 시간 | 보통 1 ms, 95% 4 ms, 99% 8 ms | — |
| 실제 네트워크 | 284 KB/s (= 1시간 약 1 GB) | 월 100 GB 안팎 |

한 반(28명)씩 잰 실제 네트워크 사용량 (KB/s): 골든벨 1.4 · 땅따먹기 4.3 · 보물 상자 10 · 퀴즈 부자 21 · 낚시 20 · 보스전 21 · 무궁화 21 · 줄다리기 34 · 윷놀이 37 · 카트 레이스 85.

**결론**
- **한 반씩 수업 (보통의 경우)**: 충분히 무료로 돼요. 한 반은 서버 CPU의 1~4%만 써요. 9반이 주 2번 40분씩 해도 한 달 네트워크 약 5 GB.
- **2~3반이 동시에**: 무료로 넉넉해요.
- **학년 전체 250명이 동시에**: 무료 서버(0.1 CPU)의 한계 근처예요. 될 수는 있지만 느려질 수 있어요. 학년 행사라면
  ① **골든벨 한 방에 250명** (설정 → 최대 인원 300명) — 가장 가벼운 게임이라 무료로 충분, 또는
  ② 카트 레이스는 빼고 반별 게임, 또는 ③ 그날만 Render 유료(Starter, 월 7달러 정도)로 올렸다 내리기.

이미 해 둔 최적화: 바뀐 것만 보내는 순위표, 학생용 가벼운 순위, 카트 위치 7Hz(화면은 부드럽게 이어 그림), 윷판 상태 0.5초 묶음, 1KB 넘는 메시지만 압축, 그림 WebP(9.5 MB → 1.5 MB), 화면은 GitHub CDN에서, 서버 잠 깨우기 표시.

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
