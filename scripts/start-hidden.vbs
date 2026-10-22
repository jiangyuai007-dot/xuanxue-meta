' 隐藏窗口运行命理平台服务（供计划任务调用）
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "E:\WorkBuddy\xuanxue-meta"
sh.Run """C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"" ""E:\WorkBuddy\xuanxue-meta\scripts\serve-bg.js""", 0, False
