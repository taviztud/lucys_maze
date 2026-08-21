# Sprites, animaciones y progresion visual

## Arquitectura

Lucy’s Maze usa un registro tipado compartido en `src/visuals/assetRegistry.ts`. Contiene los atlas animados de Lucy, Worm, Lelar y Spider, además del asset estático Spin. `src/visuals/animations.ts` es el único punto de preload, registro, reproducción, frame inicial, profundidad y escala por frame.

Los perfiles de nivel viven en `src/visuals/levelVisuals.ts`; no se deben duplicar umbrales en managers o renderers. Los atlas del jugador están en `src/assets/sprites/player/`, los enemigos en `src/assets/sprites/enemies/` y los fondos en `src/assets/sprites/tiles/backgrounds/`. Las láminas auxiliares no usadas por el juego viven bajo `source/`.

## Formato Studio / Phaser

Cada atlas JSON Hash contiene:

- `frames`: rectángulos arbitrarios, tamaño de origen y pivote.
- `meta`: PNG, dimensiones, formato y `lucysMaze.targetCellRatio`.
- `anims`: clave, secuencia, FPS, repetición, `yoyo`, `startFrame` y duración opcional por frame.

Convenciones:

- Archivo: `<entidad>_<estado>.png` y `.json`.
- Textura: `<entidad>_<estado>`; Lucy conserva `player:idle-texture`.
- Animación: `<textura>:<estado>`.
- Frames: `frame_00`, `frame_01`, etc.; Lucy usa `idle_00`, etc.
- `repeat: -1` significa infinito; `repeat: 0`, una reproducción.
- El JSON es la fuente de verdad para reproducción, pivote y ratio.

## Carga y gameplay

1. `GameScene.preload()` llama una vez al loader compartido.
2. Phaser carga cada PNG junto con su JSON.
3. `GameScene.create()` registra globalmente solo animaciones inexistentes.
4. Managers y renderers solicitan sprites por ID; la escala usa frame, celda, ratio del atlas y multiplicador de instancia.
5. Restart y shutdown destruyen sprites, gráficos y tweens de instancia.

Worm conserva movimiento y orientación; cada instancia empieza en un frame distinto y usa una escala determinista entre `0.40` y `0.80`. Lelar permanece estático, empieza en un frame determinista y usa escala `0.55`, `0.75` o `1`, con mayor peso pequeño/medio. Spin reutiliza exactamente `mazeData.traps`: solo cambia el visual y gira mediante configuración central.

Spider reproduce `spider_walk:idle` sin rotar ni reflejar el asset. Patrulla A↔B a 3 celdas/s, espera 2 segundos y dibuja una línea blanca desde A hasta su posición. Las celdas cubiertas bloquean y dañan a Lucy; el hilo crece al salir y libera celdas al regresar. El contacto reutiliza escudo, invencibilidad y game over.

## Progresion

- Escenarios: cambian cada 10 niveles en el orden entrada del bosque (`forest_entrance`), antesala del laberinto (`maze_approach`) y piso del templo (`temple_floor`); después ciclan.
- Fondos: se registran una sola vez en `BOARD_BACKGROUNDS`, se renderizan como `TileSprite` y el patrón representa 16×16 celdas. El color neón del bloque de nivel se aplica como una capa tenue encima y también colorea la grilla.
- Colores: cambian cada 10 niveles usando los cinco colores existentes y luego ciclan independientemente de los tres escenarios.
- Spin: 0% en 1–10, 10% en 11–20, 20% en 21–30 y 30% desde 31, sin crear trampas.
- Spider: 0 en 1–9; 1 con alcance 3 en 10–19; 2 con alcance 5 en 20–29; 3 con alcance 7 desde 30.

## Studio

`npm run studio` abre `/studio/`. Studio importa el mismo registro que el juego, incluidos los tres fondos, consulta la API local para descubrir pares y admite varios PNG/JSON. Edita grilla o rectángulos existentes, offsets, pivote, ratio/tamaño objetivo, secuencia, FPS, duración por frame, frame inicial, repetición y yoyo.

Preview, copiar, descargar y guardar producen el mismo payload. Se validan dimensiones, límites, referencias y reproducción. La API solo escribe en `src/assets/sprites/` o `public/` y existe únicamente en desarrollo; Studio desplegado conserva inspección, preview y descarga.

## Registrar un enemigo

1. Exportar y validar el par PNG/JSON desde Studio.
2. Guardarlo en `src/assets/sprites/enemies/` con nombres coincidentes.
3. Añadirlo a `ANIMATED_ASSETS` con categoría, textura, animación y profundidad.
4. Solicitar el sprite desde su manager mediante la abstracción compartida.
5. Mantener movimiento, orientación, colisión y daño fuera del registro visual.
6. Añadirlo a `scripts/enemy-sprites.mjs` si es obligatorio en runtime.

Archivos principales: `src/visuals/assetRegistry.ts`, `src/visuals/animations.ts`, `src/visuals/levelVisuals.ts`, `src/managers/SpiderManager.ts`, `src/systems/GridRenderer.ts` y `src/studio/`.

## Validacion

```bash
npm ci
npm run assets:verify
npm run backgrounds:verify
npx tsc --noEmit
npm run build
npm run build:ihost
git diff --check
```

No hay scripts separados de lint o tests. Después se debe usar Dev Mode y el cliente Playwright oficial, inspeccionar capturas, `render_game_to_text`, red y consola, y probar niveles 1, 10, 20, 30 y 31, colisiones, escudo, restart y menú.
