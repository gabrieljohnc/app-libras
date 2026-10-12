"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Busca({ inicial = "", compacta = false }: { inicial?: string; compacta?: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState(inicial);

  return (
    <form
      className={`busca${compacta ? " busca-compacta" : ""}`}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = texto.trim();
        if (q) router.push(`/buscar?q=${encodeURIComponent(q)}`);
      }}
    >
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Digite uma palavra, ex.: obrigado"
        aria-label="Palavra para buscar"
        autoComplete="off"
      />
      <button type="submit">Buscar</button>
    </form>
  );
}
