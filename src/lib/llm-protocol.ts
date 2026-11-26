export type LlmErrorCode =
  | "no-webgpu"
  | "gpu-lost"
  | "model"
  | "generation"
  | "embedding"
  | "no-sources"
  | "bad-question"
  | "no-subject"
  | "unknown";

/** UI → worker */
export type LlmRequest =
  | { type: "label-topics"; subjectId: number; preferredModel?: string | null }
  | {
      type: "summarize";
      requestId: number;
      text: string;
      page: number;
      preferredModel?: string | null;
    }
  | {
      type: "ask";
      requestId: number;
      subjectId: number;
      /** Sin tema: se busca en toda la asignatura. */
      topicId?: number;
      question: string;
      preferredModel?: string | null;
    }
  | { type: "cancel" };

/** worker → UI */
export type LlmMessage =
  | {
      type: "loading";
      /** Id del modelo que se está cargando (cambia si hay que bajar al siguiente). */
      model: string;
      /** 0-100. */
      percent: number;
      /** Texto de WebLLM sobre la fase actual. */
      text: string;
    }
  | { type: "ready"; model: string }
  | { type: "labeling"; current: number; total: number }
  | { type: "labeled"; named: number; failed: number }
  | { type: "token"; requestId: number; text: string }
  | { type: "summary-done"; requestId: number }
  | { type: "ask-status"; requestId: number; phase: "embedding" | "answering" }
  | { type: "ask-sources"; requestId: number; sources: AskSource[] }
  | { type: "answer-token"; requestId: number; text: string }
  | {
      type: "answer-done";
      requestId: number;
      text: string;
      cited: number[];
      unverified: number[];
      notFound: boolean;
    }
  | { type: "error"; code: LlmErrorCode; message: string; requestId?: number };

export type AskSource = {
  chunkId: number;
  page: number;
  documentName: string;
  /** Primeras palabras del fragmento, para reconocerlo en la lista. */
  excerpt: string;
};

export const LLM_ERROR_MESSAGES: Record<LlmErrorCode, string> = {
  "no-webgpu":
    "Tu navegador no ofrece WebGPU. Usa Chrome o Edge recientes en un equipo con GPU.",
  "gpu-lost":
    "Windows reinició la GPU (tardó demasiado en una operación) y Chrome no puede volver a usarla. Cierra Chrome por completo, pulsa Win + Ctrl + Shift + B para reiniciar el controlador gráfico y vuelve a intentarlo.",
  model:
    "No se pudo cargar ningún modelo de lenguaje. Comprueba tu conexión (solo hace falta la primera vez), cierra otras pestañas pesadas y vuelve a intentarlo.",
  generation:
    "El modelo falló al generar el texto (puede ser falta de memoria de la GPU). Vuelve a intentarlo.",
  embedding:
    "No se pudo analizar la pregunta con el modelo de embeddings. Comprueba tu conexión (solo la primera vez) y vuelve a intentarlo.",
  "no-sources":
    "Aún no hay fragmentos analizados en esta asignatura. Pulsa «Generar mapa» y vuelve a preguntar.",
  "bad-question": "Escribe una pregunta de entre 3 y 500 caracteres.",
  "no-subject": "La asignatura ya no existe. Recarga la página.",
  unknown: "Algo falló con el modelo de lenguaje.",
};
