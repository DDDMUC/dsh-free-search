@echo off
chcp 65001 >nul
title DeepSeek Harness Web
setlocal

set "NODE_USE_ENV_PROXY=1"
set "HTTPS_PROXY=http://127.0.0.1:7897"
set "HTTP_PROXY=http://127.0.0.1:7897"
set "DSH_HOME=C:\Users\MVT\.dsh"
set "TOKEN_LOG=C:\Users\MVT\.dsh\dsh-web-auth.log"
set "TOKEN_ERR=C:\Users\MVT\.dsh\dsh-web-auth.err"

if exist "%TOKEN_LOG%" del /q "%TOKEN_LOG%"
if exist "%TOKEN_ERR%" del /q "%TOKEN_ERR%"

netstat -an | findstr /r /c:":3080 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\MVT\.dsh\tools\read-token-open.ps1"
    exit /b 0
)

echo Starting dsh web on port 3080...
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\MVT\.dsh\tools\start-dsh-3080.ps1"

endlocal
