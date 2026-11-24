# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). `feat:` → Added, `fix:` → Fixed, `refactor:`/`chore:` → Changed.

## [Unreleased]

### Added
- Esqueleto Next.js (App Router) + TypeScript + Tailwind con scripts `lint`, `typecheck`, `test` y `check` (H0)
- Vitest configurado con tests de `detectWebGpu` (H0)
- Detección de WebGPU: pantalla "Navegador no compatible" para Chrome/Edge (H0)
- `prettier` como devDependency (lo usa el hook de formato) (H0)

### Changed
- `@types/node` a ^24 (requerido por vitest 5, igual que Node 24 de CI) (H0)
- `README.md` y `CHANGELOG.md` dejan de estar en `.gitignore` y se versionan (H0)

### Fixed
-
