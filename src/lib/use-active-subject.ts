"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "mapa-semantico-3d:active-subject";
const listeners = new Set<() => void>();
// Respaldo en memoria si localStorage no está disponible (modo privado, etc.).
let memoryValue: string | null = null;

function read(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memoryValue;
  } catch {
    return memoryValue;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

/** Id de la asignatura activa recordada entre recargas (null si no hay). */
export function useStoredSubjectId(): [number | null, (id: number) => void] {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const parsed = raw === null ? NaN : Number(raw);
  const value = Number.isInteger(parsed) ? parsed : null;

  const set = useCallback((id: number) => {
    memoryValue = String(id);
    try {
      localStorage.setItem(KEY, String(id));
    } catch {
      // sin localStorage: se queda solo en memoria
    }
    listeners.forEach((listener) => listener());
  }, []);

  return [value, set];
}
