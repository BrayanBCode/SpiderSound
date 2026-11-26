#!/usr/bin/env sh
# Actualiza Araña Sound en el servidor: baja la última versión del repo y reconstruye y reinicia los contenedores.
# Uso: ./update.sh   (en Windows: update.bat)
# No toca .env, application.yml ni data/ (no están en el repo).
set -eu
cd "$(dirname "$0")"

log() { echo "[Update] $*"; }
fail() { echo "[Update] ERROR: $*" >&2; exit 1; }
version() { sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json | head -n 1; }

command -v git >/dev/null 2>&1 || fail "no se encontró git"
command -v docker >/dev/null 2>&1 || fail "no se encontró docker"

# Si falta uno, "docker compose up" crea una carpeta vacía con su nombre (Docker Desktop lo hace aunque se le ponga create_host_path: false)
for f in .env application.yml; do
    example=$([ "$f" = .env ] && echo .env.example || echo application.example.yml)
    if [ -d "$f" ]; then
        log "$f es una carpeta: la creó Docker al arrancar sin el archivo. Para arreglarlo:"
        echo "    docker compose down"
        echo "    rm -r $f"
        echo "    cp $example $f   (y completalo)"
        fail "$f es una carpeta, no un archivo"
    fi
    [ -f "$f" ] || fail "falta $f. Copiá $example a $f y completalo (ver la guía: https://spidersound.netlify.app/autoalojar)"
done

# config/config.yml (desde v3.6.0) no es obligatorio: sin él, el bot usa los valores viejos del .env
[ -f config/config.yml ] || log "AVISO: no hay config/config.yml, se usa lo que tenga el .env. Para pasarte al archivo nuevo: cp config/config.example.yml config/config.yml y completalo"

# Bajado como ZIP no hay repo: se explica cómo convertirlo una vez, sin tocar la carpeta sin permiso
if [ ! -e .git ]; then
    log "Esta carpeta no es un clon de git (¿la bajaste como ZIP?): el script necesita git para saber qué versión tenés y bajar la nueva."
    log "Para convertirla una sola vez, en esta carpeta:"
    echo "    git init"
    echo "    git remote add origin https://github.com/BrayanBCode/SpiderSound.git"
    echo "    git fetch origin main"
    echo "    git checkout -f -B main --track origin/main"
    log "Eso reemplaza los archivos del proyecto por los de la última versión. Tu .env, application.yml y data/ no se tocan."
    fail "carpeta sin git. Convertila como se indica arriba y volvé a correr el script"
fi

# Con cambios propios en archivos del repo el pull podría pisarlos o fallar a la mitad: mejor frenar antes
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    git status --short --untracked-files=no
    fail "hay cambios locales en archivos del repo (arriba). Guardalos con 'git stash' o descartalos y volvé a correr el script"
fi

old_commit=$(git rev-parse HEAD)
old_version=$(version)
branch=$(git rev-parse --abbrev-ref HEAD)
log "Versión actual: v$old_version (rama $branch, commit $(git rev-parse --short HEAD))"

log "Buscando actualizaciones..."
git pull --ff-only || fail "no se pudo actualizar con git pull (¿la rama local tiene commits propios?)"

new_commit=$(git rev-parse HEAD)
if [ "$old_commit" = "$new_commit" ]; then
    log "El código ya estaba al día (v$old_version)"
else
    log "Código actualizado: v$old_version -> v$(version)"
    git log --oneline "$old_commit..$new_commit" | head -n 15
    # Configuración nueva: las copias propias (.env, application.yml) no se actualizan solas
    if ! git diff --quiet "$old_commit" "$new_commit" -- .env.example application.example.yml config/config.example.yml; then
        log "AVISO: cambiaron .env.example, application.example.yml o config/config.example.yml. Comparalos con tus copias por si hay opciones nuevas:"
        git diff --stat "$old_commit" "$new_commit" -- .env.example application.example.yml config/config.example.yml
    fi
fi

log "Bajando las imágenes nuevas de Lavalink, yt-cipher y spotify-tokener..."
docker compose pull --ignore-buildable

log "Reconstruyendo el bot y reiniciando lo que cambió (si se reinicia Lavalink, el bot espera a que responda)..."
docker compose up -d --build --remove-orphans || fail "falló docker compose up. Revisá: docker compose logs lavalink discord-bot"

# Las imágenes viejas del bot quedan sin etiqueta después de cada build y ocupan espacio
docker image prune -f >/dev/null

docker compose ps

# "Started" no garantiza que el bot ande: un token mal puesto lo deja reiniciándose. Se espera el aviso de Discord
log "Esperando a que el bot se conecte a Discord..."
bot=$(docker compose ps -q discord-bot)
[ -n "$bot" ] || fail "no se encontró el contenedor del bot. Revisá: docker compose logs discord-bot"
started=$(docker inspect -f '{{.State.StartedAt}}' "$bot")
restarts=$(docker inspect -f '{{.RestartCount}}' "$bot")
waited=0
until docker logs --since "$started" "$bot" 2>&1 | grep -q " Online"; do
    [ "$(docker inspect -f '{{.RestartCount}}' "$bot")" = "$restarts" ] \
        || fail "el bot se reinició al arrancar. Revisá: docker compose logs discord-bot"
    [ "$waited" -lt 90 ] || fail "el bot no se conectó a Discord en 90 s. Revisá: docker compose logs discord-bot"
    sleep 3
    waited=$((waited + 3))
done
log "Listo: v$(version) en línea. Para seguir el log: docker compose logs -f discord-bot"
