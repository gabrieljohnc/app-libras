import Link from "next/link";
import ListaResultados from "@/components/ListaResultados";
import { supabase, type Resultado } from "@/lib/supabase";

export const revalidate = 86400;

const LETRAS = "abcdefghijklmnopqrstuvwxyz".split("");
const POR_PAGINA = 120;

export default async function Letra({
  params,
  searchParams,
}: {
  params: Promise<{ letra: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { letra: l } = await params;
  const { p } = await searchParams;
  const letra = l.toLowerCase().slice(0, 1);
  const pagina = Math.max(1, Number(p) || 1);

  const { data } = await supabase.rpc("listar_por_letra", {
    letra,
    deslocamento: (pagina - 1) * POR_PAGINA,
    lim: POR_PAGINA + 1,
  });
  const todos = (data as Resultado[]) ?? [];
  const itens = todos.slice(0, POR_PAGINA);
  const temMais = todos.length > POR_PAGINA;

  return (
    <section className="secao">
      <div className="container">
        <h2>Explorar por letra</h2>
        <p className="sub">Todas as palavras e expressões que começam com a letra escolhida.</p>
        <div className="sugestoes" style={{ marginTop: 0, marginBottom: 24 }}>
          {LETRAS.map((x) => (
            <Link
              key={x}
              href={`/letra/${x}`}
              className="chip chip-claro"
              style={x === letra ? { background: "var(--roxo-600)", color: "#fff", borderColor: "var(--roxo-600)" } : undefined}
            >
              {x.toUpperCase()}
            </Link>
          ))}
        </div>
        {itens.length > 0 ? <ListaResultados itens={itens} /> : <div className="vazio">Nenhuma palavra nesta página.</div>}
        <div className="paginacao">
          {pagina > 1 && <Link href={`/letra/${letra}?p=${pagina - 1}`}>← Anterior</Link>}
          {temMais && <Link href={`/letra/${letra}?p=${pagina + 1}`}>Próxima →</Link>}
        </div>
      </div>
    </section>
  );
}
