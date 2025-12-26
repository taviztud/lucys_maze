# Lucy's Maze

<p align="center">
  <img src="public/readme_bg.png" alt="Lucy's Maze Banner">
</p>



![Version](https://img.shields.io/badge/version-0.1.4--alpha-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Phaser](https://img.shields.io/badge/engine-Phaser%203-orange)
![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)

[English](#english) | [Español](#español)

---

<a name="english"></a>
## English

**Lucy's Maze** is a fast-paced arcade game inspired by "Tomb of the Mask". Help Lucy the Chihuahua navigate through intricate mazes, collect coins, avoid traps, and find the exit!

### Features (Alpha 0.1.4)
- **Responsive Gameplay:** Works on Desktop and Mobile devices
- **Controls:** Keyboard arrows (Desktop) and Swipe gestures (Mobile)
- **New UI:** Clean bottom control bar for both music and game actions
- **High Scores:** Local leaderboard system to track your best runs
- **Retro Aesthetics:** Pixel art style with neon grid effects
- **Progressive Difficulty:** 
  - Phase 1 (1-10): Fast acceleration
  - Phase 2 (11-34): Moderate acceleration
  - Phase 3 (35+): Gradual acceleration until max speed at level 54
- **Background Music:** 26 unique tracks with shuffle playlist system and full controls
- **Enemies:** Starting from level 5, enemies patrol the maze
- **Spiders:** New enemy type that patrols between two points (from level 10)
- **Developer Mode:** Unlockable menu to set start level, shields, continues, and score
- **Power-ups:**
  - **Shield:** Absorbs one hit without dying (with invincibility window)
  - **Continue:** Allows you to resume the game after game over (one per run)

### Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/lucys-maze.git
cd lucys-maze

# 2. Install dependencies
npm install

# 3. Run development server
npm run dev

# 4. Build for production
npm run build
```

### Controls
| Action | Desktop | Mobile |
|--------|---------|--------|
| Move | Arrow Keys | Swipe |
| Restart | R (Always available) | Button R |
| Continue | C (Game Over only) | Button C |
| Menu | M (Always available) | Button M |
| Music | UI Controls | UI Controls |

### Project Structure
```
lucys-maze/
├── public/           # Static assets (images, audio)
│   ├── *.png         # Game sprites
│   └── sound/bg/     # Background music tracks
├── src/
│   ├── scenes/       # GameScene, MenuScene
│   ├── managers/     # GameState, Input, Audio, Enemy, Spider, UI Managers
│   ├── systems/      # Collision, GridRenderer, MazeGenerator
│   ├── types/        # TypeScript type definitions
│   ├── utils/        # Utility functions
│   ├── Config.ts     # Game configuration
│   └── main.ts       # Entry point
├── index.html        # HTML template
├── styles.css        # Game UI styles
└── vite.config.ts    # Vite bundler config
```

---

<a name="español"></a>
## Español

**Lucy's Maze** es un juego arcade de ritmo rápido inspirado en "Tomb of the Mask". ¡Ayuda a Lucy la Chihuahua a navegar por laberintos intrincados, recolectar monedas, evitar trampas y encontrar la salida!

### Características (Alfa 0.1.4)
- **Jugabilidad Responsiva:** Funciona en PC y dispositivos móviles
- **Controles:** Flechas del teclado (PC) y gestos de deslizamiento (Móvil)
- **Nueva UI:** Barra de controles inferior limpia para música y acciones de juego
- **Récords:** Sistema de puntuación alta local
- **Estética Retro:** Estilo pixel art con efectos de cuadrícula neón
- **Dificultad Progresiva:** 
  - Fase 1 (1-10): Aceleración rápida
  - Fase 2 (11-34): Aceleración moderada
  - Fase 3 (35+): Aceleración gradual hasta velocidad máxima en nivel 54
- **Música de Fondo:** 26 pistas únicas con lista de reproducción aleatoria y controles completos
- **Enemigos:** A partir del nivel 5, los enemigos patrullan el laberinto
- **Arañas:** Nuevo tipo de enemigo que patrulla entre dos puntos (desde nivel 10)
- **Modo Desarrollador:** Menú desbloqueable para configurar nivel inicial, escudos, continues y puntaje
- **Power-ups:**
  - **Escudo:** Absorbe un golpe sin morir (con ventana de invencibilidad)
  - **Continuar:** Permite reanudar el juego tras perder (uno por partida)

### Comenzar

```bash
# 1. Clonar el repositorio
git clone https://github.com/yourusername/lucys-maze.git
cd lucys-maze

# 2. Instalar dependencias
npm install

# 3. Ejecutar servidor de desarrollo
npm run dev

# 4. Construir para producción
npm run build
```

### Controles
| Acción | PC | Móvil |
|--------|---------|--------|
| Mover | Flechas | Deslizar |
| Reiniciar | R (Siempre disponible) | Botón R |
| Continuar | C (Solo en Game Over) | Botón C |
| Menú | M (Siempre disponible) | Botón M |
| Música | Controles UI | Controles UI |

### Estructura del Proyecto
```
lucys-maze/
├── public/           # Recursos estáticos (imágenes, audio)
│   ├── *.png         # Sprites del juego
│   └── sound/bg/     # Pistas de música de fondo
├── src/
│   ├── scenes/       # GameScene, MenuScene
│   ├── managers/     # GameState, Input, Audio, Enemy, Spider, UI Managers
│   ├── systems/      # Collision, GridRenderer, MazeGenerator
│   ├── types/        # Definiciones de tipos TypeScript
│   ├── utils/        # Funciones utilitarias
│   ├── Config.ts     # Configuración del juego
│   └── main.ts       # Punto de entrada
├── index.html        # Plantilla HTML
├── styles.css        # Estilos de la UI del juego
└── vite.config.ts    # Configuración del empaquetador Vite
```

---

## Tech Stack / Stack Tecnológico
- **Engine:** [Phaser 3](https://phaser.io/)
- **Language:** TypeScript
- **Bundler:** Vite
- **Storage:** LocalStorage (High Scores / Récords)

## License / Licencia
This project is licensed under the MIT License.

Este proyecto está licenciado bajo la Licencia MIT.

---

Made for Lucy
