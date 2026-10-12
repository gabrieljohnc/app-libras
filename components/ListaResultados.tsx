import Link from "next/link";
import type { Resultado } from "@/lib/supabase";
import { linkSinal } from "@/lib/util";

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
