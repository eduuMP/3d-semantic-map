/// <reference lib="webworker" />
import { CreateMLCEngine, type MLCEngineInterface } from "@mlc-ai/web-llm";
import { db } from "../lib/db";
import { disposeEmbedder, embedQuery } from "../lib/embedder";
import {
  isDeviceLostError,
  nextFallback,
  pickCandidates,
} from "../lib/llm-models";
import type { LlmErrorCode, LlmMessage, LlmRequest } from "../lib/llm-protocol";
import {
  ASK_SYSTEM,
  CARD_JSON_SCHEMA,
  CARD_SYSTEM,
  SUMMARY_SYSTEM,
  askPrompt,
  cardPrompt,
  TOPIC_LABEL_SYSTEM,
  summaryPrompt,
  topicLabelPrompt,
} from "../lib/prompts";
import { MAX_CHARS_PER_FRAGMENT, planJobs, runCardJobs } from "../lib/cards";
import { QuestionSchema } from "../lib/schemas";
import { EMBEDDING_MODEL_ID } from "../lib/embedder";
import { buildContext, parseAnswer, topK } from "../lib/retrieval";
import {
  dedupeNames,
  parseTopicName,
  pickRepresentatives,
} from "../lib/topic-labels";

const TOPIC_NAME_JSON_SCHEMA = JSON.stringify({
  type: "object",
  properties: { nombre: { type: "string" } },
  required: ["nombre"],
});

const post = (message: LlmMessage) => self.postMessage(message);

class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type GpuNavigator = {
  gpu?: {
    requestAdapter: () => Promise<{
      features: Set<string>;
      limits: { maxBufferSize: number };
    } | null>;
  };
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

let engine: MLCEngineInterface | null = null;
let engineLoading: Promise<MLCEngineInterface> | null = null;
let cancelled = false;
let currentModel: string | null = null;
/** Modelos que colgaron la GPU en esta sesión: no se vuelven a intentar. */
const banned = new Set<string>();

async function gpuCapabilities() {
  const gpu = (self.navigator as unknown as GpuNavigator).gpu;
  if (!gpu) throw new LlmError("no-webgpu", "navigator.gpu no existe");
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new LlmError("no-webgpu", "sin adaptador WebGPU");
  return {
    hasF16: adapter.features.has("shader-f16"),
    maxBufferSize: adapter.limits.maxBufferSize,
  };
}

/** Carga el primer modelo viable; si falla (p. ej. sin memoria) baja al siguiente. */
async function loadEngine(
  preferred: string | null,
): Promise<MLCEngineInterface> {
  if (engine) return engine;
  if (engineLoading) return engineLoading;

  engineLoading = (async () => {
    const caps = await gpuCapabilities();
    const candidates = pickCandidates(caps, preferred).filter(
      (id) => !banned.has(id),
    );
    let current: string | null = candidates[0] ?? null;
    let lastError: unknown = null;

    while (current) {
      const model = current;
      try {
        const loaded = await CreateMLCEngine(model, {
          initProgressCallback: (report) => {
            const percent = Math.round(report.progress * 100);
            post({
              type: "loading",
              model,
              percent,
              text: report.text,
            });
          },
        });
        engine = loaded;
        currentModel = model;
        post({ type: "ready", model });
        return loaded;
      } catch (error) {
        console.warn(`[llm] no se pudo cargar ${model}`, error);
        lastError = error;
        current = nextFallback(candidates, model);
      }
    }
    // Si la GPU está retirada, ningún modelo puede cargar: se explica mejor.
    if (isDeviceLostError(messageOf(lastError))) {
      throw new LlmError("gpu-lost", messageOf(lastError));
    }
    throw new LlmError("model", messageOf(lastError));
  })();

  try {
    return await engineLoading;
  } finally {
    engineLoading = null;
  }
}

/**
 * La GPU se perdió con el modelo actual (p. ej. TDR de Windows): se descarta
 * y se carga el siguiente más pequeño. Al terminar, `ready` hace que la UI
 * guarde ese modelo como el que funciona.
 */
async function recoverEngine(preferred: string | null) {
  if (currentModel) banned.add(currentModel);
  console.warn(`[llm] GPU perdida con ${currentModel}; se baja de modelo`);
  try {
    await engine?.unload();
  } catch {
    // El motor ya está muerto: se ignora.
  }
  engine = null;
  currentModel = null;
  return loadEngine(preferred);
}

/** Pide un nombre para un tema; reintenta una vez si el JSON no es válido. */
async function nameTopic(
  llm: MLCEngineInterface,
  fragments: string[],
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await llm.chat.completions.create({
      messages: [
        { role: "system", content: TOPIC_LABEL_SYSTEM },
        { role: "user", content: topicLabelPrompt(fragments) },
      ],
      temperature: attempt === 0 ? 0.2 : 0.6,
      max_tokens: 80,
      // Gramática: el modelo solo puede producir {"nombre": "..."}.
      response_format: { type: "json_object", schema: TOPIC_NAME_JSON_SCHEMA },
    });
    const content = reply.choices[0]?.message?.content ?? "";
    const name = parseTopicName(content);
    if (name) return name;
    console.warn(
      `[llm] respuesta no válida (intento ${attempt + 1}):`,
      content,
    );
  }
  return null;
}

async function labelTopics(subjectId: number, preferred: string | null) {
  const subject = await db.subjects.get(subjectId);
  if (!subject) throw new LlmError("no-subject", "asignatura inexistente");

  const [topics, chunks] = await Promise.all([
    db.topics.where("subjectId").equals(subjectId).toArray(),
    db.chunks.where("subjectId").equals(subjectId).toArray(),
  ]);
  const ordered = [...topics].sort((a, b) => a.id - b.id);
  if (ordered.length === 0) {
    post({ type: "labeled", named: 0, failed: 0 });
    return;
  }

  let llm = await loadEngine(preferred);
  const names: (string | null)[] = [];
  cancelled = false;

  for (let i = 0; i < ordered.length; i++) {
    if (cancelled) return;
    post({ type: "labeling", current: i, total: ordered.length });
    const own = chunks
      .filter((c) => c.topicId === ordered[i].id && c.xyz)
      .map((c) => ({ id: c.id, xyz: c.xyz!, text: c.text }));
    const fragments = pickRepresentatives(own);
    let name: string | null = null;
    // Hasta 3 intentos: si la GPU se pierde, se baja de modelo y se repite.
    for (let tries = 0; fragments.length && tries < 3; tries++) {
      try {
        name = await nameTopic(llm, fragments);
        break;
      } catch (error) {
        console.warn(
          `[llm] fallo al nombrar el tema ${ordered[i].id}:`,
          messageOf(error),
        );
        if (!isDeviceLostError(messageOf(error))) break;
        try {
          llm = await recoverEngine(preferred);
        } catch (recoverError) {
          console.error("[llm] no se pudo recuperar el motor", recoverError);
          break;
        }
      }
    }
    names.push(name);
  }

  // Los que fallaron conservan su nombre actual («Tema N»).
  const finalNames = dedupeNames(
    names.map((name, i) => name ?? ordered[i].name ?? `Tema ${i + 1}`),
  );
  await db.transaction("rw", db.topics, async () => {
    for (let i = 0; i < ordered.length; i++) {
      if (names[i])
        await db.topics.update(ordered[i].id, { name: finalNames[i] });
    }
  });
  post({
    type: "labeled",
    named: names.filter(Boolean).length,
    failed: names.filter((n) => !n).length,
  });
}

async function summarize(
  requestId: number,
  text: string,
  page: number,
  preferred: string | null,
) {
  const llm = await loadEngine(preferred);
  cancelled = false;
  try {
    const stream = await llm.chat.completions.create({
      messages: [
        { role: "system", content: SUMMARY_SYSTEM },
        { role: "user", content: summaryPrompt(text, page) },
      ],
      temperature: 0.3,
      max_tokens: 400,
      stream: true,
    });
    for await (const part of stream) {
      if (cancelled) {
        llm.interruptGenerate();
        break;
      }
      const delta = part.choices[0]?.delta?.content;
      if (delta) post({ type: "token", requestId, text: delta });
    }
    post({ type: "summary-done", requestId });
  } catch (error) {
    if (isDeviceLostError(messageOf(error))) {
      // Deja cargado un modelo menor para que el siguiente intento funcione.
      await recoverEngine(preferred).catch(() => undefined);
    }
    throw new LlmError("generation", messageOf(error));
  }
}

/** Responde una pregunta con los fragmentos más parecidos del tema. */
async function ask(
  requestId: number,
  subjectId: number,
  topicId: number | undefined,
  rawQuestion: string,
  preferred: string | null,
) {
  const checked = QuestionSchema.safeParse(rawQuestion);
  if (!checked.success)
    throw new LlmError("bad-question", "pregunta no válida");
  const question = checked.data;

  // Sin tema se busca en toda la asignatura; con tema, solo en sus fragmentos.
  const chunks =
    topicId === undefined
      ? await db.chunks.where("subjectId").equals(subjectId).toArray()
      : await db.chunks.where("topicId").equals(topicId).toArray();
  const own = chunks.filter((c) => c.subjectId === subjectId);
  if (own.length === 0 || !own.some((c) => c.vector)) {
    throw new LlmError("no-sources", "sin vectores");
  }
  const documents = await db.documents
    .where("subjectId")
    .equals(subjectId)
    .toArray();
  const names = new Map(documents.map((d) => [d.id, d.name]));

  post({ type: "ask-status", requestId, phase: "embedding" });
  let queryVector: Float32Array;
  try {
    queryVector = await embedQuery(question, (downloadedMb, totalMb) =>
      post({
        type: "loading",
        model: EMBEDDING_MODEL_ID,
        percent: totalMb > 0 ? Math.round((downloadedMb / totalMb) * 100) : 0,
        text: `Descargando ${EMBEDDING_MODEL_ID}`,
      }),
    );
  } catch (error) {
    await disposeEmbedder();
    throw new LlmError("embedding", messageOf(error));
  }

  const top = topK(
    queryVector,
    own.map((c) => ({
      id: c.id,
      page: c.page,
      documentName: names.get(c.documentId) ?? "",
      text: c.text,
      vector: c.vector,
    })),
  );
  const { context, used } = buildContext(top);
  post({
    type: "ask-sources",
    requestId,
    sources: used.map((s) => ({
      chunkId: s.id,
      page: s.page,
      documentName: s.documentName,
      excerpt: s.text.replace(/\s+/g, " ").trim().slice(0, 90),
    })),
  });

  const llm = await loadEngine(preferred);
  cancelled = false;
  post({ type: "ask-status", requestId, phase: "answering" });
  let full = "";
  try {
    const stream = await llm.chat.completions.create({
      messages: [
        { role: "system", content: ASK_SYSTEM },
        { role: "user", content: askPrompt(question, context) },
      ],
      temperature: 0.2,
      max_tokens: 500,
      stream: true,
    });
    for await (const part of stream) {
      if (cancelled) {
        llm.interruptGenerate();
        break;
      }
      const delta = part.choices[0]?.delta?.content;
      if (delta) {
        full += delta;
        post({ type: "answer-token", requestId, text: delta });
      }
    }
  } catch (error) {
    if (isDeviceLostError(messageOf(error))) {
      // Deja cargado un modelo menor para que el siguiente intento funcione.
      await recoverEngine(preferred).catch(() => undefined);
    }
    throw new LlmError("generation", messageOf(error));
  }

  const parsed = parseAnswer(
    full,
    used.map((s) => s.page),
  );
  if (!parsed && !cancelled) {
    throw new LlmError("generation", "respuesta vacía");
  }
  post({
    type: "answer-done",
    requestId,
    text: parsed?.text ?? full.trim(),
    cited: parsed?.cited ?? [],
    unverified: parsed?.unverified ?? [],
    notFound: parsed?.notFound ?? false,
  });
}

/** Genera tarjetas (una llamada por tarjeta) y las guarda según salen. */
async function generateCards(
  requestId: number,
  chunkIds: number[],
  count: number,
  preferred: string | null,
) {
  const chunks = (await db.chunks.bulkGet(chunkIds)).filter(
    (c): c is NonNullable<typeof c> => !!c,
  );
  if (chunks.length === 0) throw new LlmError("no-chunks", "sin fragmentos");
  const byId = new Map(chunks.map((c) => [c.id, c]));

  const existingCards = await db.cards
    .where("chunkId")
    .anyOf(chunks.map((c) => c.id))
    .toArray();
  const existing = new Map<number, string[]>();
  for (const card of existingCards) {
    existing.set(card.chunkId, [
      ...(existing.get(card.chunkId) ?? []),
      card.question,
    ]);
  }
  const jobs = planJobs(chunks, count, new Set(existing.keys()));

  let llm = await loadEngine(preferred);
  cancelled = false;
  post({
    type: "cards-progress",
    requestId,
    done: 0,
    total: jobs.length,
    saved: 0,
  });

  const result = await runCardJobs({
    jobs,
    existing,
    isCancelled: () => cancelled,
    generate: async (chunkId, avoid, attempt) => {
      const text = byId.get(chunkId)!.text.replace(/\s+/g, " ").trim();
      try {
        const reply = await llm.chat.completions.create({
          messages: [
            { role: "system", content: CARD_SYSTEM },
            {
              role: "user",
              content: cardPrompt(
                text.slice(0, MAX_CHARS_PER_FRAGMENT),
                avoid,
                avoid.length + attempt + chunkId,
              ),
            },
          ],
          temperature: attempt === 0 ? 0.3 : 0.7,
          max_tokens: 300,
          response_format: { type: "json_object", schema: CARD_JSON_SCHEMA },
        });
        return reply.choices[0]?.message?.content ?? null;
      } catch (error) {
        console.warn("[llm] fallo al crear una tarjeta:", messageOf(error));
        if (isDeviceLostError(messageOf(error))) {
          // Baja de modelo y deja que el reintento use el nuevo motor.
          llm = await recoverEngine(preferred);
        }
        return null;
      }
    },
    onCard: async (card) => {
      await db.cards.add({
        topicId: byId.get(card.chunkId)?.topicId ?? 0,
        chunkId: card.chunkId,
        question: card.question,
        answer: card.answer,
        correct: 0,
        wrong: 0,
      });
    },
    onProgress: (done, total, saved) =>
      post({ type: "cards-progress", requestId, done, total, saved }),
  });
  post({
    type: "cards-done",
    requestId,
    requested: jobs.length,
    saved: result.saved,
    failed: result.failed,
    cancelled: result.cancelled,
  });
}

self.onmessage = async (event: MessageEvent<LlmRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelled = true;
    return;
  }
  try {
    if (request.type === "label-topics")
      await labelTopics(request.subjectId, request.preferredModel ?? null);
    else if (request.type === "ask")
      await ask(
        request.requestId,
        request.subjectId,
        request.topicId,
        request.question,
        request.preferredModel ?? null,
      );
    else if (request.type === "generate-cards")
      await generateCards(
        request.requestId,
        request.chunkIds,
        request.count,
        request.preferredModel ?? null,
      );
    else if (request.type === "summarize")
      await summarize(
        request.requestId,
        request.text,
        request.page,
        request.preferredModel ?? null,
      );
  } catch (error) {
    const known = error instanceof LlmError;
    console.error("[llm]", error);
    post({
      type: "error",
      code: known ? error.code : "unknown",
      message: messageOf(error),
      requestId:
        request.type === "summarize" ||
        request.type === "ask" ||
        request.type === "generate-cards"
          ? request.requestId
          : undefined,
    });
  }
};
