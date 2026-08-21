# Sprites y animaciones

## Arquitectura

Lucy’s Maze usa atlas JSON Hash de Phaser. Cada animación se compone de un PNG con la lámina de cuadros y un JSON generado por Studio con tres secciones:

- `frames`: rectángulo, tamaño, recorte y pivote de cada cuadro.
- `meta`: nombre del PNG, dimensiones y formato del atlas.
- `anims`: clave, secuencia de cuadros, FPS, repetición y modo `yoyo`.

Los assets animados del jugador viven en `src/assets/sprites/player/`. Los enemigos animados viven en `src/assets/sprites/enemies/`. El PNG y el JSON deben compartir el mismo nombre base, por ejemplo `worm_walk.png` y `worm_walk.json`.

`GameScene.preload()` delega la carga. `playerAnimations.ts` administra al jugador y `enemyAnimations.ts` centraliza los atlas de enemigos. Phaser carga el PNG junto con el objeto JSON, registra las animaciones globales una sola vez y los managers solicitan sprites ya configurados. La escala se calcula usando el frame activo, no el tamaño completo de la lámina.

## Studio y el juego

Studio se ejecuta con `npm run studio` y abre `/studio/`. Permite cargar una lámina, definir grilla, pivote, orden de cuadros, FPS, repetición y `yoyo`, además de previsualizar y exportar el atlas.

Studio no participa durante la ejecución del juego: produce los datos que Phaser consume. Para promover un enemigo al juego:

1. Exportar desde Studio el atlas JSON y conservar su PNG original.
2. Colocar el par en `src/assets/sprites/enemies/` con nombres coincidentes.
3. Confirmar que `meta.image` coincide con el PNG y que las claves de `anims[].frames[].key` coinciden con la clave de textura.
4. Registrar el asset en la tabla `DEFINITIONS` de `enemyAnimations.ts` y añadir el nuevo valor a `AnimatedEnemyKind`.
5. Crear o configurar el sprite desde su manager mediante `createAnimatedEnemySprite` o `configureAnimatedEnemySprite`.

El botón de guardado de Studio es una ayuda de desarrollo. Para enemigos usados por el bundle, el par definitivo debe quedar en la ruta canónica anterior.

## Convenciones

- Archivos: `<enemigo>_<estado>.png` y `<enemigo>_<estado>.json`.
- Textura: `<enemigo>_<estado>`.
- Animación: `<enemigo>_<estado>:<animación>`.
- Frames: `frame_00`, `frame_01`, etc., contiguos y ordenados.
- `repeat: -1` representa un ciclo infinito; `yoyo: true` reproduce también la secuencia inversa.
- Los FPS y cuadros del JSON de Studio son la fuente de verdad; no deben repetirse como constantes en los managers.
- Movimiento, orientación y colisión pertenecen al manager o sistema de gameplay, no al módulo de animación.

## Archivos principales

- `src/managers/enemyAnimations.ts`: carga, registro, reproducción y escala compartida.
- `src/managers/EnemyManager.ts`: movimiento, orientación y colisión de Worm.
- `src/systems/GridRenderer.ts`: renderizado de Lelar en las posiciones de trampa.
- `src/scenes/GameScene.ts`: preload, orquestación y estado textual de prueba.
- `src/studio/utils/phaserExport.ts`: formato exportado por Studio.

## Validación

```bash
npm ci
npm run assets:verify
npx tsc --noEmit
npm run build
npm run build:ihost
git diff --check
```

El proyecto no define actualmente comandos separados de lint o tests. Después de los checks se debe probar el juego en navegador, revisar consola y red, observar al menos un ciclo completo de cada animación y comprobar restart, colisiones y cambios de nivel.
