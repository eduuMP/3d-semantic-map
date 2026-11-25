/** Prompts del LLM. Toda salida estructurada se valida con zod (schemas.ts). */

export const TOPIC_LABEL_SYSTEM =
  "Eres un asistente que organiza apuntes universitarios en español. " +
  "Respondes SOLO con JSON válido, sin texto adicional.";

export function topicLabelPrompt(fragments: readonly string[]): string {
  const body = fragments
    .map((text, i) => `Fragmento ${i + 1}:\n${text}`)
    .join("\n\n");
  return (
    `Estos fragmentos pertenecen al mismo tema de unos apuntes.\n\n${body}\n\n` +
    `Da al tema un nombre corto (2 a 5 palabras) en español que lo describa. ` +
    `Responde únicamente con este JSON: {"nombre": "..."}`
  );
}

export const SUMMARY_SYSTEM =
  "Eres un tutor que ayuda a repasar apuntes. Respondes en español, de forma clara y breve, " +
  "usando solo la información del fragmento.";

export function summaryPrompt(fragment: string, page: number): string {
  return (
    `Resume en 3 a 5 frases el siguiente fragmento de los apuntes (página ${page}). ` +
    `No inventes nada que no esté en el texto.\n\n${fragment}`
  );
}
