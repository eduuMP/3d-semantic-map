export type MapPhase =
  "model" | "embedding" | "layout" | "clustering" | "saving";

export type MapErrorCode =
  | "no-webgpu"
  | "no-chunks"
  | "model"
  | "embedding"
  | "changed"
  | "no-subject"
  | "unknown";

/** UI → worker */
export type MapRequest = { type: "build"; subjectId: number };

/** worker → UI */
export type MapMessage =
  | {
      type: "progress";
      phase: MapPhase;
      current: number;
      total: number;
      /** Solo en la fase "model": megabytes descargados / totales. */
      downloadedMb?: number;
      totalMb?: number;
    }
  | {
      type: "done";
      points: number;
      topics: number;
      /** Fragmentos nuevos a los que se les calculó el embedding en esta pasada. */
      embedded: number;
      /** Cuántos superaban los 512 tokens del modelo (se recortan). null = no se pudo medir. */
      truncated: number | null;
    }
  | { type: "error"; code: MapErrorCode; message: string };

export const MAP_ERROR_MESSAGES: Record<MapErrorCode, string> = {
  "no-webgpu":
    "Tu navegador no ofrece WebGPU. Usa Chrome o Edge recientes en un equipo con GPU.",
  "no-chunks": "Esta asignatura aún no tiene texto. Sube algún PDF primero.",
  model:
    "No se pudo cargar el modelo. Comprueba tu conexión (solo hace falta la primera vez) y vuelve a intentarlo.",
  embedding:
    "El cálculo falló en tu GPU (puede ser falta de memoria o un fallo del controlador). Cierra otras pestañas pesadas y vuelve a intentarlo.",
  changed:
    "Los apuntes cambiaron mientras se calculaba el mapa. Vuelve a generarlo.",
  "no-subject": "La asignatura ya no existe. Recarga la página.",
  unknown: "No se pudo generar el mapa.",
};

export const MAP_PHASE_LABELS: Record<MapPhase, string> = {
  model: "Descargando el modelo (solo la primera vez)",
  embedding: "Calculando el significado de cada fragmento",
  layout: "Colocando los fragmentos en 3D",
  clustering: "Agrupando por temas",
  saving: "Guardando el mapa",
};
