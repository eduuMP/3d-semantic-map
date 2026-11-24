export type WebGpuStatus = "supported" | "unsupported";

type GpuLike = { requestAdapter: () => Promise<unknown> };
type NavigatorLike = { gpu?: GpuLike };

/** Detecta si el navegador ofrece WebGPU con un adaptador utilizable. */
export async function detectWebGpu(nav: NavigatorLike): Promise<WebGpuStatus> {
  if (!nav.gpu) return "unsupported";
  try {
    const adapter = await nav.gpu.requestAdapter();
    return adapter ? "supported" : "unsupported";
  } catch {
    return "unsupported";
  }
}
