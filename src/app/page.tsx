import { DocumentList } from "@/components/document-list";
import { PdfUpload } from "@/components/pdf-upload";
import { WebGpuGate } from "@/components/webgpu-gate";

export default function Home() {
  return (
    <WebGpuGate>
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-semibold">Mapa semántico 3D</h1>
        <p>Convierte tus apuntes en PDF en un mapa 3D de temas.</p>
        <PdfUpload />
        <DocumentList />
      </main>
    </WebGpuGate>
  );
}
