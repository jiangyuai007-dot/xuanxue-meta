@echo off
chcp 65001 >nul
title 玄机命理 - 一键安装开机自启

set NODE=C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-3\node.exe
set VBS=E:\WorkBuddy\xuanxue-meta\scripts\start-hidden.vbs

echo.
echo  ============================================
echo   玄机命理平台 - 一键安装开机自启
echo  ============================================
echo.
echo  [1/3] 注册启动项（写入当前用户注册表，无需管理员）...
reg add HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v XuanxueMeta /d "wscript.exe \"%VBS%\"" /f >nul
if errorlevel 1 (
  echo   [失败] 注册表写入失败，请截图本窗口内容反馈。
  pause
  exit /b 1
)
echo   [完成] 已注册：每次开机登录后服务自动在后台启动。

echo  [2/3] 立即启动一次服务（后台静默，无窗口）...
wscript.exe "%VBS%"
timeout /t 3 /nobreak >nul

echo  [3/3] 检查服务状态...
set NODE_OK=0
"%NODE%" "E:\WorkBuddy\xuanxue-meta\scripts\health-check.mjs"
if errorlevel 1 (
  echo.
  echo   [警告] 状态检查未通过，详情见 E:\WorkBuddy\xuanxue-meta\data\serve.log
) else (
  echo.
  echo   [全部完成] 以后开机服务自动运行，直接访问 http://127.0.0.1:8787
  echo   （如 8787 被占用会自动换端口，实际端口以 serve.log 最新记录为准）
)
echo.
pause
