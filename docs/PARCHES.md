# Parches a dependencias

El bot corrige bugs de dependencias con [`bun patch`](https://bun.sh/docs/install/patch), sin hacer un fork:

- El arreglo está en `patches/<paquete>@<versión>.patch`.
- `package.json` lo declara en `patchedDependencies`.
- `bun install` lo aplica solo, también al construir la imagen Docker: el `Dockerfile` copia `patches/` antes de instalar.

> [!IMPORTANT]
> El parche está atado a **una versión exacta**. Si actualizás el paquete, el parche viejo deja de servir: `bun install` puede fallar o ignorarlo, y los bugs vuelven en silencio. Antes de actualizar, leé [Al actualizar moonlink.js](#al-actualizar-moonlinkjs).

## moonlink.js 5.2.0

Archivo: `patches/moonlink.js@5.2.0.patch`. Son tres arreglos, en dos archivos de `dist/src/entities/`.

### 1. Falta `channelId` al recuperar un reproductor

| | |
|---|---|
| **Dónde** | `Player.js`: `softRestart()` y `restart()` |
| **Síntoma** | Después de reiniciar el bot con música sonando, Lavalink responde `400` cuatro veces: *Field 'channelId' is required for type ... VoiceState*. La canción se corta ~20 s. |
| **Causa** | Lavalink 4.2 exige `channelId` en el estado de voz, pero moonlink solo lo mandaba si el nodo era NodeLink (`this.node.isNodeLink`). |
| **Arreglo** | Mandar siempre `channelId: this.voiceChannelId`. |

```diff
-                ...(this.node.isNodeLink ? { channelId: this.voiceChannelId } : {})
+                channelId: this.voiceChannelId
```

### 2. Reinicio del reproductor con la voz ya reconectada

| | |
|---|---|
| **Dónde** | `Node.js`: `handleWebSocketClosed()`, paso 2 |
| **Síntoma** | Al reanudar tras un reinicio, la canción se corta ~20 s y a veces salta a la siguiente. |
| **Causa** | Discord cierra la voz vieja (`4006 Session is no longer valid`) porque el bot volvió con otra sesión. moonlink reconecta la voz (paso 1), espera `voiceConnection.timeout` y reinicia el reproductor (paso 2) **aunque ya esté conectado**. |
| **Arreglo** | Reiniciar solo si sigue desconectado. |

```diff
-                if (player.playing && player.current) {
+                if (player.playing && player.current && !player.connected) {
```

### 3. `play()` no manda el volumen

| | |
|---|---|
| **Dónde** | `Player.js`: `play()` |
| **Síntoma** | Un reproductor nuevo suena al 100 % aunque el bot muestre el volumen del servidor (por ejemplo 5 %). Se corrige recién con `/volume`. |
| **Causa** | `players.create({ volume })` solo guarda el volumen en moonlink. `play()` manda la canción sin `volume` y Lavalink crea el player con su valor por defecto, 100. Medido el 2026-11-21: un player creado sin volumen queda en 100 en Lavalink. |
| **Arreglo** | Incluir el volumen en cada `play()`, como ya hacía `restart()`. |

```diff
             position: finalOptions.position || this.current.position,
+            volume: this.volume,
         };
```

### Estado en moonlink.js

Revisado el 2026-11-18. La última versión publicada en npm era 5.2.0, y la rama `dev` de [Ecliptia/moonlink.js](https://github.com/Ecliptia/moonlink.js) iba por 5.3.0-dev.2.

| Arreglo | En `dev` (5.3.0-dev.2) |
|---|---|
| 1. `channelId` | ✅ Arreglado |
| 2. Reinicio con la voz conectada | ⚠️ Reescrito, pero si hay música sigue llamando a `restart()` sin mirar `player.connected` |
| 3. Volumen en `play()` | ✅ Arreglado |

## Al actualizar moonlink.js

1. **Mirar el código nuevo** en `node_modules/moonlink.js/dist/src/entities/` (o en el repo, `src/entities/`) y buscar cada arreglo:
   - **1:** `restart()` y `softRestart()` mandan `channelId` sin condición.
   - **2:** el reinicio de `handleWebSocketClosed` revisa si el reproductor sigue desconectado.
   - **3:** el payload de `play()` incluye `volume`.
2. **Si los tres están arreglados:** borrar `patchedDependencies` de `package.json` y el archivo de `patches/`.
3. **Si falta alguno:** rehacer el parche solo con lo que falte:
   ```bash
   bun patch moonlink.js                       # deja el paquete listo para editar
   # editar node_modules/moonlink.js/dist/...
   bun patch --commit node_modules/moonlink.js # crea patches/moonlink.js@<versión>.patch
   ```
   Después, borrar el parche de la versión vieja.
4. **Probar en el bot real** (con `docker compose up -d --build discord-bot`):
   - **Volumen:** con un reproductor nuevo y sin tocar `/volume`, tiene que sonar con el volumen del servidor desde la primera canción.
   - **Resume:** reiniciar el bot con música sonando. En `docker compose logs discord-bot` no tiene que aparecer `400` ni *channelId is required*, y el corte tiene que ser de menos de 1 s, sin saltar de canción.
   - **Tests:** `bun run typecheck` y `bun test`.

> [!TIP]
> Si `bun install` falla con un error al aplicar el parche, el código cambió debajo: es la señal para hacer este repaso.
