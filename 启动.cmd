@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动「今日」...
echo 地址 http://localhost:8767
echo 关掉这个窗口就停止服务。
start "" http://localhost:8767
python -m http.server 8767 --directory .