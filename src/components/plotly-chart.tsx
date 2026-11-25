"use client";

import Plotly from "plotly.js-dist-min";
import { useRef, type ComponentProps } from "react";
import createPlotlyComponent from "react-plotly.js/factory";

// Se usa el bundle mínimo de Plotly (~1 MB menos que el completo). Este módulo
// solo se carga bajo demanda desde map-3d.tsx (next/dynamic, sin SSR).
const BasePlot = createPlotlyComponent(Plotly as never);

type PlotlyFx = { Fx: { unhover: (gd: HTMLElement) => void } };

/**
 * Plot que, al hacer clic en un punto, cierra su tooltip. Si no, el recuadro
 * flotante se queda pegado sobre el mapa y tapa los puntos de detrás mientras
 * se lee el fragmento en el panel de abajo.
 */
export default function Plot(props: ComponentProps<typeof BasePlot>) {
  const { onClick, onInitialized, onUpdate, ...rest } = props;
  const graphRef = useRef<HTMLElement | null>(null);

  return (
    <BasePlot
      {...rest}
      onInitialized={(figure, gd) => {
        graphRef.current = gd;
        onInitialized?.(figure, gd);
      }}
      onUpdate={(figure, gd) => {
        graphRef.current = gd;
        onUpdate?.(figure, gd);
      }}
      onClick={(event) => {
        onClick?.(event);
        if (graphRef.current) {
          (Plotly as unknown as PlotlyFx).Fx.unhover(graphRef.current);
        }
      }}
    />
  );
}
