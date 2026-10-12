"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { lerFavoritos, type Favorito } from "@/components/Favoritar";
import { linkSinal } from "@/lib/supabase";

export default function Favoritos() {
  const [lista, setLista] = useState<Favorito[] | null>(null);

  useEffect(() => setLista(lerFavoritos()), []);

  return (
    <section className="secao">
      <div className="container">
        <h2>Seus favoritos</h2>
        <p className="sub">Ficam salvos neste aparelho.</p>
        {lista === null ? null : lista.length === 0 ? (
          <div className="vazio">
            Você ainda não favoritou nenhum sinal. Na página de um sinal, toque em “☆ Favoritar”.
          </div>
        ) : (
          <div className="lista">
            {lista.map((f) => (
              <Link key={f.slug} href={linkSinal(f.slug)} className="item">
                <span className="item-palavra">{f.palavra}</span>
                <span className="item-meta">★</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
