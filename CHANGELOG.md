# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). `feat:` → Added, `fix:` → Fixed, `refactor:`/`chore:` → Changed.

## [Unreleased]

### Added
- Subida de varios PDFs a la vez (seleccionar o arrastrar), procesados de uno en uno con progreso por archivo; un PDF que falla no detiene a los demás (H1b)
- Lista de documentos con totales y botón "Quitar" con confirmación; borra el documento y sus fragmentos (H1b)
- Aviso de duplicados (mismo nombre y tamaño) con `planUploads` y tests (H1b)
- `dexie-react-hooks` para que la lista se actualice sola (H1b)
- Subida de PDF por arrastrar o seleccionar, con extracción de texto por página (pdfjs en worker) y barra de progreso (H1)
- Troceado ~500 tokens con solape de 50 que conserva la página (`chunking.ts`) con tests (H1)
- Esquema Dexie v1 (`documents`, `chunks`, `topics`, `cards`); un PDF nuevo sustituye al anterior (H1)
- Mensajes claros para PDF sin texto (escaneado) y archivos que no son PDF y PDFs con contraseña (H1)
- Las diapositivas cortas (≥ 4 palabras) se conservan y un resto diminuto de página se absorbe en el último fragmento (H1)
- Esqueleto Next.js (App Router) + TypeScript + Tailwind con scripts `lint`, `typecheck`, `test` y `check` (H0)
- Vitest configurado con tests de `detectWebGpu` (H0)
- Detección de WebGPU: pantalla "Navegador no compatible" para Chrome/Edge (H0)
- `prettier` como devDependency (lo usa el hook de formato) (H0)

### Changed
- Subir un PDF ya no sustituye a los anteriores: se acumulan (H1b)
- `@types/node` a ^24 (requerido por vitest 5, igual que Node 24 de CI) (H0)
- `README.md` y `CHANGELOG.md` dejan de estar en `.gitignore` y se versionan (H0)
