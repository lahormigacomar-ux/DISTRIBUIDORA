@echo off
setlocal
title Instalador - Ideas del Norte

echo ============================================================
echo      INSTALANDO SISTEMA IDEAS DEL NORTE
echo ============================================================
echo.

:: Path de instalacion
set TARGET_DIR=C:\IdeasDelNorte

echo [+] Preparando carpeta de destino...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

echo [+] Extrayendo componentes... (esto puede tardar unos segundos)
:: Usar PowerShell para la extraccion
powershell -Command "Expand-Archive -Path 'SISTEMA_INSTALABLE.zip' -DestinationPath '%TARGET_DIR%' -Force"

echo [+] Configurando accesos directos...
set SCRIPT_PATH=%TARGET_DIR%\INICIAR_SISTEMA.bat

:: Crear el acceso directo en el escritorio
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%USERPROFILE%\Desktop\Ideas del Norte.lnk'); $s.TargetPath = '%SCRIPT_PATH%'; $s.IconLocation = 'shell32.dll,24'; $s.Save()"

:: Crear el acceso directo en el menu inicio
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs\Ideas del Norte.lnk'); $s.TargetPath = '%SCRIPT_PATH%'; $s.IconLocation = 'shell32.dll,24'; $s.Save()"

echo.
echo ============================================================
echo      INSTALACION COMPLETADA
echo ============================================================
echo.
echo Ya podes cerrar esta ventana y usar el acceso directo del escritorio.
echo.
pause
exit
