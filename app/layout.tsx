import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--fonte" });

export const metadata: Metadata = {
  title: "Sinaliza: aprenda Libras",
  description: "Pesquise uma palavra e veja o sinal em Libras, com vídeos de várias fontes.",
};

export const viewport: Viewport = { themeColor: "#5b21b6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <header className="topo">
          <div className="container">
            <Link href="/" className="marca">
              <span className="marca-icone" aria-hidden>🤟</span>
              <span className="nome">Sinaliza</span>
            </Link>
            <nav className="nav">
              <Link href="/">Início</Link>
              <Link href="/letra/a">Explorar</Link>
              <Link href="/reconhecer">Câmera</Link>
              <Link href="/favoritos">Favoritos</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="rodape">
          <div className="container">
            Projeto pessoal de estudo, sem fins comerciais. Os vídeos pertencem às fontes de origem:{" "}
            <a href="https://dicionario.ines.gov.br/" target="_blank" rel="noreferrer">INES</a>,{" "}
            <a href="https://redesurdosce.ufc.br/" target="_blank" rel="noreferrer">Rede Surdos (UFC)</a>,{" "}
            <a href="https://www.spreadthesign.com/pt.br/" target="_blank" rel="noreferrer">Spread the Sign</a>,{" "}
            <a href="https://librasacademica.uff.br/" target="_blank" rel="noreferrer">Libras Acadêmica (UFF)</a> e{" "}
            <a href="https://sistemas.cead.ufv.br/capes/dicionario/" target="_blank" rel="noreferrer">UFV</a>.
          </div>
        </footer>
      </body>
    </html>
  );
}
