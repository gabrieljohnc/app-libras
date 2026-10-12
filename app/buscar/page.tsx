import Busca from "@/components/Busca";
import ListaResultados from "@/components/ListaResultados";
import { supabase, type Resultado } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Buscar({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const termo = q.trim();

  let itens: Resultado[] = [];
  if (termo) {
    const { data } = await supabase.rpc("buscar_sinais", { q: termo, lim: 60 });
    itens = (data as Resultado[]) ?? [];
  }

  return (
    <section className="secao">
      <div className="container">
        <div style={{ marginBottom: 24 }}>
          <Busca inicial={termo} compacta />
        </div>
        {termo && (
          <h2>
            {itens.length > 0 ? `Resultados para “${termo}”` : `Nenhum sinal encontrado para “${termo}”`}
          </h2>
        )}
        {itens.length > 0 ? (
          <>
            <p className="sub">Escolha uma palavra para ver os vídeos.</p>
            <ListaResultados itens={itens} />
          </>
        ) : (
          termo && (
            <div className="vazio">
              Tente outra grafia, uma palavra mais simples ou o singular (ex.: “amigo” em vez de “amigos”).
            </div>
          )
        )}
      </div>
    </section>
  );
}
