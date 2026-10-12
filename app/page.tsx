import Link from "next/link";
import Busca from "@/components/Busca";
import { linkSinal } from "@/lib/supabase";

const SUGESTOES = ["oi", "obrigado", "bom dia", "por favor", "desculpa", "amigo", "família", "escola", "eu te amo"];
const LETRAS = "abcdefghijklmnopqrstuvwxyz".split("");

export default function Inicio() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Aprenda Libras, um sinal por vez.</h1>
          <p>Digite uma palavra em português e veja como se faz o sinal, com vídeos de dicionários do Brasil e do mundo.</p>
          <Busca />
          <div className="sugestoes">
            {SUGESTOES.map((s) => (
              <Link key={s} href={`/buscar?q=${encodeURIComponent(s)}`} className="chip">
                {s}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="secao">
        <div className="container">
          <h2>Alfabeto manual</h2>
          <p className="sub">Toque numa letra para ver o sinal dela.</p>
          <div className="alfabeto">
            {LETRAS.map((l) => (
              <Link key={l} href={linkSinal(l)} className="letra">
                {l.toUpperCase()}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="secao" style={{ paddingTop: 0 }}>
        <div className="container">
          <h2>O que tem aqui</h2>
          <p className="sub">Sinais reunidos de cinco dicionários de Libras.</p>
          <div className="numeros">
            <div className="numero"><strong>8.830</strong><span>palavras e expressões</span></div>
            <div className="numero"><strong>13.410</strong><span>vídeos de sinais</span></div>
            <div className="numero"><strong>5</strong><span>fontes reunidas</span></div>
          </div>
        </div>
      </section>
    </>
  );
}
