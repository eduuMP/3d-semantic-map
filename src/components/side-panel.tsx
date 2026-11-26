"use client";

import type { LlmSummary } from "@/lib/use-llm";

export type PanelTopicInfo = {
  name: string;
  fragments: { chunkId: number; page: number; documentName: string }[];
};

export type PanelChunkInfo = {
  text: string;
  page: number;
  documentName: string;
  topicName: string | null;
};

type SidePanelProps = {
  topic: PanelTopicInfo | null;
  chunk: PanelChunkInfo | null;
  summary: LlmSummary | null;
  /** El LLM está cargando o nombrando temas: el botón espera. */
  llmBusy: boolean;
  onSummarize: () => void;
  /** Volver del fragmento a la lista del tema (solo si se llegó desde un tema). */
  onBack: () => void;
  onStop: () => void;
  onOpenChunk: (chunkId: number) => void;
  onClose: () => void;
};

/** Panel lateral: datos del tema elegido y/o fragmento abierto, con «Resumir». */
export function SidePanel({
  topic,
  chunk,
  summary,
  llmBusy,
  onSummarize,
  onBack,
  onStop,
  onOpenChunk,
  onClose,
}: SidePanelProps) {
  const summarizing = summary !== null && !summary.done;

  return (
    <aside
      aria-label="Panel del tema"
      className="fixed top-0 right-0 z-20 flex h-full w-[min(26rem,100vw)] flex-col gap-3 overflow-y-auto border-l border-current/20 bg-background p-4 text-left shadow-xl"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {(chunk?.topicName ?? topic?.name) && (
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">
              Tema
            </p>
          )}
          <h2 className="font-medium break-words">
            {chunk?.topicName ?? topic?.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded border border-current/30 px-2 py-1 text-sm"
        >
          Cerrar
        </button>
      </header>

      {chunk ? (
        <>
          {topic && (
            <button
              type="button"
              onClick={onBack}
              className="self-start text-sm underline"
            >
              ‹ Volver al tema
            </button>
          )}
          <p className="text-sm font-medium break-words">
            {chunk.documentName} · p. {chunk.page}
          </p>
          <p className="max-h-72 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">
            {chunk.text}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={llmBusy || summarizing}
              onClick={onSummarize}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Resumir
            </button>
            {summarizing && (
              <button
                type="button"
                onClick={onStop}
                className="rounded border border-current/30 px-2 py-1.5 text-sm"
              >
                Parar
              </button>
            )}
          </div>

          {summary && (
            <section
              aria-label="Resumen"
              aria-live="polite"
              className="rounded-lg bg-current/5 p-3 text-sm leading-relaxed whitespace-pre-wrap"
            >
              {summary.text || (summary.error ? "" : "Pensando…")}
              {summary.error && (
                <span role="alert" className="block text-red-600">
                  {summary.error}
                </span>
              )}
            </section>
          )}
        </>
      ) : (
        topic && (
          <>
            <p className="text-sm opacity-80">
              {topic.fragments.length}{" "}
              {topic.fragments.length === 1 ? "fragmento" : "fragmentos"}. Elige
              uno para leerlo.
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {topic.fragments.map((f) => (
                <li key={f.chunkId}>
                  <button
                    type="button"
                    onClick={() => onOpenChunk(f.chunkId)}
                    className="w-full rounded border border-current/20 px-2 py-1 text-left break-words"
                  >
                    {f.documentName} · p. {f.page}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </aside>
  );
}
