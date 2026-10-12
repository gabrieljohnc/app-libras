"use client";

import { useEffect, useState } from "react";

const CHAVE = "sinaliza:favoritos";

export type Favorito = { slug: string; palavra: string };

export function lerFavoritos(): Favorito[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
  } catch {
    return [];
  }
}

function salvar(lista: Favorito[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {}
}

export default function Favoritar({ slug, palavra }: Favorito) {
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    setAtivo(lerFavoritos().some((f) => f.slug === slug));
  }, [slug]);

  return (
    <button
      type="button"
      className="favoritar"
      aria-pressed={ativo}
      onClick={() => {
        const lista = lerFavoritos().filter((f) => f.slug !== slug);
        if (!ativo) lista.unshift({ slug, palavra });
        salvar(lista);
        setAtivo(!ativo);
      }}
    >
      {ativo ? "★ Nos favoritos" : "☆ Favoritar"}
    </button>
  );
}
