@echo off
title Sistema Ideas del Norte - Lanzador
echo ============================================
echo   INICIANDO SISTEMA IDEAS DEL NORTE
echo ============================================
echo.
cd /d "%~dp0\backend"

:: Iniciar el servidor en segundo plano
start /b node server.js

:: Esperar a que el servidor arranque
timeout /t 3 /nobreak > nul

:: Abrir el navegador
start http://localhost:5000

echo.
echo Sistema iniciado correctamente. 
echo Esta ventana se cerrara automaticamente pero el sistema seguira funcionando.
timeout /t 5 > nul
exit
