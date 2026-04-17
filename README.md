# Code-to-City (Architectural SimCity)

Visualize your codebase as an interactive 3D city. When build fails, the faulty module catches fire!

![Code-to-City](https://github.com/hubinoretros/code-to-city/raw/main/media/preview.png)

## Features

- **3D City Visualization**: Every class becomes a building in a stunning 3D city
- **Multi-Language Support**: C#, JavaScript, TypeScript, Python, Java, Go, Rust, C++, PHP and more
- **Smart Categorization**: Buildings are color-coded by type (Controller, Service, Model, Repository, etc.)
- **Build Monitoring**: Watch your city - when build fails, the faulty module catches fire!
- **Navigate & Explore**: Free movement with WASD keys, mouse look, and zoom
- **Go to Code**: Click any building to jump directly to its source code
- **Sidebar Integration**: Access from VSCode sidebar

## Supported Languages

C#, JavaScript/TypeScript, Python, Java, Go, Rust, C/C++, Ruby, PHP, Swift, Kotlin, Scala

## Installation

```bash
code --install-extension code-to-city-2.2.1.vsix
```

Or install directly from the Extensions panel in VSCode.

## Usage

1. Open any software project in VSCode
2. Press `Ctrl+Shift+P` and type "Code-to-City: Open City"
3. Explore your code as a 3D city!

## Controls

| Key | Action |
|-----|--------|
| W/A/S/D or Arrow Keys | Move around the city |
| Space | Move up |
| Shift | Move down |
| Mouse Drag | Look around |
| Mouse Wheel | Zoom in/out |
| Click on building | Jump to source code |
| Reset | Reset camera position |
| Top View | Bird's eye view |
| Street | Street level view |

## Building Types

| Type | Color | Description |
|------|-------|-------------|
| Controller | Red | API endpoints |
| Service | Teal | Business logic |
| Model | Blue | Data models |
| Repository | Green | Data access |
| Interface | Purple | Abstract types |
| Helper | Yellow | Utility classes |
| Component | Light Blue | UI components |
| Test | Pink | Test classes |

## Sidebar

The extension also appears in VSCode's sidebar for quick access.

## Changelog

### 2.2.0
- Sidebar integration
- English-only interface (global)
- Publisher: Nacho
- GitHub: https://github.com/hubinoretros/code-to-city

### 2.1.0
- Performance optimizations
- FPS improvements
- Smoother animations

### 2.0.0
- Multi-language support
- New building types
- Dependency bridges

### 1.0.0
- Initial release

## Publisher

**Nacho** - https://github.com/hubinoretros

## License

MIT
