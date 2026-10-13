import type { Metadata } from "next";
import CameraLibras from "@/components/CameraLibras";

export const metadata: Metadata = { title: "Reconhecer sinal · Sinaliza" };

export default async function Reconhecer({ searchParams }: { searchParams: Promise<{ alvo?: string }> }) {
  const { alvo } = await searchParams;
  return (
    <section className="secao">
      <div className="container">
        <h2>Faça um sinal na câmera</h2>
        <p className="sub">Eu tento adivinhar qual é, ao vivo, entre 196 sinais básicos. Para eu acertar mais, calibre: faça cada sinal 3 vezes e eu aprendo o seu jeito.</p>
        <CameraLibras alvo={alvo} />
      </div>
    </section>
  );
}
