"use client";

import { useEffect, useState, type ReactNode } from "react";
import { detectWebGpu, type WebGpuStatus } from "@/lib/webgpu";

export function WebGpuGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WebGpuStatus | "checking">("checking");

  useEffect(() => {
    let cancelled = false;
    detectWebGpu(
      navigator as unknown as Parameters<typeof detectWebGpu>[0],
    ).then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") {
    return (
      <p className="p-8 text-center text-sm opacity-70" role="status">
        Comprobando compatibilidad del navegador…
      </p>
    );
  }

  if (status === "unsupported") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Navegador no compatible</h1>
        <p>
          Esta aplicación ejecuta la IA en tu navegador y necesita WebGPU.
          Ábrela con una versión reciente de <strong>Chrome</strong> o{" "}
          <strong>Edge</strong> en un equipo con GPU.
        </p>
        <p className="text-sm opacity-70">
          Tus apuntes nunca salen de tu equipo.
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
