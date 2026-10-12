@echo off
cd /d "%~dp0"
echo WebGIS Prosper 1.2 - http://127.0.0.1:8082/
echo Mantenha esta janela aberta durante o uso local.
where node >nul 2>nul
if %errorlevel% equ 0 (
  node server.cjs
) else (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.cjs
)
pause
