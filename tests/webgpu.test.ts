import { describe, expect, it } from "vitest";
import { detectWebGpu } from "@/lib/webgpu";

describe("detectWebGpu", () => {
  it("es unsupported si no existe navigator.gpu", async () => {
    expect(await detectWebGpu({})).toBe("unsupported");
  });

  it("es unsupported si requestAdapter devuelve null", async () => {
    const nav = { gpu: { requestAdapter: async () => null } };
    expect(await detectWebGpu(nav)).toBe("unsupported");
  });

  it("es unsupported si requestAdapter lanza una excepción", async () => {
    const nav = {
      gpu: {
        requestAdapter: async () => {
          throw new Error("fallo");
        },
      },
    };
    expect(await detectWebGpu(nav)).toBe("unsupported");
  });

  it("es supported si hay adaptador", async () => {
    const nav = { gpu: { requestAdapter: async () => ({}) } };
    expect(await detectWebGpu(nav)).toBe("supported");
  });
});
