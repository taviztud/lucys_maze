# Contexto para agentes

La progresion visual se configura en `src/visuals/levelVisuals.ts` y los assets en `src/visuals/assetRegistry.ts`. Studio y el juego comparten estos contratos; no crear presets ni rutas paralelas. Spider y su telarana son un unico peligro dinamico y deben validarse en navegador con `render_game_to_text`.

Antes de modificar sistemas dependientes de librerías externas se deben consultar los MCP disponibles, especialmente Context7, y reutilizar la documentación técnica existente del repositorio antes de asumir cómo funciona la arquitectura.

Para cambios de sprites o animaciones, leer primero `docs/sprites-and-animations.md`. Mantener los JSON exportados por Studio como fuente de verdad y reutilizar las abstracciones existentes antes de agregar carga, reproducción o constantes nuevas.
