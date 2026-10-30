@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 즐거운 퀴즈 v0.6 서버
set "JQ_NODE=node"
if exist "runtime\node.exe" set "JQ_NODE=%~dp0runtime\node.exe"
"%JQ_NODE%" --version >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js가 필요해요. runtime 포함 배포본을 쓰거나 https://nodejs.org 에서 LTS를 설치하세요.
  pause
  exit /b 1
)
"%JQ_NODE%" -e "import('socket.io').catch(() => process.exit(1))" >nul 2>nul
if errorlevel 1 (
  echo 필요한 파일이 빠져 있어 복구합니다. 인터넷이 필요해요.
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo [!] 복구에 실패했어요. 인수인계서의 다른 PC 실행 안내를 확인하세요.
    pause
    exit /b 1
  )
)
"%JQ_NODE%" tools\doctor.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
if not defined PORT set "PORT=3030"
start "" /b "%JQ_NODE%" tools\open-teacher.mjs
"%JQ_NODE%" server.js
pause
