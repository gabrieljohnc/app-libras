import Link from "next/link";
import { linkSinal, type Resultado } from "@/lib/supabase";

export default function ListaResultados({ itens }: { itens: Resultado[] }) {
  return (
    <div className="lista">
      {itens.map((r) => (
        <Link key={r.palavra_normalizada} href={linkSinal(r.palavra_normalizada)} className="item">
          <span className="item-palavra">{r.palavra.toLowerCase()}</span>
          <span className="item-meta">
            {r.total} {r.total === 1 ? "vídeo" : "vídeos"}
          </span>
        </Link>
      ))}
    </div>
  );
}
