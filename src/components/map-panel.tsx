"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  type ChunkRecord,
  type DocumentRecord,
  type TopicRecord,
} from "@/lib/db";
import {
  MAP_ERROR_MESSAGES,
  MAP_PHASE_LABELS,
  type MapMessage,
  type MapPhase,
} from "@/lib/map-protocol";
import { hasMap, hoverText, isMapStale } from "@/lib/map-view";
import { ChunkDetail } from "./chunk-detail";
import { Map3D, type MapPoint, type MapTopic } from "./map-3d";

type Progress = {
  phase: MapPhase;
  current: number;
  total: number;
  downloadedMb?: number;
  totalMb?: number;
};

type PanelProps = {
  subjectId: number;
  /** Desactiva el botón (p. ej. mientras se sube un PDF). */
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

type PanelData = {
  chunks: ChunkRecord[];
  documents: DocumentRecord[];
  topics: TopicRecord[];
};

function progressLabel(p: Progress) {
  if (p.phase === "model") {
    return p.totalMb
      ? `${MAP_PHASE_LABELS.model}: ${p.downloadedMb} de ${p.totalMb} MB`
      : "Preparando el modelo…";
  }
  return `${MAP_PHASE_LABELS[p.phase]}…`;
}

function progressPercent(p: Progress) {
  if (p.total <= 0) return 0;
  return Math.round(Math.min(p.current / p.total, 1) * 100);
}

export function MapPanel({
  subjectId,
  disabled = false,
  onBusyChange,
}: PanelProps) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Sube al terminar un cálculo para volver a leer los datos ya definitivos.
  const [dataVersion, setDataVersion] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const lastDataRef = useRef<PanelData | null>(null);

  // `undefined` = cargando, `null` = error al leer IndexedDB.
  // Mientras el worker calcula escribe en la base de datos en cada lote; para
  // no releer miles de fragmentos (con sus vectores) y redibujar Plotly cada
  // vez, se devuelven los datos anteriores hasta que termina.
  const data = useLiveQuery(
    async (): Promise<PanelData | null> => {
      if (workerRef.current && lastDataRef.current) return lastDataRef.current;
      try {
        const [chunks, documents, topics] = await Promise.all([
          db.chunks.where("subjectId").equals(subjectId).toArray(),
          db.documents.where("subjectId").equals(subjectId).toArray(),
          db.topics.where("subjectId").equals(subjectId).toArray(),
        ]);
        const result = { chunks, documents, topics };
        lastDataRef.current = result;
        return result;
      } catch (e) {
        console.error("[map-panel] no se pudo leer la base de datos", e);
        return null;
      }
    },
    [subjectId, dataVersion],
    undefined,
  );
  const onBusyRef = useRef(onBusyChange);
  useEffect(() => {
    onBusyRef.current = onBusyChange;
  }, [onBusyChange]);

  useEffect(
    () => () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
        onBusyRef.current?.(false);
      }
    },
    [],
  );

  const { points, topics, mapped, stale, chunkCount } = useMemo(() => {
    if (!data) {
      return {
        points: [] as MapPoint[],
        topics: [] as MapTopic[],
        mapped: false,
        stale: false,
        chunkCount: 0,
      };
    }
    const names = new Map(data.documents.map((d) => [d.id, d.name]));
    const usedTopics = new Set<number>();
    const pts: MapPoint[] = [];
    for (const chunk of data.chunks) {
      if (!chunk.xyz || chunk.topicId === undefined) continue;
      usedTopics.add(chunk.topicId);
      pts.push({
        x: chunk.xyz[0],
        y: chunk.xyz[1],
        z: chunk.xyz[2],
        chunkId: chunk.id,
        topicId: chunk.topicId,
        hover: hoverText(
          chunk.text,
          chunk.page,
          names.get(chunk.documentId) ?? "",
        ),
      });
    }
    return {
      points: pts,
      topics: data.topics
        .filter((t) => usedTopics.has(t.id))
        .sort((a, b) => a.id - b.id)
        .map((t) => ({ id: t.id, name: t.name ?? `Tema ${t.id}` })),
      mapped: hasMap(data.chunks),
      stale: isMapStale(data.chunks),
      chunkCount: data.chunks.length,
    };
  }, [data]);

  // Fragmento abierto en el panel (null si ya no existe, p. ej. tras quitar un PDF).
  const selectedChunk = useMemo(() => {
    if (!data || selectedId === null) return null;
    const chunk = data.chunks.find((c) => c.id === selectedId);
    if (!chunk) return null;
    const topic = data.topics.find((t) => t.id === chunk.topicId);
    return {
      text: chunk.text,
      page: chunk.page,
      documentName:
        data.documents.find((d) => d.id === chunk.documentId)?.name ?? "",
      topicName: topic ? (topic.name ?? `Tema ${topic.id}`) : null,
    };
  }, [data, selectedId]);

  // Si todos los fragmentos ya tienen vector, calcular el mapa no descarga el modelo.
  const allEmbedded = data ? data.chunks.every((c) => c.vector) : false;

  const building = progress !== null;

  const build = useCallback(() => {
    if (workerRef.current) return;
    setError(null);
    setProgress({ phase: "model", current: 0, total: 0 });
    onBusyRef.current?.(true);

    const worker = new Worker(
      new URL("../workers/map.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    const finish = () => {
      worker.terminate();
      workerRef.current = null;
      setProgress(null);
      setDataVersion((version) => version + 1);
      onBusyRef.current?.(false);
    };

    worker.onmessage = (event: MessageEvent<MapMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        setProgress({
          phase: message.phase,
          current: message.current,
          total: message.total,
          downloadedMb: message.downloadedMb,
          totalMb: message.totalMb,
        });
      } else if (message.type === "done") {
        console.info(
          `[map] ${message.points} fragmentos, ${message.topics} temas, ` +
            `${message.embedded} embeddings nuevos, ` +
            `${message.truncated ?? "?"} superan los 512 tokens del modelo`,
        );
        finish();
      } else if (message.type === "error") {
        console.error(`[map] ${message.code}: ${message.message}`);
        finish();
        setError(MAP_ERROR_MESSAGES[message.code]);
      }
      // Cualquier otro mensaje (p. ej. del bundler en dev) se ignora.
    };
    worker.onerror = (e) => {
      console.error("[map] error del worker", e.message, e);
      finish();
      setError(MAP_ERROR_MESSAGES.unknown);
    };

    worker.postMessage({ type: "build", subjectId });
  }, [subjectId]);

  if (data === null) {
    return (
      <p role="alert" className="rounded-lg bg-red-500/15 p-3 text-sm">
        No se pudo leer el almacenamiento del navegador. Cierra otras pestañas
        de la app y recarga.
      </p>
    );
  }
  if (data === undefined || chunkCount === 0) return null;

  return (
    <section className="flex w-full flex-col gap-3 text-left">
      {!building && (
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={build}
            className={
              !mapped || stale
                ? "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                : "rounded-lg border border-current/30 px-3 py-1.5 text-sm disabled:opacity-50"
            }
          >
            {!mapped
              ? "Generar mapa"
              : stale
                ? "Actualizar mapa"
                : "Recalcular mapa"}
          </button>
          {(!mapped || stale) && (
            <p className="text-xs opacity-70">
              {mapped
                ? "Hay PDFs nuevos que aún no están en el mapa."
                : allEmbedded
                  ? "Los fragmentos ya están analizados: solo hay que colocarlos en el mapa (no se descarga nada)."
                  : "La primera vez se descarga el modelo (~240 MB, hasta ~470 MB si tu GPU no admite fp16; queda en caché). Todo se calcula en tu equipo."}
            </p>
          )}
        </div>
      )}

      {progress && (
        <div role="status" className="flex flex-col gap-2">
          <div className="flex justify-between gap-3 text-sm">
            <span>{progressLabel(progress)}</span>
            {progress.total > 0 && <span>{progressPercent(progress)} %</span>}
          </div>
          <div
            role="progressbar"
            aria-label="Progreso del mapa"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent(progress)}
            className="h-2 overflow-hidden rounded-full bg-current/15"
          >
            <div
              className="h-full bg-blue-600 transition-[width]"
              style={{ width: `${progressPercent(progress)}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/15 p-3 text-sm">
          {error}
        </p>
      )}

      {points.length > 0 && (
        <Map3D points={points} topics={topics} onSelect={setSelectedId} />
      )}

      {selectedChunk && (
        <ChunkDetail
          text={selectedChunk.text}
          page={selectedChunk.page}
          documentName={selectedChunk.documentName}
          topicName={selectedChunk.topicName}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  );
}
