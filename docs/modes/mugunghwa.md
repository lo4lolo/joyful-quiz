# 🌸 무궁화 꽃이 피었습니다 (mugunghwa)

서버 `server/modes/mugunghwa.js` · 화면 `public/js/modes/mugunghwa.js` + `public/css/mugunghwa.css` · 검사 `tests/mugunghwa.test.mjs`

## 규칙
- 시작하면 모둠을 정한다 (`settings.teams`, 0 = 대기실 모둠 그대로). 모둠마다 **말 하나**가 마당 길 0칸에서 술래(D칸)까지 간다. 사람이 없는 모둠은 쉰다.
- 술래 박자 (서버가 정하고 남은 ms로 방송):
  - **준비** 3초 → **노래(초록)** 4~8초 (글자가 나타나는 빠르기가 매번 다름: 고르게 / 느리다 빨리 / 중간에 쉼 / 빠르다 느리게) → **돌아봄(빨강)** 3초 → 다시 노래.
  - 선생님 "🔁 술래 속도": 느리게 ×1.3 · 보통 ×1 · 빠르게 ×0.72 (다음 노래부터).
- 문제는 언제든 받아 읽을 수 있지만 **답은 노래 때만** 인정. 학생 화면은 마지막 글자 '다'가 나오면(돌아보기 0.2초 전) 답 버튼을 얼린다.
- **들켰다**: 돌아본 뒤 0.25초가 지나 도착한 답(맞든 틀리든), 또는 돌아본 지 0.5초 지나 화면을 누름(`s:mode 'tap'`) → 그 학생의 **발자국만** −1 (0 아래로는 안 감). 모둠 말은 그대로, 탈락 없음. 한 번 돌아볼 때 한 번만 센다. 들킨 답은 걸음에 들어가지 않는다.
- **걸음 (협력 규칙)**: 노래가 끝나면(돌아본 뒤 0.25초) 모둠 말은 그 노래 동안 정답을 낸 **서로 다른 모둠원 수**만큼 간다(한 학생은 한 노래에 한 번). 온라인 모둠원이 **모두** 맞히면 **💞 한마음 +1**.
- **술래 치기**: 말이 술래(D칸)에 닿으면, 한 노래 안에 **온라인 모둠원 모두**가 한 번씩 맞혀야 도착 (마지막 사람이 맞히는 순간 바로 도착). 학생 화면에 "아직: 이름…"이 보인다(모둠 안에서만, TV에는 숫자만).
  - 봐주기: 술래 치기를 6번의 노래 동안 못 하면 7번째 노래부터 "한 명 빼고 모두"로 도착 (한 학생 때문에 영영 못 끝나는 일 방지).
- **손 내밀기**: 도착한 모둠 학생의 정답은 하나마다 **아직 술래 앞에 닿지 않은 모둠 가운데 가장 뒤 모둠**에게 +1걸음 (다음 정산 때 함께 이동).
- 모든 모둠 도착 → 우리 반 승리 → 1.6초 뒤 끝. 시간 끝 → "다음엔 꼭!" → 끝.

## 숫자
- 거리 D = K × (한 모둠 평균 인원), K: 짧게 16 · 보통 32 · 길게 50 (최소 8칸).
- 시뮬레이션 (25명·6모둠, 정답률 70%, 문제 하나 생각 4~10초, 결과 화면 0.9/2.2초, 술래 치기·봐주기 포함, 200번 평균):
  짧게 D=67 → 약 4.8분 · 보통 D=133 → 약 8.2분 · 길게 D=208 → 약 12분. 생각이 빠르면(3~8초) 4.3/7.5/11분, 느리면(5~13초) 5.8/9.9/14분.
  12명(6모둠×2명)은 한마음이 잘 나와 약 25% 빠르다.
- 제한 시간 6/10/15분 (기본 10), 문제 시간 설정(time)은 기록용으로만 쓰고 학생 문제에는 타이머가 없다 (노래 박자가 타이머). 15초 동안 못 풀면 "🤔 모르겠어요 · 다음 문제" 버튼(빈 답 = 오답으로 기록, 정답 알려 줌).

## 연구 원리 적용 (docs/COOP_DESIGN.md)
1. 전원 대 게임: 모든 모둠이 술래에게 가야 이김. 손 내밀기로 앞선 모둠이 뒤 모둠을 끌어 준다.
2. 개인 기여 = 공동 진행의 필요 조건: 걸음 = 서로 다른 모둠원 수, 술래 치기 = 모둠 전원.
3. (역할 돌기는 이 놀이에 없음 — 술래는 앱.)
4. 개인 순위 없음: TV는 모둠 말·이번 노래 점(●○)만, 학생은 "우리 모둠 + 내 발자국". `ranking` extra.noRank.
5. 탈락 없음: 들켜도 내 발자국 한 걸음만 뒤로, 모둠은 그대로.
6. 앱은 박자(timing)·무작위(노래 빠르기)·기억(누가 맞혔나)만.

## 메시지
- 서버→모두 `m`: `phase {phase:'ready'|'green'|'red', left, round, speed, timeLeft, D, chant:{dur,marks,style}|null, teams?}` · `board`(1초, + teams, cur) · `prog {round, cur:[[pid]], helps:[{from,to}]}`(0.3초 묶음) · `move {round, moves:[{i,steps,distinct,all,help,pos,tag}], teams}` · `arrive {i,order,name,emoji,color,teams}` · `oops {team}`(이름 없음) · `speed {speed}` · `result {win, arrived, total, rounds, teams, text}`
- 서버→학생 `ans {state:'counted'|'tag'|'dup'|'wrong'|'help'|'cheer'|'caught'|'early', to?, me}`
- 학생 `s:mode 'tap'` → ack `{ok, caught, me?}` · 선생님 `t:mode 'speed' {v:'slow'|'normal'|'fast'}` → ack `{ok, speed}`
- 스냅숏: `phase/left/round/speed/timeLeft/D/chant/teams/cur/over/me{team,contrib,steps,caught,helps,correct,answered,counted}`

## 연구 기록 (api.event)
- `shared` (노래마다, 도착 안 한 모둠마다): `{team, distinct, all, needed, phase, steps, help, tag?}`
- `caught` (pid): `{team, via:'answer'|'tap', phase}`
- `help` (pid): `{team, toTeam, phase}`
- `round`: `{team, tag:true, phase}` — 모둠이 술래 앞에 닿음
- `teamGoal`: `{team, order, phase, tries, mercy, ms}` · `classGoal`: `{ms, rounds, teams}`
- ranking extra: `{noRank, team, teamName, contrib, teamContrib, share, classWin, caught, helps, steps, arrived, order, rounds, correct, answered}`; score = contrib (걸음·도착·손 내밀기에 쓰인 정답 수)
