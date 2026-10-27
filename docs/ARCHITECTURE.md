# 즐거운 퀴즈 구조 (개발자용 계약서)

## 원칙
- 학생 기록은 **서버 디스크에 쓰지 않는다.** 방(room)은 서버 메모리에만 있고, 교사가 끝내면 곧바로 지우며, 4시간 지나면 자동으로 지운다.
- 모든 응답 기록은 그때그때 교사 브라우저로 보내고(`log` 이벤트), 교사 브라우저가 기록을 모아 **교사 PC에 파일로 저장**한다(JSON 기록 파일 + 엑셀).
- 정답은 서버만 안다. 학생에게는 정답 없이 문제·보기만 보낸다. 채점은 서버.
- 의존성: socket.io(서버·클라이언트), three.js(카트 3D), SheetJS(엑셀), qrcode-generator(QR). 빌드 도구 없음. 브라우저는 ES module.

## 폴더
```
server.js                 HTTP 정적 파일 + socket.io + 방 관리 (메모리)
server/quiz.js            문제 정리·보기 섞기·채점 (Node/브라우저 공용 아님, 서버 전용)
server/modes/<id>.js      게임 방식별 서버 규칙
public/index.html         학생 입장
public/teacher.html       교사 화면 (문제 → 게임 → 방 → 진행 → 결과)
public/analyze.html       분석실 (기록 파일 여러 개 열기, 서버 통신 없음)
public/guide.html         사용법
public/js/common.js       공용: $, esc, store, sound, QuizCard, 아바타
public/js/student.js      학생 셸: 입장·꾸미기·대기 → 모드 모듈 mountStudent
public/js/teacher.js      교사 셸: 문제표·AI 프롬프트·엑셀·모드 선택·대기실 → 모드 모듈 mountTeacher
public/js/record.js       기록 파일 만들기/저장 (File System Access API, 없으면 다운로드)
public/js/modes/<id>.js   모드별 화면: export mountStudent(el, ctx), mountTeacher(el, ctx)
public/vendor/            three.module.min.js, xlsx.full.min.js, qrcode.js
public/assets/            모델(glb), 이미지
```

## 문제 형식 (교사 → 서버)
```js
{ q: '문제', answers: ['정답', '같은뜻정답'], wrong: ['오답1','오답2','오답3'], explain: '해설(선택)' }
```
- wrong 이 비면 단답형. 정답이 O/X 이고 wrong 이 비면 OX 문제(보기 O, X).
- 태블릿 학생(`device:'touch'`)에게 단답형은 다른 문제 정답 3개를 섞어 객관식으로 보낸다.

## 학생에게 보내는 문제
```js
{ qid: 3, q: '문제', kind: 'mc'|'ox'|'short', choices: ['..','..'] | null, time: 20 }
```
학생 → `answer` `{ qid, given }` (`given`: 보기 글자 그대로 또는 입력한 글자)
서버 → `{ ok, correct: '정답 글자', explain }`

## 소켓 이벤트 (공통)
교사: `t:create {title, mode, settings, questions}` → ack `{code, key}` / `t:rejoin {code,key}` / `t:start` / `t:end` / `t:kick {pid}` / `t:lobby`(같은 방 다시 대기실) / `t:close`(방 삭제) / `t:mode {type, data}`(모드 전용 조작)
학생: `s:join {code, name, device, avatar, token?}` → ack `{ok, pid, token, room}` / `s:avatar {avatar}` / `s:ask` (자율 진행 모드에서 다음 문제 요청) / `s:answer {qid, given}` / `s:mode {type, data}`(모드 전용)
서버 → 모두: `room {code,title,mode,state,settings,players:[{pid,name,avatar,team,online}]}` / `m {type,data}`(모드 전용 방송) / `end {ranking}`
서버 → 교사만: `log {pid,name,qid,ok,given,ms,t}` / `feed {text}`
서버 → 학생: `q {...문제}` / `graded {...}` / `m {type,data}` / `kicked`

## 서버 모드 모듈 인터페이스
```js
export default {
  id: 'live', name: '골든벨 라이브',
  selfPaced: false,                 // true 면 학생이 s:ask 로 문제를 스스로 받음
  settings(input) => 정리된 설정,
  start(room, api),                 // 출발
  onAnswer(room, player, result, api),  // 채점 결과가 나온 뒤(자율 진행 모드)
  onStudent(room, player, type, data, api),
  onTeacher(room, type, data, api),
  tick(room, api, dtMs),            // 100ms마다 (state==='play')
  ranking(room) => [{pid, name, score, rank, extra}],
  snapshot(room, player|null) => 다시 접속한 사람에게 보낼 현재 모드 상태
}
```
api: `toAll(type,data)`, `toTeacher(type,data)`, `toPlayer(pid,type,data)`, `feed(text)`, `ask(player, qi?)`(문제 보내기), `grade(player, qid, given)`(채점·기록, 결과 반환), `end()`, `players()`.

## 기록 파일 (교사 PC에 저장)
```js
{ app: 'joyful-quiz', v: 1, id, title, unit, mode, modeName, startedAt, endedAt, settings,
  questions: [{qid, q, answers, wrong, explain, kind}],
  players: [{pid, name}],
  answers: [{pid, qid, ok, given, ms, t}],
  ranking: [{pid, name, score, rank}] }
```
파일 이름: `즐거운퀴즈_<제목>_<YYYY-MM-DD_HHmm>.json` (+ 같은 이름의 .xlsx)

## 브라우저 모드 모듈 (public/js/modes/<id>.js)
```js
export function mountStudent(el, ctx) { ...; return () => {/* 정리 */} }
export function mountTeacher(el, ctx) { ...; return () => {} }
```
학생 ctx:
- `socket`, `me {pid,name,avatar,device}`, `room`(최신 방 정보, 셸이 갱신), `snapshot`(다시 접속했을 때 모드 상태, 없으면 null)
- `on(type, fn)` → 해제 함수. 서버의 `m {type,data}` 를 받음
- `onRoom(fn)`, `send(type, data)` → Promise(ack) (`s:mode`)
- `ask()` → Promise<문제 view|null> (`s:ask` 후 `q` 를 기다림, 자율 진행 모드)
- `answer(qid, given)` → Promise<채점 결과> (`s:answer`)
- `quiz(opts)` → Promise<결과|null>: ask + showQuiz(문제 카드) + answer 한 번에. opts 는 common.js `showQuiz` 옵션(label, extra, okDelay, container 등)
- `onQuestion(fn)`: 서버가 밀어 주는 문제(교사 진행형)
- `sound`, `music`, `toast`, `showQuiz` (common.js 것)
- 게임이 끝나면(`end`) 셸이 정리 함수를 부르고 결과 화면을 띄움.

교사 ctx:
- `socket`, `room`, `onRoom(fn)`, `on(type, fn)`, `send(type, data)` → Promise (`t:mode`)
- `questions`(정답 포함 전체 문제, 서버가 정리한 것과 같은 순서·qid), `log`(지금까지의 응답 배열), `onLog(fn)`, `onFeed(fn)`, `snapshot`
- `sound`, `music`, `toast`, `end()` → 게임 끝내기
- 화면: el 은 화면 전체(대형 TV/전자칠판용). 큰 글씨.

## v0.2 추가 (2026-10-26)
- 게임 방식 자동 등록: `server.js`의 `MODE_IDS` 목록 순서대로 `server/modes/<id>.js`가 있으면 불러온다. 화면 쪽 소개·설정은 `public/js/modes/info.js`.
- 별명 모드 (`settings.nick`): 학생 `p.name` = 친구들에게 보이는 별명(서버가 만듦), `p.realName` = 입력한 이름. 응답 기록(`log.name`)과 교사용 순위(`ranking.name`, `nick`)는 실제 이름. 학생에게 가는 `room`·`end`에는 별명만.
- `roomInfo(room, teacher)`: 교사에게만 `players[].realName`. `room.locked` + `t:lock {locked}`: 잠기면 새 학생 입장 거절(토큰 복귀는 허용).
- 인터넷 배포: `TEACHER_PIN`(있으면 `t:create`에 `pin` 필요, 틀리면 `{error, pin:true}`), `PUBLIC_URL`(학생 QR 주소). `/api/info` → `{version, lan, publicUrl, pinRequired, modes}`.
- 아바타 `{char, face, color, hat, kart}`: `char`는 `public/js/chars.js`의 스티커 친구 id (그림 `assets/chars/<id>.png`, 없으면 이모지).
- `public/js/fx.js`: 게임 손맛 효과 (light / medium / heavy / stamp / float / shake). 학생·교사 ctx에 `fx`로도 넘긴다.
- `public/js/album.js`: 학생 기기 localStorage 스티커북 (칭찬 도장 → 스티커 뽑기). 서버로 보내지 않음.
- 정적 파일 캐시: `vendor/`·`assets/`는 하루, 나머지(js·css·html)는 매번 확인(Last-Modified/304).
