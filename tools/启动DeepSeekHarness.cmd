@echo off
chcp 65001 >nul
title DeepSeek Harness Web
setlocal

set "NODE_USE_ENV_PROXY=1"
set "HTTPS_PROXY=http://127.0.0.1:7897"
set "HTTP_PROXY=http://127.0.0.1:7897"

rem 若服务已在运行，直接打开浏览器
netstat -an | findstr /r /c:":3080 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    start "" "http://127.0.0.1:3080"
    exit /b 0
)

rem 延迟一点再自动打开浏览器（等服务起来）
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start "" http://127.0.0.1:3080"

rem 前台运行 dsh web（关掉此窗口即停止服务）
dsh web

endlocal
