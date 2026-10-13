import Link from "next/link";
import Favoritar from "@/components/Favoritar";
import VideoSinal from "@/components/VideoSinal";
import { supabase, type Sinal } from "@/lib/supabase";
import modelo from "@/public/libras/rotulos.json";

const RECONHECIVEIS = new Set<string>(modelo.basico);

export const revalidate = 86400;

const ORDEM_FONTES = ["INES", "UFV", "SpreadTheSign", "LibrasAcademica-UFF", "RedeSurdos-UFC"];
const TIPOS: Record<string, string> = { letra: "Letra", numero: "Número", palavra: "Palavra", expressao: "Expressão" };

export default async function PaginaSinal({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const chave = decodeURIComponent(slug);

  const { data } = await supabase.from("sinais").select("*").eq("palavra_normalizada", chave);
  const sinais = ((data as Sinal[]) ?? []).sort(
    (a, b) => ORDEM_FONTES.indexOf(a.fonte) - ORDEM_FONTES.indexOf(b.fonte) || a.id - b.id,
  );

  if (sinais.length === 0) {
    return (
      <section className="secao">
        <div className="container">
          <Link href="/" className="voltar">← Início</Link>
          <div className="vazio" style={{ marginTop: 16 }}>Ainda não temos o sinal de “{chave}”.</div>
        </div>
      </section>
    );
  }

  const palavra = sinais[0].palavra.toLowerCase();

  return (
    <div className="container">
      <div className="cabecalho-sinal">
        <div>
          <Link href={`/buscar?q=${encodeURIComponent(palavra)}`} className="voltar">← Buscar outra palavra</Link>
          <h1>{palavra}</h1>
          <span className="tag">{TIPOS[sinais[0].tipo]}</span>{" "}
          <span className="item-meta">
            {sinais.length} {sinais.length === 1 ? "vídeo" : "vídeos"}
          </span>
        </div>
        <div className="controles">
          {RECONHECIVEIS.has(chave) && (
            <Link href={`/reconhecer?alvo=${encodeURIComponent(chave)}`} className="chip chip-claro">
              Praticar na câmera
            </Link>
          )}
          <Favoritar slug={chave} palavra={palavra} />
        </div>
      </div>
      <div className="videos">
        {sinais.map((s) => (
          <VideoSinal key={s.id} sinal={s} />
        ))}
      </div>
    </div>
  );
}
