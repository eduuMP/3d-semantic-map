import { describe, expect, it } from "vitest";
import {
  dedupeNames,
  MAX_CHARS_PER_FRAGMENT,
  parseTopicName,
  pickRepresentatives,
} from "@/lib/topic-labels";

const chunk = (id: number, x: number, text = `texto ${id}`) => ({
  id,
  xyz: [x, 0, 0] as [number, number, number],
  text,
});

describe("pickRepresentatives", () => {
  it("vacío → vacío", () => expect(pickRepresentatives([])).toEqual([]));
  it("un solo fragmento", () => {
    expect(pickRepresentatives([chunk(1, 0)])).toEqual(["texto 1"]);
  });
  it("elige los más cercanos al centroide, máximo 5", () => {
    const xs = [-10, -1, 0, 1, 2, 3, 4, 5, 6, 30];
    const out = pickRepresentatives(xs.map((x, i) => chunk(i, x)));
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out).not.toContain("texto 0"); // x = -10, lejos
    expect(out).not.toContain("texto 9"); // x = 30, lejos
  });
  it("devuelve al menos 3 si hay", () => {
    const out = pickRepresentatives([
      chunk(1, 0),
      chunk(2, 1),
      chunk(3, 2),
      chunk(4, 3),
    ]);
    expect(out).toHaveLength(3);
  });
  it("recorta textos largos y normaliza espacios", () => {
    const [out] = pickRepresentatives([
      chunk(1, 0, "a\n\n" + "b ".repeat(2000)),
    ]);
    expect(out.length).toBeLessThanOrEqual(MAX_CHARS_PER_FRAGMENT + 1);
    expect(out).not.toMatch(/\n/);
  });
});

describe("parseTopicName", () => {
  it("JSON limpio", () => {
    expect(parseTopicName('{"nombre": "Álgebra lineal"}')).toBe(
      "Álgebra lineal",
    );
  });
  it("tolera texto y ``` alrededor", () => {
    expect(parseTopicName('Claro:\n```json\n{"nombre":"Redes"}\n```')).toBe(
      "Redes",
    );
  });
  it("quita comillas y punto final", () => {
    expect(parseTopicName('{"nombre": "“Termodinámica”."}')).toBe(
      "Termodinámica",
    );
  });
  it("rechaza vacío, sin clave, demasiado largo y no JSON", () => {
    expect(parseTopicName('{"nombre": "  "}')).toBeNull();
    expect(parseTopicName('{"name": "x y"}')).toBeNull();
    expect(parseTopicName(`{"nombre": "${"a".repeat(80)}"}`)).toBeNull();
    expect(parseTopicName("sin json")).toBeNull();
    expect(parseTopicName("{roto")).toBeNull();
  });
});

describe("dedupeNames", () => {
  it("numera repetidos sin distinguir mayúsculas", () => {
    expect(dedupeNames(["Redes", "redes", "Bases", "Redes"])).toEqual([
      "Redes",
      "redes (2)",
      "Bases",
      "Redes (3)",
    ]);
  });
});
