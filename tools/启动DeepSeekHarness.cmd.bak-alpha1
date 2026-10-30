@echo off
chcp 65001 >nul
title DeepSeek Harness Web
setlocal

set "NODE_USE_ENV_PROXY=1"
set "HTTPS_PROXY=http://127.0.0.1:7897"
set "HTTP_PROXY=http://127.0.0.1:7897"

rem If already running, just open the browser
netstat -an | findstr /r /c:":3080 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    start "" "http://127.0.0.1:3080"
    exit /b 0
)

rem Open browser after a short delay (wait for server to start)
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start "" http://127.0.0.1:3080"

rem Run dsh web in foreground (close this window to stop)
dsh web

endlocal
