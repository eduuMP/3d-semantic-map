# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). `feat:` → Added, `fix:` → Fixed, `refactor:`/`chore:` → Changed.

## [Unreleased]

### Added
- Subida de PDF por arrastrar o seleccionar, con extracción de texto por página (pdfjs en worker) y barra de progreso (H1)
- Troceado ~500 tokens con solape de 50 que conserva la página (`chunking.ts`) con tests (H1)
- Esquema Dexie v1 (`documents`, `chunks`, `topics`, `cards`); un PDF nuevo sustituye al anterior (H1)
- Mensajes claros para PDF sin texto (escaneado) y archivos que no son PDF (H1)
- Esqueleto Next.js (App Router) + TypeScript + Tailwind con scripts `lint`, `typecheck`, `test` y `check` (H0)
- Vitest configurado con tests de `detectWebGpu` (H0)
- Detección de WebGPU: pantalla "Navegador no compatible" para Chrome/Edge (H0)
- `prettier` como devDependency (lo usa el hook de formato) (H0)

### Changed
- `@types/node` a ^24 (requerido por vitest 5, igual que Node 24 de CI) (H0)
- `README.md` y `CHANGELOG.md` dejan de estar en `.gitignore` y se versionan (H0)
