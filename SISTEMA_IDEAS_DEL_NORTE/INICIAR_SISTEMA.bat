@echo off
setlocal
title Ideas del Norte - Sistema de Gestión
color 0B

echo ==========================================================
echo           SISTEMA DE GESTIÓN - IDEAS DEL NORTE
echo ==========================================================
echo.
echo [1/3] Iniciando el motor de la base de datos...
cd /d "%~dp0\backend"

:: Start the server in a new minimized window to keep it running
start "Ideas del Norte Server" /min node server.js

echo [2/3] Esperando que el sistema esté listo...
:: Wait 3 seconds for server to bind
timeout /t 3 /nobreak > nul

echo [3/3] Abriendo el panel de control...
:: Open default browser
start http://localhost:5000

echo.
echo ==========================================================
echo   ¡SISTEMA LISTO! 
echo.
echo   - Se ha abierto una pestaña en tu navegador.
echo   - No cierres la ventana minimizada del servidor.
echo   - Para apagar el sistema, cierra esta ventana.
echo ==========================================================
echo.
pause
exit
