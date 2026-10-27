# 3D 모델·렌더 이미지 목록

Blender 5.2(헤드리스 Python)로 만든 오리지널 로우폴리 파스텔 에셋입니다. 텍스처 없이 Principled BSDF 단색 재질만 씁니다. 아이템 상자만 정점색(COLOR_0)을 씁니다.

## 좌표 규칙 (three.js 기준)
- 앞쪽 **+Z**, 위쪽 **+Y**, 단위 1 = 1 m
- 원점은 바닥 중앙(바퀴·밑면이 y=0). 예외: `itembox.glb`는 상자 중심이 원점입니다.
- 카트 운전자 기준 왼쪽은 **+X**입니다(`Wheel_FL`의 x 값이 +0.58).

## 모델 (`public/assets/models/`)
| 파일 | 크기 | 삼각형 | 노드 | 재질 | 크기/비고 |
|---|---|---|---|---|---|
| kart.glb | 58.7 KB | 2428 | `Kart` > `Body`, `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR`, `Seat`(empty) | `Paint`, `Trim`, `Tire`, `Metal` | 길이 2.26 x 폭 1.56 x 높이 1.07. 바퀴 원점은 각 바퀴 중심이라 `rotation.x`로 굴리면 됩니다. 앞바퀴 반지름 0.26, 뒷바퀴 0.30. `Seat` 위치는 (0, 0.63, -0.30)입니다. |
| driver.glb | 52.3 KB | 2140 | `Driver` > `DriverBody` | `Suit`, `Skin`, `Helmet`, `Eye`, `White`, `Cheek`, `Lens` | 높이 0.94. 원점은 엉덩이가 좌석에 닿는 점이라 `Seat` 노드에 그대로 붙이면 됩니다. 손은 핸들 위치에 있습니다. |
| itembox.glb | 79.1 KB | 1916 | `ItemBox` > `ItemBoxMesh` | `Box`(정점색 무지개), `Mark`(흰 "?") | 1.3 정육면체, 원점은 중심. 여섯 면 모두에 "?"가 있습니다. |
| gate.glb | 74.7 KB | 2656 | `Gate` > `GateMesh` | `Banner`(물들일 재질), `Pillar`, `Stripe`, `Base`, `Ball`, `Mark` | 폭 15.2(기둥 안쪽 간격 12.5, 12 m 도로용), 높이 5.6. 앞뒤 노란 배지에 "?"와 별이 있습니다. |
| finish.glb | 70.1 KB | 2260 | `Finish` > `FinishMesh` | `CheckWhite`, `CheckBlack`, `Frame`, `Pillar`, `Stripe`, `Base`, `Ball`, `Flag` | 체크 현수막 폭 14(기둥 바깥까지 16.8), 높이 6.8. 체크 무늬는 실제 메쉬 칸입니다. |
| banana.glb | 21.7 KB | 864 | `Banana` > `BananaMesh` | `Peel`, `Fruit`, `Tip` | 약 0.6 x 0.6 x 0.48. 바닥에 놓인 껍질 깐 바나나입니다. |
| cone.glb | 15.4 KB | 504 | `Cone` > `ConeMesh` | `Cone`, `Stripe`, `Base` | 높이 0.70 |
| tree_round.glb | 27.4 KB | 356 | `TreeRound` > `TreeRoundMesh` | `Trunk`, `Leaf` | 높이 4.0 막대사탕 나무. 잎은 각진 면입니다. |
| tree_pine.glb | 5.6 KB | 76 | `TreePine` > `TreePineMesh` | `Trunk`, `Leaf` | 높이 5.0 |
| rock.glb | 8.7 KB | 100 | `Rock` > `RockMesh` | `Rock` | 약 1.7 x 1.1 x 1.0 (큰 돌 1 + 작은 돌 1) |
| cloud.glb | 25.5 KB | 1372 | `Cloud` > `CloudMesh` | `Cloud`(흰색, 살짝 발광) | 폭 6.6, 높이 2.9. 원점은 밑면 중앙입니다. |
| chest.glb | 18.8 KB | 644 | `Chest` > `Base`, `Lid` | `Wood`, `Gold` | 폭 1.05, 높이 0.87. `Lid` 원점은 뒤쪽 경첩 (0, 0.5, -0.35)입니다. 열 때는 `lid.rotation.x = -1.9`처럼 **음수**로 돌립니다. |

모델 합계는 약 458 KB입니다. 카트와 운전자를 합치면 4568 삼각형입니다.

## 색 입히기(학생별)
- 물들일 재질은 `Paint`(카트), `Suit`·`Helmet`(운전자), `Banner`(게이트)입니다. `Paint`·`Suit`·`Helmet`은 흰색 바탕이고 `Banner`는 연분홍입니다. `mesh.material.color.set(tint)`로 바꿉니다.
- 같은 GLB를 여러 번 쓰면 재질이 공유되므로, 학생마다 `material.clone()` 후 색을 바꿉니다. `Paint`는 `Body`와 네 바퀴 허브 캡이 함께 씁니다.
- 모든 재질은 `doubleSided: true`로 나갑니다(Blender 기본값). 헬멧이 열린 껍데기라 그대로 두었습니다.

## 이미지 (`public/assets/img/`, Eevee 렌더)
| 파일 | 크기 | 내용 |
|---|---|---|
| chest_wood.png | 119 KB | 512², 투명 배경, 나무+금 상자(닫힘) |
| chest_silver.png | 113 KB | 512², 은빛 파랑 상자 |
| chest_gold.png | 122 KB | 512², 금 상자+분홍 띠 |
| chest_open.png | 118 KB | 512², 열린 나무 상자, 빛나는 동전과 반짝이 |
| coin.png | 30 KB | 256², 별 금화 |
| kart_hero.png | 323 KB | 1024x768, 투명 배경, 분홍 카트+곰 운전자 |
| lobby_bg.jpg | 100 KB | 1920x1080, JPEG q80. 하늘, 구름, 언덕, 트랙, 카트 3대, 퀴즈 게이트, 결승 아치. 가운데는 비워 두었습니다. |

## 다시 만들기
PowerShell에서 `48_즐거운 퀴즈` 폴더 기준으로 실행합니다.
```powershell
$b = "C:\Users\경남교육청\blender-portable\Blender Foundation\Blender 5.2\blender.exe"
& $b -b --python-exit-code 1 --python tools\blender\build_all.py            # GLB 전부 + 검사 출력
& $b -b --python-exit-code 1 --python tools\blender\build_all.py -- kart chest   # 일부만
& $b -b --python-exit-code 1 --python tools\blender\render_images.py        # PNG/JPG 전부 (chest coin hero lobby)
& $b -b --python-exit-code 1 --python tools\blender\render_images.py -- lobby
python tools\blender\validate.py                                            # GLB 검사만 (Blender 없어도 됨)
```
- `tools/blender/lib.py`: 도형 합치기(Builder), 재질, 내보내기, 렌더 도우미
- `tools/blender/assets.py`: 모델별 `build_*()` 함수(치수와 색은 여기서 고칩니다)
- `tools/blender/render_images.py`: 상자/동전/히어로/로비 장면
- "?" 글자는 Windows 글꼴(Arial Rounded MT Bold)을 메쉬로 바꾼 것입니다. 이 글꼴이 없는 PC에서는 Blender 내장 글꼴로 대신 만듭니다.

## v0.2 스티커 그림 (`public/assets/chars|modes|fish|boss|icons/`, Eevee 렌더)
"칭찬 스티커 공책" 방향에 맞춘 오리지널 그림입니다. 모든 메쉬에 **잉크 테두리**(#1B2A4A, 뒤집힌 껍데기 = Solidify + 뒷면 숨김)를 넣어 렌더했습니다. 흰 테두리와 단단한 그림자는 CSS가 더하므로 그림에는 바닥 그림자·배경이 없습니다(게임 상자 표지만 배경 있음). PNG는 모두 RGBA 8비트이고, 색을 128단계로 줄인 뒤 Paeth 필터 + zlib 9로 다시 저장해 크기를 줄였습니다(눈으로는 차이 없음).

| 폴더 | 크기 | 개수 | id | 비고 |
|---|---|---|---|---|
| `chars/` | 512², 투명 | 16 | 일반 `cat dog bunny bear panda fox frog penguin hamster chick` · 희귀 `tiger koala octopus dino` · 전설 `unicorn dragon` | 꼬마 2.5등신, 앞 3/4, 여백 8%. 희귀는 소품(호랑이 목도리, 코알라 잎, 문어 선원 모자, 공룡 알껍데기 모자), 전설은 빛나는 뿔/보석 + 반짝이 별 |
| `modes/` | 800x500, 둥근 모서리(30px 투명) | 8 | `race live chest territory shop fishing raid royale` | 그라데이션 하늘 + 둥근 섬/무대. 상자마다 바탕색이 다름(파랑·포도·민트·레몬·코랄·하늘·보라·주황) |
| `fish/` | 256², 투명, 옆모습(머리 왼쪽) | 14 | 일반 `minnow goldfish carp mackerel` · 고급 `pufferfish clownfish squid` · 희귀 `swordfish octopus2 whale_baby` · 에픽 `rainbow_trout golden_koi` · 쓰레기 `boot can` | 에픽은 반짝이 별 |
| `boss/` | 768², 투명 | 6 | `slime_king rock_golem cloud_dragon` + 각 `_hurt` | `_hurt`는 ">_<" 눈, 물결 입, 살짝 찌그러짐, 별·땀방울. **보통/아픔 두 장은 같은 카메라**라 바꿔 끼워도 위치·크기가 그대로입니다 |
| `icons/` | 256², 투명 | 13 | `coin coins_stack per_question streak multiplier insurance gift rocket magnet hourglass star hammer heart` | 상점·파워업 아이콘 |

### JSON
- `chars/chars.json`: `[{ "id": "cat", "name": "냥냥이", "rarity": "common", "emoji": "🐱" }, ...]` (rarity = `common` / `rare` / `legendary`)
- `fish/fish.json`: `[{ "id": "minnow", "name": "송사리", "rarity": "common", "weightMin": 0.01, "weightMax": 0.05 }, ...]` (kg, rarity = `common` / `uncommon` / `rare` / `epic` / `junk`)
- `boss/boss.json`: `[{ "id": "slime_king", "name": "슬라임 킹", "color": "#4FB8FF" }, ...]` (아픈 그림은 `<id>_hurt.png`)

### 다시 만들기
```powershell
$b = "C:\Users\경남교육청\blender-portable\Blender Foundation\Blender 5.2\blender.exe"
& $b -b --python-exit-code 1 --python tools\blender\build_v2.py -- all            # 전부(약 7분) + 검사 + 모음 시트
& $b -b --python-exit-code 1 --python tools\blender\build_v2.py -- chars          # 그룹 하나: chars | modes | fish | boss | icons
& $b -b --python-exit-code 1 --python tools\blender\build_v2.py -- chars cat fox  # 일부 id만
& $b -b --python-exit-code 1 --python tools\blender\build_v2.py -- verify         # 크기·RGBA·용량 검사 + docs/screenshots/v2-art-sheet.png
```
- `tools/blender/v2lib.py`: 잉크 테두리, 조명(키+채움+림), 직교 카메라 자동 맞춤, 얼굴 붙이기(`Ell`, `Face`), 부드러운 관(`sweep`), 판(`poly`), PNG 후처리·검사·모음 시트
- `tools/blender/v2_chars.py` · `v2_fish.py` · `v2_boss.py` · `v2_icons.py`: 모양 함수(색·크기는 여기서). `v2_chars.POSE['arms']`로 장면 속 팔 자세를 바꿉니다
- `tools/blender/v2_modes.py`: 게임 상자 장면. 예전 `assets.py` 모델(카트, 게이트, 아이템 상자, 보물 상자, 나무, 구름, 바위)도 다시 씁니다
- 모음 시트: `docs/screenshots/v2-art-sheet.png` (종이색 #EEF6FF 위 전체 그림)

## v0.3 전통놀이 그림 (`public/assets/trad/` + `modes/tug|mugunghwa|yut.png`, Eevee 렌더)
v0.2와 같은 방식(잉크 테두리 #1B2A4A, 키·채움·림 조명, 직교 카메라 자동 맞춤, PNG RGBA 8비트·128단계 다시 저장)으로 만든 오리지널 그림입니다. 색은 오방색을 앱 색으로 부드럽게 바꿔 씁니다: 청 #3D8BFF · 적 #FF6F61 · 황 #FFC83D · 백 #FFFFFF · 흑 → 남색 #3A4673(잉크 테두리와 구분), 바탕 한지 #F7EEDB. 무섭거나 싸우는 느낌은 넣지 않았습니다(큰 인형·가면·관·분홍 옷 없음).

| 파일 | 크기 | 비고 |
|---|---|---|
| `team_<id>.png` | 256², 투명 | 모둠 배지 6개. 둥근 배지(팀 색 테두리 + 연한 안쪽 + 흰 선 + 단청 점) 안에 아기 동물 상반신. `cheongryong` 파란 아기용(여의주) · `baekho` 흰 호랑이 · `jujak` 빨간 아기 주작(불꽃 볏) · `hyeonmu` 거북이 + 목도리처럼 감은 아기 뱀 · `bonghwang` 노란 봉황(오색 깃털 부채) · `haechi` 민트 해치(뿔 하나, 곱슬 갈기, 방울) |
| `sulae_back.png` / `sulae_look.png` | 768², 투명 | 무궁화 꽃이 피었습니다 술래: 꼬마 도깨비(작은 뿔, 배자 조끼, 색동 소매, 방망이 대신 무궁화 꽃)와 꽃 핀 나무. back = 나무 보고 눈 가리고 노래(음표), look = 돌아서서 큰 눈 + 손가락으로 가리킴. **두 장 같은 카메라**라 바꿔 끼워도 위치·크기가 같음 |
| `mugunghwa.png` | 256², 투명 | 무궁화 아이콘 (분홍보라 꽃잎 5장, 붉은 단심, 꽃술, 잎 2장) |
| `finish_rope.png` | 1024x128, 투명 | 결승 줄: 흰·빨강 꼰 줄 + 오방색 리본 9개, 양끝 매듭·술 |
| `rope.png` | 1600x160, 투명 | 줄다리기 짚 동아줄(3가닥 꼼). 1600px 안에 꼬임 10번이고 양끝이 잘려 있어 **가로로 이어 붙일 수 있음** |
| `rope_center.png` | 256², 투명 | 가운데 표시 리본 (왼쪽 청 / 오른쪽 홍, 노란 매듭) |
| `tug_left.png` / `tug_right.png` | 768x512, 투명 | 줄 당기는 3명. 왼쪽 = 고양이·곰·개구리(파란 머리띠, 줄이 오른쪽 가장자리로 이어짐), 오른쪽 = 토끼·멍멍이·판다(빨간 머리띠, 줄이 왼쪽 가장자리로 이어짐). v2 스티커 친구를 그대로 씀 |
| `yut_front.png` / `yut_back.png` / `yut_backdo.png` | 256x512, 투명 | 윷가락. front = 평평한 면(갈색 X 3개), back = 둥근 등(단청 띠), backdo = 빨간 X 하나. 세 장 같은 카메라 |
| `yut_board.png` | 1024², 투명(바깥) | 위에서 본 윷판: 한지 종이 + 단청 마름모 테두리 + 부드러운 잉크 선 + 돌 29개(모서리 4개·가운데는 크게). 정거장 위치는 `trad.json`의 `board.stations` |
| `mal_<color>.png` | 256², 투명 | 말 6색 `blue red yellow green white black`: 두툼한 둥근 말판 + 말머리 돋을새김 |
| `bg_madang.jpg` | 1920x1080, JPEG 85 (~180 KB) | 한옥 마당: 기와지붕·단청 들보·창호, 장독대(왼쪽), 큰 나무(오른쪽), 돌담, 가운데는 비운 흙마당 |
| `hanji.jpg` | 512², JPEG (~14 KB) | 이어 붙이는 한지 결(아주 연하고 대비 낮음, FFT 잡음 + 감싸는 섬유라 이음매 없음). numpy로 만듦 |
| `modes/tug.png` · `mugunghwa.png` · `yut.png` | 800x500, 둥근 모서리 | 게임 상자 표지 (바탕: 장미 분홍 / 분홍보라 / 단청 청록) |

### trad.json
`{ teams:[{id,name,color,file}], mal:[{id,color,file}], files:[…], modes:[…], board:{file,size,note,stations:[{id,x,y,big}]}, sulae, yut, rope }`
- 팀 색: 청룡 #3D8BFF · 백호 #8FA3C4 · 주작 #FF6F61 · 현무 #3A4673 · 봉황 #FFC83D · 해치 #2ED3A0
- 윷판 정거장: x, y 는 그림 대비 0~1(왼쪽 위 기준). 0 = 오른쪽 아래 모서리(출발), 반시계로 0..19 바깥 길(5 오른쪽 위, 10 왼쪽 위, 15 왼쪽 아래), 20·21 = 5→가운데, 22 = 가운데, 23·24 = 가운데→15, 25·26 = 10→가운데, 27·28 = 가운데→0

### 다시 만들기
```powershell
$b = "C:\Users\경남교육청\blender-portable\Blender Foundation\Blender 5.2\blender.exe"
& $b -b --python-exit-code 1 --python tools\blender\v3_trad.py -- trad                 # 전부(약 3분) + trad.json + 검사 + 모음 시트
& $b -b --python-exit-code 1 --python tools\blender\v3_trad.py -- trad team_haechi rope # 일부 (id: team_<id> sulae mugunghwa finish_rope rope rope_center tug_left tug_right yut hanji yut_board mal_<color> bg_madang cover_tug cover_mugunghwa cover_yut)
& $b -b --python-exit-code 1 --python tools\blender\v3_trad.py -- verify               # 크기·RGBA·용량 검사 + docs/screenshots/v3-trad-sheet.png
& $b -b --python-exit-code 1 --python tools\blender\build_v2.py -- trad [ids]          # build_v2.py 에서도 같음
```
- `tools/blender/v3_trad.py`: 배지·동물, 도깨비·나무·무궁화, 꼰 줄(`twisted_rope`), 윷·윷판·말, 한옥(`build_hanok`, 기와지붕 `roof`), 한지 텍스처, 표지 장면. `hanji`를 `yut_board`·`cover_yut`보다 먼저 만들어야 윷판에 한지 결이 들어갑니다(전부 만들기는 순서대로 함)
- `v2_chars.base()`의 팔 자세에 손 위치 `(x, y, z)`를 직접 넣을 수 있게 했습니다(줄 잡기). 기존 자세 이름은 그대로입니다
- 모음 시트: `docs/screenshots/v3-trad-sheet.png`
