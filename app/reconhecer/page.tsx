import type { Metadata } from "next";
import CameraLibras from "@/components/CameraLibras";

export const metadata: Metadata = { title: "Reconhecer sinal · Sinaliza" };

export default async function Reconhecer({ searchParams }: { searchParams: Promise<{ alvo?: string }> }) {
  const { alvo } = await searchParams;
  return (
    <section className="secao">
      <div className="container">
        <h2>Faça um sinal na câmera</h2>
        <p className="sub">Eu tento adivinhar qual é, ao vivo. Ainda conheço poucos sinais e erro bastante, então use como treino.</p>
        <CameraLibras alvo={alvo} />
      </div>
    </section>
  );
}
