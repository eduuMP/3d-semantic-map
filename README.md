# mapa-semantico-3d

Convierte tus apuntes en PDF en un mapa 3D de temas al que puedes hacer preguntas y del que salen tarjetas de estudio, todo con IA que corre en tu navegador.

> Requiere un navegador con WebGPU (Chrome o Edge recientes). La primera vez descarga los modelos (~1-2 GB); después quedan en caché.

## Instalación

```bash
npm install && npm run dev
```

## Scripts

- `npm run dev` · `npm run build`
- `npm run check` = `lint` + `typecheck` + `test` (CI ejecuta además `npm run build`)

## Uso

Abre http://localhost:3000, sube un PDF y haz clic en un tema del mapa.

## Tecnologías

- Next.js · TypeScript · Tailwind
- WebLLM · Transformers.js · umap-js · ml-kmeans · Dexie · Plotly
- Vitest · GitHub Actions · Vercel

## Contribuir

Una rama por historia (`feature/hN-descripcion`), `npm run check` antes de cada commit, Conventional Commits en minúsculas y español, y PR con preview de Vercel antes de integrar en `main`.
