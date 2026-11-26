import { z } from "zod";

/** Salida del LLM al nombrar un tema. */
export const TopicNameSchema = z.object({
  nombre: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(2).max(60)),
});

export type TopicName = z.infer<typeof TopicNameSchema>;

/** Respuesta final a una pregunta: texto no vacío y de tamaño razonable. */
export const AnswerTextSchema = z.string().trim().min(1).max(6000);

/** La pregunta del usuario, antes de enviarla al modelo. */
export const QuestionSchema = z.string().trim().min(3).max(500);
