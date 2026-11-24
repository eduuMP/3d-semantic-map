import { describe, expect, it } from "vitest";
import {
  MAX_SUBJECT_NAME_LENGTH,
  cleanSubjectName,
  resolveActiveSubject,
  validateSubjectName,
} from "@/lib/subjects";

const existing = [
  { id: 1, name: "Física" },
  { id: 2, name: "Álgebra Lineal" },
];

describe("cleanSubjectName", () => {
  it("quita espacios de los extremos y repetidos", () => {
    expect(cleanSubjectName("  Cálculo   II  ")).toBe("Cálculo II");
  });
});

describe("validateSubjectName", () => {
  it("acepta un nombre nuevo y lo limpia", () => {
    expect(validateSubjectName("  Química  ", existing)).toEqual({
      ok: true,
      name: "Química",
    });
  });

  it("rechaza vacío o solo espacios", () => {
    expect(validateSubjectName("", existing).ok).toBe(false);
    expect(validateSubjectName("   ", existing).ok).toBe(false);
  });

  it("rechaza nombres demasiado largos y acepta el límite exacto", () => {
    expect(
      validateSubjectName("a".repeat(MAX_SUBJECT_NAME_LENGTH + 1), existing).ok,
    ).toBe(false);
    expect(
      validateSubjectName("a".repeat(MAX_SUBJECT_NAME_LENGTH), existing).ok,
    ).toBe(true);
  });

  it("rechaza repetidos sin distinguir mayúsculas ni tildes", () => {
    expect(validateSubjectName("fisica", existing).ok).toBe(false);
    expect(validateSubjectName("FÍSICA", existing).ok).toBe(false);
    expect(validateSubjectName("algebra  lineal", existing).ok).toBe(false);
  });

  it("al renombrar permite conservar el propio nombre o cambiar su formato", () => {
    expect(validateSubjectName("Física", existing, 1).ok).toBe(true);
    expect(validateSubjectName("FÍSICA", existing, 1).ok).toBe(true);
  });

  it("al renombrar sigue rechazando el nombre de otra asignatura", () => {
    expect(validateSubjectName("Álgebra Lineal", existing, 1).ok).toBe(false);
  });
});

describe("resolveActiveSubject", () => {
  it("usa la guardada si existe", () => {
    expect(resolveActiveSubject(existing, 2)).toBe(2);
  });

  it("si la guardada ya no existe, toma la primera", () => {
    expect(resolveActiveSubject(existing, 99)).toBe(1);
    expect(resolveActiveSubject(existing, null)).toBe(1);
  });

  it("sin asignaturas devuelve null", () => {
    expect(resolveActiveSubject([], 1)).toBeNull();
  });
});
