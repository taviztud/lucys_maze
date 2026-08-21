Original prompt: Corregir localmente que el cadáver de Lucy permanezca visible después de perder y presionar restart; no crear commit ni subir cambios.

## Estado

- Se detectó un cambio local previo del usuario en `src/assets/sprites/player/lucy-idle.png`; debe preservarse sin regenerar el atlas.
- Causa identificada: `handleDeath()` acepta notificaciones repetidas después de game over y `showDeathSprite()` reemplaza la referencia al cadáver anterior, dejando sprites huérfanos que `reset()` ya no puede destruir.
- `GameScene.handleDeath()` ahora descarta notificaciones cuando game over ya está activo.
- `PlayerController.showDeathSprite()` es idempotente y la limpieza del cadáver se centralizó para reset y destroy.
- TypeScript y un build Vite aislado pasan sin regenerar ni sobrescribir el atlas modificado por el usuario.
- Se verificaron visualmente dos ciclos completos muerte → restart: tras cada reinicio solo aparece Lucy idle en `(0,0)`, sin cadáver residual.
- Estado textual correcto (`game-over/dead` → `playing/idle`) y consola sin errores.
- Solicitud adicional: hacer que la sombra/estela de Lucy copie la dirección del personaje.
- Causa: las partículas siguen la posición del sprite, pero Phaser no hereda automáticamente su rotación ni su espejo horizontal.
- La orientación quedó centralizada: Lucy y cada partícula usan el mismo ángulo y `flipX`; el espejo se conserva durante toda la vida de cada partícula mediante escala X con signo.

- Segunda correccion de la estela: Phaser copiaba `scaleX` en `scaleY` porque el emisor usaba `scale` uniforme; al volver de izquierda a derecha algunas particulas quedaban invertidas verticalmente.
- El emisor ahora administra `scaleX` y `scaleY` por separado. Solo X cambia de signo y Y se normaliza siempre como positivo, incluso cuando Phaser reutiliza una particula.
- Secuencia visual izquierda -> derecha validada: la sombra vuelve erguida, mirando a la derecha, y el estado real confirma `flipY: false`.
- TypeScript, `git diff --check`, build Vite aislado y cliente Playwright de la skill pasan. La consola del navegador no registra errores.

## TODO

- Menu: agregado pie informativo bajo los controles con version y creditos, alimentado desde los metadatos de `package.json` para evitar valores duplicados.
- Menu validado visualmente: el pie queda centrado, legible y sin superponerse con controles ni borde; la transicion JUGAR -> gameplay y el retorno por el boton M conservan el estado esperado.
- El cliente oficial de `develop-web-game` confirma estados de menu y gameplay; sus capturas de canvas quedan negras aun en modo headed por la combinacion WebGL/captura, por lo que la inspeccion visual se completo con capturas de pagina Playwright reales. Consola sin errores.

- No hacer commit ni despliegue sin indicación explícita del usuario.

## Integración Worm y Lelar

- Solicitud actual: integrar `worm_walk` en el enemigo móvil y sustituir visualmente la trampa giratoria por Lelar usando `lelar_idle`, sin cambiar mecánicas.
- Los cuatro assets de Studio quedaron centralizados en `src/assets/sprites/enemies/` sin copias en la raíz.
- La carga, el registro, la reproducción y la escala de ambas animaciones usan un módulo compartido y leen cuadros/FPS/repetición/yoyo desde los JSON de Studio.
- `EnemyManager` conserva el movimiento y `flipX` del enemigo anterior; `GridRenderer` conserva posiciones y colisión de las trampas, pero Lelar ya no recibe tweens de rotación.
- TypeScript pasa y el primer smoke test del cliente oficial muestra tres Lelars estáticos con `lelar_idle:idle`, frame avanzado e `isPlaying: true`.

## Evolucion visual, Spider y Studio

- Solicitud actual: centralizar el registro visual, animar Spider, convertir su telarana progresiva en un peligro que bloquea y dana, variar Lelar, reincorporar Spin por nivel y generalizar Studio.
- Context7 Phaser 3.90 consultado para atlas JSON Hash, `startFrame`, `Graphics.clear`, profundidad, ciclo de escena y parada segura de tweens.
- `spider_walk` fue promovido a los assets canonicos y ampliado a 2176 px para que los ocho frames sean validos; los PNG auxiliares quedaron en `enemies/source` fuera del runtime.
- Registro compartido y perfiles visuales centralizados. Spider ya usa animacion, movimiento de 3 celdas/s basado en delta, hilo grafico progresivo y celdas peligrosas; Lucy detiene el slide en el primer peligro.
- TypeScript pasa despues del primer bloque de gameplay.
- Ajuste solicitado durante la implementacion: Spider mantiene siempre la orientacion original, su conteo progresa por bandas de diez niveles (1/2/3), y Lelar usa escalas visibles 0.55/0.75/1 con mayor peso en pequeno y medio.
- Studio comparte el registro runtime, descubre pares, admite carga multiple, rectangulos de atlas, frame inicial y duraciones, y valida rutas/payload antes de guardar. API traversal verificado con respuesta 403.
- Validacion visual: nivel 10 muestra una Spider sin giro/espejo; nivel 30 muestra tres, hilos blancos, Spin y Lelars de tres tamanos. `render_game_to_text` coincide con las capturas.
- Validacion final de progresion: nivel 20 genera exactamente dos Spider y nivel 31 exactamente tres; todas reportan `angle: 0`, `flipX: false`, animacion activa y telarana creciente/retractil. En nivel 31 conviven Spin y Lelar con escala 0.55/0.75/1 sin agregar trampas logicas.
- `npm ci`, `npm run assets:verify`, `npx tsc --noEmit`, `npm run build`, `npm run build:ihost` y `git diff --check` pasan. El juego y Studio cargan sus assets sin 404 ni errores de consola. El proyecto no define scripts separados de lint o tests.
- La validacion iHost detecto y corrigio dos rutas de Studio dependientes de la base desplegada: la API de descubrimiento se limita a desarrollo y la referencia de Lucy usa `BASE_URL`.
- Ajuste local sin commit solicitado: Worm inicia desfasado por instancia y usa escalas discretas deterministas entre 0.40 y 0.80; `render_game_to_text` expone ambos valores.
- Validado en nivel 26: cuatro Worm usan frames iniciales `2/5/0/3`, escalas `0.40/0.55/0.70/0.80`, avanzan manteniendo el desfase y no generan errores de consola.

## Fondos progresivos 0.1.7

- Los tres fondos entregados quedaron saneados y ubicados en `src/assets/sprites/tiles/backgrounds/` con nombres canónicos: entrada del bosque, antesala del laberinto y piso del templo.
- La carga usa el registro visual compartido. Cada escenario dura diez niveles, cicla después del tercero y combina de forma independiente los cinco colores de grilla existentes.
- El patrón se dibuja con `TileSprite` sobre una referencia de 16×16 celdas, con una capa cromática tenue por encima; la geometría, entidades y gameplay no cambian.
- Studio recibe los fondos desde el mismo registro y `assets:verify` valida presencia, formato, dimensiones cuadradas y canales de color.
- Versión de la aplicación actualizada a `0.1.7` en los metadatos y README.
- Validación visual completada en niveles 1, 10, 11, 20, 21, 30 y 31: los cambios ocurren solo al cruzar cada bloque de diez niveles. Studio, movimiento, restart y menú funcionan sin errores ni advertencias de consola.

## TODO Worm y Lelar

- Implementación y documentación completadas. Los atlas tienen ocho frames contiguos y válidos; Worm usa 3 FPS en bucle y Lelar 1 FPS con bucle/yoyo según Studio.
- `npm ci`, `assets:verify`, TypeScript, builds normal/iHost y `git diff --check` pasan. El proyecto no define scripts separados de lint o tests.
- Cliente Playwright oficial y navegador confirman ciclos, movimiento/orientación de Worm, posición estática de Lelar, restart/cambio de nivel y convivencia con la araña; el juego no registra errores de consola ni 404 de los atlas.
- Studio auto-detecta correctamente las dos láminas (8x1) y permite previsualizarlas. Su página conserva un 404 preexistente y ajeno para `/favicon.ico`.
- Commit confirmado en `ihost/main` y publicación iHost completada desde un checkout limpio; navegador, dashboard y FileBrowser validan la versión activa.
