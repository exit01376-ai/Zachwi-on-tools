@echo off
cd /d "%~dp0"
start "JachwiON local server" /min "C:\Program Files\nodejs\node.exe" server.mjs
timeout /t 2 /nobreak >nul
start "" "http://localhost:3002/index.html"
