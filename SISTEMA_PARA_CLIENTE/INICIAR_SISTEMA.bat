@echo off
title Sistema Ideas del Norte
echo ============================================
echo   INICIANDO SISTEMA...
echo ============================================
echo.
cd /d "%~dp0\backend"
start /b node server.js
timeout /t 4 /nobreak > nul
start http://localhost:5000
echo.
echo Sistema iniciado. No cierres esta ventana.
exit
