# ⚔️ 뿅망치 대결 (royale)

선생님이 한 문제씩 진행하는 1대1 대결. 문제마다 살아 있는 학생을 둘씩 짝지어, 같은 문제를 더 빨리·정확히 푼 사람이 이겨요.
파일: `server/modes/royale.js`, `public/js/modes/royale.js`, `public/css/royale.css`, 검사 `tests/royale.test.mjs`.

## 규칙
- **짝짓기**: 문제마다 살아 있는 학생을 무작위로 짝지어요. 바로 앞 판과 같은 짝·같은 부전승은 되도록 피해요.
  - 접속이 끊긴 학생은 끊긴 학생끼리 먼저 짝지어요(답을 못 내면 진 것). 그래서 혼자 남는 사람은 늘 접속한 학생이에요.
  - 혼자 남으면: 응원석(탈락) 학생이 있으면 **유령 👻** 과 겨뤄요(유령은 잃을 것도 얻을 것도 없음). 없으면 **🍀 부전승**(하트 그대로).
- **판정** (정답 공개 때)
  - 둘 다 맞힘 → 더 빠른 사람 승 / 한 명만 맞힘 → 그 사람 승 / 둘 다 틀림·안 냄 → **둘 다 뿅!** (둘 다 하트 -1)
  - 진 사람 하트 -1. 하트 0 → **👻 응원석**. 응원석에서도 문제는 계속 받아 풀어요(기록에 남고 결과엔 영향 없음).
  - 이번 판에 살아 있던 모두가 마지막 하트를 잃으면 아무도 탈락하지 않고 하트 1개로 남아요.
  - 한 명만 남으면 **🏆 챔피언** → 공개 화면에 챔피언 발표, 다음 버튼을 누르면 결과.
- 문제 중에 접속이 끊기면 답을 안 낸 것. 단, 새로고침·와이파이 끊김을 대비해 **8초**는 기다려 줘요(그 안에 다시 들어오면 같은 문제를 이어서 풀고, 걸린 시간은 처음 받은 때부터 재요).
- 게임 중에 처음 들어온 학생은 응원석에서 시작(첫 문제 전이면 정식 참가). 💖 모두 부활로 함께할 수 있어요.

## 점수
승리 +100, 빠르기 보너스 최대 +50(제한 시간 기준), 상대를 응원석으로 보내면 +200, 부전승에서 맞히면 +50.
순위: 챔피언 → 살아 있음 → 하트 → 승 → 점수 (같으면 늦게 탈락, 맞힌 수). ranking `extra`: `{alive, hearts, wins, correct, answered, eliminatedRound, champion}`.

## 설정 (info.js)
하트 2·3(기본)·5개, 문제 순서 섞기(기본 켬), 제한 시간.

## 선생님 조작
시작 ▶ / 정답 공개 ⏭ / ⏱ +10초 / 🏆 순위 보기 / 다음 문제 ▶ (마지막·챔피언이면 결과 보기 🏁) / 💖 모두 부활(응원석 학생 모두 하트 1개로, 챔피언 취소).
모두(접속한 학생 + 8초 안에 끊긴 학생)가 답하면 0.6초 뒤 자동 공개, 마감이 지나도 자동 공개.
TV 공개 화면은 대결 카드가 많으면 화면에 맞게 줄여요(최소 55%).

## 이벤트 (`m {type,data}`)
- 모두: `phase` {phase: ready|question|reveal|board, …}, `deadline` {deadline}, `revive` {n, alive, champion}
- 학생 각자: `duel` (문제 직전 내 역할 role: duel|vsGhost|ghost|bye|cheer|wait, opp, hearts…), `me` (부활 뒤 상태), `result` (outcome: win|lose|double|bye|ghostWin|ghostLose|cheer|wait …)
- 교사: `count` {answered, total}
- 교사 `t:mode` type: `ask` `reveal` `time` `board` `revive` `next`
- snapshot: 학생 `{last, me, answered, result}`, 교사 `{last, answered, need}`

## 그림
`assets/icons/hammer.png`, `heart.png`, `assets/modes/royale.png` 가 있으면 쓰고, 없으면 🔨 ❤️ ⚔️ 이모지로 보여요.
