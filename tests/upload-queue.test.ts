import { describe, expect, it } from "vitest";
import { planUploads } from "@/lib/upload-queue";

const f = (name: string, size: number) => ({ name, size });

describe("planUploads", () => {
  it("con lista vacía no hay nada que hacer", () => {
    expect(planUploads([], [f("a.pdf", 1)])).toEqual({
      toProcess: [],
      duplicates: [],
    });
  });

  it("procesa un archivo nuevo", () => {
    const a = f("a.pdf", 10);
    expect(planUploads([a], [])).toEqual({ toProcess: [a], duplicates: [] });
  });

  it("marca como duplicado el mismo nombre y tamaño ya subido", () => {
    const a = f("a.pdf", 10);
    const plan = planUploads([a], [f("a.pdf", 10)]);
    expect(plan.toProcess).toEqual([]);
    expect(plan.duplicates).toEqual([a]);
  });

  it("procesa el mismo nombre con distinto tamaño (otra versión)", () => {
    const a = f("a.pdf", 11);
    expect(planUploads([a], [f("a.pdf", 10)]).toProcess).toEqual([a]);
  });

  it("detecta repetidos dentro de la misma selección", () => {
    const first = f("a.pdf", 10);
    const second = f("a.pdf", 10);
    const plan = planUploads([first, second], []);
    expect(plan.toProcess).toEqual([first]);
    expect(plan.duplicates).toEqual([second]);
  });

  it("conserva el orden de la selección", () => {
    const files = [f("c.pdf", 3), f("a.pdf", 1), f("b.pdf", 2)];
    expect(planUploads(files, []).toProcess).toEqual(files);
  });
});
