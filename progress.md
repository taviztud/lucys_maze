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
