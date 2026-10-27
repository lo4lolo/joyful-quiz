@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 즐거운 퀴즈 서버
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js 가 필요해요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
if not exist "node_modules\socket.io\package.json" (
  echo 처음 실행이라 필요한 파일을 내려받아요. 인터넷이 필요해요...
  call npm install --omit=dev
)
start "" http://localhost:3030/teacher.html
node server.js
pause
