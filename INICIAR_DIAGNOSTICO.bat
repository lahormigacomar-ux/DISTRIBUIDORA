@echo off
TITLE DIAGNOSTICO DE SISTEMA - IDEAS DEL NORTE
color 0b
echo ==============================================
echo   DIAGNOSTICO DE CONEXION Y MOTOR V3.1.0
echo ==============================================
echo.

echo [1/3] VERIFICANDO CREDENCIALES .env...
if not exist .env (
    echo [ERROR] No se encuentra el archivo .env en la raiz!
    pause
    exit
)
echo [OK] Archivo .env encontrado.
echo.

echo [2/3] PROBANDO CONEXION A SUPABASE (PING)...
ping cxehmsdehhznqwrkgwpv.supabase.co -n 1
if %errorlevel% neq 0 (
    echo.
    echo [!!!] ATENCION: Tu PC NO PUEDE encontrar a Supabase.
    echo       Esto suele ser causado por un bloqueo de internet o DNS.
) else (
    echo [OK] El dominio responde correctamente.
)
echo.

echo [3/3] EJECUTANDO PRUEBA DE BASE DE DATOS (NODE)...
node backend\PRUEBA_RAPIDA_SUPABASE.js
echo.

echo ==============================================
echo   DIAGNOSTICO FINALITADO. 
echo   Si ves errores arriba, esa es la causa.
echo ==============================================
pause
