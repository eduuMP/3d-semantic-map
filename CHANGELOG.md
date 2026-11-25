# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). `feat:` → Added, `fix:` → Fixed, `refactor:`/`chore:` → Changed.

## [Unreleased]

### Added
- Troceado por frases: en páginas largas el fragmento acaba en un final de frase y el solape son frases completas; una página que cabe en el tope (una diapositiva) es un único fragmento y las diapositivas cortas no se juntan (H1d)
- `splitSentences`: no corta en abreviaturas («p. ej.», «Fig. 3», «pág. 12»), iniciales, decimales ni listas numeradas; con tests (H1d)
- Aviso «Troceado antiguo» en la lista de documentos subidos antes de H1d, con `chunkerVersion` opcional en `DocumentRecord` (sin cambio de esquema Dexie) (H1d)
- Error específico cuando Windows retira la GPU (`DEVICE_REMOVED`) con instrucciones para recuperarla (H3)
- Temas con nombre: al generar el mapa, WebLLM en `llm.worker.ts` nombra cada tema a partir de 3-5 fragmentos cercanos al centroide, con salida JSON restringida por esquema y validada con zod; botón «Nombrar temas» para reintentar (H3)
- Modelo elegido según el equipo: por defecto Qwen2.5-3B q4 (1.5B de respaldo, variantes f32 sin `shader-f16`); si la GPU se pierde a mitad de generación (TDR de Windows) se descarta el modelo y se baja al siguiente reintentando el tema (H3)
- Leyenda clicable: un clic en un tema abre el panel lateral con sus fragmentos; el panel muestra el fragmento y el botón «Resumir» con resumen en streaming y «Parar» (H3)
- Lógica pura con tests: `pickCandidates`, `nextFallback`, `isDeviceLostError`, `pickRepresentatives`, `parseTopicName`, `dedupeNames` y el esquema zod de `{nombre}` (H3)
- Dependencias: `@mlc-ai/web-llm` y `zod` (H3)
- Mapa 3D por asignatura: botón «Generar mapa» que calcula embeddings (`multilingual-e5-small` en WebGPU, fp16 con respaldo fp32) en `map.worker.ts`, UMAP 3D y k-means (k ≈ √(n/2), entre 3 y 12), con barra de descarga del modelo y progreso por fase (H2)
- Visor Plotly `scatter3d` coloreado por tema con leyenda y recuento; el tooltip muestra tema, documento, página y extracto (HTML escapado) (H2)
- Clic en un punto abre el fragmento entero (tema, documento, página y texto) en un panel centrado (H2)
- «Actualizar mapa» solo calcula los fragmentos nuevos y «Recalcular mapa» reutiliza los vectores guardados sin descargar el modelo (H2)
- Lógica pura con tests: `chooseK`, `chooseNeighbors`, `normalizeCoords` robusto (percentil 70), `clusterPoints`, `layout3d`, `isValidEmbedding`, `sameIdSet`, `hoverText`, `isMapStale` y `aggregateDownloadProgress` (H2)
- Dependencias: `@huggingface/transformers`, `umap-js`, `ml-kmeans`, `react-plotly.js`, `plotly.js-dist-min` y, de desarrollo, `fake-indexeddb` (H2, H1c)
- Asignaturas: selector, crear, renombrar y borrar (con confirmación y recuento de PDFs); cada PDF pertenece a una asignatura y la activa se recuerda entre recargas (H1c)
- Esquema Dexie v2 (`subjects`, `subjectId` en `documents`, `chunks` y `topics`) con migración que deja lo ya subido en «Mis apuntes» y test con `fake-indexeddb` (H1c)
- `validateSubjectName` y `resolveActiveSubject` con tests; `deleteSubjectCascade` (H1c)
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
- El fragmento abierto se muestra en un panel lateral fijo en vez de bajo el mapa; «Generar mapa» ya no deja nombres «Tema N» sin resolver (H3)
- El clic en la leyenda abre el tema en vez de ocultar su serie (H3)
- Al quitar un PDF, el mapa de su asignatura queda desactualizado (se borran `xyz` y `topicId` del resto; los vectores se conservan) (H2)
- Mientras se calcula el mapa no se puede subir ni quitar PDFs, y el worker aborta si los fragmentos cambiaron durante el cálculo (H2)
- La rueda del ratón recorre la página en vez de hacer zoom sobre el mapa (H2)
- ADR: `map.worker.ts` separado de `ingest.worker.ts` y esquema con `subjects` (H2, H1c)
- Los duplicados se comprueban dentro de cada asignatura: el mismo PDF puede estar en dos (H1c)
- `deleteDocumentCascade` borra también las tarjetas de sus fragmentos (H1c)
- Los controles nativos (selector) siguen el tema claro/oscuro del navegador (H1c)
- Subir un PDF ya no sustituye a los anteriores: se acumulan (H1b)
- `@types/node` a ^24 (requerido por vitest 5, igual que Node 24 de CI) (H0)
- `README.md` y `CHANGELOG.md` dejan de estar en `.gitignore` y se versionan (H0)

### Fixed
- Tildes rotas en PDFs hechos con LaTeX (`Matem´ aticas`, `m´ ın`, `Espa˜ na`): se recomponen al normalizar el texto de cada página; también se quitan caracteres de control y de uso privado. Hay que volver a subir los PDFs ya cargados (H1)
