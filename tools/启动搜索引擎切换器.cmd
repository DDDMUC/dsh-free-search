@echo off
chcp 65001 >nul
title DSH 搜索引擎切换器
cd /d "%~dp0"
echo 正在启动 DSH 搜索引擎切换器...
echo 浏览器将自动打开 http://127.0.0.1:4789
echo 关闭此窗口即停止服务
echo.
start "" "http://127.0.0.1:4789"
node server.mjs
pause
