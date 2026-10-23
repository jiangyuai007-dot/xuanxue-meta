@echo off
chcp 65001 >nul
set NODE=C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-3\node.exe
if not exist "%NODE%" set NODE=node

"%NODE%" -v >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 未找到可用的 Node.js：%NODE%
  echo   请先安装 Node.js（https://nodejs.org）后重试。
  echo.
  pause
  exit /b 1
)

:: AI 报告接入（agnes）：Key 只放在桌面的 agnes.txt 里，代码里不出现任何密钥。
:: 已设 AGNES_API_KEY 时以它为准；否则从这里读桌面文件，省得每次手抄。
if not defined AGNES_API_KEY (
  set "AGNES_KEY_FILE=C:\Users\Administrator\Desktop\agnes.txt"
  if exist "%AGNES_KEY_FILE%" (
    echo   [AI] 已挂载 agnes Key 文件
  ) else (
    echo   [AI] 未找到 C:\Users\Administrator\Desktop\agnes.txt，报告将走本地规则引擎
  )
)

"%NODE%" "E:\WorkBuddy\xuanxue-meta\scripts\serve.js"
pause
