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

export const ASK_SYSTEM =
  "Eres un tutor que responde preguntas sobre los apuntes de un estudiante. " +
  "Respondes en español, con claridad y sin inventar nada. " +
  "Usas SOLO los fragmentos que se te dan.";

export function askPrompt(question: string, context: string): string {
  return (
    `Fragmentos de los apuntes (cada uno empieza con su página entre corchetes):\n\n${context}\n\n` +
    `Pregunta: ${question}\n\n` +
    `Reglas:\n` +
    `- Responde solo con la información de los fragmentos.\n` +
    `- Después de cada afirmación cita la página así: [p. 3]. Si usas varias, [p. 3] [p. 5].\n` +
    `- Cita únicamente páginas que aparezcan en los fragmentos.\n` +
    `- Si los fragmentos no contienen la respuesta, responde exactamente: "No aparece en tus apuntes."`
  );
}

export const CARD_SYSTEM =
  "Eres un tutor que crea tarjetas de estudio a partir de unos apuntes en español. " +
  "Respondes SOLO con JSON válido, sin texto adicional.";

export const CARD_JSON_SCHEMA = JSON.stringify({
  type: "object",
  properties: { pregunta: { type: "string" }, respuesta: { type: "string" } },
  required: ["pregunta", "respuesta"],
});

/** Tipos de pregunta que se van alternando para que no sean todas «¿Qué es X?». */
export const CARD_STYLES = [
  "explique por qué o cómo ocurre algo",
  "compare o distinga dos conceptos del texto",
  "pida aplicar la idea a un ejemplo o caso concreto",
  "pregunte por una condición, propiedad o consecuencia",
] as const;

/**
 * `avoid`: preguntas que ya existen sobre este fragmento, para no repetirlas.
 * `variant`: elige el tipo de pregunta (se reduce al número de tipos).
 */
export function cardPrompt(
  fragment: string,
  avoid: readonly string[] = [],
  variant = 0,
): string {
  const style = CARD_STYLES[Math.abs(variant) % CARD_STYLES.length];
  const already = avoid.length
    ? `\n\nYa existen estas preguntas, haz una distinta sobre otra idea del texto:\n${avoid
        .map((q) => `- ${q}`)
        .join("\n")}`
    : "";
  return (
    `Fragmento de los apuntes:\n\n${fragment}${already}\n\n` +
    `Crea UNA tarjeta de estudio sobre un concepto importante del fragmento. ` +
    `Evita la pregunta de definición «¿Qué es X?»: prefiere una que ${style}, si el texto lo permite. ` +
    `La pregunta debe poder entenderse sin ver el texto (no digas «el fragmento» ni «la página») ` +
    `y la respuesta debe ser breve (1 a 3 frases) y salir solo del fragmento. ` +
    `Responde únicamente con este JSON: {"pregunta": "...", "respuesta": "..."}`
  );
}
