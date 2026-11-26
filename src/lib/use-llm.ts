"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readLastGoodModel, saveLastGoodModel } from "./llm-models";
import {
  LLM_ERROR_MESSAGES,
  type AskSource,
  type LlmMessage,
  type LlmRequest,
} from "./llm-protocol";

export type LlmLoading = { model: string; percent: number; text: string };
export type LlmLabeling = { current: number; total: number };
export type LlmSummary = { text: string; done: boolean; error?: string };
export type LlmAnswer = {
  question: string;
  phase: "embedding" | "answering";
  sources: AskSource[];
  text: string;
  done: boolean;
  cited: number[];
  unverified: number[];
  notFound: boolean;
  error?: string;
};

/** Los ids de pregunta empiezan aquí para no chocar con los de resumen. */
const ASK_ID_BASE = 1_000_000;

/**
 * Gestiona el worker del LLM: se crea al primer uso (descarga el modelo solo
 * entonces) y se mantiene vivo mientras el componente esté montado.
 */
export function useLlm(options: { onLabeled?: () => void } = {}) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const askIdRef = useRef(ASK_ID_BASE);
  const onLabeledRef = useRef(options.onLabeled);
  useEffect(() => {
    onLabeledRef.current = options.onLabeled;
  }, [options.onLabeled]);

  const [loading, setLoading] = useState<LlmLoading | null>(null);
  const [labeling, setLabeling] = useState<LlmLabeling | null>(null);
  const [summary, setSummary] = useState<LlmSummary | null>(null);
  const [answer, setAnswer] = useState<LlmAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [],
  );

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(
      new URL("../workers/llm.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (event: MessageEvent<LlmMessage>) => {
      const message = event.data;
      switch (message.type) {
        case "loading":
          setLoading({
            model: message.model,
            percent: message.percent,
            text: message.text,
          });
          break;
        case "ready":
          setLoading(null);
          setModel(message.model);
          saveLastGoodModel(window.localStorage, message.model);
          break;
        case "labeling":
          setLabeling({ current: message.current, total: message.total });
          break;
        case "labeled":
          setLabeling(null);
          console.info(
            `[llm] ${message.named} temas nombrados, ${message.failed} sin nombre`,
          );
          if (message.failed > 0) {
            setError(
              `${message.failed} tema(s) se quedaron sin nombre. Puedes reintentarlo.`,
            );
          }
          onLabeledRef.current?.();
          break;
        case "token":
          if (message.requestId !== requestIdRef.current) break;
          setSummary((prev) => ({
            text: (prev?.text ?? "") + message.text,
            done: false,
          }));
          break;
        case "summary-done":
          if (message.requestId !== requestIdRef.current) break;
          setSummary((prev) => (prev ? { ...prev, done: true } : prev));
          break;
        case "ask-status":
          if (message.requestId !== askIdRef.current) break;
          setAnswer((prev) =>
            prev ? { ...prev, phase: message.phase } : prev,
          );
          break;
        case "ask-sources":
          if (message.requestId !== askIdRef.current) break;
          setAnswer((prev) =>
            prev ? { ...prev, sources: message.sources } : prev,
          );
          break;
        case "answer-token":
          if (message.requestId !== askIdRef.current) break;
          setAnswer((prev) =>
            prev ? { ...prev, text: prev.text + message.text } : prev,
          );
          break;
        case "answer-done":
          if (message.requestId !== askIdRef.current) break;
          setAnswer((prev) =>
            prev
              ? {
                  ...prev,
                  text: message.text,
                  cited: message.cited,
                  unverified: message.unverified,
                  notFound: message.notFound,
                  done: true,
                }
              : prev,
          );
          break;
        case "error": {
          console.error(`[llm] ${message.code}: ${message.message}`);
          setLoading(null);
          setLabeling(null);
          const text = LLM_ERROR_MESSAGES[message.code];
          if (
            message.requestId !== undefined &&
            message.requestId >= ASK_ID_BASE
          ) {
            if (message.requestId === askIdRef.current) {
              setAnswer((prev) =>
                prev ? { ...prev, done: true, error: text } : prev,
              );
            }
          } else if (message.requestId !== undefined) {
            if (message.requestId === requestIdRef.current) {
              setSummary((prev) => ({
                text: prev?.text ?? "",
                done: true,
                error: text,
              }));
            }
          } else {
            setError(text);
          }
          break;
        }
      }
    };
    worker.onerror = (e) => {
      console.error("[llm] error del worker", e.message, e);
      setLoading(null);
      setLabeling(null);
      setError(LLM_ERROR_MESSAGES.unknown);
    };
    workerRef.current = worker;
    return worker;
  }, []);

  const send = useCallback(
    (request: LlmRequest) => ensureWorker().postMessage(request),
    [ensureWorker],
  );

  const labelTopics = useCallback(
    (subjectId: number) => {
      setError(null);
      setLabeling({ current: 0, total: 0 });
      send({
        type: "label-topics",
        subjectId,
        preferredModel: readLastGoodModel(window.localStorage),
      });
    },
    [send],
  );

  const summarize = useCallback(
    (text: string, page: number) => {
      requestIdRef.current += 1;
      setSummary({ text: "", done: false });
      send({
        type: "summarize",
        requestId: requestIdRef.current,
        text,
        page,
        preferredModel: readLastGoodModel(window.localStorage),
      });
    },
    [send],
  );

  const ask = useCallback(
    (subjectId: number, question: string) => {
      askIdRef.current += 1;
      setAnswer({
        question,
        phase: "embedding",
        sources: [],
        text: "",
        done: false,
        cited: [],
        unverified: [],
        notFound: false,
      });
      send({
        type: "ask",
        requestId: askIdRef.current,
        subjectId,
        question,
        preferredModel: readLastGoodModel(window.localStorage),
      });
    },
    [send],
  );

  const clearAnswer = useCallback(() => {
    askIdRef.current += 1;
    setAnswer(null);
  }, []);

  const cancel = useCallback(() => {
    workerRef.current?.postMessage({ type: "cancel" } satisfies LlmRequest);
  }, []);

  const clearSummary = useCallback(() => {
    requestIdRef.current += 1;
    setSummary(null);
  }, []);

  return {
    loading,
    labeling,
    summary,
    answer,
    error,
    model,
    labelTopics,
    summarize,
    ask,
    clearAnswer,
    cancel,
    clearSummary,
  };
}
