@echo off
rem Actualiza Araña Sound en Windows: baja la última versión del repo y reconstruye y reinicia los contenedores.
rem Uso: update.bat (doble clic o desde una terminal). En Linux/macOS: ./update.sh
rem No toca .env, application.yml ni data/ (no están en el repo).
setlocal EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

where git >nul 2>&1 || (call :fail "no se encontró git" & goto :end)
where docker >nul 2>&1 || (call :fail "no se encontró docker" & goto :end)

rem Si falta uno, "docker compose up" crea una carpeta vacía con su nombre (Docker Desktop lo hace aunque se le ponga create_host_path: false)
call :check_file .env .env.example || goto :end
call :check_file application.yml application.example.yml || goto :end

rem Bajado como ZIP no hay repo: se explica cómo convertirlo una vez, sin tocar la carpeta sin permiso
if exist .git goto :has_git
echo [Update] Esta carpeta no es un clon de git (¿la bajaste como ZIP?): el script necesita git para saber qué versión tenés y bajar la nueva.
echo [Update] Para convertirla una sola vez, en esta carpeta:
echo     git init
echo     git remote add origin https://github.com/BrayanBCode/SpiderSound.git
echo     git fetch origin main
echo     git checkout -f -B main --track origin/main
echo [Update] Eso reemplaza los archivos del proyecto por los de la última versión. Tu .env, application.yml y data/ no se tocan.
call :fail "carpeta sin git. Convertila como se indica arriba y volvé a correr el script"
goto :end
:has_git

rem Con cambios propios en archivos del repo el pull podría pisarlos o fallar a la mitad: mejor frenar antes
set "DIRTY="
for /f "delims=" %%l in ('git status --porcelain --untracked-files^=no') do set "DIRTY=1"
if defined DIRTY (
    git status --short --untracked-files=no
    call :fail "hay cambios locales en archivos del repo, arriba. Guardalos con 'git stash' o descartalos y volvé a correr el script"
    goto :end
)

for /f %%c in ('git rev-parse HEAD') do set "OLD_COMMIT=%%c"
for /f %%c in ('git rev-parse --short HEAD') do set "OLD_SHORT=%%c"
for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
call :version OLD_VERSION
echo [Update] Versión actual: v%OLD_VERSION% (rama %BRANCH%, commit %OLD_SHORT%)

echo [Update] Buscando actualizaciones...
git pull --ff-only || (call :fail "no se pudo actualizar con git pull: ¿la rama local tiene commits propios?" & goto :end)

for /f %%c in ('git rev-parse HEAD') do set "NEW_COMMIT=%%c"
call :version NEW_VERSION
if "%OLD_COMMIT%"=="%NEW_COMMIT%" (
    echo [Update] El código ya estaba al día: v%OLD_VERSION%
) else (
    echo [Update] Código actualizado: v%OLD_VERSION% -^> v%NEW_VERSION%
    git --no-pager log --oneline -n 15 %OLD_COMMIT%..%NEW_COMMIT%
    rem Configuración nueva: las copias propias, .env y application.yml, no se actualizan solas
    git diff --quiet %OLD_COMMIT% %NEW_COMMIT% -- .env.example application.example.yml
    if errorlevel 1 (
        echo [Update] AVISO: cambiaron .env.example o application.example.yml. Comparalos con tu .env y application.yml por si hay opciones nuevas:
        git --no-pager diff --stat %OLD_COMMIT% %NEW_COMMIT% -- .env.example application.example.yml
    )
)

echo [Update] Bajando las imágenes nuevas de Lavalink, yt-cipher y spotify-tokener...
docker compose pull --ignore-buildable || (call :fail "falló docker compose pull" & goto :end)

echo [Update] Reconstruyendo el bot y reiniciando lo que cambió, si se reinicia Lavalink el bot espera a que responda...
docker compose up -d --build --remove-orphans || (call :fail "falló docker compose up. Revisá: docker compose logs lavalink discord-bot" & goto :end)

rem Las imágenes viejas del bot quedan sin etiqueta después de cada build y ocupan espacio
docker image prune -f >nul

docker compose ps

rem "Started" no garantiza que el bot ande: un token mal puesto lo deja reiniciándose. Se espera el aviso de Discord
echo [Update] Esperando a que el bot se conecte a Discord...
set "BOT="
for /f "usebackq delims=" %%i in (`docker compose ps -q discord-bot`) do set "BOT=%%i"
if not defined BOT (call :fail "no se encontró el contenedor del bot. Revisá: docker compose logs discord-bot" & goto :end)
for /f "usebackq delims=" %%s in (`docker inspect -f "{{.State.StartedAt}}" %BOT%`) do set "STARTED=%%s"
for /f "usebackq delims=" %%r in (`docker inspect -f "{{.RestartCount}}" %BOT%`) do set "RESTARTS=%%r"
set /a WAITED=0
:wait_online
docker logs --since %STARTED% %BOT% 2>&1 | findstr /c:" Online" >nul && goto :online
for /f "usebackq delims=" %%r in (`docker inspect -f "{{.RestartCount}}" %BOT%`) do set "NOW_RESTARTS=%%r"
if not "%NOW_RESTARTS%"=="%RESTARTS%" (call :fail "el bot se reinició al arrancar. Revisá: docker compose logs discord-bot" & goto :end)
if %WAITED% GEQ 90 (call :fail "el bot no se conectó a Discord en 90 s. Revisá: docker compose logs discord-bot" & goto :end)
rem ping como pausa de 3 s: timeout falla si la entrada no es una consola
ping -n 4 127.0.0.1 >nul
set /a WAITED+=3
goto :wait_online

:online
echo [Update] Listo: v%NEW_VERSION% en línea. Para seguir el log: docker compose logs -f discord-bot
set "EXIT_CODE=0"
goto :end

:version
rem Lee "version" de package.json (la línea es:  "version": "3.3.1",)
for /f "tokens=2 delims=:, " %%v in ('findstr /c:"\"version\"" package.json') do (
    set "%1=%%~v"
    goto :eof
)
goto :eof

:check_file
rem %1 = archivo, %2 = su ejemplo. "archivo\" solo existe si es una carpeta
if exist "%~1\" (
    echo [Update] %~1 es una carpeta: la creó Docker al arrancar sin el archivo. Para arreglarlo:
    echo     docker compose down
    echo     rmdir /s /q %~1
    echo     copy %~2 %~1   ^(y completalo^)
    call :fail "%~1 es una carpeta, no un archivo"
    exit /b 1
)
if not exist "%~1" (
    call :fail "falta %~1. Copiá %~2 a %~1 y completalo, ver la guía: https://spidersound.netlify.app/autoalojar"
    exit /b 1
)
exit /b 0

:fail
echo [Update] ERROR: %~1 1>&2
set "EXIT_CODE=1"
goto :eof

:end
rem Con doble clic la ventana se cerraría sin dejar leer el resultado
rem find con ruta completa: si Git agrega sus herramientas al PATH, "find" sería el de Unix
echo %cmdcmdline% | "%SystemRoot%\System32\find.exe" /i "/c" >nul && pause
exit /b %EXIT_CODE%
