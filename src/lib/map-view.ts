const EXCERPT_CHARS = 180;
const LINE_CHARS = 48;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Parte un texto en líneas de como mucho `width` caracteres, sin cortar palabras. */
export function wrapText(text: string, width = LINE_CHARS): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Texto del hover de Plotly: documento, página y extracto. Plotly interpreta
 * HTML, así que todo lo que viene del PDF se escapa antes de añadir etiquetas.
 */
export function hoverText(
  chunkText: string,
  page: number,
  documentName: string,
): string {
  const flat = chunkText.replace(/\s+/g, " ").trim();
  const excerpt =
    flat.length > EXCERPT_CHARS
      ? `${flat.slice(0, EXCERPT_CHARS).trimEnd()}…`
      : flat;
  const body = wrapText(excerpt).map(escapeHtml).join("<br>");
  return `<b>${escapeHtml(documentName)}</b> · p. ${page}<br>${body}`;
}

type MaybePositioned = { xyz?: unknown };

/** Hay mapa si al menos un fragmento tiene coordenadas. */
export function hasMap(chunks: readonly MaybePositioned[]): boolean {
  return chunks.some((c) => c.xyz !== undefined);
}

/** El mapa está desactualizado si algún fragmento no tiene coordenadas. */
export function isMapStale(chunks: readonly MaybePositioned[]): boolean {
  return chunks.length > 0 && chunks.some((c) => c.xyz === undefined);
}

export type DownloadFile = { loaded: number; total: number };

/** Progreso global de la descarga del modelo (suma de todos sus archivos). */
export function aggregateDownloadProgress(
  files: Record<string, DownloadFile>,
): {
  loaded: number;
  total: number;
  percent: number;
} {
  let loaded = 0;
  let total = 0;
  for (const file of Object.values(files)) {
    if (file.total > 0) {
      loaded += Math.min(file.loaded, file.total);
      total += file.total;
    }
  }
  return {
    loaded,
    total,
    percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
  };
}
