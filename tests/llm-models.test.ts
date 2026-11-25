import { describe, expect, it } from "vitest";
import {
  isDeviceLostError,
  MIN_BUFFER_FOR_3B,
  MIN_BUFFER_FOR_7B,
  nextFallback,
  pickCandidates,
  readLastGoodModel,
  saveLastGoodModel,
} from "@/lib/llm-models";

const big = { hasF16: true, maxBufferSize: 4 * 1024 ** 3 };

describe("pickCandidates", () => {
  const BIG7 = "Qwen2.5-7B-Instruct-q4f16_1-MLC";
  const M3 = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
  const M15 = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

  it("por defecto empieza por el 3B (el 7B es opcional)", () => {
    expect(pickCandidates(big)).toEqual([M3, M15]);
  });
  it("el 7B solo entra si ya funcionó (preferido guardado)", () => {
    expect(pickCandidates(big, BIG7)).toEqual([BIG7, M3, M15]);
  });
  it("sin shader-f16 usa las variantes f32", () => {
    expect(pickCandidates({ ...big, hasF16: false })[0]).toContain("q4f32");
  });
  it("buffer pequeño descarta el 7B aunque sea el preferido", () => {
    const ids = pickCandidates(
      { hasF16: true, maxBufferSize: MIN_BUFFER_FOR_7B - 1 },
      BIG7,
    );
    expect(ids[0]).toContain("3B");
  });
  it("buffer muy pequeño deja solo el 1.5B", () => {
    const ids = pickCandidates({
      hasF16: true,
      maxBufferSize: MIN_BUFFER_FOR_3B - 1,
    });
    expect(ids).toEqual([M15]);
  });
  it("el preferido guardado salta los modelos mayores", () => {
    expect(pickCandidates(big, M15)).toEqual([M15]);
  });
  it("un preferido no viable se ignora", () => {
    expect(pickCandidates(big, "otro-modelo")[0]).toBe(M3);
  });
});

describe("isDeviceLostError", () => {
  it("reconoce los errores reales de WebLLM y Dawn", () => {
    expect(isDeviceLostError("Device was lost. This can happen due to")).toBe(
      true,
    );
    expect(isDeviceLostError("DXGI_ERROR_DEVICE_HUNG (0x887A0006)")).toBe(true);
    expect(
      isDeviceLostError("The current Object has already been disposed"),
    ).toBe(true);
    expect(
      isDeviceLostError(
        "Cannot pass deleted object as a pointer of type GrammarMatcher",
      ),
    ).toBe(true);
  });
  it("reconoce DEVICE_REMOVED al pedir el dispositivo", () => {
    expect(
      isDeviceLostError(
        "Failed to execute requestDevice: DXGI_ERROR_DEVICE_REMOVED (0x887A0005)",
      ),
    ).toBe(true);
  });
  it("reconoce el motor ya descargado tras perder la GPU", () => {
    expect(
      isDeviceLostError(
        "Model not loaded before trying to complete ChatCompletionRequest.",
      ),
    ).toBe(true);
  });
  it("no confunde otros errores", () => {
    expect(isDeviceLostError("respuesta no válida")).toBe(false);
    expect(isDeviceLostError("Failed to fetch")).toBe(false);
  });
});

describe("nextFallback", () => {
  const list = ["a", "b", "c"];
  it("devuelve el siguiente", () => expect(nextFallback(list, "a")).toBe("b"));
  it("null en el último", () => expect(nextFallback(list, "c")).toBeNull());
  it("null si no está", () => expect(nextFallback(list, "z")).toBeNull());
});

describe("almacenamiento del último modelo", () => {
  it("guarda y lee", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveLastGoodModel(storage, "x");
    expect(readLastGoodModel(storage)).toBe("x");
  });
  it("tolera un storage que lanza", () => {
    const broken = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(readLastGoodModel(broken)).toBeNull();
    expect(() => saveLastGoodModel(broken, "x")).not.toThrow();
  });
  it("sin storage devuelve null", () => {
    expect(readLastGoodModel(undefined)).toBeNull();
  });
});
