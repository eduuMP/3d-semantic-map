"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { db, type DocumentRecord } from "@/lib/db";
import {
  INGEST_ERROR_MESSAGES,
  PHASE_LABELS,
  type IngestMessage,
  type IngestPhase,
} from "@/lib/ingest-protocol";

type Progress = { phase: IngestPhase; current: number; total: number };

// Tramo de la barra que ocupa cada fase (la extracción es lo más lento).
const PHASE_RANGE: Record<IngestPhase, [number, number]> = {
  reading: [0, 5],
  extracting: [5, 80],
  chunking: [80, 85],
  saving: [85, 100],
};

function percent({ phase, current, total }: Progress) {
  const [from, to] = PHASE_RANGE[phase];
  const fraction = total > 0 ? Math.min(current / total, 1) : 0;
  return Math.round(from + (to - from) * fraction);
}

async function latestDocument(): Promise<DocumentRecord | null> {
  const [latest] = await db.documents
    .orderBy("createdAt")
    .reverse()
    .limit(1)
    .toArray();
  return latest ?? null;
}

export function PdfUpload() {
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(
    null,
  );
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadDocument = useCallback(async () => {
    setDocumentRecord(await latestDocument());
  }, []);

  useEffect(() => {
    let cancelled = false;
    latestDocument()
      .then((latest) => {
        if (!cancelled) setDocumentRecord(latest);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      workerRef.current?.terminate();
    };
  }, []);

  const busy = progress !== null;

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || workerRef.current) return;
      setError(null);
      setProgress({ phase: "reading", current: 0, total: 1 });

      const worker = new Worker(
        new URL("../workers/ingest.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;

      const finish = () => {
        worker.terminate();
        workerRef.current = null;
        setProgress(null);
      };

      worker.onmessage = (event: MessageEvent<IngestMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          setProgress({
            phase: message.phase,
            current: message.current,
            total: message.total,
          });
        } else if (message.type === "done") {
          finish();
          loadDocument().catch((e) => {
            console.error("[pdf-upload] no se pudo leer el documento", e);
            setError("El PDF se procesó pero no se pudo leer lo guardado.");
          });
        } else if (message.type === "error") {
          console.error(
            `[pdf-upload] ingest error ${message.code}: ${message.message}`,
          );
          finish();
          setError(INGEST_ERROR_MESSAGES[message.code]);
        } else {
          // Mensaje ajeno a nuestro protocolo (p. ej. del bundler en dev).
          console.debug("[pdf-upload] mensaje ignorado del worker", message);
        }
      };
      worker.onerror = (e) => {
        console.error("[pdf-upload] error del worker", e.message, e);
        finish();
        setError(INGEST_ERROR_MESSAGES.unknown);
      };

      worker.postMessage({ type: "ingest", file });
    },
    [loadDocument],
  );

  return (
    <section className="flex w-full max-w-xl flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-blue-500 bg-blue-500/10" : "border-current/30"
        }`}
      >
        <p className="font-medium">Arrastra aquí tu PDF de apuntes</p>
        <p className="text-sm opacity-70">o</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Seleccionar PDF
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {documentRecord && !busy && (
          <p className="text-xs opacity-60">
            Subir otro PDF sustituirá al actual.
          </p>
        )}
      </div>

      {progress && (
        <div role="status" className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span>
              {PHASE_LABELS[progress.phase]}
              {progress.phase === "extracting" &&
                ` (página ${progress.current} de ${progress.total})`}
              …
            </span>
            <span>{percent(progress)} %</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-current/15">
            <div
              className="h-full bg-blue-600 transition-[width]"
              style={{ width: `${percent(progress)}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/15 p-3 text-sm">
          {error}
        </p>
      )}

      {documentRecord && !busy && (
        <div className="rounded-lg border border-current/20 p-4 text-left">
          <p className="font-medium break-all">{documentRecord.name}</p>
          <p className="text-sm opacity-70">
            {documentRecord.pages} páginas · {documentRecord.chunkCount}{" "}
            fragmentos
          </p>
        </div>
      )}
    </section>
  );
}
