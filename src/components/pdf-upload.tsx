"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import {
  INGEST_ERROR_MESSAGES,
  PHASE_LABELS,
  type IngestMessage,
  type IngestPhase,
} from "@/lib/ingest-protocol";
import { planUploads } from "@/lib/upload-queue";

type ItemStatus = "pending" | "processing" | "done" | "error" | "duplicate";

type QueueItem = {
  key: number;
  name: string;
  status: ItemStatus;
  phase?: IngestPhase;
  current?: number;
  total?: number;
  message?: string;
};

// Tramo de la barra que ocupa cada fase (la extracción es lo más lento).
const PHASE_RANGE: Record<IngestPhase, [number, number]> = {
  reading: [0, 5],
  extracting: [5, 80],
  chunking: [80, 85],
  saving: [85, 100],
};

function percent({ phase, current = 0, total = 0 }: QueueItem) {
  if (!phase) return 0;
  const [from, to] = PHASE_RANGE[phase];
  const fraction = total > 0 ? Math.min(current / total, 1) : 0;
  return Math.round(from + (to - from) * fraction);
}

function itemLabel(item: QueueItem) {
  switch (item.status) {
    case "pending":
      return "En cola";
    case "processing":
      return item.phase
        ? `${PHASE_LABELS[item.phase]}${
            item.phase === "extracting"
              ? ` (página ${item.current} de ${item.total})`
              : ""
          }…`
        : "Procesando…";
    case "done":
      return "Listo";
    case "duplicate":
      return "Ya estaba subido";
    case "error":
      return item.message ?? INGEST_ERROR_MESSAGES.unknown;
  }
}

type QueueEntry = { key: number; file: File };

export function PdfUpload() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const update = useCallback((key: number, patch: Partial<QueueItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }, []);

  const runQueue = useCallback(
    (queue: QueueEntry[]) => {
      let position = 0;

      const stop = () => {
        workerRef.current?.terminate();
        workerRef.current = null;
        setBusy(false);
      };

      const ensureWorker = () => {
        if (workerRef.current) return workerRef.current;
        const worker = new Worker(
          new URL("../workers/ingest.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = onMessage;
        worker.onerror = onWorkerCrash;
        workerRef.current = worker;
        return worker;
      };

      const next = () => {
        const current = queue[position];
        if (!current) return stop();
        update(current.key, {
          status: "processing",
          phase: "reading",
          current: 0,
          total: 1,
        });
        ensureWorker().postMessage({ type: "ingest", file: current.file });
      };

      const advance = () => {
        position += 1;
        next();
      };

      function onMessage(event: MessageEvent<IngestMessage>) {
        const message = event.data;
        const key = queue[position]?.key;
        if (key === undefined) return;
        if (message.type === "progress") {
          update(key, {
            phase: message.phase,
            current: message.current,
            total: message.total,
          });
        } else if (message.type === "done") {
          update(key, { status: "done" });
          advance();
        } else if (message.type === "error") {
          console.error(
            `[pdf-upload] ingest error ${message.code}: ${message.message}`,
          );
          update(key, {
            status: "error",
            message: INGEST_ERROR_MESSAGES[message.code],
          });
          advance();
        } else {
          // Mensaje ajeno a nuestro protocolo (p. ej. del bundler en dev).
          console.debug("[pdf-upload] mensaje ignorado del worker", message);
        }
      }

      function onWorkerCrash(e: ErrorEvent) {
        console.error("[pdf-upload] error del worker", e.message, e);
        const key = queue[position]?.key;
        if (key !== undefined) {
          update(key, {
            status: "error",
            message: INGEST_ERROR_MESSAGES.unknown,
          });
        }
        // El worker puede haber quedado inservible: se crea otro para el resto.
        workerRef.current?.terminate();
        workerRef.current = null;
        advance();
      }

      next();
    },
    [update],
  );

  const handleFiles = useCallback(
    async (list: FileList | File[] | null | undefined) => {
      const files = Array.from(list ?? []);
      if (files.length === 0 || busy) return;
      setError(null);

      let existing;
      try {
        existing = await db.documents.toArray();
      } catch (e) {
        console.error("[pdf-upload] no se pudo abrir la base de datos", e);
        setError(
          "No se pudo abrir el almacenamiento del navegador. Cierra otras pestañas de la app y recarga.",
        );
        return;
      }

      const plan = planUploads(files, existing);
      const base = Date.now();
      const queue: QueueEntry[] = plan.toProcess.map((file, i) => ({
        key: base + i,
        file,
      }));
      const duplicates: QueueItem[] = plan.duplicates.map((file, i) => ({
        key: base + queue.length + i,
        name: file.name,
        status: "duplicate",
      }));
      setItems([
        ...queue.map(({ key, file }): QueueItem => ({
          key,
          name: file.name,
          status: "pending",
        })),
        ...duplicates,
      ]);

      if (queue.length > 0) {
        setBusy(true);
        runQueue(queue);
      }
    },
    [busy, runQueue],
  );

  return (
    <section className="flex w-full max-w-xl flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-blue-500 bg-blue-500/10" : "border-current/30"
        }`}
      >
        <p className="font-medium">Arrastra aquí tus PDFs de apuntes</p>
        <p className="text-sm opacity-70">puedes subir varios a la vez</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Seleccionar PDFs
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {busy && (
          <p className="text-xs opacity-60">
            Procesando… espera a que termine para subir más.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/15 p-3 text-sm">
          {error}
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2 text-left" role="status">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex flex-col gap-1 rounded-lg border border-current/20 p-3"
            >
              <div className="flex justify-between gap-3 text-sm">
                <span className="truncate font-medium" title={item.name}>
                  {item.name}
                </span>
                <span className="shrink-0 opacity-70">
                  {item.status === "processing"
                    ? `${percent(item)} %`
                    : item.status === "done"
                      ? "✓"
                      : ""}
                </span>
              </div>
              <p
                className={`text-xs ${
                  item.status === "error" ? "text-red-500" : "opacity-70"
                }`}
              >
                {itemLabel(item)}
              </p>
              {item.status === "processing" && (
                <div className="h-2 overflow-hidden rounded-full bg-current/15">
                  <div
                    className="h-full bg-blue-600 transition-[width]"
                    style={{ width: `${percent(item)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
