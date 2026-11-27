"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useSyncExternalStore } from "react";
import { escapeHtml } from "@/lib/map-view";
import { NO_DATA_COLOR, masteryColor, percent } from "@/lib/mastery";

const Plot = dynamic(() => import("./plotly-chart"), {
  ssr: false,
  loading: () => (
    <p role="status" className="p-8 text-sm opacity-70">
      Cargando el visor 3D…
    </p>
  ),
});

export type MapPoint = {
  chunkId: number;
  x: number;
  y: number;
  z: number;
  topicId: number;
  /** HTML ya escapado (ver hoverText). */
  hover: string;
  /** Dominio 0-1 de sus tarjetas; null si no se ha repasado nada. */
  masteryRate: number | null;
  /** Línea de hover del dominio (texto fijo de `masteryHover`). */
  masteryHover: string;
};

export type MapTopic = {
  id: number;
  name: string;
  /** Dominio medio del tema; null si no hay repasos. */
  masteryRate: number | null;
};

type ColorMode = "topic" | "mastery";

// Paleta categórica de 12 tonos, legible sobre fondo claro y oscuro.
const PALETTE = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
  "#1b9e77",
  "#d95f02",
];

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeTheme(callback: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function useIsDark() {
  return useSyncExternalStore(
    subscribeTheme,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

// Las coordenadas llegan normalizadas (ver normalizeCoords); el rango fijo
// evita que un punto atípico cambie la escala del visor.
const AXIS_RANGE = [-1.05, 1.05];
const CAMERA_EYE = { x: 1, y: 1, z: 0.7 };

const HIDDEN_AXIS = {
  range: AXIS_RANGE,
  showgrid: false,
  zeroline: false,
  showticklabels: false,
  showbackground: false,
  showspikes: false,
  title: { text: "" },
};

export function Map3D({
  points,
  topics,
  onSelect,
  onSelectTopic,
}: {
  points: MapPoint[];
  topics: MapTopic[];
  /** Se llama con el id del fragmento al hacer clic en un punto. */
  onSelect?: (chunkId: number) => void;
  /** Se llama con el id del tema al hacer clic en su entrada de la leyenda. */
  onSelectTopic?: (topicId: number) => void;
}) {
  const dark = useIsDark();
  const [mode, setMode] = useState<ColorMode>("topic");
  const byMastery = mode === "mastery";
  const anyReviewed = points.some((p) => p.masteryRate !== null);
  const textColor = dark ? "#ededed" : "#171717";
  // El tooltip lleva fondo y texto explícitos: sin esto, Plotly hereda el
  // color de la fuente del tema y queda texto claro sobre fondo claro.
  const tooltip = dark
    ? { bgcolor: "#1f2937", text: "#f9fafb" }
    : { bgcolor: "#ffffff", text: "#111827" };

  const data = useMemo(
    () =>
      topics.map((topic, index) => {
        const own = points.filter((p) => p.topicId === topic.id);
        const color = PALETTE[index % PALETTE.length];
        const label =
          byMastery && topic.masteryRate !== null
            ? ` · ${percent(topic.masteryRate)}`
            : "";
        return {
          type: "scatter3d",
          mode: "markers",
          name: `${escapeHtml(topic.name)} (${own.length})${label}`,
          x: own.map((p) => p.x),
          y: own.map((p) => p.y),
          z: own.map((p) => p.z),
          customdata: own.map((p) => p.chunkId),
          text: own.map(
            (p) =>
              `<i>${escapeHtml(topic.name)}</i><br>${p.hover}` +
              (byMastery ? `<br><b>${p.masteryHover}</b>` : ""),
          ),
          hovertemplate: "%{text}<extra></extra>",
          hoverlabel: {
            bgcolor: tooltip.bgcolor,
            bordercolor: byMastery ? masteryColor(topic.masteryRate) : color,
            font: { color: tooltip.text, size: 13 },
            align: "left",
          },
          marker: {
            size: 6,
            opacity: 0.95,
            color: byMastery
              ? own.map((p) => masteryColor(p.masteryRate))
              : color,
            line: { color: dark ? "#0a0a0a" : "#ffffff", width: 1 },
          },
        };
      }),
    [points, topics, dark, byMastery, tooltip.bgcolor, tooltip.text],
  );

  const layout = useMemo(
    () => ({
      height: 560,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: "rgba(0,0,0,0)",
      font: { color: textColor, size: 13 },
      showlegend: true,
      legend: {
        x: 0,
        y: 1,
        xanchor: "left",
        yanchor: "top",
        bgcolor: dark ? "rgba(10,10,10,0.7)" : "rgba(255,255,255,0.7)",
        font: { color: textColor, size: 13 },
        itemsizing: "constant",
      },
      scene: {
        xaxis: HIDDEN_AXIS,
        yaxis: HIDDEN_AXIS,
        zaxis: HIDDEN_AXIS,
        aspectmode: "cube",
        bgcolor: "rgba(0,0,0,0)",
        camera: { eye: CAMERA_EYE },
      },
    }),
    [textColor, dark],
  );

  return (
    <div className="relative left-1/2 mt-6 w-[min(64rem,calc(100vw-4rem))] -translate-x-1/2 text-left">
      <div
        role="group"
        aria-label="Colorear el mapa por"
        className="mb-2 flex items-center gap-2 text-sm"
      >
        <span className="opacity-80">Colorear por</span>
        {(
          [
            ["topic", "Tema"],
            ["mastery", "Dominio"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-lg border px-3 py-1 ${
              mode === value
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-current/30"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {byMastery && (
        <div
          className="mb-2 flex flex-col gap-1 text-xs"
          aria-label="Escala de dominio"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span>Falla siempre</span>
            <span
              aria-hidden
              className="h-2.5 w-40 rounded"
              style={{
                background: `linear-gradient(to right, ${masteryColor(0)}, ${masteryColor(0.5)}, ${masteryColor(1)})`,
              }}
            />
            <span>Lo domina</span>
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: NO_DATA_COLOR }}
              />
              Sin repasar
            </span>
          </div>
          {!anyReviewed && (
            <p className="opacity-80">
              Aún no has repasado ninguna tarjeta: todo sale en gris. Genera
              tarjetas en un tema y repásalas para ver tu dominio.
            </p>
          )}
        </div>
      )}
      <p className="mb-2 text-sm opacity-80">
        Cada punto es un fragmento de tus apuntes. Los puntos cercanos tratan de
        cosas parecidas y cada color es un tema. Pasa el ratón por un punto para
        leer un extracto, haz clic para ver el fragmento entero; haz clic en un
        tema de la leyenda para ver sus fragmentos; arrastra para girar. Los
        botones de la esquina superior derecha permiten acercar, mover o
        restablecer la vista.
      </p>
      <Plot
        data={data}
        layout={layout}
        onLegendClick={(event: { curveNumber: number }) => {
          const topic = topics[event.curveNumber];
          if (topic) onSelectTopic?.(topic.id);
          // false: no ocultar la serie, el clic abre el panel del tema.
          return false;
        }}
        onClick={(event: { points?: { customdata?: unknown }[] }) => {
          const id = event.points?.[0]?.customdata;
          if (typeof id === "number") onSelect?.(id);
        }}
        config={{
          displaylogo: false,
          responsive: true,
          // La rueda recorre la página; si no, el mapa atrapa el scroll y se
          // aleja solo.
          scrollZoom: false,
        }}
        useResizeHandler
        style={{ width: "100%" }}
      />
    </div>
  );
}
