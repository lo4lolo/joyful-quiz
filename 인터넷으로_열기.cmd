@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 즐거운 퀴즈 - 인터넷 주소로 열기
set CF=
if exist "tools\cloudflared.exe" set CF=tools\cloudflared.exe
if not defined CF where cloudflared >nul 2>nul && set CF=cloudflared
if not defined CF (
  echo [!] cloudflared 가 필요해요. 학생 기기가 교실 와이파이로 선생님 PC에 못 들어올 때만 쓰는 방법이에요.
  echo     1. https://github.com/cloudflare/cloudflared/releases 에서 cloudflared-windows-amd64.exe 를 받아요.
  echo     2. 이름을 cloudflared.exe 로 바꿔 이 폴더의 tools 폴더에 넣고 다시 실행해요.
  pause
  exit /b 1
)
set /p TEACHER_PIN=선생님 PIN을 정해요 (숫자, 방 만들기 잠금. 그냥 Enter 는 잠금 없음): 
start "즐거운 퀴즈 서버" cmd /k "set TEACHER_PIN=%TEACHER_PIN%&& node server.js"
timeout /t 2 >nul
echo.
echo 잠시 뒤 아래에 https://....trycloudflare.com 주소가 나와요.
echo 그 주소 + /teacher.html 을 선생님 브라우저로 열면 학생용 QR도 그 주소로 나와요.
echo 수업이 끝나면 이 창과 서버 창을 닫으세요. (주소는 실행할 때마다 바뀌어요)
echo.
%CF% tunnel --url http://localhost:3030
pause
