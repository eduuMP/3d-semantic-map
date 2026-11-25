export type LlmErrorCode =
  "no-webgpu" | "model" | "generation" | "no-subject" | "unknown";

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
  | { type: "error"; code: LlmErrorCode; message: string; requestId?: number };

export const LLM_ERROR_MESSAGES: Record<LlmErrorCode, string> = {
  "no-webgpu":
    "Tu navegador no ofrece WebGPU. Usa Chrome o Edge recientes en un equipo con GPU.",
  model:
    "No se pudo cargar ningún modelo de lenguaje. Comprueba tu conexión (solo hace falta la primera vez), cierra otras pestañas pesadas y vuelve a intentarlo.",
  generation:
    "El modelo falló al generar el texto (puede ser falta de memoria de la GPU). Vuelve a intentarlo.",
  "no-subject": "La asignatura ya no existe. Recarga la página.",
  unknown: "Algo falló con el modelo de lenguaje.",
};
