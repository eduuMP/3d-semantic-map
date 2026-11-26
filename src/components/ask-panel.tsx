"use client";

import { Fragment, useState } from "react";
import { QuestionSchema } from "@/lib/schemas";
import type { LlmAnswer } from "@/lib/use-llm";

type AskPanelProps = {
  answer: LlmAnswer | null;
  /** El LLM está cargando o nombrando temas: la pregunta espera. */
  busy: boolean;
  onAsk: (question: string) => void;
  onStop: () => void;
  onOpenChunk: (chunkId: number) => void;
};

const CITATION = /(\[\s*pp?\.?[^\]]*\])/gi;

/** El texto de la respuesta con cada `[p. X]` resaltada; en ámbar si la página no estaba entre las fuentes. */
function AnswerText({
  text,
  unverified,
}: {
  text: string;
  unverified: number[];
}) {
  return (
    <>
      {text.split(CITATION).map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const pages = [...part.matchAll(/\d+/g)].map((m) => Number(m[0]));
        const bad = pages.some((p) => unverified.includes(p));
        return (
          <span
            key={i}
            title={
              bad
                ? "Esta página no estaba entre las fuentes usadas: cita no verificada"
                : "Página de tus apuntes"
            }
            className={
              bad
                ? "rounded bg-amber-500/25 px-1 font-medium"
                : "rounded bg-blue-600/15 px-1 font-medium"
            }
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

/** Preguntas sobre toda la asignatura: respuesta en streaming, con citas y fuentes. */
export function AskPanel({
  answer,
  busy,
  onAsk,
  onStop,
  onOpenChunk,
}: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const [invalid, setInvalid] = useState(false);
  const answering = answer !== null && !answer.done;

  const submit = () => {
    const checked = QuestionSchema.safeParse(question);
    if (!checked.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onAsk(checked.data);
  };

  return (
    <section
      aria-label="Preguntar a tus apuntes"
      className="flex flex-col gap-2"
    >
      <h3 className="text-sm font-medium">Pregunta a tus apuntes</h3>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !answering) submit();
        }}
      >
        <textarea
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!busy && !answering) submit();
            }
          }}
          rows={2}
          maxLength={500}
          placeholder="¿Qué quieres saber de tus apuntes?"
          aria-label="Tu pregunta"
          className="w-full resize-none rounded-lg border border-current/30 bg-transparent p-2 text-sm"
        />
        {invalid && (
          <p role="alert" className="text-xs text-red-600">
            Escribe una pregunta de entre 3 y 500 caracteres.
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy || answering}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Preguntar
          </button>
          {answering && (
            <button
              type="button"
              onClick={onStop}
              className="rounded border border-current/30 px-2 py-1.5 text-sm"
            >
              Parar
            </button>
          )}
        </div>
      </form>

      {answer && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="text-xs opacity-70 break-words">
            Pregunta: {answer.question}
          </p>
          <div className="rounded-lg bg-current/5 p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {answer.text ? (
              <AnswerText text={answer.text} unverified={answer.unverified} />
            ) : (
              !answer.error &&
              (answer.phase === "embedding"
                ? "Buscando en tus apuntes…"
                : "Pensando…")
            )}
            {answer.error && (
              <span role="alert" className="block text-red-600">
                {answer.error}
              </span>
            )}
          </div>

          {answer.done && answer.unverified.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Cita no verificada: p. {answer.unverified.join(", ")} no estaba
              entre las fuentes. Comprueba la respuesta en tus apuntes.
            </p>
          )}
          {answer.done &&
            !answer.error &&
            !answer.notFound &&
            answer.cited.length === 0 && (
              <p className="text-xs opacity-70">
                La respuesta no cita ninguna página: tómala con cautela.
              </p>
            )}

          {answer.sources.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium opacity-70">Fuentes usadas</p>
              <ul className="flex flex-col gap-1 text-sm">
                {answer.sources.map((source) => (
                  <li key={source.chunkId}>
                    <button
                      type="button"
                      onClick={() => onOpenChunk(source.chunkId)}
                      className="w-full rounded border border-current/20 px-2 py-1 text-left"
                    >
                      <span className="font-medium break-words">
                        {source.documentName} · p. {source.page}
                      </span>
                      <span className="block text-xs opacity-70">
                        {source.excerpt}…
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
