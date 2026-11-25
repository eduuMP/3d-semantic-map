import { z } from "zod";

/** Salida del LLM al nombrar un tema. */
export const TopicNameSchema = z.object({
  nombre: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(2).max(60)),
});

export type TopicName = z.infer<typeof TopicNameSchema>;
