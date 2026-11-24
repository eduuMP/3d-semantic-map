export type IngestPhase = "reading" | "extracting" | "chunking" | "saving";

export type IngestErrorCode =
  "not-pdf" | "encrypted" | "no-text" | "no-subject" | "unknown";

/** UI → worker */
export type IngestRequest = {
  type: "ingest";
  file: File;
  subjectId: number;
};

/** worker → UI */
export type IngestMessage =
  | { type: "progress"; phase: IngestPhase; current: number; total: number }
  | {
      type: "done";
      documentId: number;
      pages: number;
      chunks: number;
    }
  | { type: "error"; code: IngestErrorCode; message: string };

export const INGEST_ERROR_MESSAGES: Record<IngestErrorCode, string> = {
  "not-pdf": "El archivo no es un PDF válido.",
  "no-subject": "La asignatura ya no existe. Recarga la página.",
  encrypted:
    "El PDF está protegido con contraseña. Quítala y vuelve a subirlo.",
  "no-text":
    "Este PDF no tiene texto (¿está escaneado?). Prueba con un PDF con texto seleccionable.",
  unknown: "No se pudo procesar el PDF.",
};

export const PHASE_LABELS: Record<IngestPhase, string> = {
  reading: "Leyendo archivo",
  extracting: "Extrayendo texto",
  chunking: "Troceando",
  saving: "Guardando",
};
