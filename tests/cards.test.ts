import { describe, expect, it, vi } from "vitest";
import {
  isDefinitional,
  isDuplicate,
  normalizeQuestion,
  parseCard,
  planJobs,
  runCardJobs,
  type NewCard,
} from "@/lib/cards";

const json = (pregunta: string, respuesta: string) =>
  JSON.stringify({ pregunta, respuesta });

describe("parseCard", () => {
  it("acepta un JSON válido", () => {
    expect(
      parseCard(json("¿Qué es la entropía?", "Una medida del desorden.")),
    ).toEqual({
      question: "¿Qué es la entropía?",
      answer: "Una medida del desorden.",
    });
  });

  it("tolera ``` y texto alrededor y espacios repetidos", () => {
    const raw =
      "Aquí va:\n```json\n" +
      json("¿Qué  es\nla entropía?", "Una   medida.") +
      "\n```";
    expect(parseCard(raw)).toEqual({
      question: "¿Qué es la entropía?",
      answer: "Una medida.",
    });
  });

  it("rechaza JSON roto, sin JSON, campos que faltan o muy cortos", () => {
    expect(parseCard("sin json")).toBeNull();
    expect(parseCard('{"pregunta": "¿Qué es')).toBeNull();
    expect(parseCard('{"pregunta": "¿Qué es la entropía?"}')).toBeNull();
    expect(parseCard(json("¿Qué?", "Algo."))).toBeNull();
    expect(parseCard(json("¿Qué es la entropía?", ""))).toBeNull();
  });

  it("rechaza preguntas que hablan del propio texto", () => {
    expect(parseCard(json("¿Qué dice el fragmento?", "Cosas."))).toBeNull();
    expect(
      parseCard(json("¿Qué se explica en la página 3?", "Cosas.")),
    ).toBeNull();
    expect(
      parseCard(
        json(
          "¿Cuál es la función que calcula el exponente en los apuntes?",
          "Cosas.",
        ),
      ),
    ).toBeNull();
    expect(
      parseCard(
        json(
          "¿Qué funciones se definen en términos iniciales (a)-(c)?",
          "Cosas.",
        ),
      ),
    ).toBeNull();
    // La notación matemática no cuenta como referencia al texto.
    expect(
      parseCard(
        json("¿Cuándo es f(n) = g(h(n)) calculable?", "Si g y h lo son."),
      ),
    ).not.toBeNull();
  });
});

describe("isDuplicate", () => {
  it("compara sin tildes, mayúsculas ni signos", () => {
    expect(normalizeQuestion("¿Qué es la ENTROPÍA?")).toBe(
      "que es la entropia",
    );
    expect(
      isDuplicate("que es la entropía", ["¿Qué es la entropía?", "Otra"]),
    ).toBe(true);
    expect(isDuplicate("¿Qué es la energía?", ["¿Qué es la entropía?"])).toBe(
      false,
    );
  });

  it("detecta la misma pregunta con otra redacción o en plural", () => {
    expect(
      isDuplicate("¿Qué es una función primitiva recursiva?", [
        "Qué son las funciones primitivas recursivas?",
      ]),
    ).toBe(true);
    expect(
      isDuplicate("¿Qué es una función recursiva total?", [
        "¿Qué es una función primitiva recursiva?",
      ]),
    ).toBe(false);
    expect(
      isDuplicate("¿Por qué la suma es primitiva recursiva?", [
        "¿Qué es una función primitiva recursiva?",
      ]),
    ).toBe(false);
    expect(isDuplicate("¿Qué es?", [])).toBe(false);
  });
});

describe("isDefinitional", () => {
  it("detecta preguntas de definición pura", () => {
    expect(isDefinitional("¿Qué es una función primitiva recursiva?")).toBe(
      true,
    );
    expect(isDefinitional("Qué son las funciones primitivas recursivas?")).toBe(
      true,
    );
    expect(isDefinitional("Define entropía")).toBe(true);
    expect(isDefinitional("¿Por qué la suma es primitiva recursiva?")).toBe(
      false,
    );
    expect(
      isDefinitional("¿En qué se diferencia una función total de una parcial?"),
    ).toBe(false);
  });
});

describe("planJobs", () => {
  const chunks = [
    { id: 1, xyz: [10, 10, 10] as const },
    { id: 2, xyz: [0, 0, 0] as const },
    { id: 3, xyz: [1, 1, 1] as const },
  ];

  it("empieza por los más cercanos al centroide", () => {
    expect(planJobs(chunks, 2)).toEqual([3, 2]);
  });

  it("da prioridad a los fragmentos sin tarjetas", () => {
    expect(planJobs(chunks, 2, new Set([3, 2]))).toEqual([1, 3]);
  });

  it("recicla la lista si hay menos fragmentos que tarjetas", () => {
    expect(planJobs([{ id: 7 }], 3)).toEqual([7, 7, 7]);
    expect(planJobs(chunks, 5)).toHaveLength(5);
  });

  it("n=0, tema vacío y tope máximo", () => {
    expect(planJobs(chunks, 0)).toEqual([]);
    expect(planJobs([], 5)).toEqual([]);
    expect(planJobs(chunks, 99)).toHaveLength(10);
  });

  it("fragmentos sin coordenadas van al final pero no se pierden", () => {
    expect(planJobs([{ id: 9 }, { id: 4, xyz: [0, 0, 0] }], 2)).toEqual([4, 9]);
  });
});

describe("runCardJobs", () => {
  const run = (
    replies: (string | null)[],
    jobs = [1, 2],
    existing = new Map<number, readonly string[]>(),
    isCancelled?: () => boolean,
  ) => {
    const saved: NewCard[] = [];
    const generate = vi.fn<
      (
        chunkId: number,
        avoid: readonly string[],
        attempt: number,
      ) => Promise<string | null>
    >(async () => replies.shift() ?? null);
    const onProgress = vi.fn();
    const promise = runCardJobs({
      jobs,
      existing,
      generate,
      onCard: (card) => {
        saved.push(card);
      },
      onProgress,
      isCancelled,
    });
    return { promise, saved, generate, onProgress };
  };

  it("guarda una tarjeta por trabajo y avisa del progreso", async () => {
    const r = run([
      json("¿Por qué crece la entropía?", "Desorden."),
      json("¿Cómo se conserva la energía?", "Capacidad."),
    ]);
    expect(await r.promise).toEqual({
      saved: 2,
      failed: 0,
      discarded: 0,
      cancelled: false,
    });
    expect(r.saved.map((c) => c.chunkId)).toEqual([1, 2]);
    expect(r.onProgress).toHaveBeenLastCalledWith(2, 2, 2);
  });

  it("reintenta solo el trabajo que falla", async () => {
    const r = run([
      "basura",
      json("¿Por qué crece la entropía?", "Desorden."),
      json("¿Cómo se conserva la energía?", "Capacidad."),
    ]);
    const res = await r.promise;
    expect(res).toMatchObject({ saved: 2, failed: 0, discarded: 1 });
    expect(r.generate).toHaveBeenCalledTimes(3);
  });

  it("descarta duplicadas (también de tarjetas ya guardadas)", async () => {
    const r = run(
      [
        json("¿Por qué crece la entropía?", "Otra vez."),
        json("¿Cuándo fluye el calor?", "Energía."),
      ],
      [1],
      new Map([[2, ["¿Por qué crece la entropía?"]]]),
    );
    const res = await r.promise;
    expect(res).toMatchObject({ saved: 1, discarded: 1 });
    expect(r.saved[0].question).toBe("¿Cuándo fluye el calor?");
  });

  it("tras agotar los intentos cuenta como fallida y sigue", async () => {
    const r = run([
      null,
      "basura",
      json("¿Cómo se conserva la energía?", "Capacidad."),
    ]);
    expect(await r.promise).toMatchObject({
      saved: 1,
      failed: 1,
      discarded: 5,
    });
    expect(r.generate).toHaveBeenCalledTimes(6);
  });

  it("rechaza la definición en los primeros intentos y la admite en el último", async () => {
    const r = run(
      [
        json("¿Qué es la entropía?", "Desorden."),
        json("¿Por qué crece la entropía?", "Segunda ley."),
      ],
      [1],
    );
    expect(await r.promise).toMatchObject({ saved: 1, discarded: 1 });
    expect(r.saved[0].question).toBe("¿Por qué crece la entropía?");

    const only = run(
      [
        json("¿Qué es la entropía?", "Desorden."),
        json("¿Qué significa el calor?", "Energía."),
        json("¿Qué es el calor?", "Energía."),
      ],
      [1],
    );
    expect(await only.promise).toMatchObject({
      saved: 1,
      failed: 0,
      discarded: 2,
    });
    expect(only.saved[0].question).toBe("¿Qué es el calor?");
  });

  it("pasa las preguntas anteriores del fragmento para no repetirlas", async () => {
    const r = run(
      [
        json("¿Por qué crece la entropía?", "Desorden."),
        json("¿Cómo se conserva la energía?", "Capacidad."),
      ],
      [5, 5],
    );
    await r.promise;
    expect(r.generate.mock.calls[0][1]).toEqual([]);
    expect(r.generate.mock.calls[1][1]).toEqual([
      "¿Por qué crece la entropía?",
    ]);
  });

  it("al cancelar conserva lo ya guardado", async () => {
    let calls = 0;
    const r = run(
      [
        json("¿Por qué crece la entropía?", "Desorden."),
        json("¿Cómo se conserva la energía?", "Capacidad."),
      ],
      [1, 2],
      new Map(),
      () => calls++ >= 2,
    );
    const res = await r.promise;
    expect(res.cancelled).toBe(true);
    expect(res.saved).toBe(1);
    expect(r.saved).toHaveLength(1);
  });
});
