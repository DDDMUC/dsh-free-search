@echo off
chcp 65001 >nul
title dsh-free-search 竞品雷达
cd /d "%~dp0\.."
echo ==========================================
echo   dsh-free-search 竞品雷达
echo   监控搜索类竞品的更新与新插件
echo ==========================================
echo.
node tools/competitor-radar.mjs %*
echo.
pause
